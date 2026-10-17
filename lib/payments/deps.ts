import "server-only";
import { createSemanticJudge } from "@/lib/check/semantic";
import { getDb } from "@/lib/db/client";
import type { GateDeps } from "./gate";
import { createMoneyClient } from "./paypal-money";

let cached: Promise<GateDeps> | null = null;

/** Production dependencies of the consent gate: Postgres, sandbox PayPal, Claude semantic judge. */
export function gateDeps(): Promise<GateDeps> {
  cached ??= (async () => {
    const db = await getDb();
    return { db, money: createMoneyClient(), judge: createSemanticJudge(db) };
  })();
  return cached;
}
