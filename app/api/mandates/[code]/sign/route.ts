import * as api from "@/lib/api/mandates";
import { mandateDeps, readJson, respond } from "@/lib/api/http";

export async function POST(req: Request, ctx: RouteContext<"/api/mandates/[code]/sign">) {
  const { code } = await ctx.params;
  const body = await readJson(req);
  return respond(async (s) => api.signMandate(await mandateDeps(), s, code, body));
}
