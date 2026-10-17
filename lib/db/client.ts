/**
 * Database access. Production (Render) uses Postgres through postgres-js. Local development and
 * tests use PGlite (Postgres compiled to WASM) when DATABASE_URL is empty or starts with "pglite:",
 * so nothing has to be installed. Both run the same Drizzle schema and SQL migrations.
 */
import path from "node:path";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

const MIGRATIONS = path.join(process.cwd(), "lib", "db", "migrations");

type Handle = { db: Db; ready: Promise<void>; close: () => Promise<void> };

async function openPglite(dataDir: string | undefined): Promise<Handle> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema }) as unknown as Db;
  const ready = migrate(drizzle(client, { schema }), { migrationsFolder: MIGRATIONS });
  return { db, ready, close: () => client.close() };
}

async function openPostgres(url: string): Promise<Handle> {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const client = postgres(url, { max: 10, prepare: false });
  const db = drizzle(client, { schema }) as unknown as Db;
  return { db, ready: Promise.resolve(), close: () => client.end() };
}

/** Opens a connection for the given URL. "pglite:memory" gives a fresh in-memory database. */
export async function openDb(url = process.env.DATABASE_URL ?? ""): Promise<Handle> {
  if (url === "" || url.startsWith("pglite:")) {
    const target = url.slice("pglite:".length);
    const dataDir =
      target === "memory" ? undefined : target || path.join(process.cwd(), ".data", "pglite");
    return openPglite(dataDir);
  }
  if (!/^postgres(ql)?:\/\//.test(url)) throw new Error("DATABASE_URL must be a postgres URL or pglite:");
  return openPostgres(url);
}

const globalForDb = globalThis as unknown as { __mandateDb?: Promise<Handle> };

/** Shared connection for the app process (kept across hot reloads in development). */
export async function getDb(): Promise<Db> {
  globalForDb.__mandateDb ??= openDb();
  const handle = await globalForDb.__mandateDb;
  await handle.ready;
  return handle.db;
}

/**
 * Locks the mandate row for the rest of the transaction. Every money path takes this lock first,
 * so two payments under one mandate can never both spend the same remaining budget or count.
 */
export async function lockMandate(tx: Tx, mandateId: string) {
  const rows = await tx
    .select()
    .from(schema.mandate)
    .where(eq(schema.mandate.id, mandateId))
    .for("update");
  return rows[0] ?? null;
}
