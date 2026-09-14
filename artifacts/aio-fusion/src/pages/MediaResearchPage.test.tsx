// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const intakeState = vi.hoisted(() => ({
  data: {
    formData: { "4.4": "Clean energy" },
    duals: {},
    dualLists: {},
    stringLists: {},
  } as Record<string, unknown> | null,
}));
const decisionState = vi.hoisted(() => ({
  payload: { decisions: [] as Record<string, unknown>[], items: [] as Record<string, unknown>[], decisionContacts: [] as Record<string, unknown>[] },
}));
const recommendationState = vi.hoisted(() => ({ includeContact: true }));
const delayedDecision = vi.hoisted(() => ({
  pending: false,
  resolve: null as null | (() => void),
}));
const delayedDecisionGets = vi.hoisted(() => ({
  pending: false,
  calls: 0,
  resolves: [] as (() => void)[],
}));
const delayedRequests = vi.hoisted(() => ({
  recommendations: false,
  live: false,
  recommendationCalls: [] as { storyKey: string; resolve: (response: Response) => void }[],
  liveCalls: [] as { storyKey: string; resolve: (response: Response) => void }[],
}));

vi.mock("../lib/contentStore", () => ({
  useContentStore: () => undefined,
  loadArchive: () => [{
    id: "story-1",
    title: "New clean energy platform launches",
    contentType: "Press release",
    headline: "A better way to manage renewable power",
    bodyCopy: "The platform helps commercial energy teams manage renewable generation.",
    targetPhrases: [storyOnePhrase],
  }, {
    id: "story-2",
    title: "New retail energy briefing published",
    contentType: "Article",
    headline: "Retailers cut emissions with cleaner power",
    bodyCopy: "Retail energy teams are changing how they source cleaner power.",
    targetPhrases: [storyTwoPhrase],
  }],
}));

vi.mock("../IntakeForm", () => ({
  getActiveProjectId: () => "project-1",
  getKeyMessages: () => [{ long: "Clean energy teams can work faster" }],
  getProjectMediaCategories: () => ["Energy", "Technology"],
  loadIntakeData: () => intakeState.data,
}));

vi.mock("../lib/contentAi", () => ({
  apiBase: () => "",
  escapeHtml: (value: string) => value,
}));

import { MediaResearchPage, resolveArticleTargetPhrases } from "./MediaResearchPage";
import { exactTargetPhraseId } from "../lib/exactTargetPhrases";

