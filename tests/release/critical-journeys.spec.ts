import { expect, test } from "@playwright/test";
import { dismissHomepagePrompts } from "../helpers/homepage-prompts";

test("public navigation serves the production-built application", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("The AI Authority Platform");
  await dismissHomepagePrompts(page);
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
  await dismissHomepagePrompts(page);
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