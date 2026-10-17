/**
 * Cart API handlers: read the latest Mandate check, run a check, pay, cancel (contracts/http-api.md).
 * Payment goes through payCart only; a refusal is a 409 carrying the failed terms.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import type { ProductAttributes } from "@/lib/catalog/data";
import type { TermResult } from "@/lib/check/run";
import type { Db } from "@/lib/db/client";
import { cart, checkResult, mandate, mandateVersion, order, product, store } from "@/lib/db/schema";
import { checkCart, payCart, type GateDeps } from "@/lib/payments/gate";
import { apiError, handle, type ApiResult } from "./result";

const UUID = /^[0-9a-f-]{36}$/i;

export type CheckView = {
  cart: {
    id: string;
    status: string;
    store: { id: string; name: string };
    lines: { productId: string; name: string; brand: string; colors: string[]; size: string | null; qty: number; priceCents: number }[];
  };
  mandate: { code: string; versionNo: number; current: boolean };
  check: {
    id: string;
    stage: string;
    verdict: "pass" | "fail";
    createdAt: string;
    terms: TermResult[];
    totals: { subtotalCents: number; shippingCents: number; taxCents: number; totalCents: number; remainingBudgetCents: number };
    summary: { passed: number; total: number };
  } | null;
  order: { code: string; status: string; amountCents: number; paypalOrderId: string | null; customId: string } | null;
};

async function loadView(db: Db, sessionId: string, cartId: string): Promise<CheckView | null> {
  if (!UUID.test(cartId)) return null;
  const [c] = await db.select().from(cart).where(and(eq(cart.id, cartId), eq(cart.sessionId, sessionId)));
  if (!c) return null;
  const [m] = await db.select().from(mandate).where(eq(mandate.id, c.mandateId));
  const [v] = await db.select().from(mandateVersion).where(eq(mandateVersion.id, c.mandateVersionId));
  const [s] = await db.select().from(store).where(eq(store.id, c.storeId));
  const lines = c.lines as { productId: string; size: string | null; qty: number }[];
  const products = await db.select().from(product).where(inArray(product.id, lines.map((l) => l.productId)));
  const byId = new Map(products.map((p) => [p.id, p]));
  const [chk] = await db.select().from(checkResult).where(eq(checkResult.cartId, c.id)).orderBy(desc(checkResult.createdAt)).limit(1);
  const [o] = await db.select().from(order).where(eq(order.cartId, c.id));
  const terms = (chk?.terms ?? []) as TermResult[];
  const termRows = terms.filter((t) => t.group === "term");
  return {
    cart: {
      id: c.id,
      status: c.status,
      store: { id: s.id, name: s.name },
      lines: lines.map((l) => {
        const p = byId.get(l.productId);
        const a = (p?.attributes ?? { brand: "", colors: [] }) as ProductAttributes;
        return { productId: l.productId, name: p?.name ?? l.productId, brand: a.brand, colors: a.colors, size: l.size, qty: l.qty, priceCents: p?.priceCents ?? 0 };
      }),
    },
    mandate: { code: m.code, versionNo: v.versionNo, current: m.currentVersionId === v.id },
    check: chk
      ? {
          id: chk.id,
          stage: chk.stage,
          verdict: chk.verdict,
          createdAt: chk.createdAt.toISOString(),
          terms,
          totals: chk.totals as NonNullable<CheckView["check"]>["totals"],
          summary: { passed: termRows.filter((t) => t.pass).length, total: termRows.length },
        }
      : null,
    order: o ? { code: o.code, status: o.status, amountCents: o.amountCents, paypalOrderId: o.paypalOrderId, customId: o.customId } : null,
  };
}

export async function getCheckView(db: Db, sessionId: string, cartId: string): Promise<ApiResult<{ view: CheckView }>> {
  const view = await loadView(db, sessionId, cartId);
  return view ? { status: 200, body: { view } } : apiError(404, "not_found", "No such cart");
}

export async function runCheck(gate: GateDeps, sessionId: string, cartId: string): Promise<ApiResult<{ view: CheckView }>> {
  const r = await handle(200, () => checkCart(gate, { sessionId, cartId }));
  if (r.status !== 200) return r as ApiResult<never>;
  const out = r.body as Awaited<ReturnType<typeof checkCart>>;
  if (!out.ok) return apiError(404, "not_found", "No such cart");
  return getCheckView(gate.db, sessionId, cartId);
}

export async function pay(gate: GateDeps, sessionId: string, cartId: string): Promise<ApiResult<{ orderCode: string; view: CheckView }>> {
  const r = await payCart(gate, { sessionId, cartId });
  if (r.status === "paid") return { status: 200, body: { orderCode: r.orderCode, view: (await loadView(gate.db, sessionId, cartId))! } };
  if (r.status === "not_paid") return apiError(503, "paypal_unavailable", "PayPal is not available right now. The cart is checked and can be paid later.");
  if (r.reason === "cart_not_found") return apiError(404, "not_found", "No such cart");
  return apiError(409, r.reason, r.reason === "check_failed" ? "Payment stopped: the cart is outside the mandate." : "This cart cannot be paid.", {
    failed: (r.failed ?? []).map((t) => ({ term: t.term, label: t.label, explanation: t.explanation })),
    checkResultId: r.checkResultId ?? null,
  });
}

export async function cancel(db: Db, sessionId: string, cartId: string): Promise<ApiResult<{ status: string }>> {
  if (!UUID.test(cartId)) return apiError(404, "not_found", "No such cart");
  const [c] = await db.select().from(cart).where(and(eq(cart.id, cartId), eq(cart.sessionId, sessionId)));
  if (!c) return apiError(404, "not_found", "No such cart");
  if (c.status === "paid") return apiError(409, "paid", "A paid cart cannot be cancelled.");
  await db.update(cart).set({ status: "cancelled", updatedAt: new Date() }).where(eq(cart.id, c.id));
  return { status: 200, body: { status: "cancelled" } };
}
