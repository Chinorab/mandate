/**
 * Shopping agent turns against a scripted Claude API (the real SDK tool runner with a fake fetch).
 * Proves the loop wiring: tools offered, tool results fed back, transcript stored server side, and a
 * payment only through pay_cart.
 */
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SHOPPING_TOOL_NAMES } from "@/lib/agents/tools";
import { agentTurn, getThread } from "@/lib/agents/shopping";
import { agentThread, mandate, order } from "@/lib/db/schema";
import { testDb } from "../helpers/db";
import { CHECK_TIME } from "../helpers/fixtures";
import { activeMandate, fakeJudge, fakeMoney } from "../helpers/scenario";

let handle: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  handle = await testDb();
});
afterAll(async () => {
  await handle.close();
});

type Req = { model: string; tools: { name: string }[]; messages: { role: string; content: unknown }[]; system: { text: string }[]; fallbacks?: unknown };
type Block = Record<string, unknown>;
let n = 0;
const msg = (content: Block[], stop: string) => ({
  id: `msg_${++n}`,
  type: "message",
  role: "assistant",
  model: "claude-sonnet-5-5",
  content,
  stop_reason: stop,
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 10 },
});
const toolUse = (name: string, input: Block) => ({ type: "tool_use", id: `toolu_${++n}`, name, input });

