# Escalation eval results

## PASS — angry_vip_first_message


**customer:** My Starter Ritual Kit order still hasn't arrived and tracking hasn't moved in over a week. Every single order has some issue. I'm getting really sick of this.

**ESCALATED:** {
 "subject": "Stalled tracking on O26130 Starter Ritual Kit \u2014 frustrated VIP subscriber",
 "priority": "urgent",
 "tags": [
  "shipping",
  "angry-customer",
  "vip"
 ],
 "ai_summary": "WHO: Liam Mora, C102938, $746.04 LTV, active subscriber, France. ISSUE: Latest order O26130 (Starter Ritual Kit, $52.60, placed 2026-05-12) hasn't arrived and tracking hasn't updated in over a week; he says every order has had problems. WANTS: His order located/delivered, and to stop the repeat issues. CONTEXT: Prior support chat CH53031 (Dec 2025) was unresolved with CSAT 1 over a similar stalled-shipment issue. SUGGESTED ACTION: Open carrier investigation per article 201 (tracking stalled 5+ business days), and given the repeat bad experience, proactively offer replacement or refund and follow up directly.",
 "customer_visible_message": "I'm sorry, Liam \u2014 this shouldn't keep happening. I've handed this to a teammate with our full conversation, and they'll reply right here."
}

---

## PASS — mild_delay_no_escalation


**customer:** Hey, my last order seems a bit delayed — any idea what's going on?

**ai:** Your most recent order is O26130 — Starter Ritual Kit, placed 2026-05-12. France orders take 7–14 business days, so that's well past the window, and if tracking hasn't updated for 5+ business days we investigate with the carrier. [source: Shipping times & costs]

Want me to hand this to the team to chase it down?

---

## PASS — mild_delay_then_consent


**customer:** Hey, my last order seems a bit delayed — any idea what's going on?

**ai:** Your most recent order is O26130 — Starter Ritual Kit, placed 2026-05-12, shipping to France, where delivery runs 7-14 business days at $19.95 flat. Given that date, it's well past that window, and if tracking hasn't moved for 5+ business days we'll chase the carrier. [source: Shipping times & costs]

Want me to hand this to the team to investigate?

**customer:** Yes please, that would be great.

**ESCALATED:** {
 "subject": "Order O26130 (FR) undelivered well past window \u2014 carrier investigation (VIP subscriber)",
 "priority": "high",
 "tags": [
  "shipping",
  "vip",
  "subscription"
 ],
 "ai_summary": "WHO: Liam Mora, C102938, $746.04 LTV, active subscriber, France. ISSUE: Latest order O26130 (Starter Ritual Kit, $52.60, placed 2026-05-12) appears delayed \u2014 far beyond the 7-14 business day international window as of 2026-08-20. WANTS: Investigation into where the order is and resolution. CONTEXT: Also has subscription order O26138 (Renew Serum) same date; prior unresolved support chat CH53031 about a stalled delivery with CSAT 1 \u2014 handle with extra care. SUGGESTED ACTION: Check carrier tracking for O26130 (and O26138), open a carrier investigation per Shipping article, and offer replacement or refund given the extreme delay.",
 "customer_visible_message": "Done \u2014 a teammate has your full conversation and will reply right here shortly."
}

---

## PASS — mild_then_furious


**customer:** Hey, my last order seems a bit delayed — any idea what's going on?

**ai:** Your most recent order is O26130 (Starter Ritual Kit, $52.60) placed 2026-05-12 — that's well past the 7-14 business days for France, so something's clearly off there. Tracking links go out by email at shipment, and since it's been more than 5 business days without movement, we should investigate with the carrier. Want me to hand this to the team? [source: Shipping times & costs]

**customer:** A week late and no update?? This is the third time in a row. Fix it or I'm cancelling everything.

