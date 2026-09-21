import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const { scoreAuthorityWithOutcome, savedRow, updatedResults } = vi.hoisted(() => ({
  scoreAuthorityWithOutcome: vi.fn(),
  savedRow: {
    current: null as null | {
      id: string;
      projectId: string;
      owner: string;
      savedAt: string;
      result: Record<string, unknown>;
      deletedAt: null;
    },
  },
  updatedResults: [] as Record<string, unknown>[],
}));

vi.mock("./llm-check", () => ({
  sanitizeProjectData: (value: unknown) => value && typeof value === "object" ? value : {},
  scoreAuthorityWithOutcome,
}));

vi.mock("drizzle-orm", () => ({
  and: (...parts: unknown[]) => ({ kind: "and", parts }),
  eq: (column: unknown, value: unknown) => ({ kind: "eq", column, value }),
  isNull: (column: unknown) => ({ kind: "isNull", column }),
}));

vi.mock("@workspace/db", () => {
  const projectsTable = {
    id: { name: "projectId" },
    owner: { name: "owner" },
    deletedAt: { name: "deletedAt" },
  };
  const savedAuditsTable = {
    id: { name: "id" },
    projectId: { name: "projectId" },
    deletedAt: { name: "deletedAt" },
  };
  const emptyTable = {};
  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => table === projectsTable
            ? [{ owner: "owner", deletedAt: null }]
            : savedRow.current ? [savedRow.current] : [],
        }),
      }),
    }),
    update: () => ({
      set: (values: { result: Record<string, unknown> }) => ({
        where: async () => {
          updatedResults.push(values.result);
          if (savedRow.current) savedRow.current.result = values.result;
        },
      }),
    }),
  };
  return {
    db,
    projectsTable,
    savedAuditsTable,
    savedDiagnosticsTable: emptyTable,
    savedContentGeoTable: emptyTable,
    savedTechGeoTable: emptyTable,
  };
});

vi.mock("../middleware/platform-auth", () => ({
  requirePlatformAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../lib/member-guards", () => ({
  memberProjectGate: (_req: unknown, _res: unknown, next: () => void) => next(),
  inAssignedScope: () => true,
}));
vi.mock("../lib/platform-auth", () => ({
  getVisibleUsernames: async () => null,
  normUsername: (value: unknown) => String(value ?? "").toLowerCase(),
}));
vi.mock("../lib/assessment-outcome", () => ({
  normaliseSavedAssessmentResult: (value: unknown) => value,
}));

import storeAuditsRouter from "./store-audits";

const COMPLETE_ASSESSMENT = {
  index: 60,
  grade: "B",
  summary: "Complete.",
  dimensions: [],
  topGaps: [],
  priorityActions: [],
  queryTable: [],
};

function fallbackResult(retryCount = 0) {
  return {
    companyName: "Acme",
    checkedAt: "2026-09-21T11:18:49.000Z",
    visibilityScore: 25,
    totalMentions: 2,
    topCompetitors: [{ name: "Globex", mentions: 6 }],
    assessment: null,
    assessmentStatus: { status: "fallback", reason: "The Authority assessment was incomplete." },
    assessmentOutcome: { status: "fallback", reasonCategory: "incomplete_response" },
    assessmentRetryCount: retryCount,
    probes: [
      {
        question: "Which provider should I choose?",
        model: "GPT-5 (ChatGPT)",
        mentioned: false,
        responsePreview: "Globex was recommended.",
        competitors: ["Globex"],
        mentionContext: null,
      },
      {
        question: "Which provider should I choose?",
        model: "Claude (Anthropic)",
        mentioned: true,
        responsePreview: "Acme and Globex were recommended.",
        competitors: ["Globex"],
        mentionContext: "Acme was described as a specialist.",
      },
    ],
  };
}

async function postRetry(): Promise<{ status: number; body: any }> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).account = { username: "owner", role: "client" };
    (req as any).log = { error: vi.fn() };
    next();
  });
  app.use("/api", storeAuditsRouter);
  const server: Server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(
      `http://127.0.0.1:${port}/api/store/projects/project-1/audits/audit-1/retry-assessment`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectData: { legalName: "Acme Ltd" } }),
      },
    );
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("Authority assessment retries", () => {
  beforeEach(() => {
    updatedResults.length = 0;
    scoreAuthorityWithOutcome.mockReset();
    savedRow.current = {
      id: "audit-1",
      projectId: "project-1",
      owner: "owner",
      savedAt: "2026-09-21T11:18:49.000Z",
      result: fallbackResult(),
      deletedAt: null,
    };
  });

  afterEach(() => {
    savedRow.current = null;
  });

  it("retries only Authority scoring from saved evidence and persists the result", async () => {
    scoreAuthorityWithOutcome.mockResolvedValue({
      assessment: COMPLETE_ASSESSMENT,
      assessmentStatus: { status: "complete", reason: null },
      assessmentOutcome: { status: "complete", reasonCategory: null },
    });

    const response = await postRetry();

    expect(response.status).toBe(200);
    expect(response.body.retryCount).toBe(1);
    expect(response.body.retryLimit).toBe(3);
    expect(scoreAuthorityWithOutcome).toHaveBeenCalledTimes(1);
    expect(scoreAuthorityWithOutcome.mock.calls[0][2]).toEqual([
      expect.objectContaining({
        question: "Which provider should I choose?",
        appeared: true,
        chatgpt: "Globex was recommended.",
        claude: "Acme and Globex were recommended.",
      }),
    ]);
    expect(updatedResults[0]).toEqual(expect.objectContaining({
      assessment: COMPLETE_ASSESSMENT,
      assessmentRetryCount: 1,
      assessmentRetryLimit: 3,
    }));
  });

  it("blocks a fourth Authority retry without calling the model", async () => {
    savedRow.current!.result = fallbackResult(3);

    const response = await postRetry();

    expect(response.status).toBe(429);
    expect(response.body.retryCount).toBe(3);
    expect(response.body.retryLimit).toBe(3);
    expect(scoreAuthorityWithOutcome).not.toHaveBeenCalled();
    expect(updatedResults).toHaveLength(0);
  });
});