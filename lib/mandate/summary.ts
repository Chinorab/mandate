/** One plain sentence for a set of terms, used by the receipt preview and the PDF. */
import { CATEGORIES, COLOR_LABELS, STORES } from "@/lib/catalog/data";
import { SIZE_SYSTEM_LABELS, formatEt, orList } from "@/lib/check/explain";
import { formatUsd } from "@/lib/pricing";
import type { Terms } from "./terms";

export function termsSentence(t: Terms): string {
  const parts = [
    `Up to ${formatUsd(t.budgetCents)} total`,
    CATEGORIES[t.category].toLowerCase(),
    t.required.size ? `${SIZE_SYSTEM_LABELS[t.required.size.system]} ${t.required.size.value}` : null,
    t.required.colors?.length ? orList(t.required.colors.map((c) => COLOR_LABELS[c].toLowerCase())) : null,
    t.forbidden.colors?.length ? `not ${orList(t.forbidden.colors.map((c) => COLOR_LABELS[c].toLowerCase()))}` : null,
    t.forbidden.brands?.length ? `not ${orList(t.forbidden.brands)}` : null,
    t.merchants === "ANY_LISTED" ? "any of the 3 demo stores" : t.merchants.map((id) => STORES.find((s) => s.id === id)?.name ?? id).join(", "),
    t.maxPurchases === 1 ? "1 order" : `${t.maxPurchases} orders`,
    ...t.semantic.map((s) => s.text.toLowerCase()),
    `until ${formatEt(new Date(t.expiresAt))}`,
  ];
  return parts.filter(Boolean).join(", ");
}
