/**
 * Shared helper for the sandbox scripts (contracts/sandbox-scripts.md, T012).
 *
 * - Reads `.env.local`; the PayPal transport refuses any base URL that is not the sandbox.
 * - Prints requests and responses with tokens, secrets and links' tokens masked.
 * - Appends dated findings to scripts/LEARNINGS.md, which feeds the README section
 *   "What we learned from the sandbox".
 * - Keeps ids between scripts in .scripts-state/ (git ignored).
 */
import { config } from "dotenv";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createPayPalClient, PayPalApiError, type RequestOptions } from "../../lib/payments/paypal-rest";

config({ path: [".env.local"], quiet: true });

const SECRET_KEY = /token|secret|authorization|password|access/i;

export function mask(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mask);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEY.test(k) && typeof v === "string" ? "[masked]" : mask(v)]),
    );
  }
  if (typeof value === "string") return value.replace(/([?&]token=)[^&]+/g, "$1[masked]");
  return value;
}

export const paypal = createPayPalClient({ env: process.env });

/** One PayPal call, printed with masking; PayPal errors are returned, not thrown. */
export async function call<T>(label: string, p: string, o: RequestOptions = {}): Promise<{ ok: true; body: T } | { ok: false; error: PayPalApiError }> {
  console.log(`\n> ${label}: ${o.method ?? "GET"} ${p}${o.requestId ? ` (PayPal-Request-Id ${o.requestId})` : ""}`);
  if (o.json !== undefined) console.log(JSON.stringify(mask(o.json), null, 2));
  try {
    const body = await paypal.request<T>(p, o);
    console.log(`< ok\n${JSON.stringify(mask(body), null, 2)}`);
    return { ok: true, body };
  } catch (err) {
    if (!(err instanceof PayPalApiError)) throw err;
    console.log(`< ${err.status} ${err.issue}: ${err.message} (debug id ${err.debugId})\n${JSON.stringify(err.details, null, 2)}`);
    return { ok: false, error: err };
  }
}

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is missing in .env.local`);
  return v;
}

const STATE_DIR = path.join(process.cwd(), ".scripts-state");

export function readState<T>(name: string): T | null {
  const f = path.join(STATE_DIR, `${name}.json`);
  return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as T) : null;
}

export function writeState(name: string, data: unknown) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(path.join(STATE_DIR, `${name}.json`), JSON.stringify(data, null, 2));
}

const LEARNINGS = path.join(process.cwd(), "scripts", "LEARNINGS.md");

/** Appends a dated entry; findings are facts observed in the sandbox, never secrets. */
export function learn(script: string, findings: string[]) {
  if (!existsSync(LEARNINGS)) {
    writeFileSync(LEARNINGS, "# What we learned from the sandbox\n\nDated findings from the scripts in `/scripts`, run against the PayPal sandbox.\n");
  }
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  appendFileSync(LEARNINGS, `\n## ${script}, ${stamp} UTC\n\n${findings.map((f) => `- ${f}`).join("\n")}\n`);
  console.log(`\nRecorded ${findings.length} findings in scripts/LEARNINGS.md`);
}

export function run(main: () => Promise<void>) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
