/**
 * The merchant's view of agent orders for its store (FR-024, FR-025). Buyers are shown as a short
 * hash, never a session id; vault tokens are never selected. Each row carries the mandate the agent
 * shopped under, its fingerprint, and the check that let the payment through.
 */
import { createHash } from "node:crypto";
import { desc, eq, inArray } from "drizzle-orm";
import { COLOR_LABELS, type ProductAttributes } from "@/lib/catalog/data";
import { SIZE_SYSTEM_LABELS } from "@/lib/check/explain";
import type { TermResult } from "@/lib/check/run";
import type { DbOrTx } from "@/lib/db/client";
import { cart, checkResult, dispute, mandate, mandateVersion, order, product } from "@/lib/db/schema";
import { termsSentence } from "@/lib/mandate/summary";
import { termsSchema } from "@/lib/mandate/terms";

export const MERCHANT_STORE_ID = "sports-outlet";

export type OrderStatus = "Paid" | "Shipped" | "Delivered" | "In dispute" | "Resolved" | "Refunded";

export type MerchantOrder = {
  code: string;
  storeId: string;
  placedAt: string;
  item: string;
  category: string;
  buyer: string;
  amountCents: number;
  mandateCode: string;
  mandateVersion: number;
  mandateState: "Active" | "Expired" | "Revoked";
  sha256: string;
  check: { passed: number; total: number };
  status: OrderStatus;
  disputeStatus: string | null;
  disputeId: string | null;
  paypalOrderId: string | null;
  tracking: { carrier: string; number: string } | null;
  detail: { terms: string; signedAt: string; checkedAt: string; checkTerms: TermResult[]; customId: string };
};

export function maskBuyer(sessionId: string): string {
  return `Buyer ${createHash("sha256").update(`buyer:${sessionId}`).digest("hex").slice(0, 4).toUpperCase()}`;
}

function itemLabel(p: typeof product.$inferSelect | undefined, size: string | null): string {
  if (!p) return "Unknown item";
  const a = p.attributes as ProductAttributes;
  const colors = a.colors.map((c) => COLOR_LABELS[c].toLowerCase()).join(" and ");
  const sized = a.sizeSystem && size ? `, ${SIZE_SYSTEM_LABELS[a.sizeSystem]} ${size}` : "";
  return `${p.name}, ${colors}${sized}`;
}

function statusOf(o: typeof order.$inferSelect, d: typeof dispute.$inferSelect | undefined): OrderStatus {
  if (d) return /RESOLVED|CLOSED/i.test(d.status) ? "Resolved" : "In dispute";
  if (o.status === "refunded") return "Refunded";
  if (o.shippingStatus === "delivered") return "Delivered";
  if (o.shippingStatus === "shipped") return "Shipped";
  return "Paid";
}

export async function listMerchantOrders(db: DbOrTx, now: Date = new Date(), storeId = MERCHANT_STORE_ID): Promise<MerchantOrder[]> {
  const orders = await db.select().from(order).where(eq(order.storeId, storeId)).orderBy(desc(order.createdAt));
  if (orders.length === 0) return [];
  const mandates = new Map(
    (
      await db
        .select({ id: mandate.id, code: mandate.code, status: mandate.status, revokedAt: mandate.revokedAt })
        .from(mandate)
        .where(inArray(mandate.id, [...new Set(orders.map((o) => o.mandateId))]))
    ).map((m) => [m.id, m]),
  );
  const versions = new Map(
    (await db.select().from(mandateVersion).where(inArray(mandateVersion.id, [...new Set(orders.map((o) => o.mandateVersionId))]))).map((v) => [v.id, v]),
  );
  const checks = new Map(
    (await db.select().from(checkResult).where(inArray(checkResult.id, orders.map((o) => o.checkResultId)))).map((c) => [c.id, c]),
  );
  const carts = new Map((await db.select().from(cart).where(inArray(cart.id, orders.map((o) => o.cartId)))).map((c) => [c.id, c]));
  const products = new Map((await db.select().from(product)).map((p) => [p.id, p]));
  const disputes = await db.select().from(dispute).where(inArray(dispute.orderId, orders.map((o) => o.id)));

  return orders.map((o) => {
    const m = mandates.get(o.mandateId)!;
    const v = versions.get(o.mandateVersionId)!;
    const c = checks.get(o.checkResultId);
    const terms = termsSchema.parse(v.terms);
    const line = ((carts.get(o.cartId)?.lines ?? []) as { productId: string; size: string | null }[])[0];
    const p = line ? products.get(line.productId) : undefined;
    const termRows = ((c?.terms ?? []) as TermResult[]).filter((t) => t.group === "term");
    const d = disputes.filter((x) => x.orderId === o.id).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    const expired = new Date(terms.expiresAt).getTime() <= now.getTime();
    return {
      code: o.code,
      storeId: o.storeId,
      placedAt: (o.capturedAt ?? o.createdAt).toISOString(),
      item: itemLabel(p, line?.size ?? null),
      category: p?.category ?? "",
      buyer: maskBuyer(o.sessionId),
      amountCents: o.amountCents,
      mandateCode: m.code,
      mandateVersion: v.versionNo,
      mandateState: m.status === "revoked" || m.revokedAt ? "Revoked" : expired ? "Expired" : "Active",
      sha256: v.sha256,
      check: { passed: termRows.filter((t) => t.pass).length, total: termRows.length },
      status: statusOf(o, d),
      disputeStatus: d?.status ?? null,
      disputeId: d?.id ?? null,
      paypalOrderId: o.paypalOrderId,
      tracking: (o.tracking as { carrier: string; number: string } | null) ?? null,
      detail: {
        terms: termsSentence(terms),
        signedAt: v.signedAt.toISOString(),
        checkedAt: (c?.createdAt ?? o.createdAt).toISOString(),
        checkTerms: (c?.terms ?? []) as TermResult[],
        customId: o.customId,
      },
    };
  });
}
