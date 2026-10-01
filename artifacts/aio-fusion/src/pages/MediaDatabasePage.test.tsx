// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/contentAi", () => ({
  apiBase: () => "",
  escapeHtml: (value: string) => value,
}));
vi.mock("../IntakeForm", () => ({
  getProjectMediaCategories: () => [],
}));

import { MediaDatabasePage, contactCompletenessPercent, contactDisplayName, contactExportRow, importOutcomesWithErrors, importPlanHasWork, isUploadedMediaContact, publicationWebsiteHref, sanitizeSpreadsheetCell } from "./MediaDatabasePage";

const changedContact = {
  id: 12, outletId: 2, firstName: "Jane", lastName: "Reporter", role: "Energy Editor",
  email: "jane@example.com", phone: "", notes: "", accountId: "account-a",
  sourceUrl: "https://example.com/jane", sourceRef: "Contacts:2", sourceStatus: "changed",
  beats: ["energy", "climate"], sectors: ["Energy", "Environment"], geography: "UK", confidence: "High",
  publicationReach: "1M-5M", publicationAuthority: 82, journalistAuthority: 91, linkedinUrl: "https://linkedin.com/in/jane",
  provenance: { importFilename: "v33.xlsx", sheet: "Contacts", sourceRow: 2 },
  sourceCheck: {
    id: 44, outcome: "changed", checkedAt: "2026-09-14T09:00:00.000Z", reviewedAt: null,
    observedEvidence: { nameFound: true, roleFound: false, emailFound: false, observedRole: "Climate Correspondent", observedEmails: [], excerpt: "Jane Reporter - Climate Correspondent" },
    differences: [
      { field: "role", kind: "changed", storedValue: "Energy Editor", observedValue: "Climate Correspondent", supported: true },
      { field: "email", kind: "removed", storedValue: "jane@example.com", observedValue: "", supported: false },
    ],
  },
};

let testOutlets: Record<string, unknown>[] = [];
let importPreviewMode: "legacy" | "review" | "refresh" | "publication" = "legacy";
let searchTotalOverride = 2;
let searchEmptyMode = false;
let outletTotalOverride = 0;
let bookmarkTestRows: Array<Record<string, unknown>> = [];
let bookmarkTotalOverride: number | null = null;

async function browseContacts() {
  const manageButton = screen.queryByRole("button", { name: "Manage my records" });
  if (manageButton) fireEvent.click(manageButton);
  fireEvent.click(screen.getByRole("button", { name: /Contacts \(/i }));
  fireEvent.click(screen.getByRole("button", { name: "Browse contacts" }));
  expect(await screen.findByText("Jane Reporter")).toBeTruthy();
}

async function browseOutlets() {
  const manageButton = screen.queryByRole("button", { name: "Manage my records" });
  if (manageButton) fireEvent.click(manageButton);
  fireEvent.click(screen.getByRole("button", { name: /Publications \(/i }));
  fireEvent.click(screen.getByRole("button", { name: "Browse publications" }));
  await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("/media-db/outlets?"))).toBe(true));
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

