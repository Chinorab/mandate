import "server-only";
/**
 * Single entry point to Claude (official Anthropic SDK). Every call is counted against the model
 * usage caps before it is sent (FR-037). Model output is data: it never decides a numeric rule.
 *
 * Model: claude-sonnet-5-5, as the project brief requires. Server-side refusal fallback is on by
 * default ("default" routing), so a policy decline is retried on the server's chosen fallback model.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import type { Db } from "@/lib/db/client";
import { consumeModelCall } from "@/lib/ratelimit/model";

export const MODEL = "claude-sonnet-5-5";
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export type Effort = "low" | "medium" | "high";

export class ModelUnavailableError extends Error {
  constructor(
    readonly reason: "session_cap" | "global_cap" | "refusal" | "unparsed" | "api_error" | "not_configured",
    message?: string,
  ) {
    super(message ?? reason);
    this.name = "ModelUnavailableError";
  }
}

const globalForClient = globalThis as unknown as { __anthropic?: Anthropic };

export function getAnthropic(): Anthropic {
  // Resolves ANTHROPIC_API_KEY from the environment; never passed to the browser.
  globalForClient.__anthropic ??= new Anthropic({ maxRetries: 2, timeout: 60_000 });
  return globalForClient.__anthropic;
}

/**
 * One structured call: the response must validate against `schema`, else it is treated as
 * unavailable (callers then fail closed, for example a semantic term counts as not passed).
 */
export async function structuredCall<S extends z.ZodType>(opts: {
  db: Db;
  sessionId: string;
  system: string;
  prompt: string;
  schema: S;
  effort?: Effort;
  maxTokens?: number;
  client?: Anthropic;
}): Promise<z.infer<S>> {
  if (!opts.client && !process.env.ANTHROPIC_API_KEY) throw new ModelUnavailableError("not_configured");
  const cap = await consumeModelCall(opts.db, opts.sessionId);
  if (!cap.ok) throw new ModelUnavailableError(cap.reason);

  const client = opts.client ?? getAnthropic();
  let response;
  try {
    response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 4000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      // Stable system prompt first so it can be served from the prompt cache.
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: opts.prompt }],
      output_config: { format: betaZodOutputFormat(opts.schema), effort: opts.effort ?? "low" },
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      throw new ModelUnavailableError("api_error", `Model API error ${err.status ?? ""}`.trim());
    }
    throw err;
  }
  if (response.stop_reason === "refusal") throw new ModelUnavailableError("refusal");
  if (response.parsed_output == null) throw new ModelUnavailableError("unparsed");
  return response.parsed_output as z.infer<S>;
}
