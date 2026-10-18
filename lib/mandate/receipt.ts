/**
 * Receipt PDF (FR-023): instructions, every signed version with its time, terms and fingerprint,
 * the attached orders and blocked carts, and the canonical records so anyone can recompute the
 * fingerprints with any SHA256 tool. Standard PDF fonts only, no network.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatEt } from "@/lib/check/explain";
import { formatUsd } from "@/lib/pricing";
import type { Activity } from "./activity";

const PAGE = { w: 612, h: 792, margin: 56 };
const INK = rgb(0.07, 0.08, 0.09);
const INK3 = rgb(0.38, 0.4, 0.43);
const HAIRLINE = rgb(0.84, 0.85, 0.84);

/** Keep only characters the standard fonts can encode (WinAnsi). */
function safe(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of safe(text).split("\n")) {
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      const next = line + word;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
        continue;
      }
      if (line.trim()) out.push(line.trimEnd());
      // Break words longer than the line (hashes, canonical JSON).
      let rest = word.trimStart();
      while (font.widthOfTextAtSize(rest, size) > width) {
        let cut = rest.length;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    out.push(line.trimEnd());
  }
  return out;
}

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(
    private doc: PDFDocument,
    readonly sans: PDFFont,
    readonly bold: PDFFont,
    readonly mono: PDFFont,
  ) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage([PAGE.w, PAGE.h]);
    this.y = PAGE.h - PAGE.margin;
  }
  ensure(h: number) {
    if (this.y - h < PAGE.margin + 24) this.newPage();
  }
  text(text: string, opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {}) {
    const font = opts.font ?? this.sans;
    const size = opts.size ?? 10;
    const x = opts.x ?? PAGE.margin;
    const width = opts.width ?? PAGE.w - PAGE.margin - x;
    for (const l of wrap(text, font, size, width)) {
      this.ensure(size * 1.4);
      this.page.drawText(l, { x, y: this.y - size, size, font, color: opts.color ?? INK });
      this.y -= size * 1.4;
    }
    this.y -= opts.gap ?? 0;
  }
  rule() {
    this.ensure(12);
    this.page.drawLine({ start: { x: PAGE.margin, y: this.y - 4 }, end: { x: PAGE.w - PAGE.margin, y: this.y - 4 }, thickness: 0.6, color: HAIRLINE });
    this.y -= 14;
  }
  field(label: string, value: string, font?: PDFFont, size = 10) {
    const startY = this.y;
    this.ensure(14);
    this.page.drawText(safe(label), { x: PAGE.margin, y: this.y - 10, size: 9, font: this.sans, color: INK3 });
    this.y = startY;
    this.text(value, { x: PAGE.margin + 120, font, size, gap: 4 });
  }
}

const OUTCOME: Record<string, string> = {
  paid: "Compliant, paid",
  blocked: "Blocked, not paid",
  cancelled: "Cancelled, not paid",
  not_paid: "Checked, PayPal unavailable",
  checked: "Checked, not paid",
  open: "Open",
};

export async function renderReceipt(a: Activity, now: Date): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Mandate receipt ${a.code}`);
  doc.setAuthor("Mandate");
  doc.setSubject("Signed purchasing mandate, versions, checks and orders");
  doc.setCreationDate(now);
  doc.setModificationDate(now);
  const w = new Writer(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold), await doc.embedFont(StandardFonts.Courier));

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

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(safe(`Sandbox demo. Mandate is not affiliated with PayPal.   ${a.code}   Page ${i + 1} of ${pages.length}`), {
      x: PAGE.margin,
      y: 28,
      size: 8,
      font: w.sans,
      color: INK3,
    });
  });
  return doc.save();
}
