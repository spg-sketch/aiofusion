// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const fixtures = vi.hoisted(() => ({
  phrase: { id: "phrase-abc12345", text: "clean energy platform", intentGroup: "discovery" as const },
  planner: [{
    id: "planner-source",
    title: "Planner source",
    contentType: "Article",
    spokesperson: "",
    keyMessage: "",
    audience: "",
    channels: [],
    week: 1,
    status: "Planned" as const,
    releaseDate: "",
    notes: "",
    headline: "Planner headline",
    bodyCopy: "Planner body",
    targetPhrases: [] as Array<{ id: string; text: string; intentGroup: "discovery" }>,
    targetPhraseIds: [] as string[],
  }],
  archive: [{
    id: "archive-source",
    title: "Archive source",
    contentType: "Article",
    spokesperson: "",
    status: "Final" as const,
    tags: [],
    body: "Archive headline\n\nArchive body",
    headline: "Archive headline",
    bodyCopy: "Archive body",
    createdAt: "2026-01-01T00:00:00.000Z",
    mediaCats: undefined as string[] | undefined,
    targetPhrases: [] as Array<{ id: string; text: string; intentGroup: "discovery" }>,
    targetPhraseIds: [] as string[],
  }],
  savedArchive: [] as unknown[],
  savedPlanner: [] as unknown[],
  categories: ["Technology", "Energy"],
}));

vi.mock("../IntakeForm", () => ({
  getKeyMessages: () => [],
  loadIntakeData: () => ({}),
  getActiveProjectId: () => "project-1",
  getProjectMediaCategories: () => [],
  getProjectDataMessages: () => [],
  getSpokespeople: () => [],
}));
vi.mock("../lib/contentAi", () => ({
  streamContent: vi.fn(),
  buildProjectDataText: () => "",
  CONTENT_AI_TIMEOUT_MS: 1000,
  escapeHtml: (value: string) => value,
  safeHttpUrl: (value: string) => value,
  GenerationProgress: () => null,
  textToHtmlParagraphs: () => "",
  downloadWordDocument: vi.fn(),
}));
vi.mock("../lib/contentStore", () => ({
  loadArchive: () => fixtures.archive,
  saveArchive: async (items: unknown[]) => { fixtures.savedArchive.push(items); },
  loadPlannerProjects: () => fixtures.planner,
  savePlannerProjects: async (items: unknown[]) => { fixtures.savedPlanner.push(items); },
  plannerProjectForArchive: (item: Record<string, unknown>, existing: Record<string, unknown> | undefined, fields: Record<string, unknown>) => ({
    ...existing, ...item, sourceArchiveId: item.id, ...fields, id: existing?.id || "planner-linked",
  }),
  useContentStore: () => 1,
  splitArchiveBody: (item: { headline?: string; bodyCopy?: string; body?: string }) => ({
    headline: item.headline || "",
    standfirst: "",
    bodyCopy: item.bodyCopy || item.body || "",
  }),
  getISOWeek: () => 1,
  weekDateLabel: (week: number) => String(week),
  isLinkedPlannerSyncError: () => false,
}));
vi.mock("./shared", () => ({
  CategoryPickerModal: () => null,
  CONTENT_TYPES: ["Article"],
  Labelled: ({ children, label }: { children: ReactNode; label: string }) => <label>{label}{children}</label>,
  countWords: (value: string) => value.trim() ? value.trim().split(/\s+/).length : 0,
}));
vi.mock("../InfoTip", () => ({ default: () => null }));
vi.mock("../components/CountdownBanner", () => ({ default: () => null }));

import { OptimiserPage } from "./OptimiserPage";
import { streamContent } from "../lib/contentAi";
import { assessArticleOptimisation } from "../lib/articleScoring";

