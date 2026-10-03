import { test, expect } from "@playwright/test";
import { importDrafts } from "../../scripts/howto-review-batch.mjs";
import { guides } from "../../scripts/howto-review-content.mjs";

test("prepared batch: uncertain reconciliation, editor round trip, image replacement and reader isolation", async ({ page, request, browser }) => {
  test.setTimeout(120_000);
  const origin = "http://127.0.0.1:5000";
  const credentials = { username: "howto-editor@aiofusion.ai", password: "release-harness-password" };
  const baseline = await (await request.get("/api/howto")).json();
  // Real commit with deliberately lost client confirmation. Do not retry.
  const uncertain = await importDrafts({
    target: "development", baseUrl: origin, apply: true, credentials,
    fetcher: async (input: any, options: any) => {
      const response = await fetch(input, options);
      if (String(input).endsWith("/api/admin/howto") && options?.method === "POST") throw new Error("Fixture lost confirmation after real write");
      return response;
    },
  });
  expect(uncertain.uncertain).toBe(1);
  expect(uncertain.created).toBe(0);
  const preview = await importDrafts({ target: "development", baseUrl: origin, credentials });
  expect(preview.skipped).toBe(1);
  expect(preview.planned).toBe(guides.length - 1);
  const applied = await importDrafts({ target: "development", baseUrl: origin, apply: true, credentials });
  expect(applied.created).toBe(guides.length - 1);
  expect(applied.skipped).toBe(1);
  expect(applied.verifiedNewDrafts).toBe(guides.length - 1);
  expect(await (await request.get("/api/howto")).json()).toEqual(baseline);
  for (const { entry } of guides) expect((await request.get(`/api/howto/${entry.id}`)).status()).toBe(404);
  const support = await (await request.get("/api/support/search?q=private%20media%20spreadsheet")).json();
  expect(support.results.some((r: any) => r.guideId?.startsWith("review-"))).toBe(false);

  // The actual continuous editor, signed in as a synthetic eligible content
  // member. This never represents Natalie's real Google/Microsoft identity.
  await page.goto("/platform");
  await page.getByPlaceholder("Email or username").fill(credentials.username);
  await page.getByPlaceholder("Password", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Manage How-to Library", exact: true }).click();
  await page.getByTestId("row-entry-review-agency-client-project").click();
  await expect(page.getByTestId("howto-document")).toContainText("Add a Client Project");
  await expect(page.getByTestId("entry-status")).toHaveText("draft");
  await page.getByTestId("row-entry-review-media-import").click();
  const document = page.getByTestId("howto-document");
  await expect(document).toContainText("Import media contacts");
  const paragraph = document.locator("p").first();
  await paragraph.click();
  await page.keyboard.press("Home");
  await page.keyboard.down("Shift");
  await page.keyboard.press("End");
  await page.keyboard.up("Shift");
  const selected = await page.evaluate(() => window.getSelection()?.toString());
  expect(selected?.length).toBeGreaterThan(5);
  await page.getByRole("button", { name: "Italic", exact: true }).click();
  await expect(document.locator("em").first()).toBeVisible();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Isolated editorial review note.");
  await expect(document).toContainText("Isolated editorial review note.");
  await document.locator("figure img").first().click();
  await page.getByRole("button", { name: "Change image", exact: true }).click();
  await page.getByRole("button", { name: "Select image article-1-pr-ai.webp", exact: true }).click();
  await page.getByLabel("Image description", { exact: true }).fill("Editorial collaboration illustration used in a disposable browser fixture.");
  await page.getByTestId("button-save").click();
  await expect(page.getByTestId("save-status")).toContainText(/saved/i);
  await page.reload();
  await page.getByTestId("row-entry-review-media-import").click();
  await expect(page.getByTestId("howto-document")).toContainText("Isolated editorial review note.");
  await expect(page.getByTestId("howto-document").locator("em").first()).toBeVisible();
  await page.getByTestId("tab-preview").click();
  await expect(page.getByTestId("preview").getByAltText("Editorial collaboration illustration used in a disposable browser fixture.")).toBeVisible();
  await page.screenshot({ path: "test-results/howto-batch-preview-desktop.png", fullPage: true });

  // A separate disposable published record tests card crop, not a target draft.
  const fixture = guides[0].entry;
  const created = await page.evaluate(async (input) => {
    const res = await fetch("/api/admin/howto", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, id: "disposable-illustrated-reader", title: "Disposable illustrated reader", status: "published" }) });
    return res.status;
  }, fixture);
  expect(created).toBe(201);
  const reader = await browser.newContext();
  const readerPage = await reader.newPage();
  await readerPage.goto(`${origin}/guidance`);
  const image = readerPage.getByTestId("preview-howto-disposable-illustrated-reader");
  await expect(image).toBeVisible();
  expect(await image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  expect(await image.evaluate((el) => getComputedStyle(el).objectFit)).toBe("cover");
  await readerPage.getByTestId("card-howto-disposable-illustrated-reader").click();
  await expect(readerPage.getByTestId("detail-title")).toHaveText("Disposable illustrated reader");
  await expect(readerPage.locator("article img")).toBeVisible();
  await readerPage.setViewportSize({ width: 390, height: 844 });
  await readerPage.screenshot({ path: "test-results/howto-batch-reader-mobile.png", fullPage: true });
  await reader.close();
  expect(await page.evaluate(async () => (await fetch("/api/admin/howto/disposable-illustrated-reader", { method: "DELETE" })).status)).toBe(204);

  // Edited and deliberately deleted completed rows are preserved on resumption.
  expect(await page.evaluate(async () => (await fetch("/api/admin/howto/review-direct-client-project", { method: "DELETE" })).status)).toBe(204);
  const resumed = await importDrafts({ target: "development", baseUrl: origin, apply: true, credentials });
  expect(resumed.created).toBe(0);
  expect(resumed.skipped).toBe(guides.length);
  expect((await request.get("/api/howto/review-media-import")).status()).toBe(404);
  expect(await (await request.get("/api/howto")).json()).toEqual(baseline);
});