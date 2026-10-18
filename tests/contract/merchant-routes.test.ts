/** Contract tests for the merchant orders view and shipment tracking (US5). */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as merchant from "@/lib/api/merchant";
import * as carts from "@/lib/api/carts";
import { auditLog, order } from "@/lib/db/schema";
import type { Toolkit } from "@/lib/payments/toolkit";
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

const gate = () => ({ db: handle.db, money: fakeMoney().client, judge: fakeJudge().judge, now: () => CHECK_TIME });

async function paidOrder(productId = "daily-miler-blk-wht") {
  const m = await activeMandate(handle.db, { terms: CANVAS_TERMS });
  const cartId = await newCart(handle.db, m, productId);
  const r = await carts.pay(gate(), m.sessionId, cartId);
  expect(r.status).toBe(200);
  return { m, orderCode: (r.body as { orderCode: string }).orderCode };
}

function fakeToolkit() {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const toolkit: Toolkit = {
    tools: () => [],
    call: async (name, args) => {
      calls.push({ name, args });
      return JSON.stringify({ status: "SHIPPED" });
    },
  };
  return { toolkit, calls };
}

describe("GET /api/merchant/orders", () => {
  it("lists agent orders for Sample Sports Outlet only, newest first, with the mandate attached", async () => {
    const a = await paidOrder("daily-miler-blk-wht");
    await paidOrder("road-trainer-4-gray"); // Example Running Co.
    const r = await merchant.listOrders(handle.db);
    expect(r.status).toBe(200);
    const rows = (r.body as merchant.OrdersBody).orders;
    expect(rows.every((o) => o.storeId === "sports-outlet")).toBe(true);
    const row = rows.find((o) => o.code === a.orderCode)!;
    expect(row).toMatchObject({
      item: "Daily Miler, black and white, US men's 10",
      amountCents: 10392,
      mandateCode: a.m.code,
      mandateVersion: 1,
      check: { passed: 7, total: 7 },
      status: "Paid",
      disputeStatus: null,
    });
    expect(row.sha256).toBe(a.m.sha256);
    expect(row.detail.terms).toContain("Up to $120.00 total");
    expect(row.detail.checkTerms.map((t) => t.term)).toContain("budget");
    expect(row.paypalOrderId).toMatch(/^PP-ORDER-/);
  });

  it("masks buyers and never exposes session ids or vault tokens", async () => {
    const a = await paidOrder();
    const r = await merchant.listOrders(handle.db);
    const text = JSON.stringify(r.body);
    expect(text).not.toContain(a.m.sessionId);
    expect(text).not.toMatch(/vault|token/i);
    const row = (r.body as merchant.OrdersBody).orders.find((o) => o.code === a.orderCode)!;
    expect(row.buyer).toMatch(/^Buyer [0-9A-F]{4}$/);
  });
});

describe("POST /api/merchant/orders/:code/tracking", () => {
  it("validates carrier and number", async () => {
    const a = await paidOrder();
    expect((await merchant.addTracking(handle.db, null, a.orderCode, { carrier: "TELEPORT", number: "1Z999" })).status).toBe(400);
    expect((await merchant.addTracking(handle.db, null, a.orderCode, { carrier: "UPS", number: "x" })).status).toBe(400);
    expect((await merchant.addTracking(handle.db, null, a.orderCode, { carrier: "UPS", number: "<script>" })).status).toBe(400);
  });

  it("saves tracking, marks the order shipped and reports it to PayPal through the Agent Toolkit", async () => {
    const a = await paidOrder();
    const tk = fakeToolkit();
    const r = await merchant.addTracking(handle.db, tk.toolkit, a.orderCode, { carrier: "UPS", number: "1Z999AA10123456784" });
    expect(r.status).toBe(200);
    expect((r.body as { reported: boolean }).reported).toBe(true);
    const [o] = await handle.db.select().from(order).where(eq(order.code, a.orderCode));
    expect(o.shippingStatus).toBe("shipped");
    expect(o.tracking).toMatchObject({ carrier: "UPS", number: "1Z999AA10123456784" });
    expect(tk.calls).toEqual([
      {
        name: "create_shipment_tracking",
        args: { order_id: o.paypalOrderId, transaction_id: o.paypalCaptureId, tracking_number: "1Z999AA10123456784", carrier: "UPS", status: "SHIPPED" },
      },
    ]);
    const rows = (await merchant.listOrders(handle.db)).body as merchant.OrdersBody;
    expect(rows.orders.find((x) => x.code === a.orderCode)?.status).toBe("Shipped");
    const audits = await handle.db.select().from(auditLog).where(eq(auditLog.action, "tracking_added"));
    expect(audits.length).toBeGreaterThan(0);
  });

  it("keeps the tracking when PayPal is not configured, and says it was not reported", async () => {
    const a = await paidOrder();
    const r = await merchant.addTracking(handle.db, null, a.orderCode, { carrier: "USPS", number: "9400111899223197428490" });
    expect(r.status).toBe(200);
    expect((r.body as { reported: boolean }).reported).toBe(false);
  });

  it("404 for an unknown order or another store's order", async () => {
    expect((await merchant.addTracking(handle.db, null, "999999", { carrier: "UPS", number: "1Z999AA10123456784" })).status).toBe(404);
    const other = await paidOrder("road-trainer-4-gray");
    expect((await merchant.addTracking(handle.db, null, other.orderCode, { carrier: "UPS", number: "1Z999AA10123456784" })).status).toBe(404);
  });
});
