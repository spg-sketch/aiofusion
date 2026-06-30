#!/usr/bin/env tsx
/**
 * demo-run.ts — Bootstrap a full client demo account end-to-end and report token cost.
 *
 * Usage:
 *   pnpm --filter api-server demo-run -- \
 *     --url https://www.glassatlas.com/ \
 *     --username glassatlas \
 *     --password <client-pass> \
 *     [--admin-password <admin-pass>] \
 *     [--server-url http://localhost:8080] \
 *     [--force]
 *
 * The script uses an admin session for account creation and project generation,
 * then switches to the client session for all LLM-using steps so token costs are
 * attributed to the client account. After project creation the project owner is
 * re-assigned to the client account so the admin Token Usage page shows the
 * correct account breakdown.
 *
 * Token accounting:
 *  - Per-step tokens are read directly from each API response (endpoint payloads
 *    include inputTokens/outputTokens for all client-side LLM steps).
 *  - A run-scoped DB total is computed by querying tokenUsageTable with
 *    createdAt >= runStartedAt and accountId = clientUsername. This is
 *    authoritative and matches what the TokenUsageAdminPage shows.
 */

import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";
import { join, dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { db, tokenUsageTable, projectsTable } from "@workspace/db";
import { and, eq, gte } from "drizzle-orm";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI arg parsing ───────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    url:              { type: "string" },
    username:         { type: "string" },
    password:         { type: "string" },
    "admin-password": { type: "string" },
    "server-url":     { type: "string" },
    force:            { type: "boolean", default: false },
  },
  allowPositionals: true,
});

const TARGET_URL  = args.url             ?? "https://www.glassatlas.com/";
const CLIENT_USER = args.username        ?? "glassatlas";
const CLIENT_PASS = args.password        ?? "demo1234";
const ADMIN_PASS  = args["admin-password"] ?? process.env.PLATFORM_ADMIN_PASSWORD ?? "K9mt-4Rxq-7NzPv2";
const SERVER_URL  = args["server-url"]   ?? `http://localhost:${process.env.PORT ?? 8080}`;
const FORCE       = args.force;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StepResult {
  step: string;
  durationMs: number;
  /** Estimated tokens from the API endpoint payload (informational). */
  inputTokens: number;
  outputTokens: number;
  costGbp: number;
  note?: string;
}

export interface DbRunTotal {
  /** Authoritative run-scoped aggregate queried from tokenUsageTable. */
  inputTokens: number;
  outputTokens: number;
  costGbp: number;
  callCount: number;
  runStartedAt: string;
}

export interface DemoRunOutput {
  runAt: string;
  targetUrl: string;
  clientUsername: string;
  projectId: string;
  projectName: string;
  steps: StepResult[];
  /** Sum of per-step endpoint estimates (informational — does not include
   *  generate-from-url tokens that are logged server-side without a step entry). */
  stepEstimateTotal: {
    durationMs: number;
    inputTokens: number;
    outputTokens: number;
    costGbp: number;
  };
  /** Authoritative run-scoped DB total: all tokenUsageTable rows for this
   *  client account inserted on or after runStartedAt. This matches the
   *  TokenUsageAdminPage figures. */
  dbRunTotal: DbRunTotal;
  /** Admin-session tokens (project generation) — one-off setup cost. */
  setupDbTotal: DbRunTotal;
  /**
   * Cost projection based on real token data from this run.
   * - Setup is one-off (project generation runs as admin, charged once at onboarding).
   * - Recurring = all client-session LLM calls: audits + LLM queries + content (3 pieces).
   * - The audit window is 21 days, so one recurring cycle = 3 weeks.
   * - 1 calendar month = 28/21 ≈ 1.33 three-week cycles.
   */
  projection: {
    oneOffSetupCostGbp: number;
    recurringCostPer3WeekCycleGbp: number;
    projectedMonth1CostGbp: number;
    projectedMonthlyCostGbp: number;
    assumptions: string[];
  };
  /** @deprecated use stepEstimateTotal instead. Kept for backwards compat. */
  grandTotal: {
    durationMs: number;
    inputTokens: number;
    outputTokens: number;
    costGbp: number;
  };
}

// ── Cost estimation (mirrors token-usage.ts) ─────────────────────────────────

const COST_PER_M: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5": { input: 2.37, output: 11.81 },
  "claude-sonnet-4-6": { input: 2.37, output: 11.81 },
  "gpt-5":             { input: 7.87, output: 31.50 },
};

