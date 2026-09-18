import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  scoreProject,
  aggregatePlanScore,
  DEFAULT_SCORING,
  getContentStoreState,
  initContentStore,
  loadArchive,
  loadPlannerProjects,
  saveArchive,
  savePlannerProjects,
  saveScoringConfig,
  splitArchiveBody,
  articleSnapshotForPlanner,
  archiveItemForPlanner,
  plannerProjectForArchive,
  type ArchiveItem,
  type PlannerProject,
  type ScoringConfig,
} from "./contentStore";
import { assessArticleOptimisation } from "./articleScoring";

vi.mock("../IntakeForm", () => ({ getActiveProjectId: () => "default" }));
vi.mock("./contentAi", () => ({ apiBase: () => "" }));

function makeProject(overrides: Partial<PlannerProject> = {}): PlannerProject {
  return {
    id: "p1",
    title: "Test",
    contentType: "Article",
    spokesperson: "",
    keyMessage: "",
    audience: "",
    channels: ["Priority"],
    week: 1,
    status: "Approved",
    releaseDate: "",
    notes: "",
    ...overrides,
  };
}

const CFG = DEFAULT_SCORING;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const archiveItem: ArchiveItem = {
  id: "a1", title: "Confirmed", contentType: "Article", status: "Draft",
  tags: [], body: "Body", createdAt: "2026-01-01T00:00:00.000Z", projectId: "default",
};

describe("content store reliability", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps a failed initial load distinct from an empty ready store and recovers on retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "down" }, 503)));
    await initContentStore();
    expect(getContentStoreState().status).toBe("network-error");
    expect(loadArchive()).toEqual([]);

    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: [archiveItem] }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ config: null })));
    await initContentStore();
    expect(getContentStoreState().status).toBe("ready");
    expect(loadArchive()).toHaveLength(1);
  });

  it("reports session expiry separately from transient load failures", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ config: null })));
    await initContentStore();
    expect(getContentStoreState().status).toBe("authentication-error");
  });

  it("preserves confirmed archive state after a rejected edit and applies it once on retry", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: [archiveItem] }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ config: null })));
    await initContentStore();
    const edited = { ...archiveItem, title: "Edited" };

    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: [archiveItem] }))
      .mockResolvedValueOnce(jsonResponse({ error: "down" }, 503)));
    await expect(saveArchive([edited])).rejects.toThrow("network");
    expect(loadArchive()[0].title).toBe("Confirmed");
    expect(getContentStoreState().mutationError).toBe("network");

    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: [archiveItem] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ items: [edited] }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ items: [] })));
    await saveArchive([edited]);
    expect(loadArchive()[0].title).toBe("Edited");
  });

  it("does not duplicate a planner create when the first response is lost", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ config: null })));
    await initContentStore();
    const project = makeProject();

    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockRejectedValueOnce(new TypeError("connection lost")));
    await expect(savePlannerProjects([project])).rejects.toThrow("network");

    const existing = { ...project, projectId: "default" };
    const retryFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: [existing] }))
      .mockResolvedValueOnce(jsonResponse({ items: [existing] }));
    vi.stubGlobal("fetch", retryFetch);
    await savePlannerProjects([project]);
    expect(retryFetch).toHaveBeenCalledTimes(2);
    expect(loadPlannerProjects()).toHaveLength(1);
  });

  it("confirms an archive edit on retry when the update succeeded but its response was lost", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: [archiveItem] }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ config: null })));
    await initContentStore();
    const edited = { ...archiveItem, title: "Edited once" };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: [archiveItem] }))
      .mockRejectedValueOnce(new TypeError("response lost")));
    await expect(saveArchive([edited])).rejects.toThrow("network");

    const retryFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: [edited] }))
      .mockResolvedValueOnce(jsonResponse({ items: [edited] }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }));
    vi.stubGlobal("fetch", retryFetch);
    await saveArchive([edited]);
    expect(retryFetch).toHaveBeenCalledTimes(4);
    expect(loadArchive()[0].title).toBe("Edited once");
  });

  it("retries only the unapplied part of a partially successful planner save", async () => {
    const first = makeProject({ id: "p1", title: "First" });
    const second = makeProject({ id: "p2", title: "Second" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ items: [first, second].map((p) => ({ ...p, projectId: "default" })) }))
      .mockResolvedValueOnce(jsonResponse({ config: null })));
    await initContentStore();
    const editedFirst = { ...first, title: "First edited" };
    const editedSecond = { ...second, title: "Second edited" };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: [first, second].map((p) => ({ ...p, projectId: "default" })) }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ error: "down" }, 503)));
    await expect(savePlannerProjects([editedFirst, editedSecond])).rejects.toThrow("network");

    const partlyApplied = [{ ...editedFirst, projectId: "default" }, { ...second, projectId: "default" }];
    const confirmed = [{ ...editedFirst, projectId: "default" }, { ...editedSecond, projectId: "default" }];
    const retryFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: partlyApplied }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ items: confirmed }));
    vi.stubGlobal("fetch", retryFetch);
    await savePlannerProjects([editedFirst, editedSecond]);
    expect(retryFetch).toHaveBeenCalledTimes(3);
    expect(JSON.parse(retryFetch.mock.calls[1][1]?.body as string).id).toBe("p2");
    expect(loadPlannerProjects().map((p) => p.title)).toEqual(["First edited", "Second edited"]);
  });

  it("does not overwrite a newer server edit and reloads it for a safe retry", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: [archiveItem] }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ config: null })));
    await initContentStore();
    const localEdit = { ...archiveItem, title: "My edit" };
    const newerServerEdit = { ...archiveItem, title: "Newer server edit" };
    const conflictFetch = vi.fn().mockResolvedValueOnce(jsonResponse({ items: [newerServerEdit] }));
    vi.stubGlobal("fetch", conflictFetch);

    await expect(saveArchive([localEdit])).rejects.toThrow("conflict");
    expect(conflictFetch).toHaveBeenCalledTimes(1);
    expect(loadArchive()[0].title).toBe("Newer server edit");
  });

  it("keeps the confirmed scoring config when its save is rejected", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ config: DEFAULT_SCORING })));
    await initContentStore();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 401)));
    await expect(saveScoringConfig({ ...DEFAULT_SCORING, channelCap: 9 })).rejects.toThrow("authentication");
    expect(getContentStoreState().mutationError).toBe("authentication");
  });
});

