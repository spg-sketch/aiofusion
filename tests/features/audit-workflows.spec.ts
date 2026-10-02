import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loginAndEnterReleaseProject, reenterReleaseProject, watchBrowserFailures, openTool } from "./tool-helpers";

const EMAIL = "release@example.invalid";
const PASSWORD = "release-harness-password";
const PROJECT_ID = "release-project";
const BRAND = "Example Domain";
const WEBSITE = "https://example.com";
const SCREENSHOT_DIR = resolve(process.cwd(), ".local/feature-test-reports/core/screenshots");

async function dismissDemo(page: Page) {
  const dialog = page.getByRole("dialog", { name: /see your ai visibility/i });
  if (await dialog.count()) {
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
}

async function signInAndOpenReleaseProject(page: Page) {
  await loginAndEnterReleaseProject(page);
}

async function reopenReleaseProject(page: Page) {
  await page.reload();
  await reenterReleaseProject(page);
}

async function authenticatedJson(page: Page, path: string) {
  return page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: "include" });
    return { status: response.status, body: await response.json().catch(() => ({})) as any };
  }, path);
}

async function captureSavedResult(page: Page, name: string) {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, name), fullPage: true });
}

function resultEvent(body: Uint8Array) {
  const blocks = new TextDecoder().decode(body).split(/\r?\n\r?\n/);
  const resultBlock = blocks.find((block) => /^event:\s*result\s*$/m.test(block));
  if (!resultBlock) throw new Error("The live /api/llm-check stream did not include a result event.");
  const data = resultBlock.split(/\r?\n/).find((line) => line.startsWith("data:"));
  if (!data) throw new Error("The live /api/llm-check result event had no data payload.");
  return JSON.parse(data.slice(5).trim());
}

