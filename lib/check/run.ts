/**
 * The Mandate check (contracts/consent-gate.md). Pure and deterministic: same input, same output.
 *
 * - Every rule term is decided here by code. The model only supplies `semantic` verdicts, and a
 *   semantic verdict can only fail a cart: missing, unavailable or negative verdicts fail.
 * - Every row is always produced (no short circuit), so the buyer sees the whole picture.
 * - Totals are computed from catalog rows, never taken from the request or the model.
 */
import type { ColorId, ProductAttributes, SizeSystem } from "@/lib/catalog/data";
import { verifyFingerprint } from "@/lib/mandate/canonical";
import { termsSchema, type Terms } from "@/lib/mandate/terms";
import { computeTotals, formatUsd, type StorePricing, type Totals } from "@/lib/pricing";
import {
  SIZE_SYSTEM_LABELS,
  budgetText,
  capitalize,
  categoryLabel,
  colorName,
  formatEt,
  orList,
  purchasesUsedText,
  timeLeft,
} from "./explain";

export type MandateStatus = "draft" | "awaiting_link" | "active" | "expired" | "revoked";

export type CheckLine = {
  product: {
    id: string;
    storeId: string;
    name: string;
    category: string;
    currency: string;
    priceCents: number;
    attributes: ProductAttributes;
    description?: string;
  };
  size: string | null;
  qty: number;
};

export type SemanticVerdict = { status: "pass" | "fail" | "unavailable"; reason: string };

export type CheckInput = {
  mandate: { code: string; status: MandateStatus; revokedAt: Date | null; flaggedAt: Date | null };
  version: { versionNo: number; terms: unknown; canonical: string; sha256: string; isCurrent: boolean };
  store: StorePricing & { id: string; name: string };
  lines: CheckLine[];
  spentCents: number;
  capturedCount: number;
  semantic: Record<string, SemanticVerdict | undefined>;
  now: Date;
};

export type TermResult = {
  term: string;
  label: string;
  group: "term" | "safeguard";
  kind: "rule" | "semantic";
  allowed: string;
  actual: string;
  pass: boolean;
  explanation: string;
};

export type CheckOutcome = {
  verdict: "pass" | "fail";
  terms: TermResult[];
  totals: Totals & { remainingBudgetCents: number };
  hashVerified: boolean;
  summary: { passed: number; total: number };
};

const rule = (r: Omit<TermResult, "kind" | "group">, group: TermResult["group"] = "term"): TermResult => ({
  ...r,
  kind: "rule",
  group,
});

export function runMandateCheck(input: CheckInput): CheckOutcome {
  const parsed = termsSchema.safeParse(input.version.terms);
  const terms: Terms | null = parsed.success ? parsed.data : null;

  let hashVerified = false;
  if (terms) {
    try {
      hashVerified = verifyFingerprint({
        code: input.mandate.code,
        versionNo: input.version.versionNo,
        terms,
        canonical: input.version.canonical,
        sha256: input.version.sha256,
      });
    } catch {
      hashVerified = false;
    }
  }

  const totals = computeTotals(
    input.lines.map((l) => ({ priceCents: l.product.priceCents, qty: l.qty })),
    input.store,
  );
  const budgetCents = terms?.budgetCents ?? 0;
  const remainingBudgetCents = budgetCents - input.spentCents;

  const rows: TermResult[] = [
    integrityRow(input, hashVerified),
    statusRow(input),
    currencyRow(input, terms),
  ];

  if (!terms) {
    rows.push(
      rule({
        term: "terms",
        label: "Terms",
        allowed: "Signed terms",
        actual: "Unreadable",
        pass: false,
        explanation: "The signed terms could not be read, so nothing can be paid.",
      }),
    );
  } else {
    rows.push(budgetRow(terms, input.spentCents, remainingBudgetCents, totals.totalCents));
    rows.push(categoryRow(terms, input.lines));
    if (terms.required.size) rows.push(sizeRow(terms.required.size, input.lines));
    rows.push(colorsRow(terms, input.lines));
    if (terms.forbidden.brands?.length) rows.push(brandsRow(terms.forbidden.brands, input.lines));
    rows.push(merchantRow(terms, input.store, input.lines));
    rows.push(expirationRow(terms, input.now));
    rows.push(purchasesRow(terms, input.capturedCount));
    for (const s of terms.semantic) rows.push(semanticRow(s, input.semantic[s.id]));
  }

  const termRows = rows.filter((r) => r.group === "term");
  const passed = termRows.filter((r) => r.pass).length;
  return {
    verdict: rows.every((r) => r.pass) ? "pass" : "fail",
    terms: rows,
    totals: { ...totals, remainingBudgetCents },
    hashVerified,
    summary: { passed, total: termRows.length },
  };
}

