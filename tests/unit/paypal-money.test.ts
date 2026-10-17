import { describe, expect, it } from "vitest";
import { formatAmount } from "@/lib/payments/amount";
import { createMoneyClient, type ChargeArgs } from "@/lib/payments/paypal-money";
import { createPayPalClient } from "@/lib/payments/paypal-rest";

const env = { PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "secret" };

function recorder(response: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith("/v1/oauth2/token")) return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }));
    return new Response(JSON.stringify(response), { status: 201 });
  };
  return { fetch, calls };
}

const args: ChargeArgs = {
  requestId: "11111111-2222-3333-4444-555555555555",
  vaultId: "8kk8451t",
  payeeMerchantId: "SANDBOXMERCHANT1",
  storeId: "sports-outlet",
  currency: "USD",
  amount: { totalCents: 10392, subtotalCents: 9600, shippingCents: 0, taxCents: 792 },
  items: [{ name: "Daily Miler", sku: "daily-miler-blk-wht", qty: 1, unitCents: 9600 }],
  customId: `MDT4K7Q21:1:${"a".repeat(64)}`,
  invoiceId: "MDT4K7Q21.104823",
  description: "Agent purchase under mandate MDT4K7Q21",
};

describe("formatAmount", () => {
  it("formats integer cents for PayPal", () => {
    expect(formatAmount(10392)).toBe("103.92");
    expect(formatAmount(5)).toBe("0.05");
    expect(formatAmount(0)).toBe("0.00");
    expect(() => formatAmount(1.5)).toThrow();
    expect(() => formatAmount(-1)).toThrow();
  });
});

describe("chargeSavedPayPal", () => {
  it("sends a merchant initiated vault charge carrying the mandate", async () => {
    const r = recorder({
      id: "5O190127TN364715T",
      status: "COMPLETED",
      purchase_units: [{ payments: { captures: [{ id: "3C679366HH908993F", status: "COMPLETED" }] } }],
    });
    const money = createMoneyClient(createPayPalClient({ env, fetch: r.fetch }));
    const res = await money.chargeSavedPayPal(args);
    expect(res).toEqual({ orderId: "5O190127TN364715T", status: "COMPLETED", captureId: "3C679366HH908993F" });

    const call = r.calls.find((c) => c.url.endsWith("/v2/checkout/orders"))!;
    expect((call.init?.headers as Record<string, string>)["PayPal-Request-Id"]).toBe(args.requestId);
    const body = JSON.parse(String(call.init?.body));
    expect(body.intent).toBe("CAPTURE");
    expect(body.payment_source.paypal).toEqual({
      vault_id: "8kk8451t",
      stored_credential: { payment_initiator: "MERCHANT", usage: "SUBSEQUENT", usage_pattern: "UNSCHEDULED_PREPAID" },
    });
    const pu = body.purchase_units[0];
    expect(pu.custom_id).toBe(args.customId);
    expect(pu.invoice_id).toBe(args.invoiceId);
    expect(pu.payee).toEqual({ merchant_id: "SANDBOXMERCHANT1" });
    expect(pu.amount.value).toBe("103.92");
    expect(pu.amount.breakdown).toEqual({
      item_total: { currency_code: "USD", value: "96.00" },
      shipping: { currency_code: "USD", value: "0.00" },
      tax_total: { currency_code: "USD", value: "7.92" },
    });
    expect(pu.items[0]).toMatchObject({ name: "Daily Miler", quantity: "1", unit_amount: { value: "96.00" } });
  });

  it("omits the payee when the store has no sandbox account configured", async () => {
    const r = recorder({ id: "X", status: "APPROVED" });
    await createMoneyClient(createPayPalClient({ env, fetch: r.fetch })).chargeSavedPayPal({ ...args, payeeMerchantId: null });
    const body = JSON.parse(String(r.calls.find((c) => c.url.endsWith("/v2/checkout/orders"))!.init?.body));
    expect(body.purchase_units[0].payee).toBeUndefined();
  });

  it("captures an approved order with its own request id", async () => {
    const r = recorder({ id: "X", status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "C1", status: "COMPLETED" }] } }] });
    const res = await createMoneyClient(createPayPalClient({ env, fetch: r.fetch })).captureOrder("X", "req-2");
    expect(res).toEqual({ captureId: "C1", status: "COMPLETED" });
    const call = r.calls.find((c) => c.url.endsWith("/v2/checkout/orders/X/capture"))!;
    expect((call.init?.headers as Record<string, string>)["PayPal-Request-Id"]).toBe("req-2");
  });
});
