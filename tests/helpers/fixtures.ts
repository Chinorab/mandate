import { PRODUCTS, STORES, type ProductSeed } from "@/lib/catalog/data";
import type { CheckInput, CheckLine } from "@/lib/check/run";
import { fingerprint } from "@/lib/mandate/canonical";
import type { Terms } from "@/lib/mandate/terms";

/** The canvas mandate: running shoes, US men's 10, neutral colors, $120 total, one order, until Sunday. */
export const CANVAS_TERMS: Terms = {
  budgetCents: 12000,
  currency: "USD",
  category: "running-shoes",
  required: { size: { system: "US_MENS", value: "10" }, colors: ["beige", "black", "gray", "white"] },
  forbidden: {},
  semantic: [],
  merchants: "ANY_LISTED",
  expiresAt: "2026-10-26T03:59:00.000Z", // Sun Oct 25, 11:59 PM ET
  maxPurchases: 1,
};

export const CHECK_TIME = new Date("2026-10-19T13:14:00Z"); // Mon Oct 19, 9:14 AM ET

export function productById(id: string): ProductSeed {
  const p = PRODUCTS.find((x) => x.id === id);
  if (!p) throw new Error(`No product ${id}`);
  return p;
}

export function storeOf(p: ProductSeed) {
  const s = STORES.find((x) => x.id === p.storeId)!;
  return { id: s.id, name: s.name, taxRateBp: s.taxRateBp, shippingCents: s.shippingCents, freeShippingOverCents: s.freeShippingOverCents };
}

export function line(productId: string, size: string | null = "10", qty = 1): CheckLine {
  const p = productById(productId);
  return { product: { ...p, currency: "USD" }, size, qty };
}

export function checkInput(over: Partial<CheckInput> & { terms?: Terms; productId?: string } = {}): CheckInput {
  const terms = over.terms ?? CANVAS_TERMS;
  const lines = over.lines ?? [line(over.productId ?? "daily-miler-blk-wht")];
  const fp = fingerprint("MDT4K7Q21", 1, terms);
  const store = storeOf(productById(lines[0].product.id));
  return {
    mandate: { code: "MDT4K7Q21", status: "active", revokedAt: null, flaggedAt: null },
    version: { versionNo: 1, terms, canonical: fp.canonical, sha256: fp.sha256, isCurrent: true },
    store,
    lines,
    spentCents: 0,
    capturedCount: 0,
    semantic: {},
    now: CHECK_TIME,
    ...over,
  };
}
