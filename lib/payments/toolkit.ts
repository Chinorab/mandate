/**
 * PayPal Agent Toolkit (TypeScript, @paypal/agent-toolkit). Only read and tracking actions are
 * enabled; every tool that can move money is left off and refused even if asked for by name, so
 * agents can only pay through lib/payments/gate.ts (constitution I).
 *
 * The toolkit's provider neutral surface is used: getTools() gives JSON schemas that we hand to
 * Claude, and handleToolCall() runs a call against the PayPal sandbox.
 */

export const TOOLKIT_ACTIONS = {
  orders: { get: true },
  disputes: { list: true, get: true },
  shipment: { create: true, get: true },
  transactions: { list: true },
} as const;

/** Toolkit tools that move money or create payable objects. Never enabled, never callable. */
export const MONEY_MOVING_TOOLKIT_TOOLS = [
  "create_order",
  "pay_order",
  "create_refund",
  "accept_dispute_claim",
  "create_invoice",
  "send_invoice",
  "record_payment_for_invoice",
  "record_refund_for_invoice",
  "create_subscription",
  "update_subscription",
  "create_subscription_plan",
  "update_plan",
] as const;

/** A PayPal error the toolkit returned as tool content (it does not throw on its own). */
export class ToolkitError extends Error {
  constructor(
    readonly tool: string,
    message: string,
    readonly issue: string | null,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "ToolkitError";
  }
}

type ErrorShape = { ok?: boolean; status?: number; message?: string; errors?: { name?: string; message?: string; details?: { issue?: string }[] }[] };

/** Seen in the sandbox: `{ ok: false, status }` and `{ errors: [{ name, details: [{ issue }] }] }`. */
function toolkitError(tool: string, content: string): ToolkitError | null {
  let body: ErrorShape;
  try {
    body = JSON.parse(content) as ErrorShape;
  } catch {
    return null;
  }
  if (!body || typeof body !== "object") return null;
  const first = Array.isArray(body.errors) ? body.errors[0] : undefined;
  if (first) return new ToolkitError(tool, first.message ?? first.name ?? "PayPal refused the call", first.details?.[0]?.issue ?? first.name ?? null, null);
  if (body.ok === false) return new ToolkitError(tool, body.message ?? "PayPal refused the call", null, typeof body.status === "number" ? body.status : null);
  return null;
}

export type ToolkitToolDef = { name: string; description: string; parameters: Record<string, unknown> };

export type Toolkit = {
  tools(names: string[]): ToolkitToolDef[];
  call(name: string, args: Record<string, unknown>): Promise<string>;
};

type OpenAiShapedToolkit = {
  getTools(): { type: "function"; function: { name: string; description?: string; parameters?: Record<string, unknown> } }[];
  handleToolCall(call: { id: string; type: "function"; function: { name: string; arguments: string } }): Promise<{ content: unknown }>;
};

export function wrapToolkit(inner: OpenAiShapedToolkit): Toolkit {
  const money = new Set<string>(MONEY_MOVING_TOOLKIT_TOOLS);
  const available = new Map(
    inner
      .getTools()
      .filter((t) => !money.has(t.function.name))
      .map((t) => [
        t.function.name,
        { name: t.function.name, description: t.function.description ?? "", parameters: t.function.parameters ?? { type: "object", properties: {} } },
      ]),
  );
  return {
    tools(names) {
      return names.filter((n) => !money.has(n) && available.has(n)).map((n) => available.get(n)!);
    },
    async call(name, args) {
      if (money.has(name) || !available.has(name)) throw new Error(`Toolkit tool ${name} is not allowed`);
      const res = await inner.handleToolCall({
        id: `call_${crypto.randomUUID()}`,
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      });
      const content = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
      const err = toolkitError(name, content);
      if (err) throw err;
      return content;
    },
  };
}

let cached: Promise<Toolkit | null> | null = null;

/** Sandbox toolkit, or null when PayPal credentials are not configured. */
export function getToolkit(env: Record<string, string | undefined> = process.env): Promise<Toolkit | null> {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) return Promise.resolve(null);
  cached ??= (async () => {
    const { PayPalAgentToolkit } = await import("@paypal/agent-toolkit/openai");
    const inner = new PayPalAgentToolkit({
      clientId: env.PAYPAL_CLIENT_ID!,
      clientSecret: env.PAYPAL_CLIENT_SECRET!,
      configuration: { actions: TOOLKIT_ACTIONS as unknown as Record<string, Record<string, boolean>>, context: { sandbox: true } },
    });
    return wrapToolkit(inner as unknown as OpenAiShapedToolkit);
  })();
  return cached;
}