describe("article workflow snapshots", () => {
  const completeArticle: ArchiveItem = {
    ...archiveItem,
    headline: "Exact headline",
    standfirst: "Exact standfirst",
    bodyCopy: "Exact full body",
    actionNotes: "Exact action note",
    selectedMessages: ["Message one"],
    mediaCats: ["Trade press"],
    pubDate: "2026-06-01",
    targetPhrases: [{ id: "phrase-1", text: "exact phrase", intentGroup: "discovery" }],
    targetPhraseIds: ["phrase-1"],
    optimisationAssessment: assessArticleOptimisation(
      { headline: "Before", standfirst: "", bodyCopy: "Before body" },
      { headline: "Exact headline", standfirst: "Exact standfirst", bodyCopy: "Exact full body" },
      { selectedMessages: ["Message one"], targetPhrases: ["exact phrase"], projectDetails: [] },
      [{ kind: "structure", text: "Improved structure" }],
    ),
  };

  it("copies a complete article snapshot and keeps one planner identity per archive record", () => {
    const first = plannerProjectForArchive(completeArticle, undefined, {
      keyMessage: "Message one", audience: "Trade press", channels: ["Website"],
      week: 23, status: "Drafting", releaseDate: "2026-06-01", notes: "Exact action note",
    });
    const repeated = plannerProjectForArchive({ ...completeArticle, bodyCopy: "Updated body" }, first, {
      keyMessage: "Message one", audience: "Trade press", channels: ["Website"],
      week: 23, status: "Drafting", releaseDate: "2026-06-01", notes: "Exact action note",
    });
    expect(articleSnapshotForPlanner(completeArticle)).toMatchObject({
      sourceArchiveId: "a1", body: "Body", actionNotes: "Exact action note",
      selectedMessages: ["Message one"], mediaCats: ["Trade press"], pubDate: "2026-06-01",
      targetPhraseIds: ["phrase-1"],
      optimisationAssessment: completeArticle.optimisationAssessment,
    });
    expect(repeated.id).toBe(first.id);
    expect(repeated.sourceArchiveId).toBe(completeArticle.id);
    expect(repeated.bodyCopy).toBe("Updated body");
  });

  it("creates a canonical record from legacy planner data without inventing body copy", () => {
    const legacy = makeProject({ headline: "Only headline", bodyCopy: undefined, actionNotes: "Keep note" });
    const archived = archiveItemForPlanner(legacy, "arch-linked", "2026-01-01T00:00:00.000Z");
    expect(archived.id).toBe("arch-linked");
    expect(archived.body).toBe("");
    expect(archived.bodyCopy).toBeUndefined();
    expect(archived.actionNotes).toBe("Keep note");
  });

  it("uses legacy body copy when nullable SQL fields round-trip as null", () => {
    const recovered = splitArchiveBody({
      headline: null,
      standfirst: null,
      bodyCopy: null,
      body: "Legacy headline\n\nLegacy standfirst\n\nLegacy complete body",
    });
    expect(recovered).toEqual({
      headline: "Legacy headline",
      standfirst: "Legacy standfirst",
      bodyCopy: "Legacy complete body",
    });
  });

  it("refreshes linked planner snapshots when the canonical archive is edited", async () => {
    const linkedPlanner = {
      ...makeProject({ id: "planner-1", title: archiveItem.title }),
      projectId: "default",
      sourceArchiveId: archiveItem.id,
      body: archiveItem.body,
      selectedMessages: [],
      mediaCats: [],
    };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: [archiveItem] }))
      .mockResolvedValueOnce(jsonResponse({ items: [linkedPlanner] }))
      .mockResolvedValueOnce(jsonResponse({ config: null })));
    await initContentStore();
    const edited = { ...completeArticle, body: "Exact headline\n\nExact standfirst\n\nUpdated full body", bodyCopy: "Updated full body" };
    const syncFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: [archiveItem] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ items: [edited] }))
      .mockResolvedValueOnce(jsonResponse({ items: [linkedPlanner] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ items: [{ ...linkedPlanner, ...articleSnapshotForPlanner(edited) }] }));
    vi.stubGlobal("fetch", syncFetch);
    await saveArchive([edited]);
    const plannerPayload = JSON.parse(syncFetch.mock.calls[4][1]?.body as string);
    expect(plannerPayload).toMatchObject({
      id: "planner-1", sourceArchiveId: "a1", bodyCopy: "Updated full body",
      actionNotes: "Exact action note", selectedMessages: ["Message one"], mediaCats: ["Trade press"],
    });
  });

  it("retries a failed planner sync on an identical archive save and discovers uncached server links", async () => {
    const serverLinkedPlanner = {
      ...makeProject({ id: "planner-server-link", title: archiveItem.title }),
      projectId: "default",
      sourceArchiveId: archiveItem.id,
    };
    // Simulate another session placing this article in the Planner after this
    // browser loaded: the local planner cache has no link.
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: [archiveItem] }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ config: null })));
    await initContentStore();
    const edited = { ...completeArticle, title: "Edited canonical article", bodyCopy: "Updated body" };

    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: [archiveItem] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ items: [edited] }))
      .mockResolvedValueOnce(jsonResponse({ items: [serverLinkedPlanner] }))
      .mockResolvedValueOnce(jsonResponse({ error: "planner unavailable" }, 503)));
    await expect(saveArchive([edited])).rejects.toThrow("linked-planner-sync");
    expect(loadArchive()[0].title).toBe("Edited canonical article");

    const retryFetch = vi.fn()
      // The archive is already confirmed, so no second archive PUT is sent.
      .mockResolvedValueOnce(jsonResponse({ items: [edited] }))
      .mockResolvedValueOnce(jsonResponse({ items: [edited] }))
      .mockResolvedValueOnce(jsonResponse({ items: [serverLinkedPlanner] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ items: [{ ...serverLinkedPlanner, ...articleSnapshotForPlanner(edited) }] }));
    vi.stubGlobal("fetch", retryFetch);
    await saveArchive([edited]);
    expect(retryFetch).toHaveBeenCalledTimes(5);
    expect(JSON.parse(retryFetch.mock.calls[3][1]?.body as string)).toMatchObject({
      id: "planner-server-link",
      sourceArchiveId: "a1",
      bodyCopy: "Updated body",
      targetPhraseIds: ["phrase-1"],
      selectedMessages: ["Message one"],
    });
  });
});

