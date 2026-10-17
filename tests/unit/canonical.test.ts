import { describe, expect, it } from "vitest";
import { canonicalize, fingerprint, sha256Hex } from "@/lib/mandate/canonical";
import { parseTerms, type Terms } from "@/lib/mandate/terms";

const base: Terms = {
  budgetCents: 12000,
  currency: "USD",
  category: "running-shoes",
  required: { size: { system: "US_MENS", value: "10" }, colors: ["white", "black", "gray", "beige"] },
  forbidden: { colors: ["volt-yellow"] },
  semantic: [],
  merchants: "ANY_LISTED",
  expiresAt: "2026-10-26T03:59:00.000Z",
  maxPurchases: 1,
};

describe("canonicalize", () => {
  it("sorts object keys recursively and drops undefined", () => {
    expect(canonicalize({ b: 1, a: { d: undefined, c: [3, 1] } })).toBe('{"a":{"c":[3,1]},"b":1}');
  });

  it("is stable whatever the key insertion order", () => {
    const reordered = {
      maxPurchases: 1,
      expiresAt: base.expiresAt,
      merchants: "ANY_LISTED",
      semantic: [],
      forbidden: { colors: ["volt-yellow"] },
      required: { colors: ["white", "black", "gray", "beige"], size: { value: "10", system: "US_MENS" } },
      category: "running-shoes",
      currency: "USD",
      budgetCents: 12000,
    };
    expect(fingerprint("MDT4K7Q21", 1, parseTerms(reordered)).sha256).toBe(
      fingerprint("MDT4K7Q21", 1, base).sha256,
    );
  });
});

describe("fingerprint", () => {
  it("treats id lists as sets (order does not change the hash)", () => {
    const shuffled = { ...base, required: { ...base.required, colors: ["beige", "gray", "black", "white"] } };
    expect(fingerprint("MDT4K7Q21", 1, parseTerms(shuffled)).sha256).toBe(
      fingerprint("MDT4K7Q21", 1, base).sha256,
    );
  });

  it("normalizes equivalent expiry instants", () => {
    const sameInstant = { ...base, expiresAt: "2026-10-25T23:59:00-04:00" };
    expect(fingerprint("MDT4K7Q21", 1, parseTerms(sameInstant)).sha256).toBe(
      fingerprint("MDT4K7Q21", 1, base).sha256,
    );
  });

  it("changes when any single term changes", () => {
    const h = fingerprint("MDT4K7Q21", 1, base).sha256;
    const variants: Terms[] = [
      { ...base, budgetCents: 12001 },
      { ...base, category: "trail-shoes" },
      { ...base, required: { ...base.required, size: { system: "US_MENS", value: "10.5" } } },
      { ...base, forbidden: {} },
      { ...base, merchants: ["sports-outlet"] },
      { ...base, expiresAt: "2026-10-26T04:00:00.000Z" },
      { ...base, maxPurchases: 2 },
    ];
    for (const v of variants) expect(fingerprint("MDT4K7Q21", 1, v).sha256).not.toBe(h);
  });

  it("binds the mandate code and version into the hash", () => {
    const h = fingerprint("MDT4K7Q21", 1, base).sha256;
    expect(fingerprint("MDT4K7Q22", 1, base).sha256).not.toBe(h);
    expect(fingerprint("MDT4K7Q21", 2, base).sha256).not.toBe(h);
  });

  it("treats an empty optional list like an absent one", () => {
    const empty = { ...base, forbidden: { colors: [] } };
    const absent = { ...base, forbidden: {} };
    expect(fingerprint("M", 1, parseTerms(empty)).sha256).toBe(fingerprint("M", 1, parseTerms(absent)).sha256);
  });

  it("is a 64 char hex SHA-256 of the canonical string", () => {
    const f = fingerprint("MDT4K7Q21", 1, base);
    expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex(f.canonical)).toBe(f.sha256);
    expect(f.canonical.startsWith('{"mandate":"MDT4K7Q21","terms":')).toBe(true);
  });
});

describe("parseTerms", () => {
  it("rejects missing budget, category or expiry", () => {
    const { budgetCents: _b, ...noBudget } = base;
    const { category: _c, ...noCategory } = base;
    const { expiresAt: _e, ...noExpiry } = base;
    for (const t of [noBudget, noCategory, noExpiry]) expect(() => parseTerms(t)).toThrow();
  });

  it("rejects non integer or negative money and unknown keys", () => {
    expect(() => parseTerms({ ...base, budgetCents: 119.99 })).toThrow();
    expect(() => parseTerms({ ...base, budgetCents: -1 })).toThrow();
    expect(() => parseTerms({ ...base, ignoreBudget: true })).toThrow();
    expect(() => parseTerms({ ...base, currency: "EUR" })).toThrow();
  });
});
