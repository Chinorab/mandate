import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

// Same env files as the dev server, so tests can tell which services are configured (keys stay local).
config({ path: [".env.local"], quiet: true });

const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
const isLocal = baseURL.startsWith("http://localhost");

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: isLocal
    ? { command: "pnpm dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 }
    : undefined,
});
