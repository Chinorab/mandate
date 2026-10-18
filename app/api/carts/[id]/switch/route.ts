import * as api from "@/lib/api/amend";
import { gateDeps, respond } from "@/lib/api/http";

export async function POST(_req: Request, ctx: RouteContext<"/api/carts/[id]/switch">) {
  const { id } = await ctx.params;
  return respond(async (s) => api.switchToAlternative(await gateDeps(), s, id));
}
