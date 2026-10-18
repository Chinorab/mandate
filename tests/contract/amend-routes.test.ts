/** Contract tests for amending a mandate from a blocked cart, and switching to an alternative (US3). */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as api from "@/lib/api/amend";
import * as carts from "@/lib/api/carts";
import { cart, mandate, mandateVersion } from "@/lib/db/schema";
import { fingerprint } from "@/lib/mandate/canonical";
import { termsSchema } from "@/lib/mandate/terms";
import { testDb } from "../helpers/db";
import { CANVAS_TERMS, CHECK_TIME } from "../helpers/fixtures";
import { activeMandate, fakeJudge, fakeMoney, newCart, newSession } from "../helpers/scenario";

let handle: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  handle = await testDb();
});
afterAll(async () => {
  await handle.close();
});

const gate = (money = fakeMoney()) => ({ db: handle.db, money: money.client, judge: fakeJudge().judge, now: () => CHECK_TIME });

async function blocked() {
  const m = await activeMandate(handle.db);
  const cartId = await newCart(handle.db, m, "tempo-racer-volt");
  await carts.runCheck(gate(), m.sessionId, cartId);
  return { m, cartId };
}

async function proposal(sessionId: string, cartId: string) {
  const r = await api.getOptions(gate(), sessionId, cartId);
  expect(r.status).toBe(200);
  return r.body as api.OptionsBody;
}

describe("GET /api/carts/:id/options", () => {
  it("proposes only the changes needed, and a compliant alternative", async () => {
    const { m, cartId } = await blocked();
    const o = await proposal(m.sessionId, cartId);
    expect(o.amendment.amendable).toBe(true);
    if (o.amendment.amendable) expect(o.amendment.changes.map((c) => c.term)).toEqual(["budget", "colors"]);
    // The cheapest product passing every term: Pace Lite at Example Running Co., $79.00 + $6.95 + tax.
    expect(o.alternative).toMatchObject({ productId: "pace-lite-wht", name: "Pace Lite", storeName: "Example Running Co.", totalCents: 9247 });
  });
});

