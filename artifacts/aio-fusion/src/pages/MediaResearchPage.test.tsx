// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
const recommendationState = vi.hoisted(() => ({
  includeContact: true,
  brief: null as Record<string, unknown> | null,
  pagedItems: null as Record<string, unknown>[] | null,
  emptyPage: 0,
  rankingRevision: "rank-v1",
  stalePageOnce: false,
  visibilityRevision: "visibility-v1",
  visibilityStalePageOnce: false,
}));
const featureState = vi.hoisted(() => ({
  briefFailure: false,
  recommendationGetFailure: false,
  restricted: false,
  enrich: false,
  quotaFailure: "" as "" | "recommendations" | "enrich" | "live",
}));
const delayedRequests = vi.hoisted(() => ({
  recommendations: false,
  live: false,
  recommendationCalls: [] as { storyKey: string; resolve: (response: Response) => void }[],
  liveCalls: [] as { storyKey: string; resolve: (response: Response) => void }[],
}));
const delayedCoverage = vi.hoisted(() => ({
  active: false,
  calls: [] as { storyKey: string; resolve: (response: Response) => void }[],
}));
const serverDiscoveryHistory = vi.hoisted(() => ({
  latest: null as Record<string, unknown> | null,
  delayLatest: false,
  latestCalls: [] as ((response: Response) => void)[],
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
  escapeHtml: (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"),
}));

import { MediaResearchPage, resolveArticleResearchContext, resolveArticleTargetPhrases } from "./MediaResearchPage";
import { RecommendationCard } from "./JournalistComponents";
import { exactTargetPhraseId } from "../lib/exactTargetPhrases";
import { clearAiRuns } from "../lib/aiRunLifecycle";
import { getAuditDurationSeconds, getAuditSampleCount, recordAuditDuration } from "../lib/auditTiming";

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

function coverageSuccessResponse(): Response {
  return new Response(JSON.stringify({
    ok: true,
    recommendationSet: { id: "saved-set-1" },
    rankingRevision: "rank-v2",
    visibilityRevision: "visibility-v1",
    page: 1,
    pageSize: 5,
    start: 1,
    end: 1,
    hasPrevious: false,
    hasNext: false,
    collectionTotal: 1506,
    totalMatches: 1,
    items: [{
      rank: 1,
      score: 84,
      reasons: ["Coverage updated"],
      contact: {
        id: 91, firstName: "Coverage", lastName: "Updated", role: "Energy editor",
        email: "", phone: "", notes: "", beats: ["energy"], sectors: ["Energy"],
        outletName: "Current Energy Daily", outletCategory: "Energy",
      },
      assessment: {
        warnings: [],
        evidence: [{ attribution: "page_checked", authorMatched: true }],
      },
    }],
    evaluation: { evaluated: 1, shortlisted: 0, contacted: 0, responded: 0, placed: 0 },
  }), { status: 200 });
}

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

  let requests: { url: string; method?: string; body?: Record<string, unknown> }[] = [];
  beforeEach(() => {
    requests = [];
    localStorage.removeItem("aio.auditTiming.media-discover");
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
        const query = new URL(url, "http://test.local").searchParams;
        const queryStoryKey = query.get("storyKey");
        const page = Number(query.get("page") || 1);
        const pageSize = 5;
        if (page > 1 && recommendationState.stalePageOnce) {
          recommendationState.stalePageOnce = false;
          recommendationState.rankingRevision = "rank-v2";
          recommendationState.pagedItems = recommendationState.pagedItems?.map((item, index) => ({
            ...item,
            rank: index + 1,
            contact: { ...(item.contact as Record<string, unknown>), firstName: `Reranked Reporter ${index + 1}` },
          })) || null;
          return new Response(JSON.stringify({ error: "The recommendation ranking has changed." }), { status: 409 });
        }
        if (page > 1 && recommendationState.visibilityStalePageOnce) {
          recommendationState.visibilityStalePageOnce = false;
          recommendationState.visibilityRevision = "visibility-v2";
          recommendationState.pagedItems = recommendationState.pagedItems?.slice(1).map((item, index) => ({
            ...item,
            rank: index + 1,
            contact: { ...(item.contact as Record<string, unknown>), firstName: `Visible Reporter ${index + 1}` },
          })) || null;
          return new Response(JSON.stringify({ error: "Visible recommendation set changed." }), { status: 409 });
        }
        const savedContact = {
          id: 91, firstName: "Decision", lastName: "Contact", role: "Energy editor",
          email: "", phone: "", notes: "", beats: ["energy"], sectors: ["Energy"],
          outletName: "Current Energy Daily", outletCategory: "Energy",
          publicationReach: "Hidden source reach", outletReachBand: "Hidden outlet band",
        };
        const defaultItems = recommendationState.includeContact && queryStoryKey === "story-1"
          ? [{
            rank: 1, score: 80, reasons: ["Coverage profile matches energy"], contact: savedContact,
            restricted: featureState.restricted,
            assessment: featureState.restricted ? {
              version: "editorial-v1", fitScore: 80, confidence: "medium", evidenceCoverage: 30,
              factors: [], readiness: { status: "blocked", reasons: ["Contact or outlet is suppressed / do-not-contact."] },
              evidence: [], warnings: [], suggestedAngle: null,
            } : undefined,
          }]
          : [];
        const pageItems = recommendationState.pagedItems && queryStoryKey === "story-1"
          ? recommendationState.emptyPage === page
            ? []
            : recommendationState.pagedItems.slice((page - 1) * pageSize, page * pageSize)
          : defaultItems;
        const totalMatches = recommendationState.pagedItems?.length ?? defaultItems.length;
        const start = pageItems.length ? ((page - 1) * pageSize) + 1 : 0;
        const end = pageItems.length ? start + pageItems.length - 1 : 0;
        return new Response(JSON.stringify({
          ok: true,
          recommendationSet: { id: "saved-set-1" },
          rankingRevision: recommendationState.rankingRevision,
          visibilityRevision: recommendationState.visibilityRevision,
          page,
          pageSize,
          start,
          end,
          hasPrevious: page > 1,
          hasNext: page * pageSize < totalMatches,
          items: pageItems,
          collectionTotal: recommendationState.pagedItems ? 1234 : 1506,
          totalMatches,
          brief: recommendationState.brief,
          evaluation: { evaluated: recommendationState.includeContact ? 1 : 0, shortlisted: 0, contacted: 0, responded: 0, placed: 0 },
        }), { status: 200 });
      }
      if (url.includes("/recommendations/contact-restriction") && init?.method === "POST") {
        featureState.restricted = Boolean((JSON.parse(String(init.body)) as Record<string, unknown>).doNotContact);
        return new Response(JSON.stringify({ ok: true, doNotContact: featureState.restricted }), { status: 200 });
      }
      if (url.includes("/recommendations/enrich") && init?.method === "POST") {
        if (featureState.quotaFailure === "enrich") return new Response(JSON.stringify({ error: "provider quota" }), { status: 429 });
        if (delayedCoverage.active) {
          return new Promise<Response>((resolve) => {
            delayedCoverage.calls.push({ storyKey: String(body?.storyKey || ""), resolve });
          });
        }
        featureState.enrich = true;
        return new Response(JSON.stringify({
          ok: true,
          recommendationSet: { id: "saved-set-1" },
          rankingRevision: "rank-v1",
          visibilityRevision: "visibility-v1",
          page: 1,
          pageSize: 5,
          start: 1,
          end: 1,
          hasPrevious: false,
          hasNext: false,
          collectionTotal: 1506,
          totalMatches: 1,
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
        if (init?.method === "POST" && featureState.quotaFailure === "recommendations") {
          return new Response(JSON.stringify({ error: "provider quota" }), { status: 429 });
        }
        const recommendationMarker = delayedRequests.recommendations
          ? `${String(body?.storyKey || "unknown")}-response-${delayedRequests.recommendationCalls.length + 1}`
          : "Decision";
        const recommendationResponse = new Response(JSON.stringify({
          ok: true,
          recommendationSet: { id: "saved-set-1" },
          rankingRevision: "rank-v1",
          visibilityRevision: "visibility-v1",
          page: 1,
          pageSize: 5,
          start: 1,
          end: recommendationState.includeContact && body?.storyKey === "story-1" ? 1 : 0,
          hasPrevious: false,
          hasNext: false,
          collectionTotal: 1506,
          totalMatches: recommendationState.includeContact && body?.storyKey === "story-1" ? 1 : 0,
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
        if (featureState.quotaFailure === "live") return new Response(JSON.stringify({ error: "provider quota" }), { status: 429 });
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
      if (url.includes("/content/journalist-search-runs/latest")) {
        if (serverDiscoveryHistory.delayLatest) {
          return new Promise<Response>((resolve) => serverDiscoveryHistory.latestCalls.push(resolve));
        }
        return new Response(JSON.stringify(serverDiscoveryHistory.latest), { status: 200 });
      }
      if (url.includes("/store/media-db/discoveries")) {
        return new Response(JSON.stringify({ ok: true, discovery: { id: 10, status: "pending" } }), { status: 201 });
      }
      if (url.endsWith("/store/media-db/export") && init?.method === "POST") {
        return new Response("\uFEFF\"First Name\",\"Last Name\"\r\n\"Reporter0\",\"Test\"", {
          status: 200, headers: { "Content-Type": "text/csv; charset=utf-8" },
        });
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
    recommendationState.pagedItems = null;
    recommendationState.emptyPage = 0;
    recommendationState.rankingRevision = "rank-v1";
    recommendationState.stalePageOnce = false;
    recommendationState.visibilityRevision = "visibility-v1";
    recommendationState.visibilityStalePageOnce = false;
    featureState.briefFailure = false;
    featureState.recommendationGetFailure = false;
    featureState.restricted = false;
    featureState.enrich = false;
    featureState.quotaFailure = "";
    delayedRequests.recommendations = false;
    delayedRequests.live = false;
    delayedRequests.recommendationCalls = [];
    delayedRequests.liveCalls = [];
    delayedCoverage.active = false;
    delayedCoverage.calls = [];
    serverDiscoveryHistory.latest = null;
    serverDiscoveryHistory.delayLatest = false;
    serverDiscoveryHistory.latestCalls = [];
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
     const discoverButton = screen.getByRole("button", { name: "Find additional journalists online" });
     expect(discoverButton.getAttribute("aria-describedby")).toBe("research-live-search-help");
     expect(screen.getByText(/Optional: search beyond your Media Database.*Public web discoveries.*not added to your Media Database automatically/i)).toBeTruthy();
     fireEvent.click(discoverButton);

    expect(await screen.findByText("Jane Reporter")).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("status-live-discovery")).toBeNull());
    expect(screen.queryByText(/Elapsed this session:/)).toBeNull();
    expect(screen.queryByTestId("empty-live-discovery")).toBeNull();
    expect(screen.queryByText("Phrase fit and recorded topic overlap")).toBeNull();
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
    expect(screen.queryByText(/Hidden source reach|Hidden outlet band|Source reach/i)).toBeNull();
    expect(document.querySelector('[title*="readership"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /decline|more like this|less like this/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save to My Media Database" }));
    expect(await screen.findByRole("button", { name: "Saved to My Media Database" })).toBeTruthy();
    expect(requests.some((request) => request.url.endsWith("/bookmarks/contact/91") && request.method === "PUT" && request.body === undefined)).toBe(true);
    expect(screen.getByText(/saving it to My Media Database alone does not mark it as pitched/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Saved to My Media Database" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save to My Media Database" })).toBeTruthy());
    expect(requests.filter((request) => request.url.endsWith("/bookmarks/contact/91")).map((request) => request.method)).toEqual(["PUT", "DELETE"]);
  });

  it("loads server-ranked recommendations five at a time with separate collection and match totals", async () => {
    recommendationState.pagedItems = Array.from({ length: 12 }, (_, index) => ({
      rank: index + 1,
      score: 100 - index,
      reasons: ["Server-ranked result"],
      contact: {
        id: 200 + index,
        firstName: `Reporter ${index + 1}`,
        lastName: "Contact",
        role: "Energy editor",
        email: "",
        phone: "",
        notes: "",
        beats: ["energy"],
        sectors: ["Energy"],
        outletName: "Energy Daily",
        outletCategory: "Energy",
      },
    }));
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });

    expect(await screen.findByText(/Reporter 1/)).toBeTruthy();
    expect(screen.getByTestId("recommendation-pagination-summary")).toHaveTextContent("Showing 5 of 1,234 records");
    expect(screen.getByTestId("recommendation-pagination-summary")).toHaveTextContent("12 relevant matches");
    expect(screen.getByText(/Reporter 5/)).toBeTruthy();
    expect(screen.queryByText(/Reporter 6/)).toBeNull();
    const firstPageRequest = requests.find((request) => request.url.includes("/store/media-db/recommendations?") && request.url.includes("storyKey=story-1"));
    expect(firstPageRequest?.url).toContain("page=1");
    expect(firstPageRequest?.url).not.toContain("pageSize");

    fireEvent.click(screen.getByRole("button", { name: "See next five" }));
    expect(await screen.findByText(/Reporter 6/)).toBeTruthy();
    expect(screen.getByTestId("recommendation-pagination-summary")).toHaveTextContent("Showing 6–10 of 1,234 records");
    expect(screen.getByText(/Reporter 10/)).toBeTruthy();
    expect(screen.queryByText(/Reporter 5/)).toBeNull();
    const pageTwoRequest = requests.find((request) => request.url.includes("/store/media-db/recommendations?") && request.url.includes("storyKey=story-1") && request.url.includes("page=2"));
    expect(new URL(pageTwoRequest?.url || "", "http://test.local").searchParams.get("setId")).toBe("saved-set-1");
    expect(new URL(pageTwoRequest?.url || "", "http://test.local").searchParams.get("revision")).toBe("rank-v1");
    expect(new URL(pageTwoRequest?.url || "", "http://test.local").searchParams.get("visibilityRevision")).toBe("visibility-v1");

    fireEvent.click(screen.getByRole("button", { name: "See next five" }));
    expect(await screen.findByText(/Reporter 11/)).toBeTruthy();
    expect(screen.getByTestId("recommendation-pagination-summary")).toHaveTextContent("Showing 11–12 of 1,234 records");
    expect(screen.getByText(/Reporter 12/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "See next five" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Previous five" }));
    expect(await screen.findByText(/Reporter 6/)).toBeTruthy();
    expect(screen.getByTestId("recommendation-pagination-summary")).toHaveTextContent("Showing 6–10 of 1,234 records");
  });

  it("resets to a fresh first page when a page request reports a stale ranking revision", async () => {
    recommendationState.pagedItems = Array.from({ length: 12 }, (_, index) => ({
      rank: index + 1,
      score: 100 - index,
      reasons: [],
      contact: {
        id: 400 + index, firstName: `Reporter ${index + 1}`, lastName: "Contact", role: "Editor",
        email: "", phone: "", notes: "", beats: [], sectors: ["Energy"], outletName: "Daily",
        outletCategory: "Energy",
      },
    }));
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    expect(await screen.findByText("Reporter 1 Contact")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "See next five" }));
    expect(await screen.findByText("Reporter 6 Contact")).toBeTruthy();

    recommendationState.stalePageOnce = true;
    fireEvent.click(screen.getByRole("button", { name: "See next five" }));

    expect(await screen.findByText("Reranked Reporter 1 Contact")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("recommendation-pagination-summary")).toHaveTextContent("Showing 5 of 1,234 records"));
    expect(screen.queryByText("Reporter 6 Contact")).toBeNull();
    const pageRequests = requests
      .filter((request) => request.url.includes("/store/media-db/recommendations?") && request.url.includes("storyKey=story-1"))
      .map((request) => new URL(request.url, "http://test.local").searchParams);
    expect(pageRequests.at(-2)?.get("revision")).toBe("rank-v1");
    expect(pageRequests.at(-1)?.get("page")).toBe("1");
    expect(pageRequests.at(-1)?.has("setId")).toBe(false);
    expect(pageRequests.at(-1)?.has("revision")).toBe(false);
  });

  it("restarts at page one when a suppression changes the visibility revision between pages", async () => {
    recommendationState.pagedItems = Array.from({ length: 12 }, (_, index) => ({
      rank: index + 1,
      score: 100 - index,
      reasons: [],
      contact: {
        id: 500 + index, firstName: `Reporter ${index + 1}`, lastName: "Contact", role: "Editor",
        email: "", phone: "", notes: "", beats: [], sectors: ["Energy"], outletName: "Daily",
        outletCategory: "Energy",
      },
    }));
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    expect(await screen.findByText("Reporter 1 Contact")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "See next five" }));
    expect(await screen.findByText("Reporter 6 Contact")).toBeTruthy();

    recommendationState.visibilityStalePageOnce = true;
    fireEvent.click(screen.getByRole("button", { name: "See next five" }));

    expect(await screen.findByText("Visible Reporter 1 Contact")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("recommendation-pagination-summary")).toHaveTextContent("Showing 5 of 1,234 records"));
    expect(screen.queryByText("Reporter 6 Contact")).toBeNull();
    expect(screen.getByTestId("recommendation-pagination-summary")).toHaveTextContent("11 relevant matches");
    const pageRequests = requests
      .filter((request) => request.url.includes("/store/media-db/recommendations?") && request.url.includes("storyKey=story-1"))
      .map((request) => new URL(request.url, "http://test.local").searchParams);
    expect(pageRequests.at(-2)?.get("visibilityRevision")).toBe("visibility-v1");
    expect(pageRequests.at(-1)?.get("page")).toBe("1");
    expect(pageRequests.at(-1)?.has("setId")).toBe(false);
    expect(pageRequests.at(-1)?.has("revision")).toBe(false);
    expect(pageRequests.at(-1)?.has("visibilityRevision")).toBe(false);
  });

  it("renders an empty server page with previous-page navigation and no client-side fallback", async () => {
    recommendationState.pagedItems = Array.from({ length: 12 }, (_, index) => ({
      rank: index + 1,
      score: 100 - index,
      reasons: [],
      contact: {
        id: 300 + index, firstName: `Result ${index + 1}`, lastName: "Contact", role: "Editor",
        email: "", phone: "", notes: "", beats: [], sectors: ["Energy"], outletName: "Daily",
        outletCategory: "Energy",
      },
    }));
    recommendationState.emptyPage = 3;
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    expect(await screen.findByText(/Result 1/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "See next five" }));
    expect(await screen.findByText(/Result 6/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "See next five" }));

    expect(await screen.findByText("There are no eligible contacts on this page. Use Previous five to return to earlier matches.")).toBeTruthy();
    expect(screen.getByTestId("recommendation-pagination-summary")).toHaveTextContent("No ranked matches on page 3");
    expect(screen.getByRole("button", { name: "Previous five" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous five" }));
    await waitFor(() => expect(screen.getByTestId("recommendation-pagination-summary")).toHaveTextContent("Showing 6–10 of 1,234 records"));
    expect(screen.getByText(/Result 6/)).toBeTruthy();
    expect(screen.queryByText("Result 1 Contact")).toBeNull();
  });

  it("clears the coverage spinner when page navigation supersedes its result", async () => {
    delayedCoverage.active = true;
    recommendationState.pagedItems = Array.from({ length: 12 }, (_, index) => ({
      rank: index + 1,
      score: 100 - index,
      reasons: [],
      contact: {
        id: 600 + index, firstName: `Reporter ${index + 1}`, lastName: "Contact", role: "Editor",
        email: "", phone: "", notes: "", beats: [], sectors: ["Energy"], outletName: "Daily",
        outletCategory: "Energy",
      },
    }));
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    expect(await screen.findByText("Reporter 1 Contact")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Check top 5 recent coverage" }));
    await waitFor(() => expect(delayedCoverage.calls).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "See next five" }));
    expect(await screen.findByText("Reporter 6 Contact")).toBeTruthy();

    await act(async () => delayedCoverage.calls[0].resolve(coverageSuccessResponse()));

    await waitFor(() => expect(screen.getByRole("button", { name: "Check top 5 recent coverage" })).not.toBeDisabled());
    expect(screen.getByText("Reporter 6 Contact")).toBeTruthy();
    expect(screen.queryByText("Coverage Updated")).toBeNull();
  });

  it("keeps a newer coverage spinner owned by its story/workspace after an older run settles", async () => {
    delayedCoverage.active = true;
    localStorage.setItem("aio.auth.session.v3", JSON.stringify({ username: "workspace-a", role: "agency" }));
    const view = render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    expect(await screen.findByText("Decision Contact")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Check top 5 recent coverage" }));
    await waitFor(() => expect(delayedCoverage.calls).toHaveLength(1));

    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-2" } });
    await waitFor(() => expect((screen.getByTestId("select-research-article") as HTMLSelectElement).value).toBe("story-2"));
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    expect(await screen.findByText("Decision Contact")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Check top 5 recent coverage" }));
    await waitFor(() => expect(delayedCoverage.calls).toHaveLength(2));
    await act(async () => delayedCoverage.calls[0].resolve(coverageSuccessResponse()));
    expect(screen.getByRole("button", { name: "Checking top 5..." })).toBeDisabled();

    const priorScopedLoads = requests.filter((request) => request.url.includes("/store/media-db/recommendations?") && request.url.includes("storyKey=story-1")).length;
    localStorage.setItem("aio.auth.session.v3", JSON.stringify({ username: "workspace-b", role: "agency" }));
    view.rerender(<MediaResearchPage />);
    await waitFor(() => expect(requests.filter((request) => request.url.includes("/store/media-db/recommendations?") && request.url.includes("storyKey=story-1")).length).toBeGreaterThan(priorScopedLoads));
    expect(await screen.findByText("Decision Contact")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Check top 5 recent coverage" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Check top 5 recent coverage" }));
    await waitFor(() => expect(delayedCoverage.calls).toHaveLength(3));

    await act(async () => delayedCoverage.calls[1].resolve(coverageSuccessResponse()));
    expect(screen.getByRole("button", { name: "Checking top 5..." })).toBeDisabled();
    await act(async () => delayedCoverage.calls[2].resolve(coverageSuccessResponse()));
    await waitFor(() => expect(screen.getByRole("button", { name: "Check top 5 recent coverage" })).not.toBeDisabled());
  });

  it("resets transient research and scoped selection without deleting persisted records", async () => {
    localStorage.setItem("aio.auth.session.v3", JSON.stringify({ username: "workspace-a", role: "agency" }));
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    expect(await screen.findByText("Decision Contact")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("button-recommend-contacts")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("button-recommend-contacts"));
    await waitFor(() => expect(requests.some((request) => request.url.endsWith("/store/media-db/recommendations") && request.method === "POST")).toBe(true));
    await waitFor(() => expect(sessionStorage.getItem("aio.research.selection.v1::workspace-a::project-1")).toBe("story-1"));
    expect(screen.getByText(/account-level reusable contact bookmark/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save to My Media Database" }));
    expect(await screen.findByRole("button", { name: "Saved to My Media Database" })).toBeTruthy();

    fireEvent.click(screen.getByTestId("button-plan-story-outreach-91"));
    await waitFor(() => expect(requests.some((request) => request.url.endsWith("/recommendations/decisions") && request.method === "PUT")).toBe(true));
    expect(screen.getByText(/saved briefs, story decisions, bookmarks, and outreach remain/i)).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-new-research-search"));

    await waitFor(() => expect((screen.getByTestId("select-research-article") as HTMLSelectElement).value).toBe(""));
    expect(screen.queryByText("Decision Contact")).toBeNull();
    expect(sessionStorage.getItem("aio.research.selection.v1::workspace-a::project-1")).toBeNull();
    expect(requests.some((request) => request.method === "DELETE")).toBe(false);
    expect(requests.some((request) => request.url.includes("/store/media-db/outreach") && request.method === "DELETE")).toBe(false);
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

  it("keeps live-search failure visible with a retry and server-run rehydration guidance", async () => {
    featureState.quotaFailure = "live";
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    fireEvent.click(await screen.findByTestId("button-discover-live"));
    expect(await screen.findByRole("button", { name: "Retry live search" })).toBeTruthy();
    expect(screen.getByTestId("status-live-discovery")).toBeTruthy();
    expect(screen.queryByTestId("empty-live-discovery")).toBeNull();
    expect(screen.getByText(/Server-persisted runs are rehydrated when you return to this article.*timeout does not delete them/i)).toBeTruthy();
    featureState.quotaFailure = "";
    fireEvent.click(screen.getByRole("button", { name: "Retry live search" }));
    expect(await screen.findByText("Jane Reporter")).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("status-live-discovery")).toBeNull());
  });

  it("shows concise empty feedback after success and recovers it on remount without a timer", async () => {
    delayedRequests.live = true;
    const first = render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    fireEvent.click(await screen.findByTestId("button-discover-live"));
    await waitFor(() => expect(delayedRequests.liveCalls).toHaveLength(1));
    expect(screen.queryByTestId("empty-live-discovery")).toBeNull();
    await act(async () => delayedRequests.liveCalls[0].resolve(new Response(JSON.stringify({
      ok: true, items: [], discoveryToken: "",
    }), { status: 200 })));

    expect(await screen.findByTestId("empty-live-discovery")).toHaveTextContent("No additional journalists found");
    expect(screen.queryByTestId("status-live-discovery")).toBeNull();
    expect(screen.queryByText(/Elapsed this session:/)).toBeNull();
    expect(screen.getByText("Decision Contact")).toBeTruthy();
    first.unmount();
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    expect(await screen.findByTestId("empty-live-discovery")).toBeTruthy();
    expect(screen.queryByTestId("status-live-discovery")).toBeNull();

    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-2" } });
    expect(screen.queryByTestId("empty-live-discovery")).toBeNull();
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    expect(await screen.findByTestId("empty-live-discovery")).toBeTruthy();
    fireEvent.click(await screen.findByTestId("button-discover-live"));
    await waitFor(() => expect(delayedRequests.liveCalls).toHaveLength(2));
    expect(screen.queryByTestId("empty-live-discovery")).toBeNull();
    expect(screen.getByTestId("status-live-discovery")).toBeTruthy();
    await act(async () => delayedRequests.liveCalls[1].resolve(new Response(JSON.stringify({
      ok: true, items: [], discoveryToken: "",
    }), { status: 200 })));
    expect(await screen.findByTestId("empty-live-discovery")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-new-research-search"));
    expect(screen.queryByTestId("empty-live-discovery")).toBeNull();
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    await waitFor(() => expect(screen.getByTestId("button-discover-live")).not.toBeDisabled());
    expect(screen.queryByTestId("empty-live-discovery")).toBeNull();
  });

  it("rehydrates article-scoped empty server history and suppresses it after reset", async () => {
    serverDiscoveryHistory.latest = { runId: "empty-run", status: "succeeded", items: [], discoveryToken: "" };
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    expect(await screen.findByTestId("empty-live-discovery")).toHaveTextContent("No additional journalists found");
    expect(screen.queryByTestId("status-live-discovery")).toBeNull();
    expect(screen.queryByText(/Elapsed this session:/)).toBeNull();
    serverDiscoveryHistory.latest = null;
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-2" } });
    expect(screen.queryByTestId("empty-live-discovery")).toBeNull();
    serverDiscoveryHistory.latest = { runId: "empty-run", status: "succeeded", items: [], discoveryToken: "" };
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    expect(await screen.findByTestId("empty-live-discovery")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-new-research-search"));
    expect(screen.queryByTestId("empty-live-discovery")).toBeNull();
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    await waitFor(() => expect(screen.getByTestId("button-discover-live")).not.toBeDisabled());
    expect(screen.queryByTestId("empty-live-discovery")).toBeNull();
  });

  it.each([
    "Live media research received an unusable search response. No completed result was available. Please try again.",
    "Live media research returned potential journalists, but their search-source references could not be verified. Please try again.",
  ])("restores a failed search without presenting it as empty success: %s", async (error) => {
    serverDiscoveryHistory.latest = { runId: "invalid-provider-run", status: "failed", items: [], error, discoveryToken: "" };
    const first = render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    expect(await screen.findByText(error)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry live search" })).toBeTruthy();
    expect(screen.queryByTestId("empty-live-discovery")).toBeNull();
    first.unmount();
    clearAiRuns();
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    expect(await screen.findByText(error)).toBeTruthy();
    expect(requests.some((request) => request.url.endsWith("/content/media-discover"))).toBe(false);
    expect(screen.queryByTestId("empty-live-discovery")).toBeNull();
    // Other stories do not receive this run from the real scoped API.
    // Use an empty latest fixture for the new scope.
    serverDiscoveryHistory.latest = null;
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-2" } });
    await waitFor(() => expect(screen.queryByText(error)).toBeNull());
  });

  it("retains a failed source card on remount rather than showing empty feedback or allowing review", async () => {
    serverDiscoveryHistory.latest = {
      runId: "source-failed-run", status: "succeeded", discoveryToken: "",
      items: [{ ...candidate, evidenceStatus: "failed", evidenceFailure: "The cited page could not be checked." }],
    };
    const first = render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    expect(await screen.findByText("The cited page could not be checked.")).toBeTruthy();
    expect(screen.queryByTestId("empty-live-discovery")).toBeNull();
    expect(screen.queryByRole("button", { name: /send for review/i })).toBeNull();
    first.unmount();
    clearAiRuns();
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    expect(await screen.findByText("The cited page could not be checked.")).toBeTruthy();
    expect(screen.queryByTestId("empty-live-discovery")).toBeNull();
  });

  it("keeps incremental evidence counts and review controls visible while the search runs", async () => {
    const originalFetch = globalThis.fetch;
    let finishPoll: ((response: Response) => void) | undefined;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/content/media-discover")) {
        return new Response(JSON.stringify({ runId: "incremental-run" }), { status: 200 });
      }
      if (url.endsWith("/content/journalist-search-runs/incremental-run")) {
        if (!finishPoll) {
          finishPoll = () => {};
          return new Response(JSON.stringify({
            status: "running", discoveryToken: "verified-token",
            items: [
              { ...candidate, evidenceStatus: "verified" },
              { ...candidate, candidateKey: "pending-2", firstName: "Pending", evidenceStatus: "pending" },
            ],
          }), { status: 200 });
        }
        return new Promise<Response>((resolve) => { finishPoll = resolve; });
      }
      return originalFetch(input, init);
    }));
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    fireEvent.click(await screen.findByTestId("button-discover-live"));
    expect(await screen.findByText("Jane Reporter")).toBeTruthy();
    expect(screen.getByTestId("status-live-discovery")).toHaveTextContent("Checking evidence");
    expect(screen.getByTestId("status-live-discovery")).toHaveTextContent("1 verified, 1 pending");
    expect(screen.getByRole("button", { name: /send for review/i })).not.toBeDisabled();
    expect(screen.queryByTestId("empty-live-discovery")).toBeNull();
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("/journalist-search-runs/incremental-run"))).toHaveLength(2), { timeout: 3000 });
    await act(async () => finishPoll?.(new Response(JSON.stringify({
      status: "succeeded", items: [{ ...candidate, evidenceStatus: "verified" }], discoveryToken: "verified-token",
    }), { status: 200 })));
    await waitFor(() => expect(screen.queryByTestId("status-live-discovery")).toBeNull());
    expect(screen.getByText("Jane Reporter")).toBeTruthy();
  });

  it("offers the same explained online search after a persisted no-result match and runs it explicitly", async () => {
    recommendationState.includeContact = false;
    render(<MediaResearchPage />);
    expect(screen.queryByTestId("button-find-journalists")).toBeNull();
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    await waitFor(() => expect(screen.getAllByDisplayValue("Clean energy").length).toBeGreaterThan(0));
    const findButton = await screen.findByTestId("button-find-journalists");
    expect(findButton).toHaveAccessibleName("Find additional journalists online");
    expect(findButton.getAttribute("aria-describedby")).toBe("research-live-search-help");
    expect(screen.getByText(/Optional live search.*Public web discoveries.*review and approved/i)).toBeTruthy();
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
    const sectors = await screen.findByRole("combobox", { name: "Media sectors" }) as HTMLSelectElement;
    await waitFor(() => expect(Array.from(sectors.options).map((option) => option.value)).toEqual(["", "Energy", "Technology", "Finance"]));
    expect(sectors.multiple).toBe(false);
    expect(screen.getByText(/Choose one sector from your Media Database categories/i)).toBeTruthy();
    expect(screen.queryByLabelText("Audience")).toBeNull();
    expect(screen.queryByLabelText("Why now")).toBeNull();
    expect(screen.getByText("clean energy platform")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Global" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "UK" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "US" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Europe" })).toBeNull();
  });

  it("normalizes saved multi-sector briefs to the first saved sector without writing until save", async () => {
    recommendationState.brief = {
      topic: "Clean energy",
      angle: "Platform launch",
      audience: "B2B",
      regions: ["Global"],
      publicationTypes: ["Technology", "Finance", "Energy"],
      whyNow: "",
    };
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    const sectors = await screen.findByTestId("select-media-sector") as HTMLSelectElement;
    await waitFor(() => expect(sectors.value).toBe("Technology"));
    expect(requests.some((request) => request.url.endsWith("/recommendations/brief") && request.method === "PUT")).toBe(false);

    fireEvent.change(sectors, { target: { value: "Finance" } });
    fireEvent.click(screen.getByTestId("button-recommend-contacts"));
    await waitFor(() => expect(requests.some((request) =>
      request.url.endsWith("/recommendations/brief")
      && request.method === "PUT"
      && JSON.stringify(request.body?.brief).includes("\"publicationTypes\":[\"Finance\"]"),
    )).toBe(true));
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

  it("limits Story outreach CSV to explicitly selected contacts when the shortlist exceeds 25", async () => {
    recommendationState.includeContact = false;
    decisionState.payload = {
      decisions: Array.from({ length: 26 }, (_, index) => ({ contactId: index + 100, decision: "shortlisted" })),
      items: [],
      decisionContacts: Array.from({ length: 26 }, (_, index) => ({
        contactId: index + 100,
        contact: {
          id: index + 100, firstName: `Reporter${index}`, lastName: "Test", role: "Reporter",
          email: "", phone: "", notes: "", beats: [], sectors: [], outletName: "Test Publication",
        },
      })),
    };
    const createObjectURL = vi.fn(() => "blob:media-test");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    const download = await screen.findByTestId("button-export-shortlist-csv") as HTMLButtonElement;
    expect(download.disabled).toBe(true);
    expect(screen.getByText(/choose up to 25 contacts per download/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Reporter0 Test for CSV" }));
    expect(download.disabled).toBe(false);
    fireEvent.click(download);
    await waitFor(() => expect(requests.some((request) =>
      request.url.endsWith("/store/media-db/export") && request.method === "POST"
        && request.body?.scope === "selected" && request.body?.type === "contacts"
        && JSON.stringify(request.body?.ids) === "[100]"
    )).toBe(true));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledOnce());
    // Keep the URL mock installed until the delayed download cleanup runs.
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:media-test"), { timeout: 2500 });
    click.mockRestore();
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

  it("keeps story outreach shortlist cards concise while preserving fit, confidence, readiness, provenance, and restrictions", () => {
    render(
      <RecommendationCard
        isShortlist
        item={{
          rank: 1,
          score: 12,
          reasons: ["This legacy score is not editorial fit."],
          restricted: true,
          assessment: {
            version: "editorial-v1",
            fitScore: null,
            confidence: "low",
            evidenceCoverage: 0,
            factors: [{ key: "beat", label: "Beat match", weight: 50, score: null, reason: "No checked evidence." }],
            readiness: { status: "blocked", reasons: ["Do not contact restriction is active."] },
            evidence: [],
            warnings: ["No source evidence has been checked."],
            suggestedAngle: null,
          },
          contact: {
            id: 97,
            outletId: 5,
            firstName: "Casey",
            lastName: "Reporter",
            role: "Reporter",
            email: "",
            phone: "",
            notes: "Internal follow-up note",
            accountId: null,
            outletName: "Example Daily",
            publicationReach: "50k-100k",
            sourceRef: "Imported contacts row 8",
            sourceStatus: "unverified",
          },
        }}
        onAccept={() => undefined}
        onToggleRestriction={() => undefined}
      />,
    );

    expect(screen.getByText("Editorial fit: Not assessed")).toBeTruthy();
    expect(screen.getByTestId("editorial-assessment").textContent).toContain("Evidence confidence: low");
    expect(screen.getByTestId("editorial-assessment").textContent).toContain("Contact readiness: Blocked");
    expect(screen.getByText(/Limited checked evidence.*Review recent bylines/i)).toBeTruthy();
    expect(screen.queryByText(/Source reach|50k-100k/)).toBeNull();
    expect(document.querySelector('[title*="readership"]')).toBeNull();
    expect(screen.getByTestId("contact-provenance-97").textContent).toContain("Imported contacts row 8");
    expect(screen.getByTestId("contact-restricted-97")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove restriction" })).toBeTruthy();
    expect(screen.queryByText("Why this matches")).toBeNull();
    expect(screen.queryByText("Weighted fit factors")).toBeNull();
    expect(screen.queryByText(/Source evidence/)).toBeNull();
    expect(screen.queryByText("Internal follow-up note")).toBeNull();
    expect(screen.queryByText("No source evidence has been checked.")).toBeNull();
    expect(screen.queryByText("This legacy score is not editorial fit.")).toBeNull();
  });

  it("retains useful recommendation rationale, weighted factors, source evidence, and notes on the full card", () => {
    const item = {
      rank: 1,
      score: 78,
      reasons: ["Coverage profile matches clean energy."],
      assessment: {
        version: "editorial-v1" as const,
        fitScore: 78,
        confidence: "medium" as const,
        evidenceCoverage: 70,
        factors: [{ key: "beat", label: "Beat match", weight: 50, score: 80, reason: "Recent coverage matches." }],
        readiness: { status: "ready" as const, reasons: [] },
        evidence: [{ title: "Recent energy coverage", url: "https://example.test/coverage", publishedAt: null, checkedAt: "2026-09-01", excerpt: "Energy transition", attribution: "page_checked" as const, authorMatched: true }],
        warnings: [],
        suggestedAngle: null,
      },
      contact: {
        id: 98,
        outletId: 5,
        firstName: "Jordan",
        lastName: "Editor",
        role: "Editor",
        email: "",
        phone: "",
        notes: "Verify remit before pitching.",
        accountId: null,
      },
    };
    const { rerender } = render(<RecommendationCard isShortlist item={item} />);
    expect(screen.queryByText("Why this matches")).toBeNull();
    expect(screen.queryByText("Weighted fit factors")).toBeNull();
    expect(screen.queryByText(/Source evidence/)).toBeNull();
    expect(screen.queryByText("Verify remit before pitching.")).toBeNull();

    rerender(<RecommendationCard item={item} />);
    expect(screen.getByText("Why this matches")).toBeTruthy();
    expect(screen.getByText("Weighted fit factors")).toBeTruthy();
    expect(screen.getByText("Source evidence (70 found)")).toBeTruthy();
    expect(screen.getByText("Verify remit before pitching.")).toBeTruthy();
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

  it("explains coverage scope and presents a readable account spend-limit error for HTTP 429", async () => {
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    expect(await screen.findByText("Decision Contact")).toBeTruthy();
    expect(screen.getByText(/global top five.*regardless of the page you are viewing.*account’s AI spend limit.*pagination does not run a coverage check/i)).toBeTruthy();
    featureState.quotaFailure = "enrich";
    fireEvent.click(screen.getByRole("button", { name: "Check top 5 recent coverage" }));
    await waitFor(() => expect(requests.some((request) => request.url.includes("/recommendations/enrich") && request.method === "POST")).toBe(true));
    expect((await screen.findByTestId("status-research-error")).textContent).toMatch(/account's AI spend limit or request quota/i);
    expect(screen.queryByText("provider quota")).toBeNull();
  });

  it("hydrates each Targeting Brief from the active project and article scope", async () => {
    render(<MediaResearchPage />);
    const selector = screen.getByTestId("select-research-article");
    fireEvent.change(selector, { target: { value: "story-1" } });
    await waitFor(() => expect(requests.some((request) => request.url.includes("/recommendations/brief?") && request.url.includes("projectId=project-1") && request.url.includes("storyKey=story-1"))).toBe(true));
    fireEvent.change(selector, { target: { value: "story-2" } });
    await waitFor(() => expect(requests.some((request) => request.url.includes("/recommendations/brief?") && request.url.includes("projectId=project-1") && request.url.includes("storyKey=story-2"))).toBe(true));
  });

  it("updates the research result without publishing its retained coverage evidence", async () => {
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    expect(await screen.findByText("Decision Contact")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Check top 5 recent coverage" }));
    expect(await screen.findByText("Enriched Contact")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/1 of up to 1 contacts in the global top five have a page-checked byline/i);
    expect(screen.getByRole("status").textContent).toMatch(/does not verify current contact details/i);
    const summary = screen.getByTestId("research-result-summary-91");
    expect(within(summary).getByText("84%")).toBeTruthy();
    expect(within(summary).getByText("Energy editor")).toBeTruthy();
    expect(screen.queryByText("Evidence and contact checks")).toBeNull();
    expect(screen.queryByText("Recent energy coverage")).toBeNull();
    expect(screen.queryByText("Author matched")).toBeNull();
    expect(screen.queryByText("Page checked")).toBeNull();
    expect(screen.queryByText(/Energy transition/)).toBeNull();
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

  it("does not let an in-flight recommendation repopulate a new-search reset", async () => {
    delayedRequests.recommendations = true;
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    await waitFor(() => expect(screen.getByTestId("button-recommend-contacts")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("button-recommend-contacts"));
    await waitFor(() => expect(delayedRequests.recommendationCalls).toHaveLength(1));
    fireEvent.click(screen.getByTestId("button-new-research-search"));
    await waitFor(() => expect((screen.getByTestId("select-research-article") as HTMLSelectElement).value).toBe(""));

    delayedRequests.recommendationCalls[0].resolve(new Response(JSON.stringify({
      ok: true,
      items: [{ rank: 1, score: 80, reasons: [], contact: { id: 91, firstName: "Late", lastName: "Response", role: "Editor" } }],
    }), { status: 200 }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(screen.queryByText("Late Response")).toBeNull();
    expect(screen.queryByTestId("status-research-error")).toBeNull();
  });

  it("ignores late live-search results after reset without issuing destructive requests", async () => {
    delayedRequests.live = true;
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    fireEvent.click(await screen.findByTestId("button-discover-live"));
    await waitFor(() => expect(delayedRequests.liveCalls).toHaveLength(1));
    fireEvent.click(screen.getByTestId("button-new-research-search"));
    await waitFor(() => expect((screen.getByTestId("select-research-article") as HTMLSelectElement).value).toBe(""));

    delayedRequests.liveCalls[0].resolve(new Response(JSON.stringify({
      ok: true,
      items: [{ ...candidate, firstName: "Late Live Result" }],
      discoveryToken: "signed-token",
    }), { status: 200 }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(screen.queryByText("Late Live Result Reporter")).toBeNull();
    expect(requests.some((request) => request.method === "DELETE")).toBe(false);
  });

  it("does not let a pre-reset live run overwrite a new same-article search", async () => {
    delayedRequests.live = true;
    render(<MediaResearchPage />);
    const selector = screen.getByTestId("select-research-article");
    fireEvent.change(selector, { target: { value: "story-1" } });
    fireEvent.click(await screen.findByTestId("button-discover-live"));
    await waitFor(() => expect(delayedRequests.liveCalls).toHaveLength(1));

    fireEvent.click(screen.getByTestId("button-new-research-search"));
    await waitFor(() => expect((selector as HTMLSelectElement).value).toBe(""));
    fireEvent.change(selector, { target: { value: "story-1" } });
    fireEvent.click(await screen.findByTestId("button-discover-live"));
    await waitFor(() => expect(delayedRequests.liveCalls).toHaveLength(2));

    delayedRequests.liveCalls[0].resolve(new Response(JSON.stringify({
      ok: true,
      items: [{ ...candidate, firstName: "Stale Before Reset" }],
      discoveryToken: "stale-token",
    }), { status: 200 }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(screen.queryByText("Stale Before Reset Reporter")).toBeNull();

    delayedRequests.liveCalls[1].resolve(new Response(JSON.stringify({
      ok: true,
      items: [{ ...candidate, firstName: "Fresh After Reset" }],
      discoveryToken: "fresh-token",
    }), { status: 200 }));
    expect(await screen.findByText("Fresh After Reset Reporter")).toBeTruthy();
    expect(screen.queryByText("Stale Before Reset Reporter")).toBeNull();
  });

  it("clears a successful app-owned live result on reset before the same article is searched again", async () => {
    delayedRequests.live = true;
    const first = render(<MediaResearchPage />);
    const selector = screen.getByTestId("select-research-article");
    fireEvent.change(selector, { target: { value: "story-1" } });
    fireEvent.click(await screen.findByTestId("button-discover-live"));
    await waitFor(() => expect(delayedRequests.liveCalls).toHaveLength(1));
    delayedRequests.liveCalls[0].resolve(new Response(JSON.stringify({
      ok: true,
      items: [{ ...candidate, firstName: "Cached Before Reset" }],
      discoveryToken: "cached-token",
    }), { status: 200 }));
    expect(await screen.findByText("Cached Before Reset Reporter")).toBeTruthy();

    fireEvent.click(screen.getByTestId("button-new-research-search"));
    await waitFor(() => expect((selector as HTMLSelectElement).value).toBe(""));
    fireEvent.change(selector, { target: { value: "story-1" } });
    await screen.findByTestId("button-discover-live");
    expect(screen.queryByText("Cached Before Reset Reporter")).toBeNull();
    expect(screen.queryByTestId("status-live-discovery")).toBeNull();

    first.unmount();
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    fireEvent.click(await screen.findByTestId("button-discover-live"));
    await waitFor(() => expect(delayedRequests.liveCalls).toHaveLength(2));
    delayedRequests.liveCalls[1].resolve(new Response(JSON.stringify({
      ok: true,
      items: [{ ...candidate, firstName: "New Search" }],
      discoveryToken: "new-token",
    }), { status: 200 }));
    expect(await screen.findByText("New Search Reporter")).toBeTruthy();
  });

  it("suppresses persisted latest results after reset and allows an explicit fresh search", async () => {
    serverDiscoveryHistory.latest = {
      runId: "persisted-before-reset",
      status: "succeeded",
      items: [{ ...candidate, firstName: "Old Server History" }],
      discoveryToken: "old-server-token",
    };
    const initial = render(<MediaResearchPage />);
    const selector = screen.getByTestId("select-research-article");
    fireEvent.change(selector, { target: { value: "story-1" } });
    expect(await screen.findByText("Old Server History Reporter")).toBeTruthy();
    const historyRequestCount = requests.filter((request) => request.url.includes("/content/journalist-search-runs/latest")).length;
    expect(historyRequestCount).toBe(1);

    fireEvent.click(screen.getByTestId("button-new-research-search"));
    await waitFor(() => expect((selector as HTMLSelectElement).value).toBe(""));
    fireEvent.change(selector, { target: { value: "story-1" } });
    await screen.findByTestId("button-discover-live");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(screen.queryByText("Old Server History Reporter")).toBeNull();
    expect(screen.queryByTestId("status-live-discovery")).toBeNull();
    expect(requests.filter((request) => request.url.includes("/content/journalist-search-runs/latest"))).toHaveLength(historyRequestCount);
    expect(requests.some((request) => request.method === "DELETE")).toBe(false);

    initial.unmount();
    render(<MediaResearchPage />);
    const remountedSelector = screen.getByTestId("select-research-article");
    fireEvent.change(remountedSelector, { target: { value: "story-1" } });
    await screen.findByTestId("button-discover-live");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(screen.queryByText("Old Server History Reporter")).toBeNull();
    expect(requests.filter((request) => request.url.includes("/content/journalist-search-runs/latest"))).toHaveLength(historyRequestCount);

    fireEvent.click(screen.getByTestId("button-discover-live"));
    expect(await screen.findByText("Jane Reporter")).toBeTruthy();
    expect(serverDiscoveryHistory.latest?.runId).toBe("persisted-before-reset");
  });

  it("ignores a latest-server response already in flight when reset and reselect occur", async () => {
    serverDiscoveryHistory.delayLatest = true;
    render(<MediaResearchPage />);
    const selector = screen.getByTestId("select-research-article");
    fireEvent.change(selector, { target: { value: "story-1" } });
    await waitFor(() => expect(serverDiscoveryHistory.latestCalls).toHaveLength(1));

    fireEvent.click(await screen.findByTestId("button-new-research-search"));
    await waitFor(() => expect((selector as HTMLSelectElement).value).toBe(""));
    fireEvent.change(selector, { target: { value: "story-1" } });
    await screen.findByTestId("button-discover-live");

    serverDiscoveryHistory.latestCalls[0](new Response(JSON.stringify({
      runId: "late-pre-reset-run",
      status: "succeeded",
      items: [{ ...candidate, firstName: "Late Server History" }],
      discoveryToken: "late-server-token",
    }), { status: 200 }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(screen.queryByText("Late Server History Reporter")).toBeNull();
    expect(serverDiscoveryHistory.latestCalls).toHaveLength(1);
  });

  it("rehydrates latest server history normally when the article was not reset", async () => {
    serverDiscoveryHistory.latest = {
      runId: "normal-server-history",
      status: "succeeded",
      items: [{ ...candidate, firstName: "Recovered Server History" }],
      discoveryToken: "recovered-server-token",
    };
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });

    expect(await screen.findByText("Recovered Server History Reporter")).toBeTruthy();
    expect(screen.queryByTestId("status-live-discovery")).toBeNull();
    expect(screen.queryByTestId("empty-live-discovery")).toBeNull();
    expect(requests.some((request) => request.url.includes("/content/journalist-search-runs/latest"))).toBe(true);
  });

  it("resumes the countdown from the server start time without learning a partial duration", async () => {
    serverDiscoveryHistory.latest = {
      runId: "resumed-timer", status: "running", items: [], discoveryToken: "",
      startedAt: new Date(Date.now() - 90_000).toISOString(),
    };
    const originalFetch = fetch;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/journalist-search-runs/resumed-timer")) return new Promise<Response>(() => {});
      return originalFetch(input, init);
    }));
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    const status = await screen.findByTestId("status-live-discovery");
    expect(status.textContent).toContain("Still working - the estimate has passed");
    expect(getAuditSampleCount("media-discover")).toBe(0);
  });

  it("counts down from one minute, stays active at zero, and learns successful completion time", async () => {
    const started = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(started);
    try {
      delayedRequests.live = true;
      render(<MediaResearchPage />);
      fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
      fireEvent.click(await screen.findByTestId("button-discover-live"));
      await waitFor(() => expect(delayedRequests.liveCalls).toHaveLength(1));
      expect(screen.getByTestId("status-live-discovery").textContent).toContain("1:00");
      expect(getAuditSampleCount("media-discover")).toBe(0);
      clock.mockReturnValue(started + 20_000);
      await waitFor(() => expect(screen.getByTestId("status-live-discovery").textContent).toContain("0:40"), { timeout: 2000 });
      clock.mockReturnValue(started + 90_000);
      await waitFor(() => expect(screen.getByTestId("status-live-discovery").textContent).toContain("Still working - the estimate has passed"), { timeout: 2000 });
      expect(screen.getByTestId("button-discover-live")).toBeDisabled();
      expect(getAuditSampleCount("media-discover")).toBe(0);
      await act(async () => {
        delayedRequests.liveCalls[0].resolve(new Response(JSON.stringify({ ok: true, items: [], discoveryToken: "" }), { status: 200 }));
        await Promise.resolve();
      });
      await waitFor(() => expect(screen.queryByTestId("status-live-discovery")).toBeNull());
      expect(getAuditDurationSeconds("media-discover")).toBe(90);
    } finally {
      clock.mockRestore();
    }
  });

  it("starts a new countdown from measured recent search durations", async () => {
    recordAuditDuration("media-discover", 40_000);
    recordAuditDuration("media-discover", 60_000);
    delayedRequests.live = true;
    render(<MediaResearchPage />);
    fireEvent.change(screen.getByTestId("select-research-article"), { target: { value: "story-1" } });
    fireEvent.click(await screen.findByTestId("button-discover-live"));
    await waitFor(() => expect(delayedRequests.liveCalls).toHaveLength(1));
    expect(screen.getByTestId("status-live-discovery").textContent).toContain("0:50");
  });

  it("keeps a delayed live run alive across navigation and ignores other-project results", async () => {
    delayedRequests.live = true;
    render(<MediaResearchPage />);
    const selector = screen.getByTestId("select-research-article");
    fireEvent.change(selector, { target: { value: "story-1" } });
    await waitFor(() => expect(screen.getByTestId("button-recommend-contacts")).toBeTruthy());
    fireEvent.click(await screen.findByTestId("button-discover-live"));
    await waitFor(() => expect(delayedRequests.liveCalls).toHaveLength(1));
    expect(screen.getByTestId("status-live-discovery").textContent).toContain("Finding sources");
    expect(screen.getByTestId("status-live-discovery").textContent).toContain("ready in approximately");
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    fireEvent.change(selector, { target: { value: "story-2" } });
    await waitFor(() => expect(screen.getByTestId("button-recommend-contacts")).toBeTruthy());
    fireEvent.click(await screen.findByTestId("button-find-journalists"));
    await waitFor(() => expect(delayedRequests.liveCalls).toHaveLength(2));
    fireEvent.change(selector, { target: { value: "story-1" } });
    await waitFor(() => expect(screen.getByTestId("button-recommend-contacts")).toBeTruthy());
    fireEvent.click(await screen.findByTestId("button-discover-live"));
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
