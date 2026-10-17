/**
 * The only PayPal calls that move money. INTERNAL: imported by lib/payments/gate.ts alone, which runs
 * the Mandate check first (bypass suite enforces this). Sandbox only, through paypal-rest.
 */
import { formatAmount } from "./amount";
import { getPayPal, type PayPalClient } from "./paypal-rest";

export type ChargeArgs = {
  /** PayPal-Request-Id: the id of the passing check result, so a retry never charges twice. */
  requestId: string;
  vaultId: string;
  payeeMerchantId: string | null;
  storeId: string;
  currency: string;
  amount: { totalCents: number; subtotalCents: number; shippingCents: number; taxCents: number };
  items: { name: string; sku: string; qty: number; unitCents: number }[];
  /** "<mandate code>:<version>:<sha256>", retrievable by the merchant at PayPal. */
  customId: string;
  invoiceId: string;
  description: string;
};

export type ChargeResult = { orderId: string; status: string; captureId: string | null };

export type MoneyClient = {
  chargeSavedPayPal(args: ChargeArgs): Promise<ChargeResult>;
  captureOrder(orderId: string, requestId: string): Promise<{ captureId: string; status: string }>;
};

type OrderResponse = {
  id: string;
  status: string;
  purchase_units?: { payments?: { captures?: { id: string; status: string }[] } }[];
};

function firstCapture(o: OrderResponse) {
  return o.purchase_units?.[0]?.payments?.captures?.[0] ?? null;
}

export function createMoneyClient(paypal: PayPalClient = getPayPal()): MoneyClient {
  return {
    async chargeSavedPayPal(a) {
      const cur = a.currency;
      const body = {
        intent: "CAPTURE",
        payment_source: {
          paypal: {
            vault_id: a.vaultId,
            // Merchant initiated: the buyer is not present, the signed mandate is the authorization.
            stored_credential: {
              payment_initiator: "MERCHANT",
              usage: "SUBSEQUENT",
              usage_pattern: "UNSCHEDULED_PREPAID",
            },
          },
        },
        purchase_units: [
          {
            reference_id: a.storeId,
            custom_id: a.customId,
            invoice_id: a.invoiceId,
            description: a.description,
            ...(a.payeeMerchantId ? { payee: { merchant_id: a.payeeMerchantId } } : {}),
            amount: {
              currency_code: cur,
              value: formatAmount(a.amount.totalCents),
              breakdown: {
                item_total: { currency_code: cur, value: formatAmount(a.amount.subtotalCents) },
                shipping: { currency_code: cur, value: formatAmount(a.amount.shippingCents) },
                tax_total: { currency_code: cur, value: formatAmount(a.amount.taxCents) },
              },
            },
            items: a.items.map((i) => ({
              name: i.name.slice(0, 127),
              sku: i.sku.slice(0, 127),
              quantity: String(i.qty),
              unit_amount: { currency_code: cur, value: formatAmount(i.unitCents) },
              category: "PHYSICAL_GOODS",
            })),
          },
        ],
      };
      const o = await paypal.request<OrderResponse>("/v2/checkout/orders", {
        method: "POST",
        json: body,
        requestId: a.requestId,
        headers: { Prefer: "return=representation" },
      });
      const cap = firstCapture(o);
      return { orderId: o.id, status: o.status, captureId: cap?.id ?? null };
    },

    async captureOrder(orderId, requestId) {
      const o = await paypal.request<OrderResponse>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        method: "POST",
        json: {},
        requestId,
        headers: { Prefer: "return=representation" },
      });
      const cap = firstCapture(o);
      if (!cap) throw new Error(`Capture of ${orderId} returned no capture`);
      return { captureId: cap.id, status: cap.status };
    },
  };
}
