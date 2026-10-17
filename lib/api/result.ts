import { ModelUnavailableError } from "@/lib/ai/model";
import { MandateError } from "@/lib/mandate/service";
import { PayPalApiError, PayPalConfigError } from "@/lib/payments/errors";

export type ApiError = { error: { code: string; message: string; details?: Record<string, unknown> } };
export type ApiResult<T> = { status: number; body: T | ApiError | null };

export function apiError(status: number, code: string, message: string, details?: Record<string, unknown>): ApiResult<never> {
  return { status, body: { error: { code, message, details } } };
}

/** Runs a handler and maps known errors to HTTP results. Unknown errors propagate (500). */
export async function handle<T>(status: number, fn: () => Promise<T>): Promise<ApiResult<T>> {
  try {
    return { status, body: await fn() };
  } catch (err) {
    if (err instanceof MandateError) {
      return { status: err.status, body: { error: { code: err.code, message: err.message, details: err.details } } };
    }
    if (err instanceof ModelUnavailableError) {
      const capped = err.reason === "session_cap" || err.reason === "global_cap";
      if (err.reason === "not_configured") {
        return {
          status: 503,
          body: { error: { code: "model_not_configured", message: "The model is not configured on this server." } },
        };
      }
      return {
        status: capped ? 429 : 503,
        body: {
          error: {
            code: err.reason,
            message: capped
              ? "The demo has reached its daily limit for model calls. Try again tomorrow."
              : "The model is not available right now. Try again in a moment.",
          },
        },
      };
    }
    if (err instanceof PayPalConfigError) {
      return { status: 503, body: { error: { code: "paypal_not_configured", message: "PayPal sandbox is not configured on this server." } } };
    }
    if (err instanceof PayPalApiError) {
      return { status: 502, body: { error: { code: "paypal_error", message: "PayPal did not accept the request. Try again.", details: { debugId: err.debugId } } } };
    }
    throw err;
  }
}

