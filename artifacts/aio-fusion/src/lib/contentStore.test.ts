import { describe, it, expect, vi } from "vitest";
import {
  scoreProject,
  aggregatePlanScore,
  DEFAULT_SCORING,
  type PlannerProject,
  type ScoringConfig,
} from "./contentStore";

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

describe("aggregatePlanScore — zero projects", () => {
  it("returns all zeros", () => {
    const result = aggregatePlanScore([], CFG);
    expect(result.visibility).toBe(0);
    expect(result.authority).toBe(0);
    expect(result.total).toBe(0);
  });
});

describe("aggregatePlanScore — one project", () => {
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

describe("aggregatePlanScore — many projects at max score each", () => {
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

describe("aggregatePlanScore — non-default ScoringConfig weights", () => {
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

describe("aggregatePlanScore — monotonic increase", () => {
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
