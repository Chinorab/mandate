/**
 * "Mandate evidence report" (research R5): the PDF sent to PayPal with the response. It holds only the
 * items the merchant kept included, each printed from the stored record, plus how to recompute the
 * mandate fingerprint. Buyers appear as their masked label only.
 */
import { formatUsd } from "@/lib/pricing";
import { INK3, finish, newWriter } from "@/lib/pdf/writer";
import { longEt, reasonLabel } from "./format";
import type { DisputeRecords, EvidenceItem } from "./items";

export async function renderEvidenceReport(r: DisputeRecords, items: EvidenceItem[], now: Date): Promise<Uint8Array> {
  const on = new Set(items.filter((i) => i.included).map((i) => i.key));
  const { doc, w } = await newWriter({ title: `Mandate evidence report ${r.dispute.paypalDisputeId}`, subject: "Evidence for a PayPal dispute on an agent order", now });

  w.text("Mandate evidence report", { font: w.bold, size: 20, gap: 2 });
  w.text(`Prepared ${longEt(now)} from the order records of ${r.order?.storeName ?? "the merchant"}.`, { color: INK3, size: 9, gap: 10 });
  w.rule();
  w.field("PayPal case", r.dispute.paypalDisputeId, w.mono);
  w.field("Reason", reasonLabel(r.dispute.reason));
  if (r.dispute.amountCents != null) w.field("Disputed amount", formatUsd(r.dispute.amountCents));
  if (r.dispute.openedAt) w.field("Opened", longEt(r.dispute.openedAt));
  if (r.order) w.field("Order", `${r.order.code}, ${r.order.item}`);
  w.y -= 8;

  if (on.has("mandate") && r.mandate) {
    const m = r.mandate;
    w.text("Signed mandate", { font: w.bold, size: 12, gap: 4 });
    w.rule();
    w.field("Mandate", `${m.code}, version ${m.versionNo}`, w.mono);
    w.field("Signed", longEt(m.signedAt));
    w.field("Terms", items.find((i) => i.key === "mandate")!.facts[1].replace(/^Mandate terms: /, ""));
    w.field("Fingerprint", `SHA256 ${m.sha256}`, w.mono, 7.5);
    w.text("The fingerprint is the SHA256 of the canonical record below, exactly as written, in UTF-8. Any SHA256 tool gives the same result; a different result means the record was changed.", { color: INK3, size: 9, gap: 4 });
    w.text(m.canonical, { font: w.mono, size: 7, gap: 10 });
  }

  if (on.has("check") && r.check) {
    const rows = r.check.terms.filter((t) => t.group === "term");
    w.text("Mandate check before payment", { font: w.bold, size: 12, gap: 4 });
    w.rule();
    w.field("Checked", longEt(r.check.at));
    w.field("Result", `${rows.filter((t) => t.pass).length} of ${rows.length} terms passed`);
    for (const t of rows) w.field(t.label, `${t.pass ? "Pass" : "Fail"}. ${t.actual}`);
    w.y -= 8;
  }

  if (on.has("transaction") && r.order) {
    const o = r.order;
    w.text("PayPal transaction", { font: w.bold, size: 12, gap: 4 });
    w.rule();
    w.field("Order", o.code, w.mono);
    w.field("Item", `${o.item}, from ${o.storeName}`);
    w.field("Amount", `${formatUsd(o.amountCents)}, captured ${longEt(o.paidAt)}`);
    if (o.paypalOrderId) w.field("PayPal order", o.paypalOrderId, w.mono);
    if (o.paypalCaptureId) w.field("PayPal capture", o.paypalCaptureId, w.mono);
    if (on.has("mandate")) w.field("custom_id", o.customId, w.mono, 7.5);
    w.y -= 8;
  }

  if (on.has("shipment") && r.order?.tracking) {
    w.text("Shipment", { font: w.bold, size: 12, gap: 4 });
    w.rule();
    w.field("Carrier", r.order.tracking.carrier);
    w.field("Tracking", r.order.tracking.number, w.mono);
    w.field("Status", r.order.shippingStatus === "delivered" ? "Delivered" : "Shipped");
  }

  return finish(doc, w, r.dispute.paypalDisputeId);
}