describe("POST /api/carts/:id/amend", () => {
  it("creates version 2 with its own fingerprint, linked to version 1, and repins the cart", async () => {
    const { m, cartId } = await blocked();
    const o = await proposal(m.sessionId, cartId);
    if (!o.amendment.amendable) throw new Error("expected a proposal");
    const r = await api.approveAmendment(gate(), m.sessionId, cartId, { confirm: true, proposalHash: o.amendment.proposalHash });
    expect(r.status).toBe(200);

    const [mr] = await handle.db.select().from(mandate).where(eq(mandate.id, m.mandateId));
    const [v2] = await handle.db.select().from(mandateVersion).where(eq(mandateVersion.id, mr.currentVersionId!));
    expect(v2.versionNo).toBe(2);
    expect(v2.previousVersionId).toBe(m.versionId);
    expect(v2.amendedForCartId).toBe(cartId);
    const terms = termsSchema.parse(v2.terms);
    expect(terms.budgetCents).toBe(13000);
    expect(v2.sha256).toBe(fingerprint(m.code, 2, terms).sha256);
    expect(v2.sha256).not.toBe(m.sha256);
    expect(v2.changeSummary).toEqual(o.amendment.changes);

    const [c] = await handle.db.select().from(cart).where(eq(cart.id, cartId));
    expect(c.mandateVersionId).toBe(v2.id);
    const view = (r.body as { view: carts.CheckView }).view;
    expect(view.check?.verdict).toBe("pass");
    expect(view.mandate.versionNo).toBe(2);

    // The cart now pays, through the gate.
    const money = fakeMoney();
    const paid = await carts.pay(gate(money), m.sessionId, cartId);
    expect(paid.status).toBe(200);
    expect(money.charges[0].amount.totalCents).toBe(12774);
    expect(money.charges[0].customId).toBe(`${m.code}:2:${v2.sha256}`);
  });

  it("requires an explicit confirmation and the exact proposal shown", async () => {
    const { m, cartId } = await blocked();
    const o = await proposal(m.sessionId, cartId);
    if (!o.amendment.amendable) throw new Error("expected a proposal");
    expect((await api.approveAmendment(gate(), m.sessionId, cartId, { proposalHash: o.amendment.proposalHash })).status).toBe(400);
    expect((await api.approveAmendment(gate(), m.sessionId, cartId, { confirm: true, proposalHash: "0".repeat(64) })).status).toBe(409);
    expect((await api.approveAmendment(gate(), m.sessionId, cartId, { confirm: true })).status).toBe(400);
  });

  it("ignores any terms sent by the browser", async () => {
    const { m, cartId } = await blocked();
    const o = await proposal(m.sessionId, cartId);
    if (!o.amendment.amendable) throw new Error("expected a proposal");
    await api.approveAmendment(gate(), m.sessionId, cartId, {
      confirm: true,
      proposalHash: o.amendment.proposalHash,
      terms: { ...CANVAS_TERMS, budgetCents: 999_999 },
    } as never);
    const [mr] = await handle.db.select().from(mandate).where(eq(mandate.id, m.mandateId));
    const [v2] = await handle.db.select().from(mandateVersion).where(eq(mandateVersion.id, mr.currentVersionId!));
    expect(termsSchema.parse(v2.terms).budgetCents).toBe(13000);
  });

  it("a stale proposal (mandate changed meanwhile) is refused", async () => {
    const { m, cartId } = await blocked();
    const o = await proposal(m.sessionId, cartId);
    if (!o.amendment.amendable) throw new Error("expected a proposal");
    const second = await newCart(handle.db, m, "tempo-racer-volt");
    await carts.runCheck(gate(), m.sessionId, second);
    const o2 = await proposal(m.sessionId, second);
    if (!o2.amendment.amendable) throw new Error("expected a proposal");
    expect((await api.approveAmendment(gate(), m.sessionId, second, { confirm: true, proposalHash: o2.amendment.proposalHash })).status).toBe(200);
    // The first proposal was computed against version 1.
    expect((await api.approveAmendment(gate(), m.sessionId, cartId, { confirm: true, proposalHash: o.amendment.proposalHash })).status).toBe(409);
  });

  it("refuses for another session, a revoked mandate, or a passing cart", async () => {
    const { m, cartId } = await blocked();
    const o = await proposal(m.sessionId, cartId);
    if (!o.amendment.amendable) throw new Error("expected a proposal");
    const other = await newSession(handle.db);
    expect((await api.approveAmendment(gate(), other, cartId, { confirm: true, proposalHash: o.amendment.proposalHash })).status).toBe(404);

    await handle.db.update(mandate).set({ status: "revoked", revokedAt: new Date() }).where(eq(mandate.id, m.mandateId));
    expect((await api.approveAmendment(gate(), m.sessionId, cartId, { confirm: true, proposalHash: o.amendment.proposalHash })).status).toBe(409);

    const ok = await activeMandate(handle.db);
    const passing = await newCart(handle.db, ok);
    const p = await proposal(ok.sessionId, passing);
    expect(p.amendment.amendable).toBe(false);
  });
});

describe("POST /api/carts/:id/switch", () => {
  it("cancels the blocked cart and opens a checked cart with the alternative", async () => {
    const { m, cartId } = await blocked();
    const r = await api.switchToAlternative(gate(), m.sessionId, cartId);
    expect(r.status).toBe(200);
    const { cartId: next } = r.body as { cartId: string };
    expect(next).not.toBe(cartId);
    const [old] = await handle.db.select().from(cart).where(eq(cart.id, cartId));
    expect(old.status).toBe("cancelled");
    const v = await carts.getCheckView(handle.db, m.sessionId, next);
    expect((v.body as { view: carts.CheckView }).view.check?.verdict).toBe("pass");
    expect((v.body as { view: carts.CheckView }).view.cart.lines[0]).toMatchObject({ productId: "pace-lite-wht", size: "10" });
  });

  it("404 for another session", async () => {
    const { cartId } = await blocked();
    expect((await api.switchToAlternative(gate(), await newSession(handle.db), cartId)).status).toBe(404);
  });
});
