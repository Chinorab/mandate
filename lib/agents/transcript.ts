/**
 * Turns the stored Messages API transcript into what the buyer sees: their messages, the agent's
 * text, product cards (present_options), cart, check and payment events. Pure, no I/O.
 */

type Block = { type: string; [k: string]: unknown };
export type StoredMessage = { role: "user" | "assistant"; content: string | Block[] };

export type DisplayItem =
  | { kind: "user"; text: string; at: string | null }
  | { kind: "agent"; text: string; at: string | null }
  | { kind: "options"; productIds: string[]; size: string | null; at: string | null }
  | { kind: "cart"; cartId: string; product: string; store: string; totalCents: number; at: string | null }
  | { kind: "check"; cartId: string; verdict: "pass" | "fail"; passed: number; total: number; at: string | null }
  | {
      kind: "payment";
      cartId: string;
      status: "paid" | "refused" | "not_paid";
      orderCode: string | null;
      failed: { term: string; explanation: string }[];
      at: string | null;
    };

const blocks = (m: StoredMessage): Block[] => (typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content);

function safeJson(text: unknown): Record<string, unknown> | null {
  if (typeof text !== "string") {
    if (Array.isArray(text)) {
      const t = text.find((b) => (b as Block).type === "text") as Block | undefined;
      return safeJson(t?.text);
    }
    return null;
  }
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

export function toDisplay(messages: StoredMessage[], times: (string | null)[] = []): DisplayItem[] {
  // tool_use_id -> parsed result
  const results = new Map<string, Record<string, unknown> | null>();
  for (const m of messages) {
    if (m.role !== "user") continue;
    for (const b of blocks(m)) if (b.type === "tool_result") results.set(String(b.tool_use_id), safeJson(b.content));
  }

  const items: DisplayItem[] = [];
  messages.forEach((m, i) => {
    const at = times[i] ?? null;
    if (m.role === "user") {
      const texts = blocks(m).filter((b) => b.type === "text");
      // The buyer's words are the last text block (earlier blocks may carry context).
      const last = texts[texts.length - 1];
      if (last && typeof last.text === "string" && last.text.trim()) items.push({ kind: "user", text: last.text, at });
      return;
    }
    for (const b of blocks(m)) {
      if (b.type === "text" && typeof b.text === "string" && b.text.trim()) {
        items.push({ kind: "agent", text: plainText(b.text), at });
      } else if (b.type === "tool_use") {
        const input = (b.input ?? {}) as Record<string, unknown>;
        const out = results.get(String(b.id)) ?? null;
        if (b.name === "present_options" && out && !out.error) {
          items.push({
            kind: "options",
            productIds: (input.productIds as string[]) ?? [],
            size: (input.size as string | null) ?? null,
            at,
          });
        } else if (b.name === "add_to_cart" && out?.cartId) {
          items.push({
            kind: "cart",
            cartId: String(out.cartId),
            product: String(out.product ?? ""),
            store: String(out.store ?? ""),
            totalCents: Number(out.totalCents ?? 0),
            at,
          });
        } else if (b.name === "check_cart" && out?.verdict) {
          const summary = (out.summary ?? {}) as { passed?: number; total?: number };
          items.push({
            kind: "check",
            cartId: String(input.cartId),
            verdict: out.verdict === "pass" ? "pass" : "fail",
            passed: summary.passed ?? 0,
            total: summary.total ?? 0,
            at,
          });
        } else if (b.name === "pay_cart" && out?.status) {
          items.push({
            kind: "payment",
            cartId: String(input.cartId),
            status: out.status as "paid" | "refused" | "not_paid",
            orderCode: (out.orderCode as string) ?? null,
            failed: (out.failed as { term: string; explanation: string }[]) ?? [],
            at,
          });
        }
      }
    }
  });
  return items;
}

/**
 * Agent messages are shown as plain text. The model is asked not to use Markdown but sometimes does;
 * this keeps the words and drops the markup: emphasis, code ticks, headings, list markers (also when a
 * list item follows a sentence on the same line), and dashes used as punctuation.
 */
export function plainText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/([.:!?])[ \t]+[-*•][ \t]+(?=\S)/g, "$1\n")
    .replace(/^[ \t]*(?:[-*•]|\d+[.)])[ \t]+/gm, "")
    .replace(/[ \t]+[–—][ \t]+/g, ", ")
    .replace(/[ \t]+-[ \t]+/g, ", ")
    .replace(/[–—]/g, ", ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}
