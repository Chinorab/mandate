/**
 * Where evidence assembly runs (T092). With Render Workflows configured, the webhook starts the
 * `assembleEvidence` task (durable, retried by Render) and returns at once. The app keeps a safety net:
 * if the run cannot be started, or no evidence file exists after `safetyDelayMs`, it assembles the file
 * itself. Assembly is idempotent (one file per dispute), so a late workflow run changes nothing.
 */

export type EvidenceJob = { disputeId: string; run: () => Promise<void> };

export type QueueDeps = {
  /** Starts the workflow task for a dispute and returns the run id; null when Workflows is not configured. */
  start: ((disputeId: string) => Promise<string>) | null;
  /** Runs work after the webhook response is sent. */
  later: (fn: () => Promise<void>) => void;
  hasEvidence: (disputeId: string) => Promise<boolean>;
  safetyDelayMs: number;
  log?: (message: string) => void;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createEvidenceQueue(deps: QueueDeps) {
  const log = deps.log ?? ((m: string) => console.log(m));

  const inline = async (job: EvidenceJob) => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await job.run();
        return;
      } catch (err) {
        log(`Evidence assembly for ${job.disputeId} failed in the app (attempt ${attempt}): ${err instanceof Error ? err.message : err}`);
      }
    }
  };

  return async function enqueue(job: EvidenceJob): Promise<void> {
    if (deps.start) {
      try {
        const runId = await deps.start(job.disputeId);
        log(`Evidence assembly for ${job.disputeId} started on Render Workflows (${runId}).`);
        deps.later(async () => {
          await sleep(deps.safetyDelayMs);
          if (await deps.hasEvidence(job.disputeId)) return;
          log(`No evidence file for ${job.disputeId} after the workflow run; assembling in the app.`);
          await inline(job);
        });
        return;
      } catch (err) {
        log(`Render Workflows unavailable (${err instanceof Error ? err.message : err}); assembling ${job.disputeId} in the app.`);
      }
    }
    deps.later(() => inline(job));
  };
}
