// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const intake = vi.hoisted(() => ({
  formData: { "4.1": "Regression project" } as Record<string, unknown>,
  llmQueries: { v: 1 as const, discovery: ["durable clean energy"] as string[], shortlist: [] as string[], comparison: [] as string[] },
}));

vi.mock("../IntakeForm", () => ({
  loadIntakeData: () => intake,
  getActiveProjectId: () => "project-1",
  getKeyMessages: () => [{ tag: "M1", short: "Existing message", long: "Existing message feedback" }],
  getSpokespeople: () => [{ name: "Alex Smith", title: "CEO", linkedin: "" }],
  getProjectMediaCategories: () => [],
  getProjectDataMessages: () => [],
  getCompetitors: () => [],
  getConfirmedEntity: () => null,
}));

vi.mock("../lib/contentAi", () => ({
  apiBase: () => "",
  streamContent: vi.fn(),
  buildProjectDataText: () => "",
  CONTENT_AI_TIMEOUT_MS: 1000,
  escapeHtml: (value: string) => value,
  safeHttpUrl: (value: string) => value,
  GenerationProgress: () => null,
  textToHtmlParagraphs: (value: string) => value,
  downloadWordDocument: vi.fn(),
}));
vi.mock("../lib/databaseCategories", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/databaseCategories")>()),
  useDatabaseCategories: () => ({
    categories: ["Clean Energy"],
    status: "ready",
    error: "",
    retry: vi.fn(),
  }),
}));
vi.mock("../InfoTip", () => ({ default: () => null }));
vi.mock("../components/CountdownBanner", () => ({ default: () => null }));

import {
  getContentStoreState,
  initContentStore,
  loadArchive,
  loadPlannerProjects,
  type ArchiveItem,
  type PlannerProject,
} from "../lib/contentStore";
import { ContentCreatorPage } from "./ContentCreatorPage";
import { OptimiserPage } from "./OptimiserPage";
import { ArchivePage } from "./ArchivePage";
import { PlannerPage } from "./PlannerPage";

type StoredArchive = ArchiveItem & { projectId: string };
type StoredPlanner = PlannerProject & { projectId: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let serverArchive: StoredArchive[] = [];
let serverPlanner: StoredPlanner[] = [];
let failArchiveWrite = false;
let failPlannerWrite = false;
let plannerWriteGate: Promise<void> | null = null;
let releasePlannerWrite: (() => void) | null = null;

function installStoreServer() {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method || "GET";
    if (url.endsWith("/api/store/scoring-config")) return json({ config: null });
    if (url.endsWith("/api/store/media-db/categories")) return json({ categories: ["Clean Energy"] });

    if (url.includes("/api/store/archive")) {
      if (method === "GET") return json({ items: serverArchive });
      if (failArchiveWrite) return json({ error: "offline" }, 503);
      const item = JSON.parse(String(init.body)) as StoredArchive;
      if (method === "POST") serverArchive = [item, ...serverArchive.filter((old) => old.id !== item.id)];
      if (method === "PUT") serverArchive = serverArchive.map((old) => old.id === item.id ? item : old);
      return json({ item });
    }

    if (url.includes("/api/store/planner")) {
      if (method === "GET") return json({ items: serverPlanner });
      if (plannerWriteGate) await plannerWriteGate;
      if (failPlannerWrite) return json({ error: "offline" }, 503);
      const item = JSON.parse(String(init.body)) as StoredPlanner;
      if (method === "POST") serverPlanner = [item, ...serverPlanner.filter((old) => old.id !== item.id)];
      if (method === "PUT") serverPlanner = serverPlanner.map((old) => old.id === item.id ? item : old);
      return json({ item });
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  }));
}

async function ready(archive: StoredArchive[] = [], planner: StoredPlanner[] = []) {
  serverArchive = archive;
  serverPlanner = planner;
  installStoreServer();
  await initContentStore();
  expect(getContentStoreState().status).toBe("ready");
}

function fillCreator(headline = "Creator retained headline") {
  fireEvent.change(screen.getByPlaceholderText("e.g. AI Authority is the New PR Battleground"), { target: { value: headline } });
  fireEvent.change(screen.getByPlaceholderText(/Paste the interview transcript/), { target: { value: "Creator retained body" } });
}

