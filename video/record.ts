/**
 * Films the demo scenes on the local app with Playwright (1280x720, one WebM per scene), for the
 * narration in video/narration.json. Every scene is the real app: Claude drafts the terms and runs the
 * agent, the payment and tracking go to the PayPal sandbox, the dispute is the real sandbox case.
 * The only shortcut is the PayPal link popup: the mandate is linked to a payment token the test buyer
 * approved through scripts/02-vault-setup.ts, because automation never types the buyer's password.
 *
 *   npx tsx video/record.ts [scene ...]      default: every scene, in order
 *
 * Needs the dev server on :3100 with MANDATE_DEV_SCENARIOS=1. Output: video/out/raw/<scene>.webm
 */
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3100";
const OUT = path.join(process.cwd(), "video", "out", "raw");
const STATE = path.join(process.cwd(), "video", "out", "state.json");
const DISPUTE_ID = "c395d655-66c3-4be1-b8ee-a2302e19a13c"; // real sandbox case PP-R-ZNP-10194423
const SIZE = { width: 1280, height: 720 };

type State = { code?: string; orderCode?: string };
const state: State = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 1));

const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

async function typeSlowly(page: Page, label: string, text: string) {
  const box = page.getByLabel(label);
  await box.click();
  await box.pressSequentially(text, { delay: 35 });
}

async function scroll(page: Page, px: number, steps = 12, every = 120) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, px / steps);
    await page.waitForTimeout(every);
  }
}

async function film(ctx: BrowserContext, scene: string, run: (page: Page) => Promise<void>) {
  const page = await ctx.newPage();
  await page.mouse.move(640, 360);
  try {
    await run(page);
  } finally {
    const video = page.video();
    await page.close();
    if (video) {
      const src = await video.path();
      const dest = path.join(OUT, `${scene}.webm`);
      rmSync(dest, { force: true });
      renameSync(src, dest);
      console.log("filmed", scene);
    }
  }
}

