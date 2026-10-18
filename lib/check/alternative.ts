/** The cheapest in stock product that passes every rule term of the mandate (FR-018, switch option). */
import { fitFor } from "@/lib/agents/fit";
import { COLOR_LABELS, type ProductAttributes } from "@/lib/catalog/data";
import type { DbOrTx } from "@/lib/db/client";
import { product, store } from "@/lib/db/schema";
import type { MandateContext } from "@/lib/mandate/context";

export type Alternative = {
  productId: string;
  name: string;
  variant: string;
  storeId: string;
  storeName: string;
  size: string | null;
  totalCents: number;
};

export async function findAlternative(
  db: DbOrTx,
  ctx: MandateContext,
  opts: { size: string | null; excludeProductId?: string; now: Date },
): Promise<Alternative | null> {
  const stores = new Map((await db.select().from(store)).map((s) => [s.id, s]));
  const rows = await db.select().from(product);
  let best: Alternative | null = null;
  for (const p of rows) {
    if (p.stock <= 0 || p.id === opts.excludeProductId || p.category !== ctx.terms.category) continue;
    const a = p.attributes as ProductAttributes;
    const size = a.sizeSystem ? (opts.size ?? ctx.terms.required.size?.value ?? null) : null;
    if (a.sizeSystem && (!size || !a.sizes.includes(size))) continue;
    const s = stores.get(p.storeId)!;
    const fit = fitFor(
      ctx,
      { product: { id: p.id, storeId: p.storeId, name: p.name, category: p.category, currency: p.currency, priceCents: p.priceCents, attributes: a }, size, qty: 1 },
      { id: s.id, name: s.name, taxRateBp: s.taxRateBp, shippingCents: s.shippingCents, freeShippingOverCents: s.freeShippingOverCents },
      opts.now,
    );
    if (!fit.fits) continue;
    if (best && best.totalCents <= fit.totalCents) continue;
    best = {
      productId: p.id,
      name: p.name,
      variant: a.colors.map((c, i) => (i === 0 ? COLOR_LABELS[c] : COLOR_LABELS[c].toLowerCase())).join(" and "),
      storeId: s.id,
      storeName: s.name,
      size,
      totalCents: fit.totalCents,
    };
  }
  return best;
}
