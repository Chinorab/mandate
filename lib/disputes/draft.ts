/**
 * Factual dispute response (FR-029, SC-006). A draft is a list of sentences, each tagged with the
 * evidence items it rests on. The grounding check runs on the server for every draft, whoever wrote it:
 * a sentence needs at least one known, included item, and every number or identifier it contains must
 * appear in the facts of the items it cites. Missing records are stated with fixed wording.
 *
 * The template drafter writes the same kind of response without a model; it is the fallback when the
 * model is unavailable, refuses, or grounds too little.
 */
import { formatUsd } from "@/lib/pricing";
import { longEt } from "./format";
import { buildItems, disputeFacts, type DisputeRecords, type EvidenceItem } from "./items";

/** Keys a sentence may cite: evidence items, plus the dispute itself and the missing list. */
export type DraftSentence = { text: string; items: string[] };

export type DraftInput = {
  dispute: { facts: string[] };
  items: EvidenceItem[];
  missing: string[];
};

export type Draft = { sentences: DraftSentence[]; by: "model" | "template" };
export type Drafter = (input: DraftInput & { records?: DisputeRecords }) => Promise<Draft>;

export function draftInput(r: DisputeRecords): DraftInput & { records: DisputeRecords } {
  const { items, missing } = buildItems(r);
  return { dispute: { facts: disputeFacts(r.dispute) }, items, missing, records: r };
}

const CONTEXT_KEYS = new Set(["dispute", "missing"]);

export function templateDraft(input: DraftInput & { records?: DisputeRecords }): DraftSentence[] {
  const r = input.records;
  const out: DraftSentence[] = [];
  const has = (k: string) => input.items.some((i) => i.key === k);
  if (r?.mandate && has("mandate")) {
    const m = r.mandate;
    const terms = input.items.find((i) => i.key === "mandate")!.facts[1].replace(/^Mandate terms: /, "").replace(/\.$/, "");
    out.push({ text: `The buyer authorized this purchase in advance through signed mandate ${m.code}, version ${m.versionNo}, on ${longEt(m.signedAt)}.`, items: ["mandate"] });
    out.push({ text: `The mandate allowed ${terms}.`, items: ["mandate"] });
  }
  if (r?.check && has("check")) {
    const rows = r.check.terms.filter((t) => t.group === "term");
    const passed = rows.filter((t) => t.pass).length;
    out.push({
      text: `Before payment, the order was checked against every term of the mandate and passed ${passed} of ${rows.length}, on ${longEt(r.check.at)}.`,
      items: ["check"],
    });
  }
  if (r?.order && has("transaction")) {
    const o = r.order;
    out.push({
      text: `The total of ${formatUsd(o.amountCents)} was captured through PayPal on ${longEt(o.paidAt)}${o.paypalOrderId ? `, PayPal order ${o.paypalOrderId}` : ""}.`,
      items: ["transaction"],
    });
    if (has("mandate")) out.push({ text: `The PayPal order carries the mandate reference ${o.customId} in its custom_id field.`, items: ["transaction", "mandate"] });
  }
  if (r?.order?.tracking && has("shipment")) {
    const t = r.order.tracking;
    const delivered = r.order.shippingStatus === "delivered";
    out.push({ text: `The item shipped with ${t.carrier}, tracking ${t.number}${delivered ? ", and is marked delivered in our order records" : ""}.`, items: ["shipment"] });
  }
  for (const m of input.missing) out.push({ text: m, items: ["missing"] });
  return out;
}

export const templateDrafter: Drafter = async (input) => ({ sentences: templateDraft(input), by: "template" });

// Numbers ("$103.92", "9:14", "2026"), upper case identifiers with a letter ("MDT4K7Q21", "SHA256",
// "1Z999AA10123456784") and long lower case hex (fingerprints).
const NUMBER = /\$?\d+(?:[.,:]\d+)*/g;
const IDENT = /\b(?=[A-Z0-9-]*[A-Z])[A-Z0-9][A-Z0-9-]{5,}\b/g;
const HEX = /\b[0-9a-f]{12,}\b/g;

export type Rejection = { sentence: DraftSentence; why: "no_items" | "unknown_item" | "excluded_item" | "ungrounded_value" | "style" };

export function groundSentences(input: DraftInput, sentences: DraftSentence[]): { kept: DraftSentence[]; rejected: Rejection[] } {
  const byKey = new Map(input.items.map((i) => [i.key as string, i]));
  const kept: DraftSentence[] = [];
  const rejected: Rejection[] = [];
  for (const s of sentences) {
    const reject = (why: Rejection["why"]) => rejected.push({ sentence: s, why });
    if (s.items.length === 0) {
      reject("no_items");
      continue;
    }
    if (s.items.some((k) => !byKey.has(k) && !CONTEXT_KEYS.has(k))) {
      reject("unknown_item");
      continue;
    }
    if (s.items.some((k) => byKey.has(k) && !byKey.get(k)!.included)) {
      reject("excluded_item");
      continue;
    }
    if (/[–—]/.test(s.text) || !s.text.trim()) {
      reject("style");
      continue;
    }
    const facts = s.items
      .flatMap((k) => (k === "dispute" ? input.dispute.facts : k === "missing" ? input.missing : byKey.get(k)!.facts))
      .join(" ");
    const values = [...(s.text.match(NUMBER) ?? []), ...(s.text.match(IDENT) ?? []), ...(s.text.match(HEX) ?? [])];
    if (values.some((v) => !facts.includes(v))) {
      reject("ungrounded_value");
      continue;
    }
    kept.push(s);
  }
  return { kept, rejected };
}

function list(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/**
 * The response sent with the evidence: the drafted sentences that rest only on included items, the
 * missing records, and a closing that names the included items. Empty when nothing is included and
 * nothing is missing.
 */
export function composeResponse(sentences: DraftSentence[], items: EvidenceItem[]): string {
  const included = new Set(items.filter((i) => i.included).map((i) => i.key as string));
  const known = new Set(items.map((i) => i.key as string));
  const usable = sentences.filter((s) => s.items.every((k) => CONTEXT_KEYS.has(k) || (known.has(k) && included.has(k))));
  const facts = usable.filter((s) => !s.items.includes("missing"));
  const missing = usable.filter((s) => s.items.includes("missing"));
  const paragraphs: string[] = [];
  const opening = facts.filter((s) => s.items[0] === "mandate");
  const rest = facts.filter((s) => s.items[0] !== "mandate");
  if (opening.length) paragraphs.push(opening.map((s) => s.text).join(" "));
  if (rest.length) paragraphs.push(rest.map((s) => s.text).join(" "));
  if (missing.length) paragraphs.push(missing.map((s) => s.text).join(" "));
  // Lower case the first word unless it is a name ("PayPal transaction record").
  const titles = items.filter((i) => i.included).map((i) => `the ${/^[A-Z][a-z]+[A-Z]/.test(i.title) ? i.title : i.title.charAt(0).toLowerCase() + i.title.slice(1)}`);
  if (titles.length) paragraphs.push(`The attached records show ${list(titles)}. We ask that this dispute be closed in the seller's favor.`);
  return paragraphs.join("\n\n");
}
