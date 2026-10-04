// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAiRuns } from "../lib/aiRunLifecycle";
import { buildMarketingIntelligencePdf, downloadReportBlob } from "../lib/marketingIntelligenceExport";

vi.mock("../lib/marketingIntelligenceExport", async importOriginal => {
  const actual = await importOriginal<typeof import("../lib/marketingIntelligenceExport")>();
  return { ...actual, buildMarketingIntelligencePdf: vi.fn(), downloadReportBlob: vi.fn() };
});

vi.mock("../lib/auth", () => ({ getSession: () => null }));

vi.mock("../IntakeForm", () => ({
  getActiveProjectId: () => "project-1",
  getKeyMessages: () => [],
  getProjectMediaCategories: () => ["Renewable Energy"],
}));

vi.mock("../lib/contentAi", () => ({
  apiBase: () => "",
  buildProjectDataText: () => "Renewable energy project",
  escapeHtml: (value: string) => value,
  safeHttpUrl: (value: string) => value,
  downloadWordDocument: vi.fn(),
}));

import { EVENT_SEARCH_CLIENT_TIMEOUT_MS, MarketingIntelligencePage } from "./MarketingIntelligencePage";

describe("MarketingIntelligencePage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(downloadReportBlob).mockClear();
    vi.mocked(buildMarketingIntelligencePdf).mockReset().mockResolvedValue({
      output: () => new Blob(["%PDF-1.4"], { type: "application/pdf" }),
    } as unknown as Awaited<ReturnType<typeof buildMarketingIntelligencePdf>>);
  });
  afterEach(() => {
    cleanup();
    clearAiRuns();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("sends the selected criteria and explains verified fields without exposing the prompt", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      return {
        ok: true,
        json: async () => ({
          events: [{
          rank: 1,
          name: "Future Energy Forum",
          url: "https://events.example/future-energy",
          category: "Renewable Energy",
          startDate: "2026-11-12",
          endDate: "2026-11-13",
          audience: "Energy leaders",
          titleDescription: "Industry forum",
          location: "London, United Kingdom",
          authority: 82,
          relevanceReason: "Strong category fit",
          opportunities: [{ type: "Conference entry", cost: "", deadline: "", actionable: false }],
          sourceCheckedAt: "2026-09-08T12:00:00.000Z",
          }],
        }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MarketingIntelligencePage />);
    expect(screen.getByText(/UK or North America\./)).toBeTruthy();
    expect(screen.queryByText(/more in V2/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /llm brief/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /search events/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Future Energy Forum/)).toBeTruthy();
    expect(screen.getByText(/AI relevance 82\/100/i)).toBeTruthy();
    expect(screen.getAllByText("Not published").length).toBeGreaterThanOrEqual(2);
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(requestBody).toMatchObject({
      marketingTypes: ["Trade Conferences"],
      categories: ["Renewable Energy"],
      period: "6m",
      region: "UK",
      projectId: "project-1",
    });
    expect(screen.queryByRole("button", { name: /Word|Excel/i })).toBeNull();
    // Changing selectors must not relabel the already completed research.
    fireEvent.click(screen.getByRole("button", { name: "Next 12 months" }));
    fireEvent.click(screen.getByRole("button", { name: "Download Report (PDF)" }));
    await waitFor(() => expect(downloadReportBlob).toHaveBeenCalledTimes(1));
    expect(buildMarketingIntelligencePdf).toHaveBeenCalledWith(expect.objectContaining({
      criteria: expect.objectContaining({ period: "6m", region: "UK" }),
      events: expect.arrayContaining([expect.objectContaining({ name: "Future Energy Forum" })]),
    }));
    expect(downloadReportBlob).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "application/pdf" }), expect.stringMatching(/\.pdf$/),
    );
    fireEvent.click(screen.getByRole("button", { name: "Download Report (CSV)" }));
    expect(downloadReportBlob).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "text/csv;charset=utf-8" }), expect.stringMatching(/\.csv$/),
    );
    vi.mocked(buildMarketingIntelligencePdf).mockRejectedValueOnce(new Error("PDF fonts could not be loaded."));
    fireEvent.click(screen.getByRole("button", { name: "Download Report (PDF)" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("PDF fonts could not be loaded.");
    expect(downloadReportBlob).toHaveBeenCalledTimes(2);
  });

  it("ends a stalled search even when fetch ignores abort, preserving selected criteria", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    render(<MarketingIntelligencePage />);
    fireEvent.click(screen.getByRole("button", { name: "Next 12 months" }));
    fireEvent.click(screen.getByRole("button", { name: /search events/i }));
    expect(screen.getByRole("status").textContent).toContain("Researching event pages");
    expect(screen.getAllByText("1:00").length).toBeGreaterThan(0);
    await act(async () => vi.advanceTimersByTimeAsync(61_000));
    expect(screen.getByText("Still working - the estimate has passed")).toBeTruthy();
    expect((screen.getByRole("button", { name: /searching/i }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(EVENT_SEARCH_CLIENT_TIMEOUT_MS - 61_000));
    expect(screen.getByText(/Event research took too long/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /search events/i }) as HTMLButtonElement).disabled).toBe(false);
    const options = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(options[1].signal?.aborted).toBe(true);
    expect(JSON.parse(String(options[1].body)).period).toBe("12m");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("shows server failures instead of leaving the search busy", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: "Event research took too long. Please try fewer categories or marketing types." }),
    })));
    render(<MarketingIntelligencePage />);
    fireEvent.click(screen.getByRole("button", { name: /search events/i }));
    expect(await screen.findByText(/Event research took too long/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /search events/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not disguise malformed results as an empty successful search", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    render(<MarketingIntelligencePage />);
    fireEvent.click(screen.getByRole("button", { name: /search events/i }));
    expect(await screen.findByText(/Event research returned an invalid response/)).toBeTruthy();
  });

  it("retains research across navigation without sending another paid request", async () => {
    vi.useFakeTimers();
    let resolve!: (response: Response) => void;
    const fetchMock = vi.fn((_url: string, _init: RequestInit) => new Promise<Response>((done) => { resolve = done; }));
    vi.stubGlobal("fetch", fetchMock);
    const page = render(<MarketingIntelligencePage />);
    fireEvent.click(screen.getByRole("button", { name: /search events/i }));
    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    page.unmount();
    expect(fetchMock.mock.calls[0][1].signal?.aborted).toBe(false);
    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    render(<MarketingIntelligencePage />);
    expect(screen.getByRole("status").textContent).toContain("Researching event pages");
    expect(screen.getAllByText("0:20").length).toBeGreaterThan(0);
    await act(async () => resolve({ ok: true, json: async () => ({ events: [] }) } as Response));
    expect((screen.getByRole("button", { name: /search events/i }) as HTMLButtonElement).disabled).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});