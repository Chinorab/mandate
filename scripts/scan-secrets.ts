/**
 * Secret scan run before every push (.githooks/pre-push) and before every deploy.
 * Scans tracked and untracked, non ignored files for known secret shapes and for the
 * exact values held in local env files. Exits 1 on any hit, printing file and line only.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const ENV_FILES = [".env.local", ".env", ".env.development.local", ".env.production.local"];
// Shorter values (flags, small numbers) would match ordinary text.
const MIN_VALUE_LENGTH = 12;

const PATTERNS: { name: string; regex: RegExp }[] = [
  { name: "Anthropic API key", regex: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "Private key block", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "PayPal access token", regex: /A21AA[A-Za-z0-9_-]{40,}/ },
  { name: "Bearer token literal", regex: /Bearer\s+[A-Za-z0-9._-]{40,}/ },
  { name: "Render API key", regex: /rnd_[A-Za-z0-9]{20,}/ },
  { name: "AWS access key", regex: /AKIA[0-9A-Z]{16}/ },
  { name: "Postgres URL with password", regex: /postgres(?:ql)?:\/\/[^:\s/]+:[^@\s]{6,}@/ },
];

function envValues(): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  for (const file of ENV_FILES) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const value = m[2].replace(/^["']|["']$/g, "");
      if (value.length >= MIN_VALUE_LENGTH) out.push({ key: m[1], value });
    }
  }
  return out;
}

function listFiles(): string[] {
  const run = (cmd: string) =>
    execSync(cmd, { encoding: "utf8" })
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  const files = new Set([...run("git ls-files"), ...run("git ls-files --others --exclude-standard")]);
  return [...files].filter((f) => !/\.(png|jpg|jpeg|ico|woff2?|pdf|zip)$/i.test(f) && f !== "pnpm-lock.yaml");
}

const values = envValues();
const hits: string[] = [];

for (const file of listFiles()) {
  if (!existsSync(file)) continue;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const p of PATTERNS) {
      if (p.regex.test(line)) hits.push(`${file}:${i + 1}  ${p.name}`);
    }
    for (const v of values) {
      if (line.includes(v.value)) hits.push(`${file}:${i + 1}  value of ${v.key} from a local env file`);
    }
  });
}

if (hits.length > 0) {
  console.error(`Secret scan failed, ${hits.length} hit(s):`);
  for (const h of hits) console.error(`  ${h}`);
  process.exit(1);
}
console.log(`Secret scan clean (${values.length} local env values checked).`);
