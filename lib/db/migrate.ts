/**
 * Applies SQL migrations to DATABASE_URL (run on Render as the pre deploy command).
 * PGlite databases migrate themselves on first open, so this is only needed for Postgres.
 */
import { config } from "dotenv";
import path from "node:path";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const migrationsFolder = path.join(process.cwd(), "lib", "db", "migrations");
  if (url === "" || url.startsWith("pglite:")) {
    const { openDb } = await import("./client");
    const handle = await openDb(url);
    await handle.ready;
    await handle.close();
  } else {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(url, { max: 1 });
    await migrate(drizzle(client), { migrationsFolder });
    await client.end();
  }
  console.log("Migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
