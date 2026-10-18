import * as api from "@/lib/api/history";
import { mandateDeps, respond } from "@/lib/api/http";

export async function GET(_req: Request, ctx: RouteContext<"/api/mandates/[code]/activity">) {
  const { code } = await ctx.params;
  return respond(async (s) => api.activity(await mandateDeps(), s, code));
}
