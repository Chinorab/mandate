/**
 * Agent tool registry (constitution I): the shopping agent can only move money through pay_cart,
 * which is the consent gate, and never receives a raw PayPal money tool.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SHOPPING_TOOL_NAMES, buildShoppingTools } from "@/lib/agents/tools";
import { cart } from "@/lib/db/schema";
import { MONEY_MOVING_TOOLKIT_TOOLS, wrapToolkit } from "@/lib/payments/toolkit";
import { testDb } from "../helpers/db";
import { CANVAS_TERMS, CHECK_TIME } from "../helpers/fixtures";
import { activeMandate, fakeJudge, fakeMoney, newSession } from "../helpers/scenario";

let handle: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  handle = await testDb();
});
afterAll(async () => {
  await handle.close();
});

/** A toolkit that offers everything, money tools included, as the real one can. */
function greedyToolkit() {
  const calls: string[] = [];
  const names = ["get_order", "create_order", "pay_order", "create_refund", "accept_dispute_claim", "list_disputes"];
  const inner = {
    getTools: () => names.map((name) => ({ type: "function" as const, function: { name, description: name, parameters: { type: "object", properties: { id: { type: "string" } } } } })),
    handleToolCall: async (c: { function: { name: string } }) => {
      calls.push(c.function.name);
      return { content: JSON.stringify({ status: "COMPLETED" }) };
    },
  };
  return { toolkit: wrapToolkit(inner), calls };
}

type Runnable = { name: string; run: (input: unknown) => Promise<unknown> };

async function setup(opts: { toolkit?: boolean; terms?: typeof CANVAS_TERMS } = {}) {
  const m = await activeMandate(handle.db, { terms: opts.terms });
  const money = fakeMoney();
  const tk = greedyToolkit();
  const tools = buildShoppingTools({
    gate: { db: handle.db, money: money.client, judge: fakeJudge().judge, now: () => CHECK_TIME },
    sessionId: m.sessionId,
    mandateCode: m.code,
    toolkit: opts.toolkit ? tk.toolkit : null,
  }) as unknown as Runnable[];
  const byName = (n: string) => {
    const t = tools.find((x) => x.name === n);
    if (!t) throw new Error(`no tool ${n}`);
    return t;
  };
  return { m, money, tk, tools, byName };
}

const parse = (out: unknown) => JSON.parse(String(out));

describe("registered tools", () => {
  it("are exactly the allow list, with no raw money tool even when the toolkit offers them", async () => {
    const { tools } = await setup({ toolkit: true });
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([...SHOPPING_TOOL_NAMES].sort());
    for (const money of MONEY_MOVING_TOOLKIT_TOOLS) expect(names).not.toContain(money);
  });

  it("drop the toolkit's get_order when PayPal is not configured", async () => {
    const { tools } = await setup({ toolkit: false });
    expect(tools.map((t) => t.name)).not.toContain("get_order");
  });

  it("the toolkit wrapper refuses money tools by name", async () => {
    const { toolkit, calls } = greedyToolkit();
    await expect(toolkit.call("pay_order", { id: "X" })).rejects.toThrow();
    await expect(toolkit.call("create_order", {})).rejects.toThrow();
    expect(calls).toEqual([]);
    expect(toolkit.tools(["get_order", "pay_order"]).map((t) => t.name)).toEqual(["get_order"]);
  });
});

describe("search_catalog", () => {
  it("labels fit with the deterministic check (the canvas proposals)", async () => {
    const { byName } = await setup();
    const out = parse(await byName("search_catalog").run({ category: "running-shoes", size: "10" }));
    const fit = (id: string) => out.products.find((p: { id: string }) => p.id === id)?.fit.label;
    expect(fit("daily-miler-blk-wht")).toBe("Fits mandate");
    expect(fit("road-trainer-4-gray")).toBe("Close to budget with tax");
    expect(fit("tempo-racer-volt")).toBe("Color outside mandate");
  });

  it("never returns more than 12 products and only in stock ones", async () => {
    const { byName } = await setup();
    const out = parse(await byName("search_catalog").run({}));
    expect(out.products.length).toBeLessThanOrEqual(12);
  });
});

describe("add_to_cart", () => {
  it("creates a cart pinned to the current version at the product's store", async () => {
    const { byName, m } = await setup();
    const out = parse(await byName("add_to_cart").run({ productId: "daily-miler-blk-wht", size: "10", qty: 1 }));
    const [c] = await handle.db.select().from(cart).where(eq(cart.id, out.cartId));
    expect(c).toMatchObject({ mandateVersionId: m.versionId, storeId: "sports-outlet", sessionId: m.sessionId });
    expect(out.totalCents).toBe(10392);
  });

  it("refuses unknown products and sizes not sold", async () => {
    const { byName } = await setup();
    expect(parse(await byName("add_to_cart").run({ productId: "nope", size: "10", qty: 1 })).error).toBeTruthy();
    expect(parse(await byName("add_to_cart").run({ productId: "daily-miler-blk-wht", size: "19", qty: 1 })).error).toBeTruthy();
  });
});

describe("pay_cart is the consent gate", () => {
  it("refuses a non compliant cart with zero PayPal calls", async () => {
    const { byName, money } = await setup();
    const { cartId } = parse(await byName("add_to_cart").run({ productId: "tempo-racer-volt", size: "10", qty: 1 }));
    const out = parse(await byName("pay_cart").run({ cartId }));
    expect(out.status).toBe("refused");
    expect(out.failed.map((f: { term: string }) => f.term)).toEqual(["budget", "colors"]);
    expect(money.charges).toHaveLength(0);
  });

  it("pays a compliant cart through the gate", async () => {
    const { byName, money } = await setup();
    const { cartId } = parse(await byName("add_to_cart").run({ productId: "daily-miler-blk-wht", size: "10", qty: 1 }));
    const out = parse(await byName("pay_cart").run({ cartId }));
    expect(out.status).toBe("paid");
    expect(money.charges).toHaveLength(1);
  });

  it("cannot reach a cart from another session", async () => {
    const { byName } = await setup();
    const other = await activeMandate(handle.db, { sessionId: await newSession(handle.db) });
    const otherTools = await setup();
    const { cartId } = parse(await otherTools.byName("add_to_cart").run({ productId: "daily-miler-blk-wht", size: "10", qty: 1 }));
    expect(other).toBeTruthy();
    const out = parse(await byName("pay_cart").run({ cartId }));
    expect(out.status).toBe("refused");
    expect(parse(await byName("check_cart").run({ cartId })).error).toBeTruthy();
  });
});
