import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { order } from "@/lib/db/schema";
import { payCart } from "@/lib/payments/gate";
import { testDb } from "../helpers/db";
import { CANVAS_TERMS, CHECK_TIME } from "../helpers/fixtures";
import { activeMandate, fakeJudge, fakeMoney, newCart } from "../helpers/scenario";

let handle: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  handle = await testDb();
});
afterAll(async () => {
  await handle.close();
});

describe("concurrent payments under one mandate", () => {
  it("two parallel payments with one purchase left produce exactly one order", async () => {
    const m = await activeMandate(handle.db);
    const a = await newCart(handle.db, m);
    const b = await newCart(handle.db, m);
    const money = fakeMoney();
    const deps = { db: handle.db, money: money.client, judge: fakeJudge().judge, now: () => CHECK_TIME };
    const results = await Promise.all([
      payCart(deps, { sessionId: m.sessionId, cartId: a }),
      payCart(deps, { sessionId: m.sessionId, cartId: b }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["paid", "refused"]);
    expect(money.charges).toHaveLength(1);
    expect(await handle.db.select().from(order).where(eq(order.mandateId, m.mandateId))).toHaveLength(1);
  });

  it("parallel payments cannot together exceed the budget", async () => {
    // $150 budget, 3 purchases: two Daily Milers ($103.92 each) cannot both pass.
    const m = await activeMandate(handle.db, { terms: { ...CANVAS_TERMS, budgetCents: 15000, maxPurchases: 3 } });
    const carts = await Promise.all([newCart(handle.db, m), newCart(handle.db, m), newCart(handle.db, m)]);
    const money = fakeMoney();
    const deps = { db: handle.db, money: money.client, judge: fakeJudge().judge, now: () => CHECK_TIME };
    const results = await Promise.all(carts.map((cartId) => payCart(deps, { sessionId: m.sessionId, cartId })));
    expect(results.filter((r) => r.status === "paid")).toHaveLength(1);
    expect(money.charges).toHaveLength(1);
  });
});
