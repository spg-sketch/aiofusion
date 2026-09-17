// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const isoWeek = vi.hoisted(() => (date: Date) => {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  return Math.ceil(((day.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
});

const plannerFixtures = vi.hoisted(() => ({
  phrase: {
    id: "phrase-927b9d3d",
    text: "clean energy platform",
    intentGroup: "discovery" as const,
  },
  projects: [{
    id: "project-1",
    title: "Existing project",
    contentType: "Article",
    spokesperson: "",
    keyMessage: "",
    audience: "",
    channels: ["Website"],
    week: isoWeek(new Date()),
    status: "Planned" as const,
    releaseDate: "",
    notes: "",
    targetPhrases: undefined,
    targetPhraseIds: undefined,
  }],
  archive: [{
    id: "archive-1",
    title: "Archived story",
    contentType: "Article",
    spokesperson: "",
    status: "Final" as const,
    tags: [],
    body: "",
    headline: "Archived headline",
    bodyCopy: "Archived copy",
    createdAt: "2026-01-01T00:00:00.000Z",
    targetPhrases: [{
      id: "phrase-927b9d3d",
      text: "clean energy platform",
      intentGroup: "discovery" as const,
    }],
    targetPhraseIds: ["phrase-927b9d3d"],
  }],
}));
const phrase = plannerFixtures.phrase;
const plannerState = plannerFixtures;

vi.mock("../IntakeForm", () => ({
  getKeyMessages: () => [],
  getSpokespeople: () => [],
  getActiveProjectId: () => "project-1",
  loadIntakeData: () => ({
    llmQueries: { v: 1, discovery: [phrase.text], shortlist: [], comparison: [] },
  }),
}));

vi.mock("../lib/contentStore", () => ({
  loadPlannerProjects: () => plannerState.projects,
  savePlannerProjects: async (next: typeof plannerState.projects) => {
    plannerState.projects = next;
  },
  loadArchive: () => plannerState.archive,
  saveArchive: async () => undefined,
  archiveItemForPlanner: (project: Record<string, unknown>, id: string) => ({ ...project, id, status: "Draft", tags: [], body: project.body || "" }),
  plannerProjectForArchive: (item: Record<string, unknown>, existing: Record<string, unknown> | undefined, fields: Record<string, unknown>) => ({
    ...existing, ...item, sourceArchiveId: item.id, ...fields, id: existing?.id || "planner-linked",
  }),
  useContentStore: () => 1,
  getContentStoreState: () => ({ status: "ready", mutationPending: false, mutationError: null }),
  initContentStore: vi.fn(),
  getISOWeek: isoWeek,
  weekDateLabel: (week: number) => `2026-01-${String(week).padStart(2, "0")}`,
  DEFAULT_SCORING: {},
  STATUS_COLOURS: {
    Planned: { bg: "#eee", fg: "#111" },
    Drafting: { bg: "#eee", fg: "#111" },
    Review: { bg: "#eee", fg: "#111" },
    Approved: { bg: "#eee", fg: "#111" },
  },
  scoreProject: () => ({ visibility: 10, authority: 10 }),
  aggregatePlanScore: () => ({ visibility: 10, authority: 10, total: 20, byType: {} }),
  loadScoringConfig: () => ({
    channels: ["Website"],
    channelBase: 1,
    channelStep: 1,
    channelCap: 5,
    statusMultipliers: { Approved: 1, Review: 1, Drafting: 1, Planned: 1 },
    typeWeights: { Article: { vis: 1, auth: 1 } },
  }),
  saveScoringConfig: async () => undefined,
}));

import { PlannerPage } from "./PlannerPage";

describe("PlannerPage exact target phrases", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      disconnect() {}
    });
    plannerState.projects = [{
      id: "project-1",
      title: "Existing project",
      contentType: "Article",
      spokesperson: "",
      keyMessage: "",
      audience: "",
      channels: ["Website"],
      week: isoWeek(new Date()),
      status: "Planned",
      releaseDate: "",
      notes: "",
      targetPhrases: undefined,
      targetPhraseIds: undefined,
    }];
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("persists edit selections and carries phrase snapshots from archive", async () => {
    render(<PlannerPage onNavigate={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("button", { name: "List View" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Edit Existing project" })[0]);
    fireEvent.click(screen.getByRole("checkbox", { name: `Target phrase ${phrase.text}` }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(plannerState.projects[0].targetPhraseIds).toEqual([phrase.id]));
    expect(plannerState.projects[0].targetPhrases).toEqual([phrase]);

    fireEvent.click(screen.getByRole("button", { name: "Add from archive" }));
    fireEvent.click(screen.getByRole("button", { name: /Archived story/ }));
    await waitFor(() => expect(plannerState.projects.some((project) => project.title === "Archived story")).toBe(true));
    const archived = plannerState.projects.find((project) => project.title === "Archived story");
    expect(archived?.targetPhrases).toEqual([phrase]);
    expect(archived?.targetPhraseIds).toEqual([phrase.id]);
  });
});