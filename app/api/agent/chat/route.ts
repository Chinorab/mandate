import * as api from "@/lib/api/agent";
import { agentDeps, readJson, respond } from "@/lib/api/http";

export async function POST(req: Request) {
  const body = await readJson(req);
  return respond(async (s) => api.sendMessage(await agentDeps(), s, body));
}
