import * as api from "@/lib/api/carts";
import { gateDeps, respond } from "@/lib/api/http";

export async function GET(_req: Request, ctx: RouteContext<"/api/carts/[id]/check">) {
  const { id } = await ctx.params;
  return respond(async (s) => api.getCheckView((await gateDeps()).db, s, id));
}

export async function POST(_req: Request, ctx: RouteContext<"/api/carts/[id]/check">) {
  const { id } = await ctx.params;
  return respond(async (s) => api.runCheck(await gateDeps(), s, id));
}