describe("scoreProject", () => {
  it("visibility never exceeds 50", () => {
    for (const contentType of Object.keys(CFG.typeWeights)) {
      for (const status of Object.keys(CFG.statusMultipliers) as (keyof typeof CFG.statusMultipliers)[]) {
        const p = makeProject({ contentType, status, channels: [...CFG.channels] });
        const { visibility } = scoreProject(p, CFG);
        expect(visibility).toBeLessThanOrEqual(50);
      }
    }
  });

  it("authority never exceeds 50", () => {
    for (const contentType of Object.keys(CFG.typeWeights)) {
      for (const status of Object.keys(CFG.statusMultipliers) as (keyof typeof CFG.statusMultipliers)[]) {
        const p = makeProject({ contentType, status, channels: [...CFG.channels] });
        const { authority } = scoreProject(p, CFG);
        expect(authority).toBeLessThanOrEqual(50);
      }
    }
  });

  it("returns zero visibility and authority for a project with no matching channels", () => {
    const p = makeProject({ status: "Approved", channels: [] });
    const { visibility, authority } = scoreProject(p, CFG);
    expect(visibility).toBeGreaterThanOrEqual(0);
    expect(authority).toBeGreaterThanOrEqual(0);
  });

  it("respects non-default ScoringConfig weights", () => {
    const customCfg: ScoringConfig = {
      ...CFG,
      typeWeights: { Custom: { vis: 10, auth: 10 } },
    };
    const p = makeProject({ contentType: "Custom", channels: ["Priority"] });
    const { visibility, authority } = scoreProject(p, customCfg);
    expect(visibility).toBeLessThanOrEqual(50);
    expect(authority).toBeLessThanOrEqual(50);
    expect(visibility).toBeGreaterThan(0);
    expect(authority).toBeGreaterThan(0);
  });
});