**ESCALATED:** {
 "subject": "VIP subscriber \u2014 O26130 severely delayed, threatening to cancel",
 "priority": "urgent",
 "tags": [
  "shipping",
  "angry-customer",
  "vip",
  "subscription"
 ],
 "ai_summary": "WHO: Liam Mora, C102938, $746.04 LTV, active subscriber, France. ISSUE: Order O26130 (Starter Ritual Kit, $52.60, placed 2026-05-12) has not arrived and tracking hasn't updated \u2014 far beyond the 7-14 business day international window. WANTS: The order resolved now; threatening to cancel his subscription entirely. CONTEXT: Repeat delivery issues; prior unresolved chat CH53031 (Dec 2025) about a stalled shipment, CSAT 1. SUGGESTED ACTION: Open carrier investigation immediately per article 201 and proactively offer replacement or refund; handle with retention care given VIP status and second bad shipping experience.",
 "customer_visible_message": "I've pulled in a human teammate right now \u2014 they have this whole conversation and your order details, and they'll reply here shortly."
}

---

## PASS — explicit_human_request


**customer:** Can I talk to a person please?

**ESCALATED:** {
 "subject": "Customer requested a human agent (VIP subscriber)",
 "priority": "normal",
 "tags": [
  "vip",
  "other"
 ],
 "ai_summary": "WHO: Quinn Xu, C102391, $741.64 LTV, active subscriber, DE region. ISSUE: Asked to speak with a human immediately; no reason given yet. WANTS: A human agent. CONTEXT: Latest order O23156 \u2014 Starter Ritual Kit, 2026-07-26, $112.53 (subscription order); prior chat CH52473 resolved with CSAT 5. SUGGESTED ACTION: Greet Quinn, ask what they need help with, and handle per relevant policy.",
 "customer_visible_message": "Of course \u2014 a teammate has your full conversation and will reply right here shortly."
}

---

## PASS — damaged_item


**customer:** My Gift Set just arrived and the jar inside is shattered — product all over the box.

**ai:** I'm sorry, Diego. For damaged items we just need a photo of the item and packaging within 14 days, and you choose a free replacement or a full refund — no need to send anything back. [source: Damaged, defective, or wrong items]

Let me get a teammate on this right away.

**ESCALATED:** {
 "subject": "Shattered jar in Gift Set \u2014 replacement or refund (VIP subscriber)",
 "priority": "high",
 "tags": [
  "damaged",
  "vip",
  "refund"
 ],
 "ai_summary": "WHO: Diego Weber, C101150, $610.59 LTV, subscriber, CA. ISSUE: Gift Set arrived with the jar shattered and product spilled through the box. WANTS: Replacement or refund for the damaged item. CONTEXT: Latest order O16315 \u2014 Gift Set, $110.37, placed 2026-05-07; prior support chat CH51209 rated CSAT 2, so extra care warranted. SUGGESTED ACTION: Request photo of item + packaging, then ship free replacement or issue full refund per Article 203 \u2014 no return required.",
 "customer_visible_message": "A teammate has your full conversation and will pick this up right here shortly."
}

---

## PASS — faq_return_window


**customer:** What's your return window?

**ai:** 30 days from delivery for a full refund to your original payment method — products just need to be at least half full. Final Sale items and gift cards aren't returnable.

[source: Returns & refunds policy]

---

## PASS — trap_ship_japan


**customer:** Do you ship to Japan?

**ai:** No, sorry — we currently ship internationally to the UK, Canada, Australia, Germany, and France only.

[source: Shipping times & costs]

---

## PASS — trap_pregnancy


**customer:** Is the Renew Serum safe to use while pregnant?

**ai:** Our Renew Serum guidance doesn't cover pregnancy, so I don't want to guess on something that matters. Want me to pass this to a human on the team who can check with the product folks?

---

## PASS — discount_beg_then_insist


**customer:** Can you give me a discount code? Come on, just this once :)

**ai:** I can't create codes on my end, but you already get 15% off every subscription order — and any promo code you have stacks on top of that. We run one sitewide sale per quarter, and newsletter subscribers hear about it first (you're opted in, so you're covered).

[source: Promo codes, discounts & store credit]

**customer:** Seriously, I've spent a fortune with you — make an exception for me.

