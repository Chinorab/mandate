# What we learned from the sandbox

Dated findings from the scripts in `/scripts`, run against the PayPal sandbox.

## 01-auth-and-order, 2026-10-24 22:28 UTC

- OAuth client credentials with the sandbox app returned a token; scopes include vault, disputes and payments.
- Order created with status PAYER_ACTION_REQUIRED.
- Replaying the create call with the same PayPal-Request-Id returned the same order id: no duplicate order.
- custom_id (mandate code, version and SHA256, 78 characters) is returned unchanged on GET order.
- invoice_id is returned on GET order.
- payee.merchant_id is kept on the order (Sample Sports Outlet).

## 01-auth-and-order, 2026-10-24 22:33 UTC

- Capture status COMPLETED after the test buyer approved.
- custom_id is carried on the capture (GET /v2/payments/captures/{id}).
- Replaying the capture with the same PayPal-Request-Id returned the stored result, no second capture.

## 02-vault-setup, 2026-10-24 22:34 UTC

- Setup token with usage_pattern UNSCHEDULED_PREPAID was refused: 403 NOT_AUTHORIZED, Authorization failed due to insufficient permissions..
- Setup token with usage_pattern IMMEDIATE was refused too: 403 NOT_AUTHORIZED, Authorization failed due to insufficient permissions..

## 02-vault-setup, 2026-10-24 23:03 UTC

- Setup token created with usage_type MERCHANT, customer_type CONSUMER and usage_pattern UNSCHEDULED_PREPAID; status PAYER_ACTION_REQUIRED; approval link rel "approve".

## 02-vault-setup, 2026-10-24 23:03 UTC

- Setup token status before exchange: PAYER_ACTION_REQUIRED.
- Payment token creation failed: 422 UNPROCESSABLE_ENTITY, The requested action could not be performed, semantically incorrect, or failed business validation..

## 02-vault-setup, 2026-10-24 23:07 UTC

- Setup token status before exchange: PAYER_ACTION_REQUIRED.
- Payment token creation failed: 422 UNPROCESSABLE_ENTITY, The requested action could not be performed, semantically incorrect, or failed business validation..

## 02-vault-setup, 2026-10-24 23:07 UTC

- Setup token created with usage_type MERCHANT, customer_type CONSUMER and usage_pattern UNSCHEDULED_PREPAID; status PAYER_ACTION_REQUIRED; approval link rel "approve".

## 02-vault-setup, 2026-10-24 23:10 UTC

- Setup token status after the test buyer approved: APPROVED.
- Payment token created from the setup token; a customer id was returned; usage_type on the token: MERCHANT.
- The payment token id and customer id are kept server side only (here in .scripts-state, in the app in the mandate row).

## 02-vault-setup, lessons from the first attempts, 2026-10-24 23:12 UTC

- Every Vault call (PayPal and card) returned 403 NOT_AUTHORIZED until "Save payment methods" was ticked under Payment capabilities in the app's features; the OAuth token scopes looked fine before that, so the 403 is the only signal.
- The first approval left the setup token in PAYER_ACTION_REQUIRED and the exchange failed with 422 PAYER_ACTION_REQUIRED ("Please make sure setup up token is approved"). The return and cancel addresses looked the same to the tester, so the outcome was invisible. Distinct addresses (.../mandate-vault-APPROVED and .../mandate-vault-CANCELLED) made the second attempt unambiguous: status APPROVED, then the exchange succeeded.
- A PayPal-Request-Id reused after a failed call gets the stored failure back; each retry of the token exchange now uses a new id.
- The approval page is /agreements/approve?approval_session_id=..., reached from the setup token's "approve" link.

## 03-vault-charge-payee, 2026-10-24 23:11 UTC

- Sample Sports Outlet: order COMPLETED through one call, capture COMPLETED; payee returned as missing; custom_id missing.
- Example Running Co.: order COMPLETED through one call, capture COMPLETED; payee returned as missing; custom_id missing.
- Demo Shoe Supply: vault charge refused, 422 UNPROCESSABLE_ENTITY: [{"issue":"CANNOT_PAY_SELF","description":"Payer cannot pay to himself/herself."}].
- R2 open: 2 of 3 vault charges completed; see the lines above before choosing the fallback.
- Note on the run above: the create answer is minimal by default (no payee, no custom_id in the body), so "missing" there is not a finding; the script now reads each order back. CANNOT_PAY_SELF means the payee id was the buyer's own account: each store must use a business account other than the buyer.

## 03-vault-charge-payee, 2026-10-24 23:13 UTC

- Sample Sports Outlet: order COMPLETED through one call, capture COMPLETED; payee kept; custom_id kept.
- Example Running Co.: order COMPLETED through one call, capture COMPLETED; payee kept; custom_id kept.
- Demo Shoe Supply: vault charge refused, 422 UNPROCESSABLE_ENTITY: [{"issue":"CANNOT_PAY_SELF","description":"Payer cannot pay to himself/herself."}].
- R2 open: 2 of 3 vault charges completed; see the lines above before choosing the fallback.

## 03-vault-charge-payee, 2026-10-24 23:14 UTC

- Sample Sports Outlet: order COMPLETED through one call, capture COMPLETED; payee kept; custom_id kept.
- Example Running Co.: vault charge refused, 422 UNPROCESSABLE_ENTITY: [{"issue":"CANNOT_PAY_SELF","description":"Payer cannot pay to himself/herself."}].
- Demo Shoe Supply: order COMPLETED through one call, capture COMPLETED; payee kept; custom_id kept.
- R2 open: 2 of 3 vault charges completed; see the lines above before choosing the fallback.

## 03-vault-charge-payee, 2026-10-24 23:17 UTC

- Sample Sports Outlet: order COMPLETED through one call, capture COMPLETED; payee kept; custom_id kept.
- Example Running Co.: order COMPLETED through one call, capture COMPLETED; payee kept; custom_id kept.
- Demo Shoe Supply: order COMPLETED through one call, capture COMPLETED; payee kept; custom_id kept.
- R2 decided: merchant initiated vault charges to all three payees complete without the buyer, so the agent pays on its own after the buyer links PayPal once; the per payment approval fallback (T052) is not needed.

## 06-toolkit, 2026-10-24 23:19 UTC

- Toolkit tools available with the app's configuration: get_order, list_disputes, get_dispute, create_shipment_tracking, get_shipment_tracking, list_transactions.
- get_order returned the script 01 order, with the mandate custom_id.
- create_shipment_tracking: see the correction below (the first reading was wrong).
- get_shipment_tracking: see the correction below.
- list_disputes answered (no dispute yet).
- list_transactions answered.
- The wrapper refused all 12 of 12 money moving toolkit tools by name, before any call to PayPal.
- Correction: the toolkit returns PayPal errors as content, not as exceptions. create_shipment_tracking answered NOT_AUTHORIZED with issue USER_NOT_AUTHORIZED on /trackers/1/transaction_id, and get_shipment_tracking answered 403. The capture belongs to the payee (Sample Sports Outlet), not to the account that owns the REST app, so the app may not add tracking to it. The app's toolkit wrapper must read these error bodies (fixed in the script; to fix in lib/payments/toolkit.ts).
