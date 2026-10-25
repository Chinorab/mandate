/**
 * Evidence assembly dispatch (T092): Render Workflows when configured, the app itself otherwise, and
 * the app again if the workflow run cannot be started or leaves no evidence file in time.
 */
import { describe, expect, it } from "vitest";
import { createEvidenceQueue } from "@/lib/disputes/queue";

function harness(opts: { start?: "ok" | "throws" | null; evidence?: boolean; runFails?: number } = {}) {
  const calls = { started: [] as string[], runs: 0, later: 0 };
  const pending: (() => Promise<void>)[] = [];
  let fails = opts.runFails ?? 0;
  const queue = createEvidenceQueue({
    start:
      opts.start === null || opts.start === undefined
        ? null
        : async (id) => {
            calls.started.push(id);
            if (opts.start === "throws") throw new Error("Render API down");
            return `trn-${id}`;
          },
    later: (fn) => {
      calls.later++;
      pending.push(fn);
    },
    hasEvidence: async () => Boolean(opts.evidence),
    safetyDelayMs: 0,
    log: () => undefined,
  });
  const job = {
    disputeId: "d1",
    run: async () => {
      calls.runs++;
      if (fails > 0) {
        fails--;
        throw new Error("model timeout");
      }
    },
  };
  const flush = async () => {
    while (pending.length) await pending.shift()!();
  };
  return { queue, job, calls, flush };
}

describe("evidence queue", () => {
  it("assembles in the app after the response when no workflow is configured", async () => {
    const h = harness({ start: null });
    await h.queue(h.job);
    expect(h.calls.runs).toBe(0); // deferred, not during the webhook
    await h.flush();
    expect(h.calls.runs).toBe(1);
  });

  it("starts the Render workflow task and does not assemble again when the file exists", async () => {
    const h = harness({ start: "ok", evidence: true });
    await h.queue(h.job);
    expect(h.calls.started).toEqual(["d1"]);
    await h.flush();
    expect(h.calls.runs).toBe(0);
  });

  it("assembles in the app when the workflow run left no evidence file in time", async () => {
    const h = harness({ start: "ok", evidence: false });
    await h.queue(h.job);
    await h.flush();
    expect(h.calls.started).toEqual(["d1"]);
    expect(h.calls.runs).toBe(1);
  });

  it("falls back to the app when the workflow run cannot be started", async () => {
    const h = harness({ start: "throws" });
    await h.queue(h.job);
    await h.flush();
    expect(h.calls.runs).toBe(1);
  });

  it("retries an inline assembly once", async () => {
    const h = harness({ start: null, runFails: 1 });
    await h.queue(h.job);
    await h.flush();
    expect(h.calls.runs).toBe(2);
  });
});
