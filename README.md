# Ritual Goods AI Support Chat

A customer-support chatbot built around one question: **should the AI answer this, or
hand it to a human?**

Most support bots fail in one of two ways. They make up confident answers that aren't
backed by anything, or they escalate everything and save no one any time. This one
answers only from hard facts — the merchant's help-center articles and the logged-in
customer's real account data — and hands off to a human agent the moment the
conversation needs judgment, empathy, or something the facts don't cover.

It runs as a chat widget on a demo storefront (Ritual Goods, a fictional wellness
brand) and escalates into Deskly, a small Zendesk-style helpdesk. The customer never
leaves the chat; the agent never leaves their inbox.

## Principles

**Answer from facts, not vibes.**
- All 11 help-center articles are fetched from `GET /help_center/articles` at load and
  placed in the system prompt. There's no retrieval step to miss the right article.
- Every grounded answer cites its article as a source chip, so the customer (and you)
  can see where it came from.
- Account questions use the customer's real data (`window.RITUAL_CUSTOMER`: profile,
  orders, past chats). "Where's my order?" gets the real order ID and date, never
  "please provide your email."
- If the articles don't cover it, the bot says so and offers a human. A confident guess
  — e.g. "is this serum safe while pregnant?" — is the worst possible answer, so it
  never gives one.

**Escalate with judgment, not by reflex.**
- Claude decides via an `escalate_to_human` tool, following an explicit rubric:
  - A furious customer escalates on the first message, at `urgent` if they're a VIP.
  - Calm concern ("my order seems a bit delayed") gets a grounded answer plus an
    *offer* of a human — and saying yes counts as asking.
  - Off-policy requests (e.g. asking for a discount) get the policy answer first and
    escalate only if the customer insists.
  - Cancellations get the self-serve path, with an offer to have the team do it.
- Priority comes from sentiment × lifetime value × subscriber status; tags come from a
  fixed vocabulary.

**Hand off like a professional.**
- The ticket (`POST /tickets`) carries the transcript, priority, tags, a structured
  10-second summary (WHO / ISSUE / WANTS / CONTEXT / SUGGESTED ACTION), and a customer
  snapshot (lifetime value, VIP/subscriber, orders, prior support + CSAT).
- The widget polls `GET /tickets/{id}/comments`, so the agent's reply lands in the same
  chat as a distinct human voice. One tap on "That solved it ✓" marks the ticket solved.

## Proven by an eval

Escalation judgment is tested, not assumed. `evals/eval_escalation.py` replays
**17 scripted conversations** — angry VIP, mild-then-furious, questions the articles
don't cover, damaged items, allergy questions, promo stacking, and more — against the
widget's exact prompt, and checks: escalate or not, how many turns it took, priority,
tags, summary shape, and citations. Latest run: **17/17**, with full transcripts in
`evals/eval_results.md`.

```sh
python3 evals/eval_escalation.py   # Deskly must be running; reads the key from .env
```

## Run it

Put your Anthropic API key in a `.env` file at the repo root (it's gitignored):

```sh
ANTHROPIC_API_KEY=sk-ant-...
# Only if your key isn't scoped to a workspace:
ANTHROPIC_WORKSPACE_ID=wrkspc_...
```

Then start both servers:

```sh
# Terminal 1 — Deskly, the helpdesk + agent inbox → http://localhost:8099
cd helpdesk && python3 deskly.py

# Terminal 2 — the storefront with the chat widget → http://localhost:8080/store.html
./store/serve.sh
```

`serve.sh` copies the key from `.env` into `store/config.local.js` (also gitignored) so
the browser can use it, and serves the store on `127.0.0.1` only. Without a `.env`, the
widget asks for a key in the chat and keeps it in that browser's `localStorage`.

Worth knowing:
- The widget calls the Claude API directly from the browser, so the key is visible to
  anyone using that browser. Fine for local use; don't host it like this.
- Open the store over HTTP (as above), not as a `file://` page — that breaks the
  cross-origin calls.
- Deskly keeps everything in memory. Restarting it wipes tickets and stats.

## Walkthrough

Open the store and the Deskly inbox side by side.

1. **Grounded answer.** As Quinn Xu (happy regular), ask *"What's your return window?"*
   → 30 days, at least half full, with a source chip for the returns article.
2. **Knowing what it doesn't know.** *"Is the Renew Serum safe to use while pregnant?"*
   → It says the articles don't cover it and offers a human instead of guessing.
3. **Knowing the customer.** *"Where's my order?"* → the real order ID, product and date.
4. **Concern vs. anger.** Switch to Liam Mora (angry VIP). *"Hey, my last order seems a
   bit delayed — any idea what's going on?"* → a grounded answer plus an offer, not a
   panic escalation. Reply *"Yes please."* → it escalates.
5. **The handoff.** In Deskly: the ticket arrives as **urgent · shipping ·
   angry-customer · vip**, with the customer panel ($746.04 lifetime value, VIP,
   subscriber, a prior unresolved chat rated 1/5) and a summary ending in a suggested
   action.
6. **Closing the loop.** Reply in the inbox and press Enter → the reply appears in the
   chat within ~2s. Click **"That solved it ✓"** → the ticket flips to solved.
7. **Dashboard.** Deskly's **Dashboard** tab shows how often the AI answered on its own
   vs. escalated, why, and what it answered from.

If you want to see an instant escalation, as Liam send *"…Every single order has some
issue. I'm getting really sick of this."* — it files as urgent on the first message.

## The agent inbox

Deskly's ticket API and data model are unchanged; the agent-facing page is
`helpdesk/inbox.html`. Before the agent reads a word, they see:

- **Who they're talking to** — lifetime value, VIP and subscriber badges, tenure,
  region, recent orders, and prior support history with CSAT.
- **A handoff they can act on** — the summary as ISSUE / WANTS / CONTEXT rows, with
  SUGGESTED ACTION as the callout.
- **The conversation** — the pre-escalation transcript as customer/AI bubbles, then the
  live thread. Enter sends; the reply appears instantly.
- **The Dashboard tab** — % of conversations handled by AI, escalations by reason and
  priority, answers by article, average turns before handoff, and a live activity feed.
  The widget reports only what Deskly can't see on its own: an answer that needed no
  human (`POST /events`).

## Design notes

- **One file, no build** (`store/widget.js`): plain JS + fetch, streaming from
  `claude-opus-5` with `effort: low` for chat-speed replies. The system prompt with the
  articles stays identical across a conversation and is cached, so later turns don't
  resend ~3k tokens.
- **No semantic search, on purpose.** Eleven articles fit in the prompt; retrieval would
  add ways to fail without adding accuracy.
- **Themeable** — every color and typeface is in one `THEME` object, so re-skinning for
  another merchant is one config change.
- **Restrained motion** — chat animations stay under 200ms with exits shorter than
  entrances. The one flourish is the launcher morphing into the chat panel.
  `prefers-reduced-motion` is respected.
- **Honest states** — a Deskly-offline warning, real API errors, a key self-test, and
  delivery-failure notices after escalation. `POST /api/v2/_demo/outage` simulates a
  helpdesk outage to show the degraded path.

## Repo map

```
store/widget.js              the chat widget (mounted in store.html)
store/serve.sh               serves the store, loading the key from .env
helpdesk/deskly.py           Deskly helpdesk mock + events/stats extension (see API.md)
helpdesk/inbox.html          agent inbox and dashboard
helpdesk/articles.json       the help-center articles — the bot's source of truth
data/                        customers, orders, past support chats
evals/eval_escalation.py     escalation-judgment eval (17 scenarios)
evals/eval_results.md        latest transcripts
```
