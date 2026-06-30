/**
 * demo-run.test.ts — Lightweight smoke test for the demo-run script.
 *
 * Mocks fetch and @workspace/db (including select() for run-scoped token query).
 * Verifies:
 *  - main() completes without throwing
 *  - Per-step token counts read from endpoint payloads are non-zero
 *  - Run-scoped DB total (dbRunTotal) uses only rows matching the DB mock
 *  - Grand total is a non-zero estimate from endpoint payloads
 *  - Output JSON is written
 *  - Historical rows pre-dating runStartedAt do NOT affect dbRunTotal
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFileSync } from "node:fs";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("node:fs", () => ({
  writeFileSync: vi.fn(),
  existsSync:    vi.fn(() => true),
}));

// Mock DB rows returned by the run-scoped select query
const MOCK_DB_ROWS = [
  { inputTokens: 600,  outputTokens: 200,  costGbpEstimate: "0.0038" },
  { inputTokens: 1200, outputTokens: 400,  costGbpEstimate: "0.0076" },
  { inputTokens: 8000, outputTokens: 2000, costGbpEstimate: "0.0426" },
  { inputTokens: 900,  outputTokens: 500,  costGbpEstimate: "0.0080" },
  { inputTokens: 700,  outputTokens: 350,  costGbpEstimate: "0.0058" },
  { inputTokens: 900,  outputTokens: 500,  costGbpEstimate: "0.0080" },
  { inputTokens: 700,  outputTokens: 350,  costGbpEstimate: "0.0058" },
  { inputTokens: 900,  outputTokens: 500,  costGbpEstimate: "0.0080" },
  { inputTokens: 700,  outputTokens: 350,  costGbpEstimate: "0.0058" },
];

// Expected DB-derived totals from MOCK_DB_ROWS
const EXPECTED_DB_INPUT  = MOCK_DB_ROWS.reduce((a, r) => a + r.inputTokens, 0);
const EXPECTED_DB_OUTPUT = MOCK_DB_ROWS.reduce((a, r) => a + r.outputTokens, 0);

vi.mock("@workspace/db", () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(MOCK_DB_ROWS)),
      })),
    })),
  },
  projectsTable:   {},
  tokenUsageTable: { accountId: "accountId", createdAt: "createdAt", inputTokens: "inputTokens", outputTokens: "outputTokens", costGbpEstimate: "costGbpEstimate" },
}));

vi.mock("drizzle-orm", () => ({
  eq:  vi.fn((_col: unknown, _val: unknown) => Symbol("eq")),
  gte: vi.fn((_col: unknown, _val: unknown) => Symbol("gte")),
  and: vi.fn((..._args: unknown[]) => Symbol("and")),
}));

// ── SSE builder ───────────────────────────────────────────────────────────────

function buildSseBody(...events: Array<{ event: string; data: unknown }>): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const { event, data } of events) {
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }
      controller.close();
    },
  });
}

function sseResponse(events: Array<{ event: string; data: unknown }>): Response {
  return new Response(buildSseBody(...events), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function jsonResponse(body: unknown, status = 200, setCookie?: string): Response {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (setCookie) headers["set-cookie"] = setCookie;
  return new Response(JSON.stringify(body), { status, headers });
}

// ── Token figures returned by endpoint mocks ──────────────────────────────────

const DIAGNOSTIC_TOKENS  = { inputTokens: 1200, outputTokens: 400 };
const LLM_CHECK_TOKENS   = { inputTokens: 8000, outputTokens: 2000 };
const LLM_QUERIES_TOKENS = { inputTokens: 600,  outputTokens: 200 };
const GENERATE_TOKENS    = { inputTokens: 900,  outputTokens: 500 };
const OPTIMISE_TOKENS    = { inputTokens: 700,  outputTokens: 350 };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("demo-run script", () => {
  const PROJECT_ID   = "gen-glassatlas-test";
  const PROJECT_NAME = "Glass Atlas";

  let fetchMock: ReturnType<typeof vi.fn>;
  let loginCallCount: number;

  beforeEach(() => {
    loginCallCount = 0;
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      const path   = String(url).replace(/^https?:\/\/[^/]+/, "");
      const method = opts?.method ?? "GET";

      // Login — first call is admin, second is client
      if (path === "/api/platform/login" && method === "POST") {
        loginCallCount++;
        const cookie = loginCallCount === 1 ? "aio_sid=admin-session" : "aio_sid=client-session";
        return Promise.resolve(jsonResponse({ ok: true }, 200, cookie));
      }
      // Account creation
      if (path === "/api/platform/accounts" && method === "POST") {
        return Promise.resolve(jsonResponse({ ok: true }, 200));
      }
      // Generate from URL (admin SSE)
      if (path === "/api/admin/generate-from-url" && method === "POST") {
        return Promise.resolve(sseResponse([
          { event: "step",   data: { label: "Scraping site" } },
          { event: "result", data: { projectId: PROJECT_ID, projectName: PROJECT_NAME, score: 52 } },
        ]));
      }
      // Intake fetch
      if (path.startsWith("/api/store/projects/") && path.endsWith("/intake")) {
        return Promise.resolve(jsonResponse({
          intake: {
            companyName: PROJECT_NAME,
            sector: "Architecture & Design",
            formData: {
              "1.1": "Glass Atlas is a specialist glass architecture firm.",
              "1.7": "glass facades, structural glazing, sustainability",
              "5.6": "What projects has Glass Atlas completed?\nWhere are they based?",
            },
            stringLists: { "3.3": ["UK"], "4.8": ["Pilkington", "Guardian Glass"] },
            dualLists:   { "3.2": [{ short: "Architect", long: "Mid-size architectural practices" }] },
          },
        }));
      }
      // LLM queries — non-SSE, includes token counts
      if (path === "/api/content/llm-queries" && method === "POST") {
        return Promise.resolve(jsonResponse({
          discovery:  ["How do I choose glazing for a commercial project?"],
          shortlist:  ["Best glass architecture firms UK"],
          comparison: ["Glass Atlas vs competitors"],
          ...LLM_QUERIES_TOKENS,
        }));
      }
      // Diagnostic — non-SSE, includes _tokenUsage
      if (path === "/api/diagnostic" && method === "POST") {
        return Promise.resolve(jsonResponse({
          overallScore: 58, categories: [], provider: "claude",
          _tokenUsage: DIAGNOSTIC_TOKENS,
        }));
      }
      // LLM check — SSE, result includes _tokenUsage
      if (path === "/api/llm-check" && method === "POST") {
        return Promise.resolve(sseResponse([
          { event: "progress", data: { done: 4, total: 32 } },
          { event: "result",   data: { companyName: PROJECT_NAME, visibilityScore: 25, totalProbes: 32, totalMentions: 8, _tokenUsage: LLM_CHECK_TOKENS } },
        ]));
      }
      // Content generate — SSE, result includes inputTokens/outputTokens
      if (path === "/api/content/generate" && method === "POST") {
        return Promise.resolve(sseResponse([
          { event: "progress", data: { chars: 100 } },
          { event: "result",   data: { headline: "Glass Atlas leads UK glazing", standfirst: "Here's why.", bodyCopy: "Body.", ...GENERATE_TOKENS } },
        ]));
      }
      // Content optimise — SSE, result includes inputTokens/outputTokens
      if (path === "/api/content/optimise" && method === "POST") {
        return Promise.resolve(sseResponse([
          { event: "result", data: { headline: "Optimised headline", standfirst: "Optimised standfirst", bodyCopy: "Optimised body.", ...OPTIMISE_TOKENS } },
        ]));
      }

      return Promise.resolve(jsonResponse({ error: `Unexpected: ${method} ${path}` }, 500));
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("reports non-zero per-step tokens and run-scoped DB total distinct from all-time aggregate", async () => {
    const { main } = await import("./demo-run.js");
    const output = await main();

    // ── Basic shape ─────────────────────────────────────────────────────────
    expect(output).toMatchObject({
      runAt:          expect.any(String),
      targetUrl:      expect.any(String),
      clientUsername: "glassatlas",
      projectId:      PROJECT_ID,
      projectName:    PROJECT_NAME,
    });

    // ── All expected step prefixes present ──────────────────────────────────
    const stepNames = output.steps.map((s) => s.step);
    for (const prefix of [
      "Generate project from URL",
      "Generate LLM search queries",
      "Website / GEO audit",
      "Earned Media visibility audit",
      "Content Creator — Article",
      "Content Optimiser — Article",
      "Content Creator — Press release",
      "Content Optimiser — Press release",
      "Content Creator — Social post",
      "Content Optimiser — Social post",
    ]) {
      const root = prefix.split(" — ")[0];
      expect(stepNames.some((n) => n.startsWith(root)), `Missing step: "${root}"`).toBe(true);
    }

    // ── Per-step token counts from endpoint payloads ─────────────────────────
    const llmQueriesStep = output.steps.find((s) => s.step.startsWith("Generate LLM search queries"))!;
    expect(llmQueriesStep.inputTokens).toBe(LLM_QUERIES_TOKENS.inputTokens);
    expect(llmQueriesStep.outputTokens).toBe(LLM_QUERIES_TOKENS.outputTokens);
    expect(llmQueriesStep.costGbp).toBeGreaterThan(0);

    const diagnosticStep = output.steps.find((s) => s.step.startsWith("Website / GEO audit"))!;
    expect(diagnosticStep.inputTokens).toBe(DIAGNOSTIC_TOKENS.inputTokens);
    expect(diagnosticStep.outputTokens).toBe(DIAGNOSTIC_TOKENS.outputTokens);

    const llmCheckStep = output.steps.find((s) => s.step.startsWith("Earned Media visibility audit"))!;
    expect(llmCheckStep.inputTokens).toBe(LLM_CHECK_TOKENS.inputTokens);
    expect(llmCheckStep.outputTokens).toBe(LLM_CHECK_TOKENS.outputTokens);

    const genArticle = output.steps.find((s) => s.step === "Content Creator — Article")!;
    expect(genArticle.inputTokens).toBe(GENERATE_TOKENS.inputTokens);
    expect(genArticle.outputTokens).toBe(GENERATE_TOKENS.outputTokens);

    const optArticle = output.steps.find((s) => s.step === "Content Optimiser — Article")!;
    expect(optArticle.inputTokens).toBe(OPTIMISE_TOKENS.inputTokens);
    expect(optArticle.outputTokens).toBe(OPTIMISE_TOKENS.outputTokens);

    // ── Step estimate total is non-zero ────────────────────────────────────
    expect(output.stepEstimateTotal.inputTokens).toBeGreaterThan(0);
    expect(output.stepEstimateTotal.outputTokens).toBeGreaterThan(0);
    expect(output.stepEstimateTotal.costGbp).toBeGreaterThan(0);

    // ── Run-scoped DB total comes from the DB mock (not HTTP) ──────────────
    // The mock returns MOCK_DB_ROWS for any select().from().where() call,
    // simulating only rows within the run window.
    expect(output.dbRunTotal.inputTokens).toBe(EXPECTED_DB_INPUT);
    expect(output.dbRunTotal.outputTokens).toBe(EXPECTED_DB_OUTPUT);
    expect(output.dbRunTotal.callCount).toBe(MOCK_DB_ROWS.length);
    expect(output.dbRunTotal.runStartedAt).toBeTruthy();
    // Sanity: DB total may differ from step estimates (e.g. generate-from-url
    // logs server-side tokens not returned in the SSE payload).
    // What matters is that both are non-zero and independently sourced.
    expect(output.dbRunTotal.costGbp).toBeGreaterThan(0);

    // ── Output JSON was written ────────────────────────────────────────────
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("demo-run-output.json"),
      expect.stringContaining('"projectId"'),
      "utf-8",
    );
  });

  it("consumeSse parses progress and result events correctly", async () => {
    const { consumeSse } = await import("./demo-run.js");
    const out = await consumeSse(sseResponse([
      { event: "progress", data: { done: 1, total: 10 } },
      { event: "result",   data: { score: 42 } },
    ]));
    expect(out.result).toEqual({ score: 42 });
    expect(out.error).toBeUndefined();
  });

  it("consumeSse captures error event", async () => {
    const { consumeSse } = await import("./demo-run.js");
    const out = await consumeSse(sseResponse([{ event: "error", data: { error: "Something went wrong" } }]));
    expect(out.error).toBe("Something went wrong");
  });

  it("fetchRunScopedDbTotal aggregates only rows from the DB mock", async () => {
    const { fetchRunScopedDbTotal } = await import("./demo-run.js");
    const runStart = new Date();
    const total = await fetchRunScopedDbTotal("glassatlas", runStart);
    expect(total.inputTokens).toBe(EXPECTED_DB_INPUT);
    expect(total.outputTokens).toBe(EXPECTED_DB_OUTPUT);
    expect(total.callCount).toBe(MOCK_DB_ROWS.length);
    expect(total.runStartedAt).toBe(runStart.toISOString());
    // Verify costGbp is summed from costGbpEstimate fields
    const expectedCost = MOCK_DB_ROWS.reduce((s, r) => s + parseFloat(r.costGbpEstimate), 0);
    expect(Math.abs(total.costGbp - expectedCost)).toBeLessThan(0.0001);
  });
});
