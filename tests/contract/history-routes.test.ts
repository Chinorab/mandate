/** Contract tests for revoke, history activity and the receipt (US4). */
import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as amend from "@/lib/api/amend";
import * as carts from "@/lib/api/carts";
import * as history from "@/lib/api/history";
import * as mandates from "@/lib/api/mandates";
import { auditLog, cart, mandate, order } from "@/lib/db/schema";
import type { Drafter } from "@/lib/mandate/draft";
import { payCart } from "@/lib/payments/gate";
import type { VaultClient } from "@/lib/payments/vault";
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

function fakeVault() {
  const deleted: string[] = [];
  const vault: VaultClient = {
    createSetupToken: async () => ({ id: "S" }),
    createPaymentToken: async () => ({ id: "P", customerId: null }),
    deletePaymentToken: async (id) => {
      deleted.push(id);
    },
  };
  return { vault, deleted };
}

const drafter: Drafter = async () => ({ terms: CANVAS_TERMS, assumptions: [], missing: [], outOfScope: null });
const deps = (vault: VaultClient | null = fakeVault().vault, now = CHECK_TIME): mandates.MandateDeps => ({ db: handle.db, drafter, vault, now: () => now });
const gate = (money = fakeMoney()) => ({ db: handle.db, money: money.client, judge: fakeJudge().judge, now: () => CHECK_TIME });

describe("POST /api/mandates/:code/revoke", () => {
  it("requires an explicit confirmation", async () => {
    const m = await activeMandate(handle.db);
    expect((await history.revoke(deps(), m.sessionId, m.code, {})).status).toBe(400);
  });

  it("revokes, unlinks PayPal, cancels open carts, and the agent can no longer pay", async () => {
    const m = await activeMandate(handle.db);
    const open = await newCart(handle.db, m);
    const v = fakeVault();
    const r = await history.revoke(deps(v.vault), m.sessionId, m.code, { confirm: true });
    expect(r.status).toBe(200);
    expect((r.body as mandates.MandateBody).mandate.status).toBe("revoked");

    const [row] = await handle.db.select().from(mandate).where(eq(mandate.id, m.mandateId));
    expect(row.revokedAt).not.toBeNull();
    expect(row.vaultPaymentTokenId).toBeNull();
    expect(v.deleted).toEqual(["vault-token-test"]);
    const [c] = await handle.db.select().from(cart).where(eq(cart.id, open));
    expect(c.status).toBe("cancelled");

    const fresh = await newCart(handle.db, m);
    const money = fakeMoney();
    const pay = await carts.pay(gate(money), m.sessionId, fresh);
    expect(pay.status).toBe(409);
    expect(money.charges).toHaveLength(0);

    const audits = await handle.db.select().from(auditLog).where(eq(auditLog.action, "mandate_revoked"));
    expect(audits.some((a) => JSON.stringify(a.detail).includes(m.code))).toBe(true);
  });

  it("still revokes when PayPal cannot be reached, because the token is removed here first", async () => {
    const m = await activeMandate(handle.db);
    const failing: VaultClient = { ...fakeVault().vault, deletePaymentToken: async () => Promise.reject(new Error("down")) };
    const r = await history.revoke(deps(failing), m.sessionId, m.code, { confirm: true });
    expect(r.status).toBe(200);
    const [row] = await handle.db.select().from(mandate).where(eq(mandate.id, m.mandateId));
    expect(row.status).toBe("revoked");
    expect(row.vaultPaymentTokenId).toBeNull();
  });

  it("cannot revoke twice, a draft, or another session's mandate", async () => {
    const m = await activeMandate(handle.db);
    await history.revoke(deps(), m.sessionId, m.code, { confirm: true });
    expect((await history.revoke(deps(), m.sessionId, m.code, { confirm: true })).status).toBe(409);

    const s = await newSession(handle.db);
    const d = await mandates.createDraft(deps(), s, { instructions: "x" });
    const code = (d.body as mandates.MandateBody).mandate.code;
    expect((await history.revoke(deps(), s, code, { confirm: true })).status).toBe(409);

    const other = await activeMandate(handle.db);
    expect((await history.revoke(deps(), s, other.code, { confirm: true })).status).toBe(404);
  });

  it("a payment and a revocation never interleave: no capture after revoked_at", async () => {
    for (let i = 0; i < 5; i++) {
      const m = await activeMandate(handle.db);
      const cartId = await newCart(handle.db, m);
      const money = fakeMoney();
      const [paid] = await Promise.all([
        payCart(gate(money), { sessionId: m.sessionId, cartId }),
        history.revoke(deps(), m.sessionId, m.code, { confirm: true }),
      ]);
      const [row] = await handle.db.select().from(mandate).where(eq(mandate.id, m.mandateId));
      const orders = await handle.db.select().from(order).where(eq(order.mandateId, m.mandateId));
      if (paid.status === "paid") {
        expect(orders).toHaveLength(1);
        expect(orders[0].capturedAt!.getTime()).toBeLessThanOrEqual(row.revokedAt!.getTime());
      } else {
        expect(orders).toHaveLength(0);
        expect(money.charges).toHaveLength(0);
      }
    }
  });
});

