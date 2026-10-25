import { sql } from "drizzle-orm";
import { NextResponse, connection } from "next/server";
import { getDb } from "@/lib/db/client";

/**
 * Health for Render's deploy check and the uptime workflow. Says which services are configured,
 * never their values. No session cookie is set (excluded in proxy.ts).
 */
export async function GET() {
  await connection();
  let db = "ok";
  try {
    await (await getDb()).execute(sql`select 1`);
  } catch {
    db = "down";
  }
  const body = {
    ok: db === "ok",
    db,
    paypal: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
    webhook: Boolean(process.env.PAYPAL_WEBHOOK_ID),
    model: Boolean(process.env.ANTHROPIC_API_KEY),
    commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null,
  };
  return NextResponse.json(body, { status: body.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
