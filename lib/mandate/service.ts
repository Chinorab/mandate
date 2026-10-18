/**
 * Mandate lifecycle for the buyer: draft, edit, sign, link PayPal, verify, discard (US1).
 * Every function is scoped to the caller's demo session (FR-033) and never returns vault tokens.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { audit } from "@/lib/audit";
import type { Db } from "@/lib/db/client";
import { mandate, mandateVersion, order } from "@/lib/db/schema";
import type { VaultClient } from "@/lib/payments/vault";
import { fingerprint } from "./canonical";
import { draftTermsSchema, type DraftResult, type DraftTerms, type Drafter } from "./draft";
import { termsSchema, type Assumption, type Terms } from "./terms";

export class MandateError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "MandateError";
  }
}

export type MandateView = {
  code: string;
  status: "draft" | "awaiting_link" | "active" | "expired" | "revoked";
  instructions: string;
  terms: DraftTerms;
  assumptions: Assumption[];
  missing: string[];
  outOfScope: string | null;
  version: { versionNo: number; sha256: string; signedAt: string } | null;
  linked: boolean;
  spentCents: number;
  ordersUsed: number;
  createdAt: string;
  revokedAt: string | null;
};

type DraftMeta = { assumptions: Assumption[]; missing: string[]; outOfScope: string | null };

const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function newCode(): string {
  let s = "MDT";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return s;
}

export const MISSING_LABELS: Record<string, string> = {
  budgetCents: "budget",
  category: "what to buy",
  expiresAt: "when it should stop",
};

export async function findOwned(db: Db, sessionId: string, code: string) {
  if (!/^MDT[0-9A-Z]{6}$/.test(code)) throw new MandateError(404, "not_found", "No such mandate");
  const [m] = await db
    .select()
    .from(mandate)
    .where(and(eq(mandate.code, code), eq(mandate.sessionId, sessionId)));
  if (!m) throw new MandateError(404, "not_found", "No such mandate");
  return m;
}

export async function toView(db: Db, m: typeof mandate.$inferSelect, now: Date = new Date()): Promise<MandateView> {
  let version: MandateView["version"] = null;
  let terms = (m.draftTerms ?? {}) as DraftTerms;
  const meta = (m.draftAssumptions ?? { assumptions: [], missing: [], outOfScope: null }) as DraftMeta;
  let assumptions = meta.assumptions;
  if (m.currentVersionId) {
    const [v] = await db.select().from(mandateVersion).where(eq(mandateVersion.id, m.currentVersionId));
    if (v) {
      version = { versionNo: v.versionNo, sha256: v.sha256, signedAt: v.signedAt.toISOString() };
      terms = v.terms as Terms;
      assumptions = v.assumptions as Assumption[];
    }
  }
  const [agg] = await db
    .select({ spent: sql<number>`coalesce(sum(${order.amountCents}), 0)::int`, count: sql<number>`count(*)::int` })
    .from(order)
    .where(and(eq(order.mandateId, m.id), eq(order.status, "captured")));
  // Expiry is a moment, not an event: a signed mandate past its expiry reads as expired.
  const expired =
    (m.status === "active" || m.status === "awaiting_link") && terms.expiresAt !== undefined && new Date(terms.expiresAt).getTime() <= now.getTime();
  return {
    code: m.code,
    status: expired ? "expired" : m.status,
    instructions: m.instructions,
    terms,
    assumptions,
    missing: m.status === "draft" ? meta.missing : [],
    outOfScope: m.status === "draft" ? meta.outOfScope : null,
    version,
    linked: Boolean(m.vaultPaymentTokenId),
    spentCents: Number(agg?.spent ?? 0),
    ordersUsed: Number(agg?.count ?? 0),
    createdAt: m.createdAt.toISOString(),
    revokedAt: m.revokedAt?.toISOString() ?? null,
  };
}

function cleanInstructions(raw: unknown): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) throw new MandateError(400, "instructions_required", "Write what your agent may buy.");
  if (text.length > 1000) throw new MandateError(400, "instructions_too_long", "Keep instructions under 1000 characters.");
  return text;
}

function metaOf(d: DraftResult): DraftMeta {
  return { assumptions: d.assumptions, missing: d.missing, outOfScope: d.outOfScope };
}

/** An empty draft the buyer fills in by hand (used when drafting is unavailable or declined). */
function manualDraft(): DraftResult {
  return {
    terms: { currency: "USD", required: {}, forbidden: {}, semantic: [], merchants: "ANY_LISTED", maxPurchases: 1 },
    assumptions: [],
    missing: ["budgetCents", "category", "expiresAt"],
    outOfScope: null,
  };
}

