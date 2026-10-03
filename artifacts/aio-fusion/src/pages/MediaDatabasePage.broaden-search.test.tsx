// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/contentAi", () => ({ apiBase: () => "", escapeHtml: (value: string) => value }));
vi.mock("../IntakeForm", () => ({ getProjectMediaCategories: () => [] }));

import { MediaDatabasePage } from "./MediaDatabasePage";

const drum = {
  type: "outlet", id: 230, authority: 85, matchedFields: ["publication"], matchedPhrases: ["Drum"], reasons: [],
  outlet: {
    id: 230, name: "The Drum", category: "AdTech & MarTech", website: "https://www.thedrum.com",
    description: "Marketing news", country: "UK", reachBand: "", accountId: null,
  },
};
const journalist = {
  type: "contact", id: 12, authority: 85, matchedFields: ["outlet"], matchedPhrases: ["Drum"], reasons: [],
  contact: {
    id: 12, outletId: 230, outletName: "The Drum", outletCategory: "AdTech & MarTech",
    firstName: "Jane", lastName: "Reporter", role: "Editor", email: "", phone: "", notes: "", accountId: null,
  },
};
const emptyResponse = () => new Response(JSON.stringify({ results: [], total: 0, counts: { contacts: 0, outlets: 0 } }));
function matchingResponse(type = "publications", total = 1) {
  return new Response(JSON.stringify({
    results: [type === "publications" ? drum : journalist], total,
    counts: { contacts: type === "contacts" ? total : 0, outlets: type === "publications" ? total : 0 },
  }));
}

let requests: URL[];
let searchHandler: (url: URL, init?: RequestInit) => Promise<Response>;

async function prepareSearch(type = "publications", scope = "all") {
  render(<MediaDatabasePage />);
  await screen.findByRole("option", { name: "Marketing & Advertising" });
  fireEvent.change(screen.getByLabelText("Search record type"), { target: { value: type } });
  fireEvent.change(screen.getByLabelText("Media collection scope"), { target: { value: scope } });
  fireEvent.change(screen.getByTestId("input-media-search"), { target: { value: "Drum" } });
  fireEvent.change(screen.getByLabelText("Sector filter"), { target: { value: "Marketing & Advertising" } });
  fireEvent.change(screen.getByLabelText("Region filter"), { target: { value: "UK" } });
  fireEvent.change(screen.getByPlaceholderText("e.g. fintech"), { target: { value: "marketing" } });
  fireEvent.change(screen.getByPlaceholderText("0-100"), { target: { value: "72" } });
}
const recoveryButton = () => screen.queryByRole("button", { name: "Search across all sectors" });

