import { describe, expect, it } from "vitest";
import { newSessionToken, sessionSecret, signSession, verifySession } from "@/lib/session/token";

const SECRET = "x".repeat(40);

describe("session token", () => {
  it("round trips a signed id", async () => {
    const { id, token } = await newSessionToken(SECRET);
    expect(await verifySession(token, SECRET)).toBe(id);
  });

  it("rejects a token signed with another secret", async () => {
    const { token } = await newSessionToken("y".repeat(40));
    expect(await verifySession(token, SECRET)).toBeNull();
  });

  it("rejects a swapped id with a valid looking signature", async () => {
    const a = await newSessionToken(SECRET);
    const b = await newSessionToken(SECRET);
    const forged = `${b.id}.${a.token.split(".")[1]}`;
    expect(await verifySession(forged, SECRET)).toBeNull();
  });

  it("rejects malformed tokens", async () => {
    for (const t of [undefined, "", "abc", "not-a-uuid.sig", `${crypto.randomUUID()}`]) {
      expect(await verifySession(t, SECRET)).toBeNull();
    }
    expect(await verifySession(await signSession("not-a-uuid", SECRET), SECRET)).toBeNull();
  });

  it("requires a real secret in production", () => {
    expect(() => sessionSecret({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toThrow();
    expect(sessionSecret({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBeTruthy();
  });
});
