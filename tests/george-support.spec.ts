/**
 * End-to-end tests for the George support panel flow.
 *
 * Covers the full user-facing support journey:
 *   1. A disposable agency account is created via the admin API in beforeAll.
 *   2. The user logs in via the UI form using a TEST_PASSWORD.
 *   3. The user navigates to the Project Hub (platform view with the sidebar).
 *   4. The user clicks "Ask George — Support" in the left sidebar.
 *   5. The George panel opens; the user types a question and sees a FAQ result.
 *   6. The user clicks "Not quite" → ticket form appears.
 *   7. The user fills in subject + description and submits the ticket.
 *   8. The success state shows "Ticket #N submitted!".
 *
 * The disposable account is deleted in afterAll. The real admin password is
 * only used for API calls (account creation/cleanup) — never typed in the browser.
 *
 * Requires the API server to be running at http://localhost:8080.
 * Tests are skipped if PLATFORM_ADMIN_PASSWORD is not set.
 */

import { test, expect, request as playwrightRequest } from "@playwright/test";

const API_BASE = "http://localhost:8080";
const TEST_PASSWORD = "Xq9zGeo77Support!";

function uniqueUsername(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}`;
}

test.describe("George support panel — FAQ search → ticket submission", () => {
  const adminPassword = process.env.PLATFORM_ADMIN_PASSWORD;

  test.skip(!adminPassword, "PLATFORM_ADMIN_PASSWORD not set — skipping live George support test");

  let testUsername: string;
  let realAdminCookie: string;

  test.beforeAll(async () => {
    testUsername = uniqueUsername("georgetest");

    const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });

    // Authenticate as the real admin via API to create a disposable test account.
    const loginResp = await ctx.post("/api/platform/login", {
      data: { username: "admin", password: adminPassword },
    });
    expect(loginResp.ok(), `Admin login failed: ${await loginResp.text()}`).toBeTruthy();
    const setCookie = loginResp.headers()["set-cookie"] ?? "";
    const cookieMatch = setCookie.match(/aio_sid=[^;]+/);
    realAdminCookie = cookieMatch ? cookieMatch[0] : "";
    expect(realAdminCookie, "No aio_sid cookie from admin login").toBeTruthy();

    // Create a disposable agency account for the browser test.
    const createResp = await ctx.post("/api/platform/accounts", {
      data: { username: testUsername, password: TEST_PASSWORD, role: "agency" },
      headers: { Cookie: realAdminCookie },
    });
    expect(
      createResp.ok(),
      `Failed to create test account: ${await createResp.text()}`,
    ).toBeTruthy();

    await ctx.dispose();
  });

  test.afterAll(async () => {
    if (!testUsername) return;
    const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });

    // Re-authenticate as admin and delete the disposable account.
    const loginResp = await ctx.post("/api/platform/login", {
      data: { username: "admin", password: adminPassword },
    });
    if (!loginResp.ok()) { await ctx.dispose(); return; }
    const setCookie = loginResp.headers()["set-cookie"] ?? "";
    const cookieMatch = setCookie.match(/aio_sid=[^;]+/);
    const freshCookie = cookieMatch ? cookieMatch[0] : "";
    if (!freshCookie) { await ctx.dispose(); return; }

    await ctx.post("/api/platform/accounts/delete", {
      data: { username: testUsername },
      headers: { Cookie: freshCookie },
    });

    await ctx.dispose();
  });

  test("open George panel → get FAQ answer → click Not quite → submit ticket → see success", async ({ page }) => {
    // ── 1. Log in via the browser UI ─────────────────────────────────────────
    await page.goto("/");
    await page.getByPlaceholder("Email or username").fill(testUsername);
    await page.getByPlaceholder("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /Sign in/i }).click();

    // After login, agency user sees the platform-home with a "Project Hub" button.
    await expect(
      page.getByRole("button", { name: /Project Hub/i }),
    ).toBeVisible({ timeout: 12_000 });

    // ── 2. Navigate to the main platform view (sidebar shows George button) ───
    await page.getByRole("button", { name: /Project Hub/i }).click();

    // The sidebar should now be visible with the "Ask George" button.
    await expect(
      page.getByRole("button", { name: /Ask George/i }),
    ).toBeVisible({ timeout: 8_000 });

    // ── 3. Open the George panel ──────────────────────────────────────────────
    await page.getByRole("button", { name: /Ask George/i }).click();

    // Panel header should show "George" and "GEO Support Assistant".
    await expect(page.getByText("George")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("GEO Support Assistant")).toBeVisible();

    // The question input at the bottom of the panel.
    const questionInput = page.getByPlaceholder("Type your question…");
    await expect(questionInput).toBeVisible({ timeout: 3_000 });

    // ── 4. Ask a question that matches a known FAQ entry ──────────────────────
    await questionInput.fill("how long does the audit take");
    await questionInput.press("Enter");

    // Searching indicator may appear briefly — then the FAQ result loads.
    // Wait for the FAQ answer bubble: the LLM Check duration entry says "3-8 minutes".
    await expect(
      page.getByText(/3.?8 minutes|3 to 8 minutes|minutes to complete/i),
    ).toBeVisible({ timeout: 10_000 });

    // "Was this helpful?" prompt with "Yes, thanks!" and "Not quite" buttons.
    await expect(page.getByRole("button", { name: /Yes, thanks!/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Not quite/i })).toBeVisible();

    // ── 5. Click "Not quite" to open the ticket form ─────────────────────────
    await page.getByRole("button", { name: /Not quite/i }).click();

    // The ticket form should appear with a "Submit ticket" button.
    await expect(page.getByRole("button", { name: /Submit ticket/i })).toBeVisible({
      timeout: 3_000,
    });

    // ── 6. Fill in subject and description ───────────────────────────────────
    // The form has a Subject input (placeholder "Subject *") and a description textarea.
    await page.getByPlaceholder("Subject *").fill("E2E test: audit duration question");
    await page
      .getByPlaceholder(/Describe the issue or question in detail/i)
      .fill("Automated Playwright test verifying the George support panel ticket submission.");

    // ── 7. Submit the ticket ──────────────────────────────────────────────────
    await page.getByRole("button", { name: /Submit ticket/i }).click();

    // ── 8. Verify the success state ───────────────────────────────────────────
    // Success bubble shows "Ticket #N submitted!" and a reference number.
    await expect(page.getByText(/Ticket #\d+ submitted!/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /Close/i })).toBeVisible();
  });
});
