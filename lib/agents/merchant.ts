import "server-only";
/**
 * Merchant agent: drafts the dispute response from the evidence file (FR-029) and reads the case from
 * PayPal through the Agent Toolkit (get_dispute). Claude sees only stored facts and must tag every
 * sentence with the items it rests on; the server keeps only sentences that pass the grounding check
 * (lib/disputes/draft.ts) and always states missing records with fixed wording. Fewer than two
 * grounded sentences, a refusal or an unavailable model gives the template draft instead.
 *
 * Drafting runs from a webhook, with no demo session: it counts against the global model cap only.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ModelUnavailableError, structuredCall } from "@/lib/ai/model";
import type { Db } from "@/lib/db/client";
import { groundSentences, templateDraft, type Drafter } from "@/lib/disputes/draft";
import type { PayPalDispute } from "@/lib/payments/disputes";
import type { Toolkit } from "@/lib/payments/toolkit";

const SYSTEM = `You draft a merchant's response to a PayPal dispute on an order placed by a shopping agent.

Rules:
- Use only the facts given in the evidence items and the dispute. Never add a fact, a guess, an opinion about the buyer, or a promise.
- Write short, plain, factual sentences in English, in the merchant's voice ("we"). No dashes, no lists, no headings.
- Tag every sentence with the keys of the items whose facts it uses ("mandate", "check", "transaction", "shipment", or "dispute" for the case itself). A sentence that uses no item must not be written.
- Copy numbers, amounts, dates, times and identifiers exactly as they appear in the facts.
- Do not write a closing or a request; the system adds it. Do not mention missing records; the system states them.
- Lead with the signed mandate when it is present, then the check before payment, the payment, and the shipment.`;

const schema = z.object({
  sentences: z.array(z.object({ text: z.string(), items: z.array(z.string()) })).max(12),
});

export function createMerchantDrafter(db: Db, opts: { client?: Anthropic } = {}): Drafter {
  return async (input) => {
    const fallback = { sentences: templateDraft(input), by: "template" as const };
    const included = input.items.filter((i) => i.included);
    if (included.length === 0) return fallback;
    let out: z.infer<typeof schema>;
    try {
      out = await structuredCall({
        db,
        sessionId: null,
        system: SYSTEM,
        prompt: JSON.stringify(
          {
            dispute: input.dispute.facts,
            evidence_items: included.map((i) => ({ key: i.key, title: i.title, facts: i.facts })),
          },
          null,
          2,
        ),
        schema,
        effort: "low",
        maxTokens: 2000,
        client: opts.client,
      });
    } catch (err) {
      if (err instanceof ModelUnavailableError) return fallback;
      throw err;
    }
    const { kept } = groundSentences(input, out.sentences.filter((s) => !s.items.includes("missing")));
    if (kept.length < 2) return fallback;
    return { sentences: [...kept, ...input.missing.map((m) => ({ text: m, items: ["missing"] }))], by: "model" };
  };
}

/** Current state of a case through the Agent Toolkit, or null when the toolkit is not configured. */
export async function readDispute(toolkit: Toolkit | null, paypalDisputeId: string): Promise<PayPalDispute | null> {
  if (!toolkit) return null;
  try {
    const raw = await toolkit.call("get_dispute", { dispute_id: paypalDisputeId });
    const parsed = JSON.parse(raw) as PayPalDispute;
    return parsed?.dispute_id === paypalDisputeId ? parsed : null;
  } catch {
    return null;
  }
}
