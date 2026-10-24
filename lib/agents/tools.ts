/**
 * The shopping agent's tools. The registry is closed: SHOPPING_TOOL_NAMES is the full list, and the
 * only tool able to move money is pay_cart, which is the consent gate (payCart). Raw PayPal money
 * tools from the Agent Toolkit are never registered (tests/bypass/tools.test.ts).
 *
 * Tool results are JSON strings built from database rows and the deterministic check. Product text
 * is returned as data inside those strings, never as instructions.
 */
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { CATEGORIES, COLOR_IDS, type ProductAttributes } from "@/lib/catalog/data";
import { cart, order, product, store } from "@/lib/db/schema";
import { loadMandateContext, type MandateContext } from "@/lib/mandate/context";
import { checkCart, payCart, type GateDeps } from "@/lib/payments/gate";
import { ToolkitError, type Toolkit } from "@/lib/payments/toolkit";
import { computeTotals } from "@/lib/pricing";
import { fitFor } from "./fit";

export const SHOPPING_TOOL_NAMES = [
  "search_catalog",
  "present_options",
  "add_to_cart",
  "check_cart",
  "pay_cart",
  "order_status",
  "get_order",
] as const;

export type ToolCtx = {
  gate: GateDeps;
  sessionId: string;
  mandateCode: string;
  toolkit: Toolkit | null;
  now?: () => Date;
};

const json = (v: unknown) => JSON.stringify(v);
const categoryIds = Object.keys(CATEGORIES) as [keyof typeof CATEGORIES, ...(keyof typeof CATEGORIES)[]];

type StoreRow = typeof store.$inferSelect;
const pricing = (s: StoreRow) => ({
  id: s.id,
  name: s.name,
  taxRateBp: s.taxRateBp,
  shippingCents: s.shippingCents,
  freeShippingOverCents: s.freeShippingOverCents,
});

function shippingNote(s: StoreRow, priceCents: number) {
  if (s.shippingCents === 0 || (s.freeShippingOverCents !== null && priceCents >= s.freeShippingOverCents)) return "free shipping";
  return `$${(s.shippingCents / 100).toFixed(2)} shipping`;
}

