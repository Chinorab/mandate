import type { Db } from "@/lib/db/client";
import * as carts from "@/lib/api/carts";
import type { DisputesClient, EvidenceSubmission } from "@/lib/payments/disputes";
import { PayPalApiError } from "@/lib/payments/errors";
import { CANVAS_TERMS, CHECK_TIME } from "./fixtures";
import { activeMandate, fakeJudge, fakeMoney, newCart } from "./scenario";

/** A paid agent order at Sample Sports Outlet, through the real gate with fake PayPal. */
export async function paidOrder(db: Db, productId = "daily-miler-blk-wht") {
  const m = await activeMandate(db, { terms: CANVAS_TERMS });
  const cartId = await newCart(db, m, productId);
  const r = await carts.pay({ db, money: fakeMoney().client, judge: fakeJudge().judge, now: () => CHECK_TIME }, m.sessionId, cartId);
  if (r.status !== 200) throw new Error(`payment failed: ${JSON.stringify(r.body)}`);
  return { m, orderCode: (r.body as { orderCode: string }).orderCode };
}

let seq = 0;

/** A CUSTOMER.DISPUTE.CREATED event shaped like PayPal's, on the given capture and custom_id. */
export function disputeEvent(opts: { captureId?: string | null; customId?: string | null; amount?: string; reason?: string; type?: string; status?: string; disputeId?: string; eventId?: string }) {
  const n = ++seq;
  return {
    id: opts.eventId ?? `WH-TEST-${n}-${crypto.randomUUID().slice(0, 8)}`,
    event_version: "1.0",
    create_time: "2026-11-03T15:20:00Z",
    resource_type: "dispute",
    event_type: opts.type ?? "CUSTOMER.DISPUTE.CREATED",
    summary: "A new dispute opened",
    resource: {
      dispute_id: opts.disputeId ?? `PP-D-TEST-${n}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
      create_time: "2026-11-03T15:20:00Z",
      update_time: "2026-11-03T15:20:00Z",
      reason: opts.reason ?? "UNAUTHORISED",
      status: opts.status ?? "WAITING_FOR_SELLER_RESPONSE",
      dispute_life_cycle_stage: "INQUIRY",
      dispute_amount: { currency_code: "USD", value: opts.amount ?? "103.92" },
      seller_response_due_date: "2026-11-13T15:20:00Z",
      disputed_transactions: [
        {
          seller_transaction_id: opts.captureId ?? "UNKNOWN-CAPTURE",
          custom: opts.customId ?? undefined,
          gross_amount: { currency_code: "USD", value: opts.amount ?? "103.92" },
        },
      ],
    },
  };
}

export const SIGNED_HEADERS = {
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-test",
  "paypal-transmission-id": "tx-test",
  "paypal-transmission-sig": "sig-test",
  "paypal-transmission-time": "2026-11-03T15:20:01Z",
};

/** Verifier stand in: accepts only the test signature. */
export const fakeVerify = async ({ headers }: { headers: Record<string, string> }) => headers["paypal-transmission-sig"] === "sig-test";

/** Records evidence submissions; can be told to reject like PayPal does. */
export function fakeDisputes(mode: "accept" | "reject" = "accept") {
  const submissions: { disputeId: string; submission: EvidenceSubmission }[] = [];
  const client: DisputesClient = {
    async provideEvidence(disputeId, submission) {
      submissions.push({ disputeId, submission });
      if (mode === "reject") {
        throw new PayPalApiError(422, "UNPROCESSABLE_ENTITY", "The requested action could not be performed.", "dbg-422", [
          { issue: "INVALID_EVIDENCE_FILE", description: "The evidence file is not valid." },
        ]);
      }
      return { status: "UNDER_REVIEW" };
    },
  };
  return { client, submissions };
}
