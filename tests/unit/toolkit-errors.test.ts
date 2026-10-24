/**
 * The PayPal Agent Toolkit returns PayPal errors as tool content instead of throwing (seen in the
 * sandbox, scripts/LEARNINGS.md). The wrapper must turn them into errors, so nothing reports a
 * refused call as done.
 */
import { describe, expect, it } from "vitest";
import { ToolkitError, wrapToolkit } from "@/lib/payments/toolkit";

function toolkitAnswering(content: unknown) {
  return wrapToolkit({
    getTools: () => [{ type: "function", function: { name: "create_shipment_tracking", parameters: { type: "object", properties: {} } } }],
    handleToolCall: async () => ({ content: typeof content === "string" ? content : JSON.stringify(content) }),
  });
}

describe("toolkit wrapper error handling", () => {
  it("throws on an errors array, with PayPal's issue", async () => {
    const t = toolkitAnswering({
      tracker_identifiers: [],
      errors: [{ name: "NOT_AUTHORIZED", message: "Authorization failed due to insufficient permissions", details: [{ issue: "USER_NOT_AUTHORIZED" }] }],
    });
    await expect(t.call("create_shipment_tracking", {})).rejects.toMatchObject({ name: "ToolkitError", issue: "USER_NOT_AUTHORIZED" });
  });

  it("throws on an ok false answer with an HTTP status", async () => {
    const t = toolkitAnswering({ ok: false, status: 403, code: "PAYPAL_API_HTTP_ERROR", message: "Unknown error" });
    const err = await t.call("create_shipment_tracking", {}).catch((e) => e);
    expect(err).toBeInstanceOf(ToolkitError);
    expect(err.status).toBe(403);
  });

  it("passes successful answers and plain text through", async () => {
    const ok = { tracker_identifiers: [{ transaction_id: "CAP1", tracking_number: "1Z999AA10123456784" }], errors: [] };
    expect(JSON.parse(await toolkitAnswering(ok).call("create_shipment_tracking", {}))).toEqual(ok);
    expect(await toolkitAnswering("done").call("create_shipment_tracking", {})).toBe("done");
  });
});
