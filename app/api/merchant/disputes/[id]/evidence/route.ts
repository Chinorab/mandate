import { gateDeps, readJson, respond } from "@/lib/api/http";
import * as api from "@/lib/api/disputes";

export async function PATCH(req: Request, ctx: RouteContext<"/api/merchant/disputes/[id]/evidence">) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  return respond(async (sessionId) => api.saveEvidence((await gateDeps()).db, sessionId, id, body));
}
