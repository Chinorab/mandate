import { gateDeps, respond } from "@/lib/api/http";
import * as api from "@/lib/api/merchant";

export async function GET() {
  return respond(async () => api.listOrders((await gateDeps()).db));
}
