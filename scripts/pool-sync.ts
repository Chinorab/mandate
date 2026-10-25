/**
 * Operator procedure (FR-032): bring the open sandbox disputes into the demo pool.
 *
 *   pnpm pool:sync            list, report what would change
 *   pnpm pool:sync --apply    also move UNDER_REVIEW cases to WAITING_FOR_SELLER_RESPONSE (sandbox
 *                             require-evidence) and store each case with its evidence file and draft
 *
 * Uses the same processing as a verified webhook, so a case the webhook already delivered is left as
 * is. Drafts here use the fixed template wording (no model call). Reads PAYPAL_CLIENT_ID,
 * PAYPAL_CLIENT_SECRET and DATABASE_URL from the environment or .env.local; never prints them.
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const apply = process.argv.includes("--apply");
  const { sandboxDisputes, disputesConfigured } = await import("../lib/payments/disputes");
  if (!disputesConfigured()) throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required (sandbox).");
  const { openDb } = await import("../lib/db/client");
  const { templateDrafter } = await import("../lib/disputes/draft");
  const { processEvent } = await import("../lib/webhooks/dispatch");

  const paypal = sandboxDisputes(process.env);
  const listed = await paypal.listOpen();
  console.log(`${listed.length} open sandbox disputes need a seller action.`);
  if (!apply) {
    for (const d of listed) console.log(`  ${d.dispute_id}  ${d.status}  ${d.reason ?? ""}`);
    console.log("Run with --apply to add them to the pool.");
    return;
  }

  const handle = await openDb();
  await handle.ready;
  try {
    for (const summary of listed) {
      let d = await paypal.get(summary.dispute_id);
      if (d.status === "UNDER_REVIEW") {
        await paypal.requireEvidence(d.dispute_id);
        d = await paypal.get(d.dispute_id);
      }
      await processEvent(
        { db: handle.db, drafter: templateDrafter, enqueue: (job) => job.run() },
        { id: `SYNC-${d.dispute_id}`, event_type: "CUSTOMER.DISPUTE.UPDATED", resource: d as unknown as Record<string, unknown> },
      );
      console.log(`  ${d.dispute_id}  ${d.status}  stored`);
    }
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
