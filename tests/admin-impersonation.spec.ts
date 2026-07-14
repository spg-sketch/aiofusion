/**
 * End-to-end tests for the admin "View account" impersonation flow.
 *
 * Covers the admin-side path of the cookie-swap system:
 *   1. A disposable admin account (testAdmin) logs in via the UI form
 *   2. testAdmin navigates to Users Admin ("Manage Accounts")
 *   3. testAdmin clicks "View account" on a second disposable agency account
 *      (testAgency) → server swaps aio_sid to testAgency's session and stashes
 *      testAdmin's session in aio_admin_sid
 *   4. Page reloads; ImpersonationBanner appears ("Support mode - viewing as …")
 *      and the API confirms the current session is testAgency's
 *   5. testAdmin clicks "Exit view-as" → server restores aio_sid from aio_admin_sid
 *      → navigates to /?aio_exit_impersonation=1 → platform-home shown, banner
 *        gone, API confirms testAdmin session is restored
 *
 * Both accounts are disposable: created via the real admin API in beforeAll and
 * deleted in afterAll. The real admin password is only ever used in API calls
 * (never typed into a browser form). The browser always authenticates as
 * testAdmin using the fixture TEST_PASSWORD.
 *
 * Requires the API server to be running at http://localhost:8080.
 * Tests are skipped if PLATFORM_ADMIN_PASSWORD is not set.
 */

import { test, expect, request as playwrightRequest } from "@playwright/test";

const API_BASE = "http://localhost:8080";

