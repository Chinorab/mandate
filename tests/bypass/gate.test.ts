/**
 * Consent gate bypass suite (constitution I and VI, contracts/consent-gate.md).
 * Every scenario that must not pay asserts that the PayPal money client received zero calls.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, cart, mandate, mandateVersion, order } from "@/lib/db/schema";
import { fingerprint } from "@/lib/mandate/canonical";
import { payCart } from "@/lib/payments/gate";
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

const now = () => CHECK_TIME;

async function expectRefused(
  run: (deps: Parameters<typeof payCart>[0]) => Promise<Awaited<ReturnType<typeof payCart>>>,
  reason?: string,
) {
  const money = fakeMoney();
  const result = await run({ db: handle.db, money: money.client, judge: fakeJudge().judge, now });
  expect(result.status).toBe("refused");
  if (reason && result.status === "refused") expect(result.reason).toBe(reason);
  expect(money.charges).toHaveLength(0);
  expect(money.captures).toHaveLength(0);
  return result;
}

describe("compliant purchase", () => {
  it("pays once, with the mandate attached to the PayPal order", async () => {
    const m = await activeMandate(handle.db);
    const cartId = await newCart(handle.db, m);
    const money = fakeMoney();
    const r = await payCart({ db: handle.db, money: money.client, judge: fakeJudge().judge, now }, { sessionId: m.sessionId, cartId });

    expect(r.status).toBe("paid");
    expect(money.charges).toHaveLength(1);
    const c = money.charges[0];
    expect(c.customId).toBe(`${m.code}:1:${m.sha256}`);
    expect(c.customId.length).toBeLessThanOrEqual(255);
    expect(c.amount).toEqual({ totalCents: 10392, subtotalCents: 9600, shippingCents: 0, taxCents: 792 });
    expect(c.vaultId).toBe("vault-token-test");
    expect(c.storeId).toBe("sports-outlet");
    expect(c.description).toContain(m.code);
    expect(c.requestId).toMatch(/^[0-9a-f-]{36}$/);

    const [o] = await handle.db.select().from(order).where(eq(order.mandateId, m.mandateId));
    expect(o).toMatchObject({ status: "captured", amountCents: 10392, customId: c.customId, paypalOrderId: expect.stringMatching(/^PP-ORDER-/) });
    const [cr] = await handle.db.select().from(cart).where(eq(cart.id, cartId));
    expect(cr.status).toBe("paid");
  });

  it("captures after a pre capture check when PayPal returns an approved order", async () => {
    const m = await activeMandate(handle.db);
    const cartId = await newCart(handle.db, m);
    const money = fakeMoney("approved");
    const r = await payCart({ db: handle.db, money: money.client, judge: fakeJudge().judge, now }, { sessionId: m.sessionId, cartId });
    expect(r.status).toBe("paid");
    expect(money.captures).toHaveLength(1);
    expect(money.captures[0].requestId).not.toBe(money.charges[0].requestId);
  });
});

describe("refusals: nothing reaches PayPal", () => {
  it("over budget and outside the color list (the canvas Tempo Racer)", async () => {
    const m = await activeMandate(handle.db);
    const cartId = await newCart(handle.db, m, "tempo-racer-volt");
    const r = await expectRefused((d) => payCart(d, { sessionId: m.sessionId, cartId }), "check_failed");
    if (r.status === "refused") expect(r.failed?.map((t) => t.term)).toEqual(["budget", "colors"]);
    const [cr] = await handle.db.select().from(cart).where(eq(cart.id, cartId));
    expect(cr.status).toBe("checked_fail");
    const audits = await handle.db.select().from(auditLog).where(eq(auditLog.action, "payment_refused"));
    expect(audits.length).toBeGreaterThan(0);
  });

  it("revoked mandate", async () => {
    const m = await activeMandate(handle.db);
    const cartId = await newCart(handle.db, m);
    await handle.db.update(mandate).set({ status: "revoked", revokedAt: new Date() }).where(eq(mandate.id, m.mandateId));
    await expectRefused((d) => payCart(d, { sessionId: m.sessionId, cartId }));
  });

  it("expired mandate", async () => {
    const m = await activeMandate(handle.db);
    const cartId = await newCart(handle.db, m);
    await expectRefused((d) =>
      payCart({ ...d, now: () => new Date("2026-10-27T00:00:00Z") }, { sessionId: m.sessionId, cartId }),
    );
  });

  it("purchase count exhausted (second payment on a one order mandate)", async () => {
    const m = await activeMandate(handle.db);
    const first = await newCart(handle.db, m);
    const money = fakeMoney();
    expect((await payCart({ db: handle.db, money: money.client, judge: fakeJudge().judge, now }, { sessionId: m.sessionId, cartId: first })).status).toBe("paid");
    const second = await newCart(handle.db, m);
    await expectRefused((d) => payCart(d, { sessionId: m.sessionId, cartId: second }));
  });

  it("store not on the merchant list", async () => {
    const m = await activeMandate(handle.db, { terms: { ...CANVAS_TERMS, merchants: ["running-co"] } });
    const cartId = await newCart(handle.db, m);
    await expectRefused((d) => payCart(d, { sessionId: m.sessionId, cartId }));
  });

  it("product from another store slipped into the cart", async () => {
    const m = await activeMandate(handle.db);
    const cartId = await newCart(handle.db, m, "tempo-racer-volt", { storeId: "sports-outlet" });
    await expectRefused((d) => payCart(d, { sessionId: m.sessionId, cartId }));
  });

  it("forbidden attribute", async () => {
    const m = await activeMandate(handle.db, { terms: { ...CANVAS_TERMS, forbidden: { brands: ["Halden"] } } });
    const cartId = await newCart(handle.db, m);
    await expectRefused((d) => payCart(d, { sessionId: m.sessionId, cartId }));
  });

  it("semantic term judged as not matching", async () => {
    const terms = { ...CANVAS_TERMS, semantic: [{ id: "long-runs", label: "Use", text: "Good for long runs" }] };
    const m = await activeMandate(handle.db, { terms });
    const cartId = await newCart(handle.db, m);
    await expectRefused((d) => payCart({ ...d, judge: fakeJudge("fail").judge }, { sessionId: m.sessionId, cartId }));
  });

  it("semantic judgment unavailable (cap reached or model down) fails closed", async () => {
    const terms = { ...CANVAS_TERMS, semantic: [{ id: "long-runs", label: "Use", text: "Good for long runs" }] };
    const m = await activeMandate(handle.db, { terms });
    const cartId = await newCart(handle.db, m);
    await expectRefused((d) => payCart({ ...d, judge: fakeJudge("unavailable").judge }, { sessionId: m.sessionId, cartId }));
    await expectRefused((d) =>
      payCart({ ...d, judge: async () => { throw new Error("model down"); } }, { sessionId: m.sessionId, cartId }),
    );
  });

  it("tampered terms in the database: refused and the mandate is flagged", async () => {
    const m = await activeMandate(handle.db);
    const cartId = await newCart(handle.db, m);
    await handle.db
      .update(mandateVersion)
      .set({ terms: { ...CANVAS_TERMS, budgetCents: 999_999 } })
      .where(eq(mandateVersion.id, m.versionId));
    await expectRefused((d) => payCart(d, { sessionId: m.sessionId, cartId }));
    const [row] = await handle.db.select().from(mandate).where(eq(mandate.id, m.mandateId));
    expect(row.flaggedAt).not.toBeNull();
    // Once flagged, even a later honest cart is refused.
    const again = await newCart(handle.db, m);
    await expectRefused((d) => payCart(d, { sessionId: m.sessionId, cartId: again }));
  });

  it("tampered canonical string", async () => {
    const m = await activeMandate(handle.db);
    const cartId = await newCart(handle.db, m);
    const other = fingerprint(m.code, 1, { ...CANVAS_TERMS, budgetCents: 999_999 });
    await handle.db.update(mandateVersion).set({ canonical: other.canonical }).where(eq(mandateVersion.id, m.versionId));
    await expectRefused((d) => payCart(d, { sessionId: m.sessionId, cartId }));
  });

  it("cart owned by another session", async () => {
    const m = await activeMandate(handle.db);
    const cartId = await newCart(handle.db, m);
    const intruder = await newSession(handle.db);
    await expectRefused((d) => payCart(d, { sessionId: intruder, cartId }), "cart_not_found");
  });

  it("unknown cart id", async () => {
    const s = await newSession(handle.db);
    await expectRefused((d) => payCart(d, { sessionId: s, cartId: crypto.randomUUID() }), "cart_not_found");
  });

  it("cart pinned to a superseded version", async () => {
    const m = await activeMandate(handle.db);
    const cartId = await newCart(handle.db, m);
    const fp = fingerprint(m.code, 2, CANVAS_TERMS);
    const [v2] = await handle.db
      .insert(mandateVersion)
      .values({ mandateId: m.mandateId, versionNo: 2, terms: CANVAS_TERMS, canonical: fp.canonical, sha256: fp.sha256, signedAt: new Date(), previousVersionId: m.versionId })
      .returning();
    await handle.db.update(mandate).set({ currentVersionId: v2.id }).where(eq(mandate.id, m.mandateId));
    await expectRefused((d) => payCart(d, { sessionId: m.sessionId, cartId }));
  });

  it("PayPal not linked (no saved payment token)", async () => {
    const m = await activeMandate(handle.db);
    const cartId = await newCart(handle.db, m);
    await handle.db.update(mandate).set({ vaultPaymentTokenId: null }).where(eq(mandate.id, m.mandateId));
    await expectRefused((d) => payCart(d, { sessionId: m.sessionId, cartId }), "not_linked");
  });

  it("an already paid or cancelled cart cannot be paid again", async () => {
    const m = await activeMandate(handle.db, { terms: { ...CANVAS_TERMS, maxPurchases: 3, budgetCents: 50000 } });
    const cartId = await newCart(handle.db, m);
    const money = fakeMoney();
    await payCart({ db: handle.db, money: money.client, judge: fakeJudge().judge, now }, { sessionId: m.sessionId, cartId });
    await expectRefused((d) => payCart(d, { sessionId: m.sessionId, cartId }), "cart_closed");
    const cancelled = await newCart(handle.db, m);
    await handle.db.update(cart).set({ status: "cancelled" }).where(eq(cart.id, cancelled));
    await expectRefused((d) => payCart(d, { sessionId: m.sessionId, cartId: cancelled }), "cart_closed");
  });

  it("totals or verdicts supplied by the caller are ignored", async () => {
    const m = await activeMandate(handle.db);
    const cartId = await newCart(handle.db, m, "tempo-racer-volt");
    const forged = { sessionId: m.sessionId, cartId, totalCents: 100, verdict: "pass", amountCents: 100 } as unknown as {
      sessionId: string;
      cartId: string;
    };
    await expectRefused((d) => payCart(d, forged));
  });
});

describe("PayPal outage", () => {
  it("leaves the cart checked but not paid, with no order, and can be retried", async () => {
    const m = await activeMandate(handle.db);
    const cartId = await newCart(handle.db, m);
    const down = fakeMoney("outage");
    const r = await payCart({ db: handle.db, money: down.client, judge: fakeJudge().judge, now }, { sessionId: m.sessionId, cartId });
    expect(r.status).toBe("not_paid");
    const [cr] = await handle.db.select().from(cart).where(eq(cart.id, cartId));
    expect(cr.status).toBe("checked_not_paid");
    expect(await handle.db.select().from(order).where(eq(order.mandateId, m.mandateId))).toHaveLength(0);

    const up = fakeMoney();
    const retry = await payCart({ db: handle.db, money: up.client, judge: fakeJudge().judge, now }, { sessionId: m.sessionId, cartId });
    expect(retry.status).toBe("paid");
  });
});

describe("static boundary: money moves only through lib/payments", () => {
  const root = process.cwd();
  const SCAN = ["app", "components", "lib", "workflows"];
  const INTERNAL = /(payments\/paypal-rest|payments\/paypal-money)/;
  const files: string[] = [];
  const walk = (dir: string) => {
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|mts)$/.test(e)) files.push(p);
    }
  };
  SCAN.forEach((d) => walk(path.join(root, d)));
  const rel = (f: string) => path.relative(root, f).split(path.sep).join("/");
  const outside = files.filter((f) => !rel(f).startsWith("lib/payments/"));

  it("finds files to scan", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("no file outside lib/payments imports the internal transport or money module", () => {
    const offenders = outside.filter((f) => INTERNAL.test(readFileSync(f, "utf8")));
    expect(offenders.map(rel)).toEqual([]);
  });

  it("no file outside lib/payments talks to PayPal order or capture endpoints directly", () => {
    const offenders = outside.filter((f) => /\/v2\/checkout\/orders|\/v3\/vault\/payment-tokens|api-m\.(sandbox\.)?paypal\.com/.test(readFileSync(f, "utf8")));
    expect(offenders.map(rel)).toEqual([]);
  });

  it("only lib/payments/toolkit.ts imports the PayPal Agent Toolkit", () => {
    const offenders = files.filter((f) => /@paypal\/agent-toolkit/.test(readFileSync(f, "utf8")) && rel(f) !== "lib/payments/toolkit.ts");
    expect(offenders.map(rel)).toEqual([]);
  });

  it.todo("the shopping agent registers no raw money moving tool (lands with the tool registry, T053)");
});

describe("audit trail", () => {
  it("records the refusal with the failed terms and no secrets", async () => {
    const m = await activeMandate(handle.db);
    const cartId = await newCart(handle.db, m, "tempo-racer-volt");
    await expectRefused((d) => payCart(d, { sessionId: m.sessionId, cartId }));
    const rows = await handle.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "payment_refused"), eq(auditLog.sessionId, m.sessionId)));
    expect(rows).toHaveLength(1);
    const detail = JSON.stringify(rows[0].detail);
    expect(detail).toContain("budget");
    expect(detail).not.toContain("vault-token-test");
  });
});
