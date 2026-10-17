import { describe, expect, it } from "vitest";
import { devScenariosEnabled } from "@/lib/dev/scenario";

describe("development scenario route", () => {
  it("is off unless running next dev with the explicit flag", () => {
    expect(devScenariosEnabled({ NODE_ENV: "production", MANDATE_DEV_SCENARIOS: "1" })).toBe(false);
    expect(devScenariosEnabled({ NODE_ENV: "test", MANDATE_DEV_SCENARIOS: "1" })).toBe(false);
    expect(devScenariosEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(devScenariosEnabled({ NODE_ENV: "development", MANDATE_DEV_SCENARIOS: "true" })).toBe(false);
    expect(devScenariosEnabled({ NODE_ENV: "development", MANDATE_DEV_SCENARIOS: "1" })).toBe(true);
  });
});
