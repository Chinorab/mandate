/**
 * What the dispute page shows (design/project/DisputeDetail.dc.html): the case, a timeline built from
 * stored records only, the evidence file and the current response. No session id or token leaves here.
 */
import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db/client";
import { dispute, evidenceFile, order } from "@/lib/db/schema";
import { maskBuyer } from "@/lib/merchant/orders";
import { formatUsd } from "@/lib/pricing";
import { loadDisputeRecords } from "./assemble";
import { composeResponse, type DraftSentence } from "./draft";
import { dayEt, longEt, reasonClaim, reasonLabel, shortId } from "./format";
import type { EvidenceItem } from "./items";

export type TimelineStep = { title: string; at: string | null; detail: string; state: "done" | "alert" | "pending" };

export type DisputeView = {
  id: string;
  paypalDisputeId: string;
  reason: string | null;
  reasonLabel: string;
  status: string;
  statusLabel: string;
  amountCents: number | null;
  openedAt: string | null;
  respondBy: string | null;
  summary: string;
  order: { code: string; item: string; buyer: string; amountCents: number; mandateCode: string | null } | null;
  timeline: TimelineStep[];
  evidence: {
    items: (Omit<EvidenceItem, "source">)[];
    includedCount: number;
    response: string;
    edited: boolean;
    draftedBy: "model" | "template" | null;
    accuracyConfirmedAt: string | null;
    submittedAt: string | null;
    lastError: string | null;
  } | null;
  claimedByYou: boolean;
  canEdit: boolean;
  readOnlyReason: "claimed_by_other" | "unclaimed" | "submitted" | "resolved" | "not_ready" | null;
};

const STATUS: Record<string, string> = {
  WAITING_FOR_SELLER_RESPONSE: "Awaiting your response",
  WAITING_FOR_BUYER_RESPONSE: "Awaiting the buyer",
  UNDER_REVIEW: "Under review by PayPal",
  RESOLVED: "Resolved",
  OPEN: "Open",
};

export function statusLabel(s: string): string {
  return STATUS[s] ?? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
}

type PayPalAnswer = { ok: boolean; status?: string; message?: string; at?: string } | null;

/** The response as it would be sent: the merchant's edit, or the draft limited to included items. */
export function currentResponse(file: { editedText: string | null; draftSentences: unknown; items: unknown }): string {
  if (file.editedText != null) return file.editedText;
  return composeResponse((file.draftSentences ?? []) as DraftSentence[], file.items as EvidenceItem[]);
}

export async function disputeView(db: DbOrTx, sessionId: string, id: string): Promise<DisputeView | null> {
  const [d] = await db.select().from(dispute).where(eq(dispute.id, id));
  if (!d) return null;
  const r = (await loadDisputeRecords(db, id))!;
  const [file] = await db.select().from(evidenceFile).where(eq(evidenceFile.disputeId, id));
  const [o] = d.orderId ? await db.select({ sessionId: order.sessionId }).from(order).where(eq(order.id, d.orderId)) : [];

  const answer = (file?.paypalResponse ?? null) as PayPalAnswer;
  const resolved = /RESOLVED|CLOSED/.test(d.status);
  const claimedByYou = d.claimedBySessionId === sessionId;
  const submitted = Boolean(file?.submittedAt);
  const readOnlyReason: DisputeView["readOnlyReason"] = !file
    ? "not_ready"
    : submitted
      ? "submitted"
      : resolved
        ? "resolved"
        : d.claimedBySessionId === null
          ? "unclaimed"
          : !claimedByYou
            ? "claimed_by_other"
            : null;

  const timeline: TimelineStep[] = [];
  if (r.mandate) {
    timeline.push({
      title: "Mandate signed",
      at: r.mandate.signedAt.toISOString(),
      detail: `${r.mandate.code}, version ${r.mandate.versionNo}.`,
      state: "done",
    });
  }
  if (r.check) {
    const rows = r.check.terms.filter((t) => t.group === "term");
    const passed = rows.filter((t) => t.pass).length;
    timeline.push({
      title: passed === rows.length ? "Mandate check passed" : "Mandate check",
      at: r.check.at.toISOString(),
      detail: `${passed} of ${rows.length} terms passed for ${r.order?.item ?? "the order"}.`,
      state: passed === rows.length ? "done" : "alert",
    });
  }
  if (r.order) {
    timeline.push({
      title: "Payment captured",
      at: r.order.paidAt.toISOString(),
      detail: `${formatUsd(r.order.amountCents)} through PayPal${r.order.paypalOrderId ? `, order ${shortId(r.order.paypalOrderId)}` : ""}.`,
      state: "done",
    });
    if (r.order.tracking) {
      timeline.push({
        title: r.order.shippingStatus === "delivered" ? "Delivered" : "Shipped",
        at: null,
        detail: `${r.order.tracking.carrier}, tracking ${r.order.tracking.number}.`,
        state: "done",
      });
    }
  }
  timeline.push({
    title: "Dispute opened",
    at: d.openedAt?.toISOString() ?? null,
    detail: `${reasonLabel(d.reason)}${d.amountCents != null ? `, ${formatUsd(d.amountCents)}` : ""}.`,
    state: "alert",
  });
  timeline.push({
    title: "Your response",
    at: file?.submittedAt?.toISOString() ?? null,
    detail: submitted
      ? `Submitted ${longEt(file!.submittedAt!)}. ${statusLabel(answer?.status ?? d.status)}.`
      : d.sellerResponseDue
        ? `Due ${dayEt(d.sellerResponseDue)}. Not submitted yet.`
        : "Not submitted yet.",
    state: submitted ? "done" : "pending",
  });

  const summary = `${reasonClaim(d.reason)} ${r.mandate ? "A signed mandate is attached to the order." : "No signed mandate is attached to this order."}`;

  const items = (file?.items ?? []) as EvidenceItem[];
  return {
    id: d.id,
    paypalDisputeId: d.paypalDisputeId,
    reason: d.reason,
    reasonLabel: reasonLabel(d.reason),
    status: d.status,
    statusLabel: statusLabel(d.status),
    amountCents: d.amountCents,
    openedAt: d.openedAt?.toISOString() ?? null,
    respondBy: d.sellerResponseDue?.toISOString() ?? null,
    summary,
    order: r.order
      ? { code: r.order.code, item: r.order.item, buyer: o ? maskBuyer(o.sessionId) : "Unknown buyer", amountCents: r.order.amountCents, mandateCode: r.mandate?.code ?? null }
      : null,
    timeline,
    evidence: file
      ? {
          items: items.map(({ source: _source, ...rest }) => rest),
          includedCount: items.filter((i) => i.included).length,
          response: currentResponse(file),
          edited: file.editedText != null,
          draftedBy: (file.draftedBy as "model" | "template" | null) ?? null,
          accuracyConfirmedAt: file.accuracyConfirmedAt?.toISOString() ?? null,
          submittedAt: file.submittedAt?.toISOString() ?? null,
          lastError: answer && !answer.ok ? (answer.message ?? "PayPal did not accept the evidence.") : null,
        }
      : null,
    claimedByYou,
    canEdit: readOnlyReason === null,
    readOnlyReason,
  };
}