test("Earned Media Visibility Audit uses live providers and saves, reopens, exports, and deletes its own result", async ({ page }) => {
  test.skip(process.env.AIO_FEATURE_LIVE_AI !== "1", "Requires the release harness live OpenAI and Anthropic opt-in.");
  test.setTimeout(720_000);
  const assertNoFailures = watchBrowserFailures(page);

  await signInAndOpenReleaseProject(page);
  await openTool(page, "Earned Media Visibility Audit");
  await page.getByRole("button", { name: "Refine what we probe" }).click();
  await page.getByPlaceholder("Enter the brand or sub-brand to probe").fill(BRAND);

  // Keep the real target phrase set to one user-entered discovery query. Do not
  // invoke the AI query generator, which creates twelve unnecessary phrases.
  const removeButtons = page.locator('button[title="Remove query"]');
  while (await removeButtons.count()) await removeButtons.first().click();
  const discovery = page.locator("div.rounded-xl.border.p-3").filter({
    has: page.getByText("Discovery", { exact: true }),
  }).first();
  await discovery.getByRole("button", { name: "Add query" }).click();
  const discoveryQuery = "Which public relations and communications agencies publish clear service information for organizations seeking communications support?";
  await discovery.getByPlaceholder("Type a query...").fill(discoveryQuery);
  await expect(page.getByText(/These 1 queries are run as blind probes/i)).toBeVisible();

  const responsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/llm-check") && response.request().method() === "POST",
    { timeout: 720_000 },
  );
  await page.getByRole("button", { name: "Run Visibility Audit" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  const streamResponse = await responsePromise;
  expect([200, 202]).toContain(streamResponse.status());
  const posted = streamResponse.request().postDataJSON();
  expect(posted).toMatchObject({ companyName: BRAND, projectId: PROJECT_ID });
  expect(posted.targetPhrases).toHaveLength(1);
  expect(posted.targetPhrases[0].text).toBe(discoveryQuery);
  expect(posted.projectData.website).toContain("example.com");
  expect(posted.sectors.length).toBeGreaterThan(0);

  let liveResult: any;
  if (streamResponse.status() === 202) {
    const started = await streamResponse.json();
    expect(started).toMatchObject({ status: "running" });
    expect(started.runId).toBeTruthy();
    let finished: any;
    await expect.poll(async () => {
      const response = await authenticatedJson(page, `/api/llm-check/runs/${started.runId}`);
      expect(response.status).toBe(200);
      finished = response.body;
      return finished.status;
    }, { timeout: 660_000, intervals: [2_000] }).toMatch(/^(succeeded|failed)$/);
    expect(finished.status, finished.error ?? "Durable audit must complete successfully").toBe("succeeded");
    liveResult = finished.result;
  } else {
    expect(streamResponse.headers()["content-type"]).toContain("text/event-stream");
    liveResult = resultEvent(await streamResponse.body());
  }
  expect(liveResult.companyName).toBe(BRAND);
  expect(liveResult.probes.length).toBeGreaterThan(0);
  expect(liveResult.byModel.chatgpt.probes).toBeGreaterThan(0);
  expect(liveResult.byModel.claude.probes).toBeGreaterThan(0);
  expect(liveResult.probes.some((probe: { model: string }) => /gpt|chatgpt/i.test(probe.model))).toBe(true);
  expect(liveResult.probes.some((probe: { model: string }) => /claude/i.test(probe.model))).toBe(true);
  expect(liveResult.assessmentStatus).toMatchObject({ status: "complete", reason: null });
  expect(liveResult.assessmentOutcome).toMatchObject({ status: "complete", reasonCategory: null });
  expect(liveResult.assessment.summary).toBeTruthy();
  expect(liveResult.assessment.dimensions.length).toBeGreaterThan(0);

  await expect(page.getByText(`${BRAND} was mentioned in`, { exact: false })).toBeVisible();
  await expect(page.getByText(/ChatGPT:/).first()).toBeVisible();
  await expect(page.getByText(/Claude:/).first()).toBeVisible();

  // The real UI creates its branded HTML report in a popup for print/PDF.
  const [report] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: "Save this report" }).click(),
  ]);
  await expect(report.locator("body")).toContainText("AI Authority & Earned-Media Visibility Assessment");
  await expect(report.locator("body")).toContainText(BRAND);
  await expect(report.locator("body")).toContainText(discoveryQuery);
  await report.close();

  await expect.poll(async () => {
    const response = await authenticatedJson(page, `/api/store/projects/${PROJECT_ID}/audits`);
    if (response.status !== 200) return null;
    return response.body.audits?.find((audit: { result: { checkedAt: string } }) =>
      audit.result.checkedAt === liveResult.checkedAt,
    ) ?? null;
  }, { timeout: 20_000, intervals: [250, 500, 1_000] }).not.toBeNull();
  const persisted = await authenticatedJson(page, `/api/store/projects/${PROJECT_ID}/audits`);
  expect(persisted.status).toBe(200);
  const ownAudit = persisted.body.audits.find((audit: { result: { checkedAt: string } }) =>
    audit.result.checkedAt === liveResult.checkedAt,
  );
  expect(ownAudit?.result.assessmentOutcome.status).toBe("complete");
  const auditId = ownAudit.id as string;

  await captureSavedResult(page, "earned-media-visibility-audit.jpg");
  // Remove only the browser cache so the following UI reopen proves the
  // saved report is recovered from the project-scoped server history.
  await page.evaluate((key) => localStorage.removeItem(key), `aio.savedAudits.${PROJECT_ID}`);
  await reopenReleaseProject(page);
  await openTool(page, "Earned Media Visibility Audit");
  await expect(page.getByRole("heading", { name: "Saved audits" })).toBeVisible();
  const savedCard = page.locator("div.rounded-lg.border").filter({ hasText: BRAND }).first();
  await expect(savedCard).toBeVisible();
  await savedCard.getByRole("button").first().click();
  await expect(page.getByText(`${BRAND} was mentioned in`, { exact: false })).toBeVisible();
  await savedCard.getByTitle("Remove this saved audit").click();
  await expect(savedCard).toHaveCount(0);
  await expect.poll(async () => {
    const response = await authenticatedJson(page, `/api/store/projects/${PROJECT_ID}/audits`);
    return response.body.audits?.some((audit: { id: string }) => audit.id === auditId);
  }, { timeout: 15_000 }).toBe(false);
  assertNoFailures();
});

