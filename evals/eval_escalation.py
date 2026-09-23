#!/usr/bin/env python3
"""Escalation-judgment eval for the Ritual Goods support widget.

Replays scripted customer conversations against the SAME system prompt,
model, and tool the widget uses (ported from store/widget.js — keep in sync),
then scores: escalate vs not, turn count, priority, tags, summary shape,
grounding citations.

Usage: python3 evals/eval_escalation.py   (Deskly must be running on :8099)
Key:   $ANTHROPIC_API_KEY, or ANTHROPIC_API_KEY in the repo's .env (gitignored).
       ANTHROPIC_WORKSPACE_ID is sent too when set, for keys not scoped to a workspace.
"""
import datetime, json, os, pathlib, re, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parent.parent
_ENV_FILE = ROOT / ".env"
_DOTENV = dict(
    (k.strip(), v.strip().strip("'\""))
    for k, _, v in (l.partition("=") for l in (_ENV_FILE.read_text().splitlines() if _ENV_FILE.exists() else []))
    if k.strip() and not k.lstrip().startswith("#")
)
def _setting(name):
    return os.environ.get(name, "").strip() or _DOTENV.get(name, "")
KEY = _setting("ANTHROPIC_API_KEY")
WORKSPACE = _setting("ANTHROPIC_WORKSPACE_ID")
if not KEY:
    sys.exit("No API key: export ANTHROPIC_API_KEY=… (or set it in .env)")
MODEL = "claude-opus-5"
TODAY = datetime.date.today().isoformat()  # matches the widget (keep in sync)

SPOTLIGHT = json.loads((ROOT / "data/spotlight_customers.json").read_text())
ARTICLES = json.loads(
    urllib.request.urlopen("http://localhost:8099/api/v2/help_center/articles").read()
)["articles"]

ESCALATE_TOOL = {
    "name": "escalate_to_human",
    "description": "File a ticket in the Deskly helpdesk so a human support agent takes over this conversation. Use according to the escalation rules.",
    "input_schema": {
        "type": "object",
        "properties": {
            "subject": {"type": "string"},
            "priority": {"type": "string", "enum": ["low", "normal", "high", "urgent"]},
            "tags": {"type": "array", "items": {"type": "string"}},
            "ai_summary": {
                "type": "string",
                "description": "Handoff summary with all five labels, in this order, every time: WHO: … ISSUE: … WANTS: … CONTEXT: … SUGGESTED ACTION: …. Never drop a label: the agent inbox shows each one as its own row. If a part is unclear, say so after the label (e.g. \"WANTS: not stated yet\").",
            },
            "customer_visible_message": {"type": "string"},
        },
        "required": ["subject", "priority", "tags", "ai_summary", "customer_visible_message"],
    },
}


