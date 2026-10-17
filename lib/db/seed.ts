import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const { openDb } = await import("./client");
  const { seedCatalog } = await import("./seed-catalog");
  const handle = await openDb();
  await handle.ready;
  const counts = await seedCatalog(handle.db);
  await handle.close();
  console.log(`Seeded ${counts.stores} stores and ${counts.products} products.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
