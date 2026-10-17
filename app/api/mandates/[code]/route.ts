import * as api from "@/lib/api/mandates";
import { mandateDeps, readJson, respond } from "@/lib/api/http";

export async function GET(_req: Request, ctx: RouteContext<"/api/mandates/[code]">) {
  const { code } = await ctx.params;
  return respond(async (s) => api.getMandate(await mandateDeps(), s, code));
}

/** { terms } edits a draft term by term; { instructions } drafts the terms again from new words. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/mandates/[code]">) {
  const { code } = await ctx.params;
  const body = await readJson(req);
  return respond(async (s) =>
    "instructions" in body ? api.redraft(await mandateDeps(), s, code, body) : api.updateDraft(await mandateDeps(), s, code, body),
  );
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/mandates/[code]">) {
  const { code } = await ctx.params;
  return respond(async (s) => api.discardDraft(await mandateDeps(), s, code));
}
