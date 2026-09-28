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
const projectState = vi.hoisted(() => ({ id: "project-1" }));
const decisionState = vi.hoisted(() => ({
  payload: { decisions: [] as Record<string, unknown>[], items: [] as Record<string, unknown>[], decisionContacts: [] as Record<string, unknown>[] },
}));
const recommendationState = vi.hoisted(() => ({ includeContact: true, brief: null as Record<string, unknown> | null }));
const featureState = vi.hoisted(() => ({
  briefFailure: false,
  recommendationGetFailure: false,
  restricted: false,
  enrich: false,
}));
const delayedRequests = vi.hoisted(() => ({
  recommendations: false,
  live: false,
  recommendationCalls: [] as { storyKey: string; resolve: (response: Response) => void }[],
  liveCalls: [] as { storyKey: string; resolve: (response: Response) => void }[],
}));
const decisionLoadFailure = vi.hoisted(() => ({ kind: "" as "" | "network" | "json" }));

vi.mock("../lib/contentStore", () => ({
  useContentStore: () => 1,
  isContentStoreReady: () => true,
  loadArchive: () => [{
    id: "story-1",
    projectId: "project-1",
    title: "New clean energy platform launches",
    contentType: "Press release",
    headline: "A better way to manage renewable power",
    bodyCopy: "The platform helps commercial energy teams manage renewable generation.",
    targetPhrases: [storyOnePhrase],
  }, {
    id: "story-2",
    projectId: "project-1",
    title: "New retail energy briefing published",
    contentType: "Article",
    headline: "Retailers cut emissions with cleaner power",
    bodyCopy: "Retail energy teams are changing how they source cleaner power.",
    targetPhrases: [storyTwoPhrase],
  }].filter((item) => item.projectId === projectState.id),
}));

vi.mock("../IntakeForm", () => ({
  getActiveProjectId: () => projectState.id,
  getKeyMessages: () => [{ long: "Clean energy teams can work faster" }],
  getProjectMediaCategories: () => ["Energy", "Technology"],
  loadIntakeData: () => intakeState.data,
}));

vi.mock("../lib/contentAi", () => ({
  apiBase: () => "",
  escapeHtml: (value: string) => value,
}));

import { MediaResearchPage, orderRecommendations, resolveArticleResearchContext, resolveArticleTargetPhrases, SHORTLIST_EXPORT_COLUMNS, sanitizeSpreadsheetCell as sanitizeResearchSpreadsheetCell, shortlistExportRow } from "./MediaResearchPage";
import { RecommendationCard } from "./JournalistComponents";
import { exactTargetPhraseId } from "../lib/exactTargetPhrases";
import { clearAiRuns } from "../lib/aiRunLifecycle";

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
  email: "jane@energy.example",
  outletName: "Energy Today",
  outletWebsite: "https://energy.example",
  sourceUrl: "https://energy.example/authors/jane-reporter",
  evidence: "The outlet profile identifies Jane as its energy correspondent.",
  beats: ["renewable energy"],
  journalistInterests: ["Renewable power", "Energy technology"],
  mediaOpportunities: [{
    title: "Operator perspective",
    angle: "Offer a practical view of how commercial teams manage renewable generation.",
    rationale: "Grounded in the demonstrated energy beat.",
  }],
  recentBylines: [{
    title: "How renewable teams manage power",
    url: "https://energy.example/bylines/renewable-power",
    date: "2026-08-01",
  }],
  confidence: "High",
  verifiedAt: "2026-09-08T12:00:00.000Z",
};