describe("GET /api/mandates (history list)", () => {
  it("shows expired mandates as expired once their time has passed", async () => {
    const m = await activeMandate(handle.db);
    const later = new Date("2026-11-01T12:00:00Z");
    const r = await mandates.listMandates(deps(null, later), m.sessionId);
    expect((r.body as { mandates: mandates.MandateView[] }).mandates[0]).toMatchObject({ code: m.code, status: "expired" });
  });
});

describe("GET /api/mandates/:code/activity", () => {
  it("lists paid orders and blocked carts with their check, and every version with its changes", async () => {
    const m = await activeMandate(handle.db, { terms: { ...CANVAS_TERMS, maxPurchases: 2, budgetCents: 30000 } });
    const blocked = await newCart(handle.db, m, "tempo-racer-volt");
    await carts.runCheck(gate(), m.sessionId, blocked);
    const ok = await newCart(handle.db, m);
    await carts.pay(gate(), m.sessionId, ok);

    const r = await history.activity(deps(), m.sessionId, m.code);
    expect(r.status).toBe(200);
    const a = r.body as history.ActivityBody;
    const byItem = Object.fromEntries(a.activity.map((x) => [x.item, x]));
    expect(byItem["Daily Miler"]).toMatchObject({ store: "Sample Sports Outlet", totalCents: 10392, outcome: "paid", passed: 7, total: 7 });
    expect(byItem["Tempo Racer"]).toMatchObject({ outcome: "blocked", totalCents: 12774 });
    expect(a.versions).toHaveLength(1);
    expect(a.versions[0]).toMatchObject({ versionNo: 1, changes: [] });
    expect(a.receipt.terms).toContain("Up to $300.00 total");
    expect(a.receipt.orders).toBe("1 paid, 1 blocked before payment");
  });

  it("includes amendments as new versions", async () => {
    const m = await activeMandate(handle.db);
    const blocked = await newCart(handle.db, m, "tempo-racer-volt");
    await carts.runCheck(gate(), m.sessionId, blocked);
    const o = (await amend.getOptions(gate(), m.sessionId, blocked)).body as amend.OptionsBody;
    if (!o.amendment.amendable) throw new Error("expected a proposal");
    await amend.approveAmendment(gate(), m.sessionId, blocked, { confirm: true, proposalHash: o.amendment.proposalHash });
    const a = (await history.activity(deps(), m.sessionId, m.code)).body as history.ActivityBody;
    expect(a.versions.map((v) => v.versionNo)).toEqual([1, 2]);
    expect(a.versions[1].changes.map((c) => c.term)).toEqual(["budget", "colors"]);
  });
});

describe("GET /api/mandates/:code/receipt", () => {
  it("returns a PDF for the owner only", async () => {
    const m = await activeMandate(handle.db);
    const r = await history.receipt(deps(), m.sessionId, m.code);
    expect(r.status).toBe(200);
    const bytes = r.body as Uint8Array;
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(pdf.getTitle()).toBe(`Mandate receipt ${m.code}`);
    expect((await history.receipt(deps(), await newSession(handle.db), m.code)).status).toBe(404);
  });
});
