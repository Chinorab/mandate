import type Anthropic from "@anthropic-ai/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSemanticJudge } from "@/lib/check/semantic";
import { testDb } from "../helpers/db";
import { CANVAS_TERMS, line } from "../helpers/fixtures";
import { newSession } from "../helpers/scenario";

let handle: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  handle = await testDb();
});
afterAll(async () => {
  await handle.close();
});

const terms = {
  ...CANVAS_TERMS,
  semantic: [
    { id: "long-runs", label: "Use", text: "Comfortable for long runs" },
    { id: "quiet", label: "Look", text: "Understated look" },
  ],
};

/** A stand in for the Anthropic client: only beta.messages.parse is used. */
function fakeClient(reply: () => unknown) {
  let calls = 0;
  const client = {
    beta: {
      messages: {
        parse: async () => {
          calls++;
          return reply();
        },
      },
    },
  } as unknown as Anthropic;
  return { client, calls: () => calls };
}

describe("semantic judge", () => {
  it("makes no model call when the mandate has no semantic term", async () => {
    const f = fakeClient(() => {
      throw new Error("should not be called");
    });
    const judge = createSemanticJudge(handle.db, { client: f.client });
    expect(await judge({ sessionId: await newSession(handle.db), terms: CANVAS_TERMS, lines: [line("daily-miler-blk-wht")] })).toEqual({});
    expect(f.calls()).toBe(0);
  });

  it("maps verdicts and marks a missing id as unavailable", async () => {
    const f = fakeClient(() => ({
      stop_reason: "end_turn",
      parsed_output: { verdicts: [{ id: "long-runs", matches: true, reason: "Cushioned daily trainer" }] },
    }));
    const judge = createSemanticJudge(handle.db, { client: f.client });
    const v = await judge({ sessionId: await newSession(handle.db), terms, lines: [line("daily-miler-blk-wht")] });
    expect(v["long-runs"]).toEqual({ status: "pass", reason: "Cushioned daily trainer" });
    expect(v.quiet.status).toBe("unavailable");
  });

  it("fails closed on refusal, unparsable output or API errors", async () => {
    for (const reply of [
      () => ({ stop_reason: "refusal", parsed_output: null }),
      () => ({ stop_reason: "end_turn", parsed_output: null }),
      () => {
        throw new Error("network");
      },
    ]) {
      const judge = createSemanticJudge(handle.db, { client: fakeClient(reply).client });
      const v = await judge({ sessionId: await newSession(handle.db), terms, lines: [line("daily-miler-blk-wht")] });
      expect(Object.values(v).every((x) => x.status === "unavailable")).toBe(true);
    }
  });

  it("fails closed when the session's model cap is reached", async () => {
    const f = fakeClient(() => ({ stop_reason: "end_turn", parsed_output: { verdicts: [] } }));
    const judge = createSemanticJudge(handle.db, { client: f.client });
    const sessionId = await newSession(handle.db);
    const { demoSession } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    await handle.db
      .update(demoSession)
      .set({ modelCallsToday: 40, modelCallsDay: new Date().toISOString().slice(0, 10) })
      .where(eq(demoSession.id, sessionId));
    const v = await judge({ sessionId, terms, lines: [line("daily-miler-blk-wht")] });
    expect(v["long-runs"]).toEqual({ status: "unavailable", reason: "session_cap" });
    expect(f.calls()).toBe(0);
  });

  it("reuses a verdict for the same cart and version within 10 minutes", async () => {
    let t = 0;
    const f = fakeClient(() => ({
      stop_reason: "end_turn",
      parsed_output: { verdicts: terms.semantic.map((s) => ({ id: s.id, matches: true, reason: "ok" })) },
    }));
    const judge = createSemanticJudge(handle.db, { client: f.client, now: () => t });
    const args = { sessionId: await newSession(handle.db), terms, lines: [line("daily-miler-blk-wht")], cacheKey: "cart:v1" };
    await judge(args);
    await judge(args);
    expect(f.calls()).toBe(1);
    t = 11 * 60 * 1000;
    await judge(args);
    expect(f.calls()).toBe(2);
  });
});
