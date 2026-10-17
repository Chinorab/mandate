# Feature Specification: Agent Purchase Mandates

**Feature Branch**: `001-agent-purchase-mandates`

**Created**: 2026-10-17

**Status**: Draft

**Input**: User description: "Mandate: signed purchase mandates for shopping agents, a deterministic consent gate before every PayPal payment, and merchant dispute evidence built from the signed record. Buyer: natural language to structured mandate (budget, currency, category, required/forbidden attributes, allowed merchants, expiry, max purchases), explicit signature, SHA-256 hash of canonical content + timestamp; shopping agent searches 3 fictional store catalogs, builds a cart, deterministic Mandate check (price, category, attributes, merchant, expiry, count; model only for semantic fit); pass -> PayPal Orders v2 sandbox with official JS SDK button, mandate ID + hash attached to the order; fail -> block, explain violated terms, offer amend (new signature) or cancel; revoke anytime; history + receipt. Merchant: AG Grid dashboard of agent orders (custom cells, grouping, export, mandate and dispute status); verified PayPal dispute webhooks trigger an evidence file (signed mandate, hash, timestamps, check result, order detail, tracking) and a factual draft response; merchant reviews, edits, confirms, then evidence goes to PayPal Disputes API. Decisions: no accounts (cookie demo session, buyer and merchant views), 3 stores each paid to its own sandbox business account, dispute flow = real sandbox dispute documented + one pre-seeded real dispute, landing with sourced context, privacy page, favicon. Design source: design/project canvas."

## Context

