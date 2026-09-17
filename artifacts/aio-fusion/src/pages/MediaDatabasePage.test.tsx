// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/contentAi", () => ({
  apiBase: () => "",
  escapeHtml: (value: string) => value,
}));
vi.mock("../IntakeForm", () => ({
  getProjectMediaCategories: () => [],
}));

import { MediaDatabasePage, contactExportRow, importOutcomesWithErrors, importPlanHasWork, sanitizeSpreadsheetCell } from "./MediaDatabasePage";

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
let exportAllPagesMode = false;

describe("MediaDatabasePage source health", () => {
  beforeEach(() => {
    localStorage.setItem("aio.auth.session.v3", JSON.stringify({ username: "account-a", role: "agency", membershipRole: "owner" }));
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/media-db/import")) {
        const request = JSON.parse(String(init?.body ?? "{}")) as { commit?: boolean; collectionScope?: string };
        expect(request.collectionScope).toBeTruthy();
        return new Response(JSON.stringify(request.commit
          ? { ok: true, result: { outletsCreated: 1, contactsCreated: importPreviewMode === "publication" ? 0 : 1, duplicatesSkipped: 0, publicationsProcessed: importPreviewMode === "publication" ? 1 : 0, rowOutcomes: [{ sourceRow: 2, sheetName: "Contacts", status: importPreviewMode === "refresh" ? "refreshed" : "new", outcome: importPreviewMode === "refresh" ? "refreshed" : "new" }] } }
          : {
            ok: true,
            preview: {
              validRows: 1, importableRows: importPreviewMode === "legacy" || importPreviewMode === "review" ? 1 : 0, publicationRows: importPreviewMode === "publication" ? 1 : 0, matchedExisting: importPreviewMode === "refresh" ? 1 : 0, duplicateRows: 0, invalidRows: 0,
              new: importPreviewMode === "legacy" || importPreviewMode === "review" ? 1 : 0, refreshed: importPreviewMode === "refresh" ? 1 : 0, unchanged: 0, duplicate: 0, invalid: 0, conflicted: importPreviewMode === "review" ? 1 : 0,
              outletCount: 1, errors: [], sample: [{ sourceRow: 2, firstName: "Jane", lastName: "Reporter", role: "Editor", outletName: "Example News", email: "jane@example.com" }],
              collectionScope: request.collectionScope, owner: request.collectionScope === "shared" ? "Master" : "agency-a",
              ...(importPreviewMode === "legacy" ? {} : { reviewToken: "review-token", sourceHash: "source-hash", rowOutcomes: [{ sourceRow: 2, sheetName: "Contacts", status: importPreviewMode === "refresh" ? "refreshed" : importPreviewMode === "publication" ? "publication" : "conflicted", outcome: importPreviewMode === "refresh" ? "refreshed" : importPreviewMode === "publication" ? "publication" : "conflicted", reason: importPreviewMode === "review" ? "Conflict review required." : "" }] }),
            },
          }), { status: 200 });
      }
      if (url.includes("/source-checks/44/approve")) {
        expect(JSON.parse(String(init?.body))).toEqual({ fields: ["role"] });
        return new Response(JSON.stringify({ ok: true, applied: ["role"], skipped: [] }), { status: 200 });
      }
      if (url.includes("/source-check")) {
        return new Response(JSON.stringify({ ok: true, sourceCheck: changedContact.sourceCheck }), { status: 200 });
      }
      if (url.includes("/media-db/search")) {
        return new Response(JSON.stringify({
          interpretation: { phrase: "energy", topic: "", location: "", category: "", authority: 0 },
          results: [{
            type: "contact", id: 12, contact: changedContact, authority: 75,
            matchedFields: ["role"], matchedPhrases: ["energy"],
            reasons: ["Matched role.", "Contains the exact phrase \"energy\"."],
          }, {
            type: "outlet", id: 20, outlet: { id: 20, name: "Energy Weekly", category: "Energy", website: "energy.example", description: "", country: "UK", reachBand: "National", accountId: null },
            authority: 0, matchedFields: ["publication"], matchedPhrases: [], reasons: ["Matched publication."],
          }],
          total: 2, counts: { contacts: 1, outlets: 1 },
        }), { status: 200 });
      }
      if (url.includes("/contacts")) {
        if (exportAllPagesMode && new URL(url, "http://test.local").searchParams.get("pageSize") === "200") {
          const page = new URL(url, "http://test.local").searchParams.get("page");
          return new Response(JSON.stringify({
            contacts: page === "1" ? [changedContact] : page === "2" ? [{ ...changedContact, id: 14, email: "=unsafe@example.com", firstName: "Second" }] : [],
            total: 2,
          }), { status: 200 });
        }
        return new Response(JSON.stringify({
          contacts: [changedContact, {
            ...changedContact, id: 13, firstName: "No", lastName: "Source", sourceUrl: "", sourceStatus: "unverified", sourceCheck: null,
          }],
          total: 2,
        }), { status: 200 });
      }
      if (url.includes("/outlets")) return new Response(JSON.stringify({ outlets: testOutlets }), { status: 200 });
      if (url.includes("/media-categories")) return new Response(JSON.stringify({ standard: [], custom: [] }), { status: 200 });
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    }));
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    testOutlets = [];
    importPreviewMode = "legacy";
    exportAllPagesMode = false;
    vi.unstubAllGlobals();
  });

  it("shows changed and source-less statuses and requires explicit approval", async () => {
    render(<MediaDatabasePage />);
    expect(await screen.findByText("Jane Reporter")).toBeTruthy();
    expect(screen.getByText("Changed")).toBeTruthy();
    expect(screen.getByText("Unverified")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "View Profile" })[0]);
    expect(screen.getByText(/saved email is no longer shown/i)).toBeTruthy();
    expect(screen.getAllByText(/Energy Editor/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Climate Correspondent/).length).toBeGreaterThan(0);
    expect(screen.getByText("Workbook assertion")).toBeTruthy();
    expect(screen.getByText("v33.xlsx")).toBeTruthy();
    expect(screen.getByText("Page check evidence")).toBeTruthy();
    expect(screen.getByText("Journalist authority")).toBeTruthy();
    expect(screen.getByText("Confidence")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Accept supported updates" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/source-checks/44/approve"),
      expect.objectContaining({ method: "POST" }),
    ));
  });

  it("shows the discovery queue to workspace members but instructions only to the canonical Master owner", async () => {
    render(<MediaDatabasePage />);
    await screen.findByText("Jane Reporter");
    expect(screen.getByRole("button", { name: "Discoveries" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Research instructions" })).toBeNull();

    cleanup();
    localStorage.setItem("aio.auth.session.v3", JSON.stringify({ username: "admin", role: "admin", membershipRole: "owner" }));
    render(<MediaDatabasePage />);
    await screen.findByText("Jane Reporter");
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

  it("exports every filtered contact page and carries the outlet filter", async () => {
    exportAllPagesMode = true;
    testOutlets = [{ id: 2, name: "Example News", category: "Energy", website: "", description: "", country: "UK", reachBand: "", accountId: "account-a" }];
    const blobs: Blob[] = [];
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: (blob: Blob) => { blobs.push(blob); return "blob:test"; } });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<MediaDatabasePage />);
    await screen.findByText("Jane Reporter");
    fireEvent.change(screen.getAllByRole("combobox")[2], { target: { value: "2" } });
    const exportStart = vi.mocked(fetch).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Excel" }));
    await waitFor(() => {
      const exportCalls = vi.mocked(fetch).mock.calls.slice(exportStart).filter(([input, init]) => String(input).includes("/contacts?") && String(input).includes("pageSize=200"));
      expect(exportCalls).toHaveLength(2);
      expect(String(exportCalls[0][0])).toContain("outletId=2");
      expect(String(exportCalls[1][0])).toContain("page=2");
    });
    expect(blobs).toHaveLength(1);
    const exportedText = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blobs[0]);
    });
    expect(exportedText).toContain("Second");
    clickSpy.mockRestore();
  });

  it("shows unified explained results and opens a provenance-safe correction report", async () => {
    render(<MediaDatabasePage />);
    await screen.findByText("Jane Reporter");
    fireEvent.change(screen.getByLabelText("Search contacts and publications"), { target: { value: "energy" } });
    expect(await screen.findByText("Energy Weekly")).toBeTruthy();
    expect(screen.getByText("1 contacts and 1 publications", { exact: false })).toBeTruthy();
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
    await screen.findByText("Jane Reporter");
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

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

  it("requires reviewed token acknowledgements and sends the exact source hash", async () => {
    importPreviewMode = "review";
    localStorage.setItem("aio.auth.session.v3", JSON.stringify({ username: "admin", role: "admin" }));
    vi.stubGlobal("crypto", { randomUUID: () => "review-import-key" });
    render(<MediaDatabasePage />);
    await screen.findByText("Jane Reporter");
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
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
    await screen.findByText("Jane Reporter");
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
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
    await screen.findByText("Jane Reporter");
    fireEvent.click(screen.getByRole("button", { name: /Outlets \(2\)/i }));

    expect(screen.getByText("Shared collection")).toBeTruthy();
    expect(screen.getAllByTitle("Edit")).toHaveLength(1);
    expect(screen.getAllByTitle("Delete")).toHaveLength(1);
    expect(screen.getByText("Agency News")).toBeTruthy();
  });

  it("defaults non-Master imports to a private workspace target without offering shared access", async () => {
    localStorage.setItem("aio.auth.session.v3", JSON.stringify({ username: "agency-a", role: "agency" }));
    render(<MediaDatabasePage />);
    await screen.findByText("Jane Reporter");
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

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
    await screen.findByText("Jane Reporter");

    expect(screen.queryByRole("button", { name: "Add contact" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add publication" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Import" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Import CSV" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Outlets \(2\)/i }));
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
    await screen.findByText("Jane Reporter");

    expect(screen.queryByRole("button", { name: "Add contact" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add publication" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Import" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Import CSV" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Outlets \(2\)/i }));
    expect(screen.queryAllByTitle("Edit")).toHaveLength(0);
    expect(screen.queryAllByTitle("Delete")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /Contacts \(2\)/i }));
    fireEvent.click(screen.getAllByRole("button", { name: "View Profile" })[0]);
    expect(screen.queryByRole("button", { name: "Check source now" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Accept supported updates" })).toBeNull();
    expect(screen.queryByTitle("Edit Profile")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.change(screen.getByLabelText("Search contacts and publications"), { target: { value: "energy" } });
    expect(await screen.findByText("Energy Weekly")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark as departed" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Flag incorrect details" })).toBeNull();
  });
});