export async function createDraft(
  db: Db,
  drafter: Drafter,
  sessionId: string,
  rawInstructions: unknown,
  now: Date,
  opts: { manual?: boolean } = {},
) {
  const instructions = cleanInstructions(rawInstructions);
  const d = opts.manual ? manualDraft() : await drafter({ db, sessionId, instructions, now });
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [m] = await db
        .insert(mandate)
        .values({ code: newCode(), sessionId, instructions, status: "draft", draftTerms: d.terms, draftAssumptions: metaOf(d) })
        .returning();
      return toView(db, m);
    } catch (err) {
      if (attempt === 4 || !String((err as Error).message).includes("unique")) throw err;
    }
  }
  throw new MandateError(500, "code_collision", "Could not allocate a mandate code");
}

export async function redraft(db: Db, drafter: Drafter, sessionId: string, code: string, rawInstructions: unknown, now: Date) {
  const m = await findOwned(db, sessionId, code);
  if (m.status !== "draft") throw new MandateError(409, "signed", "A signed mandate cannot be changed in place.");
  const instructions = cleanInstructions(rawInstructions);
  const d = await drafter({ db, sessionId, instructions, now });
  const [u] = await db
    .update(mandate)
    .set({ instructions, draftTerms: d.terms, draftAssumptions: metaOf(d) })
    .where(eq(mandate.id, m.id))
    .returning();
  return toView(db, u);
}

/** Which assumption notes refer to a value the buyer has now changed by hand. */
function stillAssumed(a: Assumption, before: DraftTerms, after: DraftTerms): boolean {
  const pick = (t: DraftTerms) =>
    ({
      size: t.required?.size,
      colors: t.required?.colors,
      expiresAt: t.expiresAt,
      maxPurchases: t.maxPurchases,
      merchants: t.merchants,
      budgetCents: t.budgetCents,
      category: t.category,
    })[a.term as "size"];
  return JSON.stringify(pick(before)) === JSON.stringify(pick(after));
}

export async function updateDraft(db: Db, sessionId: string, code: string, rawTerms: unknown) {
  const m = await findOwned(db, sessionId, code);
  if (m.status !== "draft") throw new MandateError(409, "signed", "Signed terms cannot be edited. Amend the mandate instead.");
  const parsed = draftTermsSchema.safeParse(rawTerms);
  if (!parsed.success) {
    throw new MandateError(400, "invalid_terms", "Some terms are not valid.", { issues: parsed.error.issues.map((i) => i.path.join(".")) });
  }
  const before = (m.draftTerms ?? {}) as DraftTerms;
  const after = parsed.data;
  const meta = (m.draftAssumptions ?? { assumptions: [], missing: [], outOfScope: null }) as DraftMeta;
  const missing = (["budgetCents", "category", "expiresAt"] as const).filter((k) => after[k] === undefined);
  const nextMeta: DraftMeta = {
    assumptions: meta.assumptions.filter((a) => stillAssumed(a, before, after)),
    missing: [...missing],
    outOfScope: meta.outOfScope && after.category === before.category ? meta.outOfScope : null,
  };
  const [u] = await db.update(mandate).set({ draftTerms: after, draftAssumptions: nextMeta }).where(eq(mandate.id, m.id)).returning();
  return toView(db, u);
}

export async function signMandate(db: Db, sessionId: string, code: string, body: unknown, now: Date) {
  if (!body || typeof body !== "object" || (body as { confirm?: unknown }).confirm !== true) {
    throw new MandateError(400, "confirmation_required", "Signing needs your explicit confirmation.");
  }
  const m = await findOwned(db, sessionId, code);
  if (m.status !== "draft") throw new MandateError(409, "already_signed", "This mandate is already signed.");
  const meta = (m.draftAssumptions ?? { assumptions: [], missing: [], outOfScope: null }) as DraftMeta;
  if (meta.outOfScope) throw new MandateError(422, "out_of_scope", meta.outOfScope);

  const draft = (m.draftTerms ?? {}) as DraftTerms;
  const missing = (["budgetCents", "category", "expiresAt"] as const).filter((k) => draft[k] === undefined);
  if (missing.length) {
    throw new MandateError(422, "missing_terms", `Add ${missing.map((k) => MISSING_LABELS[k]).join(", ")} before signing.`, {
      missing: missing.map((k) => MISSING_LABELS[k]),
    });
  }
  const parsed = termsSchema.safeParse(draft);
  if (!parsed.success) throw new MandateError(422, "invalid_terms", "Some terms are not valid.");
  const terms = parsed.data;
  if (new Date(terms.expiresAt).getTime() <= now.getTime()) {
    throw new MandateError(422, "expired", "The expiry is in the past. Choose a later date.");
  }

  const fp = fingerprint(m.code, 1, terms);
  const updated = await db.transaction(async (tx) => {
    const [v] = await tx
      .insert(mandateVersion)
      .values({
        mandateId: m.id,
        versionNo: 1,
        terms: JSON.parse(fp.canonical).terms,
        assumptions: meta.assumptions,
        canonical: fp.canonical,
        sha256: fp.sha256,
        signedAt: now,
      })
      .returning();
    const [u] = await tx
      .update(mandate)
      .set({ status: "awaiting_link", currentVersionId: v.id })
      .where(eq(mandate.id, m.id))
      .returning();
    await audit(tx, { sessionId, actor: "buyer", action: "mandate_signed", detail: { code: m.code, version: 1, sha256: fp.sha256 } });
    return u;
  });
  return toView(db, updated);
}

