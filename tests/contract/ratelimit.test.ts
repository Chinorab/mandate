import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { audit } from "@/lib/audit";
import { auditLog, demoSession } from "@/lib/db/schema";
import { consumeModelCall } from "@/lib/ratelimit/model";
import { testDb } from "../helpers/db";

let handle: Awaited<ReturnType<typeof testDb>>;

beforeAll(async () => {
  handle = await testDb();
});
afterAll(async () => {
  await handle.close();
});

async function newSession() {
  const [s] = await handle.db.insert(demoSession).values({}).returning();
  return s.id;
}

describe("model usage cap", () => {
  const day1 = new Date("2026-11-02T15:00:00Z");
  const day2 = new Date("2026-11-03T15:00:00Z");

  it("allows calls up to the session cap, then refuses", async () => {
    const id = await newSession();
    for (let i = 1; i <= 3; i++) {
      const r = await consumeModelCall(handle.db, id, { now: day1, sessionCap: 3, globalCap: 100 });
      expect(r).toMatchObject({ ok: true, sessionCalls: i });
    }
    expect(await consumeModelCall(handle.db, id, { now: day1, sessionCap: 3, globalCap: 100 })).toEqual({
      ok: false,
      reason: "session_cap",
    });
  });

  it("resets the session counter on a new day", async () => {
    const id = await newSession();
    await consumeModelCall(handle.db, id, { now: day1, sessionCap: 1, globalCap: 100 });
    const r = await consumeModelCall(handle.db, id, { now: day2, sessionCap: 1, globalCap: 100 });
    expect(r).toMatchObject({ ok: true, sessionCalls: 1 });
  });

  it("refuses at the global cap without consuming session quota", async () => {
    const day = new Date("2026-11-10T12:00:00Z");
    const a = await newSession();
    const b = await newSession();
    expect((await consumeModelCall(handle.db, a, { now: day, sessionCap: 5, globalCap: 1 })).ok).toBe(true);
    expect(await consumeModelCall(handle.db, b, { now: day, sessionCap: 5, globalCap: 1 })).toEqual({
      ok: false,
      reason: "global_cap",
    });
    // Session b's refused call was rolled back: it still has its full quota once the global cap allows.
    const r = await consumeModelCall(handle.db, b, { now: day, sessionCap: 1, globalCap: 10 });
    expect(r).toMatchObject({ ok: true, sessionCalls: 1 });
  });

  it("refuses an unknown session", async () => {
    const r = await consumeModelCall(handle.db, crypto.randomUUID(), { now: day1 });
    expect(r).toEqual({ ok: false, reason: "session_cap" });
  });
});

describe("audit log", () => {
  it("appends rows", async () => {
    await audit(handle.db, { actor: "system", action: "test_event", detail: { a: 1 } });
    const rows = await handle.db.select().from(auditLog);
    expect(rows.some((r) => r.action === "test_event")).toBe(true);
  });
});
