"""Server-side relay to the Anthropic Messages API for the hosted demo.

The hosted widget posts here instead of calling api.anthropic.com from the browser, so
visitors don't need their own key. The key (and optional workspace id) come from Vercel
environment variables (ANTHROPIC_API_KEY, ANTHROPIC_WORKSPACE_ID) and never reach the page.

Because anyone with the link spends the owner's credits, the relay only forwards what the
widget itself sends: same-origin requests, the widget's model, a capped reply length and
request size, a per-visitor rate limit, and a spend budget per browser session ($1). The
session's running cost lives in a signed HttpOnly session cookie, so the page can't read or
reset it (clearing cookies starts a new session, which the rate limit and a workspace spend
limit in the Anthropic Console cover).
"""
import hashlib
import hmac
import json
import os
import secrets
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse

API = "https://api.anthropic.com/v1/messages"
ALLOWED_MODELS = {"claude-opus-5"}   # the widget's MODEL
MAX_TOKENS = 1600                    # the widget's largest request
MAX_BODY = 64 * 1024                 # a full prompt is ~18 KB before the conversation
RATE_LIMIT, RATE_WINDOW = 30, 600    # requests per visitor IP per 10 minutes (per warm instance)

# Per-session budget, in micro-dollars. Claude Opus 5 per-token rates (= $ per 1M tokens):
# input $5, output $25, 5-minute cache write 1.25x input, cache read 0.1x input.
SESSION_BUDGET = 1_000_000           # $1.00
RATE_INPUT, RATE_OUTPUT, RATE_CACHE_WRITE, RATE_CACHE_READ = 5.0, 25.0, 6.25, 0.5
COOKIE = "rg_session"

_hits = {}


def _secret():
    # Derived from the API key, so there is no second secret to manage; rotating the key
    # simply starts everyone on a fresh session.
    return hashlib.sha256(b"ritual-session:" + os.environ.get("ANTHROPIC_API_KEY", "").encode()).digest()


def _sign(sid, spent):
    return hmac.new(_secret(), f"{sid}.{spent}".encode(), hashlib.sha256).hexdigest()[:32]


def _read_session(cookie_header):
    for part in (cookie_header or "").split(";"):
        name, _, value = part.strip().partition("=")
        if name == COOKIE:
            try:
                sid, spent, sig = value.split(".")
                if hmac.compare_digest(sig, _sign(sid, spent)):
                    return sid, int(spent)
            except ValueError:
                pass
    return secrets.token_hex(12), 0


def _cost_micro(usage):
    return round(usage.get("input_tokens", 0) * RATE_INPUT
                 + usage.get("cache_creation_input_tokens", 0) * RATE_CACHE_WRITE
                 + usage.get("cache_read_input_tokens", 0) * RATE_CACHE_READ
                 + usage.get("output_tokens", 0) * RATE_OUTPUT)


def _usage_from(ctype, body):
    """Usage from a JSON reply, or from an SSE stream (message_start + final message_delta)."""
    try:
        if "event-stream" not in (ctype or ""):
            return json.loads(body).get("usage") or {}
        usage = {}
        for line in body.decode("utf-8", "replace").splitlines():
            if not line.startswith("data:"):
                continue
            event = json.loads(line[5:])
            if event.get("type") == "message_start":
                usage.update(event.get("message", {}).get("usage") or {})
            elif event.get("type") == "message_delta":
                usage.update({k: v for k, v in (event.get("usage") or {}).items() if v is not None})
        return usage
    except (ValueError, AttributeError):
        return {}


def _rate_limited(ip):
    now = time.time()
    recent = [t for t in _hits.get(ip, []) if now - t < RATE_WINDOW]
    limited = len(recent) >= RATE_LIMIT
    if not limited:
        recent.append(now)
    _hits[ip] = recent
    return limited


class handler(BaseHTTPRequestHandler):
    def _error(self, code, message, kind="invalid_request_error", cookie=None):
        # Same shape as Anthropic's errors, so the widget's error handling reads it as-is.
        self._send(code, "application/json", json.dumps({"type": "error", "error": {"type": kind, "message": message}}).encode(), cookie)

    def _send(self, code, ctype, body, cookie=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        if cookie:
            sid, spent = cookie
            # No Max-Age/Expires: a browser-session cookie, gone when the browser closes.
            self.send_header("Set-Cookie", f"{COOKIE}={sid}.{spent}.{_sign(sid, spent)}; Path=/api/claude; HttpOnly; Secure; SameSite=Strict")
            self.send_header("X-Session-Budget-Remaining", f"{max(0, SESSION_BUDGET - spent) / 1e6:.2f}")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
        if not key:
            return self._error(503, "The demo's AI key isn't configured.", "api_error")

        origin = self.headers.get("Origin") or ""
        if not origin or urlparse(origin).netloc != self.headers.get("Host", ""):
            return self._error(403, "Requests must come from this site.", "permission_error")

        ip = (self.headers.get("x-forwarded-for") or self.headers.get("x-real-ip") or "unknown").split(",")[0].strip()
        if _rate_limited(ip):
            return self._error(429, "Lots of messages in a short time. Wait a few minutes and try again.", "rate_limit_error")

        size = int(self.headers.get("Content-Length") or 0)
        if size <= 0 or size > MAX_BODY:
            return self._error(413, "That conversation is too long for this demo. Refresh to start a new one.")
        try:
            req = json.loads(self.rfile.read(size))
        except (ValueError, UnicodeDecodeError):
            return self._error(400, "Invalid JSON.")
        if not isinstance(req, dict) or req.get("model") not in ALLOWED_MODELS:
            return self._error(400, "Unsupported model for this demo.")
        try:
            req["max_tokens"] = max(1, min(int(req.get("max_tokens") or 1), MAX_TOKENS))
        except (TypeError, ValueError):
            return self._error(400, "Invalid max_tokens.")

        # Budget check before spending anything: this session's running cost plus a worst-case
        # estimate for this request (~3 bytes per input token, cautious; the full reply length).
        sid, spent = _read_session(self.headers.get("Cookie"))
        worst_case = round(size / 3 * RATE_INPUT + req["max_tokens"] * RATE_OUTPUT)
        if spent + worst_case > SESSION_BUDGET:
            return self._error(402, "This demo covers about $1 of AI per visit, and this visit has used it. Thanks for trying it!",
                               "budget_exceeded", cookie=(sid, spent))

        headers = {"content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01"}
        workspace = os.environ.get("ANTHROPIC_WORKSPACE_ID", "").strip()
        if workspace:
            headers["anthropic-workspace-id"] = workspace
        upstream = urllib.request.Request(API, data=json.dumps(req).encode(), headers=headers, method="POST")
        try:
            with urllib.request.urlopen(upstream, timeout=120) as r:
                code, ctype, body = r.status, r.headers.get("Content-Type", "application/json"), r.read()
        except urllib.error.HTTPError as e:
            code, ctype, body = e.code, e.headers.get("Content-Type", "application/json"), e.read()
        except Exception:
            return self._error(502, "Couldn't reach the AI service.", "api_error")
        # Streamed replies arrive here whole; the widget assembles the reply before showing it
        # anyway, so the visitor sees the same thing.
        spent += _cost_micro(_usage_from(ctype, body)) if code == 200 else 0
        self._send(code, ctype, body, cookie=(sid, spent))

    def do_GET(self):
        self._error(405, "POST only.")