describe("MediaResearchPage live discovery", () => {
  it("uses explicit article categories and messages, including an intentional empty selection", () => {
    expect(resolveArticleResearchContext({
      mediaCats: ["Green energy", "Renewable Energy", "Environmental Technology"],
      selectedMessages: ["The article's stored message"],
    }, ["Project category"], ["Project message"])).toEqual({
      categories: ["Green energy", "Renewable Energy", "Environmental Technology"],
      messages: ["The article's stored message"],
    });
    expect(resolveArticleResearchContext({ mediaCats: [], selectedMessages: [] }, ["Project category"], ["Project message"])).toEqual({
      categories: [],
      messages: [],
    });
  });

  it("falls back to project categories and messages for legacy articles without snapshots", () => {
    expect(resolveArticleResearchContext({}, ["Project category"], ["Project message"])).toEqual({
      categories: ["Project category"],
      messages: ["Project message"],
    });
  });

  it("keeps explicit empty phrase snapshots empty while legacy articles inherit project phrases", () => {
    expect(resolveArticleTargetPhrases({ targetPhrases: [], targetPhraseIds: [] }, [storyOnePhrase])).toEqual([]);
    expect(resolveArticleTargetPhrases({}, [storyOnePhrase])).toEqual([storyOnePhrase]);
  });

  it("keeps shortlist exports rich and spreadsheet-safe", () => {
    const contact = {
      id: 91, outletId: 4, firstName: "Jane", lastName: "Reporter", role: "Energy editor",
      email: "=unsafe@example.com", phone: "+447700900000", mobile: "", notes: "Review + follow-up",
      accountId: "workspace-a", outletName: "Energy Today", outletCategory: "Energy", outletCountry: "UK",
      publicationReach: "1M-5M", beats: ["energy"], sectors: ["Environment"], geography: "UK",
      language: "English", seniority: "Senior", editorialStatus: "Active",
      linkedinUrl: "https://linkedin.example/jane", sourceUrl: "https://energy.example/jane",
      sourceRef: "Contacts:2", publicationAuthority: 82, journalistAuthority: 91,
      confidence: "High", lastVerifiedAt: "2026-09-08T12:00:00.000Z", sourceStatus: "current",
      lifecycleStatus: "active", reviewNotes: "Check current remit",
    } as never;
    const row = shortlistExportRow(contact);
    expect(SHORTLIST_EXPORT_COLUMNS).toEqual(expect.arrayContaining(["Sectors", "Source Reference", "Confidence", "Lifecycle Status"]));
    expect(row).toEqual(expect.arrayContaining(["Environment", "Contacts:2", "High", "active"]));
    expect(sanitizeResearchSpreadsheetCell("=HYPERLINK(\"https://bad.example\")")).toBe("'=HYPERLINK(\"https://bad.example\")");
  });

  let requests: { url: string; method?: string; body?: Record<string, unknown> }[] = [];
  beforeEach(() => {
    requests = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
      requests.push({ url, method: init?.method, body });
      if (url.split("?")[0].endsWith("/store/media-db/bookmarks") && !init?.method) {
        return new Response(JSON.stringify({ bookmarks: [] }), { status: 200 });
      }
      if (url.endsWith("/store/media-db/categories")) {
        return new Response(JSON.stringify({ categories: ["Energy", "Technology", "Finance"] }), { status: 200 });
      }
      if (url.includes("/store/media-db/bookmarks/contact/") && ["PUT", "DELETE"].includes(init?.method || "")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.includes("/recommendations/decisions") && init?.method === "PUT") {
        const savedDecision = {
          contactId: Number(body?.contactId),
          decision: body?.decision,
          note: typeof body?.note === "string" ? body.note : "",
        };
        decisionState.payload = {
          decisions: [savedDecision],
          items: [],
          decisionContacts: [{
            contactId: savedDecision.contactId,
            contact: {
              id: savedDecision.contactId, firstName: "Decision", lastName: "Contact", role: "Energy editor",
              email: "", phone: "", notes: "", beats: ["energy"], sectors: ["Energy"],
              outletName: "Current Energy Daily", outletCategory: "Energy",
            },
          }],
        };
        return new Response(JSON.stringify({ ok: true, decision: savedDecision }), { status: 200 });
      }
      if (url.includes("/recommendations/decisions")) {
        if (decisionLoadFailure.kind === "network") throw new Error("Decision service unavailable");
        if (decisionLoadFailure.kind === "json") return new Response("not json", { status: 200 });
        return new Response(JSON.stringify(decisionState.payload), { status: 200 });
      }
      if (url.includes("/brief")) {
        if (init?.method === "PUT") return new Response(JSON.stringify({ brief: JSON.parse(init.body as string).brief }), { status: 200 });
        if (featureState.briefFailure) return new Response(JSON.stringify({ error: "Brief store unavailable" }), { status: 503 });
        return new Response(JSON.stringify({ brief: recommendationState.brief }), { status: 200 });
      }
      if (url.includes("/store/media-db/recommendations?")) {
        if (featureState.recommendationGetFailure) return new Response(JSON.stringify({ error: "Saved set unavailable" }), { status: 503 });
        const queryStoryKey = new URL(url, "http://test.local").searchParams.get("storyKey");
        const savedContact = {
          id: 91, firstName: "Decision", lastName: "Contact", role: "Energy editor",
          email: "", phone: "", notes: "", beats: ["energy"], sectors: ["Energy"],
          outletName: "Current Energy Daily", outletCategory: "Energy",
        };
        return new Response(JSON.stringify({
          ok: true,
          recommendationSet: { id: "saved-set-1" },
          items: recommendationState.includeContact && queryStoryKey === "story-1"
            ? [{
              rank: 1, score: 80, reasons: ["Coverage profile matches energy"], contact: savedContact,
              restricted: featureState.restricted,
              assessment: featureState.restricted ? {
                version: "editorial-v1", fitScore: 80, confidence: "medium", evidenceCoverage: 30,
                factors: [], readiness: { status: "blocked", reasons: ["Contact or outlet is suppressed / do-not-contact."] },
                evidence: [], warnings: [], suggestedAngle: null,
              } : undefined,
            }]
            : [],
          brief: recommendationState.brief,
          evaluation: { evaluated: recommendationState.includeContact ? 1 : 0, shortlisted: 0, contacted: 0, responded: 0, placed: 0 },
        }), { status: 200 });
      }
      if (url.includes("/recommendations/contact-restriction") && init?.method === "POST") {
        featureState.restricted = Boolean((JSON.parse(String(init.body)) as Record<string, unknown>).doNotContact);
        return new Response(JSON.stringify({ ok: true, doNotContact: featureState.restricted }), { status: 200 });
      }
      if (url.includes("/recommendations/enrich") && init?.method === "POST") {
        featureState.enrich = true;
        return new Response(JSON.stringify({
          ok: true,
          recommendationSet: { id: "saved-set-1" },
          items: [{
            rank: 1, score: 84, reasons: ["Coverage profile matches energy"], contact: {
              id: 91, firstName: "Enriched", lastName: "Contact", role: "Energy editor",
              email: "", phone: "", notes: "", beats: ["energy"], sectors: ["Energy"],
              outletName: "Current Energy Daily", outletCategory: "Energy",
            },
            assessment: {
              version: "editorial-v1", fitScore: 84, confidence: "high", evidenceCoverage: 100,
              factors: [], readiness: { status: "ready", reasons: [] },
              evidence: [{ title: "Recent energy coverage", url: "https://energy.example/recent", publishedAt: "2026-08-01", checkedAt: "2026-09-01", excerpt: "Energy transition", attribution: "page_checked", authorMatched: true }],
              warnings: [], suggestedAngle: null,
            },
          }],
          brief: recommendationState.brief,
          evaluation: { evaluated: 1, shortlisted: 0, contacted: 0, responded: 0, placed: 0 },
        }), { status: 200 });
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
          items: [{ ...candidate, firstName: liveMarker, phraseAttributions: [{
            phraseId: storyOnePhrase.id,
            phraseText: storyOnePhrase.text,
            matchKind: "topic",
            exactPhraseMatch: "Recorded topic overlap supports this related subject.",
            articleFit: "The public byline matches the selected article.",
            publicationAuthorityContext: "Cited public source.",
            suggestedPlacementAngle: "Offer a practical operator perspective.",
          }] }],
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
        return new Response(JSON.stringify({ ok: true, discovery: { id: 10, status: "pending" } }), { status: 201 });
      }
      if (url.includes("/store/media-db/outreach?")) return new Response(JSON.stringify({ outreach: [] }), { status: 200 });
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
    recommendationState.brief = null;
    featureState.briefFailure = false;
    featureState.recommendationGetFailure = false;
    featureState.restricted = false;
    featureState.enrich = false;
    delayedRequests.recommendations = false;
    delayedRequests.live = false;
    delayedRequests.recommendationCalls = [];
    delayedRequests.liveCalls = [];
    decisionLoadFailure.kind = "";
    projectState.id = "project-1";
    sessionStorage.clear();
    localStorage.removeItem("aio.research.preload");
    localStorage.removeItem("aio.auth.session.v3");
    clearAiRuns();
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows grounded live results and saves a selected contact to the Media Database", async () => {
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    
    // Wait for the brief to load and fields to appear
    await waitFor(() => expect(screen.getAllByDisplayValue("Clean energy").length).toBeGreaterThan(0));
    
    // Use the region button and discover live button
    await waitFor(() => expect(screen.getByRole("button", { name: "US" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "US" }));
    
     fireEvent.click(screen.getByTestId("button-recommend-contacts"));
     await waitFor(() => expect(requests.filter((request) => request.url.endsWith("/store/media-db/recommendations")).length).toBe(1));
     const discoverButton = screen.getByRole("button", { name: "Expand with live search" });
     fireEvent.click(discoverButton);

    expect(await screen.findByText("Jane Reporter")).toBeTruthy();
    expect(screen.getByText("Phrase fit and recorded topic overlap")).toBeTruthy();
     expect(screen.getAllByText("Recorded topic/keyword overlap:").length).toBeGreaterThan(0);
    const recommendationRequests = requests.filter((request) => request.url.endsWith("/store/media-db/recommendations"));
    expect(recommendationRequests).toHaveLength(1);
    expect(recommendationRequests[0].body).toMatchObject({ projectId: "project-1", storyKey: "story-1" });
    expect(recommendationRequests[0].body?.terms).toEqual(expect.arrayContaining(["clean", "energy", "platform", "launches"]));
    expect(recommendationRequests[0].body?.targetPhrases).toEqual([storyOnePhrase]);
    const liveRequest = requests.find((request) => request.url.includes("/content/media-discover"));
    expect(liveRequest?.body).toMatchObject({
      projectId: "project-1",
       query: expect.stringContaining("Journalists and editors covering"),
      regions: ["US"],
       sectorTopic: "Clean energy",
      targetPhrases: [storyOnePhrase],
    });
    expect((liveRequest?.body?.content as Record<string, unknown>).title).toBe("New clean energy platform launches");
    expect(screen.getByText(candidate.evidence)).toBeTruthy();
    expect(screen.getByRole("link", { name: /view cited source/i })).toHaveAttribute("href", candidate.sourceUrl);
    expect(screen.queryByRole("link", { name: candidate.email })).toBeNull();
    expect(screen.getByText(/Unverified discovery - review before sending/i)).toBeTruthy();
    expect(screen.getByText("Journalist interests/topics")).toBeTruthy();
    expect(screen.getByText("Renewable power")).toBeTruthy();
    expect(screen.getByText("Media opportunities")).toBeTruthy();
    expect(screen.getByRole("link", { name: "How renewable teams manage power" })).toHaveAttribute("href", "https://energy.example/bylines/renewable-power");

    fireEvent.click(screen.getByRole("button", { name: /send for review/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /submitted for review/i })).toBeDisabled());
  });

  it("saves and removes a reusable database bookmark without adding a story shortlist decision", async () => {
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    expect(await screen.findByText("Decision Contact")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /decline|more like this|less like this/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save to My Media Database" }));
    expect(await screen.findByRole("button", { name: "Saved to My Media Database" })).toBeTruthy();
    expect(requests.some((request) => request.url.endsWith("/bookmarks/contact/91") && request.method === "PUT" && request.body === undefined)).toBe(true);
    expect(screen.getByText(/saving it to My Media Database alone does not mark it as pitched/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Saved to My Media Database" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save to My Media Database" })).toBeTruthy());
    expect(requests.filter((request) => request.url.endsWith("/bookmarks/contact/91")).map((request) => request.method)).toEqual(["PUT", "DELETE"]);
  });

  it("separately adds a fresh recommendation to this story shortlist and makes outreach planning available", async () => {
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    expect(await screen.findByText("Decision Contact")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /plan outreach to Decision Contact/i })).toBeNull();

    fireEvent.click(screen.getByTestId("button-plan-story-outreach-91"));
    await waitFor(() => expect(requests.some((request) =>
      request.url.endsWith("/recommendations/decisions")
      && request.method === "PUT"
      && request.body?.decision === "shortlisted"
      && request.body?.contactId === 91,
    )).toBe(true));
    expect(await screen.findByRole("button", { name: "Plan outreach to Decision Contact" })).toBeTruthy();
    expect(requests.some((request) => request.url.endsWith("/store/media-db/outreach") && request.method === "POST")).toBe(false);
    expect(screen.queryByRole("button", { name: /decline|more like this|less like this/i })).toBeNull();
  });

  it("explains that live email addresses must come from the cited public source", () => {
    render(<MediaResearchPage />);
    expect(screen.getByText(/sends the selected article excerpt.*to OpenAI/i)).toBeTruthy();
  });

  it("offers Find new journalists only after a persisted no-result match and runs live search explicitly", async () => {
    recommendationState.includeContact = false;
    render(<MediaResearchPage />);
    expect(screen.queryByTestId("button-find-journalists")).toBeNull();
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    await waitFor(() => expect(screen.getAllByDisplayValue("Clean energy").length).toBeGreaterThan(0));
    expect(await screen.findByTestId("button-find-journalists")).toBeTruthy();
    expect(requests.some((request) => request.url.includes("/content/media-discover"))).toBe(false);
    fireEvent.click(screen.getByTestId("button-find-journalists"));
    await waitFor(() => expect(requests.some((request) => request.url.includes("/content/media-discover"))).toBe(true));
  });

  it("remembers the selected article after remount within the same workspace and project", async () => {
    localStorage.setItem("aio.auth.session.v3", JSON.stringify({ username: "workspace-a", role: "agency" }));
    const first = render(<MediaResearchPage />);
    const selector = screen.getByTestId("select-research-article") as HTMLSelectElement;
    fireEvent.change(selector, { target: { value: "story-1" } });
    await waitFor(() => expect(selector.value).toBe("story-1"));
    await screen.findByText("Decision Contact");
    first.unmount();

    render(<MediaResearchPage />);
    expect((screen.getByTestId("select-research-article") as HTMLSelectElement).value).toBe("story-1");
    await screen.findByText("Decision Contact");
  });

  it("keeps the brief concise, uses database-backed media sectors, and retains exact article phrases", async () => {
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    const sectors = await screen.findByRole("listbox", { name: "Media sectors" }) as HTMLSelectElement;
    await waitFor(() => expect(Array.from(sectors.options).map((option) => option.value)).toEqual(["Energy", "Technology", "Finance"]));
    expect(screen.queryByLabelText("Audience")).toBeNull();
    expect(screen.queryByLabelText("Why now")).toBeNull();
    expect(screen.getByText("clean energy platform")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Global" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "UK" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "US" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Europe" })).toBeNull();
  });

  it("does not carry a remembered article into another project", async () => {
    localStorage.setItem("aio.auth.session.v3", JSON.stringify({ username: "workspace-a", role: "agency" }));
    sessionStorage.setItem("aio.research.selection.v1::workspace-a::project-1", "story-1");
    projectState.id = "project-2";
    render(<MediaResearchPage />);
    await waitFor(() => expect((screen.getByTestId("select-research-article") as HTMLSelectElement).value).toBe(""));
  });

  it("gives an explicit canonical preload priority over the remembered article", async () => {
    localStorage.setItem("aio.auth.session.v3", JSON.stringify({ username: "workspace-a", role: "agency" }));
    sessionStorage.setItem("aio.research.selection.v1::workspace-a::project-1", "story-2");
    localStorage.setItem("aio.research.preload", "story-1");
    render(<MediaResearchPage />);
    await waitFor(() => expect((screen.getByTestId("select-research-article") as HTMLSelectElement).value).toBe("story-1"));
    expect(localStorage.getItem("aio.research.preload")).toBeNull();
  });

  it("clears an invalid remembered article after the archive is ready", async () => {
    localStorage.setItem("aio.auth.session.v3", JSON.stringify({ username: "workspace-a", role: "agency" }));
    sessionStorage.setItem("aio.research.selection.v1::workspace-a::project-1", "deleted-story");
    render(<MediaResearchPage />);
    await waitFor(() => expect((screen.getByTestId("select-research-article") as HTMLSelectElement).value).toBe(""));
    expect(sessionStorage.getItem("aio.research.selection.v1::workspace-a::project-1")).toBeNull();
  });

  it("never runs external search automatically when matching database contacts", async () => {
    render(<StrictMode><MediaResearchPage /></StrictMode>);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "US" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "US" }));
    await waitFor(() => expect(screen.getByTestId("button-recommend-contacts")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("button-recommend-contacts"));
    await waitFor(() => expect(requests.filter((request) => request.url.endsWith("/store/media-db/recommendations"))).toHaveLength(1));
    expect(requests.some((request) => request.url.includes("/content/media-discover"))).toBe(false);
  });

  it("infers a UK or US default from canonical intake locations and uses Global for other regions", async () => {
    recommendationState.brief = null;
    intakeState.data = { formData: { "4.5": "Manchester and Leeds, UK" }, duals: {}, dualLists: {}, stringLists: {} };
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "UK" }).className).toContain("bg-slate-800"));

    cleanup();
    intakeState.data = { formData: { "4.5": "Texas and Chicago, USA" }, duals: {}, dualLists: {}, stringLists: {} };
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "US" }).className).toContain("bg-slate-800"));

    cleanup();
    localStorage.clear();
    intakeState.data = { formData: { "4.5": "France, Germany and the Netherlands" }, duals: {}, dualLists: {}, stringLists: {} };
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Global" }).className).toContain("bg-slate-800"));
  });

  it("keeps a persisted story shortlist contact when newest recommendations omit it", async () => {
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

  it("shows a stable fallback and review warning for an unnamed recommendation", async () => {
    render(
      <RecommendationCard
        item={{
        rank: 1,
        score: 65,
        reasons: ["Contact name is not recorded; reduced by 15 points for identity review before outreach."],
        contact: {
          id: 91,
          outletId: 4,
          firstName: "",
          lastName: "",
          role: "Energy editor",
          email: "",
          phone: "",
          notes: "",
          accountId: null,
          beats: ["energy"],
          sectors: ["Energy"],
          outletName: "Current Energy Daily",
          outletCategory: "Energy",
        },
      }}
      />,
    );
    expect(screen.getByText("Contact name not recorded")).toBeTruthy();
    expect(screen.getByText(/Identity review required/i)).toBeTruthy();
    expect(screen.getByText(/reduced by 15 points/i)).toBeTruthy();
    expect(screen.getByText("Current Energy Daily")).toBeTruthy();
  });

  it("makes identical evidence scores explicit instead of implying a quality order", () => {
    render(
      <RecommendationCard
        item={{
          rank: 2,
          score: 42,
          reasons: ["Coverage profile matches business"],
          contact: {
            id: 92,
            outletId: 4,
            firstName: "Jane",
            lastName: "Reporter",
            role: "Business reporter",
            email: "",
            phone: "",
            notes: "",
            accountId: null,
          },
        }}
        sharedScoreCount={34}
      />,
    );
    expect(screen.getByText("Shared Match Score")).toBeTruthy();
    expect(screen.getByTestId("shared-score-note").textContent).toMatch(/34 contacts.*order is not a quality difference/i);
  });

  it("shows the publication website separately from source evidence in compact recommendations", () => {
    render(
      <RecommendationCard
        compact
        item={{
          rank: 1,
          score: 78,
          reasons: [],
          assessment: {
            version: "editorial-v1",
            fitScore: 78,
            confidence: "high",
            evidenceCoverage: 100,
            factors: [],
            readiness: { status: "ready", reasons: [] },
            evidence: [],
            warnings: [],
            suggestedAngle: null,
          },
          contact: {
            id: 93,
            outletId: 5,
            firstName: "Alex",
            lastName: "Editor",
            role: "Editor",
            email: "",
            phone: "",
            notes: "",
            accountId: null,
            outletWebsite: "https://publication.example",
            sourceUrl: "https://publication.example/about/alex",
          },
        }}
      />,
    );

    expect(screen.getByRole("link", { name: /outlet website/i })).toHaveAttribute("href", "https://publication.example/");
    expect(screen.getByRole("link", { name: /view source/i })).toHaveAttribute("href", "https://publication.example/about/alex");
    expect(screen.getByText("Editorial fit: 78%")).toBeTruthy();
    expect(screen.getByText(/Evidence confidence:/i)).toBeTruthy();
  });

  it("does not create website links for numeric or malicious publication values", () => {
    render(
      <RecommendationCard
        compact
        item={{
          rank: 1,
          score: 50,
          reasons: [],
          contact: {
            id: 94,
            outletId: 5,
            firstName: "Sam",
            lastName: "Writer",
            role: "Writer",
            email: "",
            phone: "",
            notes: "",
            accountId: null,
            outletWebsite: "123456",
            sourceUrl: "javascript:alert(1)",
          },
        }}
      />,
    );

    expect(screen.queryByRole("link", { name: /outlet website|view source/i })).toBeNull();
    expect(screen.queryByText(/123456/)).toBeNull();
  });

  it("uses one editorial assessment instead of a duplicate match donut and confidence card", () => {
    const item = {
      rank: 1,
      score: 74,
      reasons: [],
      assessment: {
        version: "editorial-v1" as const,
        fitScore: 74,
        confidence: "low" as const,
        evidenceCoverage: 20,
        factors: [],
        readiness: { status: "needs_check" as const, reasons: [] },
        evidence: [],
        warnings: [],
        suggestedAngle: null,
      },
      contact: {
        id: 95,
        outletId: 5,
        firstName: "Taylor",
        lastName: "Reporter",
        role: "Reporter",
        email: "",
        phone: "",
        notes: "",
        accountId: null,
        confidence: "High",
      },
    };
    render(
      <RecommendationCard
        item={item}
        onAccept={() => undefined}
        onDecline={() => undefined}
        onRefine={() => undefined}
      />,
    );

    expect(screen.queryByText("Match Score")).toBeNull();
    expect(screen.getByText(/Evidence confidence: low/i)).toBeTruthy();
    expect(screen.queryByText(/^Confidence$/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /decline|more like this|less like this/i })).toBeNull();
  });

  it("does not present an unassessed story selection's legacy match score as editorial fit", () => {
    render(
      <RecommendationCard
        isShortlist
        item={{
          rank: 1,
          score: 74,
          reasons: [],
          contact: {
            id: 96,
            outletId: 5,
            firstName: "Morgan",
            lastName: "Reporter",
            role: "Reporter",
            email: "",
            phone: "",
            notes: "",
            accountId: null,
          },
        }}
      />,
    );

    expect(screen.queryByText(/match score/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /decline|more like this|less like this/i })).toBeNull();
  });

  it("orders every recommendation response by strongest match with stable ties", () => {
    const recommendation = (id: number, score: number, rank: number) => ({
      rank,
      score,
      reasons: [],
      phraseAttributions: [],
      contact: { id },
    }) as never;
    expect(orderRecommendations([
      recommendation(30, 20, 3),
      recommendation(20, 90, 2),
      recommendation(10, 90, 1),
    ]).map((item) => item.contact.id)).toEqual([10, 20, 30]);
  });

  it.each(["network", "json"] as const)("shows a saved shortlist error when the decision load returns %s failure", async (kind) => {
    decisionLoadFailure.kind = kind;
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    expect(await screen.findByText(kind === "network" ? "Decision service unavailable" : /Could not load saved shortlist: the server returned invalid data/i)).toBeTruthy();
  });

  it("blocks matching and does not invent a brief when scoped brief hydration fails", async () => {
    featureState.briefFailure = true;
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    expect(await screen.findByText(/Brief store unavailable|Could not load targeting brief/i)).toBeTruthy();
    expect(screen.getByTestId("button-recommend-contacts")).toBeDisabled();
    expect(requests.some((request) => request.url.endsWith("/store/media-db/recommendations"))).toBe(false);
  });

  it("hydrates each Targeting Brief from the active project and article scope", async () => {
    render(<MediaResearchPage />);
    const selector = screen.getByTestId("select-research-article");
    fireEvent.change(selector, { target: { value: "story-1" } });
    await waitFor(() => expect(requests.some((request) => request.url.includes("/recommendations/brief?") && request.url.includes("projectId=project-1") && request.url.includes("storyKey=story-1"))).toBe(true));
    fireEvent.change(selector, { target: { value: "story-2" } });
    await waitFor(() => expect(requests.some((request) => request.url.includes("/recommendations/brief?") && request.url.includes("projectId=project-1") && request.url.includes("storyKey=story-2"))).toBe(true));
  });

  it("retains the complete enrichment result, including checked coverage evidence", async () => {
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    expect(await screen.findByText("Decision Contact")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Check top 5 recent coverage" }));
    expect(await screen.findByText("Enriched Contact")).toBeTruthy();
    fireEvent.click(screen.getByText("Evidence and contact checks"));
    expect(screen.getByText("Recent energy coverage")).toBeTruthy();
    expect(screen.getByText("Author matched")).toBeTruthy();
    expect(screen.getByText("Page checked")).toBeTruthy();
    expect(screen.getByText(/Checked:/)).toBeTruthy();
    expect(screen.getByText(/Energy transition/)).toBeTruthy();
  });

  it("restores recommendation readiness after removing a contact restriction", async () => {
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    expect(await screen.findByText("Decision Contact")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Do not contact" }));
    expect(await screen.findByRole("button", { name: "Remove restriction" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove restriction" }));
    expect(await screen.findByRole("button", { name: "Do not contact" })).toBeTruthy();
  });

  it("ignores delayed A-to-B-to-A database responses by invocation identity", async () => {
    delayedRequests.recommendations = true;
    render(<MediaResearchPage />);
    const selector = screen.getByTestId("select-research-article");
    fireEvent.change(selector, { target: { value: "story-1" } });
    await waitFor(() => expect(screen.getAllByDisplayValue("Clean energy").length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByRole("button", { name: "US" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "US" }));
    await waitFor(() => expect(screen.getByTestId("button-recommend-contacts")).not.toBeDisabled());
     fireEvent.click(screen.getByTestId("button-recommend-contacts"));
    await waitFor(() => expect(delayedRequests.recommendationCalls).toHaveLength(1));
    await act(async () => { 
      await new Promise(r => setTimeout(r, 0)); 
      fireEvent.change(selector, { target: { value: "story-2" } });
    });
    await waitFor(() => expect(screen.getAllByDisplayValue("Clean energy").length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByRole("button", { name: "US" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "US" }));
    await waitFor(() => expect(screen.getByTestId("button-recommend-contacts")).not.toBeDisabled());
     fireEvent.click(screen.getByTestId("button-recommend-contacts"));
    await waitFor(() => expect(delayedRequests.recommendationCalls).toHaveLength(2));
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    fireEvent.change(selector, { target: { value: "story-1" } });
    await waitFor(() => expect(screen.getAllByDisplayValue("Clean energy").length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByRole("button", { name: "US" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "US" }));
    await waitFor(() => expect(screen.getByTestId("button-recommend-contacts")).not.toBeDisabled());
     fireEvent.click(screen.getByTestId("button-recommend-contacts"));
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

  it("keeps a delayed live run alive across navigation and ignores other-project results", async () => {
    delayedRequests.live = true;
    render(<MediaResearchPage />);
    const selector = screen.getByTestId("select-research-article");
    fireEvent.change(selector, { target: { value: "story-1" } });
    await waitFor(() => expect(screen.getByTestId("button-recommend-contacts")).toBeTruthy());
    fireEvent.click(screen.getByTestId("button-discover-live"));
    await waitFor(() => expect(delayedRequests.liveCalls).toHaveLength(1));
    expect(screen.getByTestId("status-live-discovery").textContent).toContain("Finding sources");
    expect(screen.getByTestId("status-live-discovery").textContent).toContain("Elapsed this session:");
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    fireEvent.change(selector, { target: { value: "story-2" } });
    await waitFor(() => expect(screen.getByTestId("button-recommend-contacts")).toBeTruthy());
    fireEvent.click(await screen.findByTestId("button-find-journalists"));
    await waitFor(() => expect(delayedRequests.liveCalls).toHaveLength(2));
    fireEvent.change(selector, { target: { value: "story-1" } });
    await waitFor(() => expect(screen.getByTestId("button-recommend-contacts")).toBeTruthy());
     fireEvent.click(screen.getByTestId("button-discover-live"));
    // Returning to story 1 finds the existing app-owned run instead of
    // starting a duplicate concurrent search.
    expect(delayedRequests.liveCalls).toHaveLength(2);

    const result = (name: string) => new Response(JSON.stringify({
      ok: true,
      items: [{ ...candidate, firstName: name }],
      discoveryToken: "signed-token",
    }), { status: 200 });
    delayedRequests.liveCalls[0].resolve(result("story-1-live-1"));
    delayedRequests.liveCalls[1].resolve(result("story-2-live-2"));

    expect(await screen.findByText("story-1-live-1 Reporter")).toBeTruthy();
    expect(screen.queryByText("story-2-live-2 Reporter")).toBeNull();
  });

  it("recovers a live result after the page remounts without auto-submitting it for review", async () => {
    delayedRequests.live = true;
    localStorage.setItem("aio.auth.session.v3", JSON.stringify({ username: "workspace-a", role: "agency" }));
    const first = render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    await waitFor(() => expect(screen.getByTestId("button-recommend-contacts")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("button-recommend-contacts"));
    await waitFor(() => expect(screen.getByTestId("button-discover-live")).toBeTruthy());
    fireEvent.click(screen.getByTestId("button-discover-live"));
    await waitFor(() => expect(delayedRequests.liveCalls).toHaveLength(1));
    first.unmount();

    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    await waitFor(() => expect(screen.getByTestId("button-recommend-contacts")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("button-recommend-contacts"));
    await waitFor(() => expect(screen.getByTestId("button-discover-live")).toBeTruthy());

    delayedRequests.liveCalls[0].resolve(new Response(JSON.stringify({
      ok: true,
      items: [{ ...candidate, firstName: "Recovered" }],
      discoveryToken: "signed-token",
    }), { status: 200 }));

    expect(await screen.findByText("Recovered Reporter")).toBeTruthy();
    const saves = requests.filter((request) => request.url.includes("/store/media-db/discoveries"));
    expect(saves).toHaveLength(0);
  });

  it("refreshes structured phrase attribution inputs when switching articles", async () => {
    delayedRequests.recommendations = true;
    render(<MediaResearchPage />);
    const selector = screen.getByTestId("select-research-article");
    fireEvent.change(selector, { target: { value: "story-1" } });
    await waitFor(() => expect(screen.getAllByDisplayValue("Clean energy").length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByRole("button", { name: "US" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "US" }));
    await waitFor(() => expect(screen.getByTestId("button-recommend-contacts")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("button-recommend-contacts"));
    await waitFor(() => expect(delayedRequests.recommendationCalls).toHaveLength(1));
    expect(delayedRequests.recommendationCalls[0].storyKey).toBe("story-1");
    const firstBody = requests.find((request) => request.url.endsWith("/store/media-db/recommendations") && request.body?.storyKey === "story-1")?.body;
    expect(firstBody?.targetPhrases).toEqual([storyOnePhrase]);

    await act(async () => { 
      await new Promise(r => setTimeout(r, 0)); 
      fireEvent.change(selector, { target: { value: "story-2" } });
    });
    await waitFor(() => expect(screen.getAllByDisplayValue("Clean energy").length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByRole("button", { name: "US" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "US" }));
    await waitFor(() => expect(screen.getByTestId("button-recommend-contacts")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("button-recommend-contacts"));
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

  it("keeps recommendation actions focused on reusable saves, not legacy feedback controls", async () => {
    const contact = { id: 10, outletId: 1, firstName: "Jane", lastName: "Reporter", role: "Energy correspondent", email: "", phone: "", notes: "", accountId: null, beats: ["energy"], sectors: ["technology"] };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/brief")) {
        if (init?.method === "PUT") return new Response(JSON.stringify({ brief: JSON.parse(init.body as string).brief }), { status: 200 });
        return new Response(JSON.stringify({ brief: { topic: "Clean energy", angle: "Launch", audience: "B2B", regions: ["UK"], publicationTypes: [], whyNow: "" } }), { status: 200 });
      }
      if (url.split("?")[0].endsWith("/store/media-db/bookmarks")) return new Response(JSON.stringify({ bookmarks: [] }), { status: 200 });
      if (url.includes("/store/media-db/bookmarks/contact/10")) return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (url.includes("/store/media-db/recommendations?")) {
        return new Response(JSON.stringify({
          ok: true,
          recommendationSet: { id: "saved-set-refinement" },
          items: [{ rank: 1, score: 70, reasons: ["Coverage profile matches energy"], contact }],
          brief: { topic: "Clean energy", angle: "Launch", audience: "B2B", regions: ["UK"], publicationTypes: [], whyNow: "" },
          evaluation: { evaluated: 1, shortlisted: 1, contacted: 0, responded: 0, placed: 0 },
        }), { status: 200 });
      }
      if (url.endsWith("/store/media-db/recommendations") && init?.method === "POST") {
        return new Response(JSON.stringify({
          ok: true,
          items: [{ rank: 1, score: 70, reasons: ["Coverage profile matches energy"], contact }],
        }));
      }
      if (url.includes("/recommendations/decisions")) return new Response(JSON.stringify({
        decisions: [],
        decisionContacts: [{ contactId: 10, contact }],
        feedback: [{ contactId: 10, signal: "more" }],
        items: [{ rank: 1, score: 70, reasons: ["Coverage profile matches energy"], contact }],
      }));
      return new Response("{}", { status: 404 });
    }));
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    expect((await screen.findAllByText("Jane Reporter")).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("button", { name: /decline|more like this|less like this/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Save to My Media Database" })).toBeTruthy();
    expect(screen.getByText("Story outreach planning")).toBeTruthy();
  });
});
