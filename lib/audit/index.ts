import type { DbOrTx } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";

export type AuditActor = "buyer" | "agent" | "merchant" | "system";

/**
 * Appends one audit row. Every refusal by the consent gate, every revocation and every evidence
 * submission is recorded here. Details must never contain tokens or secrets.
 */
export async function audit(
  db: DbOrTx,
  entry: { sessionId?: string | null; actor: AuditActor; action: string; detail?: Record<string, unknown> },
) {
  await db.insert(auditLog).values({
    sessionId: entry.sessionId ?? null,
    actor: entry.actor,
    action: entry.action,
    detail: entry.detail ?? null,
  });
}
