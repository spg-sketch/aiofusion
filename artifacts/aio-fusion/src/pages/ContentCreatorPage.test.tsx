// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({
  archive: [{
    id: "stale", title: "Stale", contentType: "Article", spokesperson: "", status: "Draft" as const,
    tags: [], body: "Headline\n\nBody", mediaCats: ["  technology  ", "Retired category"], createdAt: "2025-01-01",
  }],
  saved: [] as unknown[][],
  intake: { formData: {}, businessCategories: [" technology "], audienceCategories: ["Customers"] },
  failCategories: false,
}));

const streamContent = vi.hoisted(() => vi.fn(async () => ({ headline: "Generated", standfirst: "", bodyCopy: "Generated body" })));

vi.mock("../IntakeForm", () => ({
  loadIntakeData: () => state.intake,
  getSpokespeople: () => [],
  getKeyMessages: () => [],
  getActiveProjectId: () => "project-1",
  getProjectMediaCategories: () => [],
  getCompetitors: () => [],
  getConfirmedEntity: () => null,
}));
vi.mock("../lib/contentAi", () => ({
  streamContent,
  buildProjectDataText: () => "",
  CONTENT_AI_TIMEOUT_MS: 1000,
  escapeHtml: (value: string) => value,
  textToHtmlParagraphs: () => "",
  downloadWordDocument: vi.fn(),
  GenerationProgress: () => null,
  safeHttpUrl: (value: string) => value,
}));
vi.mock("../lib/contentStore", () => ({
  loadArchive: () => state.archive,
  saveArchive: async (items: unknown[]) => { state.saved.push(items); },
  useContentStore: () => 1,
  isLinkedPlannerSyncError: () => false,
  splitArchiveBody: (item: { headline?: string; bodyCopy?: string; body?: string }) => ({
    headline: item.headline || "", standfirst: "", bodyCopy: item.bodyCopy || item.body || "",
  }),
  loadPlannerProjects: () => [], savePlannerProjects: async () => undefined,
  plannerProjectForArchive: () => ({}), getISOWeek: () => 1, weekDateLabel: () => "1",
}));
vi.mock("./shared", () => ({
  CategoryPickerModal: () => null, CONTENT_TYPES: ["Article"],
  Labelled: ({ children, label }: { children: ReactNode; label: string }) => <label>{label}{children}</label>,
  countWords: (value: string) => value.trim() ? value.trim().split(/\s+/).length : 0,
}));
vi.mock("../InfoTip", () => ({ default: () => null }));
vi.mock("../components/CountdownBanner", () => ({
  default: ({ startedAt }: { startedAt?: number }) => <div data-testid="countdown">{startedAt ? "started" : "missing"}</div>,
}));
vi.mock("../LlmCheckPage", () => ({ loadSavedAudits: () => [] }));

import { ContentCreatorPage } from "./ContentCreatorPage";
import { clearAiRuns, getAiRun, setAiRunIdentity } from "../lib/aiRunLifecycle";

