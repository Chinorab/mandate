/**
 * Landing copy (FR-035, constitution V). Every claim names the source it comes from; wording follows
 * what each source says, opinions are attributed as opinions, and the one statistic is quoted with who
 * measured it. Checked against the four pages on 2026-10-24 (tests/unit/landing-sources.test.ts).
 */
import { fingerprint } from "@/lib/mandate/canonical";
import type { Terms } from "@/lib/mandate/terms";

export type SourceId = "mcc" | "cfLiability" | "cfEvidence" | "americanBanker";

export type Source = { publisher: string; title: string; date: string; url: string };

export const SOURCES: Record<SourceId, Source> = {
  mcc: {
    publisher: "Merchant Cost Consulting",
    title: "Agentic Commerce Chargeback Liability Explained",
    date: "2026-10-10",
    url: "https://merchantcostconsulting.com/?p=9509",
  },
  cfLiability: {
    publisher: "Chargeflow",
    title: "AI Agent Chargeback Liability: Who Pays When Agentic Commerce Goes Wrong",
    date: "2026-07-07",
    url: "https://www.chargeflow.io/blog/ai-agent-chargeback-liability",
  },
  cfEvidence: {
    publisher: "Chargeflow",
    title: "Agentic Commerce Chargebacks: The Evidence Playbook Merchants Need",
    date: "2026-07-19",
    url: "https://www.chargeflow.io/blog/agentic-commerce-chargebacks-the-evidence-playbook-merchants-need",
  },
  americanBanker: {
    publisher: "American Banker",
    title: "New York's top financial regulator zeroing in on agentic commerce",
    date: "2026-06-26",
    url: "https://www.americanbanker.com/payments/news/new-york-financial-regulator-zeroing-in-on-agentic-commerce",
  },
};

export type Claim = { title: string; text: string; source: SourceId };

export const CLAIMS: Claim[] = [
  {
    title: "No rule says who pays",
    text: "There is still no concrete chargeback liability rule for purchases made by AI agents. When a buyer says the agent bought something it was not allowed to, card network and federal rules give no clean answer.",
    source: "mcc",
  },
  {
    title: "The merchant carries the loss",
    text: "A disputed agent purchase generally follows card not present rules, so the merchant bears the loss unless it wins the dispute.",
    source: "cfLiability",
  },
  {
    title: "Close calls favor the cardholder",
    text: "The author expects the cardholder to win gray area disputes, and notes that with an agent, the buyer may never have touched the merchant's site at all.",
    source: "mcc",
  },
  {
    title: "Keep what the customer authorized",
    text: "The playbook tells merchants to keep, for each agent order, the customer's mandate: what was authorized, including the price cap, the merchants allowed and the expiry.",
    source: "cfEvidence",
  },
];

export const COST_STAT = {
  from: "$36.9 billion",
  fromYear: 2026,
  to: "$46.1 billion",
  toYear: 2029,
  measuredBy: "Mastercard research by Datos Insights",
  caption: "Projected global cost of chargebacks to merchants. No public source reports a dispute rate for agent orders yet.",
  source: "cfLiability" as SourceId,
};

export const NYDFS_QUOTE = {
  lead: "On agents, New York's acting Superintendent of Financial Services says the department has been very focused on one question:",
  text: "where does liability sit?",
  source: "americanBanker" as SourceId,
};

const EXAMPLE_TERMS: Terms = {
  budgetCents: 12000,
  currency: "USD",
  category: "running-shoes",
  required: { size: { system: "US_MENS", value: "10" }, colors: ["beige", "black", "gray", "white"] },
  forbidden: {},
  semantic: [],
  merchants: "ANY_LISTED",
  expiresAt: "2026-10-26T03:59:00.000Z",
  maxPurchases: 1,
};

/** The canvas example, with the fingerprint its canonical record really has. */
export const EXAMPLE = {
  code: "MDT4K7Q21",
  instructions: "Buy running shoes, size 10, under $120, neutral colors, this week only.",
  terms: EXAMPLE_TERMS,
  signedAt: "2026-10-19T13:02:00.000Z",
  sha256: fingerprint("MDT4K7Q21", 1, EXAMPLE_TERMS).sha256,
};

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "Merchant Cost Consulting, Oct 10, 2026" */
export function sourceLabel(id: SourceId): string {
  const s = SOURCES[id];
  return `${s.publisher}, ${DAY.format(new Date(`${s.date}T12:00:00Z`))}`;
}
