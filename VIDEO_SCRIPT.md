# Mandate: demo video script

Target length 2:40 (hard limit 2:45; Devpost asks for under 3:00). About 300 words of voice over at a calm pace. Recorded on the live demo in a desktop browser at 1440 by 900, with one phone shot. No music, no third party logos beyond the official PayPal button and sandbox pages, which show the real integration. Captions burned in from the voice over.

Before recording: a fresh session, the sandbox buyer logged out, one pool dispute free, the AG Grid license set (no watermark).

| Time | Screen | Voice over |
|---|---|---|
| 0:00 | Landing, slow scroll from the headline to the liability section, the source links visible. | Shopping agents can already pay for you. When one of those purchases is disputed, no rule says who pays, and the merchant usually carries the loss. Mandate fixes what your agent was allowed to buy, before it pays. |
| 0:16 | **Create a Mandate**. **Use the Example**: "Buy running shoes, size 10, under $120, neutral colors, this week only." The terms fill in. | I write what my agent may buy, in plain words. Claude turns it into terms: a total budget, the category, size and colors, the stores, an expiry, one order. |
| 0:30 | Change a color, then **Sign**. The fingerprint and timestamp appear. Link PayPal with the sandbox buyer (the PayPal window, then back). | I check them and sign. The mandate gets a SHA256 fingerprint. I link PayPal once, so the agent can pay later without me. |
| 0:44 | Agent chat: "Find me something that fits." Three proposals with fit labels: Fits mandate, Close to budget with tax, Color outside mandate. Pick Daily Miler. | The agent searches three stores. It can propose and build a cart, but it cannot move money. |
| 0:56 | Check page: 7 of 7 terms pass, totals, **Pay With Linked PayPal**. Paid, order number, the mandate reference shown. | Before PayPal is called, code checks the cart against every term. Seven of seven pass, so the payment goes through, and the PayPal order carries the mandate reference. |
| 1:10 | Back to chat, pick the volt yellow pair. Payment stopped: 2 of 7 terms fail, each explained. | Outside the mandate, nothing is paid. Here the total is over budget and the color is not one I allowed. |
| 1:22 | **Widen the mandate**: only the needed changes listed, approval box, new version 2 with a new fingerprint. Back out to **Switch** for contrast. | Only I can widen it, with a new signature and a new fingerprint. Or I keep my mandate and switch to a product that fits. |
| 1:34 | **History**: activity table, **Revoke**, receipt PDF opening. | I can revoke at any time, and download a receipt that anyone can verify. |
| 1:42 | **Merchant View**: AG Grid of agent orders, group by mandate state, expand a row: terms, fingerprint, the check table. Add UPS tracking. | Now the merchant. Every agent order shows the mandate behind it and the check that let it through. Tracking goes to PayPal through the Agent Toolkit. |
| 1:58 | Sandbox: the buyer reports a problem on the order. Cut to **Disputes**: the case, the timeline, the evidence file. | A buyer disputes the order. PayPal's webhook, verified with PayPal, starts an evidence file built from what was stored at signing and payment time. |
| 2:12 | Response draft. Hover a sentence, untick Shipment tracking, the sentence disappears. Confirm accuracy, **Submit Evidence**. Submitted, PayPal under review. | Claude drafts the response, but every sentence must rest on an included record, and every number must come from it. I review, confirm it is accurate, and only then it goes to PayPal. |
| 2:28 | Phone: the same check page and the dispute page on a phone. Then the landing headline. | Signed before. Enforced at payment. Evidence when it matters. Mandate: proof of what your agent was allowed to buy. |
| 2:40 | End card: demo URL, repository URL. | (silence) |

## Shot notes

- Keep the cursor still while the voice over names a number on screen, so viewers can read it.
- The sandbox dispute shot (1:58) can be recorded separately and cut in; if PayPal places the case under review first, run `pnpm pool:sync --apply` before recording the dispute page.
- Never show `.env.local`, the PayPal developer dashboard credentials, or the sandbox buyer password on screen.
- Final check before upload: length under 2:45, captions match the voice over, YouTube visibility public, link added to Devpost.
