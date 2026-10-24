/**
 * Landing content (FR-035, constitution V): every claim on the landing names a source with a link, the
 * three sources of the brief and American Banker are all cited, the example mandate's fingerprint is
 * real, and no copy uses dashes.
 */
import { describe, expect, it } from "vitest";
import { CLAIMS, COST_STAT, EXAMPLE, NYDFS_QUOTE, SOURCES } from "@/lib/landing/content";
import { fingerprint } from "@/lib/mandate/canonical";

const REQUIRED = [
  "https://merchantcostconsulting.com/?p=9509",
  "https://www.chargeflow.io/blog/ai-agent-chargeback-liability",
  "https://www.chargeflow.io/blog/agentic-commerce-chargebacks-the-evidence-playbook-merchants-need",
  "https://www.americanbanker.com/payments/news/new-york-financial-regulator-zeroing-in-on-agentic-commerce",
];

describe("landing sources", () => {
  it("cites the three brief sources and American Banker, each with publisher, title and date", () => {
    const urls = Object.values(SOURCES).map((s) => s.url);
    for (const url of REQUIRED) expect(urls).toContain(url);
    for (const s of Object.values(SOURCES)) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.publisher.length).toBeGreaterThan(2);
      expect(s.title.length).toBeGreaterThan(10);
      expect(s.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("ties every claim and the statistic to a known source, and every source is used", () => {
    const used = new Set([...CLAIMS.map((c) => c.source), COST_STAT.source, NYDFS_QUOTE.source]);
    for (const id of used) expect(SOURCES).toHaveProperty(id);
    expect(used.size).toBe(Object.keys(SOURCES).length);
  });

  it("keeps the statistic exactly as the source reports it, with who measured it", () => {
    expect(COST_STAT).toMatchObject({ from: "$36.9 billion", fromYear: 2026, to: "$46.1 billion", toYear: 2029 });
    expect(COST_STAT.measuredBy).toMatch(/Mastercard/);
  });

  it("uses no dashes in any copy", () => {
    const copy = [...CLAIMS.flatMap((c) => [c.title, c.text]), COST_STAT.caption, NYDFS_QUOTE.text, NYDFS_QUOTE.lead, EXAMPLE.instructions];
    for (const t of copy) expect(t).not.toMatch(/[–—]/);
  });
});

describe("example mandate", () => {
  it("shows the real fingerprint of its canonical record", () => {
    expect(EXAMPLE.sha256).toBe(fingerprint(EXAMPLE.code, 1, EXAMPLE.terms).sha256);
    expect(EXAMPLE.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
