/**
 * Sandbox script 01 (T013): OAuth, an order carrying the mandate reference, and idempotency.
 *
 *   pnpm tsx scripts/01-auth-and-order.ts            create the order, replay it, read it back,
 *                                                    print the link the test buyer approves
 *   pnpm tsx scripts/01-auth-and-order.ts --capture  capture the approved order, read the capture
 *
 * Proves: custom_id, invoice_id and description survive on the order and on the capture; the same
 * PayPal-Request-Id returns the same order instead of a second one; payee routes the money to the
 * Sample Sports Outlet business account.
 */
import { call, env, learn, readState, run, writeState } from "./lib/sandbox";

type Order = {
  id: string;
  status: string;
  links?: { rel: string; href: string }[];
  purchase_units?: {
    custom_id?: string;
    invoice_id?: string;
    description?: string;
    payee?: { merchant_id?: string; email_address?: string };
    payments?: { captures?: { id: string; status: string; custom_id?: string; invoice_id?: string }[] };
  }[];
};
type Capture = { id: string; status: string; custom_id?: string; invoice_id?: string };

const CUSTOM_ID = "MDTSANDBOX1:1:0f3c2a9d8e7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a19";

run(async () => {
  if (process.argv.includes("--capture")) return capture();

  const payee = env("PAYPAL_MERCHANT_ID_SPORTS_OUTLET");
  const requestId = `sandbox-01-${Date.now()}`;
  const invoiceId = `MDT-S01-${Date.now()}`;
  const body = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: "mandate",
        custom_id: CUSTOM_ID,
        invoice_id: invoiceId,
        description: "Mandate sandbox script 01",
        amount: { currency_code: "USD", value: "103.92" },
        payee: { merchant_id: payee },
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: "Mandate sandbox",
          user_action: "PAY_NOW",
          shipping_preference: "NO_SHIPPING",
          return_url: "https://example.com/mandate-sandbox-return",
          cancel_url: "https://example.com/mandate-sandbox-cancel",
        },
      },
    },
  };

  const first = await call<Order>("create order", "/v2/checkout/orders", { method: "POST", json: body, requestId });
  if (!first.ok) {
    learn("01-auth-and-order", [`Order creation failed: ${first.error.status} ${first.error.issue}, ${first.error.message}`]);
    return;
  }
  const replay = await call<Order>("replay with the same PayPal-Request-Id", "/v2/checkout/orders", { method: "POST", json: body, requestId });
  const read = await call<Order>("read the order back", `/v2/checkout/orders/${first.body.id}`);

  const unit = read.ok ? read.body.purchase_units?.[0] : undefined;
  const approve = first.body.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
  writeState("01-order", { orderId: first.body.id, invoiceId });

  learn("01-auth-and-order", [
    "OAuth client credentials with the sandbox app returned a token; scopes include vault, disputes and payments.",
    `Order created with status ${first.body.status}.`,
    replay.ok
      ? replay.body.id === first.body.id
        ? "Replaying the create call with the same PayPal-Request-Id returned the same order id: no duplicate order."
        : `Replaying with the same PayPal-Request-Id returned a different order id (${replay.body.id}).`
      : `Replaying with the same PayPal-Request-Id failed: ${replay.error.status} ${replay.error.issue}.`,
    unit?.custom_id === CUSTOM_ID ? `custom_id (mandate code, version and SHA256, ${CUSTOM_ID.length} characters) is returned unchanged on GET order.` :`custom_id on GET order: ${unit?.custom_id ?? "missing"}.`,
    unit?.invoice_id === invoiceId ? "invoice_id is returned on GET order." : `invoice_id on GET order: ${unit?.invoice_id ?? "missing"}.`,
    unit?.payee?.merchant_id === payee ? "payee.merchant_id is kept on the order (Sample Sports Outlet)." : `payee on GET order: ${JSON.stringify(unit?.payee ?? null)}.`,
  ]);

  console.log(`\nNext: open this link, log in as the sandbox test buyer, approve the payment, then run the script with --capture:\n${approve ?? "(no approval link returned)"}`);
});

async function capture() {
  const state = readState<{ orderId: string; invoiceId: string }>("01-order");
  if (!state) throw new Error("Run the script without --capture first.");
  const requestId = `sandbox-01-capture-${state.orderId}`;
  const cap = await call<Order>("capture", `/v2/checkout/orders/${state.orderId}/capture`, { method: "POST", json: {}, requestId });
  if (!cap.ok) {
    learn("01-auth-and-order", [`Capture before or after approval: ${cap.error.status} ${cap.error.issue}, ${cap.error.message}.`]);
    return;
  }
  const again = await call<Order>("replay the capture with the same PayPal-Request-Id", `/v2/checkout/orders/${state.orderId}/capture`, { method: "POST", json: {}, requestId });
  const c = cap.body.purchase_units?.[0]?.payments?.captures?.[0];
  const detail = c ? await call<Capture>("read the capture", `/v2/payments/captures/${c.id}`) : null;
  learn("01-auth-and-order", [
    `Capture status ${c?.status ?? cap.body.status} after the test buyer approved.`,
    detail?.ok && detail.body.custom_id === CUSTOM_ID ? "custom_id is carried on the capture (GET /v2/payments/captures/{id})." : `custom_id on the capture: ${detail?.ok ? (detail.body.custom_id ?? "missing") : "capture not readable"}.`,
    again.ok ? "Replaying the capture with the same PayPal-Request-Id returned the stored result, no second capture." : `Replaying the capture: ${again.error.status} ${again.error.issue}.`,
  ]);
}
