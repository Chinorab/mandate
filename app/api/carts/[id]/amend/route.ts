import * as api from "@/lib/api/amend";
import { gateDeps, readJson, respond } from "@/lib/api/http";

/** Only { confirm, proposalHash } are read: the new terms are recomputed on the server. */
export async function POST(req: Request, ctx: RouteContext<"/api/carts/[id]/amend">) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  return respond(async (s) => api.approveAmendment(await gateDeps(), s, id, { confirm: body.confirm, proposalHash: body.proposalHash }));
}