def build_system_prompt(customer):
    """Port of widget.js buildSystemPrompt() — KEEP IN SYNC."""
    p = customer["profile"]
    orders = sorted(customer["orders"], key=lambda o: o["order_date"])
    last = orders[-1] if orders else None
    is_sub = str(p["is_subscriber"]) == "True" or p["is_subscriber"] is True
    ltv = float(p["lifetime_value_usd"])
    bad_history = any(
        ch.get("resolved") is False or (ch.get("csat") is not None and ch["csat"] <= 2)
        for ch in customer.get("chats", [])
    )
    article_text = "\n\n".join(f"### [{a['id']}] {a['title']}\n{a['body']}" for a in ARTICLES)
    customer_json = json.dumps(
        {"profile": p, "orders": orders, "past_support_chats": customer.get("chats", [])},
        indent=1,
    )
    last_str = f"{last['order_id']} — {last['product']}, placed {last['order_date']}" if last else "none"
    notes = (
        f"{'SUBSCRIBER' if is_sub else 'not a subscriber'}; lifetime value ${ltv:.2f}"
        f"{' (VIP)' if ltv > 400 else ''}; latest order {last_str}"
        f"{'; has a prior unresolved or poorly-rated support experience — acknowledge it if they bring up related frustration, and extend extra care. If their question is about the same thing that prior chat failed to resolve, say plainly that you can see it went unresolved last time, do NOT re-recite the self-serve step that already failed them, and lead with having the team handle it directly' if bad_history else ''}."
    )
    return f"""You are the support concierge for Ritual Goods, a DTC wellness brand, chatting with a logged-in customer on the storefront. Today's date is {TODAY}.

# Voice
Warm, competent, and brief. Write like a person texting, not an essay: prefer commas, periods, and short sentences over em dashes (—), and use at most one in a whole reply. 1–3 short sentences for most answers — this is a chat window, not email. If an answer truly needs more, break it into short paragraphs separated by blank lines — lead with the direct answer, details after; never one dense block. Never use corporate filler ("Thank you for reaching out"). Use the customer's first name sparingly.

# The customer you are talking to
{customer_json}

Notes: {notes}

Never ask for information you already have (name, email, order number). "Where's my order?" means their actual latest order — answer with its real details. Tracking links go out by email at shipment; the widget cannot show live tracking.

# Help center (the ONLY source of policy truth)
{article_text}

# Grounding rules — the cardinal rule
- Answer policy questions ONLY from the articles above. Quote specifics (numbers, timeframes) accurately.
- When an article answers the question, end your reply with a line: [source: <exact article title>]
- If the articles genuinely don't cover something, say so plainly in one sentence and offer to connect a human. NEVER invent a policy, price, ingredient, or promise. An honest "I don't know" is always correct; a confident guess is the one unforgivable error.
- Careful: some questions sound uncovered but are answerable (e.g. "Do you ship to Japan?" — the shipping article lists the only countries we ship to, so the answer is no). Reason from what the articles state and imply directly; do not stretch beyond that.
- A rule about one subject does not answer a question about a different subject. A promo-code rule is not a price-match policy; a return window is not a warranty. If the customer names a policy the articles never mention, say it isn't covered and offer a human — even when a related-sounding rule exists.
- Multi-part questions: answer each part on its own merits and say plainly which part you can't answer. Never let a covered part carry an uncovered one — a confident answer beside an unsupported one makes both look sourced.
- When a question could mean two different things and the articles answer them differently (e.g. "swap" = change a subscription product vs. exchange one already bought), cover both readings in one short line rather than silently picking one. Naming the ambiguity builds more trust than a confident guess at intent.

# Escalation — the escalate_to_human tool
Escalate (call the tool) when:
- The customer asks for a human — or says yes to your offer of one; consent counts as asking.
- The customer is clearly angry or frustrated — do not argue past two turns; with a VIP or prior bad experience, escalate on clear first-message anger. But calm concern is NOT anger: a polite question ("seems a bit delayed — any idea?") gets a grounded answer plus an offer, never an unprompted escalation.
- A damaged/defective/wrong item claim needs photo review or a replacement/refund actioned (policy says we handle it — but a human executes it).
- They push for something off-policy or an exception (discounts, overriding a rule) AFTER you've answered with what policy offers — first give the grounded answer; escalate only if they insist. But account changes only a human can perform (address changes, refunds) escalate right away. For subscription cancellation, give the self-serve path from the article, offer to have the team do it, and escalate when they say yes.
- The articles don't cover their question and it matters to them.
Do NOT escalate plain FAQ questions the articles answer, and do not offer escalation when a grounded answer fully resolves the question. When an article routes to support (e.g. tracking stalled 5+ business days), give the grounded answer first, then ask in one short sentence whether they'd like you to hand it to the team — escalate when they say yes.

Tool arguments:
- subject: specific and scannable, e.g. "Damaged Renew Serum — replacement requested (VIP)"
- priority: urgent = angry VIP/subscriber or time-critical; high = damaged items, billing errors, upset customer; normal = routine human requests; low = non-urgent feedback
- tags: 2–4 from: damaged, refund, return, subscription, cancellation, shipping, billing, product-question, angry-customer, vip, off-policy, other
- ai_summary: ONE paragraph a human can act on in 10 seconds, exactly this shape: "WHO: <name, id, $LTV, subscriber?, region>. ISSUE: <what happened>. WANTS: <what they want>. CONTEXT: <relevant order/history detail>. SUGGESTED ACTION: <specific next step + relevant policy>."
- customer_visible_message: 1–2 warm sentences shown to the customer right before the transfer: first validate their specific concern in plain words (acknowledge what happened and why it matters to them), then say transparently that you are connecting them with our team so they can help further. No corporate filler, no "please hold".

After calling the tool, do not write anything else — the widget takes over."""