describe("OptimiserPage target phrase round trips", () => {
  beforeEach(() => {
    fixtures.savedArchive = [];
    fixtures.savedPlanner = [];
    fixtures.planner[0].targetPhrases = [fixtures.phrase];
    fixtures.planner[0].targetPhraseIds = [fixtures.phrase.id];
    fixtures.archive[0].targetPhrases = [fixtures.phrase];
    fixtures.archive[0].targetPhraseIds = [fixtures.phrase.id];
    window.alert = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/store/media-db/categories")) {
        return new Response(JSON.stringify({ categories: fixtures.categories }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    }));
  });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  async function exercise(source: "planner" | "archive") {
    window.localStorage.setItem("aio.optimiser.preload", source === "planner" ? "planner-source" : "archive-source");
    render(<OptimiserPage onNavigate={vi.fn()} />);
    expect(await screen.findByTestId("optimiser-target-phrases")).toHaveTextContent(fixtures.phrase.text);
    fireEvent.click(screen.getByRole("button", { name: /Save to Content Library/i }));
    fireEvent.click(screen.getByRole("button", { name: /Push to Comms Planner/i }));
    await waitFor(() => {
      // Saving to the library and then placing a legacy planner draft both
      // persist the complete snapshot; the latter is what establishes its
      // canonical source link.
      expect(fixtures.savedArchive.length).toBe(2);
      expect(fixtures.savedPlanner.length).toBe(1);
    });
    const archived = (fixtures.savedArchive[1] as Array<Record<string, unknown>>)[0];
    const planned = (fixtures.savedPlanner[0] as Array<Record<string, unknown>>)[0];
    expect(archived.targetPhrases).toEqual([fixtures.phrase]);
    expect(archived.targetPhraseIds).toEqual([fixtures.phrase.id]);
    expect(planned.targetPhrases).toEqual([fixtures.phrase]);
    expect(planned.targetPhraseIds).toEqual([fixtures.phrase.id]);
  }

  it("preserves phrases from planner and archive preload through both destinations", async () => {
    await exercise("planner");
    cleanup();
    window.localStorage.clear();
    fixtures.savedArchive = [];
    fixtures.savedPlanner = [];
    await exercise("archive");
  });

  it("registers clean defaults, then marks authored metadata dirty", async () => {
    let registration: Parameters<NonNullable<React.ComponentProps<typeof OptimiserPage>["registerUnsavedEditor"]>>[0] = null;
    render(
      <OptimiserPage
        onNavigate={vi.fn()}
        registerUnsavedEditor={(next) => { registration = next; }}
      />,
    );

    await waitFor(() => expect(registration?.dirty).toBe(false));
    fireEvent.change(screen.getByPlaceholderText("e.g. Q2 product launch announcement"), {
      target: { value: "A changed working title" },
    });
    await waitFor(() => expect(registration?.dirty).toBe(true));
  });

  it("defers destructive retrieval to the shared replacement guard", async () => {
    const pendingAction: { current: (() => void) | null } = { current: null };
    const requestEditorAction = vi.fn((run: () => void) => {
      pendingAction.current = run;
      return false;
    });
    render(<OptimiserPage onNavigate={vi.fn()} requestEditorAction={requestEditorAction} />);

    fireEvent.change(screen.getByPlaceholderText("e.g. Q2 product launch announcement"), {
      target: { value: "Unsaved title" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Retrieve content draft/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Archive source/i }));

    expect(requestEditorAction).toHaveBeenCalledWith(expect.any(Function), { replacing: true });
    expect(screen.getByPlaceholderText("e.g. Q2 product launch announcement")).toHaveValue("Unsaved title");
    act(() => pendingAction.current?.());
    await waitFor(() => {
      expect(screen.getByPlaceholderText("e.g. Q2 product launch announcement")).toHaveValue("Archive source");
    });
  });

  it("filters unavailable restored targets before saving or planning", async () => {
    fixtures.archive[0].mediaCats = [" technology ", "Bespoke niche"];
    window.localStorage.setItem("aio.optimiser.preload", "archive-source");
    render(<OptimiserPage onNavigate={vi.fn()} />);
    expect(await screen.findByText("Technology")).toBeTruthy();
    expect(screen.getByText(/previously saved targets are no longer/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Save to Content Library/i }));
    await waitFor(() => expect(fixtures.savedArchive.length).toBe(1));
    const archived = (fixtures.savedArchive[0] as Array<Record<string, unknown>>)[0];
    expect(archived.mediaCats).toEqual(["Technology"]);
    fixtures.archive[0].mediaCats = undefined;
  });

  it("persists only database allowlisted media categories with server labels", async () => {
    fixtures.archive[0].mediaCats = [" technology ", "not in database"];
    window.localStorage.setItem("aio.optimiser.preload", "archive-source");
    render(<OptimiserPage onNavigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Save to Content Library/i }));
    await waitFor(() => expect(fixtures.savedArchive.length).toBe(1));
    const saved = (fixtures.savedArchive[0] as Array<Record<string, unknown>>)[0];
    expect(saved.mediaCats).toEqual(["Technology"]);
  });

  it("blocks save while the category database is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("offline", { status: 503 })));
    window.localStorage.setItem("aio.optimiser.preload", "archive-source");
    render(<OptimiserPage onNavigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Save to Content Library/i }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/could not be loaded/i)));
    expect(fixtures.savedArchive).toHaveLength(0);
  });
});

describe("OptimiserPage article assessment", () => {
  beforeEach(() => {
    fixtures.savedArchive = [];
    window.alert = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/store/media-db/categories")) {
        return new Response(JSON.stringify({ categories: fixtures.categories }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    }));
    vi.mocked(streamContent).mockResolvedValue({
      headline: "A clearer clean energy platform headline",
      standfirst: "A concise summary grounded in measurable project detail.",
      bodyCopy: "The clean energy platform gives teams a direct answer.\n\nResearch data supports the result because each claim is presented with evidence.\n\nThe structured conclusion explains what the result means.",
      changeLog: [{ kind: "structure", text: "Added answer-first structure" }],
    });
  });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("calculates real scores, explains the percentage-point change and saves the assessment", async () => {
    window.localStorage.setItem("aio.optimiser.preload", "archive-source");
    render(<OptimiserPage onNavigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /^Optimise$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Run optimisation/i }));
    expect(await screen.findAllByText("Article quality score", {}, { timeout: 3000 })).toHaveLength(2);
    expect(screen.getByText(/percentage-point improvement/i)).toBeInTheDocument();
    expect(screen.getByText("Structure and completeness")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Save to Content Library/i }));
    await waitFor(() => expect(fixtures.savedArchive).toHaveLength(1));
    const saved = (fixtures.savedArchive[0] as Array<Record<string, unknown>>)[0];
    expect(saved.optimisationAssessment).toMatchObject({ version: "article-quality-v1" });
  });

  it("restores a saved assessment and invalidates it on edit", async () => {
    const after = { headline: "Archive headline", standfirst: "", bodyCopy: "Archive body" };
    (fixtures.archive[0] as typeof fixtures.archive[0] & { optimisationAssessment?: unknown }).optimisationAssessment =
      assessArticleOptimisation(
        { headline: "Before headline", standfirst: "", bodyCopy: "Before body" }, after,
        { selectedMessages: [], targetPhrases: [fixtures.phrase.text], projectDetails: [] },
        [{ kind: "structure", text: "Improved structure" }],
      );
    window.localStorage.setItem("aio.optimiser.preload", "archive-source");
    render(<OptimiserPage onNavigate={vi.fn()} />);
    expect(await screen.findByText("Structure and completeness")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Headline of the piece/i), { target: { value: "Edited headline" } });
    expect(await screen.findByText("Article quality score not available")).toBeInTheDocument();
  });
});