test("Website Technical GEO Audit scans example.com, saves/downloads, reloads, reopens, and deletes its own result", async ({ page }) => {
  test.setTimeout(120_000);
  const assertNoFailures = watchBrowserFailures(page);
  await signInAndOpenReleaseProject(page);
  await openTool(page, "Measure & Report");
  await page.getByRole("button", { name: "Website GEO & Technical" }).click();
  await page.getByRole("button", { name: "Open Website Technical GEO" }).click();
  await expect(page.getByRole("heading", { name: "Website GEO Assessment" })).toBeVisible();
  await page.locator("#seo-audit-url").fill(WEBSITE);

  const responsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/seo-audit") && response.request().method() === "POST",
    { timeout: 120_000 },
  );
  await page.getByRole("button", { name: "Run Audit" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.url).toContain("example.com");
  expect(result.meta).toEqual(expect.arrayContaining([
    expect.objectContaining({ label: "Title tag", value: expect.stringContaining("Example Domain") }),
  ]));
  expect(result.performance).toEqual(expect.arrayContaining([
    expect.objectContaining({ label: "HTTP status", value: "200", status: "pass" }),
  ]));
  expect(result.scores.overall).toBeGreaterThanOrEqual(0);
  expect(result.scores.overall).toBeLessThanOrEqual(100);
  await expect(page.getByRole("heading", { name: /Overall Score:/ })).toBeVisible();
  await expect(page.getByText(WEBSITE, { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Example Domain", { exact: false }).first()).toBeVisible();
  await page.locator("#seo-audit-performance-toggle").click();
  await expect(page.getByText("HTTP status", { exact: true })).toBeVisible();
  await expect(page.getByText("200", { exact: true }).first()).toBeVisible();

  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Save(?:d)? & download(?:ed)?/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/tech-geo-audit-example-com.*\.doc$/);
  const document = await readFile((await download.path())!);
  expect(document.toString("utf8")).toContain("Website Technical GEO Audit");
  expect(document.toString("utf8")).toContain("example.com");
  await expect(page.getByRole("button", { name: "Saved & downloaded" })).toBeVisible();
  await captureSavedResult(page, "website-technical-geo-audit.jpg");

  await expect.poll(async () => {
    const response = await authenticatedJson(page, `/api/store/projects/${PROJECT_ID}/tech-geo`);
    return response.status === 200
      ? response.body["tech-geo"]?.find((entry: { result: { fetchedAt: string } }) =>
        entry.result.fetchedAt === result.fetchedAt,
      ) ?? null
      : null;
  }, { timeout: 20_000, intervals: [250, 500, 1_000] }).not.toBeNull();
  const serverList = await authenticatedJson(page, `/api/store/projects/${PROJECT_ID}/tech-geo`);
  expect(serverList.status).toBe(200);
  const auditId = serverList.body["tech-geo"].find((entry: { result: { fetchedAt: string } }) =>
    entry.result.fetchedAt === result.fetchedAt,
  ).id as string;

  await page.evaluate((key) => localStorage.removeItem(key), `aio.savedTechGeo.${PROJECT_ID}`);
  await reopenReleaseProject(page);
  await openTool(page, "Measure & Report");
  await page.getByRole("button", { name: "Website GEO & Technical" }).click();
  await page.getByRole("button", { name: "Open Website Technical GEO" }).click();
  const savedRow = page.locator("div.rounded-xl.border").filter({ hasText: WEBSITE }).last();
  await expect(savedRow).toBeVisible();
  await savedRow.getByRole("button", { name: "Load" }).click();
  await expect(page.getByRole("heading", { name: /Overall Score:/ })).toBeVisible();
  await expect(page.locator("#seo-audit-url")).toHaveValue(result.url);
  await savedRow.getByRole("button", { name: `Delete audit for ${result.url}` }).click();
  await expect(savedRow).toHaveCount(0);
  await expect.poll(async () => {
    const response = await authenticatedJson(page, `/api/store/projects/${PROJECT_ID}/tech-geo`);
    return response.body["tech-geo"]?.some((entry: { id: string }) => entry.id === auditId);
  }, { timeout: 15_000 }).toBe(false);
  assertNoFailures();
});