import { describe, expect, it } from "vitest";
import { runMandateCheck, type CheckOutcome } from "@/lib/check/run";
import { fingerprint } from "@/lib/mandate/canonical";
import { CANVAS_TERMS, checkInput, line } from "../helpers/fixtures";

const row = (o: CheckOutcome, term: string) => {
  const r = o.terms.find((t) => t.term === term);
  if (!r) throw new Error(`No row ${term}: ${o.terms.map((t) => t.term).join(", ")}`);
  return r;
};
const failed = (o: CheckOutcome) => o.terms.filter((t) => !t.pass).map((t) => t.term);

describe("runMandateCheck: the canvas scenarios", () => {
  it("Daily Miler at Sample Sports Outlet passes 7 of 7 terms", () => {
    const o = runMandateCheck(checkInput());
    expect(o.verdict).toBe("pass");
    expect(o.summary).toEqual({ passed: 7, total: 7 });
    expect(o.terms.filter((t) => t.group === "term").map((t) => t.term)).toEqual([
      "budget",
      "category",
      "size",
      "colors",
      "merchant",
      "expiration",
      "purchases",
    ]);
    expect(o.totals).toMatchObject({ totalCents: 10392, remainingBudgetCents: 12000 });
    expect(row(o, "budget")).toMatchObject({
      allowed: "Up to $120.00 total",
      actual: "$103.92 total",
      explanation: "$16.08 under the limit",
    });
    expect(row(o, "expiration")).toMatchObject({
      allowed: "Until Sun, Oct 25, 11:59 PM ET",
      actual: "Checked Mon, Oct 19, 9:14 AM ET",
      explanation: "6 days left",
    });
    expect(row(o, "colors").explanation).toBe("Both colors are on your list");
  });

  it("Tempo Racer in volt yellow is blocked on budget and colors, 2 of 7 fail", () => {
    const o = runMandateCheck(checkInput({ productId: "tempo-racer-volt" }));
    expect(o.verdict).toBe("fail");
    expect(failed(o)).toEqual(["budget", "colors"]);
    expect(o.summary).toEqual({ passed: 5, total: 7 });
    expect(row(o, "budget").explanation).toBe(
      "Cart total is $127.74. Your limit is $120.00, so it is $7.74 over.",
    );
    expect(row(o, "colors").explanation).toBe("Volt yellow is not one of beige, black, gray or white.");
  });
});

describe("runMandateCheck: every rule term", () => {
  it("counts tax and shipping against the budget", () => {
    // Road Trainer 4: $104 + $6.95 shipping + $8.58 tax = $119.53, under $120 but gray only.
    const o = runMandateCheck(checkInput({ productId: "road-trainer-4-gray" }));
    expect(row(o, "budget").pass).toBe(true);
    const tight = runMandateCheck(checkInput({ productId: "road-trainer-4-gray", terms: { ...CANVAS_TERMS, budgetCents: 11952 } }));
    expect(row(tight, "budget").pass).toBe(false);
  });

  it("uses the remaining budget after earlier purchases", () => {
    const o = runMandateCheck(
      checkInput({ terms: { ...CANVAS_TERMS, budgetCents: 20000, maxPurchases: 2 }, spentCents: 10392, capturedCount: 1 }),
    );
    expect(row(o, "budget")).toMatchObject({ pass: false, allowed: "$96.08 left of $200.00" });
    expect(row(o, "budget").explanation).toBe(
      "Cart total is $103.92. You have $96.08 left of $200.00, so it is $7.84 over.",
    );
  });

  it("fails the category when a product is listed elsewhere", () => {
    const o = runMandateCheck(checkInput({ productId: "ridge-runner-olive" }));
    expect(row(o, "category")).toMatchObject({ pass: false, explanation: "Ridge Runner is listed under Trail shoes, not Running shoes." });
  });

  it("requires the exact size and size system", () => {
    expect(row(runMandateCheck(checkInput({ lines: [line("daily-miler-blk-wht", "10.5")] })), "size").pass).toBe(false);
    expect(row(runMandateCheck(checkInput({ lines: [line("daily-miler-blk-wht", null)] })), "size").pass).toBe(false);
    const womens = runMandateCheck(checkInput({ lines: [line("pace-lite-w-pink", "10")] }));
    expect(row(womens, "size")).toMatchObject({ pass: false });
    expect(row(womens, "size").explanation).toContain("US women's");
  });

  it("rejects a size the product is not sold in", () => {
    const o = runMandateCheck(checkInput({ terms: { ...CANVAS_TERMS, required: { ...CANVAS_TERMS.required, size: { system: "US_MENS", value: "15" } } }, lines: [line("daily-miler-blk-wht", "15")] }));
    expect(row(o, "size").pass).toBe(false);
  });

  it("applies forbidden colors even without an allow list", () => {
    const terms = { ...CANVAS_TERMS, required: { size: CANVAS_TERMS.required.size }, forbidden: { colors: ["red" as const] } };
    const o = runMandateCheck(checkInput({ terms, productId: "cadence-2-red", lines: [line("cadence-2-red")] }));
    expect(row(o, "colors")).toMatchObject({ pass: false, allowed: "Any color except red", explanation: "Red is excluded by your mandate." });
  });

  it("applies forbidden brands", () => {
    const terms = { ...CANVAS_TERMS, forbidden: { brands: ["Halden"] } };
    expect(row(runMandateCheck(checkInput({ terms })), "brands").pass).toBe(false);
  });

  it("enforces the merchant allow list", () => {
    const terms = { ...CANVAS_TERMS, merchants: ["running-co" as const] };
    const o = runMandateCheck(checkInput({ terms }));
    expect(row(o, "merchant")).toMatchObject({ pass: false, explanation: "Sample Sports Outlet is not on your list." });
  });

  it("fails after expiry, even when everything else passes", () => {
    const o = runMandateCheck(checkInput({ now: new Date("2026-10-26T04:00:00Z") }));
    expect(failed(o)).toEqual(["expiration"]);
    expect(o.verdict).toBe("fail");
  });

  it("fails when all purchases are used", () => {
    const o = runMandateCheck(checkInput({ capturedCount: 1 }));
    expect(row(o, "purchases")).toMatchObject({ pass: false, explanation: "All 1 purchase under this mandate is used." });
  });
});

