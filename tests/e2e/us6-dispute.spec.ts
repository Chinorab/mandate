import { expect, test, type Page } from "@playwright/test";

/**
 * US6 without PayPal keys: development disputes go through the same event processing, evidence
 * assembly, review and submission as sandbox ones; only the signature check and the PayPal call are
 * replaced (DEVPPD case ids). The @pool test against real sandbox disputes runs when keys are set.
 */
async function disputeScenario(page: Page, baseURL: string | undefined) {
  await page.goto("/");
  const res = await page.request.post(`${baseURL}/api/dev/scenario`, { data: { kind: "dispute" } });
  expect(res.status(), "start the dev server with MANDATE_DEV_SCENARIOS=1").toBe(201);
  return (await res.json()) as { disputeIds: string[]; orderCodes: string[] };
}

test("merchant reviews the evidence, edits, confirms and submits; nothing goes before the confirmation", async ({ page, baseURL, browser }, info) => {
  const { disputeIds, orderCodes } = await disputeScenario(page, baseURL);
  const [id] = disputeIds;

  await page.goto("/merchant/disputes");
  await page.waitForURL(`**/merchant/disputes/${id}`);
  // Next keeps the previous route mounted but hidden; only the visible main counts.
  const main = page.locator("main:visible");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Dispute on order ${orderCodes[0]}`);
  await expect(main).toContainText("The buyer reports this purchase as unauthorized. A signed mandate is attached to the order.");
  const timeline = page.getByRole("region", { name: "Timeline" });
  for (const step of ["Mandate signed", "Mandate check passed", "Payment captured", "Shipped", "Dispute opened", "Your response"]) {
    await expect(timeline).toContainText(step);
  }
  const evidence = page.getByRole("region", { name: "Evidence file" });
  await expect(evidence).toContainText("4 of 4 items included");
  const response = page.getByLabel("Response text");
  await expect(response).toHaveValue(/signed mandate MDT/);
  await expect(response).toHaveValue(/1Z999AA1/);
  await page.screenshot({ path: info.outputPath("dispute.png"), fullPage: true });

  // View shows the stored facts behind an item.
  await evidence.getByRole("button", { name: "View" }).first().click();
  await expect(evidence).toContainText("Fingerprint SHA256");

  // Excluding the shipment removes it from the draft.
  await evidence.getByLabel(/Shipment tracking/).uncheck();
  await expect(evidence).toContainText("3 of 4 items included");
  await expect(response).not.toHaveValue(/1Z999AA1/);

  // Another session reads it but cannot change it.
  const other = await browser.newContext({ baseURL });
  const otherPage = await other.newPage();
  await otherPage.goto(`/merchant/disputes/${id}`);
  await expect(otherPage.getByRole("status").filter({ hasText: "Another demo session is answering this dispute" })).toBeVisible();
  await expect(otherPage.getByRole("button", { name: "Submit Evidence" })).toHaveCount(0);
  await expect(otherPage.getByLabel("Response text")).toHaveAttribute("readonly", "");
  await other.close();

  // Edit and save.
  const submitButton = page.getByRole("button", { name: "Submit Evidence" });
  await expect(submitButton).toBeDisabled();
  await response.fill(`${await response.inputValue()}\n\nThe order number is ${orderCodes[0]}.`);
  await page.getByRole("button", { name: "Save Draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  await expect(submitButton).toBeDisabled();

  // The report PDF is what PayPal would receive.
  const pdf = await page.request.get(`${baseURL}/api/merchant/disputes/${id}/report`);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // Confirm, submit.
  await page.getByLabel(/I read this response and checked every included item/).check();
  await expect(page.getByText("Ready to submit.")).toBeVisible();
  await submitButton.click();
  await expect(page.getByText(/Evidence submitted\. PayPal received the response and 3 items\./)).toBeVisible();
  await expect(main).toContainText("Evidence submitted");
  await expect(response).toHaveAttribute("readonly", "");
  await expect(response).toHaveValue(new RegExp(`The order number is ${orderCodes[0]}\\.`));
  await page.screenshot({ path: info.outputPath("dispute-submitted.png"), fullPage: true });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(await main.innerText()).not.toMatch(/[–—]/);
});

test("the orders grid flags the order in dispute and links to it", async ({ page, baseURL }) => {
  const { disputeIds, orderCodes } = await disputeScenario(page, baseURL);
  await page.goto("/merchant");
  await page.getByLabel("Search").fill(orderCodes[1]);
  await expect(page.getByText("Showing 1 of")).toBeVisible();
  const parts = page.locator(`.ag-row[row-id="${orderCodes[1]}"]`);
  await expect.poll(async () => (await parts.allInnerTexts()).join(" ")).toContain("In dispute");
  await parts.locator(".ag-group-contracted").click();
  await page.getByRole("region", { name: `Order ${orderCodes[1]} details` }).getByRole("link", { name: "Open the dispute" }).click();
  await page.waitForURL(`**/merchant/disputes/${disputeIds[1]}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Dispute on order ${orderCodes[1]}`);
  // Not shipped: the draft says the tracking is missing.
  await expect(page.getByLabel("Response text")).toHaveValue(/No shipment tracking is on file for this order\./);
});

test("an unsigned PayPal event is refused", async ({ request, baseURL }) => {
  const res = await request.post(`${baseURL}/api/webhooks/paypal`, {
    data: { id: "WH-FORGED-1", event_type: "CUSTOMER.DISPUTE.CREATED", resource: { dispute_id: "PP-D-FORGED" } },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).error.code).toBe("unverified");
});
