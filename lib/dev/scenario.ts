/**
 * Development and end to end test fixture. Creates, for the caller's demo session, an active
 * mandate with the canvas terms, a passing cart, a blocked cart and a short conversation, so the
 * chat and check pages can be exercised without PayPal or model keys.
 *
 * Never available in production: the route returns 404 unless NODE_ENV is "development" and
 * MANDATE_DEV_SCENARIOS is "1". The saved payment token is a placeholder that PayPal would reject,
 * so nothing created here can be paid.
 */
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { agentThread, cart, mandate, mandateVersion } from "@/lib/db/schema";
import { fingerprint } from "@/lib/mandate/canonical";
import type { Terms } from "@/lib/mandate/terms";
import { checkCart, type GateDeps } from "@/lib/payments/gate";
import { endOfDayEt, etParts } from "@/lib/time/et";

export function devScenariosEnabled(env: Record<string, string | undefined> = process.env) {
  return env.NODE_ENV === "development" && env.MANDATE_DEV_SCENARIOS === "1";
}

const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export async function createScenario(gate: GateDeps, sessionId: string) {
  const db: Db = gate.db;
  const today = etParts(new Date());
  const daysToSunday = (7 - today.weekday) % 7 || 7;
  const sunday = new Date(Date.UTC(today.y, today.m - 1, today.d + daysToSunday));
  const terms: Terms = {
    budgetCents: 12000,
    currency: "USD",
    category: "running-shoes",
    required: { size: { system: "US_MENS", value: "10" }, colors: ["beige", "black", "gray", "white"] },
    forbidden: {},
    semantic: [],
    merchants: "ANY_LISTED",
    expiresAt: endOfDayEt(sunday.getUTCFullYear(), sunday.getUTCMonth() + 1, sunday.getUTCDate()).toISOString(),
    maxPurchases: 1,
  };
  let code = "MDT";
  for (const b of crypto.getRandomValues(new Uint8Array(6))) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  const fp = fingerprint(code, 1, terms);
  const [m] = await db
    .insert(mandate)
    .values({
      code,
      sessionId,
      instructions: "Buy running shoes, size 10, under $120, neutral colors, this week only",
      status: "active",
      vaultPaymentTokenId: "dev-placeholder-token",
    })
    .returning();
  const [v] = await db
    .insert(mandateVersion)
    .values({
      mandateId: m.id,
      versionNo: 1,
      terms: JSON.parse(fp.canonical).terms,
      assumptions: [],
      canonical: fp.canonical,
      sha256: fp.sha256,
      signedAt: new Date(),
    })
    .returning();
  await db.update(mandate).set({ currentVersionId: v.id }).where(eq(mandate.id, m.id));

  const mk = async (productId: string, storeId: string) => {
    const [c] = await db
      .insert(cart)
      .values({ sessionId, mandateId: m.id, mandateVersionId: v.id, storeId, lines: [{ productId, size: "10", qty: 1 }] })
      .returning({ id: cart.id });
    await checkCart(gate, { sessionId, cartId: c.id });
    return c.id;
  };
  const passCartId = await mk("daily-miler-blk-wht", "sports-outlet");
  const blockedCartId = await mk("tempo-racer-volt", "shoe-supply");

  const t = new Date().toISOString();
  const messages = [
    { role: "user", content: [{ type: "text", text: "Find me something that fits the mandate." }] },
    {
      role: "assistant",
      content: [
        { type: "text", text: "I searched 3 stores. These are the closest matches in US men's 10." },
        {
          type: "tool_use",
          id: "toolu_dev_1",
          name: "present_options",
          input: { productIds: ["daily-miler-blk-wht", "road-trainer-4-gray", "tempo-racer-volt"], size: "10" },
        },
      ],
    },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_dev_1", content: JSON.stringify({ shown: 3 }) }] },
    { role: "assistant", content: [{ type: "text", text: "Daily Miler has the lowest total and passes every term. Want me to buy it?" }] },
  ];
  await db.insert(agentThread).values({ mandateId: m.id, sessionId, messages, times: messages.map(() => t) });
  return { code, passCartId, blockedCartId };
}

/**
 * Merchant fixture: several paid orders at Sample Sports Outlet, each under its own mandate and
 * buyer session, paid through the real consent gate with a development money client that returns
 * placeholder PayPal ids (prefixed DEV). Some are shipped or delivered, one mandate is revoked.
 */
