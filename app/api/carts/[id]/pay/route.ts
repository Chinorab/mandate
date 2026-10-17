import * as api from "@/lib/api/carts";
import { gateDeps, respond } from "@/lib/api/http";

/** The request body is ignored: the consent gate reads everything it needs from the database. */
export async function POST(_req: Request, ctx: RouteContext<"/api/carts/[id]/pay">) {
  const { id } = await ctx.params;
  return respond(async (s) => api.pay(await gateDeps(), s, id));
}
