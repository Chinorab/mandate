/**
 * Client bundle scan (T067, constitution IV), run after `next build` by `pnpm build:check`, locally and
 * on Render. Fails if anything sent to browsers (.next/static) contains a secret value from the
 * environment, or the name of a server only secret or of the vault token fields. Prints file names only.
 */
import { config } from "dotenv";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

config({ path: [".env.local"], quiet: true });

const STATIC = path.join(process.cwd(), ".next", "static");
const SECRET_VARS = ["PAYPAL_CLIENT_SECRET", "ANTHROPIC_API_KEY", "SESSION_SECRET", "DATABASE_URL", "PAYPAL_WEBHOOK_ID", "RENDER_API_KEY"];
// Server only names: if one of these appears in browser code, server code leaked into a client bundle.
const FORBIDDEN_NAMES = [...SECRET_VARS, "vaultPaymentTokenId", "vault_payment_token_id", "vaultCustomerId", "vault_customer_id"];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = path.join(dir, e);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

if (!existsSync(STATIC)) {
  console.error("No .next/static: run next build first.");
  process.exit(1);
}

const values = SECRET_VARS.map((k) => ({ k, v: process.env[k] ?? "" })).filter(({ v }) => v.length >= 12);
const hits: string[] = [];
const scanned = files(STATIC).filter((f) => /\.(js|css|json|map|html|txt)$/.test(f));
for (const f of scanned) {
  const text = readFileSync(f, "utf8");
  const rel = path.relative(process.cwd(), f);
  for (const { k, v } of values) if (text.includes(v)) hits.push(`${rel}: value of ${k}`);
  for (const name of FORBIDDEN_NAMES) if (text.includes(name)) hits.push(`${rel}: name ${name}`);
}

if (hits.length) {
  console.error(`Client bundle scan failed (${hits.length}):\n${hits.map((h) => `  ${h}`).join("\n")}`);
  process.exit(1);
}
console.log(`Client bundle scan clean (${scanned.length} files, ${values.length} secret values checked).`);