export function buildShoppingTools(ctx: ToolCtx) {
  const db = ctx.gate.db;
  const now = () => (ctx.now ?? ctx.gate.now ?? (() => new Date()))();
  const mandateCtx = async (): Promise<MandateContext | null> => loadMandateContext(db, ctx.sessionId, ctx.mandateCode);

  const searchCatalog = betaZodTool({
    name: "search_catalog",
    description:
      "Search the three demo stores. Returns in stock products with price, store, shipping and a fit label computed against the signed mandate. Use it before proposing anything.",
    inputSchema: z.object({
      query: z.string().max(60).optional().describe("Words to match in the product name, brand or description"),
      category: z.enum(categoryIds).optional(),
      size: z.string().max(8).optional().describe("Size the buyer needs, used for the fit label"),
      colors: z.array(z.enum(COLOR_IDS)).max(12).optional(),
    }),
    run: async (input) => {
      const m = await mandateCtx();
      if (!m) return json({ error: "Mandate not found or not signed" });
      const rows = await db.select().from(product);
      const stores = new Map((await db.select().from(store)).map((s) => [s.id, s]));
      const q = input.query?.toLowerCase().trim();
      const size = input.size ?? m.terms.required.size?.value ?? null;
      const results = rows
        .filter((p) => p.stock > 0)
        .filter((p) => !input.category || p.category === input.category)
        .filter((p) => !input.colors?.length || (p.attributes as ProductAttributes).colors.some((c) => input.colors!.includes(c)))
        .filter((p) => !q || `${p.name} ${(p.attributes as ProductAttributes).brand} ${p.description}`.toLowerCase().includes(q))
        .map((p) => {
          const s = stores.get(p.storeId)!;
          const attrs = p.attributes as ProductAttributes;
          const fit = fitFor(
            m,
            {
              product: { id: p.id, storeId: p.storeId, name: p.name, category: p.category, currency: p.currency, priceCents: p.priceCents, attributes: attrs },
              size: attrs.sizeSystem ? size : null,
              qty: 1,
            },
            pricing(s),
            now(),
          );
          return {
            id: p.id,
            name: p.name,
            brand: attrs.brand,
            store: s.name,
            category: CATEGORIES[p.category as keyof typeof CATEGORIES] ?? p.category,
            colors: attrs.colors,
            sizes: attrs.sizeSystem ? { system: attrs.sizeSystem, available: attrs.sizes } : null,
            priceCents: p.priceCents,
            shipping: shippingNote(s, p.priceCents),
            description: p.description,
            fit,
          };
        })
        .sort((a, b) => Number(b.fit.fits) - Number(a.fit.fits) || a.fit.totalCents - b.fit.totalCents)
        .slice(0, 12);
      return json({ products: results, note: "Fit labels are previews. Payment always runs the full Mandate check." });
    },
  });

  const presentOptions = betaZodTool({
    name: "present_options",
    description:
      "Show product cards to the buyer, with their fit labels. Use it to present 1 to 4 options after searching. The buyer sees the cards right after your message.",
    inputSchema: z.object({
      productIds: z.array(z.string().max(60)).min(1).max(4),
      size: z.string().max(8).nullable().describe("Size shown on the cards, or null"),
    }),
    run: async (input) => {
      const found = await db.select({ id: product.id }).from(product).where(inArray(product.id, input.productIds));
      const known = new Set(found.map((f) => f.id));
      const missing = input.productIds.filter((id) => !known.has(id));
      return json(missing.length ? { error: `Unknown products: ${missing.join(", ")}` } : { shown: input.productIds.length });
    },
  });

  const addToCart = betaZodTool({
    name: "add_to_cart",
    description:
      "Put one product in a new cart at its store, pinned to the current mandate version. Only do this after the buyer agreed to that exact product. Returns the cart id and its total.",
    inputSchema: z.object({
      productId: z.string().max(60),
      size: z.string().max(8).nullable(),
      qty: z.number().int().min(1).max(10).default(1),
    }),
    run: async (input) => {
      const m = await mandateCtx();
      if (!m) return json({ error: "Mandate not found or not signed" });
      if (m.mandate.status !== "active") return json({ error: "The mandate is not active, so nothing can be bought." });
      const [p] = await db.select().from(product).where(eq(product.id, input.productId));
      if (!p) return json({ error: "Unknown product" });
      const attrs = p.attributes as ProductAttributes;
      if (attrs.sizeSystem && (!input.size || !attrs.sizes.includes(input.size))) {
        return json({ error: `${p.name} is not sold in size ${input.size ?? "(none)"}` });
      }
      const [s] = await db.select().from(store).where(eq(store.id, p.storeId));
      const [c] = await db
        .insert(cart)
        .values({
          sessionId: ctx.sessionId,
          mandateId: m.mandate.id,
          mandateVersionId: m.version.id,
          storeId: p.storeId,
          lines: [{ productId: p.id, size: attrs.sizeSystem ? input.size : null, qty: input.qty }],
        })
        .returning({ id: cart.id });
      const totals = computeTotals([{ priceCents: p.priceCents, qty: input.qty }], s);
      return json({ cartId: c.id, store: s.name, product: p.name, totalCents: totals.totalCents });
    },
  });

  const checkCartTool = betaZodTool({
    name: "check_cart",
    description: "Run the Mandate check on a cart without paying. Returns pass or fail for every term with plain explanations.",
    inputSchema: z.object({ cartId: z.string().max(40) }),
    run: async ({ cartId }) => {
      const r = await checkCart(ctx.gate, { sessionId: ctx.sessionId, cartId });
      if (!r.ok) return json({ error: "Cart not found" });
      return json({
        checkResultId: r.checkResultId,
        verdict: r.outcome.verdict,
        summary: r.outcome.summary,
        totalCents: r.outcome.totals.totalCents,
        failed: r.outcome.terms.filter((t) => !t.pass).map((t) => ({ term: t.term, explanation: t.explanation })),
      });
    },
  });

  const payCartTool = betaZodTool({
    name: "pay_cart",
    description:
      "Pay a cart with the PayPal account linked to the mandate. The server runs the full Mandate check first and refuses anything outside the mandate. Only call it after the buyer agreed to the item.",
    inputSchema: z.object({ cartId: z.string().max(40) }),
    run: async ({ cartId }) => {
      const r = await payCart(ctx.gate, { sessionId: ctx.sessionId, cartId });
      if (r.status === "paid") return json({ status: "paid", orderCode: r.orderCode, checkResultId: r.checkResultId });
      if (r.status === "not_paid") return json({ status: "not_paid", reason: "PayPal is unavailable right now. Try again shortly.", checkResultId: r.checkResultId });
      return json({
        status: "refused",
        reason: r.reason,
        checkResultId: r.checkResultId ?? null,
        failed: (r.failed ?? []).map((t) => ({ term: t.term, explanation: t.explanation })),
      });
    },
  });

  const orderStatus = betaZodTool({
    name: "order_status",
    description: "Look up an order made under this mandate by its order code.",
    inputSchema: z.object({ orderCode: z.string().max(12) }),
    run: async ({ orderCode }) => {
      const m = await mandateCtx();
      if (!m) return json({ error: "Mandate not found" });
      const [o] = await db
        .select()
        .from(order)
        .where(and(eq(order.code, orderCode), eq(order.mandateId, m.mandate.id)));
      if (!o) return json({ error: "No such order on this mandate" });
      return json({ orderCode: o.code, status: o.status, amountCents: o.amountCents, shipping: o.shippingStatus, paypalOrderId: o.paypalOrderId });
    },
  });

  const tools = [searchCatalog, presentOptions, addToCart, checkCartTool, payCartTool, orderStatus];

  // The Agent Toolkit's read only get_order, handed to Claude with the toolkit's own schema.
  const [getOrderDef] = ctx.toolkit?.tools(["get_order"]) ?? [];
  if (ctx.toolkit && getOrderDef) {
    const toolkit = ctx.toolkit;
    tools.push(
      betaTool({
        name: "get_order",
        description: `${getOrderDef.description} (PayPal Agent Toolkit, sandbox, read only)`,
        inputSchema: getOrderDef.parameters as { type: "object" },
        run: async (args) => {
          // Only orders that belong to this mandate can be read.
          const id = String((args as Record<string, unknown>).id ?? (args as Record<string, unknown>).order_id ?? "");
          const m = await mandateCtx();
          const [o] = m ? await db.select().from(order).where(and(eq(order.paypalOrderId, id), eq(order.mandateId, m.mandate.id))) : [];
          if (!o) return json({ error: "That PayPal order is not on this mandate" });
          try {
            return await toolkit.call("get_order", args as Record<string, unknown>);
          } catch (err) {
            // PayPal refusals come back as a tool error the agent can explain, never as a crash.
            if (err instanceof ToolkitError) return json({ error: "PayPal could not return that order right now" });
            throw err;
          }
        },
      }) as unknown as (typeof tools)[number],
    );
  }

  const names = tools.map((t) => t.name);
  for (const n of names) {
    if (!(SHOPPING_TOOL_NAMES as readonly string[]).includes(n)) throw new Error(`Tool ${n} is not in the allow list`);
  }
  return tools;
}
