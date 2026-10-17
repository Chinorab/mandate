/**
 * Order totals, computed only from catalog rows (FR-010). Totals sent by the browser or produced by
 * the model are never used. Integer cents throughout; tax on items, rounded half up.
 */

export type PricedLine = { priceCents: number; qty: number };
export type StorePricing = {
  taxRateBp: number;
  shippingCents: number;
  freeShippingOverCents: number | null;
};
export type Totals = {
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
};

export const MAX_QTY = 10;

export function computeTotals(lines: PricedLine[], store: StorePricing): Totals {
  if (lines.length === 0) throw new Error("A cart needs at least one line");
  let subtotalCents = 0;
  for (const l of lines) {
    if (!Number.isInteger(l.priceCents) || l.priceCents < 0) throw new Error("Invalid price");
    if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > MAX_QTY) throw new Error("Invalid quantity");
    subtotalCents += l.priceCents * l.qty;
  }
  const free = store.freeShippingOverCents !== null && subtotalCents >= store.freeShippingOverCents;
  const shippingCents = free ? 0 : store.shippingCents;
  const taxCents = Math.floor((subtotalCents * store.taxRateBp + 5000) / 10000);
  return { subtotalCents, shippingCents, taxCents, totalCents: subtotalCents + shippingCents + taxCents };
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatUsd(cents: number): string {
  return usd.format(cents / 100);
}
