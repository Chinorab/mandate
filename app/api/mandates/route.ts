import * as api from "@/lib/api/mandates";
import { mandateDeps, respond } from "@/lib/api/http";

export async function GET() {
  return respond(async (s) => api.listMandates(await mandateDeps(), s));
}
