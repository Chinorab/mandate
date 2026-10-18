/** History handlers: revoke, activity, receipt (US4). */
import { loadActivity, type Activity } from "@/lib/mandate/activity";
import { renderReceipt } from "@/lib/mandate/receipt";
import { revokeMandate } from "@/lib/mandate/revoke";
import type { MandateBody, MandateDeps } from "./mandates";
import { handle, type ApiResult } from "./result";

export type ActivityBody = Activity;

const now = (d: MandateDeps) => (d.now ?? (() => new Date()))();

export const revoke = (d: MandateDeps, sessionId: string, code: string, body: unknown): Promise<ApiResult<MandateBody>> =>
  handle(200, async () => ({ mandate: await revokeMandate(d.db, d.vault, sessionId, code, body, now(d)) }));

export const activity = (d: MandateDeps, sessionId: string, code: string): Promise<ApiResult<ActivityBody>> =>
  handle(200, () => loadActivity(d.db, sessionId, code, now(d)));

export const receipt = (d: MandateDeps, sessionId: string, code: string): Promise<ApiResult<Uint8Array>> =>
  handle(200, async () => renderReceipt(await loadActivity(d.db, sessionId, code, now(d)), now(d)));
