/**
 * Merchant dispute handlers (contracts/http-api.md): claim a pool dispute, read it, save the evidence
 * selection and response, submit. Edits and submission belong to the claiming session only.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db/client";
import { dispute, evidenceFile } from "@/lib/db/schema";
import { loadDisputeRecords } from "@/lib/disputes/assemble";
import { claimDispute, type Claim } from "@/lib/disputes/pool";
import { renderEvidenceReport } from "@/lib/disputes/report-pdf";
import { NOTES_MAX, submitEvidence, type SubmitDeps } from "@/lib/disputes/submit";
import type { EvidenceItem } from "@/lib/disputes/items";
import { disputeView, type DisputeView } from "@/lib/disputes/view";
import { apiError, type ApiResult } from "./result";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function claim(db: Db, sessionId: string): Promise<ApiResult<Claim>> {
  return { status: 200, body: await claimDispute(db, sessionId) };
}

export async function getDispute(db: Db, sessionId: string, id: string): Promise<ApiResult<DisputeView>> {
  const v = UUID.test(id) ? await disputeView(db, sessionId, id) : null;
  return v ? { status: 200, body: v } : apiError(404, "not_found", "Dispute not found.");
}

const saveBody = z.object({
  included: z.record(z.string(), z.boolean()).default({}),
  // null resets the response to the draft; a string is the merchant's own text.
  editedText: z.string().max(NOTES_MAX).nullable().optional(),
});

export async function saveEvidence(db: Db, sessionId: string, id: string, body: unknown): Promise<ApiResult<DisputeView>> {
  if (!UUID.test(id)) return apiError(404, "not_found", "Dispute not found.");
  const parsed = saveBody.safeParse(body);
  if (!parsed.success) return apiError(400, "invalid_body", `Keep the response under ${NOTES_MAX} characters.`);
  const out = await db.transaction(async (tx) => {
    const [d] = await tx.select().from(dispute).where(eq(dispute.id, id)).for("update");
    if (!d) return apiError(404, "not_found", "Dispute not found.");
    if (d.claimedBySessionId !== sessionId) return apiError(403, "not_claimant", "Only the session that claimed this dispute can edit it.");
    const [file] = await tx.select().from(evidenceFile).where(eq(evidenceFile.disputeId, id));
    if (!file) return apiError(409, "not_ready", "The evidence file is still being assembled.");
    if (file.submittedAt) return apiError(409, "already_submitted", "Evidence for this dispute was already submitted.");
    const items = file.items as EvidenceItem[];
    const keys = new Set(items.map((i) => i.key as string));
    const unknown = Object.keys(parsed.data.included).filter((k) => !keys.has(k));
    if (unknown.length) return apiError(400, "unknown_item", "That evidence item is not in this file.", { items: unknown });
    const next = items.map((i) => (i.key in parsed.data.included ? { ...i, included: parsed.data.included[i.key] } : i));
    await tx
      .update(evidenceFile)
      .set({ items: next, ...(parsed.data.editedText !== undefined ? { editedText: parsed.data.editedText } : {}), updatedAt: new Date() })
      .where(eq(evidenceFile.id, file.id));
    return null;
  });
  return out ?? getDispute(db, sessionId, id);
}

export async function submit(deps: SubmitDeps, sessionId: string, id: string, body: unknown): Promise<ApiResult<DisputeView>> {
  if (!UUID.test(id)) return apiError(404, "not_found", "Dispute not found.");
  const confirmed = Boolean(body && typeof body === "object" && (body as { accuracyConfirmed?: unknown }).accuracyConfirmed === true);
  const r = await submitEvidence(deps, sessionId, id, confirmed);
  if (!r.ok) return apiError(r.status, r.code, r.message);
  return getDispute(deps.db, sessionId, id);
}

/** The evidence report as PayPal would receive it now (included items only). Viewable read only. */
export async function report(db: Db, id: string, now = new Date()): Promise<ApiResult<{ name: string; bytes: Uint8Array }>> {
  if (!UUID.test(id)) return apiError(404, "not_found", "Dispute not found.");
  const [file] = await db.select().from(evidenceFile).where(eq(evidenceFile.disputeId, id));
  const records = file ? await loadDisputeRecords(db, id) : null;
  if (!file || !records) return apiError(404, "not_found", "Evidence file not found.");
  const bytes = await renderEvidenceReport(records, file.items as EvidenceItem[], now);
  return { status: 200, body: { name: `mandate-evidence-${records.dispute.paypalDisputeId}.pdf`, bytes } };
}
