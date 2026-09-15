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

import { MediaDatabasePage } from "./MediaDatabasePage";

const changedContact = {
  id: 12, outletId: null, firstName: "Jane", lastName: "Reporter", role: "Energy Editor",
  email: "jane@example.com", phone: "", notes: "", accountId: "account-a",
  sourceUrl: "https://example.com/jane", sourceStatus: "changed",
  sourceCheck: {
    id: 44, outcome: "changed", checkedAt: "2026-09-14T09:00:00.000Z", reviewedAt: null,
    observedEvidence: { nameFound: true, roleFound: false, emailFound: false, observedRole: "Climate Correspondent", observedEmails: [], excerpt: "Jane Reporter - Climate Correspondent" },
    differences: [
      { field: "role", kind: "changed", storedValue: "Energy Editor", observedValue: "Climate Correspondent", supported: true },
      { field: "email", kind: "removed", storedValue: "jane@example.com", observedValue: "", supported: false },
    ],
  },
};

describe("MediaDatabasePage source health", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
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
        return new Response(JSON.stringify({
          contacts: [changedContact, {
            ...changedContact, id: 13, firstName: "No", lastName: "Source", sourceUrl: "", sourceStatus: "unverified", sourceCheck: null,
          }],
          total: 2,
        }), { status: 200 });
      }
      if (url.includes("/outlets")) return new Response(JSON.stringify({ outlets: [] }), { status: 200 });
      if (url.includes("/media-categories")) return new Response(JSON.stringify({ standard: [], custom: [] }), { status: 200 });
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    }));
  });

  afterEach(() => {
    cleanup();
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
    expect(screen.getByText(/Climate Correspondent/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Accept supported updates" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/source-checks/44/approve"),
      expect.objectContaining({ method: "POST" }),
    ));
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
});