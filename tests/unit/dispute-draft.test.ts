/**
 * Grounded dispute drafts (FR-029, SC-006): every sentence rests on included evidence items, numbers
 * and identifiers must come from those items, missing records are stated as missing, and an excluded
 * item is never cited.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMerchantDrafter } from "@/lib/agents/merchant";
import type { TermResult } from "@/lib/check/run";
import { buildItems, type DisputeRecords } from "@/lib/disputes/assemble";
import { composeResponse, draftInput, groundSentences, templateDraft } from "@/lib/disputes/draft";
import { fingerprint } from "@/lib/mandate/canonical";
import { testDb } from "../helpers/db";
import { CANVAS_TERMS, CHECK_TIME } from "../helpers/fixtures";

const fp = fingerprint("MDT4K7Q21", 1, CANVAS_TERMS);
const TERMS: TermResult[] = ["Budget", "Category", "Size", "Colors", "Merchant", "Expiration", "Purchases"].map((label) => ({
  term: label.toLowerCase(),
  label,
  group: "term",
  kind: "rule",
  allowed: "",
  actual: label === "Budget" ? "$103.92 total" : "ok",
  pass: true,
  explanation: "",
}));

function records(over: Partial<DisputeRecords> = {}): DisputeRecords {
  return {
    dispute: {
      id: "d1",
      paypalDisputeId: "PP-D8K41Q",
      reason: "UNAUTHORISED",
      status: "WAITING_FOR_SELLER_RESPONSE",
      amountCents: 10392,
      openedAt: new Date("2026-11-03T15:20:00Z"),
      sellerResponseDue: new Date("2026-11-13T15:20:00Z"),
    },
    order: {
      id: "o1",
      code: "104821",
      item: "Daily Miler, black and white, US men's 10",
      storeName: "Sample Sports Outlet",
      amountCents: 10392,
      paypalOrderId: "8XK2PP41QD",
      paypalCaptureId: "CAP8XK241QD",
      customId: `MDT4K7Q21:1:${fp.sha256}`,
      paidAt: new Date("2026-10-19T13:15:00Z"),
      tracking: { carrier: "UPS", number: "1Z999AA10123456784" },
      shippingStatus: "delivered",
    },
    mandate: {
      code: "MDT4K7Q21",
      versionId: "v1",
      versionNo: 1,
      signedAt: new Date("2026-10-19T13:02:00Z"),
      sha256: fp.sha256,
      canonical: fp.canonical,
      terms: CANVAS_TERMS,
    },
    check: { id: "c1", at: CHECK_TIME, terms: TERMS },
    ...over,
  };
}

const sentencesOf = (text: string) => text.split(/(?<=\.)\s+/).filter(Boolean);

describe("evidence items", () => {
  it("lists only records we hold, each with its source", () => {
    const { items, missing } = buildItems(records());
    expect(items.map((i) => i.key)).toEqual(["mandate", "check", "transaction", "shipment"]);
    expect(items.every((i) => i.included && i.source.id && i.facts.length > 0)).toBe(true);
    expect(missing).toEqual([]);
    expect(items[0].meta).toContain("MDT4K7Q21");
    expect(items[1].meta).toContain("7 of 7 terms passed");
  });

  it("states missing tracking as missing", () => {
    const r = records();
    const { items, missing } = buildItems({ ...r, order: { ...r.order!, tracking: null, shippingStatus: "unfulfilled" } });
    expect(items.map((i) => i.key)).not.toContain("shipment");
    expect(missing.join(" ")).toMatch(/No shipment tracking is on file/);
  });
});

describe("template draft", () => {
  it("cites included items only and every sentence passes the grounding check", () => {
    const input = draftInput(records());
    const sentences = templateDraft(input);
    expect(sentences.length).toBeGreaterThanOrEqual(4);
    const { kept, rejected } = groundSentences(input, sentences);
    expect(rejected).toEqual([]);
    expect(kept).toHaveLength(sentences.length);
    const text = composeResponse(sentences, input.items);
    expect(text).toContain("MDT4K7Q21");
    expect(text).toContain("$103.92");
    expect(text).toContain("7 of 7");
    expect(text).toContain("1Z999AA10123456784");
    expect(text).not.toMatch(/[–—]/);
  });

  it("says no mandate is attached and invents nothing when the order has no mandate", () => {
    const input = draftInput(records({ order: null, mandate: null, check: null }));
    expect(input.items).toEqual([]);
    const text = composeResponse(templateDraft(input), input.items);
    expect(text).toMatch(/No signed mandate is attached to this order in our records\./);
    expect(text).not.toMatch(/MDT|SHA256|passed|delivered|tracking 1Z/);
  });

  it("drops sentences that rest on an excluded item and leaves it out of the closing", () => {
    const input = draftInput(records());
    const sentences = templateDraft(input);
    const items = input.items.map((i) => (i.key === "mandate" ? { ...i, included: false } : i));
    const text = composeResponse(sentences, items);
    expect(text).not.toContain("MDT4K7Q21");
    expect(text).not.toContain(fp.sha256.slice(0, 8));
    expect(text).not.toMatch(/signed mandate record/i);
    expect(text).toContain("7 of 7");
  });

  it("writes no response when every item is excluded and nothing is missing", () => {
    const input = draftInput(records());
    const none = input.items.map((i) => ({ ...i, included: false }));
    expect(composeResponse(templateDraft(input), none)).toBe("");
  });
});

describe("grounding check", () => {
  const input = draftInput(records());
  it("rejects sentences without items, with unknown or excluded items, or with numbers and ids not in the cited facts", () => {
    const excluded = { ...input, items: input.items.map((i) => (i.key === "shipment" ? { ...i, included: false } : i)) };
    const { kept, rejected } = groundSentences(excluded, [
      { text: "The buyer signed mandate MDT4K7Q21 before the purchase.", items: ["mandate"] },
      { text: "The buyer is a loyal customer.", items: [] },
      { text: "The buyer agreed by email.", items: ["email"] },
      { text: "The parcel shipped with UPS, tracking 1Z999AA10123456784.", items: ["shipment"] },
      { text: "The total of $250.00 was captured.", items: ["transaction"] },
      { text: "The buyer signed mandate MDTZZZZZZ.", items: ["mandate"] },
      { text: "The total of $103.92 was captured through PayPal.", items: ["transaction"] },
    ]);
    expect(kept.map((s) => s.text)).toEqual(["The buyer signed mandate MDT4K7Q21 before the purchase.", "The total of $103.92 was captured through PayPal."]);
    expect(rejected.map((r) => r.why)).toEqual(["no_items", "unknown_item", "excluded_item", "ungrounded_value", "ungrounded_value"]);
  });
});

describe("merchant drafter (Claude, structured output)", () => {
  let handle: Awaited<ReturnType<typeof testDb>>;
  beforeAll(async () => {
    handle = await testDb();
  });
  afterAll(async () => {
    await handle.close();
  });

  function fakeClient(reply: () => unknown) {
    const prompts: string[] = [];
    const client = {
      beta: {
        messages: {
          parse: async (req: { messages: { content: string }[] }) => {
            prompts.push(req.messages[0].content);
            return reply();
          },
        },
      },
    } as unknown as Anthropic;
    return { client, prompts };
  }

  it("keeps grounded sentences from the model and drops the rest", async () => {
    const f = fakeClient(() => ({
      stop_reason: "end_turn",
      parsed_output: {
        sentences: [
          { text: "The buyer authorized this purchase in advance through signed mandate MDT4K7Q21.", items: ["mandate"] },
          { text: "Before payment the order passed 7 of 7 mandate terms.", items: ["check"] },
          { text: "The buyer has a history of fraud.", items: [] },
          { text: "The total of $103.92 was captured through PayPal.", items: ["transaction"] },
        ],
      },
    }));
    const draft = await createMerchantDrafter(handle.db, { client: f.client })(draftInput(records()));
    expect(draft.by).toBe("model");
    expect(draft.sentences.map((s) => s.text)).not.toContain("The buyer has a history of fraud.");
    expect(draft.sentences).toHaveLength(3);
    // The model only sees stored facts.
    expect(f.prompts[0]).toContain("MDT4K7Q21");
    expect(f.prompts[0]).toContain("UNAUTHORISED");
  });

  it("falls back to the template when the model refuses or grounds too little", async () => {
    const refusal = fakeClient(() => ({ stop_reason: "refusal", parsed_output: null }));
    const a = await createMerchantDrafter(handle.db, { client: refusal.client })(draftInput(records()));
    expect(a.by).toBe("template");
    expect(sentencesOf(composeResponse(a.sentences, draftInput(records()).items)).length).toBeGreaterThanOrEqual(4);

    const thin = fakeClient(() => ({ stop_reason: "end_turn", parsed_output: { sentences: [{ text: "Paid $999.00.", items: ["transaction"] }] } }));
    const b = await createMerchantDrafter(handle.db, { client: thin.client })(draftInput(records()));
    expect(b.by).toBe("template");
  });
});
