import { desc, eq, sql } from "drizzle-orm";
import { NextResponse, connection } from "next/server";
import { getDb } from "@/lib/db/client";
import { paypalEvent } from "@/lib/db/schema";

/**
 * Health for Render's deploy check and the uptime workflow. Says which services are configured,
 * never their values. No session cookie is set (excluded in proxy.ts).
 */
export async function GET() {
  await connection();
  let db = "ok";
  // Type and time of the last verified PayPal event: shows webhooks reach the host, without ids.
  let lastPayPalEvent: { type: string; at: string } | null = null;
  try {
    const conn = await getDb();
    await conn.execute(sql`select 1`);
    const [e] = await conn
      .select({ type: paypalEvent.eventType, at: paypalEvent.receivedAt })
      .from(paypalEvent)
      .where(eq(paypalEvent.verified, true))
      .orderBy(desc(paypalEvent.receivedAt))
      .limit(1);
    lastPayPalEvent = e ? { type: e.type, at: e.at.toISOString() } : null;
  } catch {
    db = "down";
  }
  const body = {
    ok: db === "ok",
    db,
    paypal: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
    webhook: Boolean(process.env.PAYPAL_WEBHOOK_ID),
    model: Boolean(process.env.ANTHROPIC_API_KEY),
    lastPayPalEvent,
    commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null,
  };
  return NextResponse.json(body, { status: body.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