function estimateCostGbp(model: string, inputTokens: number, outputTokens: number): number {
  const rates = COST_PER_M[model] ?? { input: 5.0, output: 20.0 };
  return (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function apiUrl(path: string): string {
  return `${SERVER_URL.replace(/\/+$/, "")}/api${path}`;
}

async function postJson(path: string, body: unknown, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) headers["Cookie"] = cookie;
  return fetch(apiUrl(path), { method: "POST", headers, body: JSON.stringify(body) });
}

async function getJson(path: string, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (cookie) headers["Cookie"] = cookie;
  return fetch(apiUrl(path), { headers });
}

function extractCookie(res: Response): string {
  return (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

// ── SSE consumer ─────────────────────────────────────────────────────────────

export interface SseConsumeResult {
  result: unknown;
  error?: string;
}

export async function consumeSse(res: Response): Promise<SseConsumeResult> {
  if (!res.ok) {
    const text = await res.text();
    let msg = `HTTP ${res.status}`;
    try { msg = (JSON.parse(text) as { error?: string }).error ?? msg; } catch { /* noop */ }
    return { result: null, error: msg };
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastResult: unknown = null;
  let lastError: string | undefined;
  let currentEvent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        try {
          const payload = JSON.parse(line.slice(6));
          if (currentEvent === "result") lastResult = payload;
          if (currentEvent === "error") lastError = (payload as { error?: string }).error ?? "Unknown SSE error";
        } catch { /* ignore unparseable lines */ }
      }
    }
  }
  return { result: lastResult, error: lastError };
}

// ── Login helper ──────────────────────────────────────────────────────────────

async function login(username: string, password: string): Promise<string> {
  const res = await postJson("/platform/login", { username, password });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(`Login failed for ${username}: ${body.error ?? res.status}`);
  }
  const cookie = extractCookie(res);
  if (!cookie) throw new Error(`No session cookie returned for ${username}`);
  return cookie;
}

// ── Step runner ───────────────────────────────────────────────────────────────

function log(msg: string): void {
  process.stdout.write(`${new Date().toISOString().slice(11, 19)}  ${msg}\n`);
}

async function runStep<T>(
  name: string,
  fn: () => Promise<{ result: T; inputTokens: number; outputTokens: number; model?: string; note?: string }>,
): Promise<{ result: T; step: StepResult }> {
  log(`▶  ${name}`);
  const t0 = Date.now();
  const { result, inputTokens, outputTokens, model = "claude-sonnet-4-6", note } = await fn();
  const durationMs = Date.now() - t0;
  const costGbp = estimateCostGbp(model, inputTokens, outputTokens);
  log(`   ✓  ${name} — ${(durationMs / 1000).toFixed(1)}s  in:${inputTokens.toLocaleString()}  out:${outputTokens.toLocaleString()}  £${costGbp.toFixed(4)}`);
  return {
    result,
    step: { step: name, durationMs, inputTokens, outputTokens, costGbp, ...(note ? { note } : {}) },
  };
}

// ── Run-scoped DB token total ─────────────────────────────────────────────────

/**
 * Queries tokenUsageTable directly for all rows belonging to the given account
 * that were inserted on or after runStartedAt.  Returns the aggregated total.
 * This matches what the TokenUsageAdminPage shows for the account.
 */