function integrityRow(input: CheckInput, ok: boolean): TermResult {
  const short = `${input.version.sha256.slice(0, 4)}…${input.version.sha256.slice(-4)}`;
  return rule(
    {
      term: "integrity",
      label: "Signed record",
      allowed: `Fingerprint ${short}`,
      actual: ok ? "Matches the signed terms" : "Does not match",
      pass: ok,
      explanation: ok
        ? "The terms are exactly the ones you signed."
        : "The signed record does not match its fingerprint, so nothing can be paid.",
    },
    "safeguard",
  );
}

function statusRow(input: CheckInput): TermResult {
  const m = input.mandate;
  let problem: string | null = null;
  if (m.flaggedAt) problem = "This mandate was flagged because its record changed.";
  else if (m.revokedAt || m.status === "revoked") problem = "This mandate was revoked.";
  else if (m.status === "expired") problem = "This mandate has expired.";
  else if (m.status === "draft") problem = "This mandate is not signed yet.";
  else if (m.status === "awaiting_link") problem = "PayPal is not linked to this mandate yet.";
  else if (!input.version.isCurrent) problem = "The mandate changed since this cart was built. Check the cart again.";
  return rule(
    {
      term: "status",
      label: "Mandate status",
      allowed: "Active, current version",
      actual: problem ? "Not usable" : `Active, version ${input.version.versionNo}`,
      pass: problem === null,
      explanation: problem ?? "The mandate is active and this is its current version.",
    },
    "safeguard",
  );
}

function currencyRow(input: CheckInput, terms: Terms | null): TermResult {
  const want = terms?.currency ?? "USD";
  const others = [...new Set(input.lines.map((l) => l.product.currency).filter((c) => c !== want))];
  return rule(
    {
      term: "currency",
      label: "Currency",
      allowed: want,
      actual: others.length ? others.join(", ") : want,
      pass: others.length === 0,
      explanation: others.length ? `Prices in ${others.join(", ")} are not allowed. Nothing is converted.` : "Same currency",
    },
    "safeguard",
  );
}

function budgetRow(terms: Terms, spent: number, remaining: number, total: number): TermResult {
  const pass = total <= remaining;
  return rule({
    term: "budget",
    label: "Budget",
    allowed: budgetText.allowed(terms.budgetCents, remaining, spent),
    actual: `${formatUsd(total)} total`,
    pass,
    explanation: pass ? budgetText.pass(remaining, total) : budgetText.fail(terms.budgetCents, remaining, spent, total),
  });
}

function categoryRow(terms: Terms, lines: CheckLine[]): TermResult {
  const wrong = lines.filter((l) => l.product.category !== terms.category);
  const want = categoryLabel(terms.category);
  return rule({
    term: "category",
    label: "Category",
    allowed: want,
    actual: [...new Set(lines.map((l) => categoryLabel(l.product.category)))].join(", "),
    pass: wrong.length === 0,
    explanation: wrong.length
      ? `${wrong[0].product.name} is listed under ${categoryLabel(wrong[0].product.category)}, not ${want}.`
      : `Store lists it under ${want.toLowerCase()}`,
  });
}

function sizeRow(want: { system: SizeSystem; value: string }, lines: CheckLine[]): TermResult {
  const wantLabel = `${SIZE_SYSTEM_LABELS[want.system]} ${want.value}`;
  let problem: string | null = null;
  for (const l of lines) {
    const a = l.product.attributes;
    if (!l.size) problem = `No size was chosen for ${l.product.name}.`;
    else if (a.sizeSystem !== want.system)
      problem = `${l.product.name} is sized in ${a.sizeSystem ? SIZE_SYSTEM_LABELS[a.sizeSystem] : "no size system"}, not ${SIZE_SYSTEM_LABELS[want.system]}.`;
    else if (!a.sizes.includes(l.size)) problem = `${l.product.name} is not sold in size ${l.size}.`;
    else if (l.size !== want.value) problem = `Size ${l.size} is not size ${want.value}.`;
    if (problem) break;
  }
  const actual = lines
    .map((l) => (l.size ? `${l.product.attributes.sizeSystem ? SIZE_SYSTEM_LABELS[l.product.attributes.sizeSystem] : ""} ${l.size}`.trim() : "None"))
    .join(", ");
  return rule({
    term: "size",
    label: "Size",
    allowed: wantLabel,
    actual,
    pass: problem === null,
    explanation: problem ?? "Exact match",
  });
}

