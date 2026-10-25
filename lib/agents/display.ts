/** Adds product facts and fit labels to the agent's product cards, from the database. */
import { and, eq, inArray } from "drizzle-orm";
import { CATEGORIES, COLOR_LABELS, type ProductAttributes } from "@/lib/catalog/data";
import { SIZE_SYSTEM_LABELS } from "@/lib/check/explain";
import type { Db } from "@/lib/db/client";
import { order, product, store } from "@/lib/db/schema";
import type { MandateContext } from "@/lib/mandate/context";
import { fitFor, type Fit } from "./fit";
import type { DisplayItem } from "./transcript";

export type ProductCard = {
  id: string;
  name: string;
  variant: string;
  storeName: string;
  shipping: string;
  priceCents: number;
  fit: Fit;
};

export type ChatItem = Exclude<DisplayItem, { kind: "options" }> | { kind: "options"; at: string | null; cards: ProductCard[] };

export async function enrich(db: Db, ctx: MandateContext, items: DisplayItem[], now: Date): Promise<ChatItem[]> {
  const ids = [...new Set(items.flatMap((i) => (i.kind === "options" ? i.productIds : [])))];
  if (ids.length === 0) return items as ChatItem[];
  const rows = await db.select().from(product).where(inArray(product.id, ids));
  const stores = new Map((await db.select().from(store)).map((s) => [s.id, s]));
  const byId = new Map(rows.map((r) => [r.id, r]));
  // Labels describe the moment of the proposal: only orders captured before it count.
  const paid = await db
    .select({ at: order.capturedAt, amountCents: order.amountCents })
    .from(order)
    .where(and(eq(order.mandateId, ctx.mandate.id), eq(order.status, "captured")));
  const asOf = (at: string | null): { ctx: MandateContext; now: Date } => {
    if (!at) return { ctx, now };
    const t = new Date(at);
    const before = paid.filter((o) => o.at && o.at.getTime() < t.getTime());
    return { ctx: { ...ctx, spentCents: before.reduce((n, o) => n + o.amountCents, 0), capturedCount: before.length }, now: t };
  };

  return items.map((i): ChatItem => {
    if (i.kind !== "options") return i;
    const moment = asOf(i.at);
    const cards = i.productIds.flatMap((id): ProductCard[] => {
      const p = byId.get(id);
      if (!p) return [];
      const s = stores.get(p.storeId)!;
      const a = p.attributes as ProductAttributes;
      const size = a.sizeSystem ? i.size : null;
      const colors = a.colors.map((c, n) => (n === 0 ? COLOR_LABELS[c] : COLOR_LABELS[c].toLowerCase())).join(" and ");
      const free = s.shippingCents === 0 || (s.freeShippingOverCents !== null && p.priceCents >= s.freeShippingOverCents);
      return [
        {
          id: p.id,
          name: p.name,
          variant: [colors, a.sizeSystem && size ? `${SIZE_SYSTEM_LABELS[a.sizeSystem]} ${size}` : CATEGORIES[p.category as keyof typeof CATEGORIES]]
            .filter(Boolean)
            .join(", "),
          storeName: s.name,
          shipping: free ? "free shipping" : `$${(s.shippingCents / 100).toFixed(2)} shipping`,
          priceCents: p.priceCents,
          fit: fitFor(
            moment.ctx,
            { product: { id: p.id, storeId: p.storeId, name: p.name, category: p.category, currency: p.currency, priceCents: p.priceCents, attributes: a }, size, qty: 1 },
            { id: s.id, name: s.name, taxRateBp: s.taxRateBp, shippingCents: s.shippingCents, freeShippingOverCents: s.freeShippingOverCents },
            moment.now,
          ),
        },
      ];
    });
    return { kind: "options", at: i.at, cards };
  });
}
