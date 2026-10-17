/** Browser side calls to the mandate API. Types only from the server modules. */
import type { DraftTerms } from "@/lib/mandate/draft";
import type { ChatItem } from "@/lib/agents/display";
import type { CheckView } from "@/lib/api/carts";
import type { MandateView } from "@/lib/mandate/service";

export type { ChatItem, CheckView, DraftTerms, MandateView };

export class ApiCallError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; details?: Record<string, unknown> } }).error ?? {};
    throw new ApiCallError(res.status, e.code ?? "error", e.message ?? "Something went wrong. Try again.", e.details);
  }
  return data as T;
}

type One = { mandate: MandateView };

export const mandateApi = {
  draft: (instructions: string, manual = false) => call<One>("/api/mandates/draft", { method: "POST", body: { instructions, manual } }),
  redraft: (code: string, instructions: string) => call<One>(`/api/mandates/${code}`, { method: "PATCH", body: { instructions } }),
  update: (code: string, terms: DraftTerms) => call<One>(`/api/mandates/${code}`, { method: "PATCH", body: { terms } }),
  get: (code: string) => call<One>(`/api/mandates/${code}`),
  discard: (code: string) => call<void>(`/api/mandates/${code}`, { method: "DELETE" }),
  sign: (code: string) => call<One>(`/api/mandates/${code}/sign`, { method: "POST", body: { confirm: true } }),
  setupToken: (code: string) => call<{ setupTokenId: string }>(`/api/mandates/${code}/vault/setup-token`, { method: "POST" }),
  confirmLink: (code: string, vaultSetupToken: string) =>
    call<One>(`/api/mandates/${code}/vault/confirm`, { method: "POST", body: { vaultSetupToken } }),
  clientToken: () => call<{ accessToken: string; expiresIn: number }>("/api/paypal/client-token"),
};

export const agentApi = {
  thread: (code: string) => call<{ items: ChatItem[] }>(`/api/agent/thread?mandate=${encodeURIComponent(code)}`),
  send: (code: string, message: string) => call<{ items: ChatItem[] }>("/api/agent/chat", { method: "POST", body: { mandateCode: code, message } }),
};

export const cartApi = {
  view: (id: string) => call<{ view: CheckView }>(`/api/carts/${id}/check`),
  check: (id: string) => call<{ view: CheckView }>(`/api/carts/${id}/check`, { method: "POST" }),
  pay: (id: string) => call<{ orderCode: string; view: CheckView }>(`/api/carts/${id}/pay`, { method: "POST" }),
  cancel: (id: string) => call<{ status: string }>(`/api/carts/${id}/cancel`, { method: "POST" }),
};
