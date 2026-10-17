import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { cart, demoSession, mandate, mandateVersion } from "@/lib/db/schema";
import type { SemanticJudge } from "@/lib/check/semantic";
import { fingerprint } from "@/lib/mandate/canonical";
import type { Terms } from "@/lib/mandate/terms";
import type { ChargeArgs, MoneyClient } from "@/lib/payments/paypal-money";
import { PayPalApiError } from "@/lib/payments/paypal-rest";
import { CANVAS_TERMS } from "./fixtures";

let seq = 0;

export async function newSession(db: Db) {
  const [s] = await db.insert(demoSession).values({}).returning();
  return s.id;
}

/** A signed, PayPal linked, active mandate (version 1) owned by a fresh session. */
export async function activeMandate(db: Db, opts: { terms?: Terms; sessionId?: string } = {}) {
  const sessionId = opts.sessionId ?? (await newSession(db));
  const code = `MDTT${String(++seq).padStart(5, "0")}`;
  const terms = opts.terms ?? CANVAS_TERMS;
  const fp = fingerprint(code, 1, terms);
  const [m] = await db
    .insert(mandate)
    .values({
      code,
      sessionId,
      instructions: "Buy running shoes, size 10, under $120, neutral colors, this week only",
      status: "active",
      vaultPaymentTokenId: "vault-token-test",
      vaultCustomerId: "customer-test",
    })
    .returning();
  const [v] = await db
    .insert(mandateVersion)
    .values({ mandateId: m.id, versionNo: 1, terms, canonical: fp.canonical, sha256: fp.sha256, signedAt: new Date() })
    .returning();
  await db.update(mandate).set({ currentVersionId: v.id }).where(eq(mandate.id, m.id));
  return { sessionId, mandateId: m.id, versionId: v.id, code, sha256: fp.sha256 };
}

export async function newCart(
  db: Db,
  m: { sessionId: string; mandateId: string; versionId: string },
  productId = "daily-miler-blk-wht",
  opts: { storeId?: string; size?: string | null; qty?: number } = {},
) {
  const storeId =
    opts.storeId ??
    ({ "daily-miler-blk-wht": "sports-outlet", "tempo-racer-volt": "shoe-supply", "road-trainer-4-gray": "running-co" } as Record<string, string>)[productId] ??
    "sports-outlet";
  const [c] = await db
    .insert(cart)
    .values({
      sessionId: m.sessionId,
      mandateId: m.mandateId,
      mandateVersionId: m.versionId,
      storeId,
      lines: [{ productId, size: opts.size === undefined ? "10" : opts.size, qty: opts.qty ?? 1 }],
    })
    .returning();
  return c.id;
}

/** Records every money call. Behaviour can be switched per test. */
export function fakeMoney(mode: "completed" | "approved" | "outage" = "completed") {
  const charges: ChargeArgs[] = [];
  const captures: { orderId: string; requestId: string }[] = [];
  // Unique across fake instances, like real PayPal ids.
  const nextId = () => crypto.randomUUID().slice(0, 8).toUpperCase();
  const client: MoneyClient = {
    async chargeSavedPayPal(args) {
      charges.push(args);
      if (mode === "outage") throw new PayPalApiError(503, "SERVICE_UNAVAILABLE", "down", "dbg", null);
      const id = nextId();
      return mode === "completed"
        ? { orderId: `PP-ORDER-${id}`, status: "COMPLETED", captureId: `PP-CAPTURE-${id}` }
        : { orderId: `PP-ORDER-${id}`, status: "APPROVED", captureId: null };
    },
    async captureOrder(orderId, requestId) {
      captures.push({ orderId, requestId });
      return { captureId: `CAP-${orderId}`, status: "COMPLETED" };
    },
  };
  return { client, charges, captures };
}

export function fakeJudge(status: "pass" | "fail" | "unavailable" = "pass") {
  const calls: string[] = [];
  const judge: SemanticJudge = async ({ terms }) => {
    calls.push(terms.semantic.map((s) => s.id).join(","));
    return Object.fromEntries(terms.semantic.map((s) => [s.id, { status, reason: `judged ${status}` }]));
  };
  return { judge, calls };
}
