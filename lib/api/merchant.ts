/** Merchant handlers: agent orders for the demo store, and shipment tracking (US5). */
import { and, eq } from "drizzle-orm";
import { audit } from "@/lib/audit";
import type { Db } from "@/lib/db/client";
import { order } from "@/lib/db/schema";
import { MERCHANT_STORE_ID, listMerchantOrders, type MerchantOrder } from "@/lib/merchant/orders";
import type { Toolkit } from "@/lib/payments/toolkit";
import { apiError, handle, type ApiResult } from "./result";

export type OrdersBody = { orders: MerchantOrder[] };

export const CARRIERS = ["UPS", "USPS", "FEDEX", "DHL", "ONTRAC"] as const;

export const listOrders = (db: Db, now: Date = new Date()): Promise<ApiResult<OrdersBody>> =>
  handle(200, async () => ({ orders: await listMerchantOrders(db, now) }));

/**
 * Saves a carrier and tracking number on an order and reports it to PayPal with the Agent Toolkit's
 * create_shipment_tracking. Without PayPal credentials the tracking is kept and marked not reported.
 */
export async function addTracking(
  db: Db,
  toolkit: Toolkit | null,
  code: string,
  body: { carrier?: unknown; number?: unknown },
): Promise<ApiResult<{ reported: boolean; order: MerchantOrder | undefined }>> {
  const carrier = typeof body?.carrier === "string" ? body.carrier.toUpperCase() : "";
  const number = typeof body?.number === "string" ? body.number.trim().toUpperCase() : "";
  if (!(CARRIERS as readonly string[]).includes(carrier)) return apiError(400, "invalid_carrier", `Choose a carrier: ${CARRIERS.join(", ")}.`);
  if (!/^[A-Z0-9]{8,34}$/.test(number)) return apiError(400, "invalid_number", "Enter a tracking number of 8 to 34 letters or digits.");

  const [o] = await db
    .select()
    .from(order)
    .where(and(eq(order.code, String(code)), eq(order.storeId, MERCHANT_STORE_ID)));
  if (!o) return apiError(404, "not_found", "No such order for this store");
  if (o.status !== "captured") return apiError(409, "not_captured", "Only paid orders can be shipped.");

  let reported = false;
  let trackerError: string | null = null;
  if (toolkit && o.paypalOrderId && o.paypalCaptureId) {
    try {
      await toolkit.call("create_shipment_tracking", {
        order_id: o.paypalOrderId,
        transaction_id: o.paypalCaptureId,
        tracking_number: number,
        carrier,
        status: "SHIPPED",
      });
      reported = true;
    } catch (err) {
      trackerError = err instanceof Error ? err.name : "error";
    }
  }
  const tracking = { carrier, number, addedAt: new Date().toISOString(), reportedToPayPal: reported };
  await db.update(order).set({ tracking, shippingStatus: "shipped" }).where(eq(order.id, o.id));
  await audit(db, { actor: "merchant", action: "tracking_added", detail: { orderCode: o.code, carrier, reported, trackerError } });
  const orders = await listMerchantOrders(db);
  return { status: 200, body: { reported, order: orders.find((x) => x.code === o.code) } };
}
