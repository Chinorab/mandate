/**
 * The consent gate (constitution I, contracts/consent-gate.md). payCart is the ONLY function in the
 * app that can make PayPal move money, and it always:
 *
 *   1. takes only ids from the caller (no amount, no verdict, no terms),
 *   2. locks the mandate row so concurrent payments cannot share the remaining budget or count,
 *   3. re-reads the cart, the pinned mandate version and the catalog rows under that lock,
 *   4. runs the deterministic Mandate check (pre_create), records it, and refuses on any failure,
 *   5. charges the saved PayPal with the check id as PayPal-Request-Id and the mandate in custom_id,
 *   6. checks again before any separate capture (pre_capture).
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/lib/audit";
import type { SemanticJudge } from "@/lib/check/semantic";
import { runMandateCheck, type CheckLine, type CheckOutcome, type SemanticVerdict, type TermResult } from "@/lib/check/run";
import { lockMandate, type Db, type DbOrTx } from "@/lib/db/client";
import { cart, checkResult, mandate, mandateVersion, order, product, store } from "@/lib/db/schema";
import { termsSchema, type Terms } from "@/lib/mandate/terms";
import type { MoneyClient } from "./paypal-money";

export type GateDeps = { db: Db; money: MoneyClient; judge: SemanticJudge; now?: () => Date };

export type RefusalReason = "cart_not_found" | "cart_invalid" | "cart_closed" | "check_failed" | "not_linked";

export type PayResult =
  | { status: "paid"; orderId: string; orderCode: string; paypalOrderId: string; checkResultId: string }
  | { status: "refused"; reason: RefusalReason; checkResultId?: string; failed?: TermResult[] }
  | { status: "not_paid"; reason: "paypal_unavailable"; checkResultId: string; retry: true };

const cartLinesSchema = z
  .array(z.object({ productId: z.string(), size: z.string().nullable(), qty: z.number().int().min(1).max(10) }))
  .min(1)
  .max(20);

export type CartContext = {
  cart: typeof cart.$inferSelect;
  mandate: typeof mandate.$inferSelect;
  version: typeof mandateVersion.$inferSelect;
  store: typeof store.$inferSelect;
  lines: CheckLine[];
  terms: Terms | null;
  spentCents: number;
  capturedCount: number;
};

export async function loadCartContext(
  db: DbOrTx,
  sessionId: string,
  cartId: string,
): Promise<{ ok: true; ctx: CartContext } | { ok: false; reason: RefusalReason }> {
  if (!/^[0-9a-f-]{36}$/i.test(cartId)) return { ok: false, reason: "cart_not_found" };
  const [c] = await db
    .select()
    .from(cart)
    .where(and(eq(cart.id, cartId), eq(cart.sessionId, sessionId)));
  if (!c) return { ok: false, reason: "cart_not_found" };

  const [m] = await db.select().from(mandate).where(eq(mandate.id, c.mandateId));
  const [v] = await db.select().from(mandateVersion).where(eq(mandateVersion.id, c.mandateVersionId));
  const [s] = await db.select().from(store).where(eq(store.id, c.storeId));
  if (!m || !v || !s || m.sessionId !== sessionId) return { ok: false, reason: "cart_not_found" };

  const parsedLines = cartLinesSchema.safeParse(c.lines);
  if (!parsedLines.success) return { ok: false, reason: "cart_invalid" };
  const ids = [...new Set(parsedLines.data.map((l) => l.productId))];
  const rows = await db.select().from(product).where(inArray(product.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  if (rows.length !== ids.length) return { ok: false, reason: "cart_invalid" };

  const lines: CheckLine[] = parsedLines.data.map((l) => {
    const p = byId.get(l.productId)!;
    return {
      product: {
        id: p.id,
        storeId: p.storeId,
        name: p.name,
        category: p.category,
        currency: p.currency,
        priceCents: p.priceCents,
        attributes: p.attributes as CheckLine["product"]["attributes"],
        description: p.description,
      },
      size: l.size,
      qty: l.qty,
    };
  });

  const [agg] = await db
    .select({
      spent: sql<number>`coalesce(sum(${order.amountCents}), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(order)
    .where(and(eq(order.mandateId, m.id), eq(order.status, "captured")));

  const parsedTerms = termsSchema.safeParse(v.terms);
  return {
    ok: true,
    ctx: {
      cart: c,
      mandate: m,
      version: v,
      store: s,
      lines,
      terms: parsedTerms.success ? parsedTerms.data : null,
      spentCents: Number(agg?.spent ?? 0),
      capturedCount: Number(agg?.count ?? 0),
    },
  };
}

export function evaluateCart(ctx: CartContext, semantic: Record<string, SemanticVerdict>, now: Date): CheckOutcome {
  return runMandateCheck({
    mandate: {
      code: ctx.mandate.code,
      status: ctx.mandate.status,
      revokedAt: ctx.mandate.revokedAt,
      flaggedAt: ctx.mandate.flaggedAt,
    },
    version: {
      versionNo: ctx.version.versionNo,
      terms: ctx.version.terms,
      canonical: ctx.version.canonical,
      sha256: ctx.version.sha256,
      isCurrent: ctx.mandate.currentVersionId === ctx.version.id,
    },
    store: {
      id: ctx.store.id,
      name: ctx.store.name,
      taxRateBp: ctx.store.taxRateBp,
      shippingCents: ctx.store.shippingCents,
      freeShippingOverCents: ctx.store.freeShippingOverCents,
    },
    lines: ctx.lines,
    spentCents: ctx.spentCents,
    capturedCount: ctx.capturedCount,
    semantic,
    now,
  });
}

/** Semantic verdicts run before the lock (they may take seconds) and fail closed on any error. */
async function judge(deps: GateDeps, sessionId: string, ctx: CartContext): Promise<Record<string, SemanticVerdict>> {
  if (!ctx.terms || ctx.terms.semantic.length === 0) return {};
  try {
    return await deps.judge({
      sessionId,
      terms: ctx.terms,
      lines: ctx.lines,
      cacheKey: `${ctx.cart.id}:${ctx.version.id}`,
    });
  } catch {
    return Object.fromEntries(ctx.terms.semantic.map((s) => [s.id, { status: "unavailable" as const, reason: "error" }]));
  }
}

