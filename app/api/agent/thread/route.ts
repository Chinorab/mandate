import type { NextRequest } from "next/server";
import * as api from "@/lib/api/agent";
import { agentDeps, respond } from "@/lib/api/http";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("mandate") ?? "";
  return respond(async (s) => api.readThread(await agentDeps(), s, code));
}
