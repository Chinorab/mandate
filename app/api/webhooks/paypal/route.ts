import { NextResponse } from "next/server";
import { webhookDeps } from "@/lib/api/http";
import { handlePayPalWebhook } from "@/lib/webhooks/dispatch";

/** PayPal webhooks: raw body, verified with PayPal before anything is stored (FR-027). No session. */
export async function POST(req: Request) {
  const raw = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });
  const r = await handlePayPalWebhook(await webhookDeps(), headers, raw);
  return NextResponse.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
