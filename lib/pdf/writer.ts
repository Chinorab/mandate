/**
 * Small text layout helper over pdf-lib for the receipt and the evidence report: standard PDF fonts
 * only (no network, no embedded files), wrapped text, labelled fields, rules and page breaks.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export const PAGE = { w: 612, h: 792, margin: 56 };
export const INK = rgb(0.07, 0.08, 0.09);
export const INK3 = rgb(0.38, 0.4, 0.43);
const HAIRLINE = rgb(0.84, 0.85, 0.84);

/** Keep only characters the standard fonts can encode (WinAnsi). */
export function safe(text: string): string {
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

export class Writer {
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


export async function newWriter(meta: { title: string; subject: string; now: Date }) {
  const doc = await PDFDocument.create();
  doc.setTitle(meta.title);
  doc.setAuthor("Mandate");
  doc.setSubject(meta.subject);
  doc.setCreationDate(meta.now);
  doc.setModificationDate(meta.now);
  const w = new Writer(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold), await doc.embedFont(StandardFonts.Courier));
  return { doc, w };
}

/** Footer on every page, then the bytes. */
export async function finish(doc: PDFDocument, w: Writer, label: string): Promise<Uint8Array> {
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(safe(`Sandbox demo. Mandate is not affiliated with PayPal.   ${label}   Page ${i + 1} of ${pages.length}`), {
      x: PAGE.margin,
      y: 28,
      size: 8,
      font: w.sans,
      color: INK3,
    });
  });
  return doc.save();
}
