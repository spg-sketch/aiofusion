import { expect, type Page } from "@playwright/test";
import { dismissHomepagePrompts } from "../helpers/homepage-prompts";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export const RELEASE_PROJECT_ID = "release-project";

export type ApiResult<T = Record<string, unknown>> = {
  status: number;
  body: T;
};

export function watchBrowserFailures(page: Page) {
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];
  const paymentRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/(?:platform\/)?billing\/(?:checkout|portal|subscribe|project-checkout|project-tier)|checkout\.stripe\.com/i.test(request.url())) {
      paymentRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  return () => {
    expect(pageErrors, "Uncaught browser errors").toEqual([]);
    expect(serverErrors, "Unexpected API 5xx responses").toEqual([]);
    expect(paymentRequests, "Payments must not be exercised").toEqual([]);
  };
}

export async function authenticatedFetch<T = Record<string, unknown>>(
  page: Page,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<ApiResult<T>> {
  const result = await page.evaluate(async ({ path, init }) => {
    const body = init?.body;
    const response = await fetch(path, {
      credentials: "include",
      method: init?.method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: response.status,
      body: await response.json().catch(() => ({})) as Record<string, unknown>,
    };
  }, { path, init });
  return result as ApiResult<T>;
}

export async function loginAndEnterReleaseProject(page: Page) {
  await page.goto("/");
  await dismissHomepagePrompts(page);
  await page.getByRole("button", { name: /Platform Login/i }).click();
  await page.getByPlaceholder("Email or username").fill("release@example.invalid");
  await page.getByPlaceholder("Password", { exact: true }).fill("release-harness-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const hubHeading = page.getByRole("heading", { name: /Project Hub/i });
  const hubButton = page.getByRole("button", { name: /Project Hub/i });
  await expect.poll(async () =>
    await hubHeading.isVisible().catch(() => false)
      || await hubButton.isVisible().catch(() => false),
  ).toBe(true);
  if (!(await hubHeading.isVisible())) await hubButton.click();
  await expect(page.getByText("Release project", { exact: true })).toBeVisible();

  // A small, synthetic Set-Up payload unlocks the editor's project-context
  // prerequisites. This is fixture preparation through the real store API,
  // not coverage of the Set-Up form UI.
  const intake = await authenticatedFetch(page, "/api/store/projects/intake", {
    method: "POST",
    body: {
      id: RELEASE_PROJECT_ID,
      name: "Release project",
      intake: {
        aiWebsite: "https://example.com",
        businessCategories: ["Marketing & Communications"],
        audienceCategories: ["Marketing & Communications"],
        mediaCategories: ["Marketing & Communications"],
        llmQueries: { v: 1, discovery: ["Which communications agencies publish clear service information?"], shortlist: [], comparison: [] },
        formData: {
          "1.1": "Synthetic feature-test organisation provides practical communications services.",
          "1.2": "We help teams communicate clearly with their audiences.",
          "1.3": "Our approach combines useful evidence with straightforward guidance.",
          "3.3": "United Kingdom",
          "4.1": "Release project",
          "4.4": "Communications software",
          "4.5": "United Kingdom",
        },
      },
    },
  });
  expect(intake.status, JSON.stringify(intake.body)).toBe(200);
  await page.getByRole("button", { name: "Enter", exact: true }).click();
  await expect(page.getByRole("button", { name: /Content Creator/i })).toBeVisible();
}

export async function reenterReleaseProject(page: Page) {
  const hubButton = page.getByRole("button", { name: /Project Hub/i });
  const releaseProject = page.getByText("Release project", { exact: true });
  await expect.poll(async () =>
    await releaseProject.isVisible().catch(() => false)
      || await hubButton.isVisible().catch(() => false),
  ).toBe(true);
  if (!(await releaseProject.isVisible().catch(() => false))) {
    await hubButton.click();
    await expect(releaseProject).toBeVisible();
  }
  await page.getByRole("button", { name: "Enter", exact: true }).click();
  await expect(page.getByRole("button", { name: /Content Creator/i })).toBeVisible();
}

export async function openTool(page: Page, name: RegExp | string) {
  await page.getByRole("complementary", { name: "Project navigation" })
    .getByRole("button", { name }).first().click();
}

export async function createManualCreatorArticle(page: Page, title: string) {
  await openTool(page, /Content Creator/i);
  await page.getByPlaceholder("e.g. Q2 thought leadership programme").fill(title);
  await page.getByPlaceholder("e.g. AI Authority is the New PR Battleground").fill(title);
  await page.getByPlaceholder("A one-or-two sentence preview that hooks the reader into the article…")
    .fill("A short practical summary for a fictional feature-suite organisation.");
  await page.getByPlaceholder("Paste the interview transcript, podcast notes, customer call extracts or other raw material…")
    .fill("Synthetic feature-test copy: communications teams can improve clarity by organising evidence, explaining decisions plainly, and checking each message against its intended audience.");
  const messages = await acceptDialogsForAction(
    page,
    () => page.getByRole("button", { name: "Save to Content Library", exact: true }).click(),
    /Saved .* to Content Library/i,
  );
  expect(messages.some((message) => /Saved .* to Content Library/i.test(message))).toBe(true);
  const response = await authenticatedFetch<{
    items: Array<{ id: string; title: string; headline?: string; bodyCopy?: string }>;
  }>(page, "/api/store/archive");
  expect(response.status).toBe(200);
  const item = response.body.items.find((entry) => entry.title === title);
  expect(item, `Expected saved synthetic article ${title}`).toBeTruthy();
  return item!;
}

export async function loadPlanner(page: Page) {
  const response = await authenticatedFetch<{ items: Array<Record<string, any>> }>(page, "/api/store/planner");
  expect(response.status).toBe(200);
  return response.body.items;
}

export async function runCreatorLiveAiFlow(page: Page, assertNoFailures: () => void) {
  await loginAndEnterReleaseProject(page);
  await openTool(page, /Content Creator/i);
  const title = uniqueLabel("Synthetic AI creator request");
  const sourceNotes = "Synthetic material only: a fictional communications team wants plain-language guidance on organising evidence and explaining it to readers.";
  await page.getByPlaceholder("e.g. Q2 thought leadership programme").fill("Release project");
  await page.getByPlaceholder("e.g. AI Authority is the New PR Battleground").fill(title);
  await page.getByPlaceholder("Paste the interview transcript, podcast notes, customer call extracts or other raw material…").fill(sourceNotes);
  const generationRequests: Record<string, any>[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/content/generate") {
      generationRequests.push(request.postDataJSON() as Record<string, any>);
    }
  });
  await page.getByRole("button", { name: "Create Content", exact: true }).click();
  const bodyField = page.getByPlaceholder("Paste the interview transcript, podcast notes, customer call extracts or other raw material…");
  await expect(page.getByRole("button", { name: "Regenerate", exact: true })).toBeVisible({ timeout: 110_000 });
  await expect(bodyField).not.toHaveValue("");
  expect(generationRequests, "Creator issues exactly one real generation request.").toHaveLength(1);
  const generationRequest = generationRequests[0];
  expect(generationRequest, "Creator must issue its real /api/content/generate request.").toMatchObject({
    contentType: "Article", projectName: "Release project", sourceNotes,
  });
  const generatedTitle = await page.getByPlaceholder("e.g. AI Authority is the New PR Battleground").inputValue();
  const generatedBody = await bodyField.inputValue();
  expect(generatedTitle.trim().length + generatedBody.trim().length).toBeGreaterThan(0);
  await acceptDialogsForAction(
    page,
    () => page.getByRole("button", { name: "Save to Content Library", exact: true }).click(),
    /Saved .* to Content Library/i,
  );
  const stored = await authenticatedFetch<{ items: Array<{ title: string; bodyCopy?: string }> }>(page, "/api/store/archive");
  expect(stored.status).toBe(200);
  expect(stored.body.items.some((item) => item.title === generatedTitle && item.bodyCopy === generatedBody)).toBe(true);
  await captureWorkflow(page, "content-creator-live-ai", {
    result: "Real Creator response was nonempty, saved through the UI and confirmed in the server archive.",
    requestPath: "/api/content/generate", requestBody: generationRequest,
  });
  assertNoFailures();
}

export async function runOptimiserLiveAiFlow(page: Page, assertNoFailures: () => void) {
  await loginAndEnterReleaseProject(page);
  const title = uniqueLabel("Synthetic AI optimiser article");
  const article = await createManualCreatorArticle(page, title);
  await openTool(page, /Content Optimiser & Editor/i);
  await page.getByRole("button", { name: "Retrieve content draft" }).click();
  await page.getByPlaceholder("Search by title or body…").fill(title);
  await page.getByRole("button", { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
  const headlineField = page.getByPlaceholder("Headline of the piece (press release / article / case study)");
  const bodyField = page.getByPlaceholder("Paste your press release, article, case study or whitepaper here…");
  const inputHeadline = await headlineField.inputValue();
  const inputBody = await bodyField.inputValue();
  const optimisationRequests: Record<string, any>[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/content/optimise") {
      optimisationRequests.push(request.postDataJSON() as Record<string, any>);
    }
  });
  await page.getByRole("button", { name: "Optimise", exact: true }).click();
  await expect(page.getByText("Optimise - LLM brief preview")).toBeVisible();
  await page.getByRole("button", { name: "Run optimisation" }).click();
  await expect(page.getByRole("heading", { name: "Change log", exact: true })).toBeVisible({ timeout: 110_000 });
  expect(optimisationRequests, "Optimiser issues exactly one real request.").toHaveLength(1);
  const optimisationRequest = optimisationRequests[0];
  expect(optimisationRequest, "Optimiser must issue its real /api/content/optimise request.").toMatchObject({
    headline: inputHeadline, bodyCopy: inputBody, projectTitle: title, contentType: "Article",
  });
  const outputHeadline = await headlineField.inputValue();
  const outputBody = await bodyField.inputValue();
  expect(outputHeadline.trim().length + outputBody.trim().length).toBeGreaterThan(0);
  await acceptDialogsForAction(
    page,
    () => page.getByRole("button", { name: "Save to Content Library", exact: true }).click(),
    /Saved .* to Content Library/i,
  );
  const saved = await authenticatedFetch<{ items: Array<{ id: string; headline?: string; bodyCopy?: string }> }>(
    page, "/api/store/archive",
  );
  expect(saved.status).toBe(200);
  expect(saved.body.items.find((item) => item.id === article.id)).toMatchObject({
    headline: outputHeadline, bodyCopy: outputBody,
  });
  await page.reload();
  await reenterReleaseProject(page);
  await openTool(page, /Content Optimiser & Editor/i);
  await page.getByRole("button", { name: "Retrieve content draft" }).click();
  await page.getByPlaceholder("Search by title or body…").fill(title);
  await page.getByRole("button", { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
  await expect(headlineField).toHaveValue(outputHeadline);
  await expect(bodyField).toHaveValue(outputBody);
  await captureWorkflow(page, "content-optimiser-live-ai", {
    result: "One real Optimiser request produced a change log; its edited copy was saved and recovered after reload.",
    requestPath: "/api/content/optimise", requestBody: optimisationRequest,
  });
  assertNoFailures();
}

export async function acceptDialogsForAction(
  page: Page,
  action: () => Promise<void>,
  expectedMessage: RegExp,
) {
  const messages: string[] = [];
  const accept = (dialog: import("@playwright/test").Dialog) => {
    messages.push(dialog.message());
    void dialog.accept();
  };
  page.on("dialog", accept);
  try {
    await action();
    await expect.poll(() => messages.some((message) => expectedMessage.test(message))).toBe(true);
  } finally {
    page.off("dialog", accept);
  }
  return messages;
}

export async function captureWorkflow(
  page: Page,
  name: string,
  evidence: Record<string, unknown>,
) {
  const root = resolve(process.cwd(), ".local/feature-test-reports/core");
  const screenshotPath = `${root}/screenshots/${name}.png`;
  await mkdir(`${root}/screenshots`, { recursive: true });
  await mkdir(`${root}/evidence`, { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await writeFile(
    `${root}/evidence/${name}.json`,
    `${JSON.stringify({ workflow: name, capturedAt: new Date().toISOString(), ...evidence }, null, 2)}\n`,
  );
}

export function uniqueLabel(prefix: string) {
  return `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function futureDate(daysAhead = 35) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isoWeek(dateString: string) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((+date - +yearStart) / 86400000 + 1) / 7);
}