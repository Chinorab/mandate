import { expect, test, type Page } from "@playwright/test";

/**
 * Agent chat and Mandate check pages, without PayPal or model keys, using the development only
 * scenario (an active mandate, a passing cart, a blocked cart and a short conversation).
 */
async function scenario(page: Page, baseURL: string | undefined) {
  await page.goto("/");
  const res = await page.request.post(`${baseURL}/api/dev/scenario`);
  expect(res.status(), "start the dev server with MANDATE_DEV_SCENARIOS=1").toBe(201);
  return (await res.json()) as { code: string; passCartId: string; blockedCartId: string };
}

async function sane(page: Page) {
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/[–—]/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test("agent chat shows the mandate, the proposals with fit labels, and a composer", async ({ page, baseURL }, info) => {
  const s = await scenario(page, baseURL);
  await page.goto(`/mandates/${s.code}`);
  await expect(page.getByRole("heading", { level: 1, name: "Running shoes" })).toBeVisible();
  const aside = page.getByRole("complementary", { name: "Shopping inside" });
  await expect(aside).toContainText(s.code);
  await expect(aside).toContainText("$120.00");
  await expect(aside).toContainText("Active");

  const cards = page.getByRole("list", { name: "Proposed products" });
  await expect(cards.getByRole("listitem")).toHaveCount(3);
  await expect(cards.getByRole("listitem").filter({ hasText: "Daily Miler" })).toContainText("Fits mandate");
  await expect(cards.getByRole("listitem").filter({ hasText: "Road Trainer 4" })).toContainText("Close to budget with tax");
  await expect(cards.getByRole("listitem").filter({ hasText: "Tempo Racer" })).toContainText("Color outside mandate");
  await expect(page.getByText("Want me to buy it?")).toBeVisible();

  await expect(page.getByLabel("Message your agent")).toBeVisible();
  await sane(page);
  await page.screenshot({ path: info.outputPath("chat.png"), fullPage: true });

  // Without a model key the agent explains itself and keeps the buyer's message.
  if (!process.env.ANTHROPIC_API_KEY) {
    await page.getByLabel("Message your agent").fill("Yes, go with the Daily Miler.");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("not configured");
    await expect(page.getByLabel("Message your agent")).toHaveValue("Yes, go with the Daily Miler.");
  }
});

test("passing cart: 7 of 7 terms, totals, and payment through the gate", async ({ page, baseURL }, info) => {
  const s = await scenario(page, baseURL);
  await page.goto(`/mandates/${s.code}/check/${s.passCartId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Mandate check" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "7 of 7 terms pass" })).toBeVisible();
  const rows = page.getByRole("table").getByRole("row");
  await expect(rows).toHaveCount(8); // header + 7 terms
  await expect(page.getByRole("row", { name: /Budget/ })).toContainText("$16.08 under the limit");
  await expect(page.getByRole("complementary")).toContainText("$103.92");
  await sane(page);
  await page.screenshot({ path: info.outputPath("check-pass.png"), fullPage: true });

  // The placeholder PayPal link cannot pay: the gate passes, PayPal is unavailable, nothing is charged.
  await page.getByRole("button", { name: "Pay With Linked PayPal" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("PayPal");
});

test("blocked cart: failed terms explained, nothing paid, purchase can be cancelled", async ({ page, baseURL }, info) => {
  const s = await scenario(page, baseURL);
  await page.goto(`/mandates/${s.code}/check/${s.blockedCartId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Payment stopped" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Blocked, 2 of 7 terms fail" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Budget/ })).toContainText("Cart total is $127.74. Your limit is $120.00, so it is $7.74 over.");
  await expect(page.getByRole("row", { name: /Colors/ })).toContainText("Volt yellow is not one of beige, black, gray or white.");
  await expect(page.getByRole("button", { name: /Pay/ })).toHaveCount(0);
  await sane(page);
  await page.screenshot({ path: info.outputPath("check-blocked.png"), fullPage: true });

  await page.getByRole("button", { name: "Cancel Purchase" }).click();
  await expect(page.getByText("Cancelled, not paid")).toBeVisible();

  // A direct pay request for the blocked cart is refused by the gate.
  const res = await page.request.post(`${baseURL}/api/carts/${s.blockedCartId}/pay`, { data: { totalCents: 1 } });
  expect(res.status()).toBe(409);
});

test("another session cannot open someone else's check", async ({ page, baseURL, browser }) => {
  const s = await scenario(page, baseURL);
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.goto(`${baseURL}/mandates/${s.code}/check/${s.passCartId}`);
  await expect(p2.getByText("This cart was not found in your session.")).toBeVisible();
  await other.close();
});
