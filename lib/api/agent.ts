/** Shopping agent API handlers: send a message, read the conversation. */
import { enrich, type ChatItem } from "@/lib/agents/display";
import { agentTurn, getThread, type AgentDeps } from "@/lib/agents/shopping";
import { loadMandateContext } from "@/lib/mandate/context";
import { MandateError } from "@/lib/mandate/service";
import { handle, type ApiResult } from "./result";

export type ChatBody = { items: ChatItem[] };

async function withCards(deps: AgentDeps, sessionId: string, code: string, items: Awaited<ReturnType<typeof getThread>>) {
  const ctx = await loadMandateContext(deps.gate.db, sessionId, code);
  if (!ctx) throw new MandateError(404, "not_found", "No such mandate");
  return enrich(deps.gate.db, ctx, items, (deps.now ?? (() => new Date()))());
}

export const sendMessage = (deps: AgentDeps, sessionId: string, body: { mandateCode?: unknown; message?: unknown }): Promise<ApiResult<ChatBody>> =>
  handle(200, async () => {
    const code = String(body?.mandateCode ?? "");
    const items = await agentTurn(deps, { sessionId, mandateCode: code, text: body?.message });
    return { items: await withCards(deps, sessionId, code, items) };
  });

export const readThread = (deps: AgentDeps, sessionId: string, code: string): Promise<ApiResult<ChatBody>> =>
  handle(200, async () => ({ items: await withCards(deps, sessionId, code, await getThread(deps, sessionId, code)) }));
