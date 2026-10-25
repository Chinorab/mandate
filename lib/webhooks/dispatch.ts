/**
 * PayPal webhook handling (FR-027). Order of operations:
 *   1. parse, then verify the signature with PayPal; anything unverified is answered 400 and nothing
 *      is written (a forged copy must not take the event id of a genuine event that arrives later);
 *   2. record the event id once (paypal_event primary key); a delivery already processed is a 200 no-op;
 *   3. act: CUSTOMER.DISPUTE.* events create or update the dispute; a new dispute gets its evidence
 *      file and draft assembled through `enqueue` (inline today, Render Workflows when configured).
 */
import { and, eq, or } from "drizzle-orm";
import type { ApiResult } from "@/lib/api/result";
import { audit } from "@/lib/audit";
import type { Db } from "@/lib/db/client";
import { dispute, order, paypalEvent } from "@/lib/db/schema";
import { assembleEvidence } from "@/lib/disputes/assemble";
import type { Drafter } from "@/lib/disputes/draft";
import type { EvidenceJob } from "@/lib/disputes/queue";
import { toCents } from "@/lib/disputes/format";
import { MERCHANT_STORE_ID } from "@/lib/merchant/orders";
import type { PayPalDispute } from "@/lib/payments/disputes";
import type { WebhookVerifier } from "@/lib/payments/webhooks";

export type WebhookDeps = {
  db: Db;
  verify: WebhookVerifier;
  drafter: Drafter;
  /** Hands evidence assembly to Render Workflows or the app (lib/disputes/queue.ts). Tests run it at once. */
  enqueue: (job: EvidenceJob) => void | Promise<void>;
};

type PayPalEvent = { id: string; event_type: string; resource?: Record<string, unknown> };

const MAX_BODY = 256 * 1024;

// Local error shape (same as lib/api/result) so operator scripts can use this module outside Next.
function apiError(status: number, code: string, message: string): ApiResult<never> {
  return { status, body: { error: { code, message } } };
}

export async function handlePayPalWebhook(
  deps: WebhookDeps,
  headers: Record<string, string>,
  raw: string,
): Promise<ApiResult<{ received: true; duplicate: boolean }>> {
  if (raw.length > MAX_BODY) return apiError(400, "too_large", "Event body is too large.");
  let event: PayPalEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return apiError(400, "invalid_json", "Event body is not JSON.");
  }
  if (!event || typeof event.id !== "string" || typeof event.event_type !== "string") {
    return apiError(400, "invalid_event", "Event id and type are required.");
  }
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const verified = await deps.verify({ headers: lower, event }).catch(() => false);
  if (!verified) return apiError(400, "unverified", "The event signature could not be verified.");

  const resource = event.resource ?? {};
  const resourceId = typeof resource.dispute_id === "string" ? resource.dispute_id : typeof resource.id === "string" ? resource.id : null;
  const [inserted] = await deps.db
    .insert(paypalEvent)
    .values({ id: event.id, eventType: event.event_type, resourceId, verified: true })
    .onConflictDoNothing()
    .returning();
  if (!inserted) {
    const [seen] = await deps.db.select().from(paypalEvent).where(eq(paypalEvent.id, event.id));
    // A delivery that failed before is processed again; one that succeeded is not.
    if (seen?.processedAt) return { status: 200, body: { received: true, duplicate: true } };
  }

  try {
    await processEvent(deps, event);
    await deps.db.update(paypalEvent).set({ processedAt: new Date(), error: null }).where(eq(paypalEvent.id, event.id));
  } catch (err) {
    await deps.db
      .update(paypalEvent)
      .set({ error: err instanceof Error ? err.message.slice(0, 500) : "processing failed" })
      .where(eq(paypalEvent.id, event.id));
    // PayPal retries on a non 2xx answer.
    return apiError(500, "processing_failed", "The event could not be processed.");
  }
  return { status: 200, body: { received: true, duplicate: false } };
}

/** Acts on a verified event. Exported for the development scenario, which has no signature. */
export async function processEvent(deps: Omit<WebhookDeps, "verify">, event: PayPalEvent) {
  if (!event.event_type.startsWith("CUSTOMER.DISPUTE.")) return;
  const r = event.resource as PayPalDispute | undefined;
  if (!r?.dispute_id) throw new Error("Dispute event without dispute_id");
  const { id, created } = await upsertDispute(deps.db, r);
  if (created) {
    await audit(deps.db, { actor: "system", action: "dispute_received", detail: { disputeId: id, paypalDisputeId: r.dispute_id, reason: r.reason ?? null } });
  }
  if (created && event.event_type !== "CUSTOMER.DISPUTE.RESOLVED") {
    await deps.enqueue({
      disputeId: id,
      run: async () => {
        await assembleEvidence({ db: deps.db, drafter: deps.drafter }, id, "inline");
      },
    });
  }
}

const date = (s: string | undefined) => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

async function upsertDispute(db: Db, r: PayPalDispute): Promise<{ id: string; created: boolean }> {
  const fields = {
    status: r.status ?? "OPEN",
    stage: r.dispute_life_cycle_stage ?? null,
    sellerResponseDue: date(r.seller_response_due_date),
    updatedAt: new Date(),
  };
  const [known] = await db.select({ id: dispute.id }).from(dispute).where(eq(dispute.paypalDisputeId, r.dispute_id));
  if (known) {
    await db.update(dispute).set(fields).where(eq(dispute.id, known.id));
    return { id: known.id, created: false };
  }

  // The order behind the case: PayPal's seller transaction id is our capture id; custom is our custom_id.
  const tx = r.disputed_transactions ?? [];
  const captureIds = tx.map((t) => t.seller_transaction_id).filter((x): x is string => Boolean(x));
  const customIds = tx.map((t) => t.custom).filter((x): x is string => Boolean(x));
  const conditions = [...captureIds.map((c) => eq(order.paypalCaptureId, c)), ...customIds.map((c) => eq(order.customId, c))];
  const [o] = conditions.length ? await db.select({ id: order.id, storeId: order.storeId }).from(order).where(or(...conditions)).limit(1) : [];

  const [row] = await db
    .insert(dispute)
    .values({
      paypalDisputeId: r.dispute_id,
      orderId: o?.id ?? null,
      reason: r.reason ?? null,
      amountCents: toCents(r.dispute_amount?.value),
      openedAt: date(r.create_time),
      // The demo pool holds disputes on the merchant view's store (FR-032).
      inPool: o?.storeId === MERCHANT_STORE_ID,
      ...fields,
    })
    .onConflictDoNothing({ target: dispute.paypalDisputeId })
    .returning({ id: dispute.id });
  if (row) return { id: row.id, created: true };
  const [raced] = await db.select({ id: dispute.id }).from(dispute).where(and(eq(dispute.paypalDisputeId, r.dispute_id)));
  return { id: raced.id, created: false };
}
