/**
 * Evidence assembly (FR-028): loads the stored records behind a dispute, builds the evidence items and
 * the grounded draft, and stores the evidence file once per dispute. Runs inline after a verified
 * webhook (lib/disputes/enqueue.ts) and is safe to run twice.
 */
import { eq } from "drizzle-orm";
import type { TermResult } from "@/lib/check/run";
import type { DbOrTx } from "@/lib/db/client";
import { cart, checkResult, dispute, evidenceFile, mandate, mandateVersion, order, product, store } from "@/lib/db/schema";
import { termsSchema } from "@/lib/mandate/terms";
import { itemLabel } from "@/lib/merchant/orders";
import { composeResponse, draftInput, type Drafter } from "./draft";
import type { DisputeRecords } from "./items";

export { buildItems, type DisputeRecords, type EvidenceItem } from "./items";

export async function loadDisputeRecords(db: DbOrTx, disputeId: string): Promise<DisputeRecords | null> {
  const [d] = await db.select().from(dispute).where(eq(dispute.id, disputeId));
  if (!d) return null;
  const records: DisputeRecords = {
    dispute: {
      id: d.id,
      paypalDisputeId: d.paypalDisputeId,
      reason: d.reason,
      status: d.status,
      amountCents: d.amountCents,
      openedAt: d.openedAt,
      sellerResponseDue: d.sellerResponseDue,
    },
    order: null,
    mandate: null,
    check: null,
  };
  if (!d.orderId) return records;
  const [o] = await db.select().from(order).where(eq(order.id, d.orderId));
  if (!o) return records;
  const [v] = await db.select().from(mandateVersion).where(eq(mandateVersion.id, o.mandateVersionId));
  const [m] = await db.select({ code: mandate.code }).from(mandate).where(eq(mandate.id, o.mandateId));
  const [c] = await db.select().from(checkResult).where(eq(checkResult.id, o.checkResultId));
  const [ct] = await db.select({ lines: cart.lines }).from(cart).where(eq(cart.id, o.cartId));
  const [s] = await db.select({ name: store.name }).from(store).where(eq(store.id, o.storeId));
  const line = ((ct?.lines ?? []) as { productId: string; size: string | null }[])[0];
  const [p] = line ? await db.select().from(product).where(eq(product.id, line.productId)) : [];

  records.order = {
    id: o.id,
    code: o.code,
    item: itemLabel(p, line?.size ?? null),
    storeName: s?.name ?? o.storeId,
    amountCents: o.amountCents,
    paypalOrderId: o.paypalOrderId,
    paypalCaptureId: o.paypalCaptureId,
    customId: o.customId,
    paidAt: o.capturedAt ?? o.createdAt,
    tracking: (o.tracking as { carrier: string; number: string } | null) ?? null,
    shippingStatus: o.shippingStatus,
  };
  if (v && m) {
    records.mandate = {
      code: m.code,
      versionId: v.id,
      versionNo: v.versionNo,
      signedAt: v.signedAt,
      sha256: v.sha256,
      canonical: v.canonical,
      terms: termsSchema.parse(v.terms),
    };
  }
  if (c) records.check = { id: c.id, at: c.createdAt, terms: c.terms as TermResult[] };
  return records;
}

export type AssembleDeps = { db: DbOrTx; drafter: Drafter };

/** Builds and stores the evidence file for a dispute; returns the existing one if already built. */
export async function assembleEvidence(deps: AssembleDeps, disputeId: string, by: "inline" | "workflow" = "inline") {
  const [existing] = await deps.db.select().from(evidenceFile).where(eq(evidenceFile.disputeId, disputeId));
  if (existing) return existing;
  const records = await loadDisputeRecords(deps.db, disputeId);
  if (!records) throw new Error(`Dispute ${disputeId} not found`);
  const input = draftInput(records);
  const draft = await deps.drafter(input);
  const [file] = await deps.db
    .insert(evidenceFile)
    .values({
      disputeId,
      items: input.items,
      draftSentences: draft.sentences,
      draftText: composeResponse(draft.sentences, input.items),
      draftContext: { dispute: input.dispute.facts, missing: input.missing },
      draftedBy: draft.by,
      assembledBy: by,
    })
    .onConflictDoNothing({ target: evidenceFile.disputeId })
    .returning();
  if (file) return file;
  const [raced] = await deps.db.select().from(evidenceFile).where(eq(evidenceFile.disputeId, disputeId));
  return raced;
}
