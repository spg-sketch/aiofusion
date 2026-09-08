// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/contentStore", () => ({
  useContentStore: () => undefined,
  loadArchive: () => [{
    id: "story-1",
    title: "New clean energy platform launches",
    contentType: "Press release",
    headline: "A better way to manage renewable power",
    bodyCopy: "The platform helps commercial energy teams manage renewable generation.",
  }],
}));

vi.mock("../IntakeForm", () => ({
  getActiveProjectId: () => "project-1",
  getKeyMessages: () => [{ long: "Clean energy teams can work faster" }],
  getProjectMediaCategories: () => ["Energy", "Technology"],
}));

vi.mock("../lib/contentAi", () => ({
  apiBase: () => "",
  escapeHtml: (value: string) => value,
}));

import { MediaResearchPage } from "./MediaResearchPage";

const candidate = {
  candidateKey: "candidate-1",
  firstName: "Jane",
  lastName: "Reporter",
  role: "Energy correspondent",
  email: "",
  outletName: "Energy Today",
  outletWebsite: "https://energy.example",
  sourceUrl: "https://energy.example/authors/jane-reporter",
  evidence: "The outlet profile identifies Jane as its energy correspondent.",
  beats: ["renewable energy"],
  confidence: "High",
  verifiedAt: "2026-09-08T12:00:00.000Z",
};

describe("MediaResearchPage live discovery", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/recommendations/decisions")) {
        return new Response(JSON.stringify({ decisions: [], items: [] }), { status: 200 });
      }
      if (url.includes("/content/media-discover")) {
        const body = JSON.parse(String(init?.body));
        expect(body.projectId).toBe("project-1");
        expect(body.content.title).toBe("New clean energy platform launches");
        expect(body.query).toBe("London reporters");
        expect(body.regions).toEqual(["UK", "US"]);
        expect(body.sectorTopic).toBe("Renewable energy");
        return new Response(JSON.stringify({ ok: true, items: [candidate], discoveryToken: "signed-token" }), { status: 200 });
      }
      if (url.includes("/store/media-db/discoveries")) {
        const body = JSON.parse(String(init?.body));
        expect(body).toEqual({ candidateKey: "candidate-1", discoveryToken: "signed-token" });
        return new Response(JSON.stringify({ ok: true, existing: false, contact: { id: 10 } }), { status: 201 });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows grounded live results and saves a selected contact to the Media Database", async () => {
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    fireEvent.change(screen.getByPlaceholderText(/tech reporters in London/i), { target: { value: "London reporters" } });
    fireEvent.change(screen.getByPlaceholderText(/cleantech/i), { target: { value: "Renewable energy" } });
    fireEvent.click(screen.getByRole("button", { name: "US" }));
    fireEvent.click(screen.getByTestId("button-discover-live"));

    expect(await screen.findByText("Jane Reporter")).toBeTruthy();
    expect(screen.getByText(candidate.evidence)).toBeTruthy();
    expect(screen.getByRole("link", { name: /view cited source/i })).toHaveAttribute("href", candidate.sourceUrl);

    fireEvent.click(screen.getByRole("button", { name: /save to media database/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /saved to media database/i })).toBeDisabled());
  });

  it("explains that live email addresses must come from the cited public source", () => {
    render(<MediaResearchPage />);
    expect(screen.getByText(/sends the selected article excerpt.*to OpenAI/i)).toBeTruthy();
  });
});