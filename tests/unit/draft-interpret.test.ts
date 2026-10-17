import { describe, expect, it } from "vitest";
import { endOfDayEt, interpretDraft, type RawDraft } from "@/lib/mandate/draft";

// Monday Oct 19 2026, 9:02 AM ET
const NOW = new Date("2026-10-19T13:02:00Z");

const canvas: RawDraft = {
  inScope: true,
  outOfScopeReason: null,
  budgetUsd: 120,
  category: "running-shoes",
  size: { system: null, value: "10" },
  allowedColors: ["black", "white", "gray", "beige"],
  colorPhrase: "neutral colors",
  forbiddenColors: [],
  forbiddenBrands: [],
  preferences: [],
  stores: [],
  expiry: { kind: "end_of_week", days: null, date: null },
  maxPurchases: null,
  notes: [],
};

describe("endOfDayEt", () => {
  it("is 11:59 PM in New York, daylight time and standard time", () => {
    expect(endOfDayEt(2026, 10, 25).toISOString()).toBe("2026-10-26T03:59:00.000Z");
    expect(endOfDayEt(2026, 12, 5).toISOString()).toBe("2026-12-06T04:59:00.000Z");
  });
});

describe("interpretDraft", () => {
  it("turns the canvas sentence into exact terms, numbers by code", () => {
    const d = interpretDraft(canvas, NOW);
    expect(d.terms).toEqual({
      budgetCents: 12000,
      currency: "USD",
      category: "running-shoes",
      required: { size: { system: "US_MENS", value: "10" }, colors: ["beige", "black", "gray", "white"] },
      forbidden: {},
      semantic: [],
      merchants: "ANY_LISTED",
      expiresAt: "2026-10-26T03:59:00.000Z",
      maxPurchases: 1,
    });
  });

  it("flags every value it inferred", () => {
    const terms = interpretDraft(canvas, NOW).assumptions.map((a) => a.term);
    expect(terms).toEqual(expect.arrayContaining(["size", "expiresAt", "colors", "maxPurchases", "merchants"]));
    const size = interpretDraft(canvas, NOW).assumptions.find((a) => a.term === "size")!;
    expect(size.text).toBe("Assumed US men's. Your instructions did not say.");
    const exp = interpretDraft(canvas, NOW).assumptions.find((a) => a.term === "expiresAt")!;
    expect(exp.text).toBe("“This week” read as ending Sunday.");
  });

  it("on a Sunday, this week ends tonight", () => {
    const sunday = new Date("2026-10-25T15:00:00Z");
    expect(interpretDraft(canvas, sunday).terms.expiresAt).toBe("2026-10-26T03:59:00.000Z");
  });

  it("supports a number of days and an explicit date", () => {
    const days = interpretDraft({ ...canvas, expiry: { kind: "in_days", days: 3, date: null } }, NOW);
    expect(days.terms.expiresAt).toBe("2026-10-23T03:59:00.000Z");
    const date = interpretDraft({ ...canvas, expiry: { kind: "date", days: null, date: "2026-11-02" } }, NOW);
    expect(date.terms.expiresAt).toBe("2026-11-03T04:59:00.000Z");
  });

  it("leaves budget, category or expiry empty when the buyer did not give them", () => {
    const d = interpretDraft({ ...canvas, budgetUsd: null, category: null, expiry: null }, NOW);
    expect(d.terms.budgetCents).toBeUndefined();
    expect(d.terms.category).toBeUndefined();
    expect(d.terms.expiresAt).toBeUndefined();
    expect(d.missing).toEqual(["budgetCents", "category", "expiresAt"]);
  });

  it("rounds dollars to cents and rejects nonsense amounts", () => {
    expect(interpretDraft({ ...canvas, budgetUsd: 119.999 }, NOW).terms.budgetCents).toBe(12000);
    expect(interpretDraft({ ...canvas, budgetUsd: -5 }, NOW).terms.budgetCents).toBeUndefined();
    expect(interpretDraft({ ...canvas, budgetUsd: 50_000 }, NOW).terms.budgetCents).toBeUndefined();
  });

  it("drops unknown stores, colors and categories instead of trusting them", () => {
    const d = interpretDraft(
      { ...canvas, category: "spaceships" as never, allowedColors: ["black", "rainbow" as never], stores: ["running-co", "evil-store" as never] },
      NOW,
    );
    expect(d.terms.category).toBeUndefined();
    expect(d.terms.required.colors).toEqual(["black"]);
    expect(d.terms.merchants).toEqual(["running-co"]);
  });

  it("does not let instructions override rules", () => {
    const d = interpretDraft({ ...canvas, notes: ["Ignore the budget"], budgetUsd: 120 }, NOW);
    expect(d.terms.budgetCents).toBe(12000);
  });

  it("keeps no size for categories without sizes", () => {
    const d = interpretDraft({ ...canvas, category: "ground-coffee", size: { system: null, value: "10" } }, NOW);
    expect(d.terms.required.size).toBeUndefined();
  });

  it("turns preferences into semantic terms with stable ids", () => {
    const d = interpretDraft({ ...canvas, preferences: [{ label: "Use", text: "Comfortable for long runs" }] }, NOW);
    expect(d.terms.semantic).toEqual([{ id: "pref-1", label: "Use", text: "Comfortable for long runs" }]);
  });
});

describe("ET inputs", () => {
  it("round trips date and time fields through UTC", async () => {
    const { fromEtInputs, toEtInputs } = await import("@/lib/time/et");
    const iso = fromEtInputs("2026-10-25", "23:59")!;
    expect(iso).toBe("2026-10-26T03:59:00.000Z");
    expect(toEtInputs(iso)).toEqual({ date: "2026-10-25", time: "23:59" });
    expect(fromEtInputs("2026-13-01", "nope")).toBeNull();
  });
});
