/**
 * Sandbox script 02 (T014): save the test buyer's PayPal for later merchant initiated payments.
 *
 *   pnpm tsx scripts/02-vault-setup.ts            create a setup token, print the link the test buyer
 *                                                 approves
 *   pnpm tsx scripts/02-vault-setup.ts --confirm  turn the approved setup token into a payment token
 *
 * The script uses the setup token's approval link; the app uses the JS SDK v6 save flow
 * (components/mandate/LinkPayPal.tsx) on the same server calls. The payment token and customer id
 * are written to .scripts-state/ (git ignored) for scripts 03 and 07.
 */
import { call, learn, readState, run, writeState } from "./lib/sandbox";

type SetupToken = { id: string; status: string; links?: { rel: string; href: string }[] };
type PaymentToken = { id: string; customer?: { id: string }; payment_source?: { paypal?: { email_address?: string; usage_type?: string } } };

function setupBody(usagePattern: string) {
  return {
    payment_source: {
      paypal: {
        description: "Payments by your shopping agent under mandate MDTSANDBOX2",
        usage_type: "MERCHANT",
        usage_pattern: usagePattern,
        customer_type: "CONSUMER",
        permit_multiple_payment_tokens: true,
        experience_context: {
          brand_name: "Mandate sandbox",
          shipping_preference: "NO_SHIPPING",
          // Distinct, readable return addresses: the address bar tells whether PayPal approved or cancelled.
          return_url: "https://example.com/mandate-vault-APPROVED",
          cancel_url: "https://example.com/mandate-vault-CANCELLED",
        },
      },
    },
  };
}

run(async () => {
  if (process.argv.includes("--confirm")) return confirm();

  const notes: string[] = [];
  let used = "UNSCHEDULED_PREPAID";
  let res = await call<SetupToken>("setup token (UNSCHEDULED_PREPAID)", "/v3/vault/setup-tokens", {
    method: "POST",
    json: setupBody(used),
    requestId: `sandbox-02-${Date.now()}`,
  });
  if (!res.ok) {
    notes.push(`Setup token with usage_pattern UNSCHEDULED_PREPAID was refused: ${res.error.status} ${res.error.issue}, ${res.error.message}.`);
    used = "IMMEDIATE";
    res = await call<SetupToken>("setup token (IMMEDIATE)", "/v3/vault/setup-tokens", {
      method: "POST",
      json: setupBody(used),
      requestId: `sandbox-02-${Date.now()}`,
    });
  }
  if (!res.ok) {
    learn("02-vault-setup", [...notes, `Setup token with usage_pattern IMMEDIATE was refused too: ${res.error.status} ${res.error.issue}, ${res.error.message}.`]);
    return;
  }
  const approve = res.body.links?.find((l) => l.rel === "approve" || l.rel === "payer-action")?.href;
  writeState("02-setup", { setupTokenId: res.body.id, usagePattern: used });
  learn("02-vault-setup", [
    ...notes,
    `Setup token created with usage_type MERCHANT, customer_type CONSUMER and usage_pattern ${used}; status ${res.body.status}; approval link rel "${res.body.links?.find((l) => l.href === approve)?.rel ?? "none"}".`,
  ]);
  console.log(`\nNext: open this link, log in as the sandbox test buyer, agree to save PayPal, then run the script with --confirm:\n${approve ?? "(no approval link returned)"}`);
});

async function confirm() {
  const state = readState<{ setupTokenId: string; usagePattern: string }>("02-setup");
  if (!state) throw new Error("Run the script without --confirm first.");
  const before = await call<SetupToken>("read the setup token", `/v3/vault/setup-tokens/${state.setupTokenId}`);
  const res = await call<PaymentToken>("payment token from the setup token", "/v3/vault/payment-tokens", {
    method: "POST",
    json: { payment_source: { token: { id: state.setupTokenId, type: "SETUP_TOKEN" } } },
    // A new id per attempt: PayPal replays the stored answer for a reused PayPal-Request-Id.
    requestId: `sandbox-02-confirm-${state.setupTokenId}-${Date.now()}`,
  });
  if (!res.ok) {
    learn("02-vault-setup", [
      `Setup token status before exchange: ${before.ok ? before.body.status : "not readable"}.`,
      `Payment token creation failed: ${res.error.status} ${res.error.issue}, ${res.error.message}.`,
    ]);
    return;
  }
  writeState("02-payment-token", { paymentTokenId: res.body.id, customerId: res.body.customer?.id ?? null, usagePattern: state.usagePattern });
  learn("02-vault-setup", [
    `Setup token status after the test buyer approved: ${before.ok ? before.body.status : "not readable"}.`,
    `Payment token created from the setup token; a customer id ${res.body.customer?.id ? "was" : "was not"} returned; usage_type on the token: ${res.body.payment_source?.paypal?.usage_type ?? "not returned"}.`,
    "The payment token id and customer id are kept server side only (here in .scripts-state, in the app in the mandate row).",
  ]);
}
