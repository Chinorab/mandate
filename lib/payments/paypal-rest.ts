/**
 * PayPal REST transport (sandbox only). INTERNAL to lib/payments: other folders use the public
 * modules (gate, vault, webhooks, disputes) and never this file, which the bypass suite enforces.
 *
 * - Refuses any base URL that is not the sandbox (constitution IV).
 * - Caches the OAuth token until shortly before expiry, refreshes once on 401.
 * - Retries 429 and 5xx only when the request is idempotent (GET, or a PayPal-Request-Id is sent).
 */

export const SANDBOX_BASE = "https://api-m.sandbox.paypal.com";

export class PayPalConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayPalConfigError";
  }
}

export class PayPalApiError extends Error {
  constructor(
    readonly status: number,
    readonly issue: string,
    message: string,
    readonly debugId: string | null,
    readonly details: unknown,
  ) {
    super(message);
    this.name = "PayPalApiError";
  }
}

type Env = Record<string, string | undefined>;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  json?: unknown;
  form?: FormData;
  requestId?: string;
  headers?: Record<string, string>;
};

export function sandboxBase(env: Env): string {
  const base = (env.PAYPAL_API_BASE || SANDBOX_BASE).replace(/\/+$/, "");
  if (base !== SANDBOX_BASE) throw new PayPalConfigError("Only the PayPal sandbox is allowed");
  return base;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createPayPalClient(opts: { env?: Env; fetch?: FetchLike; now?: () => number } = {}) {
  const env = opts.env ?? process.env;
  const doFetch: FetchLike = opts.fetch ?? ((i, init) => fetch(i, init));
  const now = opts.now ?? Date.now;
  let cached: { token: string; expiresAt: number } | null = null;

  function credentials() {
    const id = env.PAYPAL_CLIENT_ID;
    const secret = env.PAYPAL_CLIENT_SECRET;
    if (!id || !secret) throw new PayPalConfigError("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required");
    return { id, secret, basic: btoa(`${id}:${secret}`) };
  }

  async function oauth(extra: Record<string, string> = {}) {
    const { basic } = credentials();
    const body = new URLSearchParams({ grant_type: "client_credentials", ...extra });
    const res = await doFetch(`${sandboxBase(env)}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw await toApiError(res);
    return (await res.json()) as { access_token: string; expires_in: number };
  }

  async function accessToken(force = false): Promise<string> {
    if (!force && cached && cached.expiresAt > now()) return cached.token;
    const t = await oauth();
    // Refresh one minute early.
    cached = { token: t.access_token, expiresAt: now() + Math.max(0, t.expires_in - 60) * 1000 };
    return cached.token;
  }

  async function request<T>(path: string, o: RequestOptions = {}): Promise<T> {
    const method = o.method ?? "GET";
    const idempotent = method === "GET" || Boolean(o.requestId);
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${await accessToken(false)}`,
        ...(o.json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(o.requestId ? { "PayPal-Request-Id": o.requestId } : {}),
        ...o.headers,
      };
      const res = await doFetch(`${sandboxBase(env)}${path}`, {
        method,
        headers,
        body: o.form ?? (o.json !== undefined ? JSON.stringify(o.json) : undefined),
      });
      if (res.status === 401 && !refreshed) {
        refreshed = true;
        cached = null;
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && idempotent && attempt < 2) {
        await sleep(250 * 2 ** attempt);
        continue;
      }
      if (!res.ok) throw await toApiError(res);
      if (res.status === 204) return undefined as T;
      const text = await res.text();
      return (text ? JSON.parse(text) : undefined) as T;
    }
  }

  /** Short lived token for the browser JS SDK v6 (response_type=client_token). */
  async function browserClientToken(): Promise<{ token: string; expiresIn: number }> {
    const t = await oauth({ response_type: "client_token" });
    return { token: t.access_token, expiresIn: t.expires_in };
  }

  return { request, accessToken, browserClientToken };
}

async function toApiError(res: Response): Promise<PayPalApiError> {
  let body: { name?: string; message?: string; debug_id?: string; details?: unknown; error?: string; error_description?: string } = {};
  try {
    body = await res.json();
  } catch {
    // Non JSON error body.
  }
  return new PayPalApiError(
    res.status,
    body.name ?? body.error ?? `HTTP_${res.status}`,
    body.message ?? body.error_description ?? `PayPal request failed with ${res.status}`,
    body.debug_id ?? res.headers.get("paypal-debug-id"),
    body.details ?? null,
  );
}

export type PayPalClient = ReturnType<typeof createPayPalClient>;

const globalForPayPal = globalThis as unknown as { __paypal?: PayPalClient };

export function getPayPal(): PayPalClient {
  globalForPayPal.__paypal ??= createPayPalClient();
  return globalForPayPal.__paypal;
}