describe("Media Database all-sector recovery", () => {
  beforeEach(() => {
    requests = [];
    localStorage.setItem("aio.auth.session.v3", JSON.stringify({ username: "account-a", role: "agency", membershipRole: "owner" }));
    searchHandler = async (url) => url.searchParams.has("category")
      ? emptyResponse() : matchingResponse(url.searchParams.get("type")!);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://test.local");
      if (url.pathname.endsWith("/media-db/search")) {
        requests.push(url);
        expect(init?.credentials).toBe("include");
        return searchHandler(url, init);
      }
      if (url.pathname.endsWith("/media-categories")) {
        return new Response(JSON.stringify({ standard: ["Marketing & Advertising", "Energy"], custom: [] }));
      }
      if (url.pathname.endsWith("/media-db/bookmarks")) {
        return new Response(JSON.stringify({ bookmarks: [{ type: "publication", targetId: 230 }, { type: "contact", targetId: 12 }], total: 2 }));
      }
      return new Response(JSON.stringify({ error: "Unexpected request" }), { status: 404 });
    }));
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ["publications", "all"], ["publications", "added"], ["publications", "saved"],
    ["contacts", "all"], ["contacts", "added"], ["contacts", "saved"],
  ])("broadens %s within %s, removing only the sector and retaining bounded pagination", async (type, scope) => {
    await prepareSearch(type, scope);
    fireEvent.click(screen.getByTestId("button-search-media"));
    const button = await screen.findByRole("button", { name: "Search across all sectors" });
    expect(screen.queryByText(type === "publications" ? "The Drum" : "Jane Reporter")).toBeNull();
    expect(screen.getByText(/Remove only the sector filter/)).toBeTruthy();
    const original = Object.fromEntries(requests[0].searchParams);
    fireEvent.click(button);
    await screen.findByText(type === "publications" ? "The Drum" : scope === "saved" ? "Jane" : "Jane Reporter");
    expect(requests).toHaveLength(2);
    const { category, ...rest } = original;
    expect(category).toBe("Marketing & Advertising");
    expect(Object.fromEntries(requests[1].searchParams)).toEqual({ ...rest, page: "1", pageSize: "25" });
    expect((screen.getByLabelText("Sector filter") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Media collection scope") as HTMLSelectElement).value).toBe(scope);
    if (type === "publications" || scope === "saved") {
      expect(screen.getByText(/AdTech & MarTech/)).toBeTruthy();
    }
    expect(recoveryButton()).toBeNull();
  });

  it("uses the completed search even after unsubmitted form edits", async () => {
    await prepareSearch();
    fireEvent.click(screen.getByTestId("button-search-media"));
    await screen.findByRole("button", { name: "Search across all sectors" });
    const original = Object.fromEntries(requests[0].searchParams);
    fireEvent.change(screen.getByTestId("input-media-search"), { target: { value: "unsubmitted phrase" } });
    fireEvent.change(screen.getByLabelText("Sector filter"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Region filter"), { target: { value: "Global" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. fintech"), { target: { value: "unsubmitted topic" } });
    fireEvent.change(screen.getByPlaceholderText("0-100"), { target: { value: "99" } });
    expect(requests).toHaveLength(1);
    expect(recoveryButton()).toBeTruthy();
    fireEvent.click(recoveryButton()!);
    await screen.findByText("The Drum");
    const { category: _category, ...rest } = original;
    expect(Object.fromEntries(requests[1].searchParams)).toEqual(rest);
    expect((screen.getByTestId("input-media-search") as HTMLInputElement).value).toBe("Drum");
    expect((screen.getByLabelText("Region filter") as HTMLSelectElement).value).toBe("UK");
    expect((screen.getByPlaceholderText("e.g. fintech") as HTMLInputElement).value).toBe("marketing");
    expect((screen.getByPlaceholderText("0-100") as HTMLInputElement).value).toBe("72");
  });

  it("does not offer recovery for an unsubmitted sector or an empty bookmark list", async () => {
    searchHandler = async () => emptyResponse();
    await prepareSearch();
    fireEvent.change(screen.getByLabelText("Sector filter"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("button-search-media"));
    await screen.findByText("No matching publications");
    fireEvent.change(screen.getByLabelText("Sector filter"), { target: { value: "Marketing & Advertising" } });
    expect(recoveryButton()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "My Media Database" }));
    await screen.findByText("Your My Media Database is empty");
    expect(recoveryButton()).toBeNull();
  });

  it("does not offer recovery for matching results or an empty later page", async () => {
    searchHandler = async (url) => url.searchParams.get("page") === "2"
      ? new Response(JSON.stringify({ results: [], total: 26, counts: { contacts: 0, outlets: 26 } }))
      : matchingResponse("publications", 26);
    await prepareSearch();
    fireEvent.click(screen.getByTestId("button-search-media"));
    await screen.findByText("The Drum");
    expect(recoveryButton()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("No matching publications");
    expect(recoveryButton()).toBeNull();
  });

  it("hides recovery while loading and on a failed retry", async () => {
    await prepareSearch();
    fireEvent.click(screen.getByTestId("button-search-media"));
    await screen.findByRole("button", { name: "Search across all sectors" });
    let resolve!: (response: Response) => void;
    searchHandler = () => new Promise((done) => { resolve = done; });
    fireEvent.click(screen.getByTestId("button-search-media"));
    await screen.findByText("Searching...");
    expect(recoveryButton()).toBeNull();
    await act(async () => { resolve(new Response("failed", { status: 503 })); });
    await screen.findByText("Could not search the media database.");
    expect(recoveryButton()).toBeNull();
  });

  it("does not offer recovery after a timeout", async () => {
    await prepareSearch();
    searchHandler = (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId("button-search-media"));
    expect(recoveryButton()).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(screen.getByText("Search timed out. Try again.")).toBeTruthy();
    expect(recoveryButton()).toBeNull();
  });

  it("ignores an older response arriving after the broadened search", async () => {
    await prepareSearch();
    let resolveOld!: (response: Response) => void;
    let oldSignal: AbortSignal | null | undefined;
    const defaultHandler = searchHandler;
    searchHandler = (url, init) => requests.length === 1
      ? new Promise((done) => { resolveOld = done; oldSignal = init?.signal; })
      : defaultHandler(url, init);
    fireEvent.click(screen.getByTestId("button-search-media"));
    await waitFor(() => expect(requests).toHaveLength(1));
    fireEvent.click(screen.getByTestId("button-search-media"));
    fireEvent.click(await screen.findByRole("button", { name: "Search across all sectors" }));
    await screen.findByText("The Drum");
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => { resolveOld(emptyResponse()); });
    expect(screen.getByText("The Drum")).toBeTruthy();
    expect(recoveryButton()).toBeNull();
    expect(requests).toHaveLength(3);
  });
});