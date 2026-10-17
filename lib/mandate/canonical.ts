/**
 * Canonical form and SHA-256 fingerprint of a signed mandate version (FR-005, FR-006).
 * The canonical string is what gets hashed and stored; anyone can recompute it from the terms.
 */
import { createHash } from "node:crypto";
import { normalizeTerms, type Terms } from "./terms";

/** JSON with object keys sorted recursively and undefined values dropped. Arrays keep their order. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Non finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export type Fingerprint = { canonical: string; sha256: string };

/** Binds the mandate code and version number into the hashed content. */
export function fingerprint(code: string, version: number, terms: Terms): Fingerprint {
  const canonical = canonicalize({ mandate: code, terms: normalizeTerms(terms), version });
  return { canonical, sha256: sha256Hex(canonical) };
}

/**
 * Integrity check used by every Mandate check: the stored canonical string must hash to the stored
 * fingerprint AND must equal what the stored terms canonicalize to.
 */
export function verifyFingerprint(stored: {
  code: string;
  versionNo: number;
  terms: Terms;
  canonical: string;
  sha256: string;
}): boolean {
  const recomputed = fingerprint(stored.code, stored.versionNo, stored.terms);
  return recomputed.canonical === stored.canonical && sha256Hex(stored.canonical) === stored.sha256;
}
