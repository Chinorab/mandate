import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { browserClientToken, paypalConfigured } from "@/lib/payments/vault";

/** Short lived, browser safe token for the PayPal JS SDK v6. The client secret never leaves the server. */
export async function GET() {
  await getSession();
  if (!paypalConfigured()) {
    return NextResponse.json({ error: { code: "paypal_not_configured", message: "PayPal sandbox is not configured on this server." } }, { status: 503 });
  }
  const t = await browserClientToken();
  return NextResponse.json({ accessToken: t.token, expiresIn: t.expiresIn }, { headers: { "Cache-Control": "no-store" } });
}
