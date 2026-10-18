import { gateDeps, respond } from "@/lib/api/http";
import * as api from "@/lib/api/disputes";

export async function GET(_req: Request, ctx: RouteContext<"/api/merchant/disputes/[id]">) {
  const { id } = await ctx.params;
  return respond(async (sessionId) => api.getDispute((await gateDeps()).db, sessionId, id));
}
