import { disputesClient, gateDeps, readJson, respond } from "@/lib/api/http";
import * as api from "@/lib/api/disputes";

/** Sends the evidence to PayPal; claimant only, after the accuracy statement (FR-031). */
export async function POST(req: Request, ctx: RouteContext<"/api/merchant/disputes/[id]/submit">) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  return respond(async (sessionId) => api.submit({ db: (await gateDeps()).db, disputes: disputesClient() }, sessionId, id, body));
}
