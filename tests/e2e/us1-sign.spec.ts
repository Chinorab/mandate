import { expect, test } from "@playwright/test";

/**
 * US1 without external keys: fill in by hand, edit each required term, sign, see the fingerprint,
 * reload, verify the hash. The PayPal link step shows its "not configured" state here; the linked
 * path runs once sandbox keys exist (tests/e2e/us1-link.spec.ts, T044).
 */
function weekFromNow() {
  const d = new Date(Date.now() + 7 * 86_400_000);
  return d.toISOString().slice(0, 10);
}

test("buyer drafts, edits, signs a mandate and gets a verifiable fingerprint", async ({ page, request, baseURL }, info) => {
  await page.goto("/mandates/new");
  await expect(page.getByRole("heading", { level: 1, name: "New mandate" })).toBeVisible();
  await expect(page.getByText("Your terms appear here")).toBeVisible();

  // One tap example (FR-034b).
  await page.getByRole("button", { name: "Use the Example" }).click();
  await expect(page.getByLabel("What may your agent buy?")).toHaveValue(/running shoes, size 10/);

  // Fill in by hand (works without the model).
  await page.getByRole("button", { name: "Fill In the Terms Myself" }).click();
  await expect(page.getByText(/^Draft MDT/)).toBeVisible();
  const sign = page.getByRole("button", { name: "Sign Mandate" });
  await expect(sign).toBeDisabled();
  await expect(page.getByText("Add a budget before signing.")).toBeVisible();

  await page.getByRole("button", { name: "Edit budget" }).click();
  await page.getByLabel("Budget in US dollars, total for this mandate").fill("120");
  await page.getByRole("button", { name: "Save Budget" }).click();
  await expect(page.getByText("$120.00", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Edit category" }).click();
  await page.getByLabel("Category").selectOption("running-shoes");
  await page.getByRole("button", { name: "Save Category" }).click();
  await expect(page.getByText("Running shoes", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Edit size" }).click();
  await page.getByLabel("Size", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Save Size" }).click();
  await expect(page.getByText("US men's 10")).toBeVisible();

  await page.getByRole("button", { name: "Edit colors" }).click();
  for (const c of ["Black", "White", "Gray", "Beige"]) {
    await page.getByRole("group", { name: /Allowed colors/ }).getByLabel(c).check();
  }
  await page.getByRole("button", { name: "Save Colors" }).click();
  await expect(page.getByText("Beige, black, gray, white")).toBeVisible();

  await page.getByRole("button", { name: "Edit expires" }).click();
  await page.getByLabel("Date", { exact: true }).fill(weekFromNow());
  await page.getByLabel("Time, US Eastern").fill("23:59");
  await page.getByRole("button", { name: "Save Expiry" }).click();
  await expect(page.getByText(/11:59 PM ET/)).toBeVisible();

  await expect(sign).toBeEnabled();
  await page.screenshot({ path: info.outputPath("draft.png"), fullPage: true });
  await sign.click();
  await expect(page.getByText("Signed, link PayPal")).toBeVisible();
  await expect(page.getByText(/^SHA256/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Edit/ })).toHaveCount(0);

  // PayPal link step: no sandbox keys in this environment.
  await expect(page.getByRole("alert").filter({ hasText: /PayPal/ })).toBeVisible();
  await page.screenshot({ path: info.outputPath("signed.png"), fullPage: true });

  // State survives a reload (code in the URL).
  const code = new URL(page.url()).searchParams.get("code")!;
  expect(code).toMatch(/^MDT[0-9A-Z]{6}$/);
  await page.reload();
  await expect(page.getByText("Signed, link PayPal")).toBeVisible();

  // Anyone can recompute the fingerprint from the stored terms (FR-006).
  const res = await page.request.get(`${baseURL}/api/mandates/${code}/verify`);
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.versions[0]).toMatchObject({ versionNo: 1, match: true });

  // Another browser (session) cannot see it.
  const other = await request.get(`${baseURL}/api/mandates/${code}`);
  expect(other.status()).toBe(404);

  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/[–—]/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("a draft can be discarded", async ({ page }) => {
  await page.goto("/mandates/new");
  await page.getByLabel("What may your agent buy?").fill("Coffee beans");
  await page.getByRole("button", { name: "Fill In the Terms Myself" }).click();
  await expect(page.getByText(/^Draft MDT/)).toBeVisible();
  await page.getByRole("button", { name: "Discard Draft" }).click();
  await expect(page.getByText("Your terms appear here")).toBeVisible();
  await expect(page).not.toHaveURL(/code=/);
});

test("drafting without a model explains itself and offers the manual path", async ({ page }) => {
  test.skip(Boolean(process.env.ANTHROPIC_API_KEY), "Model is configured in this environment");
  await page.goto("/mandates/new");
  await page.getByRole("button", { name: "Use the Example" }).click();
  await page.getByRole("button", { name: "Draft Terms" }).click();
  const alert = page.getByRole("region", { name: "Instructions" }).getByRole("alert");
  await expect(alert).toContainText("set the terms yourself");
  await alert.getByRole("button", { name: "Fill in the terms myself" }).click();
  await expect(page.getByText(/^Draft MDT/)).toBeVisible();
});
