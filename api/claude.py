"""Server-side relay to the Anthropic Messages API for the hosted demo.

The hosted widget posts here instead of calling api.anthropic.com from the browser, so
visitors don't need their own key. The key (and optional workspace id) come from Vercel
environment variables (ANTHROPIC_API_KEY, ANTHROPIC_WORKSPACE_ID) and never reach the page.

Because anyone with the link spends the owner's credits, the relay only forwards what the
widget itself sends: same-origin requests, the widget's model, a capped reply length and
request size, and a per-visitor rate limit. Set a spend limit on the key's workspace in the
Anthropic Console as the real backstop; these checks only stop casual misuse.
"""
import json
import os
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

_hits = {}


def _rate_limited(ip):
    now = time.time()
    recent = [t for t in _hits.get(ip, []) if now - t < RATE_WINDOW]
    limited = len(recent) >= RATE_LIMIT
    if not limited:
        recent.append(now)
    _hits[ip] = recent
    return limited


class handler(BaseHTTPRequestHandler):
    def _error(self, code, message, kind="invalid_request_error"):
        # Same shape as Anthropic's errors, so the widget's error handling reads it as-is.
        self._send(code, "application/json", json.dumps({"type": "error", "error": {"type": kind, "message": message}}).encode())

    def _send(self, code, ctype, body):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
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
        self._send(code, ctype, body)

    def do_GET(self):
        self._error(405, "POST only.")