/** The fake API answers each request with the next script step, which may read the request. */
function scripted(steps: ((req: Req) => unknown)[]) {
  const requests: Req[] = [];
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    const req = JSON.parse(String(init?.body)) as Req;
    requests.push(req);
    const step = steps.shift();
    if (!step) throw new Error("No more scripted responses");
    return new Response(JSON.stringify(step(req)), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { client: new Anthropic({ apiKey: "test-key", fetch: fetch as typeof globalThis.fetch, maxRetries: 0 }), requests };
}

/** Pulls a field out of the last tool result the runner sent back. */
function lastToolResult(req: Req): Record<string, unknown> {
  const lastUser = req.messages[req.messages.length - 1];
  const block = (lastUser.content as Block[]).find((b) => b.type === "tool_result")!;
  const content = block.content;
  const text = typeof content === "string" ? content : ((content as Block[])[0].text as string);
  return JSON.parse(text);
}

describe("shopping agent", () => {
  it("searches, presents options, then pays only after the buyer agrees", async () => {
    const m = await activeMandate(handle.db);
    const money = fakeMoney();
    const gate = { db: handle.db, money: money.client, judge: fakeJudge().judge, now: () => CHECK_TIME };

    // Turn 1: search, present, recommend.
    const t1 = scripted([
      () => msg([toolUse("search_catalog", { category: "running-shoes", size: "10" })], "tool_use"),
      (req) => {
        const products = lastToolResult(req).products as { id: string }[];
        expect(products.length).toBeGreaterThan(0);
        return msg(
          [
            { type: "text", text: "I searched 3 stores. These are the closest matches in US men's 10." },
            toolUse("present_options", { productIds: ["daily-miler-blk-wht", "road-trainer-4-gray", "tempo-racer-volt"], size: "10" }),
          ],
          "tool_use",
        );
      },
      () => msg([{ type: "text", text: "Daily Miler has the lowest total and passes every term. Want me to buy it?" }], "end_turn"),
    ]);
    const items1 = await agentTurn({ gate, toolkit: null, client: t1.client, now: () => CHECK_TIME }, {
      sessionId: m.sessionId,
      mandateCode: m.code,
      text: "Find me something that fits the mandate.",
    });

    const req0 = t1.requests[0];
    expect(req0.model).toBe("claude-sonnet-5-5");
    expect(req0.fallbacks).toBe("default");
    expect(req0.tools.map((t) => t.name).sort()).toEqual(SHOPPING_TOOL_NAMES.filter((x) => x !== "get_order").sort());
    expect(req0.system.map((s) => s.text).join("\n")).toContain(m.code);
    expect(items1.map((i) => i.kind)).toEqual(["user", "agent", "options", "agent"]);
    expect(money.charges).toHaveLength(0);

    // Turn 2: the buyer agrees; the agent adds to cart and pays through the gate.
    const t2 = scripted([
      (req) => {
        // Full history is sent back: 6 earlier messages plus the new buyer message.
        expect(req.messages).toHaveLength(7);
        return msg([toolUse("add_to_cart", { productId: "daily-miler-blk-wht", size: "10", qty: 1 })], "tool_use");
      },
      (req) => msg([toolUse("pay_cart", { cartId: lastToolResult(req).cartId })], "tool_use"),
      (req) => {
        const paid = lastToolResult(req);
        expect(paid.status).toBe("paid");
        return msg([{ type: "text", text: `Paid. Order ${paid.orderCode}.` }], "end_turn");
      },
    ]);
    const items2 = await agentTurn({ gate, toolkit: null, client: t2.client, now: () => CHECK_TIME }, {
      sessionId: m.sessionId,
      mandateCode: m.code,
      text: "Yes, go with the Daily Miler.",
    });
    expect(money.charges).toHaveLength(1);
    const pay = items2.find((i) => i.kind === "payment");
    expect(pay).toMatchObject({ kind: "payment", status: "paid" });
    const [o] = await handle.db.select().from(order).where(eq(order.mandateId, m.mandateId));
    expect(o.status).toBe("captured");

    // The stored thread renders the same way after a reload.
    const reloaded = await getThread({ gate, toolkit: null }, m.sessionId, m.code);
    expect(reloaded.map((i) => i.kind)).toEqual(items2.map((i) => i.kind));
    const [row] = await handle.db.select().from(agentThread).where(eq(agentThread.mandateId, m.mandateId));
    expect((row.messages as unknown[]).length).toBe((row.times as unknown[]).length);
  });

  it("a refused payment is reported, and nothing is charged", async () => {
    const m = await activeMandate(handle.db);
    const money = fakeMoney();
    const gate = { db: handle.db, money: money.client, judge: fakeJudge().judge, now: () => CHECK_TIME };
    const s = scripted([
      () => msg([toolUse("add_to_cart", { productId: "tempo-racer-volt", size: "10", qty: 1 })], "tool_use"),
      (req) => msg([toolUse("pay_cart", { cartId: lastToolResult(req).cartId })], "tool_use"),
      (req) => {
        expect(lastToolResult(req).status).toBe("refused");
        return msg([{ type: "text", text: "I stopped before payment." }], "end_turn");
      },
    ]);
    const items = await agentTurn({ gate, toolkit: null, client: s.client, now: () => CHECK_TIME }, {
      sessionId: m.sessionId,
      mandateCode: m.code,
      text: "Buy the Tempo Racer.",
    });
    expect(money.charges).toHaveLength(0);
    const pay = items.find((i) => i.kind === "payment");
    expect(pay).toMatchObject({ status: "refused" });
    if (pay?.kind === "payment") expect(pay.failed.map((f) => f.term)).toEqual(["budget", "colors"]);
  });

  it("refuses to run for a mandate that is not active", async () => {
    const m = await activeMandate(handle.db);
    await handle.db.update(mandate).set({ status: "awaiting_link" }).where(eq(mandate.id, m.mandateId));
    const s = scripted([]);
    await expect(
      agentTurn({ gate: { db: handle.db, money: fakeMoney().client, judge: fakeJudge().judge }, toolkit: null, client: s.client }, {
        sessionId: m.sessionId,
        mandateCode: m.code,
        text: "hello",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(s.requests).toHaveLength(0);
  });

  it("stops after the iteration limit even if the model keeps calling tools", async () => {
    const m = await activeMandate(handle.db);
    const loop = Array.from({ length: 20 }, () => () => msg([toolUse("search_catalog", {})], "tool_use"));
    const s = scripted(loop);
    await agentTurn({ gate: { db: handle.db, money: fakeMoney().client, judge: fakeJudge().judge }, toolkit: null, client: s.client }, {
      sessionId: m.sessionId,
      mandateCode: m.code,
      text: "search forever",
    });
    expect(s.requests.length).toBeLessThanOrEqual(8);
    // Open tool calls were closed, so the next turn sends a valid history.
    const [row] = await handle.db.select().from(agentThread).where(eq(agentThread.mandateId, m.mandateId));
    const msgs = row.messages as { role: string; content: Block[] }[];
    const last = msgs[msgs.length - 1];
    expect(last.role).toBe("user");
    expect(last.content.every((b) => b.type === "tool_result")).toBe(true);
  });
});