async function recordCheck(tx: DbOrTx, ctx: CartContext, outcome: CheckOutcome, stage: "preview" | "pre_create" | "pre_capture") {
  const [row] = await tx
    .insert(checkResult)
    .values({
      cartId: ctx.cart.id,
      mandateVersionId: ctx.version.id,
      stage,
      verdict: outcome.verdict,
      terms: outcome.terms,
      totals: outcome.totals,
      hashVerified: outcome.hashVerified,
    })
    .returning({ id: checkResult.id });
  if (!outcome.hashVerified && !ctx.mandate.flaggedAt) {
    await tx.update(mandate).set({ flaggedAt: new Date() }).where(eq(mandate.id, ctx.mandate.id));
  }
  return row.id;
}

function newOrderCode(): string {
  return String(100000 + Math.floor(Math.random() * 900000));
}

const failedTerms = (o: CheckOutcome) => o.terms.filter((t) => !t.pass);

/** Preview check for the buyer (no payment). Records the result and updates the cart status. */
export async function checkCart(deps: GateDeps, input: { sessionId: string; cartId: string }) {
  const now = deps.now ?? (() => new Date());
  const pre = await loadCartContext(deps.db, input.sessionId, input.cartId);
  if (!pre.ok) return { ok: false as const, reason: pre.reason };
  const semantic = await judge(deps, input.sessionId, pre.ctx);
  const outcome = evaluateCart(pre.ctx, semantic, now());
  const checkResultId = await deps.db.transaction(async (tx) => {
    const id = await recordCheck(tx, pre.ctx, outcome, "preview");
    if (pre.ctx.cart.status === "open" || pre.ctx.cart.status === "checked_pass" || pre.ctx.cart.status === "checked_fail") {
      await tx
        .update(cart)
        .set({ status: outcome.verdict === "pass" ? "checked_pass" : "checked_fail", updatedAt: new Date() })
        .where(eq(cart.id, pre.ctx.cart.id));
    }
    return id;
  });
  return { ok: true as const, checkResultId, outcome };
}

