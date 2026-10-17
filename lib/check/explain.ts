/**
 * Plain language for check results. Every sentence is a template filled with numbers and names from
 * the database; the model never writes these (constitution II). No dash punctuation (constitution VII).
 */
import { CATEGORIES, COLOR_LABELS, type CategoryId, type ColorId, type SizeSystem } from "@/lib/catalog/data";
import { formatUsd } from "@/lib/pricing";

export const SIZE_SYSTEM_LABELS: Record<SizeSystem, string> = {
  US_MENS: "US men's",
  US_WOMENS: "US women's",
  US_KIDS: "US kids'",
};

export function categoryLabel(id: string): string {
  return CATEGORIES[id as CategoryId] ?? id;
}

export function colorName(id: ColorId, capital = false): string {
  const label = COLOR_LABELS[id] ?? id;
  return capital ? label : label.toLowerCase();
}

/** "black", "black or white", "beige, black, gray or white" */
export function orList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const ET = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** "Sun, Oct 25, 11:59 PM ET" */
export function formatEt(d: Date): string {
  return `${ET.format(d)} ET`;
}

export function timeLeft(from: Date, to: Date): string {
  const days = Math.floor((to.getTime() - from.getTime()) / 86_400_000);
  if (days < 1) return "Less than a day left";
  return days === 1 ? "1 day left" : `${days} days left`;
}

export const budgetText = {
  allowed: (budget: number, remaining: number, spent: number) =>
    spent > 0 ? `${formatUsd(remaining)} left of ${formatUsd(budget)}` : `Up to ${formatUsd(budget)} total`,
  pass: (remaining: number, total: number) => `${formatUsd(remaining - total)} under the limit`,
  fail: (budget: number, remaining: number, spent: number, total: number) =>
    spent > 0
      ? `Cart total is ${formatUsd(total)}. You have ${formatUsd(remaining)} left of ${formatUsd(budget)}, so it is ${formatUsd(total - remaining)} over.`
      : `Cart total is ${formatUsd(total)}. Your limit is ${formatUsd(budget)}, so it is ${formatUsd(total - remaining)} over.`,
};

export function purchasesUsedText(max: number): string {
  return max === 1 ? "All 1 purchase under this mandate is used." : `All ${max} purchases under this mandate are used.`;
}
