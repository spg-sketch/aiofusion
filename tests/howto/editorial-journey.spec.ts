import { expect, test } from "@playwright/test";

test("one-box guide supports clipboard paste, selection, Enter, formatting and reload", async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/platform");
  await page.getByPlaceholder("Email or username").fill("howto-editor@aiofusion.ai");
  await page.getByPlaceholder("Password", { exact: true }).fill("release-harness-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Manage How-to Library", exact: true }).click();
  await page.getByTestId("button-new-entry").click();
  await page.getByTestId("input-title").fill("Single box clipboard guide");
  await page.getByTestId("input-description").fill("An isolated editor regression test.");
  const box = page.getByRole("textbox", { name: "Guide content", exact: true });
  await expect(box).toHaveCount(1);
  const copy = "Create your first article\n\nChoose the correct project.\n\nReview and save your draft.";
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), copy);
  await box.click();
  await box.press("Control+v");
  await expect(box).toContainText("Choose the correct project.");
  await box.press("Control+Home");
  await box.press("Home");
  await box.press("Shift+End");
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("Create your first article");
  await page.getByLabel("Text format", { exact: true }).selectOption("heading");
  await expect(box.locator("h2")).toHaveText("Create your first article");
  await box.press("Control+End");
  await box.press("Enter");
  await page.keyboard.insertText("Final check.");
  await expect(box.locator("p").last()).toHaveText("Final check.");
  await box.press("Home");
  await box.press("Shift+End");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(box.locator("strong")).toHaveText("Final check.");
  await page.getByRole("button", { name: "Italic", exact: true }).click();
  await expect(box.locator("em")).toHaveText("Final check.");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(box.locator("em")).toHaveCount(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(box.locator("em")).toHaveText("Final check.");
  await page.getByRole("button", { name: "Add or edit link", exact: true }).click();
  await page.getByLabel("Link URL", { exact: true }).fill("https://example.com/guide");
  await page.getByRole("button", { name: "Apply link", exact: true }).click();
  await expect(box.locator("a")).toHaveAttribute("href", "https://example.com/guide");
  await page.getByTestId("tab-preview").click();
  await expect(page.getByTestId("preview").locator("h2")).toHaveText("Create your first article");
  await expect(page.getByTestId("preview").locator("strong")).toHaveText("Final check.");
  await page.getByTestId("tab-edit").click();
  await page.getByTestId("button-save").click();
  await expect(page.getByTestId("save-status")).toContainText(/saved/i);
  await page.reload();
  await page.getByTestId("row-entry-single-box-clipboard-guide").click();
  await expect(box.locator("h2")).toHaveText("Create your first article");
  await expect(box.locator("a strong")).toHaveText("Final check.");
  await expect(box).toContainText("Review and save your draft.");

  // Rich clipboard content is parsed into the supported schema, not inserted as raw HTML.
  await box.press("Control+End");
  await box.press("Enter");
  await page.evaluate(async () => {
    await navigator.clipboard.write([new ClipboardItem({
      "text/html": new Blob(['<p><strong>Pasted bold</strong> and <em>italic</em> <a href="javascript:alert(1)">unsafe link</a></p>'], { type: "text/html" }),
      "text/plain": new Blob(["Pasted bold and italic unsafe link"], { type: "text/plain" }),
    })]);
  });
  await box.press("Control+v");
  await expect(box.locator("strong").last()).toHaveText("Pasted bold");
  await expect(box.locator('a[href^="javascript:"]')).toHaveCount(0);
  await page.getByTestId("button-save").click();
  await expect(page.getByTestId("save-status")).toContainText(/saved/i);
  await page.setViewportSize({ width: 390, height: 844 });
  await box.press("Control+End");
  await box.press("Enter");
  await page.keyboard.insertText("Mobile edit.");
  await page.getByTestId("button-save").click();
  await expect(page.getByTestId("save-status")).toContainText(/saved/i);
  await page.screenshot({ path: "test-results/howto-single-box-mobile.png", fullPage: true });
  await page.reload();
  await page.getByTestId("row-entry-single-box-clipboard-guide").click();
  await expect(box).toContainText("Mobile edit.");
  await page.getByTestId("button-delete").click();
  await page.getByTestId("button-confirm-delete").click();
  await expect(page.getByTestId("row-entry-single-box-clipboard-guide")).toHaveCount(0);
});

