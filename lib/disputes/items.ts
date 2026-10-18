/**
 * Evidence items (FR-028): built only from records we hold. Each item says where it comes from and
 * carries plain facts, the only material a draft sentence may rest on. What we do not hold is listed as
 * missing, in words, never filled in.
 */
import type { TermResult } from "@/lib/check/run";
import { termsSentence } from "@/lib/mandate/summary";
import type { Terms } from "@/lib/mandate/terms";
import { formatUsd } from "@/lib/pricing";
import { longEt, reasonLabel, shortEt, shortId } from "./format";

export type EvidenceKey = "mandate" | "check" | "transaction" | "shipment";

export type EvidenceItem = {
  key: EvidenceKey;
  title: string;
  meta: string;
  included: boolean;
  source: { table: string; id: string };
  facts: string[];
};

export type DisputeRecords = {
  dispute: {
    id: string;
    paypalDisputeId: string;
    reason: string | null;
    status: string;
    amountCents: number | null;
    openedAt: Date | null;
    sellerResponseDue: Date | null;
  };
  order: {
    id: string;
    code: string;
    item: string;
    storeName: string;
    amountCents: number;
    paypalOrderId: string | null;
    paypalCaptureId: string | null;
    customId: string;
    paidAt: Date;
    tracking: { carrier: string; number: string } | null;
    shippingStatus: "unfulfilled" | "shipped" | "delivered";
  } | null;
  mandate: {
    code: string;
    versionId: string;
    versionNo: number;
    signedAt: Date;
    sha256: string;
    canonical: string;
    terms: Terms;
  } | null;
  check: { id: string; at: Date; terms: TermResult[] } | null;
};

export const MISSING = {
  mandate: "No signed mandate is attached to this order in our records.",
  check: "No mandate check record is on file for this order.",
  shipment: "No shipment tracking is on file for this order.",
} as const;

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function buildItems(r: DisputeRecords): { items: EvidenceItem[]; missing: string[] } {
  const items: EvidenceItem[] = [];
  const missing: string[] = [];
  const { order, mandate, check } = r;

  if (mandate) {
    items.push({
      key: "mandate",
      title: "Signed mandate record",
      meta: `PDF, ${mandate.code}, fingerprint SHA256 ${shortId(mandate.sha256)}`,
      included: true,
      source: { table: "mandate_version", id: mandate.versionId },
      facts: [
        `Signed mandate ${mandate.code}, version ${mandate.versionNo}, signed ${longEt(mandate.signedAt)}.`,
        `Mandate terms: ${lowerFirst(termsSentence(mandate.terms))}.`,
        `Fingerprint SHA256 ${mandate.sha256} of the canonical signed record.`,
      ],
    });
  } else {
    missing.push(MISSING.mandate);
  }

  if (order && check) {
    const rows = check.terms.filter((t) => t.group === "term");
    const passed = rows.filter((t) => t.pass).length;
    items.push({
      key: "check",
      title: "Mandate check report",
      meta: `PDF, ${passed} of ${rows.length} terms passed, ${shortEt(check.at)}`,
      included: true,
      source: { table: "check_result", id: check.id },
      facts: [
        `Mandate check before payment, ${longEt(check.at)}: ${passed} of ${rows.length} terms passed.`,
        ...rows.map((t) => `${t.label}: ${t.actual}, ${t.pass ? "passed" : "failed"}.`),
      ],
    });
  } else if (order) {
    missing.push(MISSING.check);
  }

  if (order) {
    items.push({
      key: "transaction",
      title: "PayPal transaction record",
      meta: `Order ${order.code}${order.paypalOrderId ? `, PayPal ${shortId(order.paypalOrderId)}` : ""}, ${formatUsd(order.amountCents)}`,
      included: true,
      source: { table: "orders", id: order.id },
      facts: [
        `Order ${order.code}: ${order.item}, from ${order.storeName}.`,
        `Amount ${formatUsd(order.amountCents)} captured through PayPal, ${longEt(order.paidAt)}.`,
        ...(order.paypalOrderId ? [`PayPal order ${order.paypalOrderId}${order.paypalCaptureId ? `, capture ${order.paypalCaptureId}` : ""}.`] : []),
        `PayPal custom_id on the order: ${order.customId}.`,
      ],
    });
    if (order.tracking) {
      const delivered = order.shippingStatus === "delivered";
      items.push({
        key: "shipment",
        title: "Shipment tracking",
        meta: `${order.tracking.carrier} ${order.tracking.number}${delivered ? ", delivered" : ", shipped"}`,
        included: true,
        source: { table: "orders", id: order.id },
        facts: [`Shipped with ${order.tracking.carrier}, tracking ${order.tracking.number}.`, ...(delivered ? ["Marked delivered in the order records."] : [])],
      });
    } else {
      missing.push(MISSING.shipment);
    }
  }
  return { items, missing };
}

/** Facts about the dispute itself, from PayPal's event. */
export function disputeFacts(d: DisputeRecords["dispute"]): string[] {
  return [
    `PayPal case ${d.paypalDisputeId}.`,
    `Reason: ${reasonLabel(d.reason)} (PayPal reason code ${d.reason ?? "none"}).`,
    ...(d.amountCents != null ? [`Disputed amount ${formatUsd(d.amountCents)}.`] : []),
    ...(d.openedAt ? [`Opened ${longEt(d.openedAt)}.`] : []),
  ];
}
