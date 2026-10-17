import * as api from "@/lib/api/mandates";
import { mandateDeps, readJson, respond } from "@/lib/api/http";

export async function POST(req: Request) {
  const body = await readJson(req);
  return respond(async (s) => api.createDraft(await mandateDeps(), s, body));
}
