import { describe, expect, it } from "vitest";
import {
  PayPalApiError,
  PayPalConfigError,
  SANDBOX_BASE,
  createPayPalClient,
  sandboxBase,
} from "@/lib/payments/paypal-rest";

const env = { PAYPAL_CLIENT_ID: "client-id", PAYPAL_CLIENT_SECRET: "client-secret" };

type Call = { url: string; init: RequestInit | undefined };

function fakeFetch(responses: Array<(c: Call) => Response>) {
  const calls: Call[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    const next = responses.shift();
    if (!next) throw new Error(`Unexpected request ${url}`);
    return next(call);
  };
  return { fetch, calls };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => () =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const token = (t = "tok-1", expires = 3600) => json(200, { access_token: t, expires_in: expires });

describe("sandbox guard", () => {
  it("defaults to the sandbox", () => {
    expect(sandboxBase({})).toBe(SANDBOX_BASE);
  });
  it("refuses the live API or any other host", () => {
    expect(() => sandboxBase({ PAYPAL_API_BASE: "https://api-m.paypal.com" })).toThrow(PayPalConfigError);
    expect(() => sandboxBase({ PAYPAL_API_BASE: "https://evil.example" })).toThrow(PayPalConfigError);
  });
  it("requires credentials", async () => {
    const c = createPayPalClient({ env: {}, fetch: fakeFetch([]).fetch });
    await expect(c.request("/v2/checkout/orders/X")).rejects.toThrow(PayPalConfigError);
  });
});

describe("requests", () => {
  it("authenticates once and reuses the cached token", async () => {
    const f = fakeFetch([token(), json(200, { id: "A" }), json(200, { id: "B" })]);
    const c = createPayPalClient({ env, fetch: f.fetch });
    expect(await c.request<{ id: string }>("/v2/checkout/orders/A")).toEqual({ id: "A" });
    expect(await c.request<{ id: string }>("/v2/checkout/orders/B")).toEqual({ id: "B" });
    expect(f.calls.filter((x) => x.url.endsWith("/v1/oauth2/token"))).toHaveLength(1);
    const auth = (f.calls[1].init?.headers as Record<string, string>).Authorization;
    expect(auth).toBe("Bearer tok-1");
    expect(f.calls[0].url).toBe(`${SANDBOX_BASE}/v1/oauth2/token`);
  });

  it("refreshes the token after expiry", async () => {
    let t = 0;
    const f = fakeFetch([token("t1", 120), json(200, {}), token("t2", 120), json(200, {})]);
    const c = createPayPalClient({ env, fetch: f.fetch, now: () => t });
    await c.request("/x");
    t = 61_000; // past expires_in - 60s
    await c.request("/x");
    expect((f.calls[3].init?.headers as Record<string, string>).Authorization).toBe("Bearer t2");
  });

  it("refreshes once on 401", async () => {
    const f = fakeFetch([token("old"), json(401, {}), token("new"), json(200, { ok: true })]);
    const c = createPayPalClient({ env, fetch: f.fetch });
    expect(await c.request("/x")).toEqual({ ok: true });
  });

  it("sends the PayPal-Request-Id and JSON body", async () => {
    const f = fakeFetch([token(), json(201, { id: "O1" })]);
    const c = createPayPalClient({ env, fetch: f.fetch });
    await c.request("/v2/checkout/orders", { method: "POST", json: { intent: "CAPTURE" }, requestId: "req-1" });
    const h = f.calls[1].init?.headers as Record<string, string>;
    expect(h["PayPal-Request-Id"]).toBe("req-1");
    expect(f.calls[1].init?.body).toBe('{"intent":"CAPTURE"}');
  });

  it("retries 5xx for idempotent requests only", async () => {
    const ok = fakeFetch([token(), json(503, {}), json(200, { ok: 1 })]);
    await expect(createPayPalClient({ env, fetch: ok.fetch }).request("/x")).resolves.toEqual({ ok: 1 });

    const noRetry = fakeFetch([token(), json(503, { name: "SERVICE_UNAVAILABLE", message: "down" })]);
    await expect(
      createPayPalClient({ env, fetch: noRetry.fetch }).request("/x", { method: "POST", json: {} }),
    ).rejects.toBeInstanceOf(PayPalApiError);
  });

  it("maps PayPal error bodies", async () => {
    const f = fakeFetch([
      token(),
      json(422, { name: "UNPROCESSABLE_ENTITY", message: "bad", debug_id: "dbg1", details: [{ issue: "X" }] }),
    ]);
    const err = await createPayPalClient({ env, fetch: f.fetch })
      .request("/x", { method: "POST", json: {} })
      .catch((e) => e);
    expect(err).toBeInstanceOf(PayPalApiError);
    expect(err).toMatchObject({ status: 422, issue: "UNPROCESSABLE_ENTITY", debugId: "dbg1" });
  });

  it("asks for a browser client token", async () => {
    const f = fakeFetch([json(200, { access_token: "browser", expires_in: 900 })]);
    const t = await createPayPalClient({ env, fetch: f.fetch }).browserClientToken();
    expect(t).toEqual({ token: "browser", expiresIn: 900 });
    expect(String(f.calls[0].init?.body)).toContain("response_type=client_token");
  });
});
