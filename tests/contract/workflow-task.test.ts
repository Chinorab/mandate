/**
 * The Render Workflows task body (T092): assembles the evidence file for a stored dispute, marks it as
 * assembled by the workflow, and is safe to run twice (Render retries, or the app's safety net).
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dispute, evidenceFile, order } from "@/lib/db/schema";
import { templateDrafter } from "@/lib/disputes/draft";
import { processEvent } from "@/lib/webhooks/dispatch";
import { ASSEMBLE_TASK, runAssembly } from "@/workflows/assemble-evidence";
import { testDb } from "../helpers/db";
import { disputeEvent, paidOrder } from "../helpers/disputes";

let handle: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  handle = await testDb();
});
afterAll(async () => {
  await handle.close();
});

describe("assembleEvidence workflow task", () => {
  it("builds the evidence file for a dispute recorded by the webhook, once", async () => {
    const { orderCode, m } = await paidOrder(handle.db);
    const [o] = await handle.db.select().from(order).where(eq(order.code, orderCode));
    const event = disputeEvent({ captureId: o.paypalCaptureId });
    // The webhook records the dispute and hands the assembly to the queue, which here does nothing.
    await processEvent({ db: handle.db, drafter: templateDrafter, enqueue: () => undefined }, event);
    const [d] = await handle.db.select().from(dispute).where(eq(dispute.paypalDisputeId, event.resource.dispute_id));
    expect(await handle.db.select().from(evidenceFile).where(eq(evidenceFile.disputeId, d.id))).toHaveLength(0);

    const first = await runAssembly(d.id, { db: handle.db, drafter: templateDrafter });
    expect(first).toMatchObject({ disputeId: d.id, assembledBy: "workflow", items: 3 });
    const [file] = await handle.db.select().from(evidenceFile).where(eq(evidenceFile.disputeId, d.id));
    expect(file.assembledBy).toBe("workflow");
    expect(file.draftText).toContain(m.code);

    const again = await runAssembly(d.id, { db: handle.db, drafter: templateDrafter });
    expect(again.evidenceFileId).toBe(first.evidenceFileId);
    expect(await handle.db.select().from(evidenceFile).where(eq(evidenceFile.disputeId, d.id))).toHaveLength(1);
  });

  it("is registered under a stable task name", () => {
    expect(ASSEMBLE_TASK).toBe("assembleEvidence");
  });
});
