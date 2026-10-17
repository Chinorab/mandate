/**
 * Linking PayPal to a mandate (Vault v3, save without purchase). Public module of lib/payments:
 * it creates and deletes saved payment tokens but never charges them; only gate.ts charges.
 */
import { getPayPal, type PayPalClient } from "./paypal-rest";

export type VaultClient = {
  createSetupToken(args: { description: string; returnUrl: string; cancelUrl: string }): Promise<{ id: string }>;
  createPaymentToken(setupTokenId: string): Promise<{ id: string; customerId: string | null }>;
  deletePaymentToken(paymentTokenId: string): Promise<void>;
};

export function paypalConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
}

export function createVaultClient(paypal: PayPalClient = getPayPal()): VaultClient {
  return {
    async createSetupToken({ description, returnUrl, cancelUrl }) {
      const res = await paypal.request<{ id: string }>("/v3/vault/setup-tokens", {
        method: "POST",
        requestId: crypto.randomUUID(),
        json: {
          payment_source: {
            paypal: {
              description: description.slice(0, 128),
              usage_type: "MERCHANT",
              usage_pattern: "UNSCHEDULED_PREPAID",
              customer_type: "CONSUMER",
              permit_multiple_payment_tokens: true,
              experience_context: { brand_name: "Mandate", return_url: returnUrl, cancel_url: cancelUrl },
            },
          },
        },
      });
      return { id: res.id };
    },

    async createPaymentToken(setupTokenId) {
      const res = await paypal.request<{ id: string; customer?: { id?: string } }>("/v3/vault/payment-tokens", {
        method: "POST",
        requestId: `pt-${setupTokenId}`,
        json: { payment_source: { token: { id: setupTokenId, type: "SETUP_TOKEN" } } },
      });
      return { id: res.id, customerId: res.customer?.id ?? null };
    },

    async deletePaymentToken(paymentTokenId) {
      await paypal.request(`/v3/vault/payment-tokens/${encodeURIComponent(paymentTokenId)}`, { method: "DELETE" });
    },
  };
}

/** Browser safe client token for the JS SDK v6 (public module wrapper). */
export async function browserClientToken() {
  return getPayPal().browserClientToken();
}
