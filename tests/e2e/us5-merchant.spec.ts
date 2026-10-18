import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

async function merchantScenario(page: Page, baseURL: string | undefined) {
  await page.goto("/");
  const res = await page.request.post(`${baseURL}/api/dev/scenario`, { data: { kind: "merchant" } });
  expect(res.status(), "start the dev server with MANDATE_DEV_SCENARIOS=1").toBe(201);
  const body = (await res.json()) as { orderCodes: string[] };
  expect(body.orderCodes.length).toBeGreaterThanOrEqual(6);
  return body.orderCodes;
}

// The Order column is pinned, so one order is two row elements (pinned and scrolling) sharing its row-id.
const rowParts = (page: Page, code: string) => page.locator(`.ag-row[row-id="${code}"]`);
const rowText = (page: Page, code: string) => expect.poll(async () => (await rowParts(page, code).allInnerTexts()).join(" "));

test("merchant grid: search, master detail, tracking, grouping, filters and CSV export", async ({ page, baseURL }, info) => {
  const codes = await merchantScenario(page, baseURL);
  const unshipped = codes[0]; // Daily Miler, paid, not shipped
  await page.goto("/merchant");
  await expect(page.getByRole("heading", { level: 1, name: "Agent orders" })).toBeVisible();
  await expect(page.locator(".ag-row").first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("merchant.png"), fullPage: true });

  // Quick search narrows to one order.
  await page.getByLabel("Search").fill(unshipped);
  await expect(page.getByText("Showing 1 of")).toBeVisible();
  await rowText(page, unshipped).toContain("Daily Miler");
  await rowText(page, unshipped).toContain("7 of 7 pass");
  await rowText(page, unshipped).toContain("Paid");

  // Master detail: the mandate and the check behind the order.
  await rowParts(page, unshipped).locator(".ag-group-contracted").click();
  const detail = page.getByRole("region", { name: `Order ${unshipped} details` });
  await expect(detail).toContainText("SHA256");
  await expect(detail).toContainText("Up to $500.00 total");
  await page.screenshot({ path: info.outputPath("merchant-detail.png"), fullPage: true });

  // Tracking is saved; without PayPal keys it says it was not reported.
  await detail.getByLabel("Carrier").selectOption("UPS");
  await detail.getByLabel("Tracking number").fill("1Z999AA10123456784");
  await detail.getByRole("button", { name: "Add Tracking" }).click();
  await expect(detail.getByRole("status")).toContainText("Tracking saved");
  await rowText(page, unshipped).toContain("Shipped");

  // Clear search, group by status.
  await page.getByLabel("Search").fill("");
  await page.getByLabel("Group by").selectOption("status");
  await expect(page.getByRole("columnheader", { name: /Group/ })).toBeVisible();
  await page.getByLabel("Group by").selectOption("none");

  // Mandate state filter.
  await page.getByRole("group", { name: "Mandate" }).getByRole("button", { name: "Revoked" }).click();
  // Every shown mandate state cell says Revoked (AG Grid can keep detached row nodes in the DOM).
  await expect
    .poll(() =>
      page.locator('.ag-cell[col-id="mandateState"]').evaluateAll((cells) =>
        cells.filter((c) => c.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && c.getBoundingClientRect().height > 0).map((c) => c.textContent?.trim()),
      ),
    )
    .toEqual(expect.arrayContaining(["Revoked"]));
  const shown = await page.locator('.ag-cell[col-id="mandateState"]').evaluateAll((cells) =>
    cells.filter((c) => c.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && c.getBoundingClientRect().height > 0).map((c) => c.textContent?.trim()),
  );
  expect(shown.every((t) => t === "Revoked")).toBe(true);
  await page.getByRole("group", { name: "Mandate" }).getByRole("button", { name: "All" }).click();

  // CSV export contains exactly the shown rows.
  await page.getByLabel("Search").fill(codes[1]);
  await expect(page.getByText("Showing 1 of")).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSV" }).click()]);
  const file = info.outputPath("orders.csv");
  await download.saveAs(file);
  const csv = readFileSync(file, "utf8");
  expect(csv).toContain("Order");
  expect(csv).toContain(codes[1]);
  expect(csv).not.toContain(codes[0]);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/[–—]/);
});
