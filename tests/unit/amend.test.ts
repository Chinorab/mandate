import { describe, expect, it } from "vitest";
import { proposeAmendment } from "@/lib/mandate/amend";
import { runMandateCheck } from "@/lib/check/run";
import type { Terms } from "@/lib/mandate/terms";
import { CANVAS_TERMS, CHECK_TIME, checkInput, line } from "../helpers/fixtures";

function propose(over: Parameters<typeof checkInput>[0] = {}) {
  const input = checkInput(over);
  const outcome = runMandateCheck(input);
  return proposeAmendment({
    terms: input.version.terms as Terms,
    baseSha256: input.version.sha256,
    outcome,
    lines: input.lines,
    store: input.store,
    spentCents: input.spentCents,
    capturedCount: input.capturedCount,
    now: CHECK_TIME,
  });
}

const changed = (r: ReturnType<typeof propose>) => (r.amendable ? r.proposal.changes.map((c) => c.term) : []);

describe("proposeAmendment", () => {
  it("the canvas Tempo Racer: only budget and colors change", () => {
    const r = propose({ productId: "tempo-racer-volt" });
    expect(r.amendable).toBe(true);
    if (!r.amendable) return;
    expect(r.proposal.changes).toEqual([
      { term: "budget", label: "Budget", from: "$120.00", to: "$130.00" },
      { term: "colors", label: "Colors", from: "4 colors", to: "Adds Volt yellow" },
    ]);
    const t = r.proposal.terms;
    expect(t.budgetCents).toBe(13000);
    expect(t.required.colors).toEqual(["beige", "black", "gray", "volt-yellow", "white"]);
    // Everything else stays as signed.
    const { budgetCents: _a, required: _b, ...restNew } = t;
    const { budgetCents: _c, required: _d, ...restOld } = CANVAS_TERMS;
    expect(restNew).toEqual({ ...restOld, expiresAt: new Date(CANVAS_TERMS.expiresAt).toISOString() });
    expect(t.required.size).toEqual(CANVAS_TERMS.required.size);
    expect(r.proposal.proposalHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("raises the budget in $10 steps above what is already spent plus this cart", () => {
    const r = propose({ productId: "daily-miler-blk-wht", spentCents: 5000, terms: { ...CANVAS_TERMS, maxPurchases: 2 }, capturedCount: 1 });
    expect(r.amendable && r.proposal.terms.budgetCents).toBe(16000); // 5000 + 10392 = 15392
  });

  it("removes a forbidden color instead of adding it to an allow list", () => {
    const terms = { ...CANVAS_TERMS, required: { size: CANVAS_TERMS.required.size }, forbidden: { colors: ["red" as const] } };
    const r = propose({ terms, lines: [line("cadence-2-red")] });
    expect(r.amendable && r.proposal.changes).toEqual([{ term: "colors", label: "Colors", from: "Excludes red", to: "Allows red" }]);
    expect(r.amendable && r.proposal.terms.forbidden.colors).toBeUndefined();
  });

  it("adds the store to a merchant list", () => {
    const r = propose({ terms: { ...CANVAS_TERMS, merchants: ["running-co"] } });
    expect(r.amendable && r.proposal.changes).toEqual([{ term: "merchant", label: "Merchant", from: "1 chosen store", to: "Adds Sample Sports Outlet" }]);
    expect(r.amendable && r.proposal.terms.merchants).toEqual(["running-co", "sports-outlet"]);
  });

  it("changes size, category, purchases, brands and expiry when those fail", () => {
    expect(changed(propose({ lines: [line("daily-miler-blk-wht", "10.5")] }))).toEqual(["size"]);
    expect(changed(propose({ lines: [line("ridge-runner-olive")], terms: { ...CANVAS_TERMS, budgetCents: 50000, required: { size: CANVAS_TERMS.required.size } } }))).toEqual(["category"]);
    expect(changed(propose({ capturedCount: 1, terms: { ...CANVAS_TERMS, budgetCents: 50000 } }))).toEqual(["purchases"]);
    expect(changed(propose({ terms: { ...CANVAS_TERMS, forbidden: { brands: ["Halden"] } } }))).toEqual(["brands"]);
    const expired = propose({ now: new Date("2026-10-27T15:00:00Z") });
    expect(changed(expired)).toEqual(["expiration"]);
  });

  it("drops a failed preference", () => {
    const terms = { ...CANVAS_TERMS, semantic: [{ id: "pref-1", label: "Use", text: "Good for long runs" }] };
    const r = propose({ terms, semantic: { "pref-1": { status: "fail", reason: "Racing flat" } } });
    expect(r.amendable && r.proposal.changes).toEqual([{ term: "semantic:pref-1", label: "Use", from: "Good for long runs", to: "Removed" }]);
    expect(r.amendable && r.proposal.terms.semantic).toEqual([]);
  });

  it("has nothing to propose for a passing cart", () => {
    const r = propose();
    expect(r).toEqual({ amendable: false, reason: "The cart already passes every term." });
  });

  it("cannot widen past a safeguard: revoked, changed record, superseded version", () => {
    const base = checkInput({ productId: "tempo-racer-volt" });
    for (const input of [
      { ...base, mandate: { ...base.mandate, status: "revoked" as const, revokedAt: new Date() } },
      { ...base, version: { ...base.version, sha256: "0".repeat(64) } },
      { ...base, version: { ...base.version, isCurrent: false } },
    ]) {
      const r = proposeAmendment({
        terms: input.version.terms as Terms,
        baseSha256: input.version.sha256,
        outcome: runMandateCheck(input),
        lines: input.lines,
        store: input.store,
        spentCents: 0,
        capturedCount: 0,
        now: CHECK_TIME,
      });
      expect(r.amendable).toBe(false);
    }
  });

  it("the proposal hash is bound to the current fingerprint", () => {
    const a = propose({ productId: "tempo-racer-volt" });
    const base = checkInput({ productId: "tempo-racer-volt" });
    const b = proposeAmendment({
      terms: base.version.terms as Terms,
      baseSha256: "f".repeat(64),
      outcome: runMandateCheck(base),
      lines: base.lines,
      store: base.store,
      spentCents: 0,
      capturedCount: 0,
      now: CHECK_TIME,
    });
    expect(a.amendable && b.amendable && a.proposal.proposalHash !== b.proposal.proposalHash).toBe(true);
  });
});
