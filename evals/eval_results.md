# Escalation eval results

## PASS — angry_vip_first_message


**customer:** My Starter Ritual Kit order still hasn't arrived and tracking hasn't moved in over a week. Every single order has some issue. I'm getting really sick of this.

**ESCALATED:** {
 "subject": "Stalled tracking on Starter Ritual Kit O26130 \u2014 repeat issue, angry VIP subscriber",
 "priority": "urgent",
 "tags": [
  "shipping",
  "angry-customer",
  "vip",
  "subscription"
 ],
 "ai_summary": "WHO: Liam Mora, C102938, $746.04 LTV, active subscriber, region FR. ISSUE: Starter Ritual Kit order O26130 (placed 2026-05-12, subscription) hasn't arrived and tracking hasn't moved in over a week. WANTS: His order located and delivered, without another multi-day wait. CONTEXT: Prior chat CH53031 (2025-12-04) on the exact same stalled-tracking problem was left unresolved with CSAT 1 after being told to wait 3-5 business days; he says every order has an issue. SUGGESTED ACTION: Open a carrier investigation now per article 201 (tracking stalled 5+ business days), give Liam a direct owner and a concrete update time, and consider replacement or refund goodwill given the repeat failure.",
 "customer_visible_message": "A week of no tracking movement on your Kit is not okay, and I can see the same thing went unresolved for you last December. I'm handing this straight to our team now so someone chases the carrier and sorts it properly."
}

---

## PASS — mild_delay_no_escalation


**customer:** Hey, my last order seems a bit delayed — any idea what's going on?

**ai:** That would be O26130, your Starter Ritual Kit from 2026-05-12. Shipping to France runs 7-14 business days, and your tracking link goes out by email at shipment — the widget can't show live tracking.

Given how long it's been, that's well past the point where we'd chase the carrier. Want me to hand it to the team to investigate?

[source: Shipping times & costs]

---

## PASS — mild_delay_then_consent


**customer:** Hey, my last order seems a bit delayed — any idea what's going on?

**ai:** Your most recent order is O26130, the Starter Ritual Kit, placed 2026-05-12. That's well past the 7-14 business days for France, so something's clearly off there.

Tracking links go out by email at shipment, and the widget can't show live tracking. Want me to hand this to our team to chase with the carrier?

[source: Shipping times & costs]

**customer:** Yes please, that would be great.

**ESCALATED:** {
 "subject": "Order O26130 (FR) far past delivery window \u2014 carrier investigation (VIP subscriber)",
 "priority": "high",
 "tags": [
  "shipping",
  "vip",
  "subscription"
 ],
 "ai_summary": "WHO: Liam Mora, C102938, $746.04 LTV, active subscriber, region FR. ISSUE: Latest order O26130 (Starter Ritual Kit, $52.60, placed 2026-05-12) appears undelivered/delayed, far beyond the 7-14 business day international window. WANTS: Someone to find out where the order is and resolve it. CONTEXT: Also has O26138 (Renew Serum) same date; prior support chat CH53031 about a stalled delivery was left unresolved with CSAT 1. SUGGESTED ACTION: Check carrier tracking for O26130, investigate with carrier per shipping policy, and proactively offer replacement or refund given the age of the delay and prior bad experience.",
 "customer_visible_message": "An order from May still not landing isn't okay, and I can see a similar delivery issue never got resolved for you last time. I'm connecting you with our team now so they can chase the carrier and make it right."
}

---

## PASS — mild_then_furious


**customer:** Hey, my last order seems a bit delayed — any idea what's going on?

**ai:** Your most recent order is O26130, the Starter Ritual Kit from 2026-05-12. Tracking links go out by email at shipment, and I can't see live tracking here.

For France, orders take 7-14 business days. If tracking hasn't updated in 5+ business days, we'll chase the carrier. Want me to hand this to the team?

[source: Shipping times & costs]

**customer:** A week late and no update?? This is the third time in a row. Fix it or I'm cancelling everything.

