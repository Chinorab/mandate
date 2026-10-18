import { gateDeps, respond } from "@/lib/api/http";
import * as api from "@/lib/api/disputes";

export async function POST() {
  return respond(async (sessionId) => api.claim((await gateDeps()).db, sessionId));
}
