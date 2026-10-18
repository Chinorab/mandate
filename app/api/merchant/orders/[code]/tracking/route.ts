import { gateDeps, readJson, respond } from "@/lib/api/http";
import * as api from "@/lib/api/merchant";
import { getToolkit } from "@/lib/payments/toolkit";

export async function POST(req: Request, ctx: RouteContext<"/api/merchant/orders/[code]/tracking">) {
  const { code } = await ctx.params;
  const body = await readJson(req);
  return respond(async () => api.addTracking((await gateDeps()).db, await getToolkit(), code, body));
}
