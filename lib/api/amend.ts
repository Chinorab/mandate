/**
 * Ways out of a blocked cart (US3): widen the mandate with an explicit, signed amendment, switch to
 * a compliant alternative, or cancel (lib/api/carts.ts). Terms are never read from the browser:
 * the server recomputes the proposal and the buyer confirms it by its hash.
 */
import { and, desc, eq } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { findAlternative, type Alternative } from "@/lib/check/alternative";
import type { CheckOutcome, SemanticVerdict, TermResult } from "@/lib/check/run";
import { lockMandate, type DbOrTx } from "@/lib/db/client";
import { cart, checkResult, mandate, mandateVersion } from "@/lib/db/schema";
import { proposeAmendment, type Change, type ProposalResult } from "@/lib/mandate/amend";
import { fingerprint } from "@/lib/mandate/canonical";
import { loadMandateContext } from "@/lib/mandate/context";
import { checkCart, evaluateCart, loadCartContext, type CartContext, type GateDeps } from "@/lib/payments/gate";
import { getCheckView, type CheckView } from "./carts";
import { apiError, type ApiResult } from "./result";

export type OptionsBody = {
  amendment: ({ amendable: true; changes: Change[]; proposalHash: string; mandateCode: string; versionNo: number }) | { amendable: false; reason: string };
  alternative: Alternative | null;
};

/** Semantic verdicts as recorded by the latest check (no new model call when proposing). */
async function recordedSemantic(db: DbOrTx, cartId: string): Promise<Record<string, SemanticVerdict>> {
  const [last] = await db.select().from(checkResult).where(eq(checkResult.cartId, cartId)).orderBy(desc(checkResult.createdAt)).limit(1);
  const rows = ((last?.terms ?? []) as TermResult[]).filter((t) => t.kind === "semantic");
  return Object.fromEntries(rows.map((r) => [r.term.slice("semantic:".length), { status: r.pass ? "pass" : "fail", reason: r.explanation }]));
}

function proposalFor(ctx: CartContext, outcome: CheckOutcome, now: Date): ProposalResult {
  if (!ctx.terms) return { amendable: false, reason: "The signed terms could not be read." };
  return proposeAmendment({
    terms: ctx.terms,
    baseSha256: ctx.version.sha256,
    outcome,
    lines: ctx.lines,
    store: { id: ctx.store.id, name: ctx.store.name },
    spentCents: ctx.spentCents,
    capturedCount: ctx.capturedCount,
    now,
  });
}

export async function getOptions(gate: GateDeps, sessionId: string, cartId: string): Promise<ApiResult<OptionsBody>> {
  const now = (gate.now ?? (() => new Date()))();
  const pre = await loadCartContext(gate.db, sessionId, cartId);
  if (!pre.ok) return apiError(404, "not_found", "No such cart");
  const ctx = pre.ctx;
  const outcome = evaluateCart(ctx, await recordedSemantic(gate.db, cartId), now);
  const p = proposalFor(ctx, outcome, now);
  const mctx = await loadMandateContext(gate.db, sessionId, ctx.mandate.code);
  const size = ctx.lines.find((l) => l.size)?.size ?? null;
  const alternative =
    mctx && mctx.mandate.status === "active" && outcome.verdict === "fail"
      ? await findAlternative(gate.db, mctx, { size, excludeProductId: ctx.lines[0]?.product.id, now })
      : null;
  return {
    status: 200,
    body: {
      amendment: p.amendable
        ? { amendable: true, changes: p.proposal.changes, proposalHash: p.proposal.proposalHash, mandateCode: ctx.mandate.code, versionNo: ctx.version.versionNo }
        : { amendable: false, reason: p.reason },
      alternative,
    },
  };
}

