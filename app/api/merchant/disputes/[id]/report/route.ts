import { NextResponse } from "next/server";
import * as api from "@/lib/api/disputes";
import { gateDeps } from "@/lib/api/http";

/** The evidence report PDF with the items currently included, shown inline. */
export async function GET(_req: Request, ctx: RouteContext<"/api/merchant/disputes/[id]/report">) {
  const { id } = await ctx.params;
  const r = await api.report((await gateDeps()).db, id);
  if (r.status !== 200) return NextResponse.json(r.body, { status: r.status });
  const { name, bytes } = r.body as { name: string; bytes: Uint8Array };
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
