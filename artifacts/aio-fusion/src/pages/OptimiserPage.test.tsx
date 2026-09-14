// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    targetPhrases: [] as Array<{ id: string; text: string; intentGroup: "discovery" }>,
    targetPhraseIds: [] as string[],
  }],
  savedArchive: [] as unknown[],
  savedPlanner: [] as unknown[],
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
  useContentStore: () => 1,
  splitArchiveBody: (item: { headline?: string; bodyCopy?: string; body?: string }) => ({
    headline: item.headline || "",
    standfirst: "",
    bodyCopy: item.bodyCopy || item.body || "",
  }),
  getISOWeek: () => 1,
  weekDateLabel: (week: number) => String(week),
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

describe("OptimiserPage target phrase round trips", () => {
  beforeEach(() => {
    fixtures.savedArchive = [];
    fixtures.savedPlanner = [];
    fixtures.planner[0].targetPhrases = [fixtures.phrase];
    fixtures.planner[0].targetPhraseIds = [fixtures.phrase.id];
    fixtures.archive[0].targetPhrases = [fixtures.phrase];
    fixtures.archive[0].targetPhraseIds = [fixtures.phrase.id];
    window.alert = vi.fn();
  });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  async function exercise(source: "planner" | "archive") {
    window.localStorage.setItem("aio.optimiser.preload", source === "planner" ? "planner-source" : "archive-source");
    render(<OptimiserPage onNavigate={vi.fn()} />);
    expect(await screen.findByTestId("optimiser-target-phrases")).toHaveTextContent(fixtures.phrase.text);
    fireEvent.click(screen.getByRole("button", { name: /Save to Content Library/i }));
    fireEvent.click(screen.getByRole("button", { name: /Push to Comms Planner/i }));
    await waitFor(() => {
      expect(fixtures.savedArchive.length).toBe(1);
      expect(fixtures.savedPlanner.length).toBe(1);
    });
    const archived = (fixtures.savedArchive[0] as Array<Record<string, unknown>>)[0];
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
});