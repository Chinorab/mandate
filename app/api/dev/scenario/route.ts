import { NextResponse } from "next/server";
import { gateDeps, readJson, respond } from "@/lib/api/http";
import { createMerchantScenario, createScenario, devScenariosEnabled } from "@/lib/dev/scenario";

/** Development only fixtures for end to end tests (see lib/dev/scenario.ts). */
export async function POST(req: Request) {
  if (!devScenariosEnabled()) return new NextResponse(null, { status: 404 });
  const body = await readJson(req);
  if (body.kind === "merchant") return respond(async () => ({ status: 201, body: await createMerchantScenario(await gateDeps()) }));
  return respond(async (s) => ({ status: 201, body: await createScenario(await gateDeps(), s) }));
}
