import { expect, test, type Page } from "@playwright/test";

const STORY_ID = "media-research-pagination-story";

async function dismissAutoDemo(page: Page) {
  const dialog = page.getByRole("dialog", { name: /see your ai visibility/i });
  await expect(dialog).toBeVisible({ timeout: 25_000 });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
}

async function dismissAutoDemoIfPresent(page: Page) {
  const dialog = page.getByRole("dialog", { name: /see your ai visibility/i });
  if (await dialog.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
}

async function openMediaResearch(page: Page) {
  await page.goto("/");
  await dismissAutoDemo(page);
  await page.getByRole("button", { name: "Platform Login" }).click();
  await page.getByPlaceholder("Email or username").fill("release@example.invalid");
  await page.getByPlaceholder("Password").fill("release-harness-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "release@example.invalid" })).toBeVisible({ timeout: 12_000 });
  await page.getByRole("button", { name: "Project Hub" }).click();
  const projectCard = page.locator('[role="button"]').filter({ hasText: "Release project" });
  await expect(projectCard).toBeVisible({ timeout: 12_000 });
  await projectCard.click();
  await page.getByRole("button", { name: "Media Research" }).click();
  await expect(page.getByRole("heading", { name: "Media Research" })).toBeVisible();
}

test("built-app Media Research paginates a compact isolated regression fixture", async ({ page }) => {
  test.setTimeout(180_000);

  let paidCoverageRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/store/media-db/recommendations/enrich") {
      paidCoverageRequests += 1;
    }
  });

  const initialUsageResponse = await page.request.get("/__test/media-research-state");
  expect(initialUsageResponse.ok()).toBeTruthy();
  const initialUsage = await initialUsageResponse.json() as { tokenUsageCount: number };

  await openMediaResearch(page);
  const article = page.getByTestId("select-research-article");
  await article.selectOption(STORY_ID);

  const generate = page.getByTestId("button-recommend-contacts");
  await expect(generate).toBeEnabled({ timeout: 20_000 });
  const generatedResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/store/media-db/recommendations"
      && response.request().method() === "POST",
  );
  await generate.click();
  const generatedResponse = await generatedResponsePromise;
  expect(generatedResponse.ok()).toBeTruthy();
  const generated = await generatedResponse.json() as {
    collectionTotal: number;
    totalMatches: number;
    pageSize: number;
    items: unknown[];
  };

  const collectionTotal = generated.collectionTotal;
  const eligibleTotal = generated.totalMatches;
  const pageSize = generated.pageSize;
  expect(Number.isInteger(collectionTotal)).toBeTruthy();
  expect(Number.isInteger(eligibleTotal)).toBeTruthy();
  expect(pageSize).toBe(5);
  expect(eligibleTotal).toBeGreaterThan(25);
  expect(eligibleTotal).toBeLessThan(collectionTotal);

  const summary = page.getByTestId("recommendation-pagination-summary");
  const collectionLabel = collectionTotal.toLocaleString("en-US");
  const matchesLabel = eligibleTotal.toLocaleString("en-US");
  await expect(summary).toContainText(`Showing ${Math.min(pageSize, eligibleTotal)} of ${collectionLabel} records`);
  await expect(summary).toContainText(`${matchesLabel} relevant matches`);

  const deniedWorkspaceRead = await page.evaluate(async () => {
    const response = await fetch(
      "/api/store/media-db/recommendations?projectId=other-workspace&storyKey=media-research-private-story",
      { credentials: "include" },
    );
    return { status: response.status, body: await response.json() };
  });
  expect(deniedWorkspaceRead.status).toBe(404);
  expect(deniedWorkspaceRead.body).toMatchObject({ error: "Project or article not found" });

  const resultCards = page.locator('[data-testid^="research-result-summary-"]');
  await expect(resultCards).toHaveCount(Math.min(pageSize, eligibleTotal));
  const seenNames = new Set<string>();
  const collectNames = async () => {
    for (const name of await resultCards.locator("h3").allTextContents()) {
      seenNames.add(name.trim());
    }
  };
  await collectNames();

  const pageCount = Math.ceil(eligibleTotal / pageSize);
  expect(pageCount).toBeGreaterThan(5);
  for (let currentPage = 2; currentPage <= pageCount; currentPage += 1) {
    await page.getByTestId("button-next-recommendations").click();
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, eligibleTotal);
    await expect(summary).toContainText(`Showing ${start}–${end} of ${collectionLabel} records`);
    await expect(summary).toContainText(`${matchesLabel} relevant matches`);
    await expect(resultCards).toHaveCount(end - start + 1);
    await collectNames();
  }

  const lastPageCount = eligibleTotal - (pageCount - 1) * pageSize;
  expect(lastPageCount).toBeGreaterThan(0);
  expect(lastPageCount).toBeLessThan(pageSize);
  expect(seenNames.size).toBe(eligibleTotal);
  expect([...seenNames].every((name) => /^Research Contact \d+$/.test(name))).toBeTruthy();
  await expect(page.getByTestId("button-next-recommendations")).toHaveCount(0);

  await page.getByTestId("button-previous-recommendations").click();
  const previousStart = (pageCount - 2) * pageSize + 1;
  const previousEnd = Math.min((pageCount - 1) * pageSize, eligibleTotal);
  await expect(summary).toContainText(`Showing ${previousStart}–${previousEnd} of ${collectionLabel} records`);
  await expect(resultCards).toHaveCount(previousEnd - previousStart + 1);

  await page.reload();
  await dismissAutoDemoIfPresent(page);
  const projectCard = page.locator('[role="button"]').filter({ hasText: "Release project" });
  await expect(projectCard).toBeVisible({ timeout: 20_000 });
  await projectCard.click();
  await page.getByRole("button", { name: "Media Research" }).click();
  await expect(page.getByRole("heading", { name: "Media Research" })).toBeVisible();
  await expect(page.getByTestId("select-research-article")).toHaveValue(STORY_ID);
  await expect(summary).toContainText(`Showing ${Math.min(pageSize, eligibleTotal)} of ${collectionLabel} records`);
  await expect(summary).toContainText(`${matchesLabel} relevant matches`);
  await expect(resultCards).toHaveCount(Math.min(pageSize, eligibleTotal));

  const finalUsageResponse = await page.request.get("/__test/media-research-state");
  expect(finalUsageResponse.ok()).toBeTruthy();
  const finalUsage = await finalUsageResponse.json() as { tokenUsageCount: number };
  expect(finalUsage.tokenUsageCount).toBe(initialUsage.tokenUsageCount);
  expect(paidCoverageRequests).toBe(0);
});