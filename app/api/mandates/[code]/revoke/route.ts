import * as api from "@/lib/api/history";
import { mandateDeps, readJson, respond } from "@/lib/api/http";

export async function POST(req: Request, ctx: RouteContext<"/api/mandates/[code]/revoke">) {
  const { code } = await ctx.params;
  const body = await readJson(req);
  return respond(async (s) => api.revoke(await mandateDeps(), s, code, body));
}
