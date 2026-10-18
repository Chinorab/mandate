import * as api from "@/lib/api/amend";
import { gateDeps, respond } from "@/lib/api/http";

export async function GET(_req: Request, ctx: RouteContext<"/api/carts/[id]/options">) {
  const { id } = await ctx.params;
  return respond(async (s) => api.getOptions(await gateDeps(), s, id));
}
