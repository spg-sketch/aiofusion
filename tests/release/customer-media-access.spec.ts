import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { syntheticTotp } from "./synthetic-totp";
import { dismissHomepagePrompts } from "../helpers/homepage-prompts";

async function login(page: Page, email: string, password = "release-harness-password") {
  await page.goto("/");
  await dismissHomepagePrompts(page);
  await page.getByRole("button", { name: "Platform Login" }).click();
  await page.getByPlaceholder("Email or username").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  if (email === "admin@example.invalid") await page.getByLabel("Authenticator code").fill(syntheticTotp());
  await expect(page.getByRole("button", { name: "Project Hub", exact: true })).toBeVisible({ timeout: 15_000 });
}

async function openDatabase(page: Page) {
  if (!(await page.getByRole("button", { name: /Media Database/ }).isVisible())) {
    await page.getByRole("button", { name: "Project Hub", exact: true }).click();
    await page.getByRole("button", { name: "Enter", exact: true }).first().click();
  }
  await page.getByRole("button", { name: /Media Database/ }).click();
}

async function browserApi(page: Page, path: string, method = "GET", data?: Record<string, unknown>) {
  return page.evaluate(async ({ path, method, data }) => {
    const response = await fetch(path, {
      method,
      credentials: "include",
      ...(data ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : {}),
    });
    const text = await response.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* CSV or an empty response */ }
    return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body };
  }, { path, method, data });
}

async function csv(page: Page, scope: "selected" | "saved", count: number, type: "contacts" | "publications") {
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: `Download CSV - ${scope} batch (${count} records)` }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe(`Media ${type === "contacts" ? "Contacts" : "Publications"}.csv`);
  const text = await readFile((await download.path())!, "utf8");
  expect(text.trim().split("\r\n")).toHaveLength(count + 1);
  return text;
}

for (const [email, workspace] of [["direct-media@example.invalid", "direct-media"], ["release@example.invalid", "release-workspace"]]) {
  test(`${workspace}: isolated management and real saved/selected CSV batches share the daily allowance`, async ({ page }) => {
    await login(page, email!);
    await openDatabase(page);
    await page.getByRole("button", { name: "Manage my records", exact: true }).click();
    await expect(page.getByRole("button", { name: "Contacts (1)", exact: true })).toBeVisible();
    await expect(page.getByText(`Private ${workspace}`, { exact: true })).toBeVisible();
    await expect(page.getByText("Internal tools", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/100 of 100 shared records remain today/)).toBeVisible();
    await expect(page.getByText(/Resets .* UTC/)).toBeVisible();
    const list = await browserApi(page, "/api/store/media-db/contacts?pageSize=10000");
    expect(list.status).toBe(200);
    expect((list.body as { total: number }).total).toBe(1);
    for (const path of ["search?scope=all", "contacts?scope=all", "outlets?scope=all", "search?scope=shared&phrase=Batch"]) {
      expect((await browserApi(page, `/api/store/media-db/${path}`)).status).toBe(400);
    }
    const search = await browserApi(page, "/api/store/media-db/search?scope=all&type=contacts&phrase=Batch&pageSize=100000");
    expect(search.status).toBe(200);
    const records = search.body as { results: Array<{ id: number }>; total: number };
    expect(records.results).toHaveLength(25);
    expect(records.total).toBe(26);
    const ids = records.results.map((row: { id: number }) => row.id);
    for (const data of [
      { scope: "selected", type: "contacts", ids, format: "xlsx" },
      { scope: "selected", type: "contacts", ids: [...ids, 999999], format: "csv" },
      { scope: "saved", type: "contacts", format: "csv" },
    ]) expect((await browserApi(page, "/api/store/media-db/export", "POST", { ...data, operationId: crypto.randomUUID() })).status).toBe(400);
    await page.getByRole("button", { name: "My Media Database", exact: true }).click();
    await expect(page.getByRole("button", { name: /Download CSV - saved batch \(25 records\)/ })).toBeEnabled();
    await expect(page.getByRole("button", { name: /Excel/ })).toHaveCount(0);
    expect(await csv(page, "saved", 25, "contacts")).toContain('"First Name"');
    await page.getByRole("button", { name: "Select visible results", exact: true }).click();
    await csv(page, "selected", 25, "contacts");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText("0/25 selected", { exact: true })).toBeVisible();
    await expect(page.getByRole("checkbox")).toHaveCount(1);
    await page.getByRole("checkbox").check();
    await csv(page, "selected", 1, "contacts");
    await page.getByLabel("Search record type").selectOption("publications");
    await csv(page, "saved", 25, "publications");
    await expect(page.getByText(/24 of 100 shared records remain today/)).toBeVisible();
    await page.getByRole("button", { name: "Select visible results", exact: true }).click();
    await page.getByRole("button", { name: "Download CSV - selected batch (25 records)" }).click();
    await expect(page.getByRole("alert")).toContainText("Only 24 shared records remain");
    await page.getByRole("checkbox").last().uncheck();
    const publicationCsv = await csv(page, "selected", 24, "publications");
    expect(publicationCsv).not.toContain("batch-");
    await expect(page.getByText(/0 of 100 shared records remain today/)).toBeVisible();
    await page.getByRole("button", { name: "Manage my records", exact: true }).click();
    await page.getByRole("button", { name: /Contacts \(/ }).click();
    await page.getByRole("button", { name: "Browse contacts", exact: true }).click();
    await page.getByRole("checkbox", { name: /Select contact/ }).check();
    expect(await csv(page, "selected", 1, "contacts")).toContain(`Private","${workspace}`);
    expect(((await browserApi(page, "/api/store/media-db/export-allowance")).body as { remaining: number }).remaining).toBe(0);
    expect(((await browserApi(page, "/api/store/media-db/bookmarks")).body as { total: number }).total).toBe(52);
  });
}

