# Mandate: Devpost submission

Draft of the Devpost page and form answers for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). Items in _italics with brackets_ are filled at submission.

**Tagline**: Proof of what your agent was allowed to buy.

**Links**

- Demo: _[Render URL]_
- Video: _[YouTube URL]_
- Code: https://github.com/Chinorab/mandate (MIT)

---

## Inspiration

Shopping agents already pay on behalf of people, and nobody has settled who carries the cost when one of those purchases is disputed. Merchant Cost Consulting writes that there is still no concrete chargeback liability rule for agent purchases ([Oct 10, 2026](https://merchantcostconsulting.com/?p=9509)). Chargeflow explains that a disputed agent purchase generally follows card not present rules, so the merchant carries the loss unless it wins ([Jul 7, 2026](https://www.chargeflow.io/blog/ai-agent-chargeback-liability)), and its evidence playbook tells merchants to keep the customer's mandate for each agent order: what was authorized, the price cap, the merchants allowed, the expiry ([Jul 19, 2026](https://www.chargeflow.io/blog/agentic-commerce-chargebacks-the-evidence-playbook-merchants-need)). New York's financial regulator is asking the same question: "where does liability sit?" ([American Banker, Jun 26, 2026](https://www.americanbanker.com/payments/news/new-york-financial-regulator-zeroing-in-on-agentic-commerce)).

The missing piece is a record of intent that exists before the agent pays, is enforced when it pays, and can be shown when the payment is disputed. That is Mandate.

## What it does

**For the buyer**

- Write what the agent may buy in plain words. Claude turns it into structured terms: total budget, category, sizes and colors, allowed stores, expiry, number of orders. Edit, then sign.
- Signing fixes the terms with a SHA256 fingerprint of the canonical record and a timestamp. Link PayPal once (Vault), so the agent can pay without you present.
- The shopping agent searches three fictional stores and builds a cart. Before any PayPal call, the Mandate check compares the cart with every term, by code. A compliant cart is paid, with the mandate reference in the PayPal order's `custom_id`. A cart outside the mandate is blocked, each failed term is explained, and you can widen the mandate (new version, new signature), switch to a compliant product, or cancel.
- Revoke at any time; download a receipt with every signed version, check and order.

**For the merchant**

- An AG Grid view of agent orders with the mandate, fingerprint, check score and dispute state: search, filters, grouping, master detail, CSV and Excel export, and shipment tracking reported to PayPal through the Agent Toolkit.
- When a buyer opens a dispute, a verified PayPal webhook starts an evidence file built from stored records only, with a factual draft response. Every drafted sentence must rest on an included evidence item, and every number and identifier in it must appear in that item. The merchant includes or excludes items, edits, confirms accuracy, and only then submits to PayPal.

No sign up: each visitor gets a private demo session and can switch between buyer and merchant.

## How we built it

- **Next.js 16** (App Router, React 19, TypeScript strict), **Postgres** with Drizzle (PGlite locally), hosted on **Render** with Render Postgres.
- **PayPal**: Orders v2 (vault charge, `payee` per store, `custom_id`, `PayPal-Request-Id`), Vault v3, JS SDK v6, Webhooks with signature verification, Customer Disputes v1 (`provide-evidence`), and the **Agent Toolkit** for read and tracking actions.
- **Claude** (`claude-sonnet-5-5`, official Anthropic SDK): structured outputs for mandate drafting and dispute drafts, the SDK tool runner for the shopping agent, and a narrow judge for free text preferences.
- **AG Grid Enterprise** for the merchant view, themed from the design tokens.
- **The consent gate**: one function can make PayPal move money. It takes only ids, locks the mandate row, re reads everything, recomputes totals and the fingerprint, runs the check, pays with the check id as idempotency key, and checks again before any capture.
- **Spec driven**: a constitution, a spec, a plan, contracts and a task list (GitHub Spec Kit) came before the code, and tests came before each money path. A bypass suite tries to pay outside the mandate in every way we could think of.
- Design from a Claude Design canvas: one ink, no gradients, icons and labels for every state, 4px radius, Geist.

## Challenges we ran into

- **Letting an agent pay without letting it decide.** The model proposes; it never supplies an amount, a verdict or a term to the payment path. Money moving toolkit tools are not registered at all, and a static test fails if any file outside `lib/payments` reaches the PayPal transport.
- **Concurrency.** Two carts can race for the last allowed order, or a revocation can race a capture. Row locks on the mandate and a re check before capture make both impossible, and tests prove it.
- **A draft that cannot invent.** Free text is where a dispute response could overclaim. Sentences carry the evidence keys they rest on, and the server drops any sentence whose numbers or identifiers are not in those items.
- **Who owns the money owns the case.** Our first REST app belonged to a different business account than the store receiving the money through `payee`. Payments worked, but PayPal refused tracking on those sales, and disputes follow the same rule. We moved the app to the demo store's own account, which also meant the buyer had to save PayPal again: a saved PayPal belongs to the merchant whose app created it.
- **Errors that look like successes.** The Agent Toolkit returns PayPal errors as normal content. Our first sandbox run read a refused tracking call as done, so we taught the wrapper to raise them; the screen now says PayPal refused it. The toolkit's server SDK also needed a dependency it only lists for development, which we supplied with a pnpm package extension.
- **A real dispute is slow and stateful.** The buyer had to secure the sandbox account before an "unauthorized" report went through, the case appeared about ten minutes later, and our local tunnel expired overnight with the events in flight. Updating the webhook URL and asking PayPal to resend recovered them, signature intact.

## Accomplishments that we're proud of

- A payment path where "outside the mandate" is not a warning but an impossibility, with a test for each way around it.
- An amendment flow that never silently widens consent: a blocked cart can only proceed after a new, explicit signature and a new fingerprint.
- Dispute evidence that is ready within a minute of the PayPal event, built from records created at signing and payment time, not reconstructed afterwards.
- Every buyer and merchant journey tested on desktop and phone.

## What we learned

- A merchant initiated charge on a saved PayPal completes in one call, to any of three stores through `payee`, with the mandate reference kept on the order and the capture. The buyer approves once; the agent pays afterwards.
- `PayPal-Request-Id` makes retries safe: a replayed order or capture returns the stored result instead of charging twice.
- Ownership is the rule to design around: tracking, disputes and saved payment methods belong to the merchant that received the money or created the token.
- A dispute answered from our page reached PayPal as one seller evidence with the evidence report PDF and the response; the case moved to Under review. PayPal filed the evidence as OTHER, so the next step is to read the evidence types it requests before sending.
- Every finding is dated in [`scripts/LEARNINGS.md`](https://github.com/Chinorab/mandate/blob/main/scripts/LEARNINGS.md) and summarized in the README.

## What's next

- Map mandate terms to emerging agent payment standards so the same record can travel with a network token.
- Let merchants require a mandate reference before accepting agent orders.
- Dispute outcomes by mandate state, to measure whether signed intent changes results.

## Built with

Next.js, React, TypeScript, PostgreSQL, Drizzle ORM, PayPal Orders v2, PayPal Vault, PayPal JS SDK v6, PayPal Webhooks, PayPal Disputes API, PayPal Agent Toolkit, Anthropic Claude, AG Grid Enterprise, pdf-lib, Render, Vitest, Playwright.

---

## Form answers

**Submitter type**: Individual. **Country**: _[your country]_. **Canada province**: N/A. **Organization**: N/A.

**New or existing**: New. **What existed before**: N/A.

**How the project meets the main technology requirement**

PayPal: Orders v2 creates and charges agent orders against a vaulted PayPal account (`payment_source.paypal.vault_id` with `stored_credential`), each paid to the store's sandbox business account through `payee`, with the mandate reference in `custom_id` and the check id as `PayPal-Request-Id`. Vault v3 and the JS SDK v6 save the buyer's PayPal for agent payments; deleting the payment token revokes them. Webhooks (verified with `verify-webhook-signature`) bring `CUSTOMER.DISPUTE.*` events; the Disputes API `provide-evidence` receives the evidence report PDF, tracking and the merchant's response. The PayPal Agent Toolkit gives the agents read access (`get_order`, `list_disputes`, `get_dispute`) and reports shipments (`create_shipment_tracking`); its money moving tools are never exposed.

AI: Claude (`claude-sonnet-5-5`, Anthropic API) turns plain instructions into structured mandate terms, judges free text preferences during the check (failing closed), runs the shopping agent through the SDK tool runner with tools that can only pay through the consent gate, and drafts dispute responses that are grounded sentence by sentence in the evidence file. Every call is capped per session and globally.

**Sponsor tools**: AG Grid, Render.

**Repository**: https://github.com/Chinorab/mandate

**Demo URL**: _[Render URL]_

**Testing instructions**

1. Open the demo. No sign up: your session is private.
2. Buyer: **Create a Mandate**, use the example, review the terms, sign. Link PayPal with the sandbox buyer: _[sandbox buyer email]_ / _[password]_.
3. Ask the agent for running shoes. Pick a product that fits to see 7 of 7 terms pass and the payment go through; pick the volt yellow pair to see the payment blocked, then widen the mandate or switch.
4. **History**: revoke, download the receipt PDF.
5. **Merchant View**: the AG Grid of agent orders; expand a row; add tracking.
6. **Disputes**: you get your own dispute from the pool. Review the evidence, edit the response, confirm, submit. If the pool is empty, follow "Open a sandbox dispute" in the README.

**AG Grid experience**: _[your words]_

**Which AI tools have you leveraged while working on this project?**

Claude Code (Claude Opus) for implementation, tests and documentation, working from a spec driven process (constitution, spec, plan, tasks) with the consent gate and bypass tests written first. Claude Design for the design canvas the UI follows. Inside the product, Claude Sonnet through the Anthropic API, as described above.

**PayPal experience rating and feedback**: _[your rating and words, after the sandbox runs]_