**ESCALATED:** {
 "subject": "Delayed order O26130 \u2014 repeat issue, VIP subscriber threatening cancellation",
 "priority": "urgent",
 "tags": [
  "shipping",
  "angry-customer",
  "vip",
  "subscription"
 ],
 "ai_summary": "WHO: Liam Mora, C102938, $746.04 LTV, active subscriber, France. ISSUE: Latest order O26130 (Starter Ritual Kit, 2026-05-12) is delayed with no tracking movement, reportedly about a week past expected; he says it's the third delayed order in a row. WANTS: The order located/fixed fast, or he will cancel his subscription. CONTEXT: Prior chat CH53031 (Dec 2025) on the same stalled-tracking issue was left unresolved with CSAT 1. SUGGESTED ACTION: Open a carrier investigation now per shipping policy (tracking stalled 5+ business days), contact Liam directly with a concrete update, and consider replacement/refund goodwill to retain a VIP subscriber.",
 "customer_visible_message": "A week with no movement, on top of the last time this happened and never got sorted, is genuinely not okay. I'm connecting you with our team right now so they can chase the carrier and make this right."
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
 "ai_summary": "WHO: Quinn Xu, C102391, $741.64 LTV, active subscriber, region DE. ISSUE: Asked to speak with a human right away; no specific problem stated yet. WANTS: not stated yet. CONTEXT: Latest order O23156, Starter Ritual Kit, placed 2026-07-26 (subscription order); prior support chat CSAT 5. SUGGESTED ACTION: Greet Quinn, ask what they need help with, and handle per relevant policy (returns/subscription/shipping as applicable).",
 "customer_visible_message": "Of course, Quinn. I'm connecting you with our team now so someone can help you directly."
}

---

## PASS — damaged_item


**customer:** My Gift Set just arrived and the jar inside is shattered — product all over the box.

**ai:** I'm sorry, that's a mess. For damaged items we'll ship a free replacement or refund you, your choice, and you don't need to send anything back. Just a photo of the item and packaging.

Let me get our team on it now.

**ESCALATED:** {
 "subject": "Shattered jar in Gift Set order O16315 \u2014 replacement or refund (VIP)",
 "priority": "high",
 "tags": [
  "damaged",
  "vip",
  "refund"
 ],
 "ai_summary": "WHO: Diego Weber, C101150, $610.59 LTV, subscriber, CA. ISSUE: Gift Set (order O16315, placed 2026-05-07) arrived with the jar shattered and product spilled through the box. WANTS: Replacement or refund, not yet stated which. CONTEXT: VIP subscriber with a prior unresolved chat (CH51209, CSAT 2) about subscription cancellation. SUGGESTED ACTION: Request photo of item and packaging per article 203, then ship free replacement or issue full refund at his choice; no return needed.",
 "customer_visible_message": "A shattered jar and product everywhere is not what should have shown up at your door. I'm connecting you with our team so they can sort the replacement or refund right away."
}

---

## PASS — faq_return_window


**customer:** What's your return window?

**ai:** 30 days from delivery, refunded to your original payment method. Products need to be at least half full, and Final Sale items and gift cards can't be returned.

[source: Returns & refunds policy]

---

## PASS — trap_ship_japan


**customer:** Do you ship to Japan?

**ai:** No, unfortunately not. We currently ship internationally to the UK, Canada, Australia, Germany, and France only.

[source: Shipping times & costs]

---

## PASS — trap_pregnancy


**customer:** Is the Renew Serum safe to use while pregnant?

**ai:** We don't have guidance on Renew Serum during pregnancy in our help center, so I don't want to guess on something that matters. Want me to pass it to our team for a proper answer?

---

## PASS — discount_beg_then_insist


**customer:** Can you give me a discount code? Come on, just this once :)

**ai:** I don't have codes to hand out here, but our newsletter gets first word on our quarterly sitewide sale, and any code you use does stack with your 15% subscriber discount.

[source: Promo codes, discounts & store credit]

**customer:** Seriously, I've spent a fortune with you — make an exception for me.