export async function createMerchantScenario(gate: GateDeps) {
  const db: Db = gate.db;
  const { demoSession, order: orderTable, mandate: mandateTable } = await import("@/lib/db/schema");
  const { payCart } = await import("@/lib/payments/gate");
  const { PRODUCTS } = await import("@/lib/catalog/data");
  const devMoney = {
    async chargeSavedPayPal() {
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
      return { orderId: `DEV${id}`, status: "COMPLETED", captureId: `DEVCAP${id}` };
    },
    async captureOrder(orderId: string) {
      return { captureId: `DEVCAP${orderId}`, status: "COMPLETED" };
    },
  };
  const today = etParts(new Date());
  const later = new Date(Date.UTC(today.y, today.m - 1, today.d + 7));
  const expiresAt = endOfDayEt(later.getUTCFullYear(), later.getUTCMonth() + 1, later.getUTCDate()).toISOString();
  const picks = ["daily-miler-blk-wht", "cadence-2-beige", "ridge-runner-olive", "crew-sock-3-wht", "daily-miler-navy", "puddle-boot-yellow", "coffee-house-12", "lamp-arc-blk"];
  const codes: string[] = [];
  for (const [i, productId] of picks.entries()) {
    const p = PRODUCTS.find((x) => x.id === productId)!;
    const size = p.attributes.sizeSystem ? (p.attributes.sizeSystem === "US_KIDS" ? "12" : "10") : null;
    const [s] = await db.insert(demoSession).values({}).returning();
    const terms: Terms = {
      budgetCents: 50000,
      currency: "USD",
      category: p.category,
      required: size && p.attributes.sizeSystem ? { size: { system: p.attributes.sizeSystem, value: size } } : {},
      forbidden: {},
      semantic: [],
      merchants: "ANY_LISTED",
      expiresAt,
      maxPurchases: 1,
    };
    let code = "MDT";
    for (const b of crypto.getRandomValues(new Uint8Array(6))) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
    const fp = fingerprint(code, 1, terms);
    const [m] = await db
      .insert(mandate)
      .values({ code, sessionId: s.id, instructions: `Buy ${p.name.toLowerCase()} under $500`, status: "active", vaultPaymentTokenId: "dev-placeholder-token" })
      .returning();
    const [v] = await db
      .insert(mandateVersion)
      .values({ mandateId: m.id, versionNo: 1, terms: JSON.parse(fp.canonical).terms, assumptions: [], canonical: fp.canonical, sha256: fp.sha256, signedAt: new Date() })
      .returning();
    await db.update(mandate).set({ currentVersionId: v.id }).where(eq(mandate.id, m.id));
    const [c] = await db
      .insert(cart)
      .values({ sessionId: s.id, mandateId: m.id, mandateVersionId: v.id, storeId: "sports-outlet", lines: [{ productId, size, qty: 1 }] })
      .returning({ id: cart.id });
    const r = await payCart({ ...gate, money: devMoney }, { sessionId: s.id, cartId: c.id });
    if (r.status !== "paid") continue;
    codes.push(r.orderCode);
    if (i % 3 === 1) {
      await db.update(orderTable).set({ shippingStatus: "shipped", tracking: { carrier: "UPS", number: `1Z999AA1${String(10000000 + i * 7919).slice(0, 8)}` } }).where(eq(orderTable.code, r.orderCode));
    }
    if (i % 3 === 2) await db.update(orderTable).set({ shippingStatus: "delivered" }).where(eq(orderTable.code, r.orderCode));
    if (i === 4) await db.update(mandateTable).set({ status: "revoked", revokedAt: new Date(), vaultPaymentTokenId: null }).where(eq(mandateTable.id, m.id));
  }
  return { orderCodes: codes };
}

/**
 * Filming fixture (development only): links a signed mandate of the caller to a PayPal payment token
 * that the sandbox test buyer approved through scripts/02-vault-setup.ts. The token is real, so the
 * agent's payments after this are real sandbox payments; only the in app approval popup is skipped,
 * because the test buyer's password is never typed by automation.
 */
export async function linkWithSandboxToken(db: Db, sessionId: string, code: string) {
  const { readFileSync, existsSync } = await import("node:fs");
  const path = await import("node:path");
  const file = path.join(process.cwd(), ".scripts-state", "02-payment-token.json");
  const saved = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { paymentTokenId?: string | null; customerId?: string | null }) : null;
  if (!saved?.paymentTokenId) throw new Error("No approved sandbox payment token: run scripts/02-vault-setup.ts with the test buyer first.");
  const { and } = await import("drizzle-orm");
  const [m] = await db
    .update(mandate)
    .set({ status: "active", vaultPaymentTokenId: saved.paymentTokenId, vaultCustomerId: saved.customerId ?? null, vaultSetupTokenId: null })
    .where(and(eq(mandate.code, code), eq(mandate.sessionId, sessionId), eq(mandate.status, "awaiting_link")))
    .returning({ code: mandate.code, status: mandate.status });
  if (!m) throw new Error("No signed mandate of this session waiting for PayPal with that code.");
  return m;
}
