import { expect, test } from "@playwright/test";

test("home page renders with title and favicon", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Mandate/);
  const icon = page.locator('link[rel="icon"]').first();
  await expect(icon).toHaveAttribute("href", /icon|favicon/);
});
