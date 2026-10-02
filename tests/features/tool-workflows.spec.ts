import { expect, test } from "@playwright/test";
import {
  acceptDialogsForAction,
  authenticatedFetch,
  captureWorkflow,
  createManualCreatorArticle,
  futureDate,
  isoWeek,
  loginAndEnterReleaseProject,
  loadPlanner,
  openTool,
  reenterReleaseProject,
  runCreatorLiveAiFlow,
  runOptimiserLiveAiFlow,
  uniqueLabel,
  watchBrowserFailures,
} from "./tool-helpers";

const LIVE_AI = process.env.AIO_FEATURE_LIVE_AI === "1";
const CREATOR_STANDFIRST = "A short practical summary for a fictional feature-suite organisation.";

test("Content Creator saves manual copy to the server-backed Content Library and reloads it", async ({ page }) => {
  const assertNoFailures = watchBrowserFailures(page);
  await loginAndEnterReleaseProject(page);
  await openTool(page, /Content Creator/i);
  const title = uniqueLabel("Synthetic creator article");
  const body = "Synthetic feature-test copy: teams can explain evidence in plain language and give readers practical next steps.";
  await page.getByPlaceholder("e.g. Q2 thought leadership programme").fill("Release project");
  await page.getByPlaceholder("e.g. AI Authority is the New PR Battleground").fill(title);
  await page.getByPlaceholder("A one-or-two sentence preview that hooks the reader into the article…").fill(CREATOR_STANDFIRST);
  await page.getByPlaceholder("Paste the interview transcript, podcast notes, customer call extracts or other raw material…").fill(body);
  const saveDialogs = await acceptDialogsForAction(
    page,
    () => page.getByRole("button", { name: "Save to Content Library", exact: true }).click(),
    /Saved .* to Content Library/i,
  );
  expect(saveDialogs.some((message) => message.includes(title))).toBe(true);

  const stored = await authenticatedFetch<{ items: Array<{ id: string; title: string; bodyCopy?: string; body: string }> }>(page, "/api/store/archive");
  expect(stored.status).toBe(200);
  const saved = stored.body.items.find((item) => item.title === title);
  expect(saved).toBeTruthy();
  expect(saved?.bodyCopy).toBe(body);
  expect(saved?.body).toContain(body);
  await page.reload();
  await reenterReleaseProject(page);
  await openTool(page, "Content Library");
  const articleCard = page.locator("article").filter({ hasText: title });
  await expect(articleCard.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await articleCard.getByRole("button", { name: "Open in Creator", exact: true }).click();
  await expect(page.getByPlaceholder("e.g. AI Authority is the New PR Battleground")).toHaveValue(title);
  await expect(page.getByPlaceholder("Paste the interview transcript, podcast notes, customer call extracts or other raw material…")).toHaveValue(body);
  const afterRefresh = await authenticatedFetch<{ items: Array<{ id: string; bodyCopy?: string }> }>(page, "/api/store/archive");
  expect(afterRefresh.status).toBe(200);
  expect(afterRefresh.body.items.find((item) => item.id === saved?.id)?.bodyCopy).toBe(body);
  await captureWorkflow(page, "content-creator", {
    result: "Manual synthetic article is saved through Creator UI and reopens in the actual editor after refresh.",
    title,
    archiveId: saved?.id,
    expectedBody: body,
    bodyVisibleInEditor: true,
    uiSelectors: ["Project name placeholder", "Headline placeholder", "Standfirst placeholder", "Transcript or notes placeholder", "Save to Content Library"],
    apiContract: "Store-backed archive save; GET /api/store/archive confirms persisted bodyCopy/body.",
  });
  assertNoFailures();
});

test("Content Optimiser loads an article in the UI, saves edits and hands off to the Planner", async ({ page }) => {
  const assertNoFailures = watchBrowserFailures(page);
  await loginAndEnterReleaseProject(page);
  const originalTitle = uniqueLabel("Synthetic optimiser article");
  const article = await createManualCreatorArticle(page, originalTitle);
  await openTool(page, /Content Optimiser & Editor/i);
  await page.getByRole("button", { name: "Retrieve content draft" }).click();
  await page.getByPlaceholder("Search by title or body…").fill(originalTitle);
  await page.getByRole("button", { name: new RegExp(originalTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
  await expect(page.getByPlaceholder("Headline of the piece (press release / article / case study)")).toHaveValue(originalTitle);

  const editedHeadline = `${originalTitle}: clearer evidence, practical action`;
  const editedBody = "Updated synthetic copy: evidence is introduced with context, the intended audience is explicit, and each recommendation has a practical rationale.";
  await page.getByPlaceholder("Headline of the piece (press release / article / case study)").fill(editedHeadline);
  await page.getByPlaceholder("Paste your press release, article, case study or whitepaper here…").fill(editedBody);
  await acceptDialogsForAction(
    page,
    () => page.getByRole("button", { name: "Save to Content Library", exact: true }).click(),
    /Saved .* to Content Library/i,
  );
  const archiveAfterEdit = await authenticatedFetch<{ items: Array<{ id: string; headline?: string; bodyCopy?: string }> }>(page, "/api/store/archive");
  expect(archiveAfterEdit.status).toBe(200);
  const saved = archiveAfterEdit.body.items.find((item) => item.id === article.id);
  expect(saved?.headline).toBe(editedHeadline);
  expect(saved?.bodyCopy).toBe(editedBody);

  await acceptDialogsForAction(
    page,
    () => page.getByRole("button", { name: "Push to Comms Planner", exact: true }).click(),
    /added to the Comms Planner/i,
  );
  const planner = await loadPlanner(page);
  const handoff = planner.find((item) => item.sourceArchiveId === article.id);
  expect(handoff).toBeTruthy();
  expect(handoff?.headline).toBe(editedHeadline);
  expect(handoff?.bodyCopy).toBe(editedBody);

  await page.reload();
  await reenterReleaseProject(page);
  await openTool(page, "Content Library");
  const articleCard = page.locator("article").filter({ hasText: originalTitle });
  await expect(articleCard.getByRole("heading", { name: originalTitle, exact: true })).toBeVisible();
  await articleCard.getByRole("button", { name: "Open in Optimiser", exact: true }).click();
  await expect(page.getByPlaceholder("Headline of the piece (press release / article / case study)")).toHaveValue(editedHeadline);
  await expect(page.getByPlaceholder("Paste your press release, article, case study or whitepaper here…")).toHaveValue(editedBody);
  await openTool(page, "Comms Planner");
  await expect(page.getByRole("row").filter({ hasText: originalTitle })).toBeVisible();
  await captureWorkflow(page, "content-optimiser", {
    result: "UI retrieval, manual edits, archive persistence, linked planner handoff and refresh reload verified.",
    articleId: article.id,
    originalTitle,
    editedHeadline,
    editedBody,
    plannerId: handoff?.id,
    apiContract: "GET /api/store/archive confirms headline/bodyCopy; GET /api/store/planner confirms sourceArchiveId-linked snapshot.",
  });
  assertNoFailures();
});

test("Comms Planner creates, schedules, edits, reloads and deletes only its synthetic calendar item", async ({ page }) => {
  const assertNoFailures = watchBrowserFailures(page);
  await loginAndEnterReleaseProject(page);
  await openTool(page, "Comms Planner");
  await page.getByRole("button", { name: "Calendar View" }).first().click();
  const before = await loadPlanner(page);
  const beforeIds = before.map((item) => item.id).sort();
  await page.getByRole("button", { name: /Add project to/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const title = uniqueLabel("Synthetic calendar item");
  const date = futureDate(35);
  const editor = page.getByRole("dialog");
  await editor.getByLabel("Project title", { exact: true }).fill(title);
  await editor.getByLabel("Release date", { exact: true }).fill(date);
  await editor.getByLabel("ISO week", { exact: true }).fill(String(isoWeek(date)));
  await editor.getByLabel("Status", { exact: true }).selectOption("Drafting");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const created = await loadPlanner(page);
  const ownItem = created.find((item) => item.title === title);
  expect(ownItem).toBeTruthy();
  expect(ownItem?.releaseDate).toBe(date);
  expect(ownItem?.status).toBe("Drafting");
  const calendarRow = page.getByRole("row").filter({ hasText: title });
  await expect(calendarRow).toBeVisible();

  await calendarRow.getByRole("button", { name: `Open ${title} in Content Optimiser` }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const editedTitle = `${title} updated`;
  const editedDate = futureDate(42);
  await editor.getByLabel("Project title", { exact: true }).fill(editedTitle);
  await editor.getByLabel("Release date", { exact: true }).fill(editedDate);
  await editor.getByLabel("ISO week", { exact: true }).fill(String(isoWeek(editedDate)));
  await editor.getByLabel("Status", { exact: true }).selectOption("Review");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: editedTitle })).toBeVisible();

  await page.reload();
  await reenterReleaseProject(page);
  await openTool(page, "Comms Planner");
  await page.getByRole("button", { name: "Calendar View" }).first().click();
  const afterRefresh = await loadPlanner(page);
  const reloadedItem = afterRefresh.find((item) => item.id === ownItem?.id);
  expect(reloadedItem?.title).toBe(editedTitle);
  expect(reloadedItem?.releaseDate).toBe(editedDate);
  expect(reloadedItem?.status).toBe("Review");
  await expect(page.getByRole("row").filter({ hasText: editedTitle })).toBeVisible();
  await captureWorkflow(page, "comms-planner", {
    result: "Synthetic calendar entry created through the calendar UI, scheduled, edited, refreshed and visible on its matching week.",
    plannerId: ownItem?.id,
    title: editedTitle,
    releaseDate: editedDate,
    status: "Review",
    preexistingPlannerIds: beforeIds,
  });

  await page.getByRole("row").filter({ hasText: editedTitle })
    .getByRole("button", { name: `Open ${editedTitle} in Content Optimiser` }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: `Delete ${editedTitle}` }).click();
  await page.getByRole("button", { name: "Close edit project dialog" }).click();
  await expect.poll(async () => (await loadPlanner(page)).some((item) => item.id === ownItem?.id)).toBe(false);
  const afterDelete = await loadPlanner(page);
  expect(afterDelete.some((item) => item.id === ownItem?.id)).toBe(false);
  expect(afterDelete.map((item) => item.id).sort()).toEqual(beforeIds);
  assertNoFailures();
});

test("Media Database searches, bookmarks, reloads, edits and deletes only synthetic records", async ({ page }) => {
  const assertNoFailures = watchBrowserFailures(page);
  await loginAndEnterReleaseProject(page);
  const startingOutlets = await authenticatedFetch<{ outlets: Array<{ id: number }> }>(page, "/api/store/media-db/outlets?scope=added&pageSize=200");
  const startingContacts = await authenticatedFetch<{ contacts: Array<{ id: number }> }>(page, "/api/store/media-db/contacts?pageSize=200");
  expect(startingOutlets.status).toBe(200);
  expect(startingContacts.status).toBe(200);
  const originalOutletIds = startingOutlets.body.outlets.map((outlet) => outlet.id).sort();
  const originalContactIds = startingContacts.body.contacts.map((contact) => contact.id).sort();
  await openTool(page, "Media Database");
  await page.getByRole("button", { name: "Manage my records" }).click();
  const publication = uniqueLabel("Feature suite journal");
  const contactFirst = "Feature";
  const contactLast = uniqueLabel("Synthetic contact").replace(/^Synthetic contact /, "Contact ");
  const contactName = `${contactFirst} ${contactLast}`;
  await page.getByRole("button", { name: "Add publication" }).click();
  await page.getByPlaceholder("e.g. PR Week").fill(publication);
  await page.getByPlaceholder("e.g. prweek.com").fill("https://feature-journal.invalid");
  await page.getByPlaceholder("Brief description of the publication").fill("Synthetic feature-suite publication record.");
  await page.getByRole("button", { name: "Add outlet", exact: true }).click();
  await page.getByRole("button", { name: "Add contact", exact: true }).click();
  await page.getByPlaceholder("Jane", { exact: true }).fill(contactFirst);
  await page.getByPlaceholder("Smith").fill(contactLast);
  await page.getByPlaceholder("Type the publication name").fill(publication);
  await page.getByRole("button", { name: "Save contact", exact: true }).click();

  await page.getByRole("button", { name: "Search Media Database" }).click();
  await page.getByLabel("Search record type").selectOption("publications");
  await page.getByLabel("Media collection scope").selectOption("added");
  await page.getByTestId("input-media-search").fill(publication);
  await page.getByTestId("button-search-media").click();
  const publicationCard = page.getByTestId(/^card-media-publication-/).filter({ hasText: publication });
  await expect(publicationCard).toBeVisible();
  await publicationCard.getByRole("button", { name: "Save to My Media Database" }).click();
  await expect(publicationCard.getByRole("button", { name: "Remove from My Media Database" })).toBeVisible();

  await page.getByLabel("Search record type").selectOption("contacts");
  await page.getByTestId("input-media-search").fill(contactName);
  await page.getByTestId("button-search-media-bottom").click();
  const contactCard = page.getByTestId(/^card-media-contact-/).filter({ hasText: contactName });
  await expect(contactCard).toBeVisible();
  await contactCard.getByRole("button", { name: "Save to My Media Database" }).click();
  await expect(contactCard.getByRole("button", { name: "Remove from My Media Database" })).toBeVisible();

  await page.getByRole("button", { name: "My Media Database", exact: true }).click();
  await page.getByLabel("Search record type").selectOption("publications");
  await expect(page.getByRole("row").filter({ hasText: publication })).toBeVisible();
  await page.getByLabel("Search record type").selectOption("contacts");
  await expect(page.getByRole("row").filter({ hasText: contactLast })).toContainText(contactFirst);
  const saved = await authenticatedFetch<{ bookmarks: Array<{ type: string; recordId: number }> }>(page, "/api/store/media-db/bookmarks");
  expect(saved.status).toBe(200);
  expect(JSON.stringify(saved.body)).toContain(publication);
  await page.reload();
  await reenterReleaseProject(page);
  await openTool(page, "Media Database");
  await page.getByRole("button", { name: "My Media Database", exact: true }).click();
  await page.getByLabel("Search record type").selectOption("publications");
  await expect(page.getByRole("row").filter({ hasText: publication })).toBeVisible();
  await page.getByLabel("Search record type").selectOption("contacts");
  await expect(page.getByRole("row").filter({ hasText: contactLast })).toContainText(contactFirst);
  await captureWorkflow(page, "media-database", {
    result: "Added-publication and added-contact filters found self-created records; both were saved to My Media Database and remained visible after refresh.",
    publication,
    contactName,
    searchControls: ["Search record type", "Media collection scope", "top Search button", "bottom Search button"],
  });

  await page.getByRole("button", { name: "Manage my records" }).click();
  await page.getByRole("button", { name: /Publications \(/ }).click();
  await page.getByRole("button", { name: "Browse publications" }).click();
  const publicationRow = page.getByRole("row").filter({ hasText: publication });
  await expect(publicationRow).toBeVisible();
  await publicationRow.getByTitle("Edit").click();
  const updatedDescription = "Updated synthetic publication record through the management UI.";
  await page.getByPlaceholder("Brief description of the publication").fill(updatedDescription);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(updatedDescription)).toBeVisible();

  await page.getByRole("button", { name: /Contacts \(/ }).click();
  await page.getByRole("button", { name: "Browse contacts" }).click();
  const contactRow = page.getByRole("row").filter({ hasText: contactLast });
  await expect(contactRow).toBeVisible();
  await contactRow.getByTitle("Edit").click();
  await page.getByPlaceholder("Type the publication name").fill(`${publication} Free Type`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("row").filter({ hasText: `${publication} Free Type` })).toBeVisible();
  const editedContactRow = page.getByRole("row").filter({ hasText: contactLast });
  page.once("dialog", (dialog) => dialog.accept());
  await editedContactRow.getByTitle("Delete").click();
  await expect(editedContactRow).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /Publications \(/ }).click();
  await page.getByRole("button", { name: "Browse publications" }).click();
  const ownPublicationRow = page.getByRole("row").filter({
    has: page.getByText(publication, { exact: true }),
  });
  await ownPublicationRow.getByTitle("Delete").click();
  await expect(page.getByText(publication, { exact: true })).toHaveCount(0);
  // Free-typing a new publication creates another deliberate outlet record.
  // Removing its last contact does not implicitly delete that publication.
  const freeTypedPublication = page.getByRole("row").filter({ hasText: `${publication} Free Type` });
  if (await freeTypedPublication.count()) {
    page.once("dialog", (dialog) => dialog.accept());
    await freeTypedPublication.getByTitle("Delete").click();
    await expect(freeTypedPublication).toHaveCount(0);
  }
  const deletedContact = await authenticatedFetch(page, `/api/store/media-db/contacts?q=${encodeURIComponent(contactName)}`);
  const deletedPublication = await authenticatedFetch(page, `/api/store/media-db/outlets?scope=added&q=${encodeURIComponent(publication)}`);
  expect(deletedContact.status).toBe(200);
  expect(deletedPublication.status).toBe(200);
  expect(JSON.stringify(deletedContact.body)).not.toContain(contactFirst);
  expect(JSON.stringify(deletedPublication.body)).not.toContain(publication);
  const remainingOutlets = await authenticatedFetch<{ outlets: Array<{ id: number }> }>(page, "/api/store/media-db/outlets?scope=added&pageSize=200");
  const remainingContacts = await authenticatedFetch<{ contacts: Array<{ id: number }> }>(page, "/api/store/media-db/contacts?pageSize=200");
  expect(remainingOutlets.body.outlets.map((outlet) => outlet.id).sort()).toEqual(originalOutletIds);
  expect(remainingContacts.body.contacts.map((contact) => contact.id).sort()).toEqual(originalContactIds);
  assertNoFailures();
});

test("Creator uses one real AI generation only when explicitly enabled", async ({ page }) => {
  test.skip(!LIVE_AI, "Set AIO_FEATURE_LIVE_AI=1 to exercise real Creator generation; manual save is tested independently.");
  const assertNoFailures = watchBrowserFailures(page);
  await runCreatorLiveAiFlow(page, assertNoFailures);
});

test("Optimiser uses one real AI request only when explicitly enabled", async ({ page }) => {
  test.skip(!LIVE_AI, "Set AIO_FEATURE_LIVE_AI=1 to exercise real Optimiser generation; manual editing is tested independently.");
  const assertNoFailures = watchBrowserFailures(page);
  await runOptimiserLiveAiFlow(page, assertNoFailures);
});