function colorsRow(terms: Terms, lines: CheckLine[]): TermResult {
  const allow = terms.required.colors;
  const deny = terms.forbidden.colors ?? [];
  const colors = [...new Set(lines.flatMap((l) => l.product.attributes.colors))] as ColorId[];
  const denied = colors.find((c) => deny.includes(c));
  const outside = allow ? colors.find((c) => !allow.includes(c)) : undefined;

  const allowed = allow
    ? allow.map((c, i) => colorName(c, i === 0)).join(", ")
    : deny.length
      ? `Any color except ${orList(deny.map((c) => colorName(c)))}`
      : "Any color";

  let explanation: string;
  if (denied) explanation = `${colorName(denied, true)} is excluded by your mandate.`;
  else if (outside) explanation = `${colorName(outside, true)} is not one of ${orList(allow!.map((c) => colorName(c)))}.`;
  else if (!allow) explanation = deny.length ? "No excluded color" : "No color limit";
  else if (colors.length === 1) explanation = `${colorName(colors[0], true)} is on your list`;
  else if (colors.length === 2) explanation = "Both colors are on your list";
  else explanation = `All ${colors.length} colors are on your list`;

  return rule({
    term: "colors",
    label: "Colors",
    allowed,
    actual: capitalize(orList(colors.map((c) => colorName(c))).replace(" or ", " and ")),
    pass: !denied && !outside,
    explanation,
  });
}

function brandsRow(denyBrands: string[], lines: CheckLine[]): TermResult {
  const hit = lines.find((l) => denyBrands.some((b) => b.toLowerCase() === l.product.attributes.brand.toLowerCase()));
  return rule({
    term: "brands",
    label: "Brands",
    allowed: `Not ${orList(denyBrands)}`,
    actual: [...new Set(lines.map((l) => l.product.attributes.brand))].join(", "),
    pass: !hit,
    explanation: hit ? `${hit.product.attributes.brand} is excluded by your mandate.` : "No excluded brand",
  });
}

function merchantRow(terms: Terms, store: { id: string; name: string }, lines: CheckLine[]): TermResult {
  const stray = lines.find((l) => l.product.storeId !== store.id);
  const allowedList = terms.merchants === "ANY_LISTED" ? null : terms.merchants;
  const onList = !allowedList || allowedList.includes(store.id);
  let explanation = allowedList ? "On your list" : "A listed demo store with PayPal checkout";
  if (stray) explanation = `${stray.product.name} is not sold by ${store.name}.`;
  else if (!onList) explanation = `${store.name} is not on your list.`;
  return rule({
    term: "merchant",
    label: "Merchant",
    allowed: allowedList ? `${allowedList.length} chosen ${allowedList.length === 1 ? "store" : "stores"}` : "Any listed store",
    actual: store.name,
    pass: !stray && onList,
    explanation,
  });
}

function expirationRow(terms: Terms, now: Date): TermResult {
  const exp = new Date(terms.expiresAt);
  const pass = now.getTime() < exp.getTime();
  return rule({
    term: "expiration",
    label: "Expiration",
    allowed: `Until ${formatEt(exp)}`,
    actual: `Checked ${formatEt(now)}`,
    pass,
    explanation: pass ? timeLeft(now, exp) : `The mandate expired on ${formatEt(exp)}.`,
  });
}

function purchasesRow(terms: Terms, captured: number): TermResult {
  const max = terms.maxPurchases;
  const pass = captured < max;
  return rule({
    term: "purchases",
    label: "Purchases",
    allowed: max === 1 ? "1 order" : `${max} orders`,
    actual: captured === 0 ? "First order" : `Order ${captured + 1} of ${max}`,
    pass,
    explanation: !pass
      ? purchasesUsedText(max)
      : captured === 0
        ? "No earlier orders on this mandate"
        : `${captured} of ${max} used`,
  });
}

function semanticRow(s: Terms["semantic"][number], v: SemanticVerdict | undefined): TermResult {
  const pass = v?.status === "pass";
  let explanation: string;
  if (!v) explanation = "This term needs a judgment that has not run, so the cart cannot pass yet.";
  else if (v.status === "unavailable")
    explanation = "This term needs a judgment that is not available right now, so the cart cannot pass.";
  else explanation = v.reason;
  return {
    term: `semantic:${s.id}`,
    label: s.label,
    group: "term",
    kind: "semantic",
    allowed: s.text,
    actual: v?.status === "pass" ? "Matches" : v?.status === "fail" ? "Does not match" : "Not judged",
    pass,
    explanation,
  };
}
