/**
 * SC-006: from a verified dispute event to a stored evidence file and draft in under a minute, with
 * the model answering after a realistic delay. The model's sentences are grounded before storage.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMerchantDrafter } from "@/lib/agents/merchant";
import { dispute, evidenceFile, order } from "@/lib/db/schema";
import { groundSentences, type DraftSentence } from "@/lib/disputes/draft";
import { handlePayPalWebhook } from "@/lib/webhooks/dispatch";
import { testDb } from "../helpers/db";
import { SIGNED_HEADERS, disputeEvent, fakeVerify, paidOrder } from "../helpers/disputes";

let handle: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  handle = await testDb();
});
afterAll(async () => {
  await handle.close();
});

const MODEL_LATENCY_MS = 2500;

describe("dispute event to evidence file", () => {
  it("stores the file and a grounded draft well within 60 seconds", async () => {
    const { orderCode, m } = await paidOrder(handle.db);
    const [o] = await handle.db.select().from(order).where(eq(order.code, orderCode));
    const client = {
      beta: {
        messages: {
          parse: async () => {
            await new Promise((r) => setTimeout(r, MODEL_LATENCY_MS));
            return {
              stop_reason: "end_turn",
              parsed_output: {
                sentences: [
                  { text: `The buyer authorized this purchase in advance through signed mandate ${m.code}.`, items: ["mandate"] },
                  { text: "Before payment, the order passed 7 of 7 mandate terms.", items: ["check"] },
                  { text: "The total of $103.92 was captured through PayPal.", items: ["transaction"] },
                ],
              },
            };
          },
        },
      },
    } as unknown as Anthropic;

    const event = disputeEvent({ captureId: o.paypalCaptureId });
    const started = performance.now();
    const r = await handlePayPalWebhook(
      { db: handle.db, verify: fakeVerify, drafter: createMerchantDrafter(handle.db, { client }), enqueue: (job) => job.run() },
      SIGNED_HEADERS,
      JSON.stringify(event),
    );
    const elapsed = performance.now() - started;
    expect(r.status).toBe(200);
    expect(elapsed).toBeLessThan(60_000);
    expect(elapsed).toBeGreaterThanOrEqual(MODEL_LATENCY_MS - 50);

    const [ds] = await handle.db.select().from(dispute).where(eq(dispute.paypalDisputeId, event.resource.dispute_id));
    const [file] = await handle.db.select().from(evidenceFile).where(eq(evidenceFile.disputeId, ds.id));
    expect(file.draftText).toContain(m.code);
    const sentences = file.draftSentences as DraftSentence[];
    // Three grounded sentences from the model, then the missing tracking in fixed wording.
    expect(sentences).toHaveLength(4);
    expect(sentences[3]).toEqual({ text: "No shipment tracking is on file for this order.", items: ["missing"] });
    expect(sentences.every((s) => s.items.length > 0)).toBe(true);
  }, 20_000);

  it("keeps the draft grounded: every stored sentence passes the check again", async () => {
    const files = await handle.db.select().from(evidenceFile);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const items = f.items as Parameters<typeof groundSentences>[0]["items"];
      const { rejected } = groundSentences({ dispute: { facts: (f.draftContext as { dispute: string[] }).dispute }, items, missing: (f.draftContext as { missing: string[] }).missing }, f.draftSentences as DraftSentence[]);
      expect(rejected).toEqual([]);
    }
  });
});
