# Contract: HTTP routes (Next.js route handlers)

All routes require the demo session cookie (created by middleware on first visit) except webhooks. JSON in
and out; errors are `{ error: { code, message } }`. No route returns vault tokens, secrets or other sessions'
buyer data.

## Buyer

| Method | Path | Body | Result |
|---|---|---|---|
| POST | `/api/mandates/draft` | `{ instructions }` | draft terms + assumptions (model, capped) |
| PATCH | `/api/mandates/:code` | `{ terms }` (draft only) | updated draft, 409 if signed |
| POST | `/api/mandates/:code/sign` | `{ confirm: true }` | version 1, sha256, status `awaiting_link` |
| POST | `/api/mandates/:code/vault/setup-token` | | `{ setupTokenId }` |
| POST | `/api/mandates/:code/vault/confirm` | `{ vaultSetupToken }` | status `active` |
| POST | `/api/mandates/:code/revoke` | `{ confirm: true }` | status `revoked`, token deleted |
| GET | `/api/mandates` | | list for this session |
| GET | `/api/mandates/:code/receipt` | | PDF download |
| GET | `/api/mandates/:code/verify` | | `{ sha256, recomputed, match }` per version |
| POST | `/api/agent/chat` | `{ mandateCode, messages }` | streamed agent reply (AI SDK UI stream) |
| POST | `/api/carts/:id/check` | | check_result (preview) |
| POST | `/api/carts/:id/amend` | `{ changes, confirm: true }` | new version, sha256 |
| POST | `/api/carts/:id/pay` | | `{ orderCode }` or 409 refusal with failed terms |
| POST | `/api/carts/:id/cancel` | | cart `cancelled` |
| GET | `/api/paypal/client-token` | | browser safe client token (short lived) |

## Merchant (store `sports-outlet`)

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/api/merchant/orders` | query filters | rows for AG Grid (server side row model not needed below 5k rows) |
| POST | `/api/merchant/orders/:code/tracking` | `{ carrier, number }` | saved, sent via toolkit `create_shipment_tracking` |
| GET | `/api/merchant/disputes/:id` | | dispute, evidence file, claim state |
| POST | `/api/merchant/disputes/claim` | | claims a pool dispute for this session |
| PATCH | `/api/merchant/disputes/:id/evidence` | `{ items, editedText }` | saved draft (claimant only) |
| POST | `/api/merchant/disputes/:id/submit` | `{ accuracyConfirmed: true }` | PayPal provide-evidence result (claimant only) |
| POST | `/api/merchant/studio/agent` | Studio agent request | Claude backed reply for AG Studio (capped) |

## PayPal

| Method | Path | Notes |
|---|---|---|
| POST | `/api/webhooks/paypal` | raw body; verify signature first; 200 on duplicates; 400 on unverifiable without side effect |

## Pages (App Router)

`/` landing, `/mandates/new`, `/mandates/[code]` (agent chat), `/mandates/[code]/check/[cartId]`,
`/history`, `/merchant` (orders grid), `/merchant/insights` (AG Studio), `/merchant/disputes/[id]`,
`/privacy`. Layouts follow `design/project/*.dc.html`.
