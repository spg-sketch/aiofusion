// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

import { MarketingIntelligencePage } from "./MarketingIntelligencePage";

describe("MarketingIntelligencePage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
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
  });
});