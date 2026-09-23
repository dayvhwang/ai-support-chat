# Ritual Goods AI Support Chat

A customer-support chatbot focused on **UX and guardrails**: when the AI should answer,
when it should hand off to a human, and how it guides each customer to the right answer
or the right person.

This isn't a visual design project. The interface has some deliberate micro-interactions,
but the focus is on behavior:
- The AI answers only from hard facts, never from guesses.
- It escalates by judgment, not by reflex.
- It never leaves a customer at a dead end.

Most support bots fail in one of two ways. They make up confident answers that aren't
backed by anything, or they escalate everything and save no one any time. This project
is about the space between those two failures.

## Two parts

The project has two sides, joined by the AI-to-human handoff:

```
  CUSTOMER SIDE                                  AGENT SIDE
  store/  chat widget on the storefront          helpdesk/  Deskly helpdesk + agent inbox

  customer asks ──▶ AI answers from facts
                    │
                    └─ needs a human? ── ticket + handoff summary ──▶ agent sees it in the inbox
                                                                        │
  reply appears in the same chat ◀────────── agent replies ─────────────┘
  customer taps "That solved it ✓" ───────── ticket marked solved ──▶
```

**1. The customer chat widget** (`store/`) runs on a demo storefront for Ritual Goods, a
fictional wellness brand. It knows who is logged in. It answers questions from the help
center and the customer's own orders. When a human is needed, it files the ticket and
keeps the customer in the same chat until the agent replies.

**2. The agent helpdesk** (`helpdesk/`) is Deskly, a small Zendesk-style helpdesk: a
ticket API plus the inbox that human support staff work from. This is where the AI's
handoff lands. Each ticket arrives with the customer's account context and a summary the
agent can act on in seconds. The agent's reply goes back into the customer's chat. A
dashboard shows how often the AI answered on its own vs. handed off, and why.

## Guardrails: how the AI decides

**Answer only from facts.**
- All 11 help-center articles are fetched from `GET /help_center/articles` at load and
  placed in the system prompt. There's no retrieval step to miss the right article.
- Every factual answer cites its article as a source chip, so the customer can see
  where it came from.
- Account questions use the customer's real data (`window.RITUAL_CUSTOMER`: profile,
  orders, past chats). "Where's my order?" gets the real order ID and date, never
  "please provide your email."

**Don't guess.**
- If the articles don't cover a question, the AI says so and offers a human. A
  confident guess, like saying a serum is safe during pregnancy, is the worst possible
  answer, so it never gives one.

**Escalate by judgment, not by reflex.**
- Claude decides through an `escalate_to_human` tool, following explicit rules:
  - A furious customer escalates on the first message, at `urgent` if they're a VIP.
  - Calm concern ("my order seems a bit delayed") gets a factual answer plus an *offer*
    of a human. Saying yes counts as asking.
  - Off-policy requests, like asking for a discount, get the policy answer first and
    escalate only if the customer insists.
  - Cancellations get the self-serve steps, with an offer to have the team do it.
- Priority comes from sentiment × lifetime value × subscriber status. Tags come from a
  fixed list.

**Guide, don't dead-end.**
- Every reply ends with the customer knowing their next step: the answer itself, a
  self-serve path, or a human who already has the full context.
- If something breaks, the widget says so plainly: helpdesk offline, API error, bad
  key, or a failed delivery after escalation. It never pretends a handoff happened.

## The handoff (agent side)

Deskly's ticket API and data model are unchanged. The AI's ticket (`POST /tickets`)
carries the transcript, priority, tags, a structured summary (WHO / ISSUE / WANTS /
CONTEXT / SUGGESTED ACTION) and a customer snapshot in `requester.profile`. Before the
agent reads a word, the inbox (`helpdesk/inbox.html`) shows:

- **Who they're talking to**: lifetime value, VIP and subscriber badges, tenure,
  region, recent orders, and past support history with satisfaction scores.
- **A handoff they can act on**: the summary as ISSUE / WANTS / CONTEXT rows, with
  SUGGESTED ACTION as the callout.
- **The conversation**: the chat before escalation as customer/AI bubbles, then the live
  thread. Enter sends, and the reply appears in the customer's chat within about two
  seconds.
- **The Dashboard tab**: % of conversations the AI handled alone, escalations by reason
  and priority, which articles answers came from, average turns before handoff, and a
  live activity feed. The widget reports the one thing Deskly can't see on its own, an
  answer that needed no human (`POST /events`).

