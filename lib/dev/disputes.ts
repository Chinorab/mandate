/**
 * Development and end to end fixture for disputes. Creates paid merchant orders, then feeds
 * CUSTOMER.DISPUTE.CREATED events for some of them through the same processing as a verified webhook
 * (signature verification is the only step skipped), and claims the first one for the caller.
 *
 * Never available in production: the route returns 404 unless NODE_ENV is "development" and
 * MANDATE_DEV_SCENARIOS is "1". Case ids start with DEVPPD; only those are "accepted" by the
 * development disputes client, every other id goes to the real sandbox client.
 */
import { eq, inArray } from "drizzle-orm";
import { dispute, order } from "@/lib/db/schema";
import { templateDrafter } from "@/lib/disputes/draft";
import type { DisputesClient } from "@/lib/payments/disputes";
import { PayPalConfigError } from "@/lib/payments/errors";
import type { GateDeps } from "@/lib/payments/gate";
import { processEvent } from "@/lib/webhooks/dispatch";
import { createMerchantScenario, devScenariosEnabled } from "./scenario";

export const DEV_DISPUTE_PREFIX = "DEVPPD";

/** Accepts evidence for development cases; null outside development. */
export function devDisputesClient(real: DisputesClient | null, env: Record<string, string | undefined> = process.env): DisputesClient | null {
  if (!devScenariosEnabled(env)) return null;
  return {
    async provideEvidence(id, submission) {
      if (id.startsWith(DEV_DISPUTE_PREFIX)) return { status: "UNDER_REVIEW" };
      if (!real) throw new PayPalConfigError("PayPal sandbox is not configured");
      return real.provideEvidence(id, submission);
    },
  };
}

export async function createDisputeScenario(gate: GateDeps, sessionId: string) {
  const { orderCodes } = await createMerchantScenario(gate);
  // Index 1 is shipped with tracking, 0 is paid and not shipped, 2 is delivered (see the merchant fixture).
  const picked = [orderCodes[1], orderCodes[0], orderCodes[2]].filter(Boolean);
  const rows = await gate.db.select().from(order).where(inArray(order.code, picked));
  const now = Date.now();
  const disputeIds: string[] = [];
  for (const code of picked) {
    const o = rows.find((r) => r.code === code)!;
    const paypalId = `${DEV_DISPUTE_PREFIX}${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    await processEvent(
      { db: gate.db, drafter: templateDrafter, enqueue: (job) => job.run() },
      {
        id: `WH-DEV-${crypto.randomUUID()}`,
        event_type: "CUSTOMER.DISPUTE.CREATED",
        resource: {
          dispute_id: paypalId,
          create_time: new Date().toISOString(),
          reason: "UNAUTHORISED",
          status: "WAITING_FOR_SELLER_RESPONSE",
          dispute_life_cycle_stage: "INQUIRY",
          dispute_amount: { currency_code: "USD", value: (o.amountCents / 100).toFixed(2) },
          seller_response_due_date: new Date(now + 10 * 86_400_000).toISOString(),
          disputed_transactions: [{ seller_transaction_id: o.paypalCaptureId ?? undefined, custom: o.customId }],
        },
      },
    );
    const [d] = await gate.db.select({ id: dispute.id }).from(dispute).where(eq(dispute.paypalDisputeId, paypalId));
    disputeIds.push(d.id);
  }
  // The caller gets the first one, so the test knows what it is looking at.
  await gate.db.update(dispute).set({ claimedBySessionId: sessionId }).where(eq(dispute.id, disputeIds[0]));
  return { disputeIds, orderCodes: picked };
}
