import { expect, test } from "@playwright/test";
import { dismissHomepagePrompts } from "../helpers/homepage-prompts";
import { SQL_DATA_PROBES } from "../../artifacts/api-server/src/lib/security-audit-probes";

test("built app sign-in, SQL form families and tenant integrity in disposable PostgreSQL", async ({ page, request }) => {
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    return ["127.0.0.1", "localhost"].includes(url.hostname) ? route.continue() : route.abort();
  });
  await page.goto("/");
  await dismissHomepagePrompts(page);
  await page.getByRole("button", { name: "Platform Login" }).click();
  await page.getByPlaceholder("Email or username").fill("' OR TRUE --");
  await page.getByPlaceholder("Password").fill("' OR TRUE --");
  const rejectedLogin = page.waitForResponse(r => r.url().endsWith("/api/platform/login") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Sign in" }).click();
  expect((await rejectedLogin).status()).toBe(401);
  await page.getByPlaceholder("Email or username").fill("release@example.invalid");
  await page.getByPlaceholder("Password").fill("release-harness-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "release@example.invalid" })).toBeVisible({ timeout: 25_000 });
  await page.getByRole("button", { name: "Project Hub" }).click();
  await expect(page.getByText("Release project")).toBeVisible({ timeout: 25_000 });

  const before = await (await request.get("/__test/security-state")).json();
  // Use the signed-in browser's fetch, not a separate HTTP cookie transport.
  // Chrome accepts Secure cookies on loopback, whereas APIRequestContext does
  // not necessarily send those cookies over this synthetic HTTP origin.
  async function call(method: string, path: string, options?: { data?: unknown; headers?: Record<string, string> }) {
    const result = await page.evaluate(async ({ method, path, options }) => {
      const response = await fetch(path, {
        method, credentials: "include", headers: {
          ...(options?.data === undefined ? {} : { "content-type": "application/json" }),
          ...options?.headers,
        },
        body: options?.data === undefined ? undefined : JSON.stringify(options.data),
      });
      return { status: response.status, json: await response.json() };
    }, { method, path, options });
    return { status: () => result.status, json: async () => result.json };
  }
  const api = {
    get: (path: string) => call("GET", path),
    post: (path: string, options?: { data?: unknown; headers?: Record<string, string> }) => call("POST", path, options),
    put: (path: string, options?: { data?: unknown; headers?: Record<string, string> }) => call("PUT", path, options),
    delete: (path: string) => call("DELETE", path),
  };
  await test.step("project, snapshots, content and saved-audit families execute bound queries", async () => {
    for (const [index, value] of SQL_DATA_PROBES.entries()) {
      const archiveId = `security-archive-${index}-${value}`;
      const intake = { formData: { "1.1": value, "4.1": value } };
      expect((await api.post("/api/store/projects/intake", { data: { id: "release-project", intake } })).status()).toBe(200);
      const saved = await (await api.get("/api/store/projects/release-project/intake")).json();
      expect(saved.intake.formData["4.1"]).toBe(value);
      expect((await api.get(`/api/store/projects/${encodeURIComponent(value)}/intake`)).status()).toBe(404);
      const created = await api.post("/api/store/archive", { data: {
        id: archiveId, projectId: "release-project", title: value, contentType: "Article", bodyCopy: value,
      } });
      expect(created.status()).toBe(200);
      expect((await created.json()).item.title).toBe(value);
      const planner = await api.post("/api/store/planner", { data: {
        id: `security-planner-${index}`, projectId: "release-project", title: value, notes: value,
        sourceArchiveId: archiveId,
      } });
      expect(planner.status()).toBe(200);
      expect((await planner.json()).item.notes).toBe(value);
      const guessed = await api.get(`/api/store/archive?projectId=${encodeURIComponent(value)}`);
      expect(guessed.status()).toBe(200);
      expect((await guessed.json()).items).toEqual([]);
      for (const [kind, field] of [["audits", "audit"], ["diagnostics", "diagnostic"]] as const) {
        const id = `security-${kind}-${index}-${value}`;
        const response = await api.post(`/api/store/projects/release-project/${kind}`, { data: {
          [field]: { id, savedAt: "2026-10-03T00:00:00.000Z", result: { name: value, queries: [value] } },
        } });
        expect(response.status()).toBe(200);
        const listed = JSON.stringify(await (await api.get(`/api/store/projects/release-project/${kind}`)).json());
        expect(listed).toContain(value);
        expect((await api.delete(`/api/store/projects/release-project/${kind}/${encodeURIComponent(id)}`)).status()).toBe(200);
      }
      expect((await api.put("/api/store/scoring-config", { data: { config: { name: value } } })).status()).toBe(200);
      expect((await (await api.get("/api/store/scoring-config")).json()).config.name).toBe(value);
      expect((await api.delete(`/api/store/planner/security-planner-${index}`)).status()).toBe(200);
      expect((await api.delete(`/api/store/archive/${encodeURIComponent(archiveId)}`)).status()).toBe(200);
    }
  });

  await test.step("media manual creation, search, bookmark, recommendation and outreach inputs remain data", async () => {
    for (const [index, value] of SQL_DATA_PROBES.entries()) {
      const outlet = await api.post("/api/store/media-db/outlets", { data: { name: value, description: value } });
      expect(outlet.status()).toBe(200);
      const outletRow = (await outlet.json()).outlet;
      expect(outletRow.name).toBe(value);
      const contact = await api.post("/api/store/media-db/contacts", { data: {
        firstName: "Anne", lastName: "O'Brien", notes: value, outletId: outletRow.id,
        email: `security-contact-${index}@example.invalid`,
      } });
      expect(contact.status()).toBe(200);
      const contactRow = (await contact.json()).contact;
      expect(contactRow.notes).toBe(value);
      expect(contactRow.lastName).toBe("O'Brien");
      const searched = await api.get(`/api/store/media-db/contacts?q=${encodeURIComponent(value)}&page=1&pageSize=10`);
      expect(searched.status()).toBe(200);
      expect((await searched.json()).contacts.every((row: { accountId: string }) => row.accountId === "release-workspace")).toBe(true);
      expect((await api.post("/api/store/media-db/bookmarks", { data: { type: "contact", id: contactRow.id } })).status()).toBe(200);
      const archiveId = `security-outreach-article-${index}`;
      expect((await api.post("/api/store/archive", { data: {
        id: archiveId, projectId: "release-project", title: value, contentType: "Article",
      } })).status()).toBe(200);
      const outreach = await api.post("/api/store/media-db/outreach", { data: {
        projectId: "release-project", storyKey: archiveId, contactId: contactRow.id,
        notes: value, articleTitle: value,
      } });
      expect(outreach.status()).toBe(201);
      expect((await outreach.json()).outreach.notes).toBe(value);
      const decision = await api.put("/api/store/media-db/recommendations/decisions", { data: {
        projectId: "release-project", storyKey: archiveId, contactId: contactRow.id, decision: "shortlisted", note: value,
      } });
      expect(decision.status()).toBe(200);
      const decisionRows = await (await api.get(`/api/store/media-db/recommendations/decisions?projectId=release-project&storyKey=${encodeURIComponent(archiveId)}`)).json();
      expect(JSON.stringify(decisionRows)).toContain(value);
      const feedback = await api.put("/api/store/media-db/recommendations/feedback", { data: {
        projectId: "release-project", storyKey: archiveId, contactId: contactRow.id, signal: "more",
      } });
      // No paid/generated recommendation set exists in this fixture. The
      // real handler must deny feedback rather than invent that relationship.
      expect(feedback.status()).toBe(404);
      expect((await api.post("/api/store/media-db/discoveries", { data: { discoveryToken: value, candidateKey: value } })).status()).toBe(400);
    }
  });

  await test.step("roles, Origin and foreign workspace mutations are denied without writes", async () => {
    const foreign = await api.post("/api/store/projects/intake", { data: {
      id: "other-workspace", intake: { formData: { "4.1": "' OR TRUE --" } },
    } });
    expect(foreign.status()).toBe(403);
    for (const value of SQL_DATA_PROBES) {
      expect((await api.post("/api/platform/accounts/profile", { data: {
        username: value, displayName: value,
      } })).status()).toBe(403);
      expect((await api.delete(`/api/platform/sessions/${encodeURIComponent(value)}`)).status()).toBe(404);
      expect((await api.post("/api/admin/insights", { data: { title: value } })).status()).toBe(403);
      expect((await api.get(`/api/admin/howto/${encodeURIComponent(value)}`)).status()).toBe(403);
      expect((await api.post("/api/platform/team/invite", { data: {
        email: value, role: "owner", projectIds: [value],
      } })).status()).toBe(400);
    }
    expect((await page.request.post("/api/store/scoring-config", {
      headers: { Origin: "https://attacker.invalid" }, data: { config: { label: "not-written" } },
    })).status()).toBe(403);
    const after = await (await request.get("/__test/security-state")).json();
    expect(after.foreignProject).toEqual(before.foreignProject);
    expect(after.projects).toBe(before.projects);
    expect(after.tokenUsage).toBe(before.tokenUsage);
    expect(after.contacts - before.contacts).toBe(SQL_DATA_PROBES.length);
  });
});