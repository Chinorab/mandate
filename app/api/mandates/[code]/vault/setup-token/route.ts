import * as api from "@/lib/api/mandates";
import { mandateDeps, respond } from "@/lib/api/http";

export async function POST(req: Request, ctx: RouteContext<"/api/mandates/[code]/vault/setup-token">) {
  const { code } = await ctx.params;
  const origin = new URL(req.url).origin;
  return respond(async (s) => api.vaultSetupToken(await mandateDeps(), s, code, origin));
}