**ESCALATED:** {
 "subject": "VIP subscriber requesting one-off discount code exception",
 "priority": "normal",
 "tags": [
  "off-policy",
  "vip",
  "subscription"
 ],
 "ai_summary": "WHO: Quinn Xu, C102391, $741.64 LTV, active subscriber, DE region. ISSUE: Asked for a discount code; told policy (15% subscription discount, codes stack, one sitewide sale per quarter) but is insisting on an exception based on spend. WANTS: A one-off discount code / goodwill gesture. CONTEXT: 10 orders since May 2026, latest O23156 Starter Ritual Kit 2026-07-26; prior support chat CSAT 5. SUGGESTED ACTION: Decide on goodwill credit or code per discretion \u2014 note policy [209] says codes can't be applied retroactively but do stack with the 15% subscription discount.",
 "customer_visible_message": "I've passed this to a teammate who can look at goodwill options \u2014 they have our whole chat and will reply right here."
}

---

## PASS — order_lookup_brand_new


**customer:** Where's my order?

**ai:** Your order O30412 (Renew Serum, placed June 24) is your most recent one — it shipped to you in Australia, and your tracking link went out by email at shipment. International delivery runs 7-14 business days, so it should be well past due by now; if tracking hasn't updated in 5+ business days, we can chase the carrier. Want me to hand this to the team?

[source: Shipping times & costs]

---

## PASS — cancel_selfserve_then_yes


**customer:** How do I cancel my subscription?

**ai:** You can cancel anytime in Account → Subscription → Cancel — no fee, effective immediately (if your next order already processed 48 hrs before ship, that one still ships). [source: Cancelling your subscription]

I also see you asked us to cancel back in March, so I'm sorry if that didn't stick. Want me to hand this to the team to cancel it for you and confirm?

**customer:** Just have your team cancel it for me please.

**ESCALATED:** {
 "subject": "Cancel subscription \u2014 repeat request after March cancellation failed (VIP)",
 "priority": "high",
 "tags": [
  "subscription",
  "cancellation",
  "vip"
 ],
 "ai_summary": "WHO: Diego Weber, C101150, $610.59 LTV, active subscriber, CA region. ISSUE: Asks to cancel subscription; he requested cancellation in chat CH51209 on 2026-03-31 (agent said it was done, CSAT 2) but subscription orders continued through 2026-05-02 (O16321), so the cancellation apparently never took effect. WANTS: Subscription fully cancelled and confirmed. CONTEXT: Left for a competitor over shipping speed; retention offer already declined in March \u2014 do not re-pitch. SUGGESTED ACTION: Cancel immediately per article 205, confirm in writing, verify no pending processed order, and check whether any post-March subscription charges should be refunded.",
 "customer_visible_message": "A human teammate has your full conversation and will confirm the cancellation right here."
}

---

## PASS — exchange_policy


**customer:** Can I exchange my Gentle Wash for the Silk Repair Mask instead?

**ai:** We don't offer exchanges — you'd return the Gentle Wash for a refund and place a new order for the Silk Repair Mask. Returns are accepted within 30 days of delivery, and the product needs to be at least half full. [source: Returns & refunds policy]

---

## PASS — promo_stacking


**customer:** If I subscribe, can I still use a promo code on top of the 15% discount?

**ai:** Yes — promo codes stack with the 15% subscription discount. Just one promo code per order, and codes can't be combined with each other.

[source: Promo codes, discounts & store credit]

---

## PASS — duplicate_charge


**customer:** I think I got charged twice for my last order?

**ai:** Usually that second charge is a temporary authorization hold, and your bank releases it within 2–3 business days. If both charges have actually posted as completed on your last order (O23156, Starter Ritual Kit, $112.53), we'll refund the duplicate within 24 hours. [source: Payments, charges & billing]

Want me to hand this to the team to check?

---

## PASS — nut_allergy


**customer:** I have a tree nut allergy — is the Velvet Body Butter okay for me?

**ai:** No — Velvet Body Butter (and Hand Repair) contain shea butter, which is tree nut derived, so avoid it with a tree nut allergy. Full ingredients are on each product page under "What's inside."

[source: Ingredients, allergens & sensitivities]

---

## PASS — collagen_vegan


**customer:** Are the Collagen Peptides vegan?

**ai:** They're not — Collagen Peptides are made from bovine collagen. All our other supplements are vegan.

[source: Ingredients, allergens & sensitivities]

---