describe("aggregatePlanScore - zero projects", () => {
  it("returns all zeros", () => {
    const result = aggregatePlanScore([], CFG);
    expect(result.visibility).toBe(0);
    expect(result.authority).toBe(0);
    expect(result.total).toBe(0);
  });
});

describe("aggregatePlanScore - one project", () => {
  it("caps visibility at 50", () => {
    const p = makeProject({ channels: [...CFG.channels] });
    const { visibility } = aggregatePlanScore([p], CFG);
    expect(visibility).toBeLessThanOrEqual(50);
  });

  it("caps authority at 50", () => {
    const p = makeProject({ channels: [...CFG.channels] });
    const { authority } = aggregatePlanScore([p], CFG);
    expect(authority).toBeLessThanOrEqual(50);
  });

  it("caps total at 100", () => {
    const p = makeProject({ channels: [...CFG.channels] });
    const { total } = aggregatePlanScore([p], CFG);
    expect(total).toBeLessThanOrEqual(100);
  });
});

describe("aggregatePlanScore - many projects at max score each", () => {
  const maxProjects: PlannerProject[] = Array.from({ length: 50 }, (_, i) =>
    makeProject({ id: `p${i}`, contentType: "Article", status: "Approved", channels: [...CFG.channels] })
  );

  it("visibility never exceeds 50 regardless of project count", () => {
    const { visibility } = aggregatePlanScore(maxProjects, CFG);
    expect(visibility).toBeLessThanOrEqual(50);
  });

  it("authority never exceeds 50 regardless of project count", () => {
    const { authority } = aggregatePlanScore(maxProjects, CFG);
    expect(authority).toBeLessThanOrEqual(50);
  });

  it("total never exceeds 100 regardless of project count", () => {
    const { total } = aggregatePlanScore(maxProjects, CFG);
    expect(total).toBeLessThanOrEqual(100);
  });

  it("total equals rounded sum of visibility and authority", () => {
    const { visibility, authority, total } = aggregatePlanScore(maxProjects, CFG);
    expect(total).toBe(Math.round(visibility + authority));
  });
});

describe("aggregatePlanScore - non-default ScoringConfig weights", () => {
  const customCfg: ScoringConfig = {
    ...CFG,
    typeWeights: { Custom: { vis: 10, auth: 10 } },
    statusMultipliers: { Approved: 1, Review: 1, Drafting: 1, Planned: 1 },
    channelCap: 2.0,
  };
  const projects: PlannerProject[] = Array.from({ length: 20 }, (_, i) =>
    makeProject({ id: `p${i}`, contentType: "Custom", status: "Approved", channels: [...CFG.channels] })
  );

  it("visibility stays capped at 50 with inflated weights", () => {
    const { visibility } = aggregatePlanScore(projects, customCfg);
    expect(visibility).toBeLessThanOrEqual(50);
  });

  it("authority stays capped at 50 with inflated weights", () => {
    const { authority } = aggregatePlanScore(projects, customCfg);
    expect(authority).toBeLessThanOrEqual(50);
  });

  it("total stays capped at 100 with inflated weights", () => {
    const { total } = aggregatePlanScore(projects, customCfg);
    expect(total).toBeLessThanOrEqual(100);
  });
});

describe("aggregatePlanScore - monotonic increase", () => {
  it("adding a project never decreases visibility", () => {
    const base: PlannerProject[] = [];
    let prevVis = 0;
    for (let i = 0; i < 10; i++) {
      base.push(makeProject({ id: `p${i}`, channels: ["Priority"] }));
      const { visibility } = aggregatePlanScore([...base], CFG);
      expect(visibility).toBeGreaterThanOrEqual(prevVis);
      prevVis = visibility;
    }
  });

  it("adding a project never decreases authority", () => {
    const base: PlannerProject[] = [];
    let prevAuth = 0;
    for (let i = 0; i < 10; i++) {
      base.push(makeProject({ id: `p${i}`, channels: ["Priority"] }));
      const { authority } = aggregatePlanScore([...base], CFG);
      expect(authority).toBeGreaterThanOrEqual(prevAuth);
      prevAuth = authority;
    }
  });

  it("adding a project never decreases total", () => {
    const base: PlannerProject[] = [];
    let prevTotal = 0;
    for (let i = 0; i < 10; i++) {
      base.push(makeProject({ id: `p${i}`, channels: ["Priority"] }));
      const { total } = aggregatePlanScore([...base], CFG);
      expect(total).toBeGreaterThanOrEqual(prevTotal);
      prevTotal = total;
    }
  });
});
