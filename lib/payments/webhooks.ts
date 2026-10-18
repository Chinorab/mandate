/**
 * PayPal webhook signature verification (FR-027, research R6). PayPal checks the transmission
 * signature for us through POST /v1/notifications/verify-webhook-signature with our webhook id; only a
 * "SUCCESS" answer is trusted. Missing headers, a missing webhook id or a certificate URL that is not
 * PayPal's are refused without a call.
 */
import { createPayPalClient } from "./paypal-rest";

type Env = Record<string, string | undefined>;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type WebhookVerifier = (input: { headers: Record<string, string>; event: unknown }) => Promise<boolean>;

const HEADERS = ["paypal-auth-algo", "paypal-cert-url", "paypal-transmission-id", "paypal-transmission-sig", "paypal-transmission-time"] as const;

function paypalCertUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /(^|\.)paypal\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}

export function createWebhookVerifier(opts: { env?: Env; fetch?: FetchLike } = {}): WebhookVerifier {
  const env = opts.env ?? process.env;
  const client = createPayPalClient({ env, fetch: opts.fetch });
  return async ({ headers, event }) => {
    const webhookId = env.PAYPAL_WEBHOOK_ID;
    if (!webhookId || !env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) return false;
    const h = Object.fromEntries(HEADERS.map((k) => [k, headers[k]]));
    if (HEADERS.some((k) => !h[k])) return false;
    if (!paypalCertUrl(h["paypal-cert-url"]!)) return false;
    const res = await client.request<{ verification_status?: string }>("/v1/notifications/verify-webhook-signature", {
      method: "POST",
      json: {
        auth_algo: h["paypal-auth-algo"],
        cert_url: h["paypal-cert-url"],
        transmission_id: h["paypal-transmission-id"],
        transmission_sig: h["paypal-transmission-sig"],
        transmission_time: h["paypal-transmission-time"],
        webhook_id: webhookId,
        webhook_event: event,
      },
    });
    return res?.verification_status === "SUCCESS";
  };
}
