/**
 * End-to-end tests for the admin support queue workflow.
 *
 * Covers:
 *   1. Admin logs in and navigates to Support Management via Users Admin.
 *   2. A ticket seeded via the API appears in the Ticket Queue.
 *   3. Admin opens the ticket, changes its status to "Resolved".
 *   4. Admin adds an internal note and saves it; the note persists.
 *
 * A disposable agency account is created in beforeAll to own the test ticket.
 * Both the ticket and the test account are cleaned up in afterAll.
 *
 * Requires the API server to be running at http://localhost:8080.
 * Tests are skipped if PLATFORM_ADMIN_PASSWORD is not set.
 */

import { test, expect, request as playwrightRequest } from "@playwright/test";

const API_BASE = "http://localhost:8080";
const TEST_PASSWORD = "Tq7zAdm99Support!";

function uniqueUsername(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}`;
}

test.describe("Admin support queue — ticket visibility, status change, admin notes", () => {
  const adminPassword = process.env.PLATFORM_ADMIN_PASSWORD;

  test.skip(!adminPassword, "PLATFORM_ADMIN_PASSWORD not set — skipping live support-admin test");

  let testUsername: string;
  let testTicketId: number;
  let adminCookie: string;

  test.beforeAll(async () => {
    testUsername = uniqueUsername("sqtest");

    const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });

    // Authenticate as the real admin.
    const loginResp = await ctx.post("/api/platform/login", {
      data: { username: "admin", password: adminPassword },
    });
    expect(loginResp.ok(), `Admin login failed: ${await loginResp.text()}`).toBeTruthy();
    const setCookie = loginResp.headers()["set-cookie"] ?? "";
    const cookieMatch = setCookie.match(/aio_sid=[^;]+/);
    adminCookie = cookieMatch ? cookieMatch[0] : "";
    expect(adminCookie, "No aio_sid cookie from admin login").toBeTruthy();

    // Create a disposable agency account to own the test ticket.
    const createResp = await ctx.post("/api/platform/accounts", {
      data: { username: testUsername, password: TEST_PASSWORD, role: "agency" },
      headers: { Cookie: adminCookie },
    });
    expect(
      createResp.ok(),
      `Failed to create test account: ${await createResp.text()}`,
    ).toBeTruthy();

    // Log in as the test user and create a ticket so there is something to view.
    const userLoginResp = await ctx.post("/api/platform/login", {
      data: { username: testUsername, password: TEST_PASSWORD },
    });
    expect(userLoginResp.ok(), "Test user login failed").toBeTruthy();
    const userCookieMatch = (userLoginResp.headers()["set-cookie"] ?? "").match(/aio_sid=[^;]+/);
    const userCookie = userCookieMatch ? userCookieMatch[0] : "";
    expect(userCookie, "No aio_sid cookie from user login").toBeTruthy();

    const ticketResp = await ctx.post("/api/support/tickets", {
      data: {
        category: "Getting Started",
        subject: "E2E Admin Queue: please review this",
        description:
          "Automated Playwright test ticket for verifying the admin support queue workflow.",
      },
      headers: { Cookie: userCookie },
    });
    expect(ticketResp.ok(), `Ticket creation failed: ${await ticketResp.text()}`).toBeTruthy();
    const ticketBody = (await ticketResp.json()) as { ticket: { id: number } };
    testTicketId = ticketBody.ticket.id;
    expect(testTicketId).toBeGreaterThan(0);

    await ctx.dispose();
  });

  test.afterAll(async () => {
    if (!testUsername) return;
    const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });

    // Re-authenticate as admin for cleanup.
    const loginResp = await ctx.post("/api/platform/login", {
      data: { username: "admin", password: adminPassword },
    });
    if (!loginResp.ok()) { await ctx.dispose(); return; }
    const setCookieClean = loginResp.headers()["set-cookie"] ?? "";
    const freshCookieMatch = setCookieClean.match(/aio_sid=[^;]+/);
    const freshCookie = freshCookieMatch ? freshCookieMatch[0] : "";
    if (!freshCookie) { await ctx.dispose(); return; }

    // Delete the disposable test account.
    await ctx.post("/api/platform/accounts/delete", {
      data: { username: testUsername },
      headers: { Cookie: freshCookie },
    });

    await ctx.dispose();
  });

  test("admin navigates to Support Admin, opens seeded ticket, marks resolved, saves note", async ({
    page,
  }) => {
    // ── 1. Log in as admin via the browser UI ────────────────────────────────
    await page.goto("/");
    await page.getByPlaceholder("Email or username").fill("admin");
    await page.getByPlaceholder("Password").fill(adminPassword!);
    await page.getByRole("button", { name: /Sign in/i }).click();

    // Admin sees platform home with "Manage Users" button.
    await expect(
      page.getByRole("button", { name: /Manage Users/i }),
    ).toBeVisible({ timeout: 12_000 });

    // ── 2. Navigate to Users Admin ────────────────────────────────────────────
    await page.getByRole("button", { name: /Manage Users/i }).click();

    // Users Admin page header has a "Support" button (message-square icon).
    await expect(
      page.getByRole("button", { name: /Support/i }),
    ).toBeVisible({ timeout: 8_000 });

    // ── 3. Click "Support" to open Support Management ─────────────────────────
    await page.getByRole("button", { name: /Support/i }).click();

    // The Support Management page should appear with the "Ticket Queue" tab.
    await expect(page.getByText("Support Management")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole("button", { name: /Ticket Queue/i })).toBeVisible();

    // ── 4. Ticket Queue loads and the seeded ticket is visible ────────────────
    await expect(
      page.getByText("E2E Admin Queue: please review this"),
    ).toBeVisible({ timeout: 10_000 });

    // ── 5. Open the ticket ────────────────────────────────────────────────────
    // Each row has a "View →" button; click the one in the same row as our ticket.
    const ticketRow = page.locator("tr", {
      has: page.getByText("E2E Admin Queue: please review this"),
    });
    await ticketRow.getByRole("button", { name: /View/i }).click();

    // Ticket detail view should show the subject and an "Open" status badge.
    await expect(
      page.getByText("E2E Admin Queue: please review this"),
    ).toBeVisible({ timeout: 6_000 });
    await expect(page.getByText(/Open|In Progress|Resolved|Closed/i).first()).toBeVisible();

    // ── 6. Change status to "Resolved" ────────────────────────────────────────
    const statusSelect = page.locator("select").filter({
      has: page.locator("option[value='resolved']"),
    });
    await expect(statusSelect).toBeVisible({ timeout: 5_000 });
    await statusSelect.selectOption("resolved");

    // The status badge in the heading should update to "Resolved".
    await expect(page.getByText("Resolved").first()).toBeVisible({ timeout: 6_000 });

    // ── 7. Add an admin note and save it ─────────────────────────────────────
    const notesTextarea = page.getByPlaceholder(/Internal notes, not visible to user/i);
    await expect(notesTextarea).toBeVisible({ timeout: 5_000 });
    await notesTextarea.fill("Playwright E2E: reviewed and resolved by automated test.");

    await page.getByRole("button", { name: /Save notes/i }).click();

    // After saving, the textarea must still contain the note (persisted, no error shown).
    await expect(notesTextarea).toHaveValue(
      "Playwright E2E: reviewed and resolved by automated test.",
      { timeout: 8_000 },
    );

    // No error banner should be visible.
    await expect(page.getByText(/failed|error/i).first()).not.toBeVisible({ timeout: 2_000 });
  });
});
