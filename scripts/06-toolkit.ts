/**
 * Sandbox script 06 (T018): the PayPal Agent Toolkit actions the app enables, against the sandbox.
 *
 *   pnpm tsx scripts/06-toolkit.ts
 *
 * Uses the same wrapper as the app (lib/payments/toolkit.ts): read and tracking tools only, money
 * moving tools refused by name. Reads the order captured in script 01, adds tracking to it, and lists
 * disputes (empty until one is opened as the sandbox buyer).
 */
import { getToolkit, MONEY_MOVING_TOOLKIT_TOOLS } from "../lib/payments/toolkit";
import { learn, mask, paypal, readState, run } from "./lib/sandbox";

const short = (s: string) => (s.length > 600 ? `${s.slice(0, 600)}...` : s);

run(async () => {
  const toolkit = await getToolkit(process.env);
  if (!toolkit) throw new Error("PayPal keys are missing in .env.local");
  const state = readState<{ orderId: string }>("01-order");
  if (!state) throw new Error("Run scripts/01-auth-and-order.ts (both steps) first.");

  const names = ["get_order", "list_disputes", "get_dispute", "create_shipment_tracking", "get_shipment_tracking", "list_transactions"];
  const defs = toolkit.tools(names);
  console.log("Enabled toolkit tools:", defs.map((d) => d.name).join(", "));
  for (const d of defs) console.log(`  ${d.name} parameters: ${Object.keys((d.parameters as { properties?: object }).properties ?? {}).join(", ")}`);
  const findings: string[] = [`Toolkit tools available with the app's configuration: ${defs.map((d) => d.name).join(", ")}.`];

  const attempt = async (name: string, args: Record<string, unknown>) => {
    console.log(`\n> toolkit ${name} ${JSON.stringify(mask(args))}`);
    try {
      const out = await toolkit.call(name, args);
      console.log(`< ${short(out)}`);
      // The toolkit returns PayPal errors as content instead of throwing.
      let parsed: { ok?: boolean; errors?: { name?: string; details?: { issue?: string }[] }[]; status?: number } = {};
      try {
        parsed = JSON.parse(out);
      } catch {
        // Plain text answer.
      }
      if (parsed.ok === false || (parsed.errors?.length ?? 0) > 0) {
        const e = parsed.errors?.[0];
        return { ok: false as const, msg: e ? `${e.name}${e.details?.[0]?.issue ? ` (${e.details[0].issue})` : ""}` : `HTTP ${parsed.status}` };
      }
      return { ok: true as const, out };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`< error: ${msg}`);
      return { ok: false as const, msg };
    }
  };

  const order = await attempt("get_order", { id: state.orderId });
  findings.push(order.ok ? `get_order returned the script 01 order${order.out.includes("MDTSANDBOX1") ? ", with the mandate custom_id" : ""}.` : `get_order failed: ${order.msg}.`);

  const raw = await paypal.request<{ purchase_units?: { payments?: { captures?: { id: string }[] } }[] }>(`/v2/checkout/orders/${state.orderId}`);
  const captureId = raw.purchase_units?.[0]?.payments?.captures?.[0]?.id;
  if (captureId) {
    const track = await attempt("create_shipment_tracking", {
      order_id: state.orderId,
      transaction_id: captureId,
      tracking_number: `1Z999AA1${String(Date.now()).slice(-10)}`,
      carrier: "UPS",
      status: "SHIPPED",
    });
    findings.push(track.ok ? "create_shipment_tracking accepted UPS tracking for the captured order (order_id + transaction_id = capture id)." : `create_shipment_tracking failed: ${track.msg}.`);
    const got = await attempt("get_shipment_tracking", { order_id: state.orderId });
    findings.push(got.ok ? "get_shipment_tracking returned the tracking for the order." : `get_shipment_tracking failed: ${got.msg}.`);
  }

  const disputes = await attempt("list_disputes", {});
  findings.push(disputes.ok ? `list_disputes answered (${/dispute_id/.test(disputes.out) ? "with disputes" : "no dispute yet"}).` : `list_disputes failed: ${disputes.msg}.`);

  const tx = await attempt("list_transactions", {});
  findings.push(tx.ok ? "list_transactions answered." : `list_transactions failed: ${tx.msg}.`);

  let refused = 0;
  for (const name of MONEY_MOVING_TOOLKIT_TOOLS) {
    try {
      await toolkit.call(name, {});
    } catch {
      refused++;
    }
  }
  findings.push(`The wrapper refused all ${refused} of ${MONEY_MOVING_TOOLKIT_TOOLS.length} money moving toolkit tools by name, before any call to PayPal.`);
  learn("06-toolkit", findings);
});
