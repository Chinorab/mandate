import { expect, test } from "@playwright/test";

const SOURCES = [
  "https://merchantcostconsulting.com/?p=9509",
  "https://www.chargeflow.io/blog/ai-agent-chargeback-liability",
  "https://www.chargeflow.io/blog/agentic-commerce-chargebacks-the-evidence-playbook-merchants-need",
  "https://www.americanbanker.com/payments/news/new-york-financial-regulator-zeroing-in-on-agentic-commerce",
];

test("landing: the claim, the example mandate, sourced context and a way in without sign up", async ({ page }, info) => {
  await page.goto("/");
  const main = page.locator("main:visible");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Proof of what your agent was allowed to buy.");
  const figure = page.getByRole("figure", { name: "Example mandate" });
  await expect(figure).toContainText("MDT4K7Q21");
  await expect(figure).toContainText("$120.00");
  await expect(figure.getByText(/^SHA256 [0-9a-f]{4}…[0-9a-f]{4}$/)).toBeVisible();
  await expect(figure).toContainText("Products and stores in this demo are fictional.");
  await page.screenshot({ path: info.outputPath("landing.png"), fullPage: true });

  // Every source of the brief is linked, and every claim block carries its own link.
  for (const url of SOURCES) await expect(main.locator(`a[href="${url}"]`).first()).toBeVisible();
  const claims = main.locator("[data-claim]");
  expect(await claims.count()).toBeGreaterThanOrEqual(4);
  for (const claim of await claims.all()) await expect(claim.locator("a[href^='https://']")).not.toHaveCount(0);

  // Footer and privacy.
  await expect(page.locator("footer")).toContainText("Mandate is not affiliated with PayPal.");
  await expect(page.locator("footer").getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");

  const text = await main.innerText();
  expect(text).not.toMatch(/[–—]/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  // In: create a mandate, no sign up.
  await main.getByRole("link", { name: "Create a Mandate" }).first().click();
  await page.waitForURL("**/mandates/new");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("landing links to the merchant view and the privacy page", async ({ page }) => {
  await page.goto("/");
  await page.locator("main:visible").getByRole("link", { name: "Open the Merchant View" }).click();
  await page.waitForURL("**/merchant");
  await expect(page.getByRole("heading", { level: 1, name: "Agent orders" })).toBeVisible();
  await page.goto("/");
  await page.locator("footer").getByRole("link", { name: "Privacy" }).click();
  await page.waitForURL("**/privacy");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("two visitors never see each other's mandates", async ({ browser, baseURL }) => {
  const a = await browser.newContext({ baseURL });
  const b = await browser.newContext({ baseURL });
  const pa = await a.newPage();
  const pb = await b.newPage();
  await pa.goto("/");
  await pb.goto("/");
  const res = await pa.request.post(`${baseURL}/api/dev/scenario`, { data: {} });
  expect(res.status(), "start the dev server with MANDATE_DEV_SCENARIOS=1").toBe(201);
  const { code } = (await res.json()) as { code: string };

  await pa.goto("/history");
  await expect(pa.locator("main:visible")).toContainText(code);

  await pb.goto("/history");
  await expect(pb.locator("main:visible")).not.toContainText(code);
  await expect(pb.getByRole("link", { name: /Create a Mandate|Try the example/ }).first()).toBeVisible();
  expect((await pb.request.get(`${baseURL}/api/mandates/${code}`)).status()).toBe(404);
  const list = (await (await pb.request.get(`${baseURL}/api/mandates`)).json()) as { mandates: { code: string }[] };
  expect(list.mandates.map((m) => m.code)).not.toContain(code);
  await pb.goto(`/mandates/${code}`);
  await expect(pb.locator("main:visible")).not.toContainText("Find me something that fits the mandate.");

  await a.close();
  await b.close();
});
