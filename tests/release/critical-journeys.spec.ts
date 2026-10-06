import { expect, test, type Page } from "@playwright/test";

async function chooseEssentialCookies(page: Page) {
  const choices = page.getByRole("region", { name: "Cookie choices" });
  // Hydration can lag behind the initial document response in the built app.
  await expect(choices).toBeVisible({ timeout: 25_000 });
  // Fresh visits show only the compact cookie choice, not a competing demo.
  await expect(page.getByRole("dialog", { name: /see your ai visibility/i })).toBeHidden();
  await choices.getByRole("button", { name: "Essential only" }).click();
  await expect(choices).toBeHidden();
  expect(await page.evaluate(() =>
    JSON.parse(localStorage.getItem("aio.cookiePreferences.v1") ?? "null")?.analytics,
  )).toBe(false);
  await expect(page.locator("#aio-analytics-loader")).toHaveCount(0);
}

test("public navigation serves the production-built application", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("The AI Authority Platform");
  await chooseEssentialCookies(page);
  await page.goto("/about");
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.locator("body")).not.toBeEmpty();
});

test("sign-in grants only the authorised workspace", async ({ page }) => {
  test.setTimeout(90_000);
  const authority = page.waitForResponse((response) =>
    response.url().endsWith("/api/platform/me") && response.request().method() === "GET",
  );
  await page.goto("/");
  await authority;
  await chooseEssentialCookies(page);
  await page.getByRole("button", { name: "Platform Login" }).click();
  await page.getByPlaceholder("Email or username").fill("release@example.invalid");
  await page.getByPlaceholder("Password").fill("release-harness-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "release@example.invalid" })).toBeVisible({ timeout: 12_000 });
  await page.getByRole("button", { name: "Project Hub" }).click();
  await expect(page.getByText("Release project")).toBeVisible({ timeout: 12_000 });
  const denied = await page.evaluate(async () => {
    const response = await fetch("/api/store/projects/other-workspace/intake", { credentials: "include" });
    return { status: response.status, body: await response.json() };
  });
  // Cross-workspace reads deliberately return 404 so the API does not disclose
  // whether another customer's project exists.
  expect(denied.status).toBe(404);
  expect(denied.body).toMatchObject({ error: "Project not found." });
});

test("private workspace data is denied before sign-in", async ({ request }) => {
  const identity = await request.get("/api/platform/me");
  expect(identity.status()).toBe(200);
  await expect(identity.json()).resolves.toMatchObject({ account: null });
  expect((await request.get("/api/store/projects")).status()).toBe(401);
});