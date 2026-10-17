import { and, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db/client";
import { mandate, mandateVersion, order } from "@/lib/db/schema";
import { termsSchema, type Terms } from "./terms";

export type MandateContext = {
  mandate: typeof mandate.$inferSelect;
  version: typeof mandateVersion.$inferSelect;
  terms: Terms;
  spentCents: number;
  capturedCount: number;
};

/** The caller's signed mandate with its current version and what has been spent under it. */
export async function loadMandateContext(db: DbOrTx, sessionId: string, code: string): Promise<MandateContext | null> {
  const [m] = await db
    .select()
    .from(mandate)
    .where(and(eq(mandate.code, code), eq(mandate.sessionId, sessionId)));
  if (!m?.currentVersionId) return null;
  const [v] = await db.select().from(mandateVersion).where(eq(mandateVersion.id, m.currentVersionId));
  const parsed = termsSchema.safeParse(v?.terms);
  if (!v || !parsed.success) return null;
  const [agg] = await db
    .select({ spent: sql<number>`coalesce(sum(${order.amountCents}), 0)::int`, count: sql<number>`count(*)::int` })
    .from(order)
    .where(and(eq(order.mandateId, m.id), eq(order.status, "captured")));
  return { mandate: m, version: v, terms: parsed.data, spentCents: Number(agg?.spent ?? 0), capturedCount: Number(agg?.count ?? 0) };
}
