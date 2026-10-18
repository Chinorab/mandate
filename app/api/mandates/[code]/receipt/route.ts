import { NextResponse } from "next/server";
import * as api from "@/lib/api/history";
import { mandateDeps } from "@/lib/api/http";
import { NoSessionError, getSession } from "@/lib/session";

/** The receipt as a PDF download, for the session that owns the mandate only. */
export async function GET(_req: Request, ctx: RouteContext<"/api/mandates/[code]/receipt">) {
  const { code } = await ctx.params;
  let sessionId: string;
  try {
    sessionId = (await getSession()).id;
  } catch (err) {
    if (err instanceof NoSessionError) return NextResponse.json({ error: { code: "no_session", message: "Reload the page." } }, { status: 401 });
    throw err;
  }
  const r = await api.receipt(await mandateDeps(), sessionId, code);
  if (r.status !== 200) return NextResponse.json(r.body, { status: r.status });
  const bytes = r.body as Uint8Array;
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="mandate-receipt-${code}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