Shopping agents already buy on behalf of consumers, but no liability rule exists yet for disputes on
those purchases: the merchant pays by default, and the gap between "authorized" and "intended" cannot
be proven. Sources: [Merchant Cost Consulting, Oct 10 2026](https://merchantcostconsulting.com/?p=9509),
[Chargeflow, AI agent chargeback liability](https://www.chargeflow.io/blog/ai-agent-chargeback-liability),
[Chargeflow, evidence playbook](https://www.chargeflow.io/blog/agentic-commerce-chargebacks-the-evidence-playbook-merchants-need),
[American Banker, Jun 26 2026](https://www.americanbanker.com/payments/news/new-york-financial-regulator-zeroing-in-on-agentic-commerce).

Mandate turns the buyer's intent into a signed, fingerprinted record, refuses any payment outside it,
and hands the merchant that record as dispute evidence.

**Actors**

- **Buyer**: a person who delegates a purchase to a shopping agent.
- **Shopping agent**: acts for the buyer inside one mandate; can search, propose and fill a cart, but
  cannot pay outside the mandate.
- **Merchant**: operator of Sample Sports Outlet, one of three fictional demo stores, who sees agent
  orders and answers disputes.
- **Merchant agent**: assembles the evidence file and drafts the dispute response for the merchant.
- **Judge / visitor**: anyone testing the hosted demo, who can switch between buyer and merchant views.

## Clarifications

### Session 2026-10-17

- Q: Who approves each payment: the buyer in PayPal every time, or the agent alone once PayPal is linked to the mandate? → A: The agent pays alone. At signing the buyer links PayPal once through the official button (saved payment method); afterwards the agent pays server side, only through the Mandate check. Fallback if saved payments do not work in sandbox: buyer approves each payment.
- Q: Is the mandate budget a limit per order, or a total for all purchases under the mandate? → A: A total for the whole mandate, tax and shipping included; each order must fit in the remaining budget.
- Q: With many judges sharing the demo, how should the ready made dispute work? → A: A pool of about 10 real sandbox disputes on real mandate orders, opened at the start of judging and refreshed once mid judging; each demo session claims one free dispute; when the pool is empty, a submitted one is shown read only and the README explains how to open a new one.
- Q: How hard should model usage be capped per visitor? → A: About 40 model calls per demo session per day plus a global daily ceiling; when reached, a plain message appears and rule based checks and payments keep working.
- Q: What does a new visitor see in the buyer view before doing anything? → A: An empty history with one action that prefills the running shoes example; no sample records appear as the visitor's own activity.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign a mandate from plain words (Priority: P1)

The buyer writes what the agent may buy ("running shoes, size 10, under $120, neutral colors, this week
only"). The system turns it into a list of explicit terms: budget, currency, category, required
attributes, forbidden attributes, allowed merchants, expiry, maximum number of purchases. Every
assumption the system made (size system, what "this week" means, what "neutral" covers) is flagged next
to its term. The buyer edits any term, then signs. Signing freezes the terms, records the time, and
produces a fingerprint of the exact signed content.

**Why this priority**: nothing else exists without a signed mandate; it is the record every later step
relies on.

**Independent Test**: create a mandate from a sentence, edit one term, sign, then confirm the mandate
shows as active with a signature time and a fingerprint, and that the same terms always give the same
fingerprint.

**Acceptance Scenarios**:

1. **Given** a new demo session, **When** the buyer submits instructions that include a budget, an item
   and a time limit, **Then** a draft shows each term separately, in under 10 seconds, with flagged
   assumptions and status "Awaiting your signature".
2. **Given** a draft, **When** the buyer changes a term, signs, and links PayPal through the official
   button, **Then** the mandate becomes active
   with the edited value, a signature timestamp, and a fingerprint; the terms can no longer be edited in
   place.
3. **Given** instructions with no budget or no item, **When** submitted, **Then** the draft cannot be
   signed until the missing term is filled in, and the missing term is named.
4. **Given** a signed mandate, **When** anyone recomputes the fingerprint from the stored terms, **Then**
   it matches the fingerprint recorded at signature.

---

### User Story 2 - Compliant purchase through PayPal (Priority: P1)

Inside an active mandate, the buyer asks the shopping agent to find something. The agent searches the
three fictional store catalogs, shows the closest matches with a fit label per item ("Fits mandate",
"Color outside mandate", "Close to budget with tax"), and recommends one. When the buyer agrees, the
agent fills the cart and runs the Mandate check: every term is checked and the result is shown term by
term (what the mandate allows, what the cart contains, pass or fail). Only when every term passes does
the agent pay, by itself, with the PayPal account the buyer linked to the mandate at signing. The payment
is captured, and the order carries the mandate identifier and fingerprint so the merchant can find them.
The buyer is not asked to approve again: the signed mandate is the approval.

**Why this priority**: this is the core demo moment and the PayPal integration the jury scores.

**Independent Test**: with a seeded active mandate, ask the agent for a matching item, confirm the
check shows all terms passing, pay with the sandbox buyer, and confirm the merchant side order shows the
mandate identifier and fingerprint.

**Acceptance Scenarios**:

1. **Given** an active mandate, **When** the agent proposes items, **Then** each proposal shows store,
   price including shipping, and a fit label, and items that break a term are labeled as such.
2. **Given** a cart that passes every term, **When** the check runs, **Then** the buyer sees "N of N
   terms pass" and the order total against the budget, and the agent proceeds to payment.
3. **Given** a passing check, **When** the agent pays with the linked PayPal account and payment
   completes, **Then** the purchase is recorded
   as "Compliant, paid", the mandate's remaining purchases and remaining budget update, and the payment
   at PayPal carries the mandate identifier and fingerprint.
4. **Given** the cart is from Example Running Co. or Demo Shoe Supply, **When** paid, **Then** the money
   goes to that store's own sandbox business account, not to another store.

---

### User Story 3 - Blocked purchase, amend or cancel (Priority: P1)

The agent fills a cart that breaks the mandate (over budget once tax is added, a forbidden color). The
check blocks it before any payment, names each failed term in plain words ("Cart total is $127.74. Your
limit is $120.00, so it is $7.74 over."), and offers exactly three ways forward: widen the mandate with
only the changes needed (a new explicit approval and a new fingerprint), switch to a compliant
alternative if one exists, or cancel. No payment is ever started for a blocked cart.

**Why this priority**: the block is the proof that the consent gate is real; it is the product's thesis.

**Independent Test**: push a non compliant cart, confirm no payment can be started from the interface
or by calling the system directly, then amend, re-sign and confirm the same cart now passes.

**Acceptance Scenarios**:

1. **Given** a cart over budget, **When** the check runs, **Then** payment is blocked, the failed term
   names both values and the difference, and the passing terms are summarized.
2. **Given** a blocked cart, **When** the buyer approves the proposed changes, **Then** a new mandate
   version is created with a new signature time and fingerprint, linked to the previous version, and
   only the listed terms differ.
3. **Given** a blocked cart, **When** anything attempts to start a payment for it without a new
   approval (interface, direct request, agent tool), **Then** the attempt is refused and logged.
4. **Given** a blocked cart, **When** the buyer cancels, **Then** the cart is discarded, recorded as
   "Blocked, not paid", and the mandate is unchanged.

---

### User Story 4 - Revoke, history and receipt (Priority: P2)

The buyer sees every mandate with its status (active, expired, revoked, purchase in dispute), what was
spent against it, and every attached activity (paid orders and blocked carts with their check results).
The buyer can revoke an active mandate at any time; the agent stops immediately. The buyer can download
a receipt that lists the original instructions, signed terms, signature time, fingerprint and orders.

**Why this priority**: revocation is a promise made on the signing screen; history and receipt make the
record useful to the buyer.

**Independent Test**: revoke an active mandate with a passing cart pending, confirm payment is no longer
possible, and download the receipt.

**Acceptance Scenarios**:

1. **Given** an active mandate, **When** the buyer revokes it and confirms, **Then** its status becomes
   revoked with a timestamp, and any cart or unpaid order under it can no longer be paid.
2. **Given** a mandate past its expiry, **When** a check runs, **Then** it fails on the expiry term even
   if every other term passes.
3. **Given** any mandate, **When** the buyer downloads the receipt, **Then** it contains instructions,
   terms, signature time, fingerprint, versions and the list of attached orders and blocks.

---

### User Story 5 - Merchant view of agent orders (Priority: P2)

The merchant of Sample Sports Outlet sees a dense table of orders placed by shopping agents: order,
placed time, item, masked buyer, amount, mandate identifier, check result, order status, dispute status,
PayPal reference. The merchant can search, filter by status and mandate state, sort, group (by status,
by mandate state, by day), expand a row to see the mandate terms and check result, export the current
view, and record shipment tracking for an order.

**Why this priority**: the merchant is who pays when agent purchases are disputed; this view is where the
mandate becomes useful to them, and it is the sponsor grid showcase.

**Independent Test**: after a compliant purchase at Sample Sports Outlet, open the merchant view and find
the order by mandate identifier, filter to it, group by status, export the view.

**Acceptance Scenarios**:

1. **Given** agent orders exist, **When** the merchant opens the orders view, **Then** each row shows
   mandate identifier, check result and dispute status with an icon and a label.
2. **Given** filters are applied, **When** the merchant exports, **Then** the file contains exactly the
   visible rows and columns.
3. **Given** an order is shipped, **When** the merchant enters a carrier and tracking number, **Then** it is
   saved on the order and reported to PayPal.

---

### User Story 6 - Dispute answered with the mandate (Priority: P2)

When a buyer opens a dispute in PayPal on an agent order, the merchant is notified through a verified
PayPal event. The merchant agent assembles an evidence file from stored records only: signed mandate
and fingerprint, signature and check timestamps, the term by term check result, the order detail, and
shipment tracking if present. It drafts a factual response that cites only those records and states
missing items as missing. The merchant reviews, unticks or edits anything, confirms a statement of
accuracy, and only then submits. Submission sends the evidence to PayPal and records the outcome.

**Why this priority**: closes the loop from consent to liability; it is the merchant's reason to adopt.

**Independent Test**: from a fresh demo session, claim a dispute from the pool, review the evidence file,
edit the draft, submit, and confirm PayPal accepted the evidence.

**Acceptance Scenarios**:

1. **Given** a PayPal dispute event with a valid signature, **When** it arrives, **Then** the matching
   order shows "In dispute" and an evidence file and draft response exist within 1 minute.
2. **Given** an event whose signature cannot be verified, **When** it arrives, **Then** it is rejected
   and nothing changes.
3. **Given** a draft response, **When** the merchant has not confirmed the accuracy statement, **Then**
   submission is not possible.
4. **Given** the merchant submits, **When** PayPal accepts, **Then** the dispute shows the evidence as
   submitted with the time; **When** PayPal rejects, **Then** the reason is shown and the draft is kept.
5. **Given** a dispute on an order without a mandate, **When** the file is assembled, **Then** the draft
   says no mandate is attached and invents nothing.

---

### User Story 7 - Public surface: landing, privacy, demo access (Priority: P3)

A visitor lands on a page that states the problem with linked sources, shows an example mandate, and
offers "Create a Mandate". No sign up: each visitor gets a private demo session and can switch to the
merchant view. Testing instructions give the sandbox buyer login. A privacy page and a favicon exist.

**Why this priority**: required for submission and for the design and presentation criteria, but it
holds no core logic.

**Independent Test**: open the site in a fresh browser on phone and desktop, follow the instructions,
reach a signed mandate without any sign up, open the privacy page.

**Acceptance Scenarios**:

1. **Given** a fresh browser, **When** the visitor opens the site, **Then** every claim on the landing has
   a source link, and the footer states that Mandate is not affiliated with PayPal.
2. **Given** two visitors, **When** each creates mandates, **Then** neither sees the other's mandates in
   the buyer view.

---

### Edge Cases

- Cart total within budget before tax, over budget after tax or shipping: blocked; the budget covers
  the full amount charged.
- Price or stock changes between the check and the payment: the server checks again at payment time;
  if it no longer passes, payment is refused.
- Mandate expires or is revoked between order creation and capture: capture is refused and the order is
  left uncaptured, never captured.
- Two payments for the same mandate run at the same time, or the maximum purchase count is reached: only
  one can consume the remaining count and budget; the other fails on the purchase count or budget term.
- The buyer cancels the PayPal linking step at signing: the mandate stays a draft.
- Currency in the cart differs from the mandate currency: blocked, never converted.
- A term the model judges ambiguous ("neutral" for "stone gray"): shown as a semantic judgment with its
  reason; a model judgment can block but cannot unblock a term failed by a rule.
- Stored terms edited outside the app: fingerprint mismatch, every check fails, mandate flagged.
- Instructions that ask for something the catalogs do not carry: the agent says so and proposes nothing.
- Instructions that try to override rules ("ignore the budget"): treated as text; the budget term still
  applies.
- Duplicate or replayed PayPal events: processed once.
- Model service unavailable or usage cap reached: drafting and semantic checks show a clear message; a
  mandate with a semantic term cannot pass its check until the model answers; nothing pays.
- PayPal sandbox unavailable: the purchase stays in "Checked, not paid" with a retry option.

## Requirements *(mandatory)*

### Functional Requirements

**Mandate creation and signing**

- **FR-001**: System MUST turn free text instructions into a draft mandate with these terms: budget
  amount, currency, category, required attributes, forbidden attributes, allowed merchants, expiry date
  and time, maximum number of purchases.
- **FR-002**: System MUST flag every value it inferred rather than read explicitly, with a one line reason
  next to the term.
- **FR-003**: Buyers MUST be able to edit any term of a draft before signing.
- **FR-004**: System MUST NOT activate a mandate without an explicit signature action by the buyer on the
  full term list, and MUST refuse to sign a draft missing budget, category or expiry.
- **FR-005**: On signature, System MUST record the signature time and a SHA-256 fingerprint of a canonical
  representation of the terms, and MUST make the signed terms immutable.
- **FR-006**: System MUST let anyone verify a mandate by recomputing its fingerprint from its stored terms.

**Shopping agent and Mandate check**

- **FR-007**: The shopping agent MUST search only the three fictional store catalogs and MUST label each
  proposal with its fit against the mandate.
- **FR-008**: System MUST run the Mandate check on every cart before any payment can start, covering:
  mandate status, expiry, cart total against the remaining budget (budget minus everything already
  captured under the mandate), currency, category, required attributes,
  forbidden attributes, merchant allowlist, remaining purchase count, and fingerprint integrity.
- **FR-009**: All numeric, date, count, currency and merchant checks MUST be decided by fixed rules;
  semantic fit (for example color families) MAY be judged by the model, MUST show its reason, and MAY
  only add a failure.
- **FR-010**: System MUST compute the cart total itself from catalog prices, shipping and tax; totals
  supplied by the browser or the model MUST be ignored.
- **FR-011**: System MUST show the check result term by term: allowed value, cart value, pass or fail,
  and a plain explanation for each failure.
- **FR-012**: System MUST re-run the check at order creation and again before capture, and refuse either
  step on failure.
- **FR-013**: Every agent tool or system operation able to create, approve or capture a payment MUST go
  through the Mandate check; no operation able to move money may be reachable without it.

**Payment**

- **FR-014**: Payment MUST use PayPal in sandbox mode. The buyer links PayPal to the mandate once, at
  signing, through the official PayPal button; the agent then pays with that saved method without a new
  buyer approval, and only after a passing check. A mandate cannot become active until PayPal is linked.
  If saved payments prove unavailable in sandbox, the official button is shown for buyer approval after
  each passing check instead.
- **FR-014b**: Revoking or expiring a mandate MUST make its saved PayPal method unusable by the agent;
  revocation also removes the saved method at PayPal.
- **FR-015**: Each PayPal order MUST carry the mandate identifier and fingerprint in a field visible to the
  merchant at PayPal and retrievable by the system.
- **FR-016**: Each store MUST be paid into its own sandbox business account.
- **FR-017**: After capture, System MUST record the order, its PayPal references, its check result, and
  decrement the mandate's remaining purchases and remaining budget.

**Block, amend, cancel, revoke**

- **FR-018**: On a failed check, System MUST block payment, start no payment, name every failed term,
  and offer: amend, switch to a compliant alternative when one exists, or cancel.
- **FR-019**: An amendment MUST list only the changed terms, require a new explicit approval, and create a
  new mandate version with its own signature time and fingerprint, linked to the previous version.
- **FR-020**: Buyers MUST be able to revoke an active mandate at any time with one confirmation; revocation
  MUST take effect for every later check, order creation and capture.
- **FR-021**: System MUST record blocked carts with their check results as activity on the mandate.

**History and receipt**

- **FR-022**: Buyers MUST see all their mandates with status (draft, awaiting PayPal link, active, expired, revoked, purchase
  in dispute), spent amount, versions and attached activity.
- **FR-023**: Buyers MUST be able to download a receipt for any mandate containing instructions, terms,
  versions, signature times, fingerprints and attached orders and blocks.

**Merchant**

- **FR-024**: Merchants MUST see agent orders for Sample Sports Outlet in a table with search, filtering,
  sorting, grouping, row detail, export of the current view, and custom cells for mandate, check and
  dispute status.
- **FR-025**: Buyer identity MUST be masked in the merchant view to what the merchant would see at PayPal.
- **FR-026**: Merchants MUST be able to record a carrier and tracking number for an order, saved on the
  order and reported to PayPal.

**Disputes**

- **FR-027**: System MUST accept PayPal dispute events only after verifying their signature, and MUST
  process each event once.
- **FR-028**: On a new dispute, System MUST assemble an evidence file from stored records only: signed
  mandate, fingerprint, timestamps, check result, order detail, tracking if present.
- **FR-029**: System MUST draft a factual response that references only items in the evidence file and
  states missing items as missing.
- **FR-030**: Merchants MUST be able to include or exclude each evidence item and edit the response.
- **FR-031**: System MUST NOT submit evidence to PayPal until the merchant confirms an accuracy statement
  and presses submit; it MUST record the submission time and PayPal's answer.
- **FR-032**: The demo MUST hold a pool of real sandbox disputes on real mandate orders. A demo session
  that opens the merchant view claims one unclaimed dispute and is the only session able to submit
  evidence for it; other sessions see it read only. When the pool is empty, the merchant view shows a
  submitted dispute read only with a link to the README steps for opening a new one. An operator procedure
  refills the pool (about 10 disputes at the start of judging, refreshed once before response deadlines
  lapse).

**Demo access and public pages**

- **FR-033**: Each visitor MUST get a private demo session without sign up; buyer data is visible only to
  that session.
- **FR-034**: Visitors MUST be able to switch between buyer and merchant views.
- **FR-034b**: A new demo session MUST start with an empty buyer history and offer one action that
  prefills the example instructions; no record is ever shown as the visitor's own unless the visitor
  created it.
- **FR-035**: The site MUST have a landing page with sourced context, a privacy page and a favicon, and
  MUST state non affiliation with PayPal.
- **FR-036**: Secrets MUST never reach the browser; only the public PayPal client identifier may.
- **FR-037**: Model usage MUST be capped at about 40 calls per demo session per day and by a global daily
  ceiling; when a cap is reached the visitor sees a plain message, and rule based checks still run. A
  capped semantic check counts as not passed, so it can never let a cart through.

### Key Entities

- **Demo session**: an anonymous visitor identity; owns mandates, carts and buyer side orders.
- **Mandate**: the buyer's delegation; identifier (for example MDT4K7Q21), original instructions, status,
  current version.
- **Mandate version**: frozen terms (budget, currency, category, required and forbidden attributes,
  allowed merchants, expiry, maximum purchases), flagged assumptions, signature time, fingerprint,
  previous version link.
- **Store**: one of three fictional stores, with its catalog and its own payee account.
- **Product**: catalog item with category, attributes (size, colors), price, shipping, tax rate, stock.
- **Cart**: items from one store proposed by the agent under one mandate version.
- **Check result**: per term outcome (rule or semantic, allowed value, cart value, pass or fail,
  explanation), overall verdict, time, mandate version and fingerprint used.
- **Order**: a paid or pending purchase, linked to cart, check result, mandate version, PayPal references,
  status, tracking.
- **Dispute**: PayPal case linked to an order; reason, amount, dates, status, response deadline, pool
  membership and the demo session that claimed it.
- **Evidence file**: included items, draft response, edited response, accuracy confirmation,
  submission time and PayPal answer.
- **Event log**: verified PayPal events received, with processing status (for idempotency and audit).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first time visitor reaches a signed mandate in under 2 minutes without help.
- **SC-002**: A compliant purchase, from first agent message to captured payment, completes in under 3
  minutes in the hosted demo.
- **SC-003**: 100% of attempts to pay a non compliant, revoked, expired or tampered mandate are refused,
  across every entry point, as shown by dedicated bypass tests.
- **SC-004**: 100% of PayPal orders created by the demo carry a mandate identifier and fingerprint
  retrievable at PayPal.
- **SC-005**: For every failed check, the buyer can name the failed term and the gap from the screen alone
  (validated in walkthroughs).
- **SC-006**: A dispute evidence file and draft are ready within 1 minute of the dispute event, and 0
  statements in the draft lack a matching evidence item.
- **SC-007**: Every buyer and merchant journey works on a phone sized screen and on desktop.
- **SC-008**: The hosted demo stays available and testable end to end until 2026-12-15.

## Assumptions

- Currency is USD only; all stores and the sandbox buyer are US based. Amounts are stored to the cent.
- The budget is the maximum total charged across all purchases under the mandate, tax and shipping
  included; the design's "per order" wording is changed to "total for this mandate".
- Expiry is displayed in US Eastern time; "this week" means through Sunday 11:59 PM of the current week.
- A cart holds items from a single store.
- The buyer's human acts are signing the mandate and linking PayPal once; payments under the mandate are
  made by the agent unattended. The design's per purchase PayPal button slot moves to the signing step.
- Products, stores, prices and stock are fictional and labeled as such; tax is an estimated fixed rate per
  store.
- Merchant view shows shared store data for all demo sessions, with buyers masked; the buyer view is
  private per session.
- Tracking numbers entered in the demo are sandbox data, labeled as such.
- Dispute opening in the sandbox may require a manual step by the sandbox buyer; verified in sandbox
  scripts before building on it.
- Retention: demo records kept 90 days after mandate expiry or revocation.
- Design canvas in `design/project/` is the source of truth for layout and copy.