describe("ContentCreatorPage database category guard", () => {
  beforeEach(() => {
    state.saved = [];
    state.failCategories = false;
    streamContent.mockClear();
    window.alert = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => state.failCategories
      ? new Response("offline", { status: 503 })
      : new Response(JSON.stringify({ categories: ["Technology", "Energy"] }), { status: 200 })));
  });
  afterEach(() => { cleanup(); clearAiRuns(); window.localStorage.clear(); vi.unstubAllGlobals(); });

  it("uses the server label and filters stale restored categories in save and AI payloads", async () => {
    window.localStorage.setItem("aio.creator.preload", "stale");
    render(<ContentCreatorPage onNavigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Save to Content Library/i }));
    await waitFor(() => expect(state.saved).toHaveLength(1));
    expect((state.saved[0][0] as { mediaCats: string[] }).mediaCats).toEqual(["Technology"]);

    fireEvent.click(screen.getByRole("button", { name: /Create Content/i }));
    await waitFor(() => expect(streamContent).toHaveBeenCalled());
    const calls = streamContent.mock.calls as unknown as Array<[string, { mediaCategories: string[] }]>;
    const request = calls[0]?.[1];
    expect(request?.mediaCategories).toEqual(["Technology"]);
  });

  it("blocks save and generation on category load failure without writing", async () => {
    state.failCategories = true;
    window.localStorage.setItem("aio.creator.preload", "stale");
    render(<ContentCreatorPage onNavigate={vi.fn()} />);
    await waitFor(() => fireEvent.click(screen.getByRole("button", { name: /Save to Content Library/i })));
    expect(state.saved).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /Create Content/i }));
    expect(streamContent).not.toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/could not be loaded/i));
    expect(state.archive[0].mediaCats).toEqual(["  technology  ", "Retired category"]);
  });

  it("keeps a draft run and its fixed countdown when the page remounts", async () => {
    let resolveRun: ((value: unknown) => void) | undefined;
    let registration: Parameters<NonNullable<React.ComponentProps<typeof ContentCreatorPage>["registerUnsavedEditor"]>>[0] = null;
    streamContent.mockImplementationOnce(() => new Promise((resolve) => { resolveRun = resolve; }));
    window.localStorage.setItem("aio.creator.preload", "stale");
    const first = render(
      <ContentCreatorPage
        onNavigate={vi.fn()}
        registerUnsavedEditor={(next) => { registration = next; }}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Create Content/i }));
    await waitFor(() => expect(streamContent).toHaveBeenCalled());
    expect(screen.getByTestId("countdown")).toHaveTextContent("started");
    await waitFor(() => {
      expect(registration?.dirty).toBe(false);
      expect(registration?.busy).toBe(false);
    });
    first.unmount();
    resolveRun?.({ headline: "Recovered draft", standfirst: "", bodyCopy: "Recovered body" });
    await waitFor(() => expect(resolveRun).toBeDefined());
    window.localStorage.setItem("aio.creator.preload", "stale");
    render(<ContentCreatorPage onNavigate={vi.fn()} />);
    expect(await screen.findByDisplayValue("Recovered draft")).toBeInTheDocument();
  });

  it("restores a new unsaved creator context before and after completion", async () => {
    let resolveRun: ((value: unknown) => void) | undefined;
    streamContent.mockImplementationOnce(() => new Promise((resolve) => { resolveRun = resolve; }));
    render(<ContentCreatorPage onNavigate={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("e.g. AI Authority is the New PR Battleground"), {
      target: { value: "Unsaved creator context" },
    });
    await waitFor(() => expect(screen.getByRole("button", { name: /Create Content/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: /Create Content/i }));
    await waitFor(() => expect(streamContent).toHaveBeenCalled());
    cleanup();
    render(<ContentCreatorPage onNavigate={vi.fn()} />);
    expect(screen.getByDisplayValue("Unsaved creator context")).toBeInTheDocument();
    resolveRun?.({ headline: "Recovered unsaved draft", standfirst: "", bodyCopy: "Recovered body" });
    expect(await screen.findByDisplayValue("Recovered unsaved draft")).toBeInTheDocument();
  });

  it("finishes a person's draft run before allowing a Planner handoff", async () => {
    const username = "workspace";
    const userEmail = "member@example.test";
    window.localStorage.setItem("aio.auth.session.v3", JSON.stringify({ username, userEmail, role: "client" }));
    setAiRunIdentity(userEmail, username);
    let finish!: (value: { headline: string; standfirst: string; bodyCopy: string }) => void;
    streamContent.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    window.localStorage.setItem("aio.creator.preload", "stale");
    render(<ContentCreatorPage onNavigate={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: /Create Content/i }));
    await waitFor(() => expect(streamContent).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: /Writing draft/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Save to Content Library/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Media Research/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Push to Comms Planner/i })).toBeDisabled();
    finish({ headline: "Finished article", standfirst: "Finished summary", bodyCopy: "Finished copy" });

    expect(await screen.findByDisplayValue("Finished article")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Writing draft/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save to Content Library/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Media Research/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Push to Comms Planner/i })).toBeEnabled();
    expect(getAiRun(`${encodeURIComponent(userEmail)}:${encodeURIComponent(username)}:project-1:content-draft:stale`)?.status).toBe("succeeded");
  });
});