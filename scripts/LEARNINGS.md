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

## 03-vault-charge-payee, 2026-10-24 23:29 UTC

- Sample Sports Outlet: vault charge refused, 403 NOT_AUTHORIZED: [{"issue":"PERMISSION_DENIED","description":"You do not have permission to access or perform operations on this resource."}].
- Example Running Co.: vault charge refused, 403 NOT_AUTHORIZED: [{"issue":"PERMISSION_DENIED","description":"You do not have permission to access or perform operations on this resource."}].
- Demo Shoe Supply: vault charge refused, 403 NOT_AUTHORIZED: [{"issue":"PERMISSION_DENIED","description":"You do not have permission to access or perform operations on this resource."}].
- R2 open: 0 of 3 vault charges completed; see the lines above before choosing the fallback.

## 02-vault-setup, 2026-10-24 23:30 UTC

- Setup token created with usage_type MERCHANT, customer_type CONSUMER and usage_pattern UNSCHEDULED_PREPAID; status PAYER_ACTION_REQUIRED; approval link rel "approve".

## App ownership, 2026-10-24 23:31 UTC

- Tracking (and, by the same rule, disputes) on a capture is reserved to the merchant that received it. With the REST app owned by one business account and the money routed by `payee` to another, create_shipment_tracking returns USER_NOT_AUTHORIZED. The demo now uses a REST app owned by Sample Sports Outlet, the store shown in the merchant view; the other two stores still receive their payments through `payee`.
- A Vault payment token belongs to the merchant whose app created it: the token saved through the first app is refused by the new app with 403 PERMISSION_DENIED on every charge. The test buyer approves the save once more for the new app.

## 02-vault-setup, 2026-10-24 23:34 UTC

- Setup token status after the test buyer approved: APPROVED.
- Payment token created from the setup token; a customer id was returned; usage_type on the token: MERCHANT.
- The payment token id and customer id are kept server side only (here in .scripts-state, in the app in the mandate row).

## 03-vault-charge-payee, 2026-10-24 23:34 UTC

- Sample Sports Outlet: order COMPLETED through one call, capture COMPLETED; payee kept; custom_id kept.
- Example Running Co.: order COMPLETED through one call, capture COMPLETED; payee kept; custom_id kept.
- Demo Shoe Supply: order COMPLETED through one call, capture COMPLETED; payee kept; custom_id kept.
- R2 decided: merchant initiated vault charges to all three payees complete without the buyer, so the agent pays on its own after the buyer links PayPal once; the per payment approval fallback (T052) is not needed.

## 06-toolkit, 2026-10-24 23:34 UTC

- Toolkit tools available with the app's configuration: get_order, list_disputes, get_dispute, create_shipment_tracking, get_shipment_tracking, list_transactions.
- get_order returned the script 01 order, with the mandate custom_id.
- create_shipment_tracking accepted UPS tracking for the captured order (order_id + transaction_id = capture id).
- get_shipment_tracking returned the tracking for the order.
- list_disputes answered (no dispute yet).
- list_transactions answered.
- The wrapper refused all 12 of 12 money moving toolkit tools by name, before any call to PayPal.

## 07-revoke, 2026-10-24 23:34 UTC

- DELETE /v3/vault/payment-tokens/{id} succeeded (no content).
- Reading the deleted token answers 404 RESOURCE_NOT_FOUND.
- A charge with the deleted token is refused: 403 NOT_AUTHORIZED (PERMISSION_DENIED). Revocation removes the agent's ability to pay at PayPal too, on top of the gate's own refusal.

## Full app journey with real services, 2026-10-24 (evening ET)

- In the app: Claude drafted the example mandate, the buyer signed, then linked PayPal with the JS SDK v6 save flow (official PayPal button, client token from our server, setup token created on click, payment token swapped on our server). The mandate became active without any change to the code written before the sandbox runs (T043).
- The shopping agent bought the Daily Miler at Sample Sports Outlet through the consent gate: 7 of 7 terms, $103.92, mandate reference in the PayPal order's custom_id, payment completed without the buyer.
- PayPal's webhook reached the app through a cloudflared quick tunnel and passed verify-webhook-signature (answered 200; unverified events get 400).
- The SDK button reads "Pay with PayPal" for a save without purchase (type "pay"); worth a clearer label if the SDK offers one.

