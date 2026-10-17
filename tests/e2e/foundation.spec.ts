import { expect, test } from "@playwright/test";

test.describe("foundation", () => {
  test("first visit gets a signed, httpOnly demo session cookie", async ({ page, context }) => {
    await page.goto("/");
    const cookie = (await context.cookies()).find((c) => c.name === "mandate_sid");
    expect(cookie).toBeTruthy();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe("Lax");
    expect(cookie!.value).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]+$/);

    // The cookie is kept on later visits.
    await page.goto("/privacy");
    const again = (await context.cookies()).find((c) => c.name === "mandate_sid");
    expect(again!.value).toBe(cookie!.value);
  });

  test("privacy page is complete, readable and free of banned characters", async ({ page }, info) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible();
    for (const name of [
      "What we collect",
      "How we use it",
      "Who can see it",
      "How long we keep it",
      "Your choices and rights",
      "Security",
      "Contact",
    ]) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "On this page" }).getByRole("link", { name })).toBeVisible();
    }
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/[–—]/); // no en or em dash
    expect(text).not.toMatch(/\[[A-Z ]+\]/); // no unfilled [PLACEHOLDER]
    expect(text).toContain("not affiliated with PayPal");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: info.outputPath("privacy.png"), fullPage: false });
  });

  test("icons are served", async ({ request }) => {
    for (const path of ["/favicon.ico", "/icon.svg", "/apple-icon.png"]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
    }
  });
});
