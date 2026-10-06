import { expect, test, type Page } from "@playwright/test";
import { dismissHomepagePrompts } from "../helpers/homepage-prompts";

async function login(page: Page, email = "release@example.invalid") {
  await page.goto("/");
  await dismissHomepagePrompts(page);
  await page.getByRole("button", { name: "Platform Login" }).click();
  await page.getByPlaceholder("Email or username").fill(email);
  await page.getByPlaceholder("Password").fill("release-harness-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: email })).toBeVisible({ timeout: 15_000 });
}

async function openDatabase(page: Page) {
  const databaseNav = page.getByRole("button", { name: /Media Database/ });
  if (!(await databaseNav.isVisible())) {
    const projectHub = page.getByRole("button", { name: "Project Hub", exact: true });
    if (await projectHub.isVisible()) await projectHub.click();
    await page.getByRole("button", { name: "Enter", exact: true }).click();
  }
  await page.getByRole("button", { name: /Media Database/ }).click();
  await page.getByRole("button", { name: "Manage my records", exact: true }).click();
}

async function browserApi(page: Page, path: string, method = "GET", data?: Record<string, unknown>) {
  return page.evaluate(async ({ path, method, data }) => {
    const response = await fetch(path, {
      method,
      credentials: "include",
      ...(data ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : {}),
    });
    return { status: response.status, body: await response.json() };
  }, { path, method, data });
}

test("manual contacts persist and become visible in the built app, without leaking across workspaces", async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);
  await login(page);
  await openDatabase(page);
  await expect(page.getByRole("button", { name: "Contacts (0)", exact: true })).toBeVisible();
  await expect(page.getByText("No contacts yet", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add contact", exact: true }).click();
  await page.getByPlaceholder("Jane", { exact: true }).fill("Synthetic");
  await page.getByPlaceholder("Smith", { exact: true }).fill("Writer 1234");
  await page.getByLabel("Publication / outlet", { exact: true }).fill("Synthetic Manual Journal");

  const rejected = page.waitForResponse((response) => response.url().endsWith("/media-db/contacts") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Save contact", exact: true }).click();
  expect((await rejected).status()).toBe(400);
  await expect(page.getByRole("alert")).toContainText("numeric identifiers");
  await expect(page.getByPlaceholder("Smith", { exact: true })).toHaveValue("Writer 1234");
  await expect(page.getByLabel("Publication / outlet", { exact: true })).toHaveValue("Synthetic Manual Journal");
  await expect(page.getByRole("status")).toHaveCount(0);

  await page.getByPlaceholder("Smith", { exact: true }).fill("Writer");
  const createdResponse = page.waitForResponse((response) => response.url().endsWith("/media-db/contacts") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Save contact", exact: true }).click();
  const response = await createdResponse;
  expect(response.ok()).toBeTruthy();
  const created = await response.json() as { contact: { id: number; outletId: number; accountId: string } };
  expect(created.contact.accountId).toBe("release-workspace");
  expect(created.contact.outletId).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { name: "Add contact", exact: true })).toHaveCount(0);
  await expect(page.getByText("Synthetic Writer", { exact: true })).toBeVisible();
  await expect(page.getByText("Synthetic Manual Journal", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Contacts (1)", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publications (1)", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Contact added.");
  const contactScreenshot = testInfo.outputPath("created-contact-visible.png");
  await page.screenshot({ path: contactScreenshot });
  await testInfo.attach("created-contact-visible", { path: contactScreenshot, contentType: "image/png" });

  // Existing browse filters must not conceal a successful new addition.
  const filter = page.getByPlaceholder("Natural language search (e.g. 'tech reporters in London')");
  await filter.fill("No matching person");
  await expect(page.getByText("Synthetic Writer", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Add contact", exact: true }).click();
  await page.getByPlaceholder("Jane", { exact: true }).fill("Unlinked");
  await page.getByPlaceholder("Smith", { exact: true }).fill("Reporter");
  await page.getByRole("button", { name: "Save contact", exact: true }).click();
  await expect(filter).toHaveValue("");
  await expect(page.getByText("Unlinked Reporter", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Contacts (2)", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Project Hub", exact: true }).click();
  await openDatabase(page);
  await expect(page.getByText("Synthetic Writer", { exact: true })).toBeVisible();
  await expect(page.getByText("Synthetic Manual Journal", { exact: true })).toBeVisible();
  await page.reload();
  const demo = page.getByRole("dialog", { name: /see your ai visibility/i });
  if (await demo.isVisible()) await page.keyboard.press("Escape");
  await openDatabase(page);
  await expect(page.getByRole("button", { name: "Contacts (2)", exact: true })).toBeVisible();
  await expect(page.getByText("Synthetic Writer", { exact: true })).toBeVisible();
  await expect(page.getByText("Synthetic Manual Journal", { exact: true })).toBeVisible();
  const persisted = await browserApi(page, "/api/store/media-db/contacts");
  expect(persisted.status).toBe(200);
  expect(persisted.body).toMatchObject({ total: 2, contacts: expect.arrayContaining([
    expect.objectContaining({ id: created.contact.id, outletId: created.contact.outletId, outletName: "Synthetic Manual Journal", accountId: "release-workspace" }),
    expect.objectContaining({ firstName: "Unlinked", lastName: "Reporter", outletId: null }),
  ]) });

  const otherContext = await browser.newContext();
  const viewerContext = await browser.newContext();
  try {
    const other = await otherContext.newPage();
    await login(other, "other@example.invalid");
    await openDatabase(other);
    await expect(other.getByText("No contacts yet", { exact: true })).toBeVisible();
    const isolated = await browserApi(other, "/api/store/media-db/contacts");
    expect(isolated.status).toBe(200);
    expect(isolated.body).toMatchObject({ total: 0, contacts: [] });
    const denied = await browserApi(other, `/api/store/media-db/contacts/${created.contact.id}`, "PUT", { role: "Forbidden change" });
    expect(denied.status).toBe(403);
    const outlets = await browserApi(other, "/api/store/media-db/outlets");
    expect(outlets.body).toMatchObject({ total: 0, outlets: [] });

    const viewer = await viewerContext.newPage();
    await login(viewer, "viewer@example.invalid");
    await openDatabase(viewer);
    await expect(viewer.getByRole("button", { name: "Add contact", exact: true })).toHaveCount(0);
    const readOnly = await browserApi(viewer, "/api/store/media-db/contacts", "POST", { firstName: "Forbidden", lastName: "Writer" });
    expect(readOnly.status).toBe(403);
  } finally {
    await otherContext.close();
    await viewerContext.close();
  }
});