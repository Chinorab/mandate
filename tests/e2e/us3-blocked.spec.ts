import { expect, test, type Page } from "@playwright/test";

async function scenario(page: Page, baseURL: string | undefined) {
  await page.goto("/");
  const res = await page.request.post(`${baseURL}/api/dev/scenario`);
  expect(res.status(), "start the dev server with MANDATE_DEV_SCENARIOS=1").toBe(201);
  return (await res.json()) as { code: string; passCartId: string; blockedCartId: string };
}

test("widen the mandate: only the needed changes, explicit approval, version 2 passes", async ({ page, baseURL }, info) => {
  const s = await scenario(page, baseURL);
  await page.goto(`/mandates/${s.code}/check/${s.blockedCartId}`);
  const options = page.getByRole("region", { name: "What would you like to do?" });
  const changes = options.getByRole("table", { name: "Proposed changes" });
  await expect(changes.getByRole("row", { name: /Budget/ })).toContainText("$120.00");
  await expect(changes.getByRole("row", { name: /Budget/ })).toContainText("$130.00");
  await expect(changes.getByRole("row", { name: /Colors/ })).toContainText("Adds Volt yellow");
  await expect(changes.getByRole("row")).toHaveCount(3); // header + 2 changes

  const approve = options.getByRole("button", { name: "Approve Changes" });
  await expect(approve).toBeDisabled();
  await expect(options.getByText("Tick the box above to enable approval.")).toBeVisible();
  await page.screenshot({ path: info.outputPath("blocked-options.png"), fullPage: true });

  await options.getByLabel(/I approve these 2 changes/).check();
  await expect(approve).toBeEnabled();
  await approve.click();

  await expect(page.getByRole("heading", { level: 1, name: "Mandate check" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "7 of 7 terms pass" })).toBeVisible();
  await expect(page.getByText(/version 2/)).toBeVisible();
  await expect(page.getByRole("row", { name: /Budget/ })).toContainText("Up to $130.00 total");

  // Both versions are recorded and each recomputes to its own fingerprint.
  const v = await (await page.request.get(`${baseURL}/api/mandates/${s.code}/verify`)).json();
  expect(v.versions.map((x: { versionNo: number; match: boolean }) => [x.versionNo, x.match])).toEqual([
    [1, true],
    [2, true],
  ]);
  expect(v.versions[0].sha256).not.toBe(v.versions[1].sha256);
  await page.screenshot({ path: info.outputPath("amended-pass.png"), fullPage: true });
});

test("keep the mandate: switch to the cheapest product that passes every term", async ({ page, baseURL }) => {
  const s = await scenario(page, baseURL);
  await page.goto(`/mandates/${s.code}/check/${s.blockedCartId}`);
  const options = page.getByRole("region", { name: "What would you like to do?" });
  await expect(options).toContainText("Pace Lite");
  await options.getByRole("button", { name: "Switch to Pace Lite" }).click();
  await expect(page).not.toHaveURL(new RegExp(s.blockedCartId));
  await expect(page.getByRole("status").filter({ hasText: "7 of 7 terms pass" })).toBeVisible();
  await expect(page.getByRole("complementary")).toContainText("Pace Lite");
});

test("an approval cannot be replayed with forged terms", async ({ page, baseURL }) => {
  const s = await scenario(page, baseURL);
  const res = await page.request.post(`${baseURL}/api/carts/${s.blockedCartId}/amend`, {
    data: { confirm: true, proposalHash: "0".repeat(64), terms: { budgetCents: 999999 } },
  });
  expect(res.status()).toBe(409);
  const pay = await page.request.post(`${baseURL}/api/carts/${s.blockedCartId}/pay`);
  expect(pay.status()).toBe(409);
});
