# Data Model: Agent Purchase Mandates

Postgres. Money is stored as integer cents (`*_cents`), currency as ISO code. Times are `timestamptz` (UTC),
displayed in US Eastern. Ids shown to people use short prefixed codes (MDT…, ORD…); internal keys are uuid.

## demo_session

| Field | Type | Rules |
|---|---|---|
| id | uuid pk | set in an httpOnly, secure, sameSite=lax signed cookie |
| created_at, last_seen_at | timestamptz | |
| model_calls_today, model_calls_day | int, date | FR-037 cap (40/day) |
| claimed_dispute_id | uuid null fk dispute | FR-032, one per session |

## mandate

| Field | Type | Rules |
|---|---|---|
| id | uuid pk | |
| code | text unique | `MDT` + 6 chars base32, shown to people |
| session_id | fk demo_session | buyer view filters on it (FR-033) |
| instructions | text | original words, max 1000 chars |
| status | enum | `draft`, `awaiting_link`, `active`, `expired`, `revoked` (+ derived "purchase in dispute") |
| current_version_id | fk mandate_version null | |
| vault_payment_token_id | text null | server only, never serialized to the client |
| vault_customer_id | text null | server only |
| revoked_at | timestamptz null | |
| flagged_at | timestamptz null | set when a stored version fails its integrity check; every later check fails |
| created_at | timestamptz | |

State transitions: `draft` → (sign) → `awaiting_link` → (PayPal linked) → `active`;
`active` → (amend approved) → `active` with new version; `active` → `revoked` (any time) | `expired` (clock,
evaluated at every check); `awaiting_link` → (link cancelled) stays, can return to `draft` to edit.
Revoked and expired are terminal.

## mandate_version (immutable once signed)

| Field | Type | Rules |
|---|---|---|
| id | uuid pk | |
| mandate_id | fk | |
| version_no | int | 1, 2, … unique per mandate |
| terms | jsonb | canonical terms object, below |
| assumptions | jsonb | `[{ term, text }]` flagged inferences (FR-002) |
| canonical | text | exact string hashed |
| sha256 | char(64) | hex of `canonical` (FR-005) |
| signed_at | timestamptz | |
| previous_version_id | fk null | amendment chain (FR-019) |
| change_summary | jsonb null | `[{ term, from, to }]` for amendments |
| amended_for_cart_id | fk cart null | |

**Terms object** (zod validated, rule terms only, every key required):

```
{ budgetCents: int > 0, currency: "USD", category: CategoryId,
  required: { size?: { system: "US_MENS" | "US_WOMENS", value: string }, colors?: ColorId[] , ... },
  forbidden: { colors?: ColorId[], brands?: string[], materials?: string[] },
  semantic: [{ id, label, text }]   // e.g. "neutral colors", judged by the model
  merchants: "ANY_LISTED" | StoreId[], expiresAt: ISO string, maxPurchases: int >= 1 }
```

**Canonicalization**: keys sorted recursively, arrays of ids sorted, no whitespace, amounts as integers,
`expiresAt` normalized to UTC ISO with seconds, plus `{ mandate: code, version: n }`. Same terms always yield
the same bytes, hence the same hash (FR-006, SC test).

## store, product (seeded, fictional)

store: `id` (`sports-outlet`, `running-co`, `shoe-supply`), `name`, `payee_merchant_id` (env), `tax_rate_bp`,
`shipping_cents`, `free_shipping_over_cents`.

product: `id`, `store_id`, `name`, `category`, `attributes jsonb` (`sizes`, `colors`, `material`, `brand`),
`price_cents`, `stock`, `description`. Text is labeled fictional in the UI.

## cart

| Field | Type | Rules |
|---|---|---|
| id | uuid pk | |
| session_id, mandate_id, mandate_version_id | fk | version pinned at creation |
| store_id | fk | single store per cart |
| lines | jsonb | `[{ productId, size, color, qty }]` only ids, no prices |
| status | enum | `open`, `checked_pass`, `checked_fail`, `checked_not_paid` (PayPal unavailable, retry offered), `paid`, `cancelled` |
| created_at | timestamptz | |

Totals are never stored from input; they are computed by `pricing.computeTotals(cart)` from product rows.

## check_result (append only)

| Field | Type | Rules |
|---|---|---|
| id | uuid pk | also used as PayPal-Request-Id |
| cart_id, mandate_version_id | fk | |
| stage | enum | `preview`, `pre_create`, `pre_capture` (FR-012) |
| verdict | enum | `pass`, `fail` |
| terms | jsonb | `[{ term, kind: "rule"\|"semantic", allowed, actual, pass, explanation }]` |
| totals | jsonb | `{ subtotal, shipping, tax, total, remainingBudget }` cents |
| hash_verified | bool | recomputed sha256 equals stored |
| created_at | timestamptz | |

## order

| Field | Type | Rules |
|---|---|---|
| id | uuid pk | |
| code | text unique | `ORD` + number, used as `invoice_id` |
| session_id, mandate_id, mandate_version_id, cart_id, check_result_id | fk | |
| store_id | fk | |
| amount_cents, currency | | from check_result.totals |
| paypal_order_id, paypal_capture_id | text | |
| custom_id | text | `MDT…:v:sha256` |
| status | enum | `created`, `captured`, `refunded`, `failed` |
| shipping_status | enum | `unfulfilled`, `shipped`, `delivered` |
| tracking | jsonb null | `{ carrier, number, addedAt, paypalTrackerId }` |
| buyer_masked | text | e.g. "A. K., sandbox buyer" |
| created_at, captured_at | timestamptz | |

Mandate spend = sum of `amount_cents` of captured, non refunded orders. Remaining purchases =
`maxPurchases - count(captured orders)`.

## dispute

| Field | Type | Rules |
|---|---|---|
| id | uuid pk | |
| paypal_dispute_id | text unique | |
| order_id | fk null | matched via transaction id or custom_id; null if no mandate order |
| reason, status, stage | text | from PayPal |
| amount_cents | int | |
| opened_at, seller_response_due | timestamptz | |
| in_pool | bool | FR-032 |
| claimed_by_session_id | fk null | only claimant may submit |
| created_at, updated_at | timestamptz | |

## evidence_file

| Field | Type | Rules |
|---|---|---|
| id | uuid pk | |
| dispute_id | fk unique | |
| items | jsonb | `[{ key, title, meta, included, source: { table, id } }]` (FR-028, FR-030) |
| draft_text | text | model draft, each sentence tagged with item keys server side |
| draft_sentences | jsonb | `[{ text, items: [keys] }]`, kept only if grounded |
| draft_context, drafted_by | jsonb, text | dispute facts and missing list the draft could cite; `model` or `template` |
| edited_text | text null | merchant edit |
| accuracy_confirmed_at | timestamptz null | required before submit (FR-031) |
| submitted_at | timestamptz null | |
| paypal_response | jsonb null | status or error |
| assembled_by | enum | `workflow`, `inline` |

## paypal_event (idempotency + audit)

`id` (PayPal event id, pk), `event_type`, `resource_id`, `verified bool`, `received_at`, `processed_at`,
`error text null`. Unverified events are answered 400 and not stored at all: storing them under the
PayPal event id would let a forged copy block the genuine event that arrives later (tested in
`tests/contract/webhook.test.ts`).

## audit_log

`id`, `at`, `session_id null`, `actor` (`buyer`, `agent`, `merchant`, `system`), `action`
(`check_refused`, `payment_refused`, `revoked`, `evidence_submitted`, …), `detail jsonb`. Every refusal by
the gate writes a row (spec US3 scenario 3).