function uniqueTestUsername(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}`;
}

const TEST_PASSWORD = "Xq9zImpTest77";

test.describe("Admin View account / Exit view-as", () => {
  const adminPassword = process.env.PLATFORM_ADMIN_PASSWORD;

  test.skip(!adminPassword, "PLATFORM_ADMIN_PASSWORD not set — skipping live session test");

  let testAdminUsername: string;
  let testAgencyUsername: string;
  let realAdminCookieHeader: string;

  test.beforeAll(async () => {
    testAdminUsername = uniqueTestUsername("testadm");
    testAgencyUsername = uniqueTestUsername("testagn");

    const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });

    // Login as the real admin via API only — the password never enters a browser.
    const loginResp = await ctx.post("/api/platform/login", {
      data: { username: "admin", password: adminPassword },
    });
    expect(loginResp.ok(), `Admin login failed: ${await loginResp.text()}`).toBeTruthy();
    const setCookie = loginResp.headers()["set-cookie"] ?? "";
    const cookieMatch = setCookie.match(/aio_sid=[^;]+/);
    realAdminCookieHeader = cookieMatch ? cookieMatch[0] : "";
    expect(realAdminCookieHeader, "No aio_sid cookie from admin login").toBeTruthy();

    // Create a disposable admin account. The real admin can create any role.
    const createAdminResp = await ctx.post("/api/platform/accounts", {
      data: { username: testAdminUsername, password: TEST_PASSWORD, role: "admin" },
      headers: { Cookie: realAdminCookieHeader },
    });
    expect(
      createAdminResp.ok(),
      `Failed to create test admin account: ${await createAdminResp.text()}`,
    ).toBeTruthy();

    // Create a disposable agency account to be impersonated.
    const createAgencyResp = await ctx.post("/api/platform/accounts", {
      data: { username: testAgencyUsername, password: TEST_PASSWORD, role: "agency" },
      headers: { Cookie: realAdminCookieHeader },
    });
    expect(
      createAgencyResp.ok(),
      `Failed to create test agency account: ${await createAgencyResp.text()}`,
    ).toBeTruthy();

    await ctx.dispose();
  });

  test.afterAll(async () => {
    const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });

    // Re-authenticate as the real admin for cleanup (the test admin session
    // may have been consumed or stashed during the impersonation flow).
    const loginResp = await ctx.post("/api/platform/login", {
      data: { username: "admin", password: adminPassword },
    });
    if (!loginResp.ok()) {
      await ctx.dispose();
      return;
    }
    const setCookie = loginResp.headers()["set-cookie"] ?? "";
    const cookieMatch = setCookie.match(/aio_sid=[^;]+/);
    const freshCookie = cookieMatch ? cookieMatch[0] : "";
    if (!freshCookie) {
      await ctx.dispose();
      return;
    }

    // Delete both disposable accounts (order matters: delete the non-last admin
    // first; agency can be deleted in either order).
    if (testAgencyUsername) {
      await ctx.post("/api/platform/accounts/delete", {
        data: { username: testAgencyUsername },
        headers: { Cookie: freshCookie },
      });
    }
    if (testAdminUsername) {
      await ctx.post("/api/platform/accounts/delete", {
        data: { username: testAdminUsername },
        headers: { Cookie: freshCookie },
      });
    }

    await ctx.dispose();
  });

  test("View account shows impersonation banner, Exit view-as restores admin session", async ({
    page,
  }) => {
    // ── 1. Log in as the disposable admin account ────────────────────────────
    // TEST_PASSWORD is used — the real admin password never enters the browser.
    await page.goto("/");
    await page.getByPlaceholder("Email or username").fill(testAdminUsername);
    await page.getByPlaceholder("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    // Admin platform-home shows "Manage Accounts" (not "Client Accounts").
    await expect(
      page.getByRole("button", { name: /Manage Accounts/i }),
    ).toBeVisible({ timeout: 12_000 });

    // ── 2. Navigate to the Users Admin page ─────────────────────────────────
    await page.getByRole("button", { name: /Manage Accounts/i }).click();

    // Wait for the account list to render.
    await expect(
      page.getByText("Accounts", { exact: false }),
    ).toBeVisible({ timeout: 8_000 });

    // The disposable agency account should appear in the list.
    await expect(
      page.getByText(testAgencyUsername, { exact: false }),
    ).toBeVisible({ timeout: 8_000 });

    // ── 3. Click "View account" for the agency account ───────────────────────
    // Each account is rendered in a rounded card. Filter to the card containing
    // testAgencyUsername, then click its "View account" button.
    const accountCard = page
      .locator(".rounded-xl")
      .filter({ hasText: testAgencyUsername })
      .first();
    const viewAccountBtn = accountCard.getByRole("button", { name: /View account/i });
    await expect(viewAccountBtn).toBeVisible({ timeout: 5_000 });
    await viewAccountBtn.click();

    // handleViewAccount calls serverImpersonate then window.location.reload().
    // Wait for the reload and any subsequent network traffic to settle.
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    // ── 4. Verify impersonation banner appears ───────────────────────────────
    // ImpersonationBanner is mounted at root level in main.tsx (outside the
    // view router), so it appears on whichever page view loads post-reload.
    await expect(
      page.getByText("Support mode", { exact: false }),
    ).toBeVisible({ timeout: 10_000 });

    // Banner includes the impersonated account's username.
    await expect(
      page.getByText(testAgencyUsername, { exact: false }),
    ).toBeVisible({ timeout: 5_000 });

    const exitBtn = page.getByRole("button", { name: /Exit view-as/i });
    await expect(exitBtn).toBeVisible({ timeout: 5_000 });

    // Confirm via API that the active cookie session is the agency account and
    // that the test admin is recorded as the impersonator.
    const meResp = await page.request.get(`${API_BASE}/api/platform/me`);
    const me = (await meResp.json()) as {
      account: { username: string; role: string } | null;
      impersonating: { by: string; byRole: string } | null;
    };
    expect(me.account?.username?.toLowerCase()).toBe(testAgencyUsername.toLowerCase());
    expect(me.account?.role).toBe("agency");
    expect(me.impersonating?.by?.toLowerCase()).toBe(testAdminUsername.toLowerCase());

    // ── 5. Click "Exit view-as" and verify admin session is restored ─────────
    await exitBtn.click();

    // ImpersonationBanner calls serverExitImpersonation then navigates to
    // window.location.replace("/?aio_exit_impersonation=1").
    await page.waitForURL(/aio_exit_impersonation/, { timeout: 10_000 });

    // App.tsx detects the param → setView("platform-home"); bootstrapAuth
    // restores the test admin session from the stashed aio_admin_sid cookie.
    await expect(
      page.getByText("Support mode", { exact: false }),
    ).not.toBeVisible({ timeout: 10_000 });

    // Admin platform-home is back: "Manage Accounts" button is visible.
    await expect(
      page.getByRole("button", { name: /Manage Accounts/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Confirm via API that the test admin session is fully restored.
    const meAfterResp = await page.request.get(`${API_BASE}/api/platform/me`);
    const meAfter = (await meAfterResp.json()) as {
      account: { username: string; role: string } | null;
      impersonating: null;
    };
    expect(meAfter.account?.username?.toLowerCase()).toBe(testAdminUsername.toLowerCase());
    expect(meAfter.account?.role).toBe("admin");
    expect(meAfter.impersonating).toBeNull();
  });
});