test("isolated editorial publish/read-back preserves permissions and public Insights", async ({ page, browser, request }) => {
  test.setTimeout(120_000);
  const initialInsights = await (await request.get("/api/insights")).json();
  const seeds = await (await request.get("/api/howto")).json();
  expect(seeds.map((entry: { id: string }) => entry.id)).toEqual([
    "getting-started", "aio-diagnostic", "comms-planner",
    "content-optimiser", "measuring-growth", "multiple-projects",
  ]);
  expect((await request.get("/api/admin/howto")).status()).toBe(401);
  expect((await request.post("/api/admin/howto", { data: {} })).status()).toBe(401);

  // An ordinary owner is not an editorial identity. Use the actual browser,
  // which treats loopback as trustworthy for this app's Secure session cookie.
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await ownerPage.goto("http://127.0.0.1:5000/platform");
  await ownerPage.getByPlaceholder("Email or username").fill("release@example.invalid");
  await ownerPage.getByPlaceholder("Password", { exact: true }).fill("release-harness-password");
  await ownerPage.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(ownerPage.getByRole("button", { name: "Project Hub", exact: true })).toBeVisible();
  expect(await ownerPage.evaluate(async () => (await fetch("/api/admin/howto", { credentials: "include" })).status)).toBe(403);
  await ownerContext.close();

  // Actual UI sign-in. The fixture is a verified staff identity with a content
  // membership and an empty project-access list, not a platform administrator.
  await page.goto("/platform");
  await page.getByPlaceholder("Email or username").fill("howto-editor@aiofusion.ai");
  await page.getByPlaceholder("Password", { exact: true }).fill("release-harness-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Manage How-to Library", exact: true })).toBeVisible();
  const identity = await page.evaluate(async () => (await fetch("/api/platform/me", { credentials: "include" })).json());
  expect(identity.insightsCmsAccess).toBe(true);
  expect(identity.account.role).not.toBe("admin");
  await page.getByRole("button", { name: "Manage How-to Library", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/howto$/);
  await page.getByTestId("button-new-entry").click();
  await page.getByTestId("input-title").fill("Isolated browser guide");
  await page.getByTestId("input-description").fill("A disposable guide for the isolated editorial journey.");
  await page.getByTestId("input-order").fill("7");
  await page.getByTestId("howto-document").fill("Instructions retained across browsers.");
  // Exercise formatting without HTML or JSON authoring.
  await page.getByTestId("howto-document").press("Control+a");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await page.getByTestId("tab-preview").click();
  await expect(page.getByTestId("preview").locator("strong")).toHaveText("Instructions retained across browsers.");
  await page.getByTestId("tab-edit").click();
  await page.getByTestId("button-save").click();
  await expect(page.getByTestId("save-status")).toContainText(/saved/i);
  await expect(page.getByTestId("input-title")).toHaveValue("Isolated browser guide");
  expect((await request.get("/api/howto/isolated-browser-guide")).status()).toBe(404);

  // Reload proves draft persistence from the real database.
  await page.reload();
  await page.getByTestId("row-entry-isolated-browser-guide").click();
  await expect(page.getByTestId("input-title")).toHaveValue("Isolated browser guide");
  await expect(page.getByTestId("howto-document")).toHaveText("Instructions retained across browsers.");
  await page.getByTestId("button-publish").click();
  await expect(page.getByTestId("entry-status")).toHaveText("published");
  await page.screenshot({ path: "test-results/howto-editor.png", fullPage: true });

  const reader = await browser.newContext();
  const readerPage = await reader.newPage();
  await readerPage.goto("http://127.0.0.1:5000/guidance");
  await expect(readerPage.getByRole("button", { name: "Manage How-to Library", exact: true })).toHaveCount(0);
  await readerPage.getByTestId("filter-Guide").click();
  await readerPage.getByTestId("card-howto-isolated-browser-guide").click();
  await expect(readerPage.getByTestId("detail-title")).toHaveText("Isolated browser guide");
  await expect(readerPage.locator("article strong")).toHaveText("Instructions retained across browsers.");
  await readerPage.screenshot({ path: "test-results/howto-reader.png", fullPage: true });

  // Validation failure keeps the form open and does not alter persisted content.
  await page.getByTestId("input-title").fill("");
  await page.getByTestId("button-save").click();
  await expect(page.getByTestId("save-error")).toContainText("Add a title");
  await expect(page.getByTestId("input-title")).toHaveValue("");
  expect((await (await request.get("/api/howto/isolated-browser-guide")).json()).title).toBe("Isolated browser guide");
  await page.getByTestId("input-title").fill("Updated isolated guide");
  await page.getByTestId("button-back").click();
  await expect(page.getByRole("alertdialog")).toContainText("Save your changes before leaving?");
  await page.getByRole("button", { name: "Stay on this page" }).click();
  await expect(page.getByTestId("input-title")).toHaveValue("Updated isolated guide");
  await page.getByTestId("button-save").click();
  await expect(page.getByTestId("save-status")).toContainText(/saved/i);
  await readerPage.reload();
  await readerPage.getByTestId("card-howto-isolated-browser-guide").click();
  await expect(readerPage.getByTestId("detail-title")).toHaveText("Updated isolated guide");

  await page.getByTestId("button-unpublish").click();
  await expect(page.getByTestId("entry-status")).toHaveText("draft");
  await readerPage.reload();
  await expect(readerPage.getByTestId("card-howto-isolated-browser-guide")).toHaveCount(0);
  expect((await request.get("/api/howto/isolated-browser-guide")).status()).toBe(404);
  await page.getByTestId("button-delete").click();
  await expect(page.getByRole("alertdialog", { name: "Confirm delete" })).toBeVisible();
  await page.getByTestId("button-cancel-delete").click();
  await expect(page.getByTestId("howto-editor")).toBeVisible();
  await page.getByTestId("button-delete").click();
  await page.getByTestId("button-confirm-delete").click();
  await expect(page.getByTestId("row-entry-isolated-browser-guide")).toHaveCount(0);
  await readerPage.reload();
  await expect(readerPage.getByTestId("card-howto-isolated-browser-guide")).toHaveCount(0);
  expect(await (await request.get("/api/insights")).json()).toEqual(initialInsights);
  await reader.close();
});