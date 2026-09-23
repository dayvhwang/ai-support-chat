# Deskly API Reference

Deskly is the helpdesk Ritual Goods already runs. Start it with `python3 deskly.py`
(no dependencies). Base URL: `http://localhost:8099/api/v2`. CORS is open — call it
straight from browser JS. State is in-memory; restarting gives you a clean slate.

The **agent inbox** (what human support agents see) is at `http://localhost:8099/` —
open it in a second tab next to the store to watch escalations arrive.

## Help Center

### `GET /help_center/articles`
All published articles. → `{"articles": [{id, title, labels, body}], "count": n}`

### `GET /help_center/articles/search?query=...`
Keyword search, top 5 by relevance. → `{"results": [...], "count": n}`
(Naive keyword search. The widget doesn't use it: all articles fit in the prompt,
so it fetches the full list once instead.)

## Tickets

### `POST /tickets` — escalate to a human
```json
{
  "ticket": {
    "subject": "Damaged order — replacement requested",
    "priority": "high",                  // low | normal | high | urgent
    "tags": ["damaged", "replacement"],
    "requester": {"name": "Liam Mora", "customer_id": "C102938"},
    "ai_summary": "One-paragraph handoff summary a human can act on in 10 seconds.",
    "comment": {"body": "Full transcript or the customer's message", "author": "customer"}
  }
}
```
→ `201` with `{"ticket": {..., "id": 1001, "status": "new"}}`.
`subject` and `comment.body` are required (`422` otherwise).

### `GET /tickets` · `GET /tickets/{id}`
List / fetch tickets (each includes its `comments` array).

### `POST /tickets/{id}/comments` — add a message to the thread
```json
{"comment": {"body": "text", "author": "customer" | "ai" | "agent"}}
```
Human agents reply from the inbox UI with `author: "agent"`.

### `GET /tickets/{id}/comments`
The thread. The widget **polls this** to detect agent replies and show them in the chat.
(An agent reply also flips the ticket status from `new` → `open`.)

### `POST /tickets/{id}/solve`
Mark resolved. The widget calls this when the customer confirms the reply solved it.

## The escalation round-trip

1. Widget can't handle something → `POST /tickets` with transcript + `ai_summary`
2. Ticket appears in the agent inbox
3. An agent types a reply in the inbox → stored as an `agent` comment
4. The widget (polling `GET /tickets/{id}/comments`) shows the agent's reply
   to the customer, in the same chat thread

---

## Chatbot extensions

The agent inbox is redesigned as `helpdesk/inbox.html` (served by `deskly.py` at `/`;
the ticket API is untouched). The widget also sends a **customer snapshot** in
`requester.profile` on `POST /tickets` — Deskly already stores `requester` verbatim, so
this needs no API change; the inbox renders it as the at-a-glance customer panel
(LTV, VIP/subscriber, recent orders, prior support + CSAT). Tickets without it still
render (fallback: name + id).

Deskly already sees every escalation. The one thing it can't see is a conversation
the AI handled alone — so the widget reports just that, and the inbox gains a
**Dashboard** tab (app bar, next to Inbox) that joins both sources live.

### `POST /events` — report an AI-handled answer
```json
{"event": {"kind": "ai_answered", "customer_id": "C102391",
           "topic": "Returns & refunds policy",   // cited article title, or null
           "question": "What's your return window?", "turn": 1}}
```
→ `201 {"event": {...}}`. Only `kind: "ai_answered"` is accepted (`422` otherwise).
Best-effort: the widget fires and forgets.

### `GET /stats` — deflection aggregate
→ `{conversations, answered, escalated, solved, open, deflection_pct,
avg_turns_before_escalation, reasons: {tag: n}, priorities: {urgent,high,normal,low},
topics: {article title: n}, recent: [...]}` — escalations/reasons/priorities/solved
come from tickets; answered/topics come from events. `avg_turns_before_escalation`
reads `requester.turns` if the widget sends it on `POST /tickets`.

### `POST /stats/reset`
Clears AI events only (tickets are kept). Restarting Deskly still wipes everything.

### `POST /api/v2/_demo/outage` — simulated outage (demo control)
Toggles a switch that makes `/api/v2/*` return `503` **to cross-origin callers only**,
so the widget degrades (honest "support system offline" state, no promised handoff)
while the agent inbox stays usable. Call it again to clear. Off at startup, never
touched by the widget itself.
```sh
curl -X POST http://localhost:8099/api/v2/_demo/outage   # → {"outage": true}
```