const storyOnePhrase = {
  id: exactTargetPhraseId("discovery", "clean energy platform"),
  text: "clean energy platform",
  intentGroup: "discovery" as const,
};
const storyTwoPhrase = {
  id: exactTargetPhraseId("shortlist", "retail energy briefing"),
  text: "retail energy briefing",
  intentGroup: "shortlist" as const,
};

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
  it("keeps explicit empty phrase snapshots empty while legacy articles inherit project phrases", () => {
    expect(resolveArticleTargetPhrases({ targetPhrases: [], targetPhraseIds: [] }, [storyOnePhrase])).toEqual([]);
    expect(resolveArticleTargetPhrases({}, [storyOnePhrase])).toEqual([storyOnePhrase]);
  });

  let requests: { url: string; body?: Record<string, unknown> }[] = [];
  beforeEach(() => {
    requests = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
      requests.push({ url, body });
      if (url.includes("/recommendations/decisions")) {
        if (init?.method === "PUT") {
          if (delayedDecision.pending) {
            return new Promise<Response>((resolve) => {
              delayedDecision.resolve = () => resolve(new Response(JSON.stringify({ ok: true, decision: { contactId: 91, decision: "shortlisted", note: "" } }), { status: 200 }));
            });
          }
          return new Response(JSON.stringify({ ok: true, decision: { contactId: 91, decision: "shortlisted", note: "" } }), { status: 200 });
        }
        if (delayedDecisionGets.pending) {
          delayedDecisionGets.calls += 1;
          return new Promise<Response>((resolve) => {
            delayedDecisionGets.resolves.push(() => resolve(new Response(JSON.stringify(decisionState.payload), { status: 200 })));
          });
        }
        return new Response(JSON.stringify(decisionState.payload), { status: 200 });
      }
      if (url.endsWith("/store/media-db/recommendations")) {
        const recommendationMarker = delayedRequests.recommendations
          ? `${String(body?.storyKey || "unknown")}-response-${delayedRequests.recommendationCalls.length + 1}`
          : "Decision";
        const recommendationResponse = new Response(JSON.stringify({
          ok: true,
          items: recommendationState.includeContact && body?.storyKey === "story-1" ? [{
            rank: 1,
            score: 80,
            reasons: ["Coverage profile matches energy"],
            phraseAttributions: [{
              phraseId: storyOnePhrase.id,
              phraseText: storyOnePhrase.text,
              matchKind: "exact" as const,
              exactPhraseMatch: "Role and beat profile directly match the phrase.",
              articleFit: "The contact covers the article's clean-energy angle.",
              publicationAuthorityContext: "Stored authority: specialist energy outlet.",
              suggestedPlacementAngle: "Offer the contact a practical operator perspective.",
            }, {
              phraseId: `${storyOnePhrase.id}-topic`,
              phraseText: "energy platform",
              matchKind: "topic" as const,
              exactPhraseMatch: "No full exact phrase match. Recorded topic overlap supports this related subject.",
              articleFit: "The contact covers the article's clean-energy angle.",
              publicationAuthorityContext: "Stored authority: specialist energy outlet.",
              suggestedPlacementAngle: "Offer the contact a practical operator perspective.",
            }],
            contact: {
              id: 91,
              firstName: recommendationMarker,
              lastName: "Contact",
              role: "Energy editor",
              email: "",
              phone: "",
              notes: "",
              beats: ["energy"],
              sectors: ["Energy"],
              outletName: "Current Energy Daily",
              outletCategory: "Energy",
            },
          }] : [],
        }), { status: 200 });
        if (delayedRequests.recommendations) {
          return new Promise<Response>((resolve) => {
            delayedRequests.recommendationCalls.push({ storyKey: String(body?.storyKey || ""), resolve });
          });
        }
        return recommendationResponse;
      }
      if (url.includes("/content/media-discover")) {
        const liveMarker = delayedRequests.live
          ? `${String(body?.storyKey || "unknown")}-live-${delayedRequests.liveCalls.length + 1}`
          : candidate.firstName;
        const liveResponse = new Response(JSON.stringify({
          ok: true,
          items: [{ ...candidate, firstName: liveMarker }],
          discoveryToken: "signed-token",
        }), { status: 200 });
        if (delayedRequests.live) {
          return new Promise<Response>((resolve) => {
            delayedRequests.liveCalls.push({ storyKey: String(body?.storyKey || ""), resolve });
          });
        }
        return liveResponse;
      }
      if (url.includes("/store/media-db/discoveries")) {
        return new Response(JSON.stringify({ ok: true, existing: false, contact: { id: 10 } }), { status: 201 });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    }));
  });

  afterEach(() => {
    intakeState.data = {
      formData: { "4.4": "Clean energy" },
      duals: {},
      dualLists: {},
      stringLists: {},
    };
    decisionState.payload = { decisions: [], items: [], decisionContacts: [] };
    recommendationState.includeContact = true;
    delayedDecision.pending = false;
    delayedDecision.resolve = null;
    delayedDecisionGets.pending = false;
    delayedDecisionGets.calls = 0;
    delayedDecisionGets.resolves = [];
    delayedRequests.recommendations = false;
    delayedRequests.live = false;
    delayedRequests.recommendationCalls = [];
    delayedRequests.liveCalls = [];
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
    expect(screen.getByText("Phrase fit and recorded topic overlap")).toBeTruthy();
    expect(screen.getByText("Recorded topic/keyword overlap:")).toBeTruthy();
    const recommendationRequests = requests.filter((request) => request.url.endsWith("/store/media-db/recommendations"));
    expect(recommendationRequests).toHaveLength(1);
    expect(recommendationRequests[0].body).toMatchObject({ projectId: "project-1", storyKey: "story-1" });
    expect(recommendationRequests[0].body?.terms).toEqual(expect.arrayContaining(["clean", "energy", "platform", "launches"]));
    expect(recommendationRequests[0].body?.targetPhrases).toEqual([storyOnePhrase]);
    const liveRequest = requests.find((request) => request.url.includes("/content/media-discover"));
    expect(liveRequest?.body).toMatchObject({
      projectId: "project-1",
      query: "London reporters",
      regions: ["US"],
      sectorTopic: "Renewable energy",
      targetPhrases: [storyOnePhrase],
    });
    expect((liveRequest?.body?.content as Record<string, unknown>).title).toBe("New clean energy platform launches");
    expect(screen.getByText(candidate.evidence)).toBeTruthy();
    expect(screen.getByRole("link", { name: /view cited source/i })).toHaveAttribute("href", candidate.sourceUrl);

    fireEvent.click(screen.getByRole("button", { name: /save to media database/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /saved to media database/i })).toBeDisabled());
  });

  it("explains that live email addresses must come from the cited public source", () => {
    render(<MediaResearchPage />);
    expect(screen.getByText(/sends the selected article excerpt.*to OpenAI/i)).toBeTruthy();
  });

  it("runs one automatic database recommendation under StrictMode and never runs external search automatically", async () => {
    render(<StrictMode><MediaResearchPage /></StrictMode>);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    await waitFor(() => expect(requests.filter((request) => request.url.endsWith("/store/media-db/recommendations"))).toHaveLength(1));
    expect(requests.some((request) => request.url.includes("/content/media-discover"))).toBe(false);
    expect(screen.getByRole("button", { name: "Global" }).className).toContain("bg-slate-800");
  });

  it("infers an unambiguous UK or US default from canonical intake locations", async () => {
    intakeState.data = { formData: { "4.5": "Manchester and Leeds, UK" }, duals: {}, dualLists: {}, stringLists: {} };
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "UK" }).className).toContain("bg-slate-800"));

    cleanup();
    intakeState.data = { formData: { "4.5": "Texas and Chicago, USA" }, duals: {}, dualLists: {}, stringLists: {} };
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "US" }).className).toContain("bg-slate-800"));
  });

  it("keeps a persisted shortlisted contact in Accepted shortlist when newest recommendations omit it", async () => {
    recommendationState.includeContact = false;
    const acceptedContact = {
      id: 91,
      firstName: "Persisted",
      lastName: "Shortlist",
      role: "Energy editor",
      email: "",
      phone: "",
      notes: "",
      beats: ["renewable energy"],
      sectors: ["Energy"],
      outletName: "Older Energy Weekly",
      outletCategory: "Energy",
      outletCountry: "UK",
      outletWebsite: "https://older.example",
    };
    decisionState.payload = {
      decisions: [{ contactId: 91, decision: "shortlisted", note: "Keep this contact" }],
      items: [],
      decisionContacts: [{ contactId: 91, contact: acceptedContact }],
    };
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    expect(await screen.findByText("Persisted Shortlist")).toBeTruthy();
    expect(screen.getByText("Older Energy Weekly")).toBeTruthy();
    expect(screen.queryByText("Recommended from your Media Database")).toBeNull();
  });

  it("does not apply an old decision-save response after switching articles", async () => {
    delayedDecision.pending = true;
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    expect(await screen.findByText("Decision Contact")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-accept-91"));
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-2" } });
    await waitFor(() => expect(screen.getByText("New retail energy briefing published")).toBeTruthy());
    delayedDecision.resolve?.();
    await waitFor(() => expect(screen.queryByText("Decision Contact")).toBeNull());
  });

  it("does not let a pre-save decision GET replace the successful shortlist", async () => {
    delayedDecisionGets.pending = true;
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    await waitFor(() => expect(delayedDecisionGets.calls).toBeGreaterThan(0));
    expect(await screen.findByText("Decision Contact")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-accept-91"));
    await waitFor(() => expect(screen.getAllByText("Decision Contact")).toHaveLength(2));

    delayedDecisionGets.resolves.forEach((resolve) => resolve());
    await waitFor(() => expect(screen.getAllByText("Decision Contact")).toHaveLength(2));
  });

  it("ignores delayed A-to-B-to-A database responses by invocation identity", async () => {
    delayedRequests.recommendations = true;
    render(<MediaResearchPage />);
    const selector = screen.getByTestId("select-research-article");
    fireEvent.change(selector, { target: { value: "story-1" } });
    await waitFor(() => expect(delayedRequests.recommendationCalls).toHaveLength(1));
    fireEvent.change(selector, { target: { value: "story-2" } });
    await waitFor(() => expect(delayedRequests.recommendationCalls).toHaveLength(2));
    fireEvent.change(selector, { target: { value: "story-1" } });
    await waitFor(() => expect(delayedRequests.recommendationCalls).toHaveLength(3));

    const result = (name: string) => new Response(JSON.stringify({
      ok: true,
      items: [{ rank: 1, score: 80, reasons: [], contact: { id: 91, firstName: name, lastName: "Contact", role: "Editor", beats: [], sectors: [] } }],
    }), { status: 200 });
    delayedRequests.recommendationCalls[2].resolve(result("story-1-response-3"));
    delayedRequests.recommendationCalls[0].resolve(result("story-1-response-1"));
    delayedRequests.recommendationCalls[1].resolve(result("story-2-response-2"));

    expect(await screen.findByText("story-1-response-3 Contact")).toBeTruthy();
    expect(screen.queryByText("story-1-response-1 Contact")).toBeNull();
    expect(screen.queryByText("story-2-response-2 Contact")).toBeNull();
  });

  it("ignores delayed A-to-B-to-A live responses by invocation identity", async () => {
    delayedRequests.live = true;
    render(<MediaResearchPage />);
    const selector = screen.getByTestId("select-research-article");
    fireEvent.change(selector, { target: { value: "story-1" } });
    await waitFor(() => expect(screen.getByTestId("button-discover-live")).toBeTruthy());
    fireEvent.click(screen.getByTestId("button-discover-live"));
    await waitFor(() => expect(delayedRequests.liveCalls).toHaveLength(1));
    fireEvent.change(selector, { target: { value: "story-2" } });
    await waitFor(() => expect(screen.getByTestId("button-discover-live")).toBeTruthy());
    fireEvent.click(screen.getByTestId("button-discover-live"));
    await waitFor(() => expect(delayedRequests.liveCalls).toHaveLength(2));
    fireEvent.change(selector, { target: { value: "story-1" } });
    await waitFor(() => expect(screen.getByTestId("button-discover-live")).toBeTruthy());
    fireEvent.click(screen.getByTestId("button-discover-live"));
    await waitFor(() => expect(delayedRequests.liveCalls).toHaveLength(3));

    const result = (name: string) => new Response(JSON.stringify({
      ok: true,
      items: [{ ...candidate, firstName: name }],
      discoveryToken: "signed-token",
    }), { status: 200 });
    delayedRequests.liveCalls[2].resolve(result("story-1-live-3"));
    delayedRequests.liveCalls[0].resolve(result("story-1-live-1"));
    delayedRequests.liveCalls[1].resolve(result("story-2-live-2"));

    expect(await screen.findByText("story-1-live-3 Reporter")).toBeTruthy();
    expect(screen.queryByText("story-1-live-1 Reporter")).toBeNull();
    expect(screen.queryByText("story-2-live-2 Reporter")).toBeNull();
  });

  it("preserves edited criteria across unrelated rerenders and regenerates them for a new article", async () => {
    const view = render(<MediaResearchPage />);
    const selector = screen.getByTestId("select-research-article");
    fireEvent.change(selector, { target: { value: "story-1" } });
    const query = (await screen.findAllByDisplayValue(/New clean energy platform launches/))
      .find((element) => element.tagName === "INPUT") as HTMLInputElement;
    fireEvent.change(query, { target: { value: "My carefully edited query" } });
    view.rerender(<MediaResearchPage />);
    expect(screen.getByDisplayValue("My carefully edited query")).toBeTruthy();

    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-2" } });
    await waitFor(() => expect(screen.getAllByDisplayValue(/New retail energy briefing published/).some((element) => element.tagName === "INPUT")).toBe(true));
    expect(screen.queryByDisplayValue("My carefully edited query")).toBeNull();
  });

  it("refreshes structured phrase attribution inputs when switching articles", async () => {
    delayedRequests.recommendations = true;
    render(<MediaResearchPage />);
    const selector = screen.getByTestId("select-research-article");
    fireEvent.change(selector, { target: { value: "story-1" } });
    await waitFor(() => expect(delayedRequests.recommendationCalls).toHaveLength(1));
    expect(delayedRequests.recommendationCalls[0].storyKey).toBe("story-1");
    const firstBody = requests.find((request) => request.url.endsWith("/store/media-db/recommendations") && request.body?.storyKey === "story-1")?.body;
    expect(firstBody?.targetPhrases).toEqual([storyOnePhrase]);

    fireEvent.change(selector, { target: { value: "story-2" } });
    await waitFor(() => expect(delayedRequests.recommendationCalls).toHaveLength(2));
    const secondBody = requests.find((request) => request.url.endsWith("/store/media-db/recommendations") && request.body?.storyKey === "story-2")?.body;
    expect(secondBody?.targetPhrases).toEqual([storyTwoPhrase]);
    expect(secondBody?.targetPhrases).not.toEqual(firstBody?.targetPhrases);

    await act(async () => {
      delayedRequests.recommendationCalls.forEach(({ resolve }) => resolve(new Response(JSON.stringify({ ok: true, items: [] }), { status: 200 })));
    });
  });
});

