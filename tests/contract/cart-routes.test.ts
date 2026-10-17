/** Contract tests for the cart handlers (T048): check, pay, cancel, and the refusal shape. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as api from "@/lib/api/carts";
import { testDb } from "../helpers/db";
import { CHECK_TIME } from "../helpers/fixtures";
import { activeMandate, fakeJudge, fakeMoney, newCart, newSession } from "../helpers/scenario";

let handle: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  handle = await testDb();
});
afterAll(async () => {
  await handle.close();
});

const gate = (money = fakeMoney()) => ({ db: handle.db, money: money.client, judge: fakeJudge().judge, now: () => CHECK_TIME });
type Err = { error: { code: string; message: string; details?: { failed: { term: string; explanation: string }[] } } };

describe("POST /api/carts/:id/check", () => {
  it("returns the term by term view, without paying", async () => {
    const m = await activeMandate(handle.db);
    const cartId = await newCart(handle.db, m);
    const money = fakeMoney();
    const r = await api.runCheck(gate(money), m.sessionId, cartId);
    expect(r.status).toBe(200);
    const v = (r.body as { view: api.CheckView }).view;
    expect(v.check).toMatchObject({ verdict: "pass", stage: "preview", summary: { passed: 7, total: 7 } });
    expect(v.check!.totals.totalCents).toBe(10392);
    expect(v.cart.lines[0]).toMatchObject({ name: "Daily Miler", size: "10" });
    expect(v.mandate.code).toBe(m.code);
    expect(money.charges).toHaveLength(0);
  });
});

describe("POST /api/carts/:id/pay", () => {
  it("409 with the failed terms when the cart is outside the mandate, and zero PayPal calls", async () => {
    const m = await activeMandate(handle.db);
    const cartId = await newCart(handle.db, m, "tempo-racer-volt");
    const money = fakeMoney();
    const r = await api.pay(gate(money), m.sessionId, cartId);
    expect(r.status).toBe(409);
    const e = r.body as Err;
    expect(e.error.code).toBe("check_failed");
    expect(e.error.details!.failed.map((f) => f.term)).toEqual(["budget", "colors"]);
    expect(e.error.details!.failed[0].explanation).toContain("$7.74 over");
    expect(money.charges).toHaveLength(0);
  });

  it("200 with the order when compliant; the view shows the order and custom_id", async () => {
    const m = await activeMandate(handle.db);
    const cartId = await newCart(handle.db, m);
    const r = await api.pay(gate(), m.sessionId, cartId);
    expect(r.status).toBe(200);
    const body = r.body as { orderCode: string; view: api.CheckView };
    expect(body.view.order).toMatchObject({ code: body.orderCode, status: "captured", amountCents: 10392 });
    expect(body.view.order!.customId).toBe(`${m.code}:1:${m.sha256}`);
    expect(body.view.cart.status).toBe("paid");
  });

  it("503 when PayPal is down", async () => {
    const m = await activeMandate(handle.db);
    const cartId = await newCart(handle.db, m);
    expect((await api.pay(gate(fakeMoney("outage")), m.sessionId, cartId)).status).toBe(503);
  });

  it("404 for another session's cart or a malformed id", async () => {
    const m = await activeMandate(handle.db);
    const cartId = await newCart(handle.db, m);
    const other = await newSession(handle.db);
    const money = fakeMoney();
    expect((await api.pay(gate(money), other, cartId)).status).toBe(404);
    expect((await api.pay(gate(money), m.sessionId, "../etc")).status).toBe(404);
    expect((await api.getCheckView(handle.db, other, cartId)).status).toBe(404);
    expect(money.charges).toHaveLength(0);
  });
});

describe("POST /api/carts/:id/cancel", () => {
  it("cancels an open cart, which then cannot be paid", async () => {
    const m = await activeMandate(handle.db);
    const cartId = await newCart(handle.db, m);
    expect((await api.cancel(handle.db, m.sessionId, cartId)).status).toBe(200);
    const money = fakeMoney();
    const r = await api.pay(gate(money), m.sessionId, cartId);
    expect(r.status).toBe(409);
    expect((r.body as Err).error.code).toBe("cart_closed");
    expect(money.charges).toHaveLength(0);
  });

  it("refuses to cancel a paid cart", async () => {
    const m = await activeMandate(handle.db);
    const cartId = await newCart(handle.db, m);
    await api.pay(gate(), m.sessionId, cartId);
    expect((await api.cancel(handle.db, m.sessionId, cartId)).status).toBe(409);
  });
});

describe("GET /api/carts/:id/check", () => {
  it("returns the latest check, or none before any check", async () => {
    const m = await activeMandate(handle.db);
    const cartId = await newCart(handle.db, m);
    const before = await api.getCheckView(handle.db, m.sessionId, cartId);
    expect((before.body as { view: api.CheckView }).view.check).toBeNull();
    await api.runCheck(gate(), m.sessionId, cartId);
    const after = await api.getCheckView(handle.db, m.sessionId, cartId);
    expect((after.body as { view: api.CheckView }).view.check?.verdict).toBe("pass");
  });
});
