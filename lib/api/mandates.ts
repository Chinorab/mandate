/**
 * Mandate API handlers (contracts/http-api.md). Route files resolve the demo session and call these;
 * keeping the contract here makes it testable without a running server.
 */
import type { Db } from "@/lib/db/client";
import type { Drafter } from "@/lib/mandate/draft";
import * as svc from "@/lib/mandate/service";
import type { VaultClient } from "@/lib/payments/vault";

export type MandateView = svc.MandateView;
export type MandateDeps = { db: Db; drafter: Drafter; vault: VaultClient | null; now?: () => Date };
import { handle, type ApiResult } from "./result";

export type { ApiError, ApiResult } from "./result";
export type MandateBody = { mandate: MandateView };
export type VerifyBody = { versions: Awaited<ReturnType<typeof svc.verifyMandate>> };

const now = (d: MandateDeps) => (d.now ?? (() => new Date()))();

export const createDraft = (d: MandateDeps, sessionId: string, body: { instructions?: unknown; manual?: unknown }) =>
  handle(201, async () => ({
    mandate: await svc.createDraft(d.db, d.drafter, sessionId, body?.instructions, now(d), { manual: body?.manual === true }),
  }));

export const redraft = (d: MandateDeps, sessionId: string, code: string, body: { instructions?: unknown }) =>
  handle(200, async () => ({ mandate: await svc.redraft(d.db, d.drafter, sessionId, code, body?.instructions, now(d)) }));

export const updateDraft = (d: MandateDeps, sessionId: string, code: string, body: { terms?: unknown }) =>
  handle(200, async () => ({ mandate: await svc.updateDraft(d.db, sessionId, code, body?.terms) }));

export const signMandate = (d: MandateDeps, sessionId: string, code: string, body: unknown) =>
  handle(200, async () => ({ mandate: await svc.signMandate(d.db, sessionId, code, body, now(d)) }));

export const getMandate = (d: MandateDeps, sessionId: string, code: string) =>
  handle(200, async () => ({ mandate: await svc.getMandate(d.db, sessionId, code) }));

export const listMandates = (d: MandateDeps, sessionId: string) =>
  handle(200, async () => ({ mandates: await svc.listMandates(d.db, sessionId) }));

export const discardDraft = async (d: MandateDeps, sessionId: string, code: string): Promise<ApiResult<null>> => {
  const r = await handle(204, async () => {
    await svc.discardDraft(d.db, sessionId, code);
    return null;
  });
  return r;
};

export const verifyMandate = (d: MandateDeps, sessionId: string, code: string) =>
  handle(200, async () => ({ versions: await svc.verifyMandate(d.db, sessionId, code) }));

export const vaultSetupToken = (d: MandateDeps, sessionId: string, code: string, origin = "http://localhost:3000") =>
  handle(200, () => svc.startPayPalLink(d.db, d.vault, sessionId, code, origin));

export const vaultConfirm = (d: MandateDeps, sessionId: string, code: string, body: unknown) =>
  handle(200, async () => ({ mandate: await svc.confirmPayPalLink(d.db, d.vault, sessionId, code, body) }));
