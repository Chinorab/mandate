import { PRODUCTS, STORES } from "@/lib/catalog/data";
import type { DbOrTx } from "./client";
import { product, store } from "./schema";

/** Upserts the fictional stores and products. Payee ids come from env, never from the repo. */
export async function seedCatalog(db: DbOrTx, env: Record<string, string | undefined> = process.env) {
  for (const s of STORES) {
    const row = {
      id: s.id,
      name: s.name,
      payeeMerchantId: env[s.payeeEnv] || null,
      taxRateBp: s.taxRateBp,
      shippingCents: s.shippingCents,
      freeShippingOverCents: s.freeShippingOverCents,
    };
    await db.insert(store).values(row).onConflictDoUpdate({ target: store.id, set: row });
  }
  for (const p of PRODUCTS) {
    const row = { ...p, currency: "USD" };
    await db.insert(product).values(row).onConflictDoUpdate({ target: product.id, set: row });
  }
  return { stores: STORES.length, products: PRODUCTS.length };
}