export async function approveAmendment(
  gate: GateDeps,
  sessionId: string,
  cartId: string,
  body: { confirm?: unknown; proposalHash?: unknown },
): Promise<ApiResult<{ view: CheckView }>> {
  if (body?.confirm !== true || typeof body?.proposalHash !== "string") {
    return apiError(400, "confirmation_required", "Tick the approval box to approve these changes.");
  }
  const now = (gate.now ?? (() => new Date()))();
  const pre = await loadCartContext(gate.db, sessionId, cartId);
  if (!pre.ok) return apiError(404, "not_found", "No such cart");

  const result = await gate.db.transaction(async (tx): Promise<ApiResult<null>> => {
    await lockMandate(tx, pre.ctx.mandate.id);
    const fresh = await loadCartContext(tx, sessionId, cartId);
    if (!fresh.ok) return apiError(404, "not_found", "No such cart");
    const ctx = fresh.ctx;
    if (ctx.mandate.status !== "active" || ctx.mandate.revokedAt) return apiError(409, "not_active", "Only an active mandate can be amended.");
    if (ctx.cart.status === "paid" || ctx.cart.status === "cancelled") return apiError(409, "cart_closed", "This cart is closed.");

    const p = proposalFor(ctx, evaluateCart(ctx, await recordedSemantic(tx, cartId), now), now);
    if (!p.amendable) return apiError(409, "not_amendable", p.reason);
    if (p.proposal.proposalHash !== body.proposalHash) {
      return apiError(409, "stale_proposal", "The mandate or the cart changed. Review the proposed changes again.");
    }

    const versionNo = ctx.version.versionNo + 1;
    const fp = fingerprint(ctx.mandate.code, versionNo, p.proposal.terms);
    const [v] = await tx
      .insert(mandateVersion)
      .values({
        mandateId: ctx.mandate.id,
        versionNo,
        terms: JSON.parse(fp.canonical).terms,
        assumptions: [],
        canonical: fp.canonical,
        sha256: fp.sha256,
        signedAt: now,
        previousVersionId: ctx.version.id,
        changeSummary: p.proposal.changes,
        amendedForCartId: cartId,
      })
      .returning({ id: mandateVersion.id });
    await tx.update(mandate).set({ currentVersionId: v.id }).where(eq(mandate.id, ctx.mandate.id));
    await tx.update(cart).set({ mandateVersionId: v.id, status: "open", updatedAt: new Date() }).where(and(eq(cart.id, cartId), eq(cart.sessionId, sessionId)));
    await audit(tx, {
      sessionId,
      actor: "buyer",
      action: "mandate_amended",
      detail: { code: ctx.mandate.code, version: versionNo, sha256: fp.sha256, changes: p.proposal.changes, cartId },
    });
    return { status: 200, body: null };
  });
  if (result.status !== 200) return result as ApiResult<never>;

  await checkCart(gate, { sessionId, cartId });
  return getCheckView(gate.db, sessionId, cartId);
}

export async function switchToAlternative(gate: GateDeps, sessionId: string, cartId: string): Promise<ApiResult<{ cartId: string }>> {
  const now = (gate.now ?? (() => new Date()))();
  const pre = await loadCartContext(gate.db, sessionId, cartId);
  if (!pre.ok) return apiError(404, "not_found", "No such cart");
  if (pre.ctx.cart.status === "paid") return apiError(409, "paid", "This cart is already paid.");
  const mctx = await loadMandateContext(gate.db, sessionId, pre.ctx.mandate.code);
  if (!mctx || mctx.mandate.status !== "active") return apiError(409, "not_active", "The mandate is not active.");
  const size = pre.ctx.lines.find((l) => l.size)?.size ?? null;
  const alt = await findAlternative(gate.db, mctx, { size, excludeProductId: pre.ctx.lines[0]?.product.id, now });
  if (!alt) return apiError(409, "no_alternative", "No product in the demo stores passes every term.");

  const next = await gate.db.transaction(async (tx) => {
    await tx.update(cart).set({ status: "cancelled", updatedAt: new Date() }).where(eq(cart.id, cartId));
    const [c] = await tx
      .insert(cart)
      .values({
        sessionId,
        mandateId: mctx.mandate.id,
        mandateVersionId: mctx.version.id,
        storeId: alt.storeId,
        lines: [{ productId: alt.productId, size: alt.size, qty: 1 }],
      })
      .returning({ id: cart.id });
    await audit(tx, { sessionId, actor: "buyer", action: "cart_switched", detail: { from: cartId, to: c.id, productId: alt.productId } });
    return c.id;
  });
  await checkCart(gate, { sessionId, cartId: next });
  return { status: 200, body: { cartId: next } };
}
