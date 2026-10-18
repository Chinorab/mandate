import "server-only";
/**
 * Background work after a verified dispute event. Today the job runs in this process after the
 * webhook response is sent (Next `after`), with one retry; the Render Workflows task that runs the
 * same job durably is added with the deployment (tasks T092, phase 5b).
 */
import { after } from "next/server";

export function enqueueAfterResponse(job: () => Promise<void>) {
  after(async () => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await job();
        return;
      } catch (err) {
        console.error(`Evidence assembly failed (attempt ${attempt})`, err instanceof Error ? err.message : err);
      }
    }
  });
}
