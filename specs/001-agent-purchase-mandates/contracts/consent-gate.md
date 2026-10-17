# Contract: Consent gate and Mandate check

The only module allowed to call PayPal money endpoints is `lib/payments/gate.ts`. It exports nothing that
moves money without a check.

## `runMandateCheck(input) -> CheckResult`

Pure function, no I/O. Input: `{ version: MandateVersion (terms + canonical + sha256), mandateStatus,
revokedAt, now, cartLines resolved to product rows, store, spentCents, capturedCount, semantic: SemanticVerdict[] }`.

Rules, in order, each producing one term row (all rows are produced, no short circuit):

| Term | Pass when |
|---|---|
| integrity | sha256(canonical) == version.sha256 and canonical re-derived from terms == canonical |
| status | mandateStatus == active and revokedAt is null |
| expiry | now < terms.expiresAt |
| currency | every product currency == terms.currency |
| budget | computed total <= budgetCents - spentCents |
| count | capturedCount < maxPurchases |
| merchant | store.id allowed by terms.merchants |
| category | every product.category == terms.category |
| required.* | each required attribute matches exactly (size system and value) |
| forbidden.* | no line has a forbidden value |
| semantic.* | the model verdict for that term is `pass`; missing, errored or capped verdict = fail |

Verdict `pass` only if every row passes. Explanations are produced by templates from the numbers
("Cart total is $127.74. Your limit is $120.00, so it is $7.74 over."), never by the model.

## `payCart({ sessionId, cartId }) -> { orderId } | Refusal`

1. Open a DB transaction, lock the mandate row.
2. Load cart, version, products from the DB (no client values). Compute totals.
3. Request semantic verdicts (or reuse the last ones for the same cart and version, max 10 minutes old).
4. `runMandateCheck(stage: pre_create)`; on fail write check_result + audit_log, return Refusal.
5. Create PayPal order (vault charge, `custom_id`, `payee`, `PayPal-Request-Id = checkResult.id`).
6. If the order is not yet captured: re-run the check (`pre_capture`), then capture with its own request id.
7. Persist order, mark cart paid, commit.

## Agent tools exposed to the model

| Tool | Moves money | Implementation |
|---|---|---|
| `search_catalog` | no | local |
| `propose_cart` | no | local, returns cart id |
| `check_cart` | no | `runMandateCheck(stage: preview)` |
| `pay_cart` | yes | `payCart` only |
| `get_order` | no | Agent Toolkit `get_order` |

Never registered for the shopping agent: toolkit `create_order`, `pay_order`, `create_refund`,
`accept_dispute_claim`, any invoice or subscription tool.

## Required bypass tests (Vitest, `tests/bypass/`)

- Registered tool list of each agent contains no raw money moving tool.
- Static scan: no file outside `lib/payments/` imports the PayPal REST client's money functions or the
  toolkit's money tools.
- `payCart` refuses: revoked, expired, over remaining budget, count exhausted, wrong store, forbidden
  attribute, semantic fail, semantic unavailable, tampered terms (hash mismatch), tampered canonical,
  cart from another session, cart pinned to a superseded version.
- Route handlers and server actions: calling `/api/carts/:id/pay` for a failing cart returns 409 and the
  PayPal client mock records zero calls.
- Concurrency: two parallel `payCart` on a mandate with one remaining purchase produce exactly one order.
- Client supplied totals or verdicts in request bodies are ignored (property test).
