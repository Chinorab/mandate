/**
 * Receipt PDF (FR-023): instructions, every signed version with its time, terms and fingerprint,
 * the attached orders and blocked carts, and the canonical records so anyone can recompute the
 * fingerprints with any SHA256 tool. Standard PDF fonts only, no network.
 */
import { formatEt } from "@/lib/check/explain";
import { formatUsd } from "@/lib/pricing";
import { INK3, finish, newWriter } from "@/lib/pdf/writer";
import type { Activity } from "./activity";

const OUTCOME: Record<string, string> = {
  paid: "Compliant, paid",
  blocked: "Blocked, not paid",
  cancelled: "Cancelled, not paid",
  not_paid: "Checked, PayPal unavailable",
  checked: "Checked, not paid",
  open: "Open",
};

export async function renderReceipt(a: Activity, now: Date): Promise<Uint8Array> {
  const { doc, w } = await newWriter({ title: `Mandate receipt ${a.code}`, subject: "Signed purchasing mandate, versions, checks and orders", now });

  w.text("Mandate receipt", { font: w.bold, size: 20, gap: 2 });
  w.text(`Issued ${formatEt(now)}`, { color: INK3, size: 9, gap: 10 });
  w.rule();
  w.field("Mandate", a.code, w.mono);
  w.field("Holder", a.receipt.session);
  w.field("Status", a.status.charAt(0).toUpperCase() + a.status.slice(1));
  w.field("Instructions", `"${a.instructions}"`);
  w.field("Current terms", a.receipt.terms);
  w.field("Fingerprint", a.receipt.fingerprint ? `SHA256 ${a.receipt.fingerprint}` : "Not signed", w.mono, 7.5);
  w.field("Orders", a.receipt.orders);
  w.y -= 8;

  w.text("Signed versions", { font: w.bold, size: 12, gap: 4 });
  w.rule();
  for (const v of a.versions) {
    w.text(`Version ${v.versionNo}, signed ${formatEt(new Date(v.signedAt))}`, { font: w.bold, size: 10, gap: 2 });
    w.text(v.terms, { gap: 2 });
    if (v.changes.length) w.text(`Changes: ${v.changes.map((c) => `${c.label} ${c.from} to ${c.to}`).join("; ")}`, { color: INK3, gap: 2 });
    w.text(`SHA256 ${v.sha256}`, { font: w.mono, size: 8, gap: 8 });
  }

  w.text("Attached activity", { font: w.bold, size: 12, gap: 4 });
  w.rule();
  if (a.activity.length === 0) w.text("No carts were checked under this mandate.", { color: INK3, gap: 8 });
  for (const r of a.activity) {
    w.text(
      `${formatEt(new Date(r.at))}   ${r.item}, ${r.store}   ${formatUsd(r.totalCents)}   ${r.passed === r.total ? `${r.passed} of ${r.total} terms pass` : `${r.total - r.passed} of ${r.total} terms fail`}   ${OUTCOME[r.outcome]}${r.orderCode ? `, order ${r.orderCode}` : ""}`,
      { gap: 4 },
    );
  }
  w.y -= 8;

  w.text("How to verify", { font: w.bold, size: 12, gap: 4 });
  w.rule();
  w.text("Each fingerprint is the SHA256 of the canonical record printed below, exactly as written, in UTF-8. Any SHA256 tool gives the same result. A different result means the record was changed.", { gap: 6 });
  for (const v of a.versions) {
    w.text(`Version ${v.versionNo} canonical record`, { color: INK3, size: 9, gap: 2 });
    w.text(v.canonical, { font: w.mono, size: 7, gap: 8 });
  }

  return finish(doc, w, a.code);
}
