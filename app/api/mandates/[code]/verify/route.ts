import * as api from "@/lib/api/mandates";
import { mandateDeps, respond } from "@/lib/api/http";

export async function GET(_req: Request, ctx: RouteContext<"/api/mandates/[code]/verify">) {
  const { code } = await ctx.params;
  return respond(async (s) => api.verifyMandate(await mandateDeps(), s, code));
}