test("managed view, viewer and Master preserve role boundaries using actual sessions", async ({ page, browser }) => {
  await login(page, "release@example.invalid");
  const viewed = await browserApi(page, "/api/platform/accounts/managed-media/impersonate", "POST");
  expect(viewed.status).toBe(200);
  // Reload clears the previous workspace's client cache through the app's
  // normal /me hydration, while retaining the server-created view-as cookie.
  await page.reload();
  await openDatabase(page);
  await page.getByRole("button", { name: "Manage my records", exact: true }).click();
    const own = await browserApi(page, "/api/store/media-db/contacts");
    expect((own.body as { contacts: Array<{ accountId: string }> }).contacts.map((row) => row.accountId)).toEqual(["managed-media"]);
  await expect(page.getByText("Internal tools", { exact: true })).toHaveCount(0);
  const viewerContext = await browser.newContext();
  const masterContext = await browser.newContext();
  try {
    const viewer = await viewerContext.newPage();
    await login(viewer, "viewer@example.invalid");
    await openDatabase(viewer);
    await viewer.getByRole("button", { name: "Manage my records", exact: true }).click();
    await expect(viewer.getByRole("button", { name: "Add contact", exact: true })).toHaveCount(0);
    expect((await browserApi(viewer, "/api/store/media-db/contacts", "POST", { firstName: "Forbidden" })).status).toBe(403);
    const master = await masterContext.newPage();
    await login(master, "admin@example.invalid", "release-harness-admin-password");
    const full = await browserApi(master, "/api/store/media-db/export", "POST", { scope: "full", type: "contacts", format: "csv" });
    expect(full.status).toBe(200);
    expect(full.headers["content-type"]).toContain("text/csv");
    expect((await browserApi(master, "/api/store/media-db/search?scope=all")).status).toBe(200);
  } finally {
    await viewerContext.close();
    await masterContext.close();
  }
});