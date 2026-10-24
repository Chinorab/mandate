/**
 * Sandbox script 07 (T019): revoking a mandate removes the agent's ability to pay.
 *
 *   pnpm tsx scripts/07-revoke.ts
 *
 * Deletes the payment token saved by script 02 (DELETE /v3/vault/payment-tokens/{id}, as the app does
 * on revoke), then tries the same merchant initiated charge as script 03. The charge must be refused.
 * The token is gone afterwards: run script 02 again (with the test buyer) before script 03.
 */
import { call, env, learn, readState, run, writeState } from "./lib/sandbox";

run(async () => {
  const token = readState<{ paymentTokenId: string; usagePattern: string }>("02-payment-token");
  if (!token) throw new Error("No saved payment token: run scripts/02-vault-setup.ts first.");

  const del = await call<unknown>("delete the payment token", `/v3/vault/payment-tokens/${token.paymentTokenId}`, { method: "DELETE" });
  const read = await call<unknown>("read the deleted token", `/v3/vault/payment-tokens/${token.paymentTokenId}`);
  const charge = await call<{ status: string }>("charge with the deleted token", "/v2/checkout/orders", {
    method: "POST",
    requestId: `sandbox-07-${Date.now()}`,
    json: {
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: `MDTSANDBOX7:1:${"7".repeat(64)}`,
          amount: { currency_code: "USD", value: "103.92" },
          payee: { merchant_id: env("PAYPAL_MERCHANT_ID_SPORTS_OUTLET") },
        },
      ],
      payment_source: {
        paypal: { vault_id: token.paymentTokenId, stored_credential: { payment_initiator: "MERCHANT", usage: "SUBSEQUENT", usage_pattern: token.usagePattern } },
      },
    },
  });

  if (del.ok) writeState("02-payment-token", { deleted: true, paymentTokenId: null });
  learn("07-revoke", [
    del.ok ? "DELETE /v3/vault/payment-tokens/{id} succeeded (no content)." : `Deleting the payment token failed: ${del.error.status} ${del.error.issue}.`,
    read.ok ? "The deleted token could still be read back." : `Reading the deleted token answers ${read.error.status} ${read.error.issue}.`,
    charge.ok
      ? `A charge with the deleted token was NOT refused (status ${charge.body.status}): revocation must not rely on the token deletion alone.`
      : `A charge with the deleted token is refused: ${charge.error.status} ${charge.error.issue}${Array.isArray(charge.error.details) ? ` (${(charge.error.details as { issue?: string }[]).map((d) => d.issue).join(", ")})` : ""}. Revocation removes the agent's ability to pay at PayPal too, on top of the gate's own refusal.`,
  ]);
});