**ESCALATED:** {
 "subject": "VIP subscriber requesting one-off discount code exception",
 "priority": "normal",
 "tags": [
  "off-policy",
  "vip",
  "billing"
 ],
 "ai_summary": "WHO: Quinn Xu, C102391, $741.64 LTV, active subscriber, DE. ISSUE: Asked for a discount code; told codes aren't issued in chat and that promo codes stack with the 15% subscriber discount, with sales announced via newsletter. WANTS: A one-off exception discount code based on high spend. CONTEXT: 10 orders since May 2026, latest O23156 Starter Ritual Kit 2026-07-26; prior support chat CSAT 5. SUGGESTED ACTION: Decide whether to grant a goodwill code for this VIP; per article 209 codes can't be applied retroactively but do stack with the subscription discount.",
 "customer_visible_message": "You've been a great customer, and a request like that deserves a real person's yes or no. I'm connecting you with our team now."
}

---

## PASS — order_lookup_brand_new


**customer:** Where's my order?

**ai:** Your most recent order is O30412, the Renew Serum, placed 24 June. That's well past the 7-14 business day window for AU orders, so it should have arrived long ago.

I can't see live tracking here, but your tracking link went to your email at shipment. Want me to have the team look into it?

---

## PASS — cancel_selfserve_then_yes


**customer:** How do I cancel my subscription?

**ai:** I can see you asked this back in March and it wasn't handled properly, sorry about that. I won't send you hunting through your account again, I can have our team cancel it directly for you.

Want me to pass it over now?

**customer:** Just have your team cancel it for me please.

**ESCALATED:** {
 "subject": "Cancel subscription \u2014 repeat request after failed March chat (VIP)",
 "priority": "urgent",
 "tags": [
  "subscription",
  "cancellation",
  "vip"
 ],
 "ai_summary": "WHO: Diego Weber, C101150, $610.59 LTV, active subscriber, CA. ISSUE: Asked how to cancel his subscription; a prior chat (CH51209, 2026-03-31) told him it was cancelled but he is still showing as a subscriber, so that request was never completed (CSAT 2). WANTS: Subscription cancelled outright, no retention offers. CONTEXT: Last order O16315, Gift Set, 2026-05-07; multiple subscription orders on file. SUGGESTED ACTION: Cancel immediately per article 205 (effective immediately, no fee; any order already processed still ships), confirm by email, and do not pitch offers, he declined them last time.",
 "customer_visible_message": "You already asked for this once and it clearly didn't stick, which isn't okay. I'm connecting you with our team now so they can cancel it and confirm it for real."
}

---

## PASS — exchange_policy


**customer:** Can I exchange my Gentle Wash for the Silk Repair Mask instead?

**ai:** We don't do exchanges, so you'd return the Gentle Wash for a refund and place a new order for the mask. Returns are within 30 days of delivery, bottle at least half full.

If you meant swapping the product on your subscription going forward, you can do that anytime in Account → Subscription → Manage, as long as it's 48+ hours before your next shipment.

[source: Returns & refunds policy]

---

## PASS — promo_stacking


**customer:** If I subscribe, can I still use a promo code on top of the 15% discount?

**ai:** Yes, promo codes stack with the 15% subscription discount. Just one promo code per order, and codes can't be combined with each other.

[source: Promo codes, discounts & store credit]

---

## PASS — duplicate_charge


**customer:** I think I got charged twice for my last order?

**ai:** Usually that second charge is a temporary authorization hold, and banks release those in 2-3 business days. If both show as completed, we'll refund the duplicate within 24 hours.

Can you check whether both have actually posted on your Starter Ritual Kit order (O23156)? If yes, I'll hand it to our team right away.

[source: Payments, charges & billing]

---

## PASS — nut_allergy


**customer:** I have a tree nut allergy — is the Velvet Body Butter okay for me?

**ai:** No, skip that one. Velvet Body Butter (and Hand Repair) contain shea butter, which is tree nut derived.

[source: Ingredients, allergens & sensitivities]

---

## PASS — collagen_vegan


**customer:** Are the Collagen Peptides vegan?

**ai:** No, Collagen Peptides are sourced from bovine collagen, so they're not vegan. All our other supplements are.

[source: Ingredients, allergens & sensitivities]

---
