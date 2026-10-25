import "server-only";
import { NextResponse } from "next/server";
import type { AgentDeps } from "@/lib/agents/shopping";
import { getDb } from "@/lib/db/client";
import { gateDeps } from "@/lib/payments/deps";
import { getToolkit } from "@/lib/payments/toolkit";
import { createDrafter } from "@/lib/mandate/draft";
import { NoSessionError, getSession } from "@/lib/session";
import { createVaultClient, paypalConfigured } from "@/lib/payments/vault";
import { createMerchantDrafter } from "@/lib/agents/merchant";
import { enqueueEvidence } from "@/lib/disputes/enqueue";
import { devDisputesClient } from "@/lib/dev/disputes";
import { createDisputesClient, disputesConfigured, type DisputesClient } from "@/lib/payments/disputes";
import { createWebhookVerifier } from "@/lib/payments/webhooks";
import type { WebhookDeps } from "@/lib/webhooks/dispatch";
import type { ApiResult, MandateDeps } from "./mandates";

/** Production dependencies for the mandate handlers. */
export async function mandateDeps(): Promise<MandateDeps> {
  return { db: await getDb(), drafter: createDrafter(), vault: paypalConfigured() ? createVaultClient() : null };
}

export async function agentDeps(): Promise<AgentDeps> {
  return { gate: await gateDeps(), toolkit: await getToolkit() };
}

export { gateDeps };

/** Webhook dependencies: PayPal signature check, Claude merchant drafter, assembly after the response. */
export async function webhookDeps(): Promise<WebhookDeps> {
  const db = await getDb();
  return { db, verify: createWebhookVerifier(), drafter: createMerchantDrafter(db), enqueue: enqueueEvidence };
}

/** Sandbox disputes client, or null when PayPal is not configured (development fixtures aside). */
export function disputesClient(): DisputesClient | null {
  const real = disputesConfigured() ? createDisputesClient() : null;
  return devDisputesClient(real) ?? real;
}

/** Resolves the demo session, runs the handler, and turns its result into a JSON response. */
export async function respond<T>(run: (sessionId: string) => Promise<ApiResult<T>>): Promise<NextResponse> {
  let sessionId: string;
  try {
    sessionId = (await getSession()).id;
  } catch (err) {
    if (err instanceof NoSessionError) {
      return NextResponse.json({ error: { code: "no_session", message: "Reload the page to start a demo session." } }, { status: 401 });
    }
    throw err;
  }
  const r = await run(sessionId);
  if (r.status === 204) return new NextResponse(null, { status: 204 });
  return NextResponse.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
