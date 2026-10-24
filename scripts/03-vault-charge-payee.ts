/**
 * Sandbox script 03 (T015): the agent's payment, without the buyer present.
 *
 *   pnpm tsx scripts/03-vault-charge-payee.ts
 *
 * Charges the payment token from script 02 once per store, each to its own sandbox business account
 * through payee, as a merchant initiated, unscheduled payment (stored_credential), with the mandate
 * reference in custom_id and an idempotency key. Records whether the order completes in one call or
 * needs a capture, and decides research R2 (vault charges work, or the per payment approval fallback).
 */
import { call, env, learn, readState, run } from "./lib/sandbox";

type Order = {
  id: string;
  status: string;
  purchase_units?: { custom_id?: string; payee?: { merchant_id?: string }; payments?: { captures?: { id: string; status: string }[] } }[];
};

const STORES = [
  { name: "Sample Sports Outlet", env: "PAYPAL_MERCHANT_ID_SPORTS_OUTLET", value: "103.92" },
  { name: "Example Running Co.", env: "PAYPAL_MERCHANT_ID_RUNNING_CO", value: "96.34" },
  { name: "Demo Shoe Supply", env: "PAYPAL_MERCHANT_ID_SHOE_SUPPLY", value: "58.10" },
];

run(async () => {
  const token = readState<{ paymentTokenId: string; usagePattern: string }>("02-payment-token");
  if (!token) throw new Error("Run scripts/02-vault-setup.ts (both steps) first.");
  const findings: string[] = [];
  let completed = 0;

  for (const [i, store] of STORES.entries()) {
    const payee = env(store.env);
    const customId = `MDTSANDBOX3:1:${String(i + 1).repeat(64)}`;
    const requestId = `sandbox-03-${i + 1}-${Date.now()}`;
    const body = {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: "mandate",
          custom_id: customId,
          invoice_id: `MDT-S03-${i + 1}-${Date.now()}`,
          description: `Mandate sandbox script 03, ${store.name}`,
          amount: { currency_code: "USD", value: store.value },
          payee: { merchant_id: payee },
        },
      ],
      payment_source: {
        paypal: {
          vault_id: token.paymentTokenId,
          stored_credential: { payment_initiator: "MERCHANT", usage: "SUBSEQUENT", usage_pattern: token.usagePattern },
        },
      },
    };
    const res = await call<Order>(`charge ${store.name}`, "/v2/checkout/orders", { method: "POST", json: body, requestId });
    if (!res.ok) {
      findings.push(`${store.name}: vault charge refused, ${res.error.status} ${res.error.issue}: ${JSON.stringify(res.error.details)}.`);
      continue;
    }
    let status = res.body.status;
    let captureStatus = res.body.purchase_units?.[0]?.payments?.captures?.[0]?.status;
    let path = "one call";
    if (status === "APPROVED" || status === "CREATED") {
      const cap = await call<Order>(`capture ${store.name}`, `/v2/checkout/orders/${res.body.id}/capture`, { method: "POST", json: {}, requestId: `${requestId}-capture` });
      path = "a separate capture";
      if (cap.ok) {
        status = cap.body.status;
        captureStatus = cap.body.purchase_units?.[0]?.payments?.captures?.[0]?.status;
      } else {
        findings.push(`${store.name}: capture after the vault order failed, ${cap.error.status} ${cap.error.issue}.`);
        continue;
      }
    }
    // The create answer is minimal by default: read the order back to check payee and custom_id.
    const read = await call<Order>(`read ${store.name} order`, `/v2/checkout/orders/${res.body.id}`);
    const unit = read.ok ? read.body.purchase_units?.[0] : res.body.purchase_units?.[0];
    if (status === "COMPLETED") completed++;
    findings.push(
      `${store.name}: order ${status} through ${path}, capture ${captureStatus ?? "not returned"}; payee ${unit?.payee?.merchant_id === payee ? "kept" : `returned as ${unit?.payee?.merchant_id ?? "missing"}`}; custom_id ${unit?.custom_id === customId ? "kept" : (unit?.custom_id ?? "missing")}.`,
    );
  }

  findings.push(
    completed === STORES.length
      ? "R2 decided: merchant initiated vault charges to all three payees complete without the buyer, so the agent pays on its own after the buyer links PayPal once; the per payment approval fallback (T052) is not needed."
      : `R2 open: ${completed} of ${STORES.length} vault charges completed; see the lines above before choosing the fallback.`,
  );
  learn("03-vault-charge-payee", findings);
});
