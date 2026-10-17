import * as api from "@/lib/api/mandates";
import { mandateDeps, readJson, respond } from "@/lib/api/http";

export async function POST(req: Request, ctx: RouteContext<"/api/mandates/[code]/vault/confirm">) {
  const { code } = await ctx.params;
  const body = await readJson(req);
  return respond(async (s) => api.vaultConfirm(await mandateDeps(), s, code, body));
}