async function submitPublicationSearch() {
  await waitFor(() => expect(Array.from((screen.getByLabelText("Sector filter") as HTMLSelectElement).options).some((option) => option.value === "Energy")).toBe(true));
  fireEvent.change(screen.getByLabelText("Search record type"), { target: { value: "publications" } });
  fireEvent.change(screen.getByLabelText("Media collection scope"), { target: { value: "saved" } });
  fireEvent.change(screen.getByLabelText("Sector filter"), { target: { value: "Energy" } });
  fireEvent.change(screen.getByLabelText("Region filter"), { target: { value: "UK" } });
  fireEvent.change(screen.getByLabelText("Search the media database"), { target: { value: "energy" } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(await screen.findByText("=Injected Media")).toBeTruthy();
}

function openImportModal() {
  const advanced = Array.from(document.querySelectorAll("details")).find((details) => details.querySelector("summary")?.textContent?.includes("Internal tools"));
  if (advanced && !advanced.open) fireEvent.click(advanced.querySelector("summary")!);
  fireEvent.click(screen.getByRole("button", { name: "Import CSV" }));
}

describe("MediaDatabasePage source health", () => {
  beforeEach(() => {
    localStorage.setItem("aio.auth.session.v3", JSON.stringify({ username: "account-a", role: "agency", membershipRole: "owner" }));
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/media-db/import-jobs/")) {
        return new Response(JSON.stringify({
          ok: true,
          job: {
            id: "test-job",
            status: "completed",
            sourceFilename: "contacts.csv",
            summary: { outletsCreated: 1, contactsCreated: importPreviewMode === "publication" ? 0 : 1, duplicatesSkipped: 0, publicationsProcessed: importPreviewMode === "publication" ? 1 : 0, refreshed: importPreviewMode === "refresh" ? 1 : 0, unchanged: 0 },
          },
        }), { status: 200 });
      }
      if (url.includes("/media-db/export") && init?.method === "POST") {
        return new Response('"First Name","Last Name"\r\n"Jane","Reporter"', {
          status: 200,
          headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="Media contacts.csv"' },
        });
      }
      if (url.includes("/media-db/bookmarks")) {
        if (!init?.method || init.method === "GET") {
          const params = new URL(url, "http://test.local").searchParams;
          const page = Number(params.get("page") || 1);
          const pageSize = Number(params.get("pageSize") || 50);
          const start = (page - 1) * pageSize;
          return new Response(JSON.stringify({
            bookmarks: bookmarkTestRows.slice(start, start + pageSize),
            total: bookmarkTotalOverride ?? bookmarkTestRows.length,
            page,
            pageSize,
          }), { status: 200 });
        }
        return new Response(JSON.stringify({ bookmarks: [] }), { status: 200 });
      }
      if (url.includes("/media-db/import")) {
        const request = JSON.parse(String(init?.body ?? "{}")) as { commit?: boolean; collectionScope?: string };
        expect(request.collectionScope).toBeTruthy();
        return new Response(JSON.stringify(request.commit
          ? { ok: true, jobId: "test-job", status: "reconciliation" }
          : {
            ok: true,
            preview: {
              validRows: 1, importableRows: importPreviewMode === "legacy" || importPreviewMode === "review" ? 1 : 0, publicationRows: importPreviewMode === "publication" ? 1 : 0, matchedExisting: importPreviewMode === "refresh" ? 1 : 0, duplicateRows: 0, invalidRows: 0,
              new: importPreviewMode === "legacy" || importPreviewMode === "review" ? 1 : 0, refreshed: importPreviewMode === "refresh" ? 1 : 0, unchanged: 0, duplicate: 0, invalid: 0, conflicted: importPreviewMode === "review" ? 1 : 0,
              outletCount: 1, errors: [], sample: [{ sourceRow: 2, firstName: "Jane", lastName: "Reporter", role: "Editor", outletName: "Example News", email: "jane@example.com" }],
              collectionScope: request.collectionScope, owner: request.collectionScope === "shared" ? "Master" : "agency-a",
              ...(importPreviewMode === "legacy" ? {} : { reviewToken: "review-token", sourceHash: "source-hash", rowOutcomes: [{ sourceRow: 2, sheetName: "Contacts", status: importPreviewMode === "refresh" ? "refreshed" : importPreviewMode === "publication" ? "publication" : "conflicted", outcome: importPreviewMode === "refresh" ? "refreshed" : importPreviewMode === "publication" ? "publication" : "conflicted", reason: importPreviewMode === "review" ? "Conflict review required." : "" }] }),
            },
          }), { status: request.commit ? 202 : 200 });
      }
      if (url.includes("/source-checks/44/approve")) {
        expect(JSON.parse(String(init?.body))).toEqual({ fields: ["role"] });
        return new Response(JSON.stringify({ ok: true, applied: ["role"], skipped: [] }), { status: 200 });
      }
      if (url.includes("/contacts/12/corrections")) {
        return new Response(JSON.stringify({ ok: true, report: { id: 10, status: "pending" } }), { status: 201 });
      }
      if (url.includes("/source-check")) {
        return new Response(JSON.stringify({ ok: true, sourceCheck: changedContact.sourceCheck }), { status: 200 });
      }
      if (url.includes("/media-db/search")) {
        const searchParams = new URL(url, "http://test.local").searchParams;
        const isPublicRelationsSearch = searchParams.get("category") === "Public Relations (PR)";
        return new Response(JSON.stringify({
          interpretation: { phrase: "energy", topic: "", location: "", category: "", authority: 0 },
          results: searchEmptyMode ? [] : [{
            type: "contact", id: 12, contact: changedContact, authority: 75,
            matchedFields: ["role"], matchedPhrases: ["energy"],
            reasons: ["Matched role.", "Contains the exact phrase \"energy\"."],
          }, {
            type: "outlet", id: 20, outlet: { id: 20, name: isPublicRelationsSearch ? "PR Weekly" : "Energy Weekly", category: isPublicRelationsSearch ? "Public Relations (PR)" : "Energy", website: "energy.example", description: "", country: "UK", reachBand: "National", linkedinUrl: "https://linkedin.com/company/energy-weekly", linkedJournalists: [changedContact], accountId: null },
            authority: 0, matchedFields: ["publication"], matchedPhrases: [], reasons: ["Matched publication."],
          }],
           total: searchTotalOverride, counts: { contacts: searchEmptyMode ? 0 : 1, outlets: searchEmptyMode ? 0 : 1 },
        }), { status: 200 });
      }
      if (url.includes("/contacts")) {
        return new Response(JSON.stringify({
          contacts: [changedContact, {
            ...changedContact, id: 13, firstName: "No", lastName: "Source", sourceUrl: "", sourceStatus: "unverified", sourceCheck: null,
          }],
          total: 2,
        }), { status: 200 });
      }
      if (url.includes("/outlets")) {
        const query = new URL(url, "http://test.local").searchParams;
        return new Response(JSON.stringify({
          outlets: testOutlets,
          total: outletTotalOverride || testOutlets.length,
          page: query.get("page"),
          pageSize: query.get("pageSize"),
        }), { status: 200 });
      }
      if (url.includes("/media-categories")) return new Response(JSON.stringify({ standard: ["Energy", "Public Relations (PR)"], custom: [] }), { status: 200 });
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    }));
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    testOutlets = [];
    importPreviewMode = "legacy";
    searchTotalOverride = 2;
    searchEmptyMode = false;
    outletTotalOverride = 0;
    bookmarkTestRows = [];
    bookmarkTotalOverride = null;
    vi.unstubAllGlobals();
  });

  it("treats uploaded rows as verified records and marks 80 percent as complete", () => {
    const eightyPercent = {
      ...changedContact,
      confidence: "",
      linkedinUrl: "",
      notes: "",
      reviewNotes: "",
      seniority: "Senior",
    };
    expect(isUploadedMediaContact(eightyPercent as never)).toBe(true);
    expect(contactCompletenessPercent(eightyPercent as never)).toBe(80);
    expect(isUploadedMediaContact({ ...eightyPercent, provenance: null } as never)).toBe(false);
  });

  it("keeps source review out of profiles and requires explicit approval in the manager review dialog", async () => {
    render(<MediaDatabasePage />);
    await browseContacts();
    expect(screen.queryByRole("columnheader", { name: "Notes" })).toBeNull();
    expect(screen.getByText("Changed")).toBeTruthy();
    expect(screen.getByText("Unverified")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "View Profile" })[0]);
    const profile = within(screen.getByRole("dialog", { name: "Journalist Profile" }));
    expect(profile.queryByText(/saved email is no longer shown/i)).toBeNull();
    expect(profile.queryByText("Public source health")).toBeNull();
    expect(profile.queryByText("Page verification")).toBeNull();
    expect(profile.queryByText(/Last checked/)).toBeNull();
    expect(profile.queryByText(/Source URL:/)).toBeNull();
    expect(profile.queryByText(/Record provenance:/)).toBeNull();
    expect(profile.queryByRole("link", { name: "View source" })).toBeNull();
    expect(screen.getAllByText(/Energy Editor/).length).toBeGreaterThan(0);
    expect(profile.queryByText(/Climate Correspondent/)).toBeNull();
    expect(screen.queryByText("Workbook assertion")).toBeNull();
    expect(screen.queryByText("v33.xlsx")).toBeNull();
    expect(screen.queryByText("Page check evidence")).toBeNull();
    expect(profile.queryByText("Notes")).toBeNull();
    expect(screen.getByText("Journalist authority")).toBeTruthy();
    expect(screen.getByText("Confidence")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Review public source" })[0]);
    const sourceReview = within(screen.getByRole("dialog", { name: "Review public source" }));
    expect(sourceReview.getByText("Public source health")).toBeTruthy();
    expect(sourceReview.getByText(/saved email is no longer shown/i)).toBeTruthy();
    expect(sourceReview.getAllByText(/Climate Correspondent/).length).toBeGreaterThan(0);
    expect(sourceReview.getByText("Page check evidence: Jane Reporter - Climate Correspondent")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept supported updates" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/source-checks/44/approve"),
      expect.objectContaining({ method: "POST" }),
    ));
  });

  it("keeps the shell visible and shows a retryable inline error when metadata loading fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("network unavailable");
    }));
    render(<MediaDatabasePage />);
    expect(await screen.findByText(/The Media Database could not be loaded/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("opens with search controls only and does not query results until Search is submitted", async () => {
    render(<MediaDatabasePage />);
    await waitFor(() => expect(Array.from((screen.getByLabelText("Sector filter") as HTMLSelectElement).options)
      .some((option) => option.value === "Energy")).toBe(true));
    expect(screen.queryByText("Jane Reporter")).toBeNull();
    expect(screen.queryByText(/contacts found/)).toBeNull();
    expect(screen.queryByText("No matching contacts")).toBeNull();
    expect(screen.queryByRole("button", { name: "Select visible results" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Export saved connections CSV" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Search record type"), { target: { value: "publications" } });
    fireEvent.change(screen.getByLabelText("Media collection scope"), { target: { value: "added" } });
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("/media-db/search"))).toBe(false);
  });

  it("starts with Search Media Database first and selected in pink, without the saved-publications shortcut", () => {
    render(<MediaDatabasePage />);
    const navigation = within(screen.getByRole("navigation", { name: "Media Database sections" }));
    expect(navigation.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Search Media Database", "My Media Database", "Manage my records",
    ]);
    const searchButton = navigation.getByRole("button", { name: "Search Media Database" });
    expect(searchButton).toHaveAttribute("aria-current", "page");
    expect(searchButton.style.backgroundColor).toBe("rgb(165, 47, 96)");
    expect(searchButton.style.color).toBe("rgb(255, 255, 255)");
    expect(navigation.getAllByRole("button").filter((button) => button.hasAttribute("aria-current"))).toHaveLength(1);
    expect(navigation.getByRole("button", { name: "Manage my records" }).style.backgroundColor).toBe("");
    expect(screen.queryByRole("button", { name: "Saved publications" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Search all media" })).toBeNull();
  });

  it("moves the selected pink navigation between saved media, management and search without remounting buttons", async () => {
    render(<MediaDatabasePage />);
    const navElement = screen.getByRole("navigation", { name: "Media Database sections" });
    const navigation = within(navElement);
    const searchButton = navigation.getByRole("button", { name: "Search Media Database" });
    const savedButton = navigation.getByRole("button", { name: "My Media Database" });
    const manageButton = navigation.getByRole("button", { name: "Manage my records" });
    const expectSelected = (selected: HTMLElement) => {
      for (const button of [searchButton, savedButton, manageButton]) {
        expect(button.getAttribute("aria-current")).toBe(button === selected ? "page" : null);
        expect(button.style.backgroundColor).toBe(button === selected ? "rgb(165, 47, 96)" : "");
      }
    };
    fireEvent.click(savedButton);
    await screen.findByText("1 contacts found");
    expectSelected(savedButton);
    fireEvent.click(manageButton);
    expect(screen.getByRole("heading", { name: "Manage my records" })).toBeTruthy();
    expectSelected(manageButton);
    fireEvent.click(screen.getByRole("button", { name: "Back to My Media Database" }));
    expectSelected(savedButton);
    fireEvent.click(searchButton);
    expectSelected(searchButton);
    expect(navigation.getByRole("button", { name: "Search Media Database" })).toBe(searchButton);
    expect(screen.queryByText(/contacts found/)).toBeNull();
    fireEvent.click(manageButton);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("Jane Reporter");
    expectSelected(searchButton);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expectSelected(searchButton);
  });

  it("resets the selected section and results when the page is re-entered", () => {
    const { unmount } = render(<MediaDatabasePage />);
    fireEvent.click(screen.getByRole("button", { name: "Manage my records" }));
    unmount();
    render(<MediaDatabasePage />);
    expect(screen.getByRole("button", { name: "Search Media Database" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("heading", { name: "Manage my records" })).toBeNull();
    expect(screen.queryByText(/contacts found/)).toBeNull();
  });

  it("searches all collections on submission and lets the account save shared records separately", async () => {
    render(<MediaDatabasePage />);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("Jane Reporter")).toBeTruthy();
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([input]) => {
      const url = new URL(String(input), "http://test.local");
      return url.pathname.endsWith("/media-db/search") && url.searchParams.get("scope") === "all";
    })).toBe(true));
    expect((screen.getByLabelText("Media collection scope") as HTMLSelectElement).value).toBe("all");
    expect(screen.getByRole("button", { name: "Save to My Media Database" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "My Media Database" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Manage my records" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Browse contacts" })).toBeNull();
  });

  it("supports Enter submission and displays result metadata in white", async () => {
    render(<MediaDatabasePage />);
    fireEvent.change(screen.getByLabelText("Search the media database"), { target: { value: "energy" } });
    fireEvent.keyDown(screen.getByLabelText("Search the media database"), { key: "Enter" });
    expect(await screen.findByText("Jane Reporter")).toBeTruthy();
    expect(screen.getByText("1 contacts found").style.color).toBe("rgb(255, 255, 255)");
    expect(screen.getByText("0/25 selected").parentElement?.style.color).toBe("rgb(255, 255, 255)");
    expect(screen.getByText("No saved contacts are available to export for this account.").style.color).toBe("rgb(255, 255, 255)");
  });

  it("returns from saved media to a search-only view without querying all media", async () => {
    bookmarkTestRows = [{ type: "contact", targetId: 12 }];
    render(<MediaDatabasePage />);
    fireEvent.click(screen.getByRole("button", { name: "My Media Database" }));
    expect(await screen.findByRole("cell", { name: "Jane" })).toBeTruthy();
    const searchCalls = () => vi.mocked(fetch).mock.calls.filter(([input]) => String(input).includes("/media-db/search")).length;
    const callsBefore = searchCalls();
    fireEvent.click(screen.getByRole("button", { name: "Search Media Database" }));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(screen.queryByRole("cell", { name: "Jane" })).toBeNull();
    expect(screen.queryByText(/contacts found/)).toBeNull();
    expect(searchCalls()).toBe(callsBefore);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("Jane Reporter")).toBeTruthy();
  });

  it("searches Public Relations publications across collections before optionally bookmarking them", async () => {
    render(<MediaDatabasePage />);
    await waitFor(() => expect(Array.from((screen.getByLabelText("Sector filter") as HTMLSelectElement).options)
      .some((option) => option.value === "Public Relations (PR)")).toBe(true));
    fireEvent.change(screen.getByLabelText("Search record type"), { target: { value: "publications" } });
    fireEvent.change(screen.getByLabelText("Sector filter"), { target: { value: "Public Relations (PR)" } });
    fireEvent.change(screen.getByLabelText("Search the media database"), { target: { value: "public relations" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByText("PR Weekly")).toBeTruthy();
    const search = vi.mocked(fetch).mock.calls.map(([input]) => new URL(String(input), "http://test.local"))
      .find((url) => url.pathname.endsWith("/media-db/search")
        && url.searchParams.get("type") === "publications"
        && url.searchParams.get("category") === "Public Relations (PR)");
    expect(search?.searchParams.get("scope")).toBe("all");
    expect(search?.searchParams.get("phrase")).toBe("public relations");

    fireEvent.click(screen.getByRole("button", { name: "Save to My Media Database" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/store/media-db/bookmarks/publication/20"),
      expect.objectContaining({ method: "PUT", credentials: "include" }),
    ));
    expect(await screen.findByRole("button", { name: "Remove from My Media Database" })).toBeTruthy();
  });

  it("loads contacts only after an explicit browse action", async () => {
    render(<MediaDatabasePage />);
    await browseContacts();
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("/media-db/contacts?"))).toBe(true);
  });

  it("server-pages publication browsing and carries search and category filters", async () => {
    testOutlets = [{ id: 2, name: "Example News", category: "Energy", website: "", description: "", country: "UK", reachBand: "", accountId: "account-a" }];
    outletTotalOverride = 101;
    render(<MediaDatabasePage />);
    await browseOutlets();
    fireEvent.change(screen.getByPlaceholderText("Search outlets by name or category..."), { target: { value: "example" } });
    fireEvent.change(screen.getByLabelText("Publication sector filter"), { target: { value: "Energy" } });
    fireEvent.click(screen.getByRole("button", { name: "Browse publications" }));
    await waitFor(() => {
      const calls = vi.mocked(fetch).mock.calls.map(([input]) => String(input)).filter((input) => input.includes("/media-db/outlets?"));
      expect(calls.some((input) => input.includes("q=example") && input.includes("category=Energy") && input.includes("page=1") && input.includes("pageSize=50"))).toBe(true);
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("/media-db/outlets?") && String(input).includes("page=2"))).toBe(true));
  });

  it("requires explicit submit and paginates unified search results", async () => {
    searchTotalOverride = 50;
    render(<MediaDatabasePage />);
    fireEvent.change(screen.getByLabelText("Search record type"), { target: { value: "publications" } });
    fireEvent.change(screen.getByLabelText("Media collection scope"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("Search the media database"), { target: { value: "energy" } });
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("/media-db/search"))).toBe(false);
    expect(vi.mocked(fetch).mock.calls.some(([input]) => new URL(String(input), "http://test.local").searchParams.get("phrase") === "energy")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("Energy Weekly")).toBeTruthy();
    expect(screen.getByText("Currently linked journalists (1)")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "LinkedIn" })[0]).toHaveAttribute("href", "https://linkedin.com/company/energy-weekly");
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("type=publications") && String(input).includes("scope=all"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("/media-db/search?page=2"))).toBe(true));
  });

  it("saves and unsaves a search result using the account bookmark endpoints", async () => {
    render(<MediaDatabasePage />);
    fireEvent.change(screen.getByLabelText("Media collection scope"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("Search the media database"), { target: { value: "energy" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("Jane Reporter")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save to My Media Database" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/store/media-db/bookmarks/contact/12"),
      expect.objectContaining({ method: "PUT", credentials: "include" }),
    ));
    expect(await screen.findByRole("button", { name: "Remove from My Media Database" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove from My Media Database" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/store/media-db/bookmarks/contact/12"),
      expect.objectContaining({ method: "DELETE", credentials: "include" }),
    ));
  });

  it("loads saved media across bookmark pages beyond the first page", async () => {
    bookmarkTestRows = Array.from({ length: 100 }, (_, index) => ({ type: "contact", targetId: index + 1000 }));
    bookmarkTestRows.push({ type: "publication", targetId: 20 });
    render(<MediaDatabasePage />);
    await waitFor(() => {
      const requests = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
      expect(requests.some((url) => url.includes("/media-db/bookmarks?") && url.includes("page=1") && url.includes("pageSize=100"))).toBe(true);
      expect(requests.some((url) => url.includes("/media-db/bookmarks?") && url.includes("page=2") && url.includes("pageSize=100"))).toBe(true);
    });
    fireEvent.change(screen.getByLabelText("Search record type"), { target: { value: "publications" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("Energy Weekly")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Remove from My Media Database" })).toBeTruthy();
  });

  it("shows an explicit error when saved media exceeds the safe loading cap", async () => {
    bookmarkTotalOverride = 10_001;
    render(<MediaDatabasePage />);
    expect(await screen.findByText(/exceeds the safe loading limit of 10,000 items/i)).toBeTruthy();
  });

  it("exports only explicitly selected visible contacts through the backend", async () => {
    render(<MediaDatabasePage />);
    await browseContacts();
    expect(screen.queryByRole("button", { name: /Export selected CSV/i })).toBeNull();
    fireEvent.click(screen.getByLabelText("Select contact 12"));
    fireEvent.click(screen.getByRole("button", { name: "Export selected CSV (1)" }));
    await waitFor(() => {
      const [, init] = vi.mocked(fetch).mock.calls.find(([input]) => String(input).includes("/media-db/export"))!;
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ scope: "selected", type: "contacts", ids: [12] });
    });
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("/media-db/contacts?") && String(input).includes("pageSize=200"))).toBe(false);
  });

  it("exports saved connections for the selected record type via the backend", async () => {
    bookmarkTestRows = [{ type: "publication", targetId: 20 }];
    render(<MediaDatabasePage />);
    fireEvent.change(screen.getByLabelText("Search record type"), { target: { value: "publications" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("Energy Weekly")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Export saved connections CSV" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Export saved connections CSV" }));
    await waitFor(() => {
      const [, init] = vi.mocked(fetch).mock.calls.find(([input]) => String(input).includes("/media-db/export"))!;
      expect(JSON.parse(String(init?.body))).toEqual({ scope: "saved", type: "publications" });
    });
  });

  it("shows full CSV controls only to the canonical platform admin and supports both types", async () => {
    render(<MediaDatabasePage />);
    await browseContacts();
    expect(screen.queryByRole("button", { name: "Export full CSV" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Export all matches|Word|Excel/i })).toBeNull();

    cleanup();
    localStorage.setItem("aio.auth.session.v3", JSON.stringify({ username: "admin", role: "admin", membershipRole: "owner" }));
    render(<MediaDatabasePage />);
    await browseContacts();
    fireEvent.click(screen.getByRole("button", { name: "Export full CSV" }));
    await waitFor(() => {
      const [, init] = vi.mocked(fetch).mock.calls.find(([input]) => String(input).includes("/media-db/export"))!;
      expect(JSON.parse(String(init?.body))).toEqual({ scope: "full", type: "contacts" });
    });
    fireEvent.click(screen.getByRole("button", { name: /Publications \(/i }));
    fireEvent.click(screen.getByRole("button", { name: "Browse publications" }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("/media-db/outlets?"))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Export full CSV" }));
    await waitFor(() => {
      const exports = vi.mocked(fetch).mock.calls.filter(([input]) => String(input).includes("/media-db/export"));
      expect(JSON.parse(String(exports[1][1]?.body))).toEqual({ scope: "full", type: "publications" });
    });
  });

  it("keeps type, collection, sector and region filters when paging and resets them with Clear", async () => {
    searchTotalOverride = 50;
    render(<MediaDatabasePage />);
    await waitFor(() => expect(Array.from((screen.getByLabelText("Sector filter") as HTMLSelectElement).options).some((option) => option.value === "Energy")).toBe(true));
    fireEvent.change(screen.getByLabelText("Search record type"), { target: { value: "publications" } });
    fireEvent.change(screen.getByLabelText("Media collection scope"), { target: { value: "saved" } });
    fireEvent.change(screen.getByLabelText("Sector filter"), { target: { value: "Energy" } });
    fireEvent.change(screen.getByLabelText("Region filter"), { target: { value: "UK" } });
    fireEvent.change(screen.getByLabelText("Search the media database"), { target: { value: "energy" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("Energy Weekly")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => {
      const requests = vi.mocked(fetch).mock.calls.map(([input]) => String(input)).filter((url) => url.includes("/media-db/search?"));
      const nextPage = requests.map((url) => new URL(url, "http://test.local").searchParams).find((params) => params.get("page") === "2");
      expect(nextPage?.get("type")).toBe("publications");
      expect(nextPage?.get("scope")).toBe("saved");
      expect(nextPage?.get("category")).toBe("Energy");
      expect(nextPage?.get("location")).toBe("UK");
    });
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByText("Energy Weekly")).toBeNull();
    expect(screen.queryByText(/publications found/)).toBeNull();
    expect(screen.queryByText("No matching contacts")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => {
      const requests = vi.mocked(fetch).mock.calls.map(([input]) => String(input)).filter((url) => url.includes("/media-db/search?"));
      const cleared = requests.length ? new URL(requests[requests.length - 1], "http://test.local").searchParams : undefined;
      expect(cleared?.get("page")).toBe("1");
      expect(cleared?.get("type")).toBe("contacts");
      expect(cleared?.get("scope")).toBe("all");
      expect(cleared?.has("category")).toBe(false);
      expect(cleared?.has("location")).toBe(false);
    });
  });

  it("renders an explicit no-results state without replacing the page shell", async () => {
    searchEmptyMode = true;
    render(<MediaDatabasePage />);
    fireEvent.change(screen.getByLabelText("Media collection scope"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("Search the media database"), { target: { value: "nothing" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("No matching contacts")).toBeTruthy();
    expect(screen.getByText("Media Database")).toBeTruthy();
  });

  it("shows the discovery queue to workspace members but instructions only to the canonical Master owner", async () => {
    render(<MediaDatabasePage />);
    await browseContacts();
    expect(screen.getAllByRole("button", { name: /^(Contacts|Publications) \(/i })).toHaveLength(2);
    const internalTools = Array.from(document.querySelectorAll("details")).find((details) => details.querySelector("summary")?.textContent?.includes("Internal tools"))!;
    expect(internalTools.open).toBe(false);
    fireEvent.click(internalTools.querySelector("summary")!);
    expect(screen.getByRole("button", { name: "Discoveries" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Research instructions" })).toBeNull();

    cleanup();
    localStorage.setItem("aio.auth.session.v3", JSON.stringify({ username: "admin", role: "admin", membershipRole: "owner" }));
    render(<MediaDatabasePage />);
    await browseContacts();
    const masterTools = Array.from(document.querySelectorAll("details")).find((details) => details.querySelector("summary")?.textContent?.includes("Internal tools"))!;
    fireEvent.click(masterTools.querySelector("summary")!);
    expect(screen.getByRole("button", { name: "Discoveries" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Research instructions" })).toBeTruthy();
  });

  it("keeps rich exports safe and preserves sheet-aware import outcomes", () => {
    expect(sanitizeSpreadsheetCell("=HYPERLINK(\"https://bad.example\", \"click\")")).toBe("'=HYPERLINK(\"https://bad.example\", \"click\")");
    expect(sanitizeSpreadsheetCell("+447700900000")).toBe("'+447700900000");
    const exported = contactExportRow(changedContact as never);
    expect(exported).toEqual(expect.arrayContaining(["energy; climate", "Energy; Environment", "1M-5M", "82", "91", "High", "Contacts:2"]));
    const outcomes = importOutcomesWithErrors(
      [{ sourceRow: 2, sheetName: "Contacts", status: "new", outcome: "new" }],
      [{ row: 2, sheetName: "Exceptions", message: "Invalid email" }],
    );
    expect(outcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceRow: 2, sheetName: "Contacts" }),
      expect.objectContaining({ sourceRow: 2, sheetName: "Exceptions", outcome: "invalid" }),
    ]));
    expect(importPlanHasWork({ validRows: 1, importableRows: 0, publicationRows: 1, matchedExisting: 0, duplicateRows: 0, invalidRows: 0, outletCount: 1, errors: [], sample: [] })).toBe(true);
    expect(importPlanHasWork({ validRows: 1, importableRows: 0, publicationRows: 0, matchedExisting: 1, duplicateRows: 1, invalidRows: 0, outletCount: 1, errors: [], sample: [] })).toBe(true);
    expect(importPlanHasWork({ validRows: 1, importableRows: 0, publicationRows: 0, matchedExisting: 0, duplicateRows: 0, invalidRows: 1, outletCount: 0, errors: [], sample: [] })).toBe(false);
  });

  it("does not treat numeric source values as publication website URLs", () => {
    expect(publicationWebsiteHref("345")).toBeNull();
    expect(publicationWebsiteHref("29/76")).toBeNull();
    expect(publicationWebsiteHref("https://example.com/news")).toBe("https://example.com/news");
  });

  it("keeps numeric-only source names out of display without changing stored values", () => {
    const numericContact = { firstName: "2396", lastName: "" };
    expect(contactDisplayName(numericContact as never)).toBe("Name not available");
    expect(numericContact.firstName).toBe("2396");
  });

  it("opens My Media Database as an account-saved spreadsheet view and removes Europe from both region selectors", async () => {
    bookmarkTestRows = [{ type: "contact", targetId: 12 }];
    render(<MediaDatabasePage />);
    expect(Array.from((screen.getByLabelText("Region filter") as HTMLSelectElement).options).some((option) => /Europe/i.test(option.textContent || ""))).toBe(false);
    expect(Array.from((screen.getByLabelText("Region filter") as HTMLSelectElement).options).some((option) => option.value === "Global")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Manage my records" }));
    const contactRegion = screen.getByLabelText("Contact region filter") as HTMLSelectElement;
    expect(Array.from(contactRegion.options).some((option) => /Europe/i.test(option.textContent || ""))).toBe(false);
    expect(Array.from(contactRegion.options).some((option) => option.value === "Global")).toBe(false);
    fireEvent.change(contactRegion, { target: { value: "Global" } });
    await waitFor(() => expect(contactRegion.value).not.toBe("Global"));
    fireEvent.click(screen.getByRole("button", { name: "My Media Database" }));
    expect(await screen.findByRole("columnheader", { name: "First name" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Source-provided reach" })).toBeTruthy();
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([input]) => {
      const url = new URL(String(input), "http://test.local");
      return url.pathname.endsWith("/media-db/search") && url.searchParams.get("scope") === "saved";
    })).toBe(true));
    expect(screen.getByText("Source-provided, not verified audience")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove from My Media Database" })).toBeTruthy();
  });

  it("shows saved publications in sector tables with honest website and reach labels", async () => {
    bookmarkTestRows = [{ type: "publication", targetId: 20 }];
    render(<MediaDatabasePage />);
    fireEvent.click(screen.getByRole("button", { name: "My Media Database" }));
    fireEvent.change(screen.getByLabelText("Search record type"), { target: { value: "publications" } });
    expect(await screen.findByRole("columnheader", { name: "Publication" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Linked journalists" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Visit" })).toHaveAttribute("href", "https://energy.example/");
    expect(screen.getByText("Source-provided, not verified audience")).toBeTruthy();
    expect(screen.queryByText(/Verified authority/)).toBeNull();
    expect(screen.getByRole("button", { name: "Remove from My Media Database" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("allows edit and delete for workspace-owned contacts directly from My Media Database", async () => {
    bookmarkTestRows = [{ type: "contact", targetId: 12 }];
    render(<MediaDatabasePage />);
    fireEvent.click(screen.getByRole("button", { name: "My Media Database" }));
    expect(await screen.findByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("heading", { name: "Edit contact" })).toBeTruthy();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([input, init]) => String(input).includes("/media-db/contacts/12") && init?.method === "DELETE")).toBe(true));
    confirm.mockRestore();
  });

  it("confirms submitted correction reports are pending internal review", async () => {
    render(<MediaDatabasePage />);
    fireEvent.change(screen.getByLabelText("Media collection scope"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("Search the media database"), { target: { value: "energy" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("Jane Reporter")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Flag incorrect details" }));
    fireEvent.click(screen.getByLabelText("role"));
    fireEvent.change(screen.getByLabelText("What is incorrect?"), { target: { value: "The title has changed." } });
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    expect(await screen.findByText(/pending internal review/i)).toBeTruthy();
    expect(screen.getByText(/does not change the saved contact details/i)).toBeTruthy();
  });

  it("shows unified explained results and opens a provenance-safe correction report", async () => {
    render(<MediaDatabasePage />);
    await browseContacts();
    fireEvent.change(screen.getByLabelText("Media collection scope"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("Search the media database"), { target: { value: "energy" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("Jane Reporter")).toBeTruthy();
    expect(screen.getByText("1 contacts found")).toBeTruthy();
    expect(screen.getByText("Matched role")).toBeTruthy();
    expect(screen.getByText("Exact phrase: “energy”")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Flag incorrect details" }));
    expect(screen.getByText(/does not overwrite the trusted record/i)).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog").parentElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("defaults Master imports to the shared collection and confirms the server-resolved target", async () => {
    localStorage.setItem("aio.auth.session.v3", JSON.stringify({ username: "admin", role: "admin" }));
    vi.stubGlobal("crypto", { randomUUID: () => "test-import-key" });
    render(<MediaDatabasePage />);
    await browseContacts();
    openImportModal();

    expect(screen.getByLabelText("Shared collection")).toBeChecked();
    expect(screen.getByLabelText("Workspace private collection")).not.toBeChecked();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = { name: "contacts.csv", size: 42, text: async () => "First Name,Last Name,Publication,Email\nJane,Reporter,Example News,jane@example.com" };
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(await screen.findByText("Import target: Shared collection")).toBeTruthy();
    expect(screen.getByText("Owner: Master")).toBeTruthy();
    const previewCall = vi.mocked(fetch).mock.calls.find(([input, init]) => String(input).includes("/media-db/import") && String(init?.body).includes('"commit":false'));
    expect(previewCall).toBeTruthy();
    expect(JSON.parse(String(previewCall?.[1]?.body))).toMatchObject({ collectionScope: "shared", commit: false });

    fireEvent.click(screen.getByRole("button", { name: "Import 1 contacts" }));
    await waitFor(() => {
      const commitCall = vi.mocked(fetch).mock.calls.find(([input, init]) => String(input).includes("/media-db/import") && String(init?.body).includes('"commit":true'));
      expect(commitCall).toBeTruthy();
      expect(JSON.parse(String(commitCall?.[1]?.body))).toMatchObject({ collectionScope: "shared", commit: true });
    });
  });

  it("resumes a saved import job after reload and shows its persisted summary", async () => {
    localStorage.setItem("aio.media-import-job:account-a", "test-job");
    render(<MediaDatabasePage />);
    expect(await screen.findByText("Import complete")).toBeTruthy();
    expect(screen.getByText(/Added 1 contacts and 1 outlets/)).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/media-db/import-jobs/test-job"),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("requires reviewed token acknowledgements and sends the exact source hash", async () => {
    importPreviewMode = "review";
    localStorage.setItem("aio.auth.session.v3", JSON.stringify({ username: "admin", role: "admin" }));
    vi.stubGlobal("crypto", { randomUUID: () => "review-import-key" });
    render(<MediaDatabasePage />);
    await browseContacts();
    openImportModal();
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [{ name: "review.csv", size: 42, text: async () => "First Name,Last Name,Publication,Email\nJane,Reporter,Example News,jane@example.com" }] } });
    expect(await screen.findByLabelText("Acknowledge import target ownership")).not.toBeChecked();
    const importButton = screen.getByRole("button", { name: "Import 1 contacts" });
    expect(importButton).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Acknowledge import target ownership"));
    fireEvent.click(screen.getByLabelText("Acknowledge import conflicts"));
    expect(importButton).toBeEnabled();
    fireEvent.click(importButton);
    await waitFor(() => {
      const commitCall = vi.mocked(fetch).mock.calls.find(([input, init]) => String(input).includes("/media-db/import") && String(init?.body).includes('"commit":true'));
      expect(commitCall).toBeTruthy();
      expect(JSON.parse(String(commitCall?.[1]?.body))).toMatchObject({
        reviewToken: "review-token",
        sourceHash: "source-hash",
        acknowledgeTarget: true,
        acknowledgeConflicts: true,
      });
    });
  });

  it.each([
    ["refresh", "Apply refresh plan"],
    ["publication", "Import 1 publications"],
  ] as const)("permits %s-only plans when there are no new contacts", async (mode, buttonName) => {
    importPreviewMode = mode;
    localStorage.setItem("aio.auth.session.v3", JSON.stringify({ username: "admin", role: "admin" }));
    vi.stubGlobal("crypto", { randomUUID: () => `${mode}-import-key` });
    render(<MediaDatabasePage />);
    await browseContacts();
    openImportModal();
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [{ name: `${mode}.csv`, size: 42, text: async () => "First Name,Last Name,Publication,Email\nJane,Reporter,Example News,jane@example.com" }] } });
    const importButton = await screen.findByRole("button", { name: buttonName });
    expect(importButton).toBeDisabled(); // token requires acknowledgement before commit
    fireEvent.click(screen.getByLabelText("Acknowledge import target ownership"));
    expect(importButton).toBeEnabled();
  });

  it("keeps shared edit and delete controls hidden for non-Master accounts while retaining private controls", async () => {
    localStorage.setItem("aio.auth.session.v3", JSON.stringify({ username: "agency-a", role: "agency" }));
    testOutlets = [
      { id: 1, name: "Master News", category: "Technology", website: "", description: "", country: "UK", reachBand: "", accountId: null, collectionScope: "shared" },
      { id: 2, name: "Agency News", category: "Technology", website: "", description: "", country: "UK", reachBand: "", accountId: "agency-a", collectionScope: "workspace" },
    ];
    render(<MediaDatabasePage />);
    await browseContacts();
    await browseOutlets();

    expect(screen.queryByText("AIO Fusion collection")).toBeNull();
    expect(screen.getAllByTitle("Edit")).toHaveLength(1);
    expect(screen.getAllByTitle("Delete")).toHaveLength(1);
    expect(screen.getByText("Agency News")).toBeTruthy();
  });

  it("defaults non-Master imports to a private workspace target without offering shared access", async () => {
    localStorage.setItem("aio.auth.session.v3", JSON.stringify({ username: "agency-a", role: "agency" }));
    render(<MediaDatabasePage />);
    await browseContacts();
    openImportModal();

    expect(screen.queryByLabelText("Shared collection")).toBeNull();
    expect(screen.getByLabelText("Workspace private collection")).toBeChecked();
  });

  it.each(["viewer", "billing"] as const)("keeps canonical Master %s sessions read-only", async (membershipRole) => {
    localStorage.setItem("aio.auth.session.v3", JSON.stringify({ username: "admin", role: "admin", membershipRole }));
    testOutlets = [
      { id: 1, name: "Master News", category: "Technology", website: "", description: "", country: "UK", reachBand: "", accountId: null, collectionScope: "shared" },
      { id: 2, name: "Agency News", category: "Technology", website: "", description: "", country: "UK", reachBand: "", accountId: "account-a", collectionScope: "workspace" },
    ];
    render(<MediaDatabasePage />);
    await browseContacts();

    expect(screen.queryByRole("button", { name: "Add contact" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add publication" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Import" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Import CSV" })).toBeNull();

    await browseOutlets();
    expect(screen.queryAllByTitle("Edit")).toHaveLength(0);
    expect(screen.queryAllByTitle("Delete")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /Contacts \(2\)/i }));
    fireEvent.click(screen.getAllByRole("button", { name: "View Profile" })[0]);
    expect(screen.queryByRole("button", { name: "Check source now" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Accept supported updates" })).toBeNull();
    expect(screen.queryByTitle("Edit Profile")).toBeNull();
  });

  it("keeps non-Master viewers read-only across private mutations and source actions", async () => {
    localStorage.setItem("aio.auth.session.v3", JSON.stringify({ username: "account-a", role: "agency", membershipRole: "viewer" }));
    testOutlets = [
      { id: 1, name: "Master News", category: "Technology", website: "", description: "", country: "UK", reachBand: "", accountId: null, collectionScope: "shared" },
      { id: 2, name: "Agency News", category: "Technology", website: "", description: "", country: "UK", reachBand: "", accountId: "account-a", collectionScope: "workspace" },
    ];
    render(<MediaDatabasePage />);
    await browseContacts();

    expect(screen.queryByRole("button", { name: "Add contact" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add publication" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Import" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Import CSV" })).toBeNull();

    await browseOutlets();
    expect(screen.queryAllByTitle("Edit")).toHaveLength(0);
    expect(screen.queryAllByTitle("Delete")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /Contacts \(2\)/i }));
    fireEvent.click(screen.getAllByRole("button", { name: "View Profile" })[0]);
    expect(screen.queryByRole("button", { name: "Check source now" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Accept supported updates" })).toBeNull();
    expect(screen.queryByTitle("Edit Profile")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.change(screen.getByLabelText("Media collection scope"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("Search the media database"), { target: { value: "energy" } });
    fireEvent.change(screen.getByLabelText("Search record type"), { target: { value: "publications" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("Energy Weekly")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark as departed" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Flag incorrect details" })).toBeNull();
  });
});