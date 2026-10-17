/**
 * Fit of a single product against a mandate, for the agent's proposals and the product cards.
 * Uses the same deterministic Mandate check, rule terms only (semantic terms are judged at check
 * time). A fit label is a preview, never a permission: payment always runs the full check.
 */
import { runMandateCheck, type CheckLine } from "@/lib/check/run";
import type { MandateContext } from "@/lib/mandate/context";
import type { StorePricing } from "@/lib/pricing";

export type FitTone = "compliant" | "awaiting" | "blocked";
export type Fit = { fits: boolean; label: string; tone: FitTone; totalCents: number; failed: string[] };

const LABELS: Record<string, string> = {
  category: "Category outside mandate",
  size: "Size outside mandate",
  colors: "Color outside mandate",
  brands: "Brand outside mandate",
  merchant: "Store outside mandate",
  budget: "Over budget with tax",
  purchases: "No orders left",
  expiration: "Mandate expired",
  status: "Mandate not active",
  integrity: "Mandate record changed",
  currency: "Currency outside mandate",
};
const ORDER = ["integrity", "status", "category", "size", "colors", "brands", "merchant", "budget", "purchases", "expiration", "currency"];

export function fitFor(
  ctx: MandateContext,
  line: CheckLine,
  store: StorePricing & { id: string; name: string },
  now: Date,
): Fit {
  const semantic = Object.fromEntries(ctx.terms.semantic.map((s) => [s.id, { status: "pass" as const, reason: "Judged at check" }]));
  const o = runMandateCheck({
    mandate: { code: ctx.mandate.code, status: ctx.mandate.status, revokedAt: ctx.mandate.revokedAt, flaggedAt: ctx.mandate.flaggedAt },
    version: {
      versionNo: ctx.version.versionNo,
      terms: ctx.version.terms,
      canonical: ctx.version.canonical,
      sha256: ctx.version.sha256,
      isCurrent: true,
    },
    store,
    lines: [line],
    spentCents: ctx.spentCents,
    capturedCount: ctx.capturedCount,
    semantic,
    now,
  });
  const failed = o.terms.filter((t) => !t.pass && t.kind === "rule").map((t) => t.term);
  const totalCents = o.totals.totalCents;
  if (failed.length) {
    const first = ORDER.find((t) => failed.includes(t)) ?? failed[0];
    return { fits: false, label: LABELS[first] ?? "Outside mandate", tone: "blocked", totalCents, failed };
  }
  const close = totalCents >= o.totals.remainingBudgetCents * 0.95;
  return { fits: true, label: close ? "Close to budget with tax" : "Fits mandate", tone: close ? "awaiting" : "compliant", totalCents, failed };
}
