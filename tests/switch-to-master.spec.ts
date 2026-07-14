/**
 * End-to-end tests for the "Switch to Master" and "Exit view-as" flows.
 *
 * These two flows involve server-side cookie swaps:
 *   1. Switch to Master: agency session stashed in aio_admin_sid; admin session set in aio_sid
 *   2. Exit view-as:     aio_sid restored from aio_admin_sid stash; aio_admin_sid cleared
 *
 * The test uses a disposable agency account created and deleted via the admin API
 * so that real admin credentials are never exposed to the browser context.
 *
 * Requires the API server to be running at http://localhost:8080.
 * The tests are skipped if PLATFORM_ADMIN_PASSWORD is not set.
 */

import { test, expect, request as playwrightRequest } from "@playwright/test";

const API_BASE = "http://localhost:8080";

function uniqueTestUsername(): string {
  return `testmo${Date.now().toString(36)}`;
}

const TEST_PASSWORD = "Xq9zTestPass99";

test.describe("Switch to Master / Exit view-as", () => {
  const adminPassword = process.env.PLATFORM_ADMIN_PASSWORD;

  test.skip(!adminPassword, "PLATFORM_ADMIN_PASSWORD not set — skipping live session test");

  let testUsername: string;
  let adminCookieHeader: string;

  test.beforeAll(async () => {
    testUsername = uniqueTestUsername();
    const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });

    // Login as admin to get a session cookie.
    const loginResp = await ctx.post("/api/platform/login", {
      data: { username: "admin", password: adminPassword },
    });
    expect(loginResp.ok(), `Admin login failed: ${await loginResp.text()}`).toBeTruthy();
    const setCookie = loginResp.headers()["set-cookie"] ?? "";
    const cookieMatch = setCookie.match(/aio_sid=[^;]+/);
    adminCookieHeader = cookieMatch ? cookieMatch[0] : "";
    expect(adminCookieHeader, "No aio_sid cookie returned from admin login").toBeTruthy();

    // Create a disposable agency account.
    const createResp = await ctx.post("/api/platform/accounts", {
      data: { username: testUsername, password: TEST_PASSWORD, role: "agency" },
      headers: { Cookie: adminCookieHeader },
    });
    expect(
      createResp.ok(),
      `Failed to create test account: ${await createResp.text()}`,
    ).toBeTruthy();

    // Grant masterOwner so "Switch to Master" button appears.
    const masterOwnerResp = await ctx.post(
      `/api/platform/admin/accounts/${testUsername}/master-owner`,
      {
        data: { masterOwner: true },
        headers: { Cookie: adminCookieHeader },
      },
    );
    expect(
      masterOwnerResp.ok(),
      `Failed to grant masterOwner: ${await masterOwnerResp.text()}`,
    ).toBeTruthy();

    await ctx.dispose();
  });

  test.afterAll(async () => {
    if (!testUsername) return;
    const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });

    // Re-authenticate as admin (previous session may have been consumed by switch-to-master).
    const loginResp = await ctx.post("/api/platform/login", {
      data: { username: "admin", password: adminPassword },
    });
    if (!loginResp.ok()) {
      await ctx.dispose();
      return;
    }
    const setCookie = loginResp.headers()["set-cookie"] ?? "";
    const cookieMatch = setCookie.match(/aio_sid=[^;]+/);
    const freshAdminCookie = cookieMatch ? cookieMatch[0] : "";
    if (!freshAdminCookie) {
      await ctx.dispose();
      return;
    }

    await ctx.post("/api/platform/accounts/delete", {
      data: { username: testUsername },
      headers: { Cookie: freshAdminCookie },
    });
    await ctx.dispose();
  });

  test("Switch to Master shows impersonation banner, Exit restores agency session", async ({
    page,
  }) => {
    // ── 1. Login as the test agency account ────────────────────────────────
    await page.goto("/");
    await page.getByPlaceholder("Email or username").fill(testUsername);
    await page.getByPlaceholder("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    // Platform home should appear after login.
    await expect(
      page.getByRole("button", { name: /Client Accounts/i }),
    ).toBeVisible({ timeout: 10_000 });

    // ── 2. Navigate to the Client Accounts page ─────────────────────────────
    await page.getByRole("button", { name: /Client Accounts/i }).click();
    await expect(
      page.getByText("Manage your client accounts"),
    ).toBeVisible({ timeout: 8_000 });

    // "My account" section shows the test username.
    await expect(page.getByText(testUsername, { exact: false })).toBeVisible();

    // "Switch to Master" button is present because masterOwner=true.
    const switchBtn = page.getByRole("button", { name: /Switch to Master/i });
    await expect(switchBtn).toBeVisible();

    // ── 3. Click "Switch to Master" ─────────────────────────────────────────
    await switchBtn.click();

    // The handler calls window.location.replace("/?aio_switched_master=1").
    await page.waitForURL(/aio_switched_master/, { timeout: 10_000 });

    // App.tsx detects the query param and shows platform-home.
    // bootstrapAuth() runs and sets the admin session.
    // ImpersonationBanner appears because /api/platform/me returns impersonating.
    const banner = page.locator('[style*="background: rgb(10, 22, 40)"], [style*="background:#0a1628"], [style*="background: #0a1628"]');
    await expect(
      page.getByText("Support mode", { exact: false }),
    ).toBeVisible({ timeout: 10_000 });

    const exitBtn = page.getByRole("button", { name: /Exit view-as/i });
    await expect(exitBtn).toBeVisible();

    // Verify via API that the session is now the admin account.
    const meResp = await page.request.get(`${API_BASE}/api/platform/me`);
    const me = await meResp.json() as {
      account: { username: string; role: string } | null;
      impersonating: { by: string } | null;
    };
    expect(me.account?.role).toBe("admin");
    expect(me.impersonating?.by?.toLowerCase()).toBe(testUsername.toLowerCase());

    // ── 4. Click "Exit view-as" ─────────────────────────────────────────────
    await exitBtn.click();

    // The handler calls window.location.replace("/?aio_exit_impersonation=1").
    await page.waitForURL(/aio_exit_impersonation/, { timeout: 10_000 });

    // App.tsx detects the query param, shows platform-home, bootstrapAuth
    // runs and restores the agency session.
    await expect(
      page.getByText("Support mode", { exact: false }),
    ).not.toBeVisible({ timeout: 10_000 });

    // Platform home shown (not the marketing landing page).
    await expect(
      page.getByRole("button", { name: /Client Accounts/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Verify via API that the agency session has been restored.
    const meAfterResp = await page.request.get(`${API_BASE}/api/platform/me`);
    const meAfter = await meAfterResp.json() as {
      account: { username: string; role: string } | null;
      impersonating: null;
    };
    expect(meAfter.account?.username?.toLowerCase()).toBe(testUsername.toLowerCase());
    expect(meAfter.account?.role).toBe("agency");
    expect(meAfter.impersonating).toBeNull();
  });
});
