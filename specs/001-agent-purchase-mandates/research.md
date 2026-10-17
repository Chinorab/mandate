# Research: Agent Purchase Mandates

Date: 2026-10-17. Sources: PayPal OpenAPI schemas downloaded from developer.paypal.com
(`/api/orders/v2/schema.json`, `/api/customer-disputes/v1/schema.json`, `/api/payment-tokens/v3/schema.json`),
PayPal developer guides, the Agent Toolkit repository, the hackathon sponsor pages. Every "to verify" item
is a step of the sandbox scripts (`/scripts`) and is resolved before application code depends on it.

## R1. Agent pays without the buyer present (vault)

- **Decision**: save the buyer's PayPal wallet at signing with JS SDK v6 "save without purchase", then charge
  it server side with Orders v2.
  - Browser: `window.paypal.createInstance({ clientToken, components: ["paypal-payments"], pageType: "checkout" })`
    with a browser safe client token from our server (`/v1/oauth2/token`, `response_type=client_token`);
    `findEligibleMethods({ currencyCode: "USD", paymentFlow: "VAULT_WITHOUT_PAYMENT" })`;
    `createPayPalSavePaymentSession({ onApprove, onCancel, onError })`;
    `session.start({ presentationMode: "auto" }, createSetupTokenPromise)` (promise not awaited first).
  - Server: `POST /v3/vault/setup-tokens` with `payment_source.paypal` = `usage_type: "MERCHANT"`,
    `usage_pattern: "UNSCHEDULED_PREPAID"` (to verify; `IMMEDIATE` is the documented sample),
    `customer_type: "CONSUMER"`, `description` (max 128 chars, shown to the payer: "Payments by your
    shopping agent under mandate MDT…"), `experience_context.return_url/cancel_url`.
    On approve: `POST /v3/vault/payment-tokens` with `payment_source.token { id, type: "SETUP_TOKEN" }`.
    Store payment token id and `customer.id` server side only.
  - Charge: `POST /v2/checkout/orders` with `intent: "CAPTURE"`, `payment_source.paypal.vault_id`, and
    `payment_source.paypal.stored_credential { payment_initiator: "MERCHANT", usage: "SUBSEQUENT",
    usage_pattern: "UNSCHEDULED_PREPAID" }` (enums confirmed in the Orders schema). To verify: whether the
    order completes in one call or needs an explicit capture.
  - Revocation: `DELETE /v3/vault/payment-tokens/{id}`.
- **Rationale**: the liability gap exists when the agent pays unattended; the signed mandate is then the only
  record of intent. A merchant initiated charge on a saved wallet is the PayPal native way to do this.
- **Alternatives**: buyer approves each payment with the SDK button (fallback, kept behind a feature flag);
  Billing Agreements v1 (legacy, superseded by Vault v3).
- **Prerequisites**: sandbox app with Accept payments and Vault enabled (Advanced options). RDA (FraudNet)
  is documented as required for customer initiated vault payments; ours are merchant initiated, to verify.

## R2. Paying three stores (payee)

- **Decision**: one REST app (owned by Sample Sports Outlet) creates every order; `purchase_units[0].payee.merchant_id`
  selects the store's sandbox business account.
- **Rationale**: `payee { email_address, merchant_id }` is part of `purchase_unit_request` in the schema;
  standard checkout accepts a payee other than the caller.
- **Risk (high)**: a wallet vaulted with `usage_type: "MERCHANT"` belongs to the vaulting merchant. Charging it
  to another payee may be refused. Script `03-vault-charge-payee` tests it first.
- **Fallback if refused**: the three stores become storefronts of one merchant account (a marketplace
  operator). The merchant term stays a deterministic store allowlist; the README states the limitation.
  `usage_type: "PLATFORM"` needs partner onboarding and is out of reach in a hackathon.

## R3. Attaching the mandate to the order

- **Decision**: `purchase_units[0].custom_id` = `"{mandateId}:{versionNo}:{sha256 hex}"`
  (9 + 1 + 3 + 1 + 64 = 78 chars, under the 255 limit; "not visible to the payer", appears in transaction and
  settlement reports). `invoice_id` = our order number (unique per merchant, max 127). `description`
  (127 effective chars) = "Agent purchase under mandate MDT4K7Q21". `reference_id` = store id.
- **Alternatives**: `supplementary_data` (not meant for this), `soft_descriptor` (22 chars, statement text).

## R4. Idempotency and money path safety

- **Decision**: every create order and capture call sends `PayPal-Request-Id` = our check result id. The
  mandate row is locked (`SELECT … FOR UPDATE`) while the check runs and the order is created, so concurrent
  payments cannot both consume remaining budget or count.

## R5. Disputes in sandbox

- **Findings**:
  - Disputes v1 endpoints: list, show, `provide-evidence`, `provide-supporting-info`, `accept-claim`,
    `make-offer`, `escalate`, `appeal`, `send-message`; sandbox only: `require-evidence`
    (UNDER_REVIEW to WAITING_FOR_SELLER_RESPONSE) and `adjudicate`.
  - `provide-evidence` takes multipart form data: an `input` JSON part with `evidences[]` (`evidence_type`,
    `notes` up to 2000 chars, `evidence_info.tracking_info` for PROOF_OF_FULFILLMENT) plus document files.
    Relevant evidence types: `PROOF_OF_FULFILLMENT`, `BILLING_AGREEMENT`, `COPY_OF_CONTRACT`,
    `DETAILS_OF_PURCHASE`, `PROOF_OF_RECEIPT_COPY`. Allowed only in `WAITING_FOR_SELLER_RESPONSE`.
  - Creating a dispute by API needs `DISPUTE_CREATE` scope granted by a PayPal account manager plus a
    `PayPal-Auth-Assertion` buyer JWT. Not available to us.
- **Decision**: open disputes manually as the sandbox buyer (sandbox paypal.com, Activity, the transaction,
  Report a problem); exact clicks recorded by script `05-dispute` run notes. Pool refill is an operator
  procedure (FR-032). Our evidence = PDF "Mandate evidence report" (signed terms, fingerprint, timestamps,
  check table, order) as `BILLING_AGREEMENT`, plus `PROOF_OF_FULFILLMENT` with tracking when present, plus
  the merchant's text in `notes`. If a dispute sits in UNDER_REVIEW, the operator script calls
  `require-evidence` with `action: "SELLER_EVIDENCE"` (to verify).
- **To verify**: which reasons the sandbox buyer can pick for a wallet funded order (unauthorized may need
  card funding); webhook events fired; the response deadline in sandbox (expected about 10 days, which
  sets the refresh date for the pool).

## R6. Webhooks

- **Decision**: one endpoint `/api/webhooks/paypal`; verify each event with
  `POST /v1/notifications/verify-webhook-signature` (headers `paypal-auth-algo`, `paypal-cert-url`,
  `paypal-transmission-id`, `paypal-transmission-sig`, `paypal-transmission-time`, our `webhook_id`, raw
  event). Store `event.id` unique for idempotency. Events: `CUSTOMER.DISPUTE.CREATED|UPDATED|RESOLVED`,
  `PAYMENT.CAPTURE.COMPLETED|REFUNDED`, `VAULT.PAYMENT-TOKEN.CREATED|DELETED`.
- **Note**: Dashboard simulator events are not verifiable; real sandbox actions are used in scripts.

## R7. PayPal Agent Toolkit

- **Findings**: package `@paypal/agent-toolkit` (Node 18+), Vercel AI SDK adapter at
  `@paypal/agent-toolkit/ai-sdk`, sandbox via `configuration.context.sandbox = true`. Tools: `create_order`,
  `get_order`, `pay_order`, `create_refund`, `get_refund`, `list_disputes`, `get_dispute`,
  `accept_dispute_claim`, `create_shipment_tracking`, `get_shipment_tracking`, `update_shipment_tracking`,
  `list_transactions`, `get_merchant_insights`, plus invoices, catalog, subscriptions. No vault tools, no
  evidence submission.
- **Decision**:
  - Through the toolkit: `get_order` (agent reads order state), `list_disputes`, `get_dispute` (merchant
    agent), `create_shipment_tracking`, `get_shipment_tracking` (tracking), `list_transactions` (merchant
    reconciliation view). In fallback mode (R1 fallback), `create_order` and `pay_order` wrapped by the gate.
  - Through REST: vault setup and payment tokens, vault charge orders with `custom_id` and `payee`,
    `provide-evidence`, `require-evidence`, webhook verification, client token.
  - Money moving toolkit tools (`create_order`, `pay_order`, `create_refund`, `accept_dispute_claim`) are
    never registered raw: each is replaced by a gated wrapper or omitted. A unit test enumerates the agent's
    registered tools and fails if any raw money moving tool is present.
- **Note**: the brief links `github.com/paypal/AI-Toolkit`; the package and README are `paypal/agent-toolkit`.

## R8. Model and agent runtime

- **Decision**: Vercel AI SDK with the Anthropic provider, model `claude-sonnet-5-5`, so the toolkit's AI SDK
  tools plug in directly. Structured outputs (zod schemas) for: mandate draft, semantic judgments, product
  fit labels, dispute draft. The shopping agent loop is bounded (max steps) and only sees gated tools.
- **Rationale**: one framework for our tools and PayPal's; schemas keep model output out of numeric rules.
- **Prompt injection**: catalog text and buyer text are data; the gate ignores any amount or verdict the
  model produces.

## R9. Merchant dashboard and the AG Grid prize

- **Findings**: the sponsor judges "what your dashboard looks like and how you build it", asks for custom
  widgets, theming, layout and the Studio Agent Framework (AG Studio). A free 45 day trial license exists;
  the official boilerplate is `paypaldev/hackathon-paypal-ag-grid-boilerplate` (Next.js, `AG_STUDIO` env
  key, `AgStudioProvider`).
- **Decision**:
  - Orders page: AG Grid Enterprise with the Mandate theme (Theming API, tokens from the canvas), custom cell
    renderers (status tag with icon, mandate id with fingerprint popover, check score), row grouping (status,
    mandate state, day), master detail (terms and check table), set filters, CSV and Excel export, status bar.
  - Insights tab: AG Studio dashboard with custom widgets ("Mandate coverage", "Blocked before payment",
    "Dispute exposure by mandate state") and the Studio Agent Framework wired to our Claude merchant agent.
  - License timing: activate the 45 day trial on or after 2026-11-01 so it covers judging to 2026-12-15;
    develop unlicensed (watermark) until then.
- **Alternatives**: AG Grid Community only (loses grouping, master detail, Excel; weak for the prize).

## R10. Hosting on Render

- **Decision**: one Render web service (Next.js, Node) + Render Postgres (Basic plan, about $7/month,
  unconfirmed on the live pricing page) + $50 hackathon credits. Render Workflows (beta, `@renderinc/sdk`)
  runs the dispute evidence assembly task triggered by the webhook, with retries; an in process fallback
  runs the same function if Workflows is unavailable.
- **Rationale**: free Postgres expires after 30 days; judging ends 2026-12-15. Workflows is the sponsor's
  featured product and fits a durable, retried background job.
- **Note**: claim credits at the sponsor's portal link, Starter web service avoids cold starts during judging.

## R11. Stack

- Next.js 16 App Router, React 19, TypeScript strict; Drizzle ORM on Postgres; zod; Vitest for unit,
  contract and bypass tests; Playwright (playwright-cli skill) for journeys on desktop and mobile; PDF
  evidence report generated server side (pdf-lib). Versions pinned at install time.
