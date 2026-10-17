import "server-only";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { demoSession } from "@/lib/db/schema";
import { SESSION_COOKIE, sessionSecret, verifySession } from "./token";

export class NoSessionError extends Error {
  constructor() {
    super("No valid demo session cookie");
    this.name = "NoSessionError";
  }
}

/**
 * The visitor's demo session. Buyer data is always filtered by this id (FR-033).
 * Creates the database row on first use and refreshes last_seen_at.
 */
export async function getSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const id = await verifySession(token, sessionSecret());
  if (!id) throw new NoSessionError();
  const db = await getDb();
  const [row] = await db
    .insert(demoSession)
    .values({ id })
    .onConflictDoUpdate({ target: demoSession.id, set: { lastSeenAt: new Date() } })
    .returning();
  return row;
}

export async function getSessionById(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(demoSession).where(eq(demoSession.id, id));
  return row ?? null;
}
