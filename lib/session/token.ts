/**
 * Demo session token: "<uuid>.<hmac>" where hmac = HMAC-SHA256(SESSION_SECRET, uuid), base64url.
 * Web Crypto only, so it runs in the proxy and in route handlers alike.
 */

export const SESSION_COOKIE = "mandate_sid";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 90; // 90 days, the retention period in the privacy page

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DEV_SECRET = "mandate-local-development-secret-do-not-use";

export function sessionSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set (32+ chars)");
  return DEV_SECRET;
}

function b64url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signSession(id: string, secret: string): Promise<string> {
  return `${id}.${await hmac(secret, id)}`;
}

/** Returns the session id when the token is well formed and correctly signed, else null. */
export async function verifySession(token: string | undefined, secret: string): Promise<string | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const id = token.slice(0, dot);
  if (!UUID.test(id)) return null;
  const expected = await hmac(secret, id);
  return safeEqual(token.slice(dot + 1), expected) ? id : null;
}

export async function newSessionToken(secret: string): Promise<{ id: string; token: string }> {
  const id = crypto.randomUUID();
  return { id, token: await signSession(id, secret) };
}
