import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

async function scenario(page: Page, baseURL: string | undefined) {
  await page.goto("/");
  const res = await page.request.post(`${baseURL}/api/dev/scenario`);
  expect(res.status(), "start the dev server with MANDATE_DEV_SCENARIOS=1").toBe(201);
  return (await res.json()) as { code: string; passCartId: string; blockedCartId: string };
}

test("a new visitor sees an empty history with one way forward", async ({ page }) => {
  await page.goto("/history");
  await expect(page.getByRole("heading", { level: 2, name: "No mandates yet" })).toBeVisible();
  await page.getByRole("link", { name: "Create a Mandate" }).click();
  await expect(page).toHaveURL(/\/mandates\/new/);
});

test("history shows activity and a receipt; the receipt downloads as a PDF", async ({ page, baseURL }, info) => {
  const s = await scenario(page, baseURL);
  await page.goto(`/history?code=${s.code}`);
  await expect(page.getByRole("heading", { level: 2, name: "Running shoes" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Filter mandates" })).toContainText("Active 1");

  const table = page.getByRole("table");
  await expect(table.getByRole("row", { name: /Daily Miler/ })).toContainText("7 of 7 pass");
  await expect(table.getByRole("row", { name: /Tempo Racer/ })).toContainText("Blocked, not paid");
  const receipt = page.getByRole("article", { name: "Mandate receipt" });
  await expect(receipt).toContainText(s.code);
  await expect(receipt).toContainText("0 paid, 1 blocked before payment");
  await expect(receipt).toContainText("Up to $120.00 total");

  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/[–—]/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: info.outputPath("history.png"), fullPage: true });

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download Receipt" }).click()]);
  expect(download.suggestedFilename()).toBe(`mandate-receipt-${s.code}.pdf`);
  const file = info.outputPath("receipt.pdf");
  await download.saveAs(file);
  expect(readFileSync(file).subarray(0, 5).toString()).toBe("%PDF-");
});

test("revoking stops the agent, cancels open carts and refuses payment", async ({ page, baseURL }) => {
  const s = await scenario(page, baseURL);
  await page.goto(`/history?code=${s.code}`);
  await page.getByRole("button", { name: "Revoke Mandate" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("This cannot be undone.");
  await dialog.getByRole("button", { name: "Revoke Now" }).click();

  await expect(page.getByRole("group", { name: "Filter mandates" })).toContainText("Revoked 1");
  await expect(page.getByRole("button", { name: "Revoke Mandate" })).toHaveCount(0);
  await expect(page.getByRole("table").getByRole("row", { name: /Daily Miler/ })).toContainText("Cancelled");

  const pay = await page.request.post(`${baseURL}/api/carts/${s.passCartId}/pay`);
  expect(pay.status()).toBe(409);

  await page.goto(`/mandates/${s.code}`);
  await expect(page.getByLabel("Message your agent")).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Shopping inside" })).toContainText("Revoked");
});
