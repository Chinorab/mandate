/**
 * The agent's messages are shown as plain text (seen while filming: the model sometimes answers in
 * Markdown, and the chat showed the asterisks and list dashes). plainText keeps the words and drops
 * the markup, and never leaves a dash as punctuation.
 */
import { describe, expect, it } from "vitest";
import { plainText } from "@/lib/agents/transcript";

describe("plainText", () => {
  it("turns a Markdown list into one line per item, without markers or emphasis", () => {
    const md = "I found three options.\n\n- **Cadence 2 (beige):** $96.34 total, free shipping.\n- **Daily Miler (black and white):** $103.92 total.\n* __Stride__ (gray): $107.17 total.";
    expect(plainText(md)).toBe("I found three options.\n\nCadence 2 (beige): $96.34 total, free shipping.\nDaily Miler (black and white): $103.92 total.\nStride (gray): $107.17 total.");
  });

  it("removes inline list markers that follow a sentence, headings, code ticks and dash punctuation", () => {
    expect(plainText("## Options\nPay now - or later — your call. Use `pay_cart`.")).toBe("Options\nPay now, or later, your call. Use pay_cart.");
    expect(plainText("Totals: $96.34. - **Daily Miler:** $103.92.")).toBe("Totals: $96.34.\nDaily Miler: $103.92.");
  });

  it("leaves plain sentences and hyphenated words alone", () => {
    const plain = "The Daily Miler is a well-cushioned trainer at $103.92, order 721422.";
    expect(plainText(plain)).toBe(plain);
  });
});
