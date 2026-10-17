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
