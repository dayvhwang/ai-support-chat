#!/usr/bin/env python3
"""
Deskly — the helpdesk Ritual Goods already uses. (A tiny Zendesk-style mock.)

Run:    python3 deskly.py            (no dependencies, Python 3.8+)
Then:   http://localhost:8099        → the AGENT INBOX (what support agents see)
API:    http://localhost:8099/api/v2 → see API.md for endpoints

The chat widget talks to this API. Human support agents use the inbox UI.
State is in-memory; restart = clean slate.
"""
import json, re, time, itertools
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

PORT = 8099
_ticket_ids = itertools.count(1001)
TICKETS = {}   # id -> ticket dict (with "comments": [...])
EVENTS = []    # chatbot extension: AI-handled conversations the widget reports (see API.md)
OUTAGE = False # demo control: when True, cross-origin (widget) API calls get a 503

with open("articles.json") as f:
    ARTICLES = json.load(f)["articles"]

# The agent inbox UI lives in inbox.html next to this file (same relative-path
# assumption as articles.json above). Read per request so a refresh picks up edits.
INBOX_FILE = "inbox.html"

def inbox_html():
    try:
        with open(INBOX_FILE, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ("<h1>inbox.html not found</h1><p>Run deskly.py from inside "
                "<code>helpdesk/</code> so it can find inbox.html and articles.json.</p>")

def now(): return time.strftime("%Y-%m-%dT%H:%M:%S")

# ---- chatbot extension: deflection stats --------------------------------
# Deskly already knows every escalation (TICKETS). The widget reports the one thing
# Deskly can't see — conversations the AI handled alone — via POST /events. This
# joins both into the numbers the Dashboard tab renders.
def stats():
    tickets = list(TICKETS.values())
    answered = sum(1 for e in EVENTS if e["kind"] == "ai_answered")
    escalated = len(tickets)
    convs = answered + escalated
    reasons, topics, priorities = {}, {}, {"urgent": 0, "high": 0, "normal": 0, "low": 0}
    for t in tickets:
        priorities[t["priority"]] = priorities.get(t["priority"], 0) + 1
        for tag in t["tags"]: reasons[tag] = reasons.get(tag, 0) + 1
    for e in EVENTS:
        if e.get("topic"): topics[e["topic"]] = topics.get(e["topic"], 0) + 1
    reqs = [t["requester"] for t in tickets if isinstance(t["requester"], dict)]
    turns = [r["turns"] for r in reqs if isinstance(r.get("turns"), int)]
    recent = [{"kind": "ai_answered", "text": e["question"], "topic": e["topic"], "who": e["customer_id"], "at": e["created_at"]} for e in EVENTS]
    recent += [{"kind": "escalated", "ticket_id": t["id"], "text": t["subject"], "priority": t["priority"], "tags": t["tags"],
                "who": (t["requester"].get("name", "") if isinstance(t["requester"], dict) else ""), "at": t["created_at"]} for t in tickets]
    recent += [{"kind": "solved", "ticket_id": t["id"], "at": t["solved_at"]} for t in tickets if t.get("solved_at")]
    recent.sort(key=lambda r: r["at"], reverse=True)
    return {
        "conversations": convs, "answered": answered, "escalated": escalated,
        "solved": sum(1 for t in tickets if t["status"] == "solved"),
        "open": sum(1 for t in tickets if t["status"] in ("new", "open")),
        "deflection_pct": (round(100 * answered / convs) if convs else None),
        "avg_turns_before_escalation": (round(sum(turns) / len(turns), 1) if turns else None),
        "reasons": dict(sorted(reasons.items(), key=lambda kv: -kv[1])),
        "priorities": priorities,
        "topics": dict(sorted(topics.items(), key=lambda kv: -kv[1])),
        "recent": recent[:12],
    }

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[deskly] {self.command} {self.path}")

    def _send(self, code, body, ctype="application/json"):
        data = body.encode() if isinstance(body, str) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self._send(204, "")

    def _body(self):
        n = int(self.headers.get("Content-Length", 0))
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except json.JSONDecodeError:
            return None

    # ---- chatbot extension: simulated outage -------------------------------
    # Only requests from another origin (the storefront widget) are failed, so the
    # agent inbox stays usable while you watch the widget degrade.
    def _outage_blocked(self, path):
        if not OUTAGE or not path.startswith("/api/v2") or path.startswith("/api/v2/_demo"):
            return False
        origin = self.headers.get("Origin") or ""
        return bool(origin) and urlparse(origin).netloc != self.headers.get("Host", "")

    def do_GET(self):
        u = urlparse(self.path)
        if self._outage_blocked(u.path):
            return self._send(503, {"error": "ServiceUnavailable", "details": "simulated outage"})
        if u.path in ("/", "/inbox"):
            return self._send(200, inbox_html(), "text/html")
        if u.path == "/api/v2/help_center/articles":
            return self._send(200, {"articles": ARTICLES, "count": len(ARTICLES)})
        if u.path == "/api/v2/help_center/articles/search":
            q = (parse_qs(u.query).get("query", [""])[0]).lower()
            words = [w for w in re.findall(r"[a-z0-9']+", q) if len(w) > 2]
            scored = []
            for a in ARTICLES:
                text = (a["title"] + " " + a["body"] + " " + " ".join(a["labels"])).lower()
                s = sum(text.count(w) for w in words)
                if s: scored.append((s, a))
            scored.sort(key=lambda x: -x[0])
            return self._send(200, {"results": [a for _, a in scored[:5]], "count": len(scored)})
        m = re.fullmatch(r"/api/v2/tickets/(\d+)", u.path)
        if m:
            t = TICKETS.get(int(m.group(1)))
            return self._send(200, {"ticket": t}) if t else self._send(404, {"error": "RecordNotFound"})
        m = re.fullmatch(r"/api/v2/tickets/(\d+)/comments", u.path)
        if m:
            t = TICKETS.get(int(m.group(1)))
            return self._send(200, {"comments": t["comments"]}) if t else self._send(404, {"error": "RecordNotFound"})
        if u.path == "/api/v2/tickets":
            return self._send(200, {"tickets": list(TICKETS.values()), "count": len(TICKETS)})
        if u.path == "/api/v2/stats":   # chatbot extension
            return self._send(200, stats())
        self._send(404, {"error": "no such endpoint — see API.md"})

    def do_POST(self):
        u = urlparse(self.path)
        global OUTAGE
        if u.path == "/api/v2/_demo/outage":          # demo control (never blocked)
            OUTAGE = not OUTAGE
            print(f"[deskly] {'⏸  simulated outage ON — widget calls now fail' if OUTAGE else '▶︎  outage cleared'}")
            return self._send(200, {"outage": OUTAGE})
        if self._outage_blocked(u.path):
            return self._send(503, {"error": "ServiceUnavailable", "details": "simulated outage"})
        body = self._body()
        if body is None:
            return self._send(400, {"error": "invalid JSON"})
        if u.path == "/api/v2/tickets":
            t = body.get("ticket", {})
            if not t.get("subject") or not t.get("comment", {}).get("body"):
                return self._send(422, {"error": "RecordInvalid",
                                        "details": "ticket.subject and ticket.comment.body are required"})
            tid = next(_ticket_ids)
            prio = t.get("priority", "normal")
            if prio not in ("low", "normal", "high", "urgent"): prio = "normal"
            ticket = {
                "id": tid, "subject": t["subject"], "status": "new", "priority": prio,
                "tags": t.get("tags", []), "requester": t.get("requester", {}),
                "ai_summary": t.get("ai_summary", ""),
                "created_at": now(),
                "comments": [{"author": t.get("comment", {}).get("author", "customer"),
                              "body": t["comment"]["body"], "created_at": now()}],
            }
            TICKETS[tid] = ticket
            print(f"[deskly] 🎫 ticket #{tid} created: {ticket['subject']!r} (prio={prio})")
            return self._send(201, {"ticket": ticket})
        m = re.fullmatch(r"/api/v2/tickets/(\d+)/comments", u.path)
        if m:
            t = TICKETS.get(int(m.group(1)))
            if not t: return self._send(404, {"error": "RecordNotFound"})
            c = body.get("comment", {})
            if not c.get("body"):
                return self._send(422, {"error": "RecordInvalid", "details": "comment.body required"})
            author = c.get("author", "customer")
            if author not in ("customer", "agent", "ai"): author = "customer"
            comment = {"author": author, "body": c["body"], "created_at": now()}
            t["comments"].append(comment)
            if author == "agent" and t["status"] == "new": t["status"] = "open"
            return self._send(201, {"comment": comment})
        m = re.fullmatch(r"/api/v2/tickets/(\d+)/solve", u.path)
        if m:
            t = TICKETS.get(int(m.group(1)))
            if not t: return self._send(404, {"error": "RecordNotFound"})
            t["status"] = "solved"
            t["solved_at"] = now()
            return self._send(200, {"ticket": t})
        # ---- chatbot extension: AI deflection events ----
        if u.path == "/api/v2/events":
            e = body.get("event", {})
            if e.get("kind") != "ai_answered":
                return self._send(422, {"error": "RecordInvalid", "details": "event.kind must be 'ai_answered'"})
            ev = {"kind": "ai_answered", "customer_id": str(e.get("customer_id", "")),
                  "topic": (str(e["topic"]) if e.get("topic") else None),
                  "question": str(e.get("question", ""))[:200],
                  "turn": int(e.get("turn") or 0), "created_at": now()}
            EVENTS.append(ev)
            print(f"[deskly] ✦ AI answered {ev['customer_id']} ({ev['topic'] or 'no article cited'})")
            return self._send(201, {"event": ev})
        if u.path == "/api/v2/stats/reset":
            EVENTS.clear()
            return self._send(200, {"ok": True})
        self._send(404, {"error": "no such endpoint — see API.md"})

if __name__ == "__main__":
    print(f"🌲 Deskly running → agent inbox: http://localhost:{PORT}   api: http://localhost:{PORT}/api/v2")
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    # ^ was HTTPServer: single-threaded — a browser preconnect (Safari opens
    #   speculative TCP conns that send no request) wedges the whole server.
    #   One-word infra fix, zero behavior change.
    srv.serve_forever()
