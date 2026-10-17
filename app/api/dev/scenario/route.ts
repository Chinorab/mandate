import { NextResponse } from "next/server";
import { gateDeps, respond } from "@/lib/api/http";
import { createScenario, devScenariosEnabled } from "@/lib/dev/scenario";

/** Development only fixture for end to end tests (see lib/dev/scenario.ts). */
export async function POST() {
  if (!devScenariosEnabled()) return new NextResponse(null, { status: 404 });
  return respond(async (s) => ({ status: 201, body: await createScenario(await gateDeps(), s) }));
}
