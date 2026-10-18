/**
 * Dispute pool (FR-032): a demo session that opens the merchant's disputes claims one unclaimed pool
 * dispute and keeps it; only that session can edit or submit. With the pool empty, the latest submitted
 * dispute is shown read only.
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { dispute, evidenceFile } from "@/lib/db/schema";

export type Claim = { disputeId: string | null; readOnly: boolean; poolEmpty: boolean };

const CLOSED = ["RESOLVED", "CLOSED"];

export async function claimDispute(db: Db, sessionId: string): Promise<Claim> {
  const [mine] = await db
    .select({ id: dispute.id })
    .from(dispute)
    .where(eq(dispute.claimedBySessionId, sessionId))
    .orderBy(desc(dispute.updatedAt))
    .limit(1);
  if (mine) return { disputeId: mine.id, readOnly: false, poolEmpty: false };

  const next = db
    .select({ id: dispute.id })
    .from(dispute)
    .innerJoin(evidenceFile, eq(evidenceFile.disputeId, dispute.id))
    .where(and(eq(dispute.inPool, true), isNull(dispute.claimedBySessionId), isNull(evidenceFile.submittedAt), notInArray(dispute.status, CLOSED)))
    .orderBy(sql`${dispute.sellerResponseDue} asc nulls last`, asc(dispute.createdAt))
    .limit(1)
    .for("update", { of: dispute, skipLocked: true });
  const [claimed] = await db
    .update(dispute)
    .set({ claimedBySessionId: sessionId, updatedAt: new Date() })
    .where(and(inArray(dispute.id, next), isNull(dispute.claimedBySessionId)))
    .returning({ id: dispute.id });
  if (claimed) return { disputeId: claimed.id, readOnly: false, poolEmpty: false };

  const [shown] = await db
    .select({ id: dispute.id })
    .from(dispute)
    .innerJoin(evidenceFile, eq(evidenceFile.disputeId, dispute.id))
    .where(isNotNull(evidenceFile.submittedAt))
    .orderBy(desc(evidenceFile.submittedAt))
    .limit(1);
  return { disputeId: shown?.id ?? null, readOnly: true, poolEmpty: true };
}
