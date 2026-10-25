/**
 * Render Workflows task (T092): assembles the dispute evidence file and the grounded draft, the same
 * function the app runs inline (lib/disputes/assemble.ts), here with Render's retries, timeout and its
 * own compute. Started by the webhook through lib/disputes/enqueue.ts with the dispute id as input.
 */
import { task, type TaskContext } from "@renderinc/sdk/workflows";
import { createMerchantDrafter } from "@/lib/agents/merchant";
import { openDb, type Db } from "@/lib/db/client";
import { assembleEvidence } from "@/lib/disputes/assemble";
import type { Drafter } from "@/lib/disputes/draft";

export const ASSEMBLE_TASK = "assembleEvidence";

export type AssemblyResult = { disputeId: string; evidenceFileId: string; assembledBy: string; draftedBy: string | null; items: number };

/** The task body, callable directly (tests, or a manual run). Idempotent: one file per dispute. */
export async function runAssembly(disputeId: string, deps?: { db: Db; drafter: Drafter }): Promise<AssemblyResult> {
  const own = deps ? null : await openDb(process.env.DATABASE_URL ?? "");
  try {
    if (own) await own.ready;
    const db = deps?.db ?? own!.db;
    const file = await assembleEvidence({ db, drafter: deps?.drafter ?? createMerchantDrafter(db) }, disputeId, "workflow");
    return {
      disputeId,
      evidenceFileId: file.id,
      assembledBy: file.assembledBy,
      draftedBy: file.draftedBy ?? null,
      items: Array.isArray(file.items) ? file.items.length : 0,
    };
  } finally {
    await own?.close();
  }
}

export const assembleEvidenceTask = task(
  {
    name: ASSEMBLE_TASK,
    // A model call can time out; the file is created at most once whatever the number of attempts.
    retry: { maxRetries: 3, waitDurationMs: 5000, backoffScaling: 2 },
    timeoutSeconds: 300,
  },
  async function assembleEvidenceRun(_ctx: TaskContext, disputeId: string): Promise<AssemblyResult> {
    return runAssembly(disputeId);
  },
);
