import * as api from "@/lib/api/carts";
import { gateDeps, respond } from "@/lib/api/http";

export async function POST(_req: Request, ctx: RouteContext<"/api/carts/[id]/cancel">) {
  const { id } = await ctx.params;
  return respond(async (s) => api.cancel((await gateDeps()).db, s, id));
}
