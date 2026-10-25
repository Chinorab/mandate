import "server-only";
/**
 * Evidence assembly dispatch for the running app. With RENDER_API_KEY and RENDER_WORKFLOW_SLUG set
 * (render.yaml wires the slug from the "mandate-evidence" workflow service), the webhook starts the
 * Render Workflows task `assembleEvidence`; otherwise, or as a safety net, the app assembles the file
 * itself after the response (Next `after`). See lib/disputes/queue.ts.
 */
import { Render } from "@renderinc/sdk";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { getDb } from "@/lib/db/client";
import { evidenceFile } from "@/lib/db/schema";
import { ASSEMBLE_TASK } from "@/workflows/assemble-evidence";
import { createEvidenceQueue, type EvidenceJob } from "./queue";

/** Two minutes covers a cold workflow run with a model call; after that the app assembles. */
const SAFETY_DELAY_MS = 120_000;

export function evidenceAssemblyMode(env: Record<string, string | undefined> = process.env): "workflow" | "inline" {
  return env.RENDER_API_KEY && env.RENDER_WORKFLOW_SLUG ? "workflow" : "inline";
}

let render: Render | null = null;

function startOnRender(disputeId: string): Promise<string> {
  render ??= new Render();
  return render.workflows
    .startTask(`${process.env.RENDER_WORKFLOW_SLUG}/${ASSEMBLE_TASK}`, [disputeId], { idempotencyKey: `assemble-${disputeId}` })
    .then((run) => run.taskRunId);
}

const queue = createEvidenceQueue({
  start: evidenceAssemblyMode() === "workflow" ? startOnRender : null,
  later: (fn) => after(fn),
  hasEvidence: async (disputeId) => {
    const db = await getDb();
    const [f] = await db.select({ id: evidenceFile.id }).from(evidenceFile).where(eq(evidenceFile.disputeId, disputeId));
    return Boolean(f);
  },
  safetyDelayMs: SAFETY_DELAY_MS,
});

export function enqueueEvidence(job: EvidenceJob) {
  return queue(job);
}
