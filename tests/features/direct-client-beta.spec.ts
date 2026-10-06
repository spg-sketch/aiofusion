import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { dismissHomepagePrompts } from "../helpers/homepage-prompts";

const PASSWORD = "feature-suite-password-37";

async function dismissAutoDemo(page: Page) {
  await dismissHomepagePrompts(page);
}

async function waitForCapturedVerificationEmail(request: APIRequestContext, email: string) {
  const deadline = Date.now() + 15_000;
  let latest;
  while (Date.now() < deadline) {
    const response = await request.get(`/__test/verification-email?email=${encodeURIComponent(email)}`);
    if (response.ok()) return response.json();
    latest = await response.json().catch(() => ({}));
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`The real generated verification email was not captured for ${email}: ${JSON.stringify(latest)}`);
}

async function authenticatedFetch(page: Page, path: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) {
  return page.evaluate(async ({ path, init }) => {
    const response = await fetch(path, { credentials: "include", ...init });
    return { status: response.status, body: await response.json().catch(() => ({})) as any };
  }, { path, init });
}

test("Direct Client signs up, verifies the captured email, starts a 60-day beta and persists workspace data", async ({ page, request }) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  const apiFailures: string[] = [];
  const paymentRequests: string[] = [];
  const intakeRequests: Array<{ id: string; intake: { formData: Record<string, string> } }> = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    const url = response.url();
    if (!url.includes("/api/") || response.status() < 400) return;
    const expectedIsolationProbe = response.status() === 404
      && response.request().method() === "GET"
      && url.endsWith("/api/store/projects/other-workspace/intake");
    if (!expectedIsolationProbe) apiFailures.push(`${response.status()} ${response.request().method()} ${url}`);
  });
  page.on("request", (request) => {
    const url = request.url();
    if (/\/api\/(?:platform\/)?billing\/(?:checkout|portal|subscribe|project-checkout|project-tier)|checkout\.stripe\.com/i.test(url)) {
      paymentRequests.push(`${request.method()} ${url}`);
    }
    if (request.method() === "POST" && url.endsWith("/api/store/projects/intake")) {
      try {
        intakeRequests.push(request.postDataJSON() as { id: string; intake: { formData: Record<string, string> } });
      } catch {
        apiFailures.push(`Invalid intake save request payload: ${url}`);
      }
    }
  });

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `feature-direct-${suffix}@example.invalid`;
  const company = `Feature Direct ${suffix}`;
  const projectName = `Feature Project ${suffix}`;
  let trialPeriod: { startedAt: string; endsAt: string } | null = null;

  await test.step("Create account through public signup and obtain its real email link", async () => {
    await page.goto("/");
    await dismissAutoDemo(page);
    await page.getByRole("button", { name: /Platform Login/i }).click();
    await page.getByRole("button", { name: "Create an account" }).click();
    await page.getByPlaceholder("First and last name").fill("Feature Test Owner");
    await page.getByPlaceholder("you@company.com").fill(email);
    await page.getByPlaceholder("e.g. Acme Agency Ltd").fill(company);
    await page.getByPlaceholder("https://www.yourcompany.com").fill("https://example.invalid");
    await page.getByPlaceholder("Choose a strong password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
    await expect(page.getByText(email, { exact: false })).toBeVisible();
    const unverifiedLogin = await request.post("/api/platform/login", {
      data: { username: email, password: PASSWORD },
    });
    expect(unverifiedLogin.status()).toBe(403);
    await expect(unverifiedLogin.json()).resolves.toMatchObject({ needsVerification: true });

    const captured = await waitForCapturedVerificationEmail(request, email);
    expect(captured.email).toBe(email);
    expect(captured.subject).toBe("Verify your AIO Fusion email address");
    expect(captured.text).toContain("verify your email address");
    expect(captured.html).toContain("Verify email address");
    const localVerification = new URL(captured.localVerifyUrl);
    expect(localVerification.hostname).toBe("127.0.0.1");
    expect(localVerification.pathname).toBe("/api/platform/verify-email");
    expect(localVerification.searchParams.get("token")).toMatch(/^[a-f0-9]{64}$/i);
    await page.goto(captured.localVerifyUrl);
    // Verification lands on the platform route and renders onboarding directly;
    // setup state is observable from the actual UI rather than a query string.
    await expect(page.getByRole("heading", { name: "How will you use AIO Fusion?" })).toBeVisible();
  });

  await test.step("Select Direct Client, complete company setup and activate the beta from the UI", async () => {
    await expect(page.getByRole("heading", { name: "How will you use AIO Fusion?" })).toBeVisible();
    await page.getByTestId("button-account-type-client").click();
    await expect(page.getByTestId("button-account-type-client")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("button-continue-account-type").click();

    await expect(page.getByRole("heading", { name: "Set up your company" })).toBeVisible();
    await page.getByLabel("Company name").fill(company);
    await page.getByLabel("Company website").fill("https://example.invalid");
    await page.getByTestId("button-continue-workspace-basics").click();
    await expect(page.getByRole("heading", { name: "Choose how to start" })).toBeVisible();
    await expect(page.getByText(/60-day beta without a card/i)).toBeVisible();
    await page.getByTestId("button-access-choice-beta").click();
    await expect(page.getByTestId("button-access-choice-beta")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("button-continue-access-choice").click();

    // This is a read-only state check, not a payment, checkout, or subscription
    // mutation. It verifies the backend-created dates rather than waiting 60 days.
    await expect(page.getByRole("button", { name: "Back to platform" })).toBeVisible();
    const subscription = await authenticatedFetch(page, "/api/platform/billing/subscription");
    expect(subscription.status).toBe(200);
    expect(subscription.body.trial.status).toBe("active");
    expect(subscription.body.trial.startedAt).toBeTruthy();
    expect(subscription.body.trial.endsAt).toBeTruthy();
    const started = Date.parse(subscription.body.trial.startedAt);
    const ends = Date.parse(subscription.body.trial.endsAt);
    trialPeriod = { startedAt: subscription.body.trial.startedAt, endsAt: subscription.body.trial.endsAt };
    expect(Number.isFinite(started) && Number.isFinite(ends)).toBe(true);
    expect(ends - started).toBe(60 * 24 * 60 * 60 * 1000);
    expect(subscription.body.applicablePlan).toMatch(/inhouse|client/i);
    await page.getByRole("button", { name: "Back to platform" }).click();
    await expect(page.getByRole("button", { name: /Project Hub/i })).toBeVisible();
  });

  await test.step("Create a project, save real intake answers, and confirm refresh persistence", async () => {
    await page.getByRole("button", { name: /Project Hub/i }).click();
    await expect(page.getByRole("heading", { name: /Project Hub/i })).toBeVisible();
    await page.getByRole("button", { name: /Create your first project/i }).click();
    await page.getByPlaceholder("e.g. Acme Robotics").fill(projectName);
    await page.getByRole("button", { name: /Create.*set up/i }).click();
    await expect(page.getByRole("heading", { name: /Earned Media: Message Framework/i })).toBeVisible();
    await page.locator("#intake-control-1\\.1").fill("A feature-test business offering clear, practical communications services.");
    await page.getByRole("button", { name: /Save for later/i }).click();
    const intakePayload = intakeRequests.find((payload) =>
      payload.intake?.formData?.["1.1"]?.includes("feature-test business"),
    );
    if (!intakePayload) throw new Error("The Set-Up save request was not captured.");
    expect(intakePayload.intake.formData["1.1"]).toContain("feature-test business");
    await expect(page.getByRole("status").filter({ hasText: "Project Set-Up saved for later." })).toBeVisible();

    const stored = await authenticatedFetch(page, "/api/store/projects");
    expect(stored.status).toBe(200);
    const project = stored.body.projects.find((entry: { name: string }) => entry.name === projectName);
    expect(project?.id).toBeTruthy();
    expect(intakePayload.id).toBe(project.id);
    let savedIntake: Awaited<ReturnType<typeof authenticatedFetch>> | null = null;
    await expect.poll(async () => {
      savedIntake = await authenticatedFetch(page, `/api/store/projects/${encodeURIComponent(project.id)}/intake`);
      return savedIntake.status === 200
        && savedIntake.body.intake?.formData?.["1.1"]?.includes("feature-test business");
    }, { timeout: 10_000, intervals: [100, 250, 500] }).toBe(true);

    await page.reload();
    await expect(page.getByRole("heading", { name: /Project Hub/i })).toBeVisible();
    const afterRefresh = await authenticatedFetch(page, `/api/store/projects/${encodeURIComponent(project.id)}/intake`);
    expect(afterRefresh.status).toBe(200);
    expect(afterRefresh.body.intake.formData["1.1"]).toContain("feature-test business");
    const betaAfterRefresh = await authenticatedFetch(page, "/api/platform/billing/subscription");
    expect(betaAfterRefresh.status).toBe(200);
    expect(betaAfterRefresh.body.trial).toMatchObject({
      status: "active",
      startedAt: trialPeriod?.startedAt,
      endsAt: trialPeriod?.endsAt,
    });

    await expect(page.getByText(projectName, { exact: true })).toBeVisible();
    await page.getByText(projectName, { exact: true }).click();
    await page.getByRole("button", { name: "Project Set-Up" }).click();
    await expect(page.locator("#intake-control-1\\.1")).toHaveValue(/feature-test business/);
  });

  await test.step("Exercise publication/contact CRUD and typed bookmark persistence through the real application", async () => {
    await page.getByRole("button", { name: "Media Database" }).click();
    await expect(page.getByText("Manage my records")).toBeVisible();
    await page.getByRole("button", { name: "Manage my records" }).click();

    const publication = `Feature Journal ${suffix}`;
    await page.getByRole("button", { name: "Add publication" }).click();
    await page.getByPlaceholder("e.g. PR Week").fill(publication);
    await page.getByPlaceholder("e.g. prweek.com").fill("https://feature-journal.invalid");
    await page.getByPlaceholder("Brief description of the publication").fill("Feature suite publication record.");
    await page.getByRole("button", { name: "Add outlet" }).click();
    await page.getByRole("button", { name: /Publications \(/ }).click();
    await page.getByRole("button", { name: "Browse publications" }).click();
    await expect(page.getByText(publication, { exact: true })).toBeVisible();

    const publicationRow = page.getByRole("row").filter({ hasText: publication });
    await publicationRow.getByTitle("Edit").click();
    await page.getByPlaceholder("Brief description of the publication").fill("Updated from the real feature UI.");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Updated from the real feature UI.")).toBeVisible();

    await page.getByRole("button", { name: "Search Media Database" }).click();
    await page.getByLabel("Search record type").selectOption("publications");
    await page.getByLabel("Media collection scope").selectOption("added");
    await page.getByTestId("input-media-search").fill(publication);
    await page.getByTestId("button-search-media").click();
    const publicationCard = page.getByTestId(/^card-media-publication-/).filter({ hasText: publication });
    await expect(publicationCard).toBeVisible();
    await publicationCard.getByRole("button", { name: "Save to My Media Database" }).click();
    await expect(publicationCard.getByRole("button", { name: "Remove from My Media Database" })).toBeVisible();

    await page.getByRole("button", { name: "My Media Database", exact: true }).click();
    await page.getByLabel("Search record type").selectOption("publications");
    const savedPublicationRow = page.getByRole("row").filter({ hasText: publication });
    await expect(savedPublicationRow).toBeVisible();
    await page.reload();

    // Re-enter through the visible Project Hub and verify the bookmark from
    // My Media Database after a full browser refresh.
    await expect(page.getByRole("heading", { name: /Project Hub/i })).toBeVisible();
    await page.getByText(projectName, { exact: true }).click();
    await page.getByRole("button", { name: "Media Database" }).click();
    await page.getByRole("button", { name: "My Media Database", exact: true }).click();
    await page.getByLabel("Search record type").selectOption("publications");
    await expect(page.getByRole("row").filter({ hasText: publication })).toBeVisible();
    await page.getByRole("button", { name: "Manage my records" }).click();
    await page.getByRole("button", { name: "Add contact" }).click();
    await page.getByPlaceholder("Jane", { exact: true }).fill("Repeatable");
    await page.getByPlaceholder("Smith").fill(`Contact ${suffix}`);
    await page.getByPlaceholder("Type the publication name").fill(publication);
    await page.getByRole("button", { name: "Save contact" }).click();
    await page.getByRole("button", { name: /Contacts \(/ }).click();
    await page.getByRole("button", { name: "Browse contacts" }).click();
    const contactName = `Repeatable Contact ${suffix}`;
    const contactRow = page.getByRole("row").filter({ hasText: contactName });
    await expect(contactRow).toBeVisible();
    await expect(contactRow).toContainText(publication);
    await contactRow.getByTitle("Edit").click();
    await page.getByPlaceholder("Jane", { exact: true }).fill("Updated");
    await page.getByRole("button", { name: "Save changes" }).click();
    const updatedContactRow = page.getByRole("row").filter({ hasText: `Updated Contact ${suffix}` });
    await expect(updatedContactRow).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await updatedContactRow.getByTitle("Delete").click();
    await expect(updatedContactRow).toHaveCount(0);

    // Publication removal is also a UI action, after the bookmark persistence
    // assertion; both created record types have now exercised create/read/update/delete.
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /Publications \(/ }).click();
    await page.getByRole("button", { name: "Browse publications" }).click();
    await page.getByRole("row").filter({ hasText: publication }).getByTitle("Delete").click();
    await expect(page.getByText(publication, { exact: true })).toHaveCount(0);
  });

  await test.step("Check workspace isolation and catch browser/API failures", async () => {
    const crossWorkspace = await authenticatedFetch(page, "/api/store/projects/other-workspace/intake");
    expect(crossWorkspace.status).toBe(404);
    expect(crossWorkspace.body).toMatchObject({ error: "Project not found." });
    expect(paymentRequests).toEqual([]);
    expect(apiFailures).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});

test("private project APIs reject anonymous requests and the public marketing routes render content", async ({ page, request }) => {
  const identity = await request.get("/api/platform/me");
  expect(identity.status()).toBe(200);
  await expect(identity.json()).resolves.toMatchObject({ account: null });
  expect((await request.get("/api/store/projects")).status()).toBe(401);
  expect((await request.get("/api/store/media-db/bookmarks")).status()).toBe(401);

  await page.goto("/");
  await dismissAutoDemo(page);
  await expect(page.locator("h1")).toContainText("The AI Authority Platform");
  await page.goto("/about");
  await expect(page.locator("body")).not.toBeEmpty();
  await expect(page.locator("h1, h2").first()).toBeVisible();
});