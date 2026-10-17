import { openDb } from "@/lib/db/client";
import { seedCatalog } from "@/lib/db/seed-catalog";

/** A fresh, migrated, seeded in-memory Postgres (PGlite) for one test file. */
export async function testDb() {
  const handle = await openDb("pglite:memory");
  await handle.ready;
  await seedCatalog(handle.db, {});
  return handle;
}