describe("runMandateCheck: safeguards", () => {
  it("fails a revoked, expired, draft or flagged mandate", () => {
    for (const mandate of [
      { code: "MDT4K7Q21", status: "revoked" as const, revokedAt: new Date(), flaggedAt: null },
      { code: "MDT4K7Q21", status: "active" as const, revokedAt: new Date(), flaggedAt: null },
      { code: "MDT4K7Q21", status: "awaiting_link" as const, revokedAt: null, flaggedAt: null },
      { code: "MDT4K7Q21", status: "active" as const, revokedAt: null, flaggedAt: new Date() },
    ]) {
      const o = runMandateCheck(checkInput({ mandate }));
      expect(o.verdict).toBe("fail");
      expect(row(o, "status").pass).toBe(false);
    }
  });

  it("fails a cart checked against a superseded version", () => {
    const base = checkInput();
    const o = runMandateCheck({ ...base, version: { ...base.version, isCurrent: false } });
    expect(row(o, "status")).toMatchObject({ pass: false });
    expect(o.verdict).toBe("fail");
  });

  it("detects tampered terms (hash mismatch)", () => {
    const base = checkInput();
    const tampered = { ...base, version: { ...base.version, terms: { ...CANVAS_TERMS, budgetCents: 99999 } } };
    const o = runMandateCheck(tampered);
    expect(o.hashVerified).toBe(false);
    expect(row(o, "integrity").pass).toBe(false);
    expect(o.verdict).toBe("fail");
  });

  it("detects a tampered canonical string or fingerprint", () => {
    const base = checkInput();
    const other = fingerprint("MDT4K7Q21", 1, { ...CANVAS_TERMS, budgetCents: 99999 });
    expect(runMandateCheck({ ...base, version: { ...base.version, canonical: other.canonical } }).hashVerified).toBe(false);
    expect(runMandateCheck({ ...base, version: { ...base.version, sha256: other.sha256 } }).hashVerified).toBe(false);
  });

  it("fails a product priced in another currency", () => {
    const l = line("daily-miler-blk-wht");
    const o = runMandateCheck(checkInput({ lines: [{ ...l, product: { ...l.product, currency: "EUR" } }] }));
    expect(row(o, "currency").pass).toBe(false);
  });

  it("fails a product that does not belong to the cart's store", () => {
    const o = runMandateCheck(checkInput({ lines: [line("daily-miler-blk-wht"), line("tempo-racer-volt")] }));
    expect(row(o, "merchant").pass).toBe(false);
  });
});

describe("runMandateCheck: semantic terms", () => {
  const terms = { ...CANVAS_TERMS, semantic: [{ id: "long-runs", label: "Use", text: "Comfortable for long runs" }] };

  it("passes only with a positive verdict", () => {
    const ok = runMandateCheck(checkInput({ terms, semantic: { "long-runs": { status: "pass", reason: "Cushioned trainer" } } }));
    expect(ok.verdict).toBe("pass");
    expect(ok.summary.total).toBe(8);
    expect(row(ok, "semantic:long-runs")).toMatchObject({ kind: "semantic", pass: true, explanation: "Cushioned trainer" });
  });

  it("a negative, missing or unavailable verdict fails", () => {
    for (const semantic of [
      { "long-runs": { status: "fail" as const, reason: "Racing flat" } },
      {},
      { "long-runs": { status: "unavailable" as const, reason: "session_cap" } },
    ]) {
      const o = runMandateCheck(checkInput({ terms, semantic }));
      expect(o.verdict).toBe("fail");
      expect(row(o, "semantic:long-runs").pass).toBe(false);
    }
  });

  it("a semantic pass never lifts a rule failure", () => {
    const o = runMandateCheck(
      checkInput({ terms, productId: "tempo-racer-volt", semantic: { "long-runs": { status: "pass", reason: "fine" } } }),
    );
    expect(o.verdict).toBe("fail");
  });
});

describe("runMandateCheck: output contract", () => {
  it("always produces every row, never short circuits", () => {
    const base = checkInput({ productId: "tempo-racer-volt" });
    const o = runMandateCheck({ ...base, mandate: { ...base.mandate, status: "revoked", revokedAt: new Date() } });
    for (const t of ["integrity", "status", "currency", "budget", "category", "size", "colors", "merchant", "expiration", "purchases"]) {
      expect(o.terms.some((r) => r.term === t)).toBe(true);
    }
  });

  it("never contains em or en dashes in user facing text", () => {
    const o = runMandateCheck(checkInput({ productId: "tempo-racer-volt" }));
    const text = JSON.stringify(o.terms);
    expect(text).not.toMatch(/[–—]/);
  });
});