describe("MediaResearchPage recommendation refinement", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

  it("reranks after feedback, supports undo and reset, and keeps shortlist state", async () => {
    let signal: "more" | "less" | null = null;
    const contact = { id: 10, outletId: 1, firstName: "Jane", lastName: "Reporter", role: "Energy correspondent", email: "", phone: "", notes: "", accountId: null, beats: ["energy"], sectors: ["technology"] };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/recommendations/feedback") && init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        expect(body).toEqual({ projectId: "project-1", storyKey: "story-1", contactId: 10, signal: "more" });
        signal = body.signal;
        return new Response(JSON.stringify({ ok: true }));
      }
      if (url.includes("/recommendations/feedback") && init?.method === "DELETE") {
        signal = null;
        return new Response(JSON.stringify({ ok: true }));
      }
      if (url.endsWith("/store/media-db/recommendations") && init?.method === "POST") {
        return new Response(JSON.stringify({
          ok: true,
          items: [{ rank: 1, score: signal ? 88 : 70, reasons: signal ? ["Marked More like this"] : ["Coverage profile matches energy"], contact }],
        }));
      }
      if (url.includes("/recommendations/decisions")) return new Response(JSON.stringify({
        decisions: [{ contactId: 10, decision: "shortlisted", note: "Keep note" }],
        decisionContacts: [{ contactId: 10, contact }],
        feedback: signal ? [{ contactId: 10, signal }] : [],
        items: [{ rank: 1, score: signal ? 88 : 70, reasons: signal ? ["Marked More like this"] : ["Coverage profile matches energy"], contact }],
      }));
      return new Response("{}", { status: 404 });
    }));
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    expect((await screen.findAllByText("Jane Reporter")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "Less like this" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "More like this" }));
    expect((await screen.findAllByText("Marked More like this")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "Undo More like this" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset refinement" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Reset refinement" })).toBeNull());
  });
});