function fillOptimiser(title = "Optimiser retained title") {
  fireEvent.change(screen.getByPlaceholderText("e.g. Q2 product launch announcement"), { target: { value: title } });
  fireEvent.change(screen.getByPlaceholderText(/Paste your press release/), { target: { value: "Optimiser retained body" } });
}

describe("Push to Comms Planner stays on the current page", () => {
  beforeEach(() => {
    failArchiveWrite = false;
    failPlannerWrite = false;
    plannerWriteGate = null;
    releasePlannerWrite = null;
    window.alert = vi.fn();
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("Creator waits for persistence, stays put, retains fields, and reuses the linked row", async () => {
    const pubDate = new Date().toISOString().slice(0, 10);
    const source: StoredArchive = {
      id: "creator-canonical",
      projectId: "project-1",
      title: "Creator source",
      contentType: "Article",
      spokesperson: "Alex Smith",
      status: "Draft",
      tags: ["creator"],
      body: "Old headline\n\nOld standfirst\n\nOld body",
      headline: "Old headline",
      standfirst: "Old standfirst",
      bodyCopy: "Old body",
      actionNotes: "Keep this metadata",
      selectedMessages: ["Existing message feedback"],
      mediaCats: ["Clean Energy"],
      pubDate,
      targetPhrases: [{ id: "phrase-durable", text: "durable clean energy", intentGroup: "discovery" }],
      targetPhraseIds: ["phrase-durable"],
      createdAt: new Date().toISOString(),
      source: "creator",
    };
    await ready([source]);
    window.localStorage.setItem("aio.creator.preload", source.id);
    plannerWriteGate = new Promise<void>((resolve) => { releasePlannerWrite = resolve; });
    const navigate = vi.fn();
    const creator = render(<ContentCreatorPage onNavigate={navigate} />);
    expect((await screen.findAllByText(/durable clean energy/)).length).toBeGreaterThan(0);
    fillCreator();

    fireEvent.click(screen.getByRole("button", { name: /Push to Comms Planner/i }));
    await waitFor(() => expect(serverArchive).toHaveLength(1));
    expect(serverPlanner).toHaveLength(0);
    expect(window.alert).not.toHaveBeenCalledWith(expect.stringContaining("pushed to the Comms Planner"));
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Creator retained headline")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Creator retained body")).toBeInTheDocument();

    releasePlannerWrite?.();
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("pushed to the Comms Planner")));
    const linkedId = serverPlanner[0].id;
    expect(serverPlanner[0]).toMatchObject({
      sourceArchiveId: serverArchive[0].id,
      headline: "Creator retained headline",
      bodyCopy: "Creator retained body",
      actionNotes: "Keep this metadata",
      selectedMessages: ["Existing message feedback"],
      mediaCats: ["Clean Energy"],
      pubDate,
      releaseDate: pubDate,
      targetPhrases: [{ id: "phrase-durable", text: "durable clean energy", intentGroup: "discovery" }],
      targetPhraseIds: ["phrase-durable"],
    });
    expect(serverPlanner[0].week).toBeGreaterThan(0);
    expect(navigate).not.toHaveBeenCalled();

    vi.mocked(window.alert).mockClear();
    fireEvent.change(screen.getByPlaceholderText("e.g. AI Authority is the New PR Battleground"), { target: { value: "Creator updated headline" } });
    plannerWriteGate = null;
    fireEvent.click(screen.getByRole("button", { name: /Push to Comms Planner/i }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("pushed to the Comms Planner")));
    expect(serverPlanner).toHaveLength(1);
    expect(serverPlanner[0].headline).toBe("Creator updated headline");
    expect(serverPlanner[0].id).toBe(linkedId);
    expect(serverPlanner[0].sourceArchiveId).toBe(serverArchive[0].id);
    expect(navigate).not.toHaveBeenCalled();

    creator.unmount();
    render(<PlannerPage onNavigate={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Calendar View" })[0]);
    expect(await screen.findByRole("button", { name: "Open Creator updated headline in Content Optimiser" })).toBeInTheDocument();
    expect(screen.getByText(/1 target/)).toBeInTheDocument();
    expect(screen.getByTitle("durable clean energy")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Creator updated headline release date/ })).toHaveTextContent(pubDate);
  });

  it("Creator retains its inputs and save feedback when planner persistence is rejected", async () => {
    await ready();
    failPlannerWrite = true;
    const navigate = vi.fn();
    render(<ContentCreatorPage onNavigate={navigate} />);
    fillCreator();

    fireEvent.click(screen.getByRole("button", { name: /Push to Comms Planner/i }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("planner row was not saved")));
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("Saved"));
    expect(screen.getByDisplayValue("Creator retained headline")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Creator retained body")).toBeInTheDocument();
    expect(serverPlanner).toHaveLength(0);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("Optimiser awaits successful persistence without navigating or clearing fields", async () => {
    await ready();
    const navigate = vi.fn();
    render(<OptimiserPage onNavigate={navigate} />);
    fillOptimiser();

    fireEvent.click(screen.getByRole("button", { name: /Push to Comms Planner/i }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("added to the Comms Planner")));
    expect(serverPlanner).toHaveLength(1);
    expect(serverPlanner[0]).toMatchObject({ title: "Optimiser retained title", bodyCopy: "Optimiser retained body" });
    expect(screen.getByDisplayValue("Optimiser retained title")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Optimiser retained body")).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("Optimiser retains its entered content and feedback when planner persistence is rejected", async () => {
    await ready();
    failPlannerWrite = true;
    const navigate = vi.fn();
    render(<OptimiserPage onNavigate={navigate} />);
    fillOptimiser();

    fireEvent.click(screen.getByRole("button", { name: /Push to Comms Planner/i }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("planner row was not saved")));
    expect(serverArchive).toHaveLength(1);
    expect(serverPlanner).toHaveLength(0);
    expect(screen.getByDisplayValue("Optimiser retained title")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Optimiser retained body")).toBeInTheDocument();
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("Saved"));
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each([
    ["Creator", fillCreator],
    ["Optimiser", fillOptimiser],
  ])("%s stops before planner persistence when its library save fails", async (name, fill) => {
    await ready();
    failArchiveWrite = true;
    const navigate = vi.fn();
    render(name === "Creator"
      ? <ContentCreatorPage onNavigate={navigate} />
      : <OptimiserPage onNavigate={navigate} />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: /Push to Comms Planner/i }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("not saved")));
    expect(serverPlanner).toHaveLength(0);
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some(([url, init]) =>
      String(url).includes("/api/store/planner") && ((init as RequestInit | undefined)?.method || "GET") !== "GET",
    )).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("Content Library push retains filters and feedback without navigating on success or failure", async () => {
    const item: StoredArchive = {
      id: "archive-filtered",
      projectId: "project-1",
      title: "Filtered launch story",
      contentType: "Article",
      spokesperson: "Alex Smith",
      status: "Final",
      tags: ["launch"],
      body: "Saved body details",
      headline: "Saved headline details",
      bodyCopy: "Saved body details",
      createdAt: new Date().toISOString(),
      source: "creator",
    };
    await ready([item]);
    const navigate = vi.fn();
    render(<ArchivePage onNavigate={navigate} />);
    const query = screen.getByLabelText("Enter keyword");
    fireEvent.change(query, { target: { value: "Filtered" } });
    fireEvent.change(screen.getByLabelText("Filter by content type"), { target: { value: "Article" } });

    fireEvent.click(screen.getByRole("button", { name: "Push to Comms Planner" }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("added to the Comms Planner")));
    expect(query).toHaveValue("Filtered");
    expect(screen.getByLabelText("Filter by content type")).toHaveValue("Article");
    expect(navigate).not.toHaveBeenCalled();
    expect(serverPlanner[0]).toMatchObject({ sourceArchiveId: item.id, headline: "Saved headline details", bodyCopy: "Saved body details" });

    failPlannerWrite = true;
    serverPlanner = [];
    await act(async () => { await initContentStore(); });
    fireEvent.click(screen.getByRole("button", { name: "Push to Comms Planner" }));
    await waitFor(() => expect(screen.getByText(/planner item was not saved/i)).toBeInTheDocument());
    expect(query).toHaveValue("Filtered");
    expect(screen.getByText(/planner item was not saved/i)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
    expect(loadArchive()[0].id).toBe(item.id);
    expect(loadPlannerProjects()).toHaveLength(0);
  });
});