## Opening a dispute as the sandbox buyer, 2026-10-25 01:57 Paris

- In the sandbox the merchant shows as "Test Store" (the business account's default name), not as the demo store name.
- Resolution Center path: sandbox.paypal.com/resolutioncenter, then the payment's filing page (/resolutioncenter/filing/{transaction id}). For a payment made with a vaulted PayPal, PayPal first shows "You have an automatic payment set up with Test Store" with "Manage Automatic Payments" (do not use it: it cancels the agent's link) and "Report Issue to PayPal".
- First attempt, a few minutes after the payment: "Report Issue to PayPal" answered "We're sorry, looks like something went wrong on our end. Please try again." (sandbox side error).

## Dispute delivered to the app, 2026-10-25 08:20 UTC

- PayPal created the dispute PP-R-ZNP-10194423 (UNAUTHORISED, WAITING_FOR_SELLER_RESPONSE, $103.92) about 10 minutes after the buyer's filing, with a "PP-R-" case id, and generated CUSTOMER.DISPUTE.CREATED followed by two CUSTOMER.DISPUTE.UPDATED within 20 seconds.
- The cloudflared quick tunnel had expired overnight ("Tunnel not found"), so those deliveries were lost. After a new tunnel, PATCH /v1/notifications/webhooks/{id} (replace /url) and POST /v1/notifications/webhooks-events/{id}/resend delivered them again; all three passed signature verification (200).
- The app matched the dispute to order 918366 by the capture id, put it in the pool (Sample Sports Outlet), and assembled the evidence file: signed mandate, check report, PayPal transaction, tracking stated as missing. Claude drafted the response; every kept sentence rests on an included item.
- The seller's response is due 10 days after filing (seller_response_due_date), which sets the pool refresh rhythm during judging.
- For the hosted demo, the webhook points to the stable Render URL, not a quick tunnel.

## Evidence submitted to PayPal from the app, 2026-10-25 08:55 UTC

- The merchant claimed PP-R-ZNP-10194423 in the demo, kept the three items (signed mandate, check report, transaction), confirmed accuracy and pressed Submit Evidence. provide-evidence (multipart: `input` JSON with evidences[], one PDF as `file1`) was accepted.
- PayPal then showed the dispute UNDER_REVIEW (stage CHARGEBACK) with one evidence SUBMITTED_BY_SELLER carrying the document mandate-evidence-PP-R-ZNP-10194423.pdf and the 1,439 character response as notes. The only action left to the seller is provide_supporting_info.
- PayPal recorded the evidence type as OTHER although it was sent as BILLING_AGREEMENT; for an unauthorized claim in the chargeback stage, the requested types were PROOF_OF_FULFILLMENT, PROOF_OF_REFUND and OTHER.
- Before the submission, the dispute's evidences[] lists what PayPal requests (source REQUESTED_FROM_SELLER); reading them first would let the app choose the evidence type PayPal asks for.

## Render Workflows on the hosted demo, 2026-10-25 14:24 UTC

- The webhook on Render received a resent CUSTOMER.DISPUTE.CREATED (verified), started the `assembleEvidence` task on the "mandate-evidence" workflow service, and the evidence file was built by the workflow 4 seconds after the event (assembled_by = workflow). That test dispute has no matching order in the hosted database, so the draft is the fixed template; disputes on demo orders get the Claude draft.
- Setup lessons: values marked `sync: false` are only prompted when a Blueprint is first created, so RENDER_API_KEY (account API key, starts with rnd_) and the workflow's ANTHROPIC_API_KEY had to be set by hand after the sync; "Save only" keeps the running instance unchanged until a deploy or restart. The workflow entry needs Node's `react-server` condition to load server only modules outside Next.

## 02-vault-setup, 2026-10-25 14:30 UTC

- Setup token created with usage_type MERCHANT, customer_type CONSUMER and usage_pattern UNSCHEDULED_PREPAID; status PAYER_ACTION_REQUIRED; approval link rel "approve".
