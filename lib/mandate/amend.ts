/**
 * Amendment proposals (FR-019): the smallest change to the signed terms that would let a blocked cart
 * pass. Pure. The proposal is computed on the server and bound to the current fingerprint through
 * proposalHash, so the browser can only confirm it, never edit it.
 */
import { COLOR_LABELS, STORES, type ColorId } from "@/lib/catalog/data";
import { SIZE_SYSTEM_LABELS, categoryLabel, colorName } from "@/lib/check/explain";
import type { CheckLine, CheckOutcome } from "@/lib/check/run";
import { formatUsd } from "@/lib/pricing";
import { endOfDayEt, etParts } from "@/lib/time/et";
import { canonicalize, sha256Hex } from "./canonical";
import { normalizeTerms, type Terms } from "./terms";

export type Change = { term: string; label: string; from: string; to: string };
export type Proposal = { changes: Change[]; terms: Terms; proposalHash: string };
export type ProposalResult = { amendable: true; proposal: Proposal } | { amendable: false; reason: string };

const BUDGET_STEP = 1000; // $10

const storeName = (id: string) => STORES.find((s) => s.id === id)?.name ?? id;
const colorLabel = (c: ColorId) => COLOR_LABELS[c] ?? c;

export function proposalHashFor(baseSha256: string, terms: Terms): string {
  return sha256Hex(canonicalize({ base: baseSha256, terms: normalizeTerms(terms) }));
}

export function proposeAmendment(input: {
  terms: Terms;
  baseSha256: string;
  outcome: CheckOutcome;
  lines: CheckLine[];
  store: { id: string; name: string };
  spentCents: number;
  capturedCount: number;
  now: Date;
}): ProposalResult {
  const failed = input.outcome.terms.filter((t) => !t.pass);
  if (failed.length === 0) return { amendable: false, reason: "The cart already passes every term." };

  const safeguard = failed.find((t) => t.group === "safeguard");
  if (safeguard) {
    return {
      amendable: false,
      reason:
        safeguard.term === "integrity"
          ? "The signed record does not match its fingerprint, so it cannot be changed."
          : safeguard.term === "currency"
            ? "Prices in another currency cannot be allowed."
            : safeguard.explanation,
    };
  }

  const t: Terms = structuredClone(input.terms);
  const changes: Change[] = [];

  for (const f of failed) {
    switch (f.term) {
      case "budget": {
        const needed = input.spentCents + input.outcome.totals.totalCents;
        const next = Math.ceil(needed / BUDGET_STEP) * BUDGET_STEP;
        changes.push({ term: "budget", label: "Budget", from: formatUsd(t.budgetCents), to: formatUsd(next) });
        t.budgetCents = next;
        break;
      }
      case "colors": {
        const colors = [...new Set(input.lines.flatMap((l) => l.product.attributes.colors))];
        const unforbid = colors.filter((c) => t.forbidden.colors?.includes(c));
        const allowNew = t.required.colors ? colors.filter((c) => !t.required.colors!.includes(c)) : [];
        if (unforbid.length) {
          changes.push({
            term: "colors",
            label: "Colors",
            from: `Excludes ${unforbid.map((c) => colorName(c)).join(", ")}`,
            to: `Allows ${unforbid.map((c) => colorName(c)).join(", ")}`,
          });
          const rest = (t.forbidden.colors ?? []).filter((c) => !unforbid.includes(c));
          if (rest.length) t.forbidden.colors = rest;
          else delete t.forbidden.colors;
        }
        if (allowNew.length) {
          changes.push({
            term: "colors",
            label: "Colors",
            from: `${t.required.colors!.length} ${t.required.colors!.length === 1 ? "color" : "colors"}`,
            to: `Adds ${allowNew.map((c, i) => (i === 0 ? colorLabel(c) : colorName(c))).join(", ")}`,
          });
          t.required.colors = [...t.required.colors!, ...allowNew].sort();
        }
        break;
      }
      case "size": {
        const l = input.lines.find((x) => x.size && x.product.attributes.sizeSystem);
        if (!l || !l.size || !l.product.attributes.sizeSystem) return { amendable: false, reason: "Choose a size for the item first." };
        const next = { system: l.product.attributes.sizeSystem, value: l.size };
        const from = t.required.size ? `${SIZE_SYSTEM_LABELS[t.required.size.system]} ${t.required.size.value}` : "Any size";
        changes.push({ term: "size", label: "Size", from, to: `${SIZE_SYSTEM_LABELS[next.system]} ${next.value}` });
        t.required.size = next;
        break;
      }
      case "category": {
        const l = input.lines.find((x) => x.product.category !== t.category)!;
        changes.push({ term: "category", label: "Category", from: categoryLabel(t.category), to: categoryLabel(l.product.category) });
        t.category = l.product.category as Terms["category"];
        break;
      }
      case "merchant": {
        if (input.lines.some((l) => l.product.storeId !== input.store.id)) {
          return { amendable: false, reason: "This cart mixes stores. Ask your agent to rebuild it." };
        }
        if (t.merchants !== "ANY_LISTED") {
          changes.push({
            term: "merchant",
            label: "Merchant",
            from: `${t.merchants.length} chosen ${t.merchants.length === 1 ? "store" : "stores"}`,
            to: `Adds ${storeName(input.store.id)}`,
          });
          t.merchants = [...t.merchants, input.store.id as (typeof t.merchants)[number]].sort();
        }
        break;
      }
      case "brands": {
        const brands = input.lines.map((l) => l.product.attributes.brand);
        const hit = (t.forbidden.brands ?? []).filter((b) => brands.some((x) => x.toLowerCase() === b.toLowerCase()));
        changes.push({ term: "brands", label: "Brands", from: `Excludes ${hit.join(", ")}`, to: `Allows ${hit.join(", ")}` });
        const rest = (t.forbidden.brands ?? []).filter((b) => !hit.includes(b));
        if (rest.length) t.forbidden.brands = rest;
        else delete t.forbidden.brands;
        break;
      }
      case "purchases": {
        const next = input.capturedCount + 1;
        const fmt = (n: number) => (n === 1 ? "1 order" : `${n} orders`);
        changes.push({ term: "purchases", label: "Orders", from: fmt(t.maxPurchases), to: fmt(next) });
        t.maxPurchases = next;
        break;
      }
      case "expiration": {
        const today = etParts(input.now);
        const tomorrow = new Date(Date.UTC(today.y, today.m - 1, today.d + 1));
        const next = endOfDayEt(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate());
        changes.push({ term: "expiration", label: "Expiration", from: "Expired", to: "Until tomorrow, 11:59 PM ET" });
        t.expiresAt = next.toISOString();
        break;
      }
      default: {
        if (f.term.startsWith("semantic:")) {
          const id = f.term.slice("semantic:".length);
          const pref = t.semantic.find((s) => s.id === id);
          if (pref) {
            changes.push({ term: f.term, label: pref.label, from: pref.text, to: "Removed" });
            t.semantic = t.semantic.filter((s) => s.id !== id);
          }
        } else {
          return { amendable: false, reason: f.explanation };
        }
      }
    }
  }

  const terms = normalizeTerms(t);
  return { amendable: true, proposal: { changes, terms, proposalHash: proposalHashFor(input.baseSha256, terms) } };
}