export async function fetchRunScopedDbTotal(
  accountId: string,
  runStartedAt: Date,
): Promise<DbRunTotal> {
  const rows = await db
    .select({
      inputTokens:     tokenUsageTable.inputTokens,
      outputTokens:    tokenUsageTable.outputTokens,
      costGbpEstimate: tokenUsageTable.costGbpEstimate,
    })
    .from(tokenUsageTable)
    .where(and(
      eq(tokenUsageTable.accountId, accountId),
      gte(tokenUsageTable.createdAt, runStartedAt),
    ));

  const totals = rows.reduce(
    (acc, r) => ({
      inputTokens:  acc.inputTokens  + (r.inputTokens  ?? 0),
      outputTokens: acc.outputTokens + (r.outputTokens ?? 0),
      costGbp:      acc.costGbp      + parseFloat(String(r.costGbpEstimate ?? "0")),
      callCount:    acc.callCount    + 1,
    }),
    { inputTokens: 0, outputTokens: 0, costGbp: 0, callCount: 0 },
  );

  return { ...totals, runStartedAt: runStartedAt.toISOString() };
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function main(): Promise<DemoRunOutput> {
  log("=".repeat(60));
  log(`AIO Fusion Demo Runner — ${TARGET_URL}`);
  log("=".repeat(60));

  const wallStart = new Date();
  const steps: StepResult[] = [];

  // ── Phase 1: Admin bootstrap ───────────────────────────────────────────────
  log("\nPhase 1: Admin bootstrap");
  const adminCookie = await login("admin", ADMIN_PASS);
  log("   ✓  Admin session established");

  const createRes = await postJson("/platform/accounts", {
    username: CLIENT_USER, password: CLIENT_PASS, role: "client", displayName: CLIENT_USER,
  }, adminCookie);

  if (createRes.ok) {
    log(`   ✓  Client account '${CLIENT_USER}' created`);
  } else if (createRes.status === 409) {
    log(`   ✓  Client account '${CLIENT_USER}' already exists — skipping creation`);
  } else {
    const body = await createRes.json().catch(() => ({})) as { error?: string };
    throw new Error(`Failed to create client account: ${body.error ?? createRes.status}`);
  }

  // ── Phase 2: Project generation (admin SSE) ───────────────────────────────
  log("\nPhase 2: Project generation (admin)");
  const { result: genResult, step: genStep } = await runStep<{ projectId: string; projectName: string; score?: number }>(
    "Generate project from URL",
    async () => {
      const res = await postJson("/admin/generate-from-url", { url: TARGET_URL }, adminCookie);
      const { result, error } = await consumeSse(res);
      if (error || !result) throw new Error(error ?? "No result from generate-from-url");
      const r = result as { projectId?: string; projectName?: string };
      if (!r.projectId) throw new Error("generate-from-url did not return a projectId");
      return {
        result: { projectId: r.projectId, projectName: r.projectName ?? r.projectId, score: (result as { score?: number }).score },
        inputTokens: 0,
        outputTokens: 0,
        note: "Tokens logged server-side; will appear in dbRunTotal",
      };
    },
  );
  steps.push(genStep);

  const projectId   = genResult.projectId;
  const projectName = genResult.projectName;
  log(`   ℹ  Project: ${projectName} (${projectId})`);

  // Re-assign project owner to the client account via direct DB write.
  await db.update(projectsTable).set({ owner: CLIENT_USER }).where(eq(projectsTable.id, projectId));
  log(`   ✓  Project ownership transferred to '${CLIENT_USER}'`);

  // ── Phase 3: Client-session LLM steps ────────────────────────────────────
  log("\nPhase 3: Client-session steps");
  const clientCookie = await login(CLIENT_USER, CLIENT_PASS);
  log(`   ✓  Client session for '${CLIENT_USER}' established`);

  // Record start time AFTER project generation (which runs as admin).
  // Only client-account LLM calls after this point will be in dbRunTotal.
  const runStartedAt = new Date();

  // Read intake directly from DB — the store API has different field keys
  const [projRow2] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  const intakeBlob = (projRow2?.intake ?? {}) as Record<string, unknown>;
  const formData   = (intakeBlob.formData ?? {}) as Record<string, string>;

  const companyName = (formData["4.1"] || projectName).slice(0, 200);

  // formData["4.4"] holds semicolon-separated sector tags e.g. "Digital commerce agency; performance marketing"
  const sectorRaw = formData["4.4"] ?? "";
  const sectors   = sectorRaw.split(";").map((s: string) => s.trim()).filter(Boolean).slice(0, 3);
  const sector    = sectors[0] || "Technology";

  // formData["1.1"] is the full company descriptor generated from the site
  const descriptor = (formData["1.1"] ?? formData["2.5"] ?? "").slice(0, 2000);

  // formData["4.5"] holds geography e.g. "United Kingdom; Ireland; Manchester"
  const geography  = (formData["4.5"] ?? "United Kingdom").split(";")[0].trim();

  // formData["1.7"] holds comma-separated keywords
  const keywords   = (formData["1.7"] ?? "").split(",").map((s: string) => s.trim()).filter(Boolean).slice(0, 10);

  // icp from the brand positioning summary
  const icp        = (formData["2.5"] ?? "").slice(0, 300);

  const competitors: string[] = [];

  // ── LLM search queries ───────────────────────────────────────────────────
  const { result: llmQueriesResult, step: llmQueriesStep } = await runStep<{ discovery: string[]; shortlist: string[]; comparison: string[] }>(
    "Generate LLM search queries (1.6)",
    async () => {
      const res = await postJson("/content/llm-queries", {
        companyName, descriptor, geography,
        competitors: competitors.slice(0, 8).join(", "),
        websiteUrl: TARGET_URL,
      }, clientCookie);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `llm-queries HTTP ${res.status}`);
      }
      const body = await res.json() as { discovery?: string[]; shortlist?: string[]; comparison?: string[]; inputTokens?: number; outputTokens?: number };
      return {
        result:       { discovery: body.discovery ?? [], shortlist: body.shortlist ?? [], comparison: body.comparison ?? [] },
        inputTokens:  body.inputTokens  ?? 0,
        outputTokens: body.outputTokens ?? 0,
      };
    },
  );
  steps.push(llmQueriesStep);
  log(`   ℹ  Queries: ${llmQueriesResult.discovery.length} discovery, ${llmQueriesResult.shortlist.length} shortlist, ${llmQueriesResult.comparison.length} comparison`);

  // ── Website / GEO audit (diagnostic) ─────────────────────────────────────
  const { step: diagnosticStep } = await runStep<unknown>(
    "Website / GEO audit (diagnostic)",
    async () => {
      const res = await postJson("/diagnostic", {
        url: TARGET_URL, projectId, force: true,
      }, clientCookie);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string; locked?: boolean };
        if (body.locked) {
          log("   ⚠  Audit locked (21-day cooldown) — use --force to override");
          return { result: null, inputTokens: 0, outputTokens: 0, note: "Locked — 21-day cooldown" };
        }
        throw new Error(body.error ?? `diagnostic HTTP ${res.status}`);
      }
      // Diagnostic is SSE — consume the stream rather than calling res.json()
      const { result, error } = await consumeSse(res);
      if (error) throw new Error(error);
      // Tokens are logged server-side per-call; they won't appear in the SSE result payload
      return { result, inputTokens: 0, outputTokens: 0, note: "Tokens logged in DB" };
    },
  );
  steps.push(diagnosticStep);

  // ── Earned Media visibility audit (LLM check) ─────────────────────────────
  const { step: llmCheckStep } = await runStep<unknown>(
    "Earned Media visibility audit (LLM check)",
    async () => {
      const res = await postJson("/llm-check", {
        companyName,
        sector: sectors[0] ?? sector,
        sectors,
        keywords,
        icp,
        location: geography,
        projectData: {
          legalName: formData["4.1"] ?? companyName,
          website: TARGET_URL,
          descriptor, sectors, icp, keywords,
          buyerQuestions: formData["5.6"] ? formData["5.6"].split("\n").filter(Boolean) : [],
        },
        projectId,
        ...(FORCE ? { force: true } : {}),
      }, clientCookie);
      const { result, error } = await consumeSse(res);
      if (error) {
        if (error.includes("locked") || error.includes("21-day")) {
          return { result: null, inputTokens: 0, outputTokens: 0, note: "Locked — 21-day cooldown" };
        }
        throw new Error(error);
      }
      const r = result as { _tokenUsage?: { inputTokens?: number; outputTokens?: number } } | null;
      return {
        result,
        inputTokens:  r?._tokenUsage?.inputTokens  ?? 0,
        outputTokens: r?._tokenUsage?.outputTokens ?? 0,
      };
    },
  );
  steps.push(llmCheckStep);

  // ── Content creation + optimisation (3 types) ─────────────────────────────
  const projectDataStr = JSON.stringify({ companyName, descriptor, sectors, icp, geography, keywords }).slice(0, 9000);

  const contentTypes: Array<{ type: string; headline: string }> = [
    { type: "Article",       headline: `How ${companyName} is leading the way in ${sectors[0] ?? sector}` },
    { type: "Press release", headline: `${companyName} announces new commitment to AI-driven visibility` },
    { type: "Social post",   headline: `${companyName}: building authority in ${sectors[0] ?? "our sector"}` },
  ];

  for (const ct of contentTypes) {
    const { result: generated, step: genContentStep } = await runStep<{ headline: string; standfirst: string; bodyCopy: string }>(
      `Content Creator — ${ct.type}`,
      async () => {
        const res = await postJson("/content/generate", {
          contentType: ct.type, projectName: companyName, headline: ct.headline, projectData: projectDataStr,
        }, clientCookie);
        const { result, error } = await consumeSse(res);
        if (error) throw new Error(error);
        const r = result as { headline?: string; standfirst?: string; bodyCopy?: string; inputTokens?: number; outputTokens?: number };
        return {
          result:       { headline: r?.headline ?? ct.headline, standfirst: r?.standfirst ?? "", bodyCopy: r?.bodyCopy ?? "" },
          inputTokens:  r?.inputTokens  ?? 0,
          outputTokens: r?.outputTokens ?? 0,
        };
      },
    );
    steps.push(genContentStep);

    const { step: optimiseStep } = await runStep<unknown>(
      `Content Optimiser — ${ct.type}`,
      async () => {
        const res = await postJson("/content/optimise", {
          contentType:  ct.type,
          headline:     generated.headline,
          standfirst:   generated.standfirst,
          bodyCopy:     generated.bodyCopy,
          projectTitle: companyName,
          projectData:  projectDataStr,
        }, clientCookie);
        const { result, error } = await consumeSse(res);
        if (error) throw new Error(error);
        const r = result as { inputTokens?: number; outputTokens?: number } | null;
        return { result, inputTokens: r?.inputTokens ?? 0, outputTokens: r?.outputTokens ?? 0 };
      },
    );
    steps.push(optimiseStep);
  }

  // ── Phase 4: Authoritative run-scoped DB totals ───────────────────────────
  log("\nPhase 4: Token usage summary");

  // Client-session recurring costs (LLM queries + audits + content)
  const dbRunTotal = await fetchRunScopedDbTotal(CLIENT_USER, runStartedAt);
  log(`   ℹ  Run-scoped DB total for '${CLIENT_USER}' since ${runStartedAt.toISOString().slice(11, 19)}`);
  log(`      Calls: ${dbRunTotal.callCount}  in:${dbRunTotal.inputTokens.toLocaleString()}  out:${dbRunTotal.outputTokens.toLocaleString()}  £${dbRunTotal.costGbp.toFixed(4)}`);

  // Admin-session setup cost (project generation — one-off at onboarding)
  const setupDbTotal = await fetchRunScopedDbTotal("admin", wallStart);
  log(`   ℹ  Admin setup DB total (project generation): £${setupDbTotal.costGbp.toFixed(4)}`);

  // Projection
  // - Setup is a one-off cost at onboarding
  // - One cycle = 21 days (hard audit-lock window); all audits + content = one cycle
  // - 1 calendar month = 28/21 ≈ 1.33 cycles
  const recurringCostPer3WeekCycle = dbRunTotal.costGbp;
  const oneOffSetupCostGbp         = setupDbTotal.costGbp;
  const projectedMonth1CostGbp     = oneOffSetupCostGbp + recurringCostPer3WeekCycle;
  const projectedMonthlyCostGbp    = recurringCostPer3WeekCycle * (28 / 21);

  // ── Build output ─────────────────────────────────────────────────────────
  const stepEstimateTotal = steps.reduce(
    (acc, s) => ({
      durationMs:   acc.durationMs   + s.durationMs,
      inputTokens:  acc.inputTokens  + s.inputTokens,
      outputTokens: acc.outputTokens + s.outputTokens,
      costGbp:      acc.costGbp      + s.costGbp,
    }),
    { durationMs: 0, inputTokens: 0, outputTokens: 0, costGbp: 0 },
  );

  const projection = {
    oneOffSetupCostGbp:            parseFloat(oneOffSetupCostGbp.toFixed(6)),
    recurringCostPer3WeekCycleGbp: parseFloat(recurringCostPer3WeekCycle.toFixed(6)),
    projectedMonth1CostGbp:        parseFloat(projectedMonth1CostGbp.toFixed(6)),
    projectedMonthlyCostGbp:       parseFloat(projectedMonthlyCostGbp.toFixed(6)),
    assumptions: [
      "Account/project setup (generate-from-url) is a one-off cost, charged once at onboarding",
      "GEO and Earned Media audits are locked to a 21-day window — one full run per 3-week cycle",
      "LLM search queries generated once per project and reused within the cycle",
      "Content: 3 pieces (Article, Press Release, Social Post) created and optimised per 3-week cycle",
      "1 calendar month = 28 days; ongoing monthly cost = recurring × (28 ÷ 21) ≈ 1.33 cycles",
      "All figures derived from actual logged token rows — no estimates or guesses",
    ],
  };

  const output: DemoRunOutput = {
    runAt:             new Date().toISOString(),
    targetUrl:         TARGET_URL,
    clientUsername:    CLIENT_USER,
    projectId,
    projectName,
    steps,
    stepEstimateTotal,
    dbRunTotal,
    setupDbTotal,
    projection,
    grandTotal:        stepEstimateTotal,  // backwards-compat alias
  };

  printSummaryTable(output);

  const outputPath = join(__dirname, "demo-run-output.json");
  writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");
  log(`\n✓  Output written to ${outputPath}`);

  return output;
}