def call_claude(system, messages):
    body = json.dumps({
        "model": MODEL,
        "max_tokens": 1024,
        "output_config": {"effort": "low"},
        # Same breakpoint the widget uses: the 17 scenarios share one prompt prefix per
        # customer, so every turn after the first reads it from cache instead of re-sending.
        "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
        "tools": [ESCALATE_TOOL],
        "messages": messages,
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "content-type": "application/json",
            "x-api-key": KEY,
            "anthropic-version": "2023-06-01",
            **({"anthropic-workspace-id": WORKSPACE} if WORKSPACE else {}),
        },
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.loads(r.read())
    text = "".join(b.get("text", "") for b in data["content"] if b["type"] == "text")
    tool = next((b for b in data["content"] if b["type"] == "tool_use"), None)
    return text, (tool["input"] if tool else None)


SCENARIOS = [
    dict(name="angry_vip_first_message", customer="angry_vip",
         turns=["My Starter Ritual Kit order still hasn't arrived and tracking hasn't moved in over a week. Every single order has some issue. I'm getting really sick of this."],
         expect=dict(escalate=True, by_turn=1, priority=["urgent"], tags_any=["angry-customer", "vip", "shipping"])),
    dict(name="mild_delay_no_escalation", customer="angry_vip",
         turns=["Hey, my last order seems a bit delayed — any idea what's going on?"],
         expect=dict(escalate=False, text_any=["team", "human", "support", "look into", "investigate", "hand"])),
    dict(name="mild_delay_then_consent", customer="angry_vip",
         turns=["Hey, my last order seems a bit delayed — any idea what's going on?",
                "Yes please, that would be great."],
         expect=dict(escalate=True, by_turn=2, first_turn_no_escalate=True,
                     priority=["normal", "high", "urgent"], tags_any=["shipping"])),
    dict(name="mild_then_furious", customer="angry_vip",
         turns=["Hey, my last order seems a bit delayed — any idea what's going on?",
                "A week late and no update?? This is the third time in a row. Fix it or I'm cancelling everything."],
         expect=dict(escalate=True, by_turn=2, priority=["urgent", "high"], tags_any=["angry-customer", "shipping"])),
    dict(name="explicit_human_request", customer="happy_regular",
         turns=["Can I talk to a person please?"],
         expect=dict(escalate=True, by_turn=1, priority=["normal", "low"])),
    dict(name="damaged_item", customer="cancel_attempt",
         turns=["My Gift Set just arrived and the jar inside is shattered — product all over the box."],
         expect=dict(escalate=True, by_turn=1, priority=["high", "urgent"], tags_any=["damaged"])),
    dict(name="faq_return_window", customer="happy_regular",
         turns=["What's your return window?"],
         expect=dict(escalate=False, text_any=["30"], cite="Returns & refunds policy")),
    dict(name="trap_ship_japan", customer="brand_new",
         turns=["Do you ship to Japan?"],
         expect=dict(escalate=False, text_any=["don't", "only", "not", "unfortunately"], cite="Shipping times & costs")),
    dict(name="trap_pregnancy", customer="quiet_fader",
         turns=["Is the Renew Serum safe to use while pregnant?"],
         expect=dict(escalate=None,  # either honest-refuse or escalate is fine
                     text_any_if_no_escalate=["doctor", "dermatologist", "physician", "don't", "not covered", "can't", "isn't covered", "doesn't cover", "human"])),
    dict(name="discount_beg_then_insist", customer="happy_regular",
         turns=["Can you give me a discount code? Come on, just this once :)",
                "Seriously, I've spent a fortune with you — make an exception for me."],
         expect=dict(escalate=True, by_turn=2, no_invented_code=True,
                     first_turn_no_escalate=True)),  # grounded answer first, human on insistence
    dict(name="order_lookup_brand_new", customer="brand_new",
         turns=["Where's my order?"],
         expect=dict(escalate=False, text_any=["O30412", "Renew Serum"])),
    # ---- grounded-answer sweep (playbook test script) ----
    dict(name="cancel_selfserve_then_yes", customer="cancel_attempt",
         turns=["How do I cancel my subscription?",
                "Just have your team cancel it for me please."],
         # This customer's March cancellation went unresolved, so the prompt says to skip the
         # self-serve steps that already failed them. Citing the article OR owning that
         # history are both correct first turns.
         expect=dict(escalate=True, by_turn=2, first_turn_no_escalate=True,
                     cite_or_text_any=("Cancelling your subscription",
                                       ["last time", "in march", "back in march", "unresolved",
                                        "didn't get sorted", "didn't go through", "didn't stick",
                                        "didn't take", "never went through"]),
                     tags_any=["subscription", "cancellation"])),
    dict(name="exchange_policy", customer="happy_regular",
         turns=["Can I exchange my Gentle Wash for the Silk Repair Mask instead?"],
         expect=dict(escalate=None, text_any=["refund"], cite="Returns & refunds policy")),
    dict(name="promo_stacking", customer="brand_new",
         turns=["If I subscribe, can I still use a promo code on top of the 15% discount?"],
         expect=dict(escalate=False, text_any=["stack", "yes", "do combine", "on top"],
                     cite="Promo codes, discounts & store credit")),
    dict(name="duplicate_charge", customer="happy_regular",
         turns=["I think I got charged twice for my last order?"],
         expect=dict(escalate=None,
                     text_any_if_no_escalate=["hold", "2-3", "bank", "authorization"])),
    dict(name="nut_allergy", customer="quiet_fader",
         turns=["I have a tree nut allergy — is the Velvet Body Butter okay for me?"],
         expect=dict(escalate=False, text_any=["shea", "avoid"],
                     cite="Ingredients, allergens & sensitivities")),
    dict(name="collagen_vegan", customer="brand_new",
         turns=["Are the Collagen Peptides vegan?"],
         expect=dict(escalate=False, text_any=["bovine", "not vegan", "aren't vegan", "isn't vegan"],
                     cite="Ingredients, allergens & sensitivities")),
]


def run_scenario(sc):
    customer = SPOTLIGHT[sc["customer"]]
    system = build_system_prompt(customer)
    history, transcript, tool, esc_turn = [], [], None, None
    for i, user_msg in enumerate(sc["turns"], 1):
        history.append({"role": "user", "content": user_msg})
        transcript.append(("customer", user_msg))
        text, tool = call_claude(system, history)
        if text:
            history.append({"role": "assistant", "content": text})
            transcript.append(("ai", text))
        if tool:
            esc_turn = i
            transcript.append(("ESCALATED", json.dumps(tool, indent=1)))
            break

    e, failures = sc["expect"], []
    all_text = " ".join(t for role, t in transcript if role == "ai").lower()

    if e.get("escalate") is True and not tool:
        failures.append("expected escalation, none happened")
    if e.get("escalate") is False and tool:
        failures.append("escalated a question it should have answered")
    if tool and e.get("by_turn") and esc_turn > e["by_turn"]:
        failures.append(f"escalated on turn {esc_turn}, expected by turn {e['by_turn']}")
    if tool and e.get("first_turn_no_escalate") and esc_turn == 1:
        failures.append("escalated on turn 1 — should answer from policy first, escalate on insistence")
    if tool and e.get("priority") and tool["priority"] not in e["priority"]:
        failures.append(f"priority {tool['priority']!r}, expected one of {e['priority']}")
    if tool and e.get("tags_any") and not set(tool.get("tags", [])) & set(e["tags_any"]):
        failures.append(f"tags {tool.get('tags')} missing all of {e['tags_any']}")
    if tool:
        s = tool.get("ai_summary", "")
        for part in ("WHO:", "ISSUE:", "WANTS:", "CONTEXT:", "SUGGESTED ACTION:"):
            if part not in s:
                failures.append(f"ai_summary missing '{part}'")
    if e.get("text_any") and not any(t.lower() in all_text for t in e["text_any"]):
        failures.append(f"answer lacks all of {e['text_any']}")
    if e.get("cite") and f"[source: {e['cite'].lower()}]" not in all_text:
        failures.append(f"missing citation [source: {e['cite']}]")
    if e.get("cite_or_text_any"):
        title, phrases = e["cite_or_text_any"]
        if f"[source: {title.lower()}]" not in all_text and not any(t in all_text for t in phrases):
            failures.append(f"neither cited [source: {title}] nor acknowledged the prior unresolved attempt")
    if e.get("text_any_if_no_escalate") and not tool and not any(t in all_text for t in e["text_any_if_no_escalate"]):
        failures.append("answered the uncovered question without hedging or offering a human")
    if e.get("no_invented_code") and re.search(r"\b[A-Z0-9]{4,}[-]?[A-Z0-9]*\b(?=[^.]*(code|off))", " ".join(t for r, t in transcript if r == "ai")):
        failures.append("appears to have invented a promo code")

    return sc["name"], failures, transcript


def main():
    results = []
    with ThreadPoolExecutor(max_workers=4) as ex:
        for name, failures, transcript in ex.map(run_scenario, SCENARIOS):
            results.append((name, failures, transcript))

    out = ["# Escalation eval results\n"]
    passed = 0
    for name, failures, transcript in results:
        status = "PASS" if not failures else "FAIL"
        passed += status == "PASS"
        print(f"{status:4}  {name}" + (f"  — {'; '.join(failures)}" if failures else ""))
        out.append(f"## {status} — {name}\n")
        for f in failures:
            out.append(f"- ❌ {f}")
        out.append("")
        for role, text in transcript:
            out.append(f"**{role}:** {text}\n")
        out.append("---\n")
    print(f"\n{passed}/{len(results)} scenarios passed")
    (ROOT / "evals/eval_results.md").write_text("\n".join(out))
    print("full transcripts → evals/eval_results.md")


if __name__ == "__main__":
    main()
