import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PRODUCTS } from "@/lib/catalog/data";
import { lockMandate } from "@/lib/db/client";
import { demoSession, mandate, product, store } from "@/lib/db/schema";
import { testDb } from "../helpers/db";

let handle: Awaited<ReturnType<typeof testDb>>;

beforeAll(async () => {
  handle = await testDb();
});
afterAll(async () => {
  await handle.close();
});

describe("database", () => {
  it("migrates and seeds the fictional catalog", async () => {
    const stores = await handle.db.select().from(store);
    const products = await handle.db.select().from(product);
    expect(stores.map((s) => s.id).sort()).toEqual(["running-co", "shoe-supply", "sports-outlet"]);
    expect(products).toHaveLength(PRODUCTS.length);
    expect(stores.every((s) => s.payeeMerchantId === null)).toBe(true);
  });

  it("keeps the design scenario prices", async () => {
    const [miler] = await handle.db.select().from(product).where(eq(product.id, "daily-miler-blk-wht"));
    expect(miler.priceCents).toBe(9600);
    expect(miler.storeId).toBe("sports-outlet");
  });

  it("locks a mandate row inside a transaction", async () => {
    const [session] = await handle.db.insert(demoSession).values({}).returning();
    const [m] = await handle.db
      .insert(mandate)
      .values({ code: "MDTTEST01", sessionId: session.id, instructions: "test" })
      .returning();
    const locked = await handle.db.transaction((tx) => lockMandate(tx, m.id));
    expect(locked?.code).toBe("MDTTEST01");
  });
});