const SCENES: Record<string, (ctx: BrowserContext) => Promise<void>> = {
  async intro(ctx) {
    await film(ctx, "intro", async (page) => {
      await page.goto(`${BASE}/`);
      await pause(page, 3500);
      await scroll(page, 700, 20, 150);
      await pause(page, 2500);
      await scroll(page, 900, 20, 150);
      await pause(page, 2000);
    });
  },

  async create(ctx) {
    await film(ctx, "create", async (page) => {
      await page.goto(`${BASE}/mandates/new`);
      await pause(page, 1500);
      await page.getByRole("button", { name: "Use the Example" }).click();
      await pause(page, 1500);
      await page.getByRole("button", { name: "Draft Terms" }).click();
      await page.getByText(/^Draft MDT/).waitFor({ timeout: 90_000 });
      await pause(page, 2500);
      await scroll(page, 350, 10, 120);
      await pause(page, 1500);
      await page.getByRole("button", { name: "Sign Mandate" }).click();
      await page.locator("paypal-button").waitFor({ timeout: 45_000 });
      await pause(page, 1000);
      await page.locator("paypal-button").scrollIntoViewIfNeeded();
      await pause(page, 3000);
      state.code = new URL(page.url()).searchParams.get("code") ?? undefined;
      save();
    });
    const r = await ctx.request.post(`${BASE}/api/dev/scenario`, { data: { kind: "link", code: state.code } });
    if (r.status() !== 201) throw new Error(`linking with the approved sandbox token failed: ${r.status()} ${await r.text()}`);
  },

  async agent(ctx) {
    if (!state.code) throw new Error("film the create scene first");
    await film(ctx, "agent", async (page) => {
      await page.goto(`${BASE}/mandates/${state.code}`);
      await pause(page, 1500);
      await typeSlowly(page, "Message your agent", "Find me running shoes that fit the mandate.");
      await page.getByRole("button", { name: "Send" }).click();
      await page.getByText("Fits mandate").first().waitFor({ timeout: 120_000 });
      await pause(page, 3000);
      await typeSlowly(page, "Message your agent", "Buy the Daily Miler.");
      await page.getByRole("button", { name: "Send" }).click();
      const paid = page.getByText(/Paid, order \d+/).first();
      await paid.waitFor({ timeout: 150_000 });
      await paid.scrollIntoViewIfNeeded();
      state.orderCode = ((await paid.innerText()).match(/\d+/) ?? [])[0];
      save();
      await pause(page, 4000);
    });
  },

  async blocked(ctx) {
    await film(ctx, "blocked", async (page) => {
      await page.goto(`${BASE}/`);
      const r = await page.request.post(`${BASE}/api/dev/scenario`, { data: {} });
      const s = (await r.json()) as { code: string; blockedCartId: string };
      await page.goto(`${BASE}/mandates/${s.code}/check/${s.blockedCartId}`);
      await page.getByRole("heading", { name: "Payment stopped" }).waitFor();
      await pause(page, 3500);
      await page.getByRole("heading", { name: "Widen the mandate" }).first().scrollIntoViewIfNeeded();
      await pause(page, 3000);
      const ack = page.getByLabel(/I approve/);
      if (await ack.count()) {
        await ack.check();
        await pause(page, 1200);
        await page.getByRole("button", { name: "Approve Changes" }).click();
        await page.getByText(/terms pass/).first().waitFor({ timeout: 30_000 });
        await page.getByRole("heading", { level: 1 }).scrollIntoViewIfNeeded();
        await pause(page, 3500);
      }
    });
  },

  async history(ctx) {
    await film(ctx, "history", async (page) => {
      await page.goto(`${BASE}/history`);
      await pause(page, 2500);
      await scroll(page, 400, 10, 120);
      await pause(page, 2500);
    });
  },

  async merchant(ctx) {
    await film(ctx, "merchant", async (page) => {
      const code = state.orderCode ?? "918366";
      await page.goto(`${BASE}/merchant`);
      await page.locator(".ag-row").first().waitFor();
      await pause(page, 1500);
      await typeSlowly(page, "Search", code);
      await page.getByText("Showing 1 of").waitFor();
      await pause(page, 1000);
      await page.locator(`.ag-row[row-id="${code}"] .ag-group-contracted`).first().click();
      const detail = page.getByRole("region", { name: `Order ${code} details` });
      await detail.waitFor();
      await pause(page, 2500);
      if (state.orderCode && (await detail.getByLabel("Tracking number").count())) {
        await detail.getByLabel("Carrier").selectOption("UPS");
        await detail.getByLabel("Tracking number").pressSequentially(`1Z999AA1${String(Date.now()).slice(-10)}`, { delay: 30 });
        await detail.getByRole("button", { name: "Add Tracking" }).click();
        await detail.getByRole("status").waitFor({ timeout: 30_000 });
        await pause(page, 3000);
      } else {
        await pause(page, 3000);
      }
    });
  },

  async dispute(ctx) {
    await film(ctx, "dispute", async (page) => {
      await page.goto(`${BASE}/merchant/disputes/${DISPUTE_ID}`);
      await page.getByRole("heading", { level: 1 }).waitFor();
      await pause(page, 3500);
      await scroll(page, 380, 10, 140);
      await pause(page, 2500);
      await page.getByRole("button", { name: "View" }).first().click();
      await pause(page, 3000);
      await scroll(page, 700, 14, 140);
      await pause(page, 4000);
    });
  },

  async closing(ctx) {
    await film(ctx, "closing", async (page) => {
      await page.goto(`${BASE}/`);
      await pause(page, 7500);
    });
  },
};

async function main() {
  mkdirSync(OUT, { recursive: true });
  const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENES);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: SIZE, colorScheme: "light", recordVideo: { dir: path.join(OUT, "tmp"), size: SIZE } });
  // Warm the dev server so the first frames are not a compile.
  const warm = await ctx.request.get(`${BASE}/`);
  void warm;
  for (const name of wanted) {
    const scene = SCENES[name];
    if (!scene) throw new Error(`unknown scene ${name}`);
    await scene(ctx);
  }
  await ctx.close();
  await browser.close();
  for (const f of existsSync(path.join(OUT, "tmp")) ? readdirSync(path.join(OUT, "tmp")) : []) rmSync(path.join(OUT, "tmp", f), { force: true });
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