## Tested by an eval

The escalation rules are tested, not assumed. `evals/eval_escalation.py` replays
**17 scripted conversations** against the widget's exact prompt, including an angry VIP,
calm-then-furious, questions the articles don't cover, damaged items, allergy questions
and promo stacking. For each one it checks whether the AI escalated, how many turns it
took, the priority, tags, summary shape and citations. Latest run: **17/17**, with full
transcripts in `evals/eval_results.md`.

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

Then start both parts:

```sh
# Agent side: Deskly helpdesk + inbox → http://localhost:8099
cd helpdesk && python3 deskly.py

# Customer side: storefront with the chat widget → http://localhost:8080/store.html
./store/serve.sh
```

`serve.sh` copies the key from `.env` into `store/config.local.js` (also gitignored) so
the browser can use it, and serves the store on `127.0.0.1` only. Without a `.env`, the
widget asks for a key in the chat and keeps it in that browser's `localStorage`.

Worth knowing:
- The widget calls the Claude API directly from the browser, so anyone using that
  browser can see the key. Fine for local use, but don't host it like this.
- Open the store over HTTP as above, not as a `file://` page, which breaks the calls to
  Deskly and the API.
- Deskly keeps everything in memory. Restarting it wipes tickets and stats.

## Walkthrough

Open the store and the Deskly inbox side by side.

1. **Factual answer.** As Quinn Xu (happy regular), ask *"What's your return window?"*
   → 30 days, at least half full, with a source chip for the returns article.
2. **Not guessing.** *"Is the Renew Serum safe to use while pregnant?"* → it says the
   articles don't cover it and offers a human instead of guessing.
3. **Knowing the customer.** *"Where's my order?"* → the real order ID, product and date.
4. **Concern vs. anger.** Switch to Liam Mora (angry VIP). *"Hey, my last order seems a
   bit delayed, any idea what's going on?"* → a factual answer plus an offer, not an
   instant escalation. Reply *"Yes please."* → it escalates.
5. **The handoff.** In Deskly, the ticket arrives tagged **urgent · shipping ·
   angry-customer · vip**. The customer panel shows $746.04 lifetime value, VIP,
   subscriber, and a past unresolved chat rated 1/5. The summary ends with a suggested
   action.
6. **Closing the loop.** Reply in the inbox and press Enter → the reply appears in the
   customer's chat. Click **"That solved it ✓"** → the ticket flips to solved.
7. **Dashboard.** Deskly's **Dashboard** tab shows how often the AI answered on its own
   vs. handed off, why, and which articles it answered from.

To see an instant escalation, send this as Liam: *"…Every single order has some issue.
I'm getting really sick of this."* It files as urgent on the first message.

## Interaction details

The UI stays out of the way so the conversation can do the work. The details that
support that:
- Sender labels always make clear who is talking: the AI or a named person on the team.
- Quick-reply chips on the greeting, a composer that grows as you type (Enter sends,
  Shift+Enter adds a new line), and auto-scroll that doesn't jump if you've scrolled up
  to read.
- An unread badge when an agent replies while the chat is closed.
- Short, restrained motion that respects `prefers-reduced-motion`.

## Technical notes

- **One file, no build** (`store/widget.js`): plain JS + fetch, streaming from
  `claude-opus-5` with `effort: low` for chat-speed replies. The system prompt with the
  articles stays the same for the whole conversation and is cached, so later turns
  don't resend ~3k tokens.
- **No semantic search, on purpose.** Eleven articles fit in the prompt. Retrieval
  would add ways to fail without making answers more accurate.
- **Easy to re-skin**: every color and typeface is in one `THEME` object.
- `POST /api/v2/_demo/outage` simulates a helpdesk outage to show how the widget
  degrades.

## Repo map

```
store/                       CUSTOMER SIDE
  widget.js                  the chat widget: prompt, guardrails, escalation, reply polling
  store.html                 demo storefront the widget runs on
  serve.sh                   serves the store, loading the key from .env

helpdesk/                    AGENT SIDE
  deskly.py                  Deskly helpdesk API + events/stats extension (see API.md)
  inbox.html                 agent inbox and dashboard
  articles.json              help-center articles, the AI's source of truth

data/                        customers, orders, past support chats
evals/eval_escalation.py     escalation eval (17 scenarios)
evals/eval_results.md        latest transcripts
```
