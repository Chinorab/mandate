import { NextResponse } from "next/server";
import { gateDeps, readJson, respond } from "@/lib/api/http";
import { createDisputeScenario } from "@/lib/dev/disputes";
import { createMerchantScenario, createScenario, devScenariosEnabled, linkWithSandboxToken } from "@/lib/dev/scenario";

/** Development only fixtures for end to end tests (see lib/dev/scenario.ts). */
export async function POST(req: Request) {
  if (!devScenariosEnabled()) return new NextResponse(null, { status: 404 });
  const body = await readJson(req);
  if (body.kind === "link" && typeof body.code === "string") {
    const code = body.code;
    return respond(async (s) => ({ status: 201, body: await linkWithSandboxToken((await gateDeps()).db, s, code) }));
  }
  if (body.kind === "dispute") return respond(async (s) => ({ status: 201, body: await createDisputeScenario(await gateDeps(), s) }));
  if (body.kind === "merchant") return respond(async () => ({ status: 201, body: await createMerchantScenario(await gateDeps()) }));
  return respond(async (s) => ({ status: 201, body: await createScenario(await gateDeps(), s) }));
}