export async function getMandate(db: Db, sessionId: string, code: string, now: Date = new Date()) {
  return toView(db, await findOwned(db, sessionId, code), now);
}

export async function listMandates(db: Db, sessionId: string, now: Date = new Date()) {
  const rows = await db.select().from(mandate).where(eq(mandate.sessionId, sessionId)).orderBy(desc(mandate.createdAt), desc(mandate.id));
  return Promise.all(rows.map((r) => toView(db, r, now)));
}

export async function discardDraft(db: Db, sessionId: string, code: string) {
  const m = await findOwned(db, sessionId, code);
  if (m.status !== "draft") throw new MandateError(409, "signed", "A signed mandate can be revoked, not discarded.");
  await db.delete(mandate).where(eq(mandate.id, m.id));
}

export async function verifyMandate(db: Db, sessionId: string, code: string) {
  const m = await findOwned(db, sessionId, code);
  const versions = await db.select().from(mandateVersion).where(eq(mandateVersion.mandateId, m.id)).orderBy(mandateVersion.versionNo);
  return versions.map((v) => {
    let recomputed: string | null = null;
    try {
      recomputed = fingerprint(m.code, v.versionNo, termsSchema.parse(v.terms)).sha256;
    } catch {
      recomputed = null;
    }
    return { versionNo: v.versionNo, signedAt: v.signedAt.toISOString(), sha256: v.sha256, recomputed, match: recomputed === v.sha256 };
  });
}

export async function startPayPalLink(db: Db, vault: VaultClient | null, sessionId: string, code: string, origin: string) {
  const m = await findOwned(db, sessionId, code);
  if (m.status !== "awaiting_link") throw new MandateError(409, "not_awaiting_link", "Sign the mandate before linking PayPal.");
  if (!vault) throw new MandateError(503, "paypal_not_configured", "PayPal sandbox is not configured on this server.");
  const token = await vault.createSetupToken({
    description: `Payments by your shopping agent under mandate ${m.code}`,
    returnUrl: `${origin}/mandates/new?code=${m.code}&linked=1`,
    cancelUrl: `${origin}/mandates/new?code=${m.code}&cancelled=1`,
  });
  await db.update(mandate).set({ vaultSetupTokenId: token.id }).where(eq(mandate.id, m.id));
  return { setupTokenId: token.id };
}

export async function confirmPayPalLink(db: Db, vault: VaultClient | null, sessionId: string, code: string, body: unknown) {
  const m = await findOwned(db, sessionId, code);
  if (m.status !== "awaiting_link") throw new MandateError(409, "not_awaiting_link", "This mandate is not waiting for PayPal.");
  if (!vault) throw new MandateError(503, "paypal_not_configured", "PayPal sandbox is not configured on this server.");
  const presented = body && typeof body === "object" ? (body as { vaultSetupToken?: unknown }).vaultSetupToken : undefined;
  if (typeof presented !== "string" || !m.vaultSetupTokenId || presented !== m.vaultSetupTokenId) {
    throw new MandateError(409, "setup_token_mismatch", "This PayPal approval does not belong to this mandate.");
  }
  const pt = await vault.createPaymentToken(presented);
  const [u] = await db
    .update(mandate)
    .set({ status: "active", vaultPaymentTokenId: pt.id, vaultCustomerId: pt.customerId, vaultSetupTokenId: null })
    .where(eq(mandate.id, m.id))
    .returning();
  await audit(db, { sessionId, actor: "buyer", action: "mandate_linked", detail: { code: m.code } });
  return toView(db, u);
}