// ── Summary table printer ─────────────────────────────────────────────────────

function printSummaryTable(output: DemoRunOutput): void {
  const COL = [38, 8, 10, 11, 10];
  const sep = COL.map((w) => "-".repeat(w)).join("+");
  const row = (cells: string[]) => cells.map((c, i) => c.padEnd(COL[i])).join("|");
  const W = COL.reduce((a, b) => a + b + 1, 0);

  log("\n" + "=".repeat(W));
  log("DEMO RUN SUMMARY");
  log("=".repeat(W));
  log(row(["Step", "Time(s)", "In tokens*", "Out tokens*", "Cost GBP*"]));
  log(sep);
  for (const s of output.steps) {
    log(row([
      s.step.slice(0, COL[0] - 1),
      (s.durationMs / 1000).toFixed(1),
      s.inputTokens.toLocaleString(),
      s.outputTokens.toLocaleString(),
      `£${s.costGbp.toFixed(4)}`,
    ]));
  }
  log(sep);
  log(row([
    "STEP ESTIMATES TOTAL (*from endpoint payloads)",
    (output.stepEstimateTotal.durationMs / 1000).toFixed(1),
    output.stepEstimateTotal.inputTokens.toLocaleString(),
    output.stepEstimateTotal.outputTokens.toLocaleString(),
    `£${output.stepEstimateTotal.costGbp.toFixed(4)}`,
  ]));
  log(sep);
  log(row([
    `DB RUN TOTAL (authoritative, since ${output.dbRunTotal.runStartedAt.slice(11, 19)})`,
    `${output.dbRunTotal.callCount} calls`,
    output.dbRunTotal.inputTokens.toLocaleString(),
    output.dbRunTotal.outputTokens.toLocaleString(),
    `£${output.dbRunTotal.costGbp.toFixed(4)}`,
  ]));
  log("=".repeat(W));
  log(`Project: ${output.projectName}  (${output.projectId})`);
  log(`Client:  ${output.clientUsername}  (TokenUsageAdminPage → filter by account)`);
  log(`Ran at:  ${output.runAt}`);

  // ── Projection ────────────────────────────────────────────────────────────
  const p = output.projection;
  log("\n" + "=".repeat(W));
  log("TYPICAL CLIENT COST PROJECTION  (based on real token data from this run)");
  log("=".repeat(W));
  log(`
  Assumptions
  -----------
  • Account/project setup is a one-off cost at onboarding.
  • GEO audit + Earned Media audit locked to a 21-day window (hard platform
    limit) — one full run per 3-week cycle is the expected customer cadence.
  • LLM search queries generated once per project, reused within the cycle.
  • Content: 3 pieces (Article, Press Release, Social Post) created and
    optimised per 3-week cycle — matching this run.
  • 1 calendar month = 28 days / 21-day cycle ≈ 1.33 cycles per month.
  • All figures come from actual logged token rows — no guesses.
`);
  log(`  One-off setup cost (project generation):            £${p.oneOffSetupCostGbp.toFixed(4)}`);
  log(`  Recurring cost per 3-week cycle:                    £${p.recurringCostPer3WeekCycleGbp.toFixed(4)}`);
  log(`  ──────────────────────────────────────────────────────────────────────`);
  log(`  Month 1 total (setup + first 3-week cycle):         £${p.projectedMonth1CostGbp.toFixed(4)}`);
  log(`  Ongoing monthly cost (ex. setup, 1.33× cycle):      £${p.projectedMonthlyCostGbp.toFixed(4)}`);
  log(`\n  ★  HEADLINE: ~£${p.projectedMonthlyCostGbp.toFixed(4)} per client per month (ongoing)  ★`);
  log("=".repeat(W));
}

// ── Entry point (only when executed directly, not when imported by tests) ─────

function _isMain(): boolean {
  try {
    const self = resolvePath(fileURLToPath(import.meta.url)).replace(/\.[tj]s$/, "");
    const argv = process.argv[1] ? resolvePath(process.argv[1]).replace(/\.[tj]s$/, "") : "";
    return argv === self;
  } catch {
    return false;
  }
}

if (_isMain()) {
  main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`\nFATAL: ${msg}\n`);
    if (err instanceof Error && err.stack) process.stderr.write(err.stack + "\n");
    process.exit(1);
  });
}
