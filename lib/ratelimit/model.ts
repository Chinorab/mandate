/**
 * Model usage caps (FR-037): about 40 calls per demo session per day plus a global daily ceiling.
 * Both counters move inside one transaction, so a refused call never consumes quota.
 */
import { and, eq, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { demoSession, modelUsageDay } from "@/lib/db/schema";

export const SESSION_DAILY_CAP = 40;
export const DEFAULT_GLOBAL_DAILY_CAP = 2000;

export type CapResult =
  | { ok: true; sessionCalls: number; globalCalls: number }
  | { ok: false; reason: "session_cap" | "global_cap" };

class CapReached extends Error {
  constructor(readonly reason: "session_cap" | "global_cap") {
    super(reason);
  }
}

export function globalDailyCap(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.MODEL_DAILY_GLOBAL_CAP);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_GLOBAL_DAILY_CAP;
}

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Reserves one model call for the session, or explains which cap stopped it. */
export async function consumeModelCall(
  db: Db,
  sessionId: string,
  opts: { now?: Date; sessionCap?: number; globalCap?: number } = {},
): Promise<CapResult> {
  const day = utcDay(opts.now ?? new Date());
  const sessionCap = opts.sessionCap ?? SESSION_DAILY_CAP;
  const globalCap = opts.globalCap ?? globalDailyCap();
  try {
    return await db.transaction(async (tx) => {
      const [s] = await tx
        .update(demoSession)
        .set({
          modelCallsToday: sql`case when ${demoSession.modelCallsDay} = ${day} then ${demoSession.modelCallsToday} + 1 else 1 end`,
          modelCallsDay: day,
        })
        .where(
          and(
            eq(demoSession.id, sessionId),
            or(
              sql`${demoSession.modelCallsDay} is distinct from ${day}`,
              lt(demoSession.modelCallsToday, sessionCap),
            ),
          ),
        )
        .returning({ calls: demoSession.modelCallsToday });
      if (!s) throw new CapReached("session_cap");

      const [g] = await tx
        .insert(modelUsageDay)
        .values({ day, calls: 1 })
        .onConflictDoUpdate({
          target: modelUsageDay.day,
          set: { calls: sql`${modelUsageDay.calls} + 1` },
          setWhere: lt(modelUsageDay.calls, globalCap),
        })
        .returning({ calls: modelUsageDay.calls });
      if (!g) throw new CapReached("global_cap");

      return { ok: true as const, sessionCalls: s.calls, globalCalls: g.calls };
    });
  } catch (err) {
    if (err instanceof CapReached) return { ok: false, reason: err.reason };
    throw err;
  }
}
