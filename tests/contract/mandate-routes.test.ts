/**
 * Contract tests for the mandate API handlers (contracts/http-api.md). Route files are thin wrappers
 * that resolve the session and call these handlers, so the handlers carry the whole contract.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as api from "@/lib/api/mandates";
import { mandate } from "@/lib/db/schema";
import type { Drafter } from "@/lib/mandate/draft";
import { fingerprint } from "@/lib/mandate/canonical";
import type { VaultClient } from "@/lib/payments/vault";
import { testDb } from "../helpers/db";
import { CANVAS_TERMS } from "../helpers/fixtures";
import { newSession } from "../helpers/scenario";

let handle: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  handle = await testDb();
});
afterAll(async () => {
  await handle.close();
});

const NOW = new Date("2026-10-19T13:02:00Z");

const drafter: Drafter = async () => ({
  terms: { ...CANVAS_TERMS },
  assumptions: [{ term: "size", text: "Assumed US men's. Your instructions did not say." }],
  missing: [],
  outOfScope: null,
});
const incompleteDrafter: Drafter = async () => {
  const { budgetCents: _b, ...rest } = CANVAS_TERMS;
  return { terms: rest, assumptions: [], missing: ["budgetCents"], outOfScope: null };
};

function fakeVault() {
  const calls: string[] = [];
  const vault: VaultClient = {
    async createSetupToken({ description }) {
      calls.push(`setup:${description}`);
      return { id: `SETUP-${calls.length}` };
    },
    async createPaymentToken(setupTokenId) {
      calls.push(`payment:${setupTokenId}`);
      return { id: "PAYTOKEN-1", customerId: "CUST-1" };
    },
    async deletePaymentToken(id) {
      calls.push(`delete:${id}`);
    },
  };
  return { vault, calls };
}

const deps = (over: Partial<api.MandateDeps> = {}): api.MandateDeps => ({
  db: handle.db,
  drafter,
  vault: fakeVault().vault,
  now: () => NOW,
  ...over,
});

async function draft(sessionId: string, d = deps()) {
  const r = await api.createDraft(d, sessionId, { instructions: "Buy running shoes, size 10, under $120, neutral colors, this week only" });
  expect(r.status).toBe(201);
  return (r.body as api.MandateBody).mandate;
}

describe("POST /api/mandates/draft", () => {
  it("returns a draft with terms, flagged assumptions and a code", async () => {
    const m = await draft(await newSession(handle.db));
    expect(m.code).toMatch(/^MDT[0-9A-Z]{6}$/);
    expect(m.status).toBe("draft");
    expect(m.terms.budgetCents).toBe(12000);
    expect(m.assumptions[0].term).toBe("size");
    expect(m.version).toBeNull();
  });

  it("rejects empty or oversized instructions", async () => {
    const s = await newSession(handle.db);
    expect((await api.createDraft(deps(), s, { instructions: "  " })).status).toBe(400);
    expect((await api.createDraft(deps(), s, { instructions: "x".repeat(1001) })).status).toBe(400);
  });

  it("explains when the model is unavailable", async () => {
    const { ModelUnavailableError } = await import("@/lib/ai/model");
    const down: Drafter = async () => {
      throw new ModelUnavailableError("session_cap");
    };
    const r = await api.createDraft(deps({ drafter: down }), await newSession(handle.db), { instructions: "running shoes under $120" });
    expect(r.status).toBe(429);
    expect(JSON.stringify(r.body)).toContain("session_cap");
  });
});

describe("manual drafts", () => {
  it("creates an empty draft without calling the model, then signs once filled in", async () => {
    const never: Drafter = async () => {
      throw new Error("must not be called");
    };
    const s = await newSession(handle.db);
    const r = await api.createDraft(deps({ drafter: never }), s, { instructions: "Shoes for my run", manual: true });
    expect(r.status).toBe(201);
    const m = (r.body as api.MandateBody).mandate;
    expect(m.missing).toEqual(["budgetCents", "category", "expiresAt"]);
    expect((await api.signMandate(deps(), s, m.code, { confirm: true })).status).toBe(422);
    await api.updateDraft(deps(), s, m.code, { terms: { ...m.terms, budgetCents: 12000, category: "running-shoes", expiresAt: CANVAS_TERMS.expiresAt } });
    expect((await api.signMandate(deps(), s, m.code, { confirm: true })).status).toBe(200);
  });
});

describe("PATCH /api/mandates/:code", () => {
  it("edits a draft term", async () => {
    const s = await newSession(handle.db);
    const m = await draft(s);
    const r = await api.updateDraft(deps(), s, m.code, {
      terms: { ...m.terms, required: { ...m.terms.required, size: { system: "US_MENS", value: "10.5" } } },
    });
    expect(r.status).toBe(200);
    expect((r.body as api.MandateBody).mandate.terms.required?.size?.value).toBe("10.5");
  });

  it("rejects invalid terms and unknown keys", async () => {
    const s = await newSession(handle.db);
    const m = await draft(s);
    expect((await api.updateDraft(deps(), s, m.code, { terms: { ...m.terms, budgetCents: -1 } })).status).toBe(400);
    expect((await api.updateDraft(deps(), s, m.code, { terms: { ...m.terms, ignoreBudget: true } })).status).toBe(400);
  });

  it("returns 409 once signed: signed terms are immutable", async () => {
    const s = await newSession(handle.db);
    const m = await draft(s);
    await api.signMandate(deps(), s, m.code, { confirm: true });
    const r = await api.updateDraft(deps(), s, m.code, { terms: { ...m.terms, budgetCents: 99_000 } });
    expect(r.status).toBe(409);
  });

  it("is invisible to other sessions", async () => {
    const m = await draft(await newSession(handle.db));
    const other = await newSession(handle.db);
    expect((await api.updateDraft(deps(), other, m.code, { terms: m.terms })).status).toBe(404);
    expect((await api.getMandate(deps(), other, m.code)).status).toBe(404);
  });
});

describe("POST /api/mandates/:code/sign", () => {
  it("requires an explicit confirmation", async () => {
    const s = await newSession(handle.db);
    const m = await draft(s);
    expect((await api.signMandate(deps(), s, m.code, {})).status).toBe(400);
  });

  it("freezes version 1 with a fingerprint and waits for the PayPal link", async () => {
    const s = await newSession(handle.db);
    const m = await draft(s);
    const r = await api.signMandate(deps(), s, m.code, { confirm: true });
    expect(r.status).toBe(200);
    const signed = (r.body as api.MandateBody).mandate;
    expect(signed.status).toBe("awaiting_link");
    expect(signed.version).toMatchObject({ versionNo: 1, signedAt: NOW.toISOString() });
    expect(signed.version!.sha256).toBe(fingerprint(m.code, 1, CANVAS_TERMS).sha256);
  });

  it("refuses to sign without budget, category or expiry and names what is missing", async () => {
    const s = await newSession(handle.db);
    const m = await draft(s, deps({ drafter: incompleteDrafter }));
    const r = await api.signMandate(deps(), s, m.code, { confirm: true });
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.body)).toContain("budget");
  });

  it("refuses an expiry already in the past", async () => {
    const s = await newSession(handle.db);
    const m = await draft(s);
    await api.updateDraft(deps(), s, m.code, { terms: { ...m.terms, expiresAt: "2026-10-01T00:00:00.000Z" } });
    expect((await api.signMandate(deps(), s, m.code, { confirm: true })).status).toBe(422);
  });

  it("cannot be signed twice", async () => {
    const s = await newSession(handle.db);
    const m = await draft(s);
    await api.signMandate(deps(), s, m.code, { confirm: true });
    expect((await api.signMandate(deps(), s, m.code, { confirm: true })).status).toBe(409);
  });
});

describe("GET /api/mandates/:code/verify", () => {
  it("recomputes the fingerprint from the stored terms", async () => {
    const s = await newSession(handle.db);
    const m = await draft(s);
    await api.signMandate(deps(), s, m.code, { confirm: true });
    const r = await api.verifyMandate(deps(), s, m.code);
    expect(r.status).toBe(200);
    const v = (r.body as api.VerifyBody).versions[0];
    expect(v).toMatchObject({ versionNo: 1, match: true });
    expect(v.recomputed).toBe(v.sha256);
  });
});

describe("PayPal link (vault)", () => {
  it("creates a setup token only after signing, then activates on confirm", async () => {
    const s = await newSession(handle.db);
    const m = await draft(s);
    const v = fakeVault();
    const d = deps({ vault: v.vault });
    expect((await api.vaultSetupToken(d, s, m.code)).status).toBe(409);

    await api.signMandate(d, s, m.code, { confirm: true });
    const setup = await api.vaultSetupToken(d, s, m.code);
    expect(setup.status).toBe(200);
    const setupTokenId = (setup.body as { setupTokenId: string }).setupTokenId;
    expect(v.calls[0]).toContain(m.code);

    const done = await api.vaultConfirm(d, s, m.code, { vaultSetupToken: setupTokenId });
    expect(done.status).toBe(200);
    const view = (done.body as api.MandateBody).mandate;
    expect(view.status).toBe("active");
    expect(view.linked).toBe(true);
    // The payment token never leaves the server.
    expect(JSON.stringify(done.body)).not.toContain("PAYTOKEN-1");
    const [row] = await handle.db.select().from(mandate).where(eq(mandate.code, m.code));
    expect(row.vaultPaymentTokenId).toBe("PAYTOKEN-1");
  });

  it("refuses a setup token this server did not issue for the mandate", async () => {
    const s = await newSession(handle.db);
    const m = await draft(s);
    await api.signMandate(deps(), s, m.code, { confirm: true });
    await api.vaultSetupToken(deps(), s, m.code);
    const r = await api.vaultConfirm(deps(), s, m.code, { vaultSetupToken: "SETUP-FORGED" });
    expect(r.status).toBe(409);
  });

  it("explains when PayPal is not configured", async () => {
    const s = await newSession(handle.db);
    const m = await draft(s);
    await api.signMandate(deps(), s, m.code, { confirm: true });
    const r = await api.vaultSetupToken(deps({ vault: null }), s, m.code);
    expect(r.status).toBe(503);
  });
});

describe("GET /api/mandates and discard", () => {
  it("lists only this session's mandates, newest first, without secrets", async () => {
    const s = await newSession(handle.db);
    const a = await draft(s);
    const b = await draft(s);
    await draft(await newSession(handle.db));
    const r = await api.listMandates(deps(), s);
    const codes = (r.body as { mandates: api.MandateView[] }).mandates.map((m) => m.code);
    expect(codes).toEqual([b.code, a.code]);
    expect(JSON.stringify(r.body)).not.toMatch(/vault|token/i);
  });

  it("discards a draft but not a signed mandate", async () => {
    const s = await newSession(handle.db);
    const a = await draft(s);
    expect((await api.discardDraft(deps(), s, a.code)).status).toBe(204);
    expect((await api.getMandate(deps(), s, a.code)).status).toBe(404);
    const b = await draft(s);
    await api.signMandate(deps(), s, b.code, { confirm: true });
    expect((await api.discardDraft(deps(), s, b.code)).status).toBe(409);
  });
});