export async function payCart(deps: GateDeps, input: { sessionId: string; cartId: string }): Promise<PayResult> {
  // Only the two ids are read from the caller, whatever else the object carries.
  const sessionId = String(input.sessionId);
  const cartId = String(input.cartId);
  const now = deps.now ?? (() => new Date());

  const pre = await loadCartContext(deps.db, sessionId, cartId);
  if (!pre.ok) {
    await audit(deps.db, { sessionId, actor: "agent", action: "payment_refused", detail: { cartId, reason: pre.reason } });
    return { status: "refused", reason: pre.reason };
  }
  const semantic = await judge(deps, sessionId, pre.ctx);

  return deps.db.transaction(async (tx): Promise<PayResult> => {
    await lockMandate(tx, pre.ctx.mandate.id);
    // Re-read everything under the lock: the mandate may have been revoked, amended or spent meanwhile.
    const fresh = await loadCartContext(tx, sessionId, cartId);
    if (!fresh.ok) return { status: "refused", reason: fresh.reason };
    const ctx = fresh.ctx;

    if (ctx.cart.status === "paid" || ctx.cart.status === "cancelled") {
      await audit(tx, { sessionId, actor: "agent", action: "payment_refused", detail: { cartId, reason: "cart_closed" } });
      return { status: "refused", reason: "cart_closed" };
    }

    const outcome = evaluateCart(ctx, semantic, now());
    const checkId = await recordCheck(tx, ctx, outcome, "pre_create");
    if (outcome.verdict === "fail") {
      await tx.update(cart).set({ status: "checked_fail", updatedAt: new Date() }).where(eq(cart.id, ctx.cart.id));
      await audit(tx, {
        sessionId,
        actor: "agent",
        action: "payment_refused",
        detail: {
          cartId,
          mandate: ctx.mandate.code,
          checkResultId: checkId,
          failed: failedTerms(outcome).map((t) => ({ term: t.term, explanation: t.explanation })),
        },
      });
      return { status: "refused", reason: "check_failed", checkResultId: checkId, failed: failedTerms(outcome) };
    }

    if (!ctx.mandate.vaultPaymentTokenId) {
      await audit(tx, { sessionId, actor: "agent", action: "payment_refused", detail: { cartId, reason: "not_linked" } });
      return { status: "refused", reason: "not_linked", checkResultId: checkId };
    }

    const orderCode = newOrderCode();
    const customId = `${ctx.mandate.code}:${ctx.version.versionNo}:${ctx.version.sha256}`;
    let charge;
    try {
      charge = await deps.money.chargeSavedPayPal({
        requestId: checkId,
        vaultId: ctx.mandate.vaultPaymentTokenId,
        payeeMerchantId: ctx.store.payeeMerchantId,
        storeId: ctx.store.id,
        currency: ctx.terms!.currency,
        amount: {
          totalCents: outcome.totals.totalCents,
          subtotalCents: outcome.totals.subtotalCents,
          shippingCents: outcome.totals.shippingCents,
          taxCents: outcome.totals.taxCents,
        },
        items: ctx.lines.map((l) => ({
          name: l.product.name,
          sku: l.product.id,
          qty: l.qty,
          unitCents: l.product.priceCents,
        })),
        customId,
        invoiceId: `${ctx.mandate.code}.${orderCode}`,
        description: `Agent purchase under mandate ${ctx.mandate.code}`,
      });
    } catch (err) {
      await tx.update(cart).set({ status: "checked_not_paid", updatedAt: new Date() }).where(eq(cart.id, ctx.cart.id));
      await audit(tx, {
        sessionId,
        actor: "system",
        action: "payment_not_completed",
        detail: { cartId, checkResultId: checkId, error: err instanceof Error ? err.name : "unknown" },
      });
      return { status: "not_paid", reason: "paypal_unavailable", checkResultId: checkId, retry: true };
    }

    let captureId = charge.captureId;
    let lastCheckId = checkId;
    if (!captureId) {
      // A separate capture is a second money movement: check again first.
      const second = evaluateCart(ctx, semantic, now());
      lastCheckId = await recordCheck(tx, ctx, second, "pre_capture");
      if (second.verdict === "fail") {
        await tx.update(cart).set({ status: "checked_fail", updatedAt: new Date() }).where(eq(cart.id, ctx.cart.id));
        await audit(tx, { sessionId, actor: "agent", action: "capture_refused", detail: { cartId, paypalOrderId: charge.orderId } });
        return { status: "refused", reason: "check_failed", checkResultId: lastCheckId, failed: failedTerms(second) };
      }
      captureId = (await deps.money.captureOrder(charge.orderId, lastCheckId)).captureId;
    }

    const [o] = await tx
      .insert(order)
      .values({
        code: orderCode,
        sessionId,
        mandateId: ctx.mandate.id,
        mandateVersionId: ctx.version.id,
        cartId: ctx.cart.id,
        checkResultId: lastCheckId,
        storeId: ctx.store.id,
        amountCents: outcome.totals.totalCents,
        currency: ctx.terms!.currency,
        paypalOrderId: charge.orderId,
        paypalCaptureId: captureId,
        customId,
        status: "captured",
        buyerMasked: `Sandbox buyer ${sessionId.slice(0, 4).toUpperCase()}`,
        capturedAt: new Date(),
      })
      .returning({ id: order.id });
    await tx.update(cart).set({ status: "paid", updatedAt: new Date() }).where(eq(cart.id, ctx.cart.id));
    await audit(tx, {
      sessionId,
      actor: "agent",
      action: "payment_captured",
      detail: { mandate: ctx.mandate.code, orderCode, paypalOrderId: charge.orderId, amountCents: outcome.totals.totalCents },
    });
    return { status: "paid", orderId: o.id, orderCode, paypalOrderId: charge.orderId, checkResultId: lastCheckId };
  });
}
