/**
 * PayPal webhook contract (FR-027, US6 scenarios 1 and 2): an event is acted on only after its
 * signature is verified, each event id is processed once, and an unverifiable event changes nothing.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dispute, evidenceFile, order, paypalEvent } from "@/lib/db/schema";
import { templateDrafter } from "@/lib/disputes/draft";
import { createWebhookVerifier } from "@/lib/payments/webhooks";
import { handlePayPalWebhook, type WebhookDeps } from "@/lib/webhooks/dispatch";
import { testDb } from "../helpers/db";
import { SIGNED_HEADERS, disputeEvent, fakeVerify, paidOrder } from "../helpers/disputes";

let handle: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  handle = await testDb();
});
afterAll(async () => {
  await handle.close();
});

function deps(over: Partial<WebhookDeps> = {}): WebhookDeps & { jobs: number } {
  const d = {
    db: handle.db,
    verify: fakeVerify,
    drafter: templateDrafter,
    jobs: 0,
    enqueue: async (job: { run: () => Promise<void> }) => {
      d.jobs++;
      await job.run();
    },
    ...over,
  };
  return d;
}

async function orderRow(code: string) {
  const [o] = await handle.db.select().from(order).where(eq(order.code, code));
  return o;
}

describe("POST /api/webhooks/paypal", () => {
  it("processes a verified dispute event: dispute linked to the order, evidence file and draft stored", async () => {
    const { orderCode } = await paidOrder(handle.db);
    const o = await orderRow(orderCode);
    const event = disputeEvent({ captureId: o.paypalCaptureId, customId: o.customId });
    const d = deps();
    const r = await handlePayPalWebhook(d, SIGNED_HEADERS, JSON.stringify(event));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ received: true, duplicate: false });

    const [stored] = await handle.db.select().from(paypalEvent).where(eq(paypalEvent.id, event.id));
    expect(stored).toMatchObject({ eventType: "CUSTOMER.DISPUTE.CREATED", verified: true, error: null });
    expect(stored.processedAt).not.toBeNull();

    const [ds] = await handle.db.select().from(dispute).where(eq(dispute.paypalDisputeId, event.resource.dispute_id));
    expect(ds).toMatchObject({ orderId: o.id, reason: "UNAUTHORISED", status: "WAITING_FOR_SELLER_RESPONSE", amountCents: 10392, inPool: true, claimedBySessionId: null });
    const [file] = await handle.db.select().from(evidenceFile).where(eq(evidenceFile.disputeId, ds.id));
    expect(file.assembledBy).toBe("inline");
    expect(file.draftText).toContain(o.customId.split(":")[0]);
    expect(d.jobs).toBe(1);
  });

  it("matches the order by custom_id when the capture id is unknown", async () => {
    const { orderCode } = await paidOrder(handle.db);
    const o = await orderRow(orderCode);
    const event = disputeEvent({ captureId: "SOMETHING-ELSE", customId: o.customId });
    await handlePayPalWebhook(deps(), SIGNED_HEADERS, JSON.stringify(event));
    const [ds] = await handle.db.select().from(dispute).where(eq(dispute.paypalDisputeId, event.resource.dispute_id));
    expect(ds.orderId).toBe(o.id);
  });

  it("ignores a duplicate delivery of the same event id", async () => {
    const { orderCode } = await paidOrder(handle.db);
    const o = await orderRow(orderCode);
    const event = disputeEvent({ captureId: o.paypalCaptureId });
    const d = deps();
    await handlePayPalWebhook(d, SIGNED_HEADERS, JSON.stringify(event));
    const again = await handlePayPalWebhook(d, SIGNED_HEADERS, JSON.stringify(event));
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ received: true, duplicate: true });
    expect(d.jobs).toBe(1);
    expect(await handle.db.select().from(dispute).where(eq(dispute.paypalDisputeId, event.resource.dispute_id))).toHaveLength(1);
  });

  it("rejects an event whose signature does not verify, with no side effect", async () => {
    const { orderCode } = await paidOrder(handle.db);
    const o = await orderRow(orderCode);
    const event = disputeEvent({ captureId: o.paypalCaptureId });
    const d = deps();
    const r = await handlePayPalWebhook(d, { ...SIGNED_HEADERS, "paypal-transmission-sig": "forged" }, JSON.stringify(event));
    expect(r.status).toBe(400);
    expect(await handle.db.select().from(paypalEvent).where(eq(paypalEvent.id, event.id))).toHaveLength(0);
    expect(await handle.db.select().from(dispute).where(eq(dispute.paypalDisputeId, event.resource.dispute_id))).toHaveLength(0);
    expect(d.jobs).toBe(0);

    // A forged copy must not block the genuine event that arrives later.
    const genuine = await handlePayPalWebhook(d, SIGNED_HEADERS, JSON.stringify(event));
    expect(genuine.body).toMatchObject({ duplicate: false });
    expect(await handle.db.select().from(dispute).where(eq(dispute.paypalDisputeId, event.resource.dispute_id))).toHaveLength(1);
  });

  it("rejects a body that is not JSON, and a verifier failure, without writing", async () => {
    const d = deps({
      verify: async () => {
        throw new Error("PayPal down");
      },
    });
    expect((await handlePayPalWebhook(d, SIGNED_HEADERS, "{not json")).status).toBe(400);
    const event = disputeEvent({});
    expect((await handlePayPalWebhook(d, SIGNED_HEADERS, JSON.stringify(event))).status).toBe(400);
    expect(await handle.db.select().from(paypalEvent).where(eq(paypalEvent.id, event.id))).toHaveLength(0);
  });

  it("updates the dispute status on CUSTOMER.DISPUTE.RESOLVED without a second evidence file", async () => {
    const { orderCode } = await paidOrder(handle.db);
    const o = await orderRow(orderCode);
    const created = disputeEvent({ captureId: o.paypalCaptureId });
    const d = deps();
    await handlePayPalWebhook(d, SIGNED_HEADERS, JSON.stringify(created));
    const resolved = disputeEvent({ captureId: o.paypalCaptureId, disputeId: created.resource.dispute_id, type: "CUSTOMER.DISPUTE.RESOLVED", status: "RESOLVED" });
    await handlePayPalWebhook(d, SIGNED_HEADERS, JSON.stringify(resolved));
    const [ds] = await handle.db.select().from(dispute).where(eq(dispute.paypalDisputeId, created.resource.dispute_id));
    expect(ds.status).toBe("RESOLVED");
    expect(await handle.db.select().from(evidenceFile).where(eq(evidenceFile.disputeId, ds.id))).toHaveLength(1);
    expect(d.jobs).toBe(1);
  });

  it("stores other verified events once without acting on them", async () => {
    const event = { id: `WH-OTHER-${crypto.randomUUID()}`, event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAP-1" } };
    const d = deps();
    const r = await handlePayPalWebhook(d, SIGNED_HEADERS, JSON.stringify(event));
    expect(r.status).toBe(200);
    const [stored] = await handle.db.select().from(paypalEvent).where(eq(paypalEvent.id, event.id));
    expect(stored).toMatchObject({ eventType: "PAYMENT.CAPTURE.COMPLETED", resourceId: "CAP-1", verified: true });
    expect(d.jobs).toBe(0);
  });
});

describe("PayPal signature verification (verify-webhook-signature)", () => {
  const env = { PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "secret", PAYPAL_WEBHOOK_ID: "WH-ID-1" };

  function fakePayPal(status: "SUCCESS" | "FAILURE") {
    const calls: { url: string; body: unknown }[] = [];
    const fetch = async (url: string, init?: RequestInit) => {
      if (url.endsWith("/v1/oauth2/token")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
      calls.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ verification_status: status }), { status: 200 });
    };
    return { fetch, calls };
  }

  it("sends the transmission headers, our webhook id and the event, and trusts only SUCCESS", async () => {
    const ok = fakePayPal("SUCCESS");
    const verify = createWebhookVerifier({ env, fetch: ok.fetch });
    const event = disputeEvent({});
    expect(await verify({ headers: SIGNED_HEADERS, event })).toBe(true);
    expect(ok.calls[0].url).toBe("https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature");
    expect(ok.calls[0].body).toEqual({
      auth_algo: "SHA256withRSA",
      cert_url: SIGNED_HEADERS["paypal-cert-url"],
      transmission_id: "tx-test",
      transmission_sig: "sig-test",
      transmission_time: SIGNED_HEADERS["paypal-transmission-time"],
      webhook_id: "WH-ID-1",
      webhook_event: event,
    });

    const bad = fakePayPal("FAILURE");
    expect(await createWebhookVerifier({ env, fetch: bad.fetch })({ headers: SIGNED_HEADERS, event })).toBe(false);
  });

  it("refuses without calling PayPal when a header or the webhook id is missing", async () => {
    const p = fakePayPal("SUCCESS");
    const { "paypal-transmission-sig": _sig, ...partial } = SIGNED_HEADERS;
    void _sig;
    expect(await createWebhookVerifier({ env, fetch: p.fetch })({ headers: partial, event: {} })).toBe(false);
    expect(await createWebhookVerifier({ env: { ...env, PAYPAL_WEBHOOK_ID: "" }, fetch: p.fetch })({ headers: SIGNED_HEADERS, event: {} })).toBe(false);
    expect(p.calls).toHaveLength(0);
  });

  it("refuses a certificate URL that is not PayPal's", async () => {
    const p = fakePayPal("SUCCESS");
    const verify = createWebhookVerifier({ env, fetch: p.fetch });
    expect(await verify({ headers: { ...SIGNED_HEADERS, "paypal-cert-url": "https://evil.example/cert" }, event: {} })).toBe(false);
    expect(p.calls).toHaveLength(0);
  });
});
