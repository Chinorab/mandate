import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Accessibility (WCAG 2.1 A and AA rules from axe-core) on every page, desktop and phone. One known
 * exception: AG Grid sets aria-expanded on master detail rows inside role="grid" (library markup), so
 * that single rule is skipped on the orders grid only.
 */
test("every page passes axe WCAG 2.1 AA checks", async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  await page.goto("/");
  const res = await page.request.post(`${baseURL}/api/dev/scenario`, { data: {} });
  expect(res.status(), "start the dev server with MANDATE_DEV_SCENARIOS=1").toBe(201);
  const s = (await res.json()) as { code: string; passCartId: string; blockedCartId: string };
  const pages = ["/", "/privacy", "/mandates/new", `/mandates/${s.code}`, `/mandates/${s.code}/check/${s.passCartId}`, `/mandates/${s.code}/check/${s.blockedCartId}`, "/history", "/merchant"];
  for (const p of pages) {
    await page.goto(p);
    await page.locator("main:visible").first().waitFor();
    await page.waitForTimeout(1500);
    const axe = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]);
    if (p === "/merchant") axe.disableRules(["aria-conditional-attr"]);
    const { violations } = await axe.analyze();
    expect(violations.map((v) => `${p}: ${v.id} (${v.impact}) ${v.nodes.length}`)).toEqual([]);
  }
});
