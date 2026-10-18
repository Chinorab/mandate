/**
 * Evidence submission (FR-031, constitution III): nothing reaches PayPal unless the session that claimed
 * the dispute confirmed the accuracy statement and pressed submit. The dispute row is locked for the
 * whole submission, so a double click or a second tab submits once. A PayPal rejection keeps the draft
 * and records PayPal's reason.
 */
import { eq } from "drizzle-orm";
import { audit } from "@/lib/audit";
import type { Db } from "@/lib/db/client";
import { dispute, evidenceFile } from "@/lib/db/schema";
import type { DisputesClient, Evidence, EvidenceSubmission } from "@/lib/payments/disputes";
import { PayPalApiError, PayPalConfigError } from "@/lib/payments/errors";
import { loadDisputeRecords } from "./assemble";
import type { DisputeRecords, EvidenceItem } from "./items";
import { renderEvidenceReport } from "./report-pdf";
import { currentResponse } from "./view";

export const NOTES_MAX = 2000;

export type SubmitDeps = { db: Db; disputes: DisputesClient | null; now?: () => Date };
export type SubmitOutcome = { ok: true } | { ok: false; status: number; code: string; message: string };

const fail = (status: number, code: string, message: string): SubmitOutcome => ({ ok: false, status, code, message });

export async function buildSubmission(r: DisputeRecords, items: EvidenceItem[], response: string, now: Date): Promise<EvidenceSubmission> {
  const name = `mandate-evidence-${r.dispute.paypalDisputeId}.pdf`;
  const evidences: Evidence[] = [{ evidence_type: "BILLING_AGREEMENT", notes: response, documents: [{ name }] }];
  const shipment = items.find((i) => i.key === "shipment" && i.included);
  if (shipment && r.order?.tracking) {
    evidences.push({
      evidence_type: "PROOF_OF_FULFILLMENT",
      evidence_info: { tracking_info: [{ carrier_name: r.order.tracking.carrier, tracking_number: r.order.tracking.number }] },
    });
  }
  return { evidences, files: [{ name, bytes: await renderEvidenceReport(r, items, now), type: "application/pdf" }] };
}

function paypalReason(err: PayPalApiError): string {
  const details = Array.isArray(err.details) ? (err.details as { description?: string; issue?: string }[]) : [];
  const text = details.map((d) => d.description ?? d.issue).filter(Boolean).join(" ");
  return text || err.message;
}

export async function submitEvidence(deps: SubmitDeps, sessionId: string, disputeId: string, accuracyConfirmed: boolean): Promise<SubmitOutcome> {
  const now = deps.now ?? (() => new Date());
  return deps.db.transaction(async (tx) => {
    const [d] = await tx.select().from(dispute).where(eq(dispute.id, disputeId)).for("update");
    if (!d) return fail(404, "not_found", "Dispute not found.");
    if (d.claimedBySessionId !== sessionId) return fail(403, "not_claimant", "Only the session that claimed this dispute can submit evidence.");
    if (!accuracyConfirmed) return fail(400, "accuracy_not_confirmed", "Confirm that the response and the included items are accurate before submitting.");
    const [file] = await tx.select().from(evidenceFile).where(eq(evidenceFile.disputeId, disputeId)).for("update");
    if (!file) return fail(409, "not_ready", "The evidence file is still being assembled.");
    if (file.submittedAt) return fail(409, "already_submitted", "Evidence for this dispute was already submitted.");
    if (/RESOLVED|CLOSED/.test(d.status)) return fail(409, "resolved", "This dispute is resolved.");
    const items = file.items as EvidenceItem[];
    if (!items.some((i) => i.included)) return fail(400, "nothing_included", "Include at least one evidence item.");
    const response = currentResponse(file).trim();
    if (!response) return fail(400, "empty_response", "Write a response before submitting.");
    if (response.length > NOTES_MAX) return fail(400, "response_too_long", `Keep the response under ${NOTES_MAX} characters.`);
    if (!deps.disputes) return fail(503, "paypal_not_configured", "PayPal sandbox is not configured on this server. Your draft is saved.");

    const at = now();
    const records = (await loadDisputeRecords(tx, disputeId))!;
    const submission = await buildSubmission(records, items, response, at);
    let status: string;
    try {
      status = (await deps.disputes.provideEvidence(d.paypalDisputeId, submission)).status ?? d.status;
    } catch (err) {
      if (err instanceof PayPalConfigError) return fail(503, "paypal_not_configured", "PayPal sandbox is not configured on this server. Your draft is saved.");
      if (!(err instanceof PayPalApiError)) throw err;
      const reason = paypalReason(err);
      await tx
        .update(evidenceFile)
        .set({ paypalResponse: { ok: false, message: reason, debugId: err.debugId, at: at.toISOString() }, updatedAt: at })
        .where(eq(evidenceFile.id, file.id));
      await audit(tx, { sessionId, actor: "merchant", action: "evidence_rejected", detail: { disputeId, debugId: err.debugId } });
      return fail(502, "paypal_rejected", `PayPal did not accept the evidence: ${reason} Your draft is saved.`);
    }
    await tx
      .update(evidenceFile)
      .set({ submittedAt: at, accuracyConfirmedAt: at, paypalResponse: { ok: true, status, at: at.toISOString() }, updatedAt: at })
      .where(eq(evidenceFile.id, file.id));
    await tx.update(dispute).set({ status, updatedAt: at }).where(eq(dispute.id, disputeId));
    await audit(tx, {
      sessionId,
      actor: "merchant",
      action: "evidence_submitted",
      detail: { disputeId, paypalDisputeId: d.paypalDisputeId, items: items.filter((i) => i.included).map((i) => i.key), evidenceTypes: submission.evidences.map((e) => e.evidence_type) },
    });
    return { ok: true };
  });
}
