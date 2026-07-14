#!/usr/bin/env tsx
/**
 * george-smoke-test.ts — End-to-end smoke test for a full agency onboarding flow.
 *
 * Creates (or reuses) a "george" agency account, walks through every major
 * platform step, and prints a clear ✓ / ✗ report at the end.
 *
 * Usage:
 *   pnpm --filter api-server george-smoke-test
 *   pnpm --filter api-server george-smoke-test -- --server-url http://localhost:8080
 *   pnpm --filter api-server george-smoke-test -- --cleanup   # delete george after run
 */

import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    "admin-password": { type: "string" },
    "server-url":     { type: "string" },
    cleanup:          { type: "boolean", default: false },
  },
  allowPositionals: true,
});

const ADMIN_PASS = args["admin-password"] ?? process.env.PLATFORM_ADMIN_PASSWORD ?? "";
const SERVER_URL = args["server-url"] ?? `http://localhost:${process.env.PORT ?? 8080}`;
const CLEANUP    = args.cleanup ?? false;

const AGENCY_USER = "george";
const AGENCY_PASS = "george-test-2026";
const CLIENT_USER = "george-client";
const CLIENT_PASS = "george-client-2026";
const TEST_URL    = "https://www.bbc.co.uk/";

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function apiUrl(path: string): string {
  return `${SERVER_URL.replace(/\/+$/, "")}/api${path}`;
}

/**
 * Extract ALL Set-Cookie name=value pairs from a response and join them as a
 * single Cookie header string (for use in subsequent requests).
 * Impersonation sets two cookies (aio_sid + aio_admin_sid) — both are needed.
 */
function extractCookies(res: Response): string {
  const raw: string[] =
    (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
    (res.headers.get("set-cookie") ?? "").split(/,(?=[^;]+=[^;]+)/).map((s) => s.trim());
  return raw
    .map((h) => h.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

/** Merge new cookies from `patch` on top of `base` (same-name cookies are replaced). */
function mergeCookies(base: string, patch: string): string {
  const map = new Map<string, string>();
  for (const pair of base.split(";").map((s) => s.trim()).filter(Boolean)) {
    const [name] = pair.split("=");
    if (name) map.set(name, pair);
  }
  for (const pair of patch.split(";").map((s) => s.trim()).filter(Boolean)) {
    const [name] = pair.split("=");
    if (name) map.set(name, pair);
  }
  return [...map.values()].join("; ");
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

async function deleteReq(path: string, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (cookie) headers["Cookie"] = cookie;
  return fetch(apiUrl(path), { method: "DELETE", headers });
}

async function consumeSse(res: Response): Promise<{ result: unknown; error?: string }> {
  if (!res.ok) {
    const text = await res.text();
    let msg = `HTTP ${res.status}`;
    try { msg = (JSON.parse(text) as { error?: string }).error ?? msg; } catch { /**/ }
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
      if (line.startsWith("event: ")) currentEvent = line.slice(7).trim();
      else if (line.startsWith("data: ")) {
        try {
          const payload = JSON.parse(line.slice(6));
          if (currentEvent === "result") lastResult = payload;
          if (currentEvent === "error") lastError = (payload as { error?: string }).error ?? "Unknown SSE error";
        } catch { /**/ }
      }
    }
  }
  return { result: lastResult, error: lastError };
}

// ── Test runner ───────────────────────────────────────────────────────────────

interface TestResult {
  name: string;
  ok: boolean;
  detail?: string;
  durationMs: number;
}

const results: TestResult[] = [];

async function check(name: string, fn: () => Promise<string | void>): Promise<void> {
  const t0 = Date.now();
  try {
    const detail = await fn();
    const ms = Date.now() - t0;
    results.push({ name, ok: true, detail: detail ?? undefined, durationMs: ms });
    console.log(`  ✓  ${name}${detail ? ` — ${detail}` : ""}  (${ms}ms)`);
  } catch (err) {
    const ms = Date.now() - t0;
    const detail = err instanceof Error ? err.message : String(err);
    results.push({ name, ok: false, detail, durationMs: ms });
    console.log(`  ✗  ${name} — ${detail}  (${ms}ms)`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log("=".repeat(64));
console.log("  AIO Fusion — George Agency Smoke Test");
console.log(`  Server: ${SERVER_URL}`);
console.log("=".repeat(64));

let adminCookie  = "";
let georgeCookie = "";
let clientCookie = ""; // holds both aio_sid + aio_admin_sid during impersonation
let projectId    = "";

// ── Phase 1: Admin session ────────────────────────────────────────────────────
console.log("\n── Phase 1: Admin session ──");

await check("Admin login", async () => {
  if (!ADMIN_PASS) throw new Error("No admin password — set PLATFORM_ADMIN_PASSWORD or use --admin-password");
  const res = await postJson("/platform/login", { username: "admin", password: ADMIN_PASS });
  if (!res.ok) {
    const b = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(b.error ?? `HTTP ${res.status}`);
  }
  adminCookie = extractCookies(res);
  if (!adminCookie) throw new Error("No session cookie returned");
  return "session established";
});

if (!adminCookie) {
  console.log("\n✗  Cannot proceed without admin session. Check your admin password.\n");
  process.exit(1);
}

// ── Phase 2: George agency account ───────────────────────────────────────────
console.log("\n── Phase 2: George agency account ──");

await check("Create george agency account", async () => {
  const res = await postJson("/platform/accounts", {
    username: AGENCY_USER,
    password: AGENCY_PASS,
    role: "agency",
    displayName: "George (Test Agency)",
  }, adminCookie);
  if (res.ok) return "created";
  if (res.status === 409) return "already exists — reusing";
  const b = await res.json().catch(() => ({})) as { error?: string };
  throw new Error(b.error ?? `HTTP ${res.status}`);
});

await check("George can log in", async () => {
  const res = await postJson("/platform/login", { username: AGENCY_USER, password: AGENCY_PASS });
  if (!res.ok) {
    const b = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(b.error ?? `HTTP ${res.status}`);
  }
  georgeCookie = extractCookies(res);
  if (!georgeCookie) throw new Error("No session cookie returned");
  return "session established";
});

await check("/me returns george with agency role", async () => {
  const res = await getJson("/platform/me", georgeCookie);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json() as { account?: { username?: string; role?: string } };
  const acc = body.account;
  if (!acc) throw new Error("No account in /me response");
  if (acc.username !== AGENCY_USER) throw new Error(`Expected '${AGENCY_USER}', got '${acc.username}'`);
  if (acc.role !== "agency") throw new Error(`Expected role=agency, got '${acc.role}'`);
  return `username=${acc.username} role=${acc.role}`;
});

// ── Phase 3: Client sub-account ──────────────────────────────────────────────
console.log("\n── Phase 3: Client sub-account under George ──");

await check("George creates a client sub-account", async () => {
  const res = await postJson("/platform/accounts", {
    username: CLIENT_USER,
    password: CLIENT_PASS,
    role: "client",
    displayName: "George's Test Client",
  }, georgeCookie);
  if (res.ok) return `'${CLIENT_USER}' created`;
  if (res.status === 409) return `'${CLIENT_USER}' already exists — reusing`;
  const b = await res.json().catch(() => ({})) as { error?: string };
  throw new Error(b.error ?? `HTTP ${res.status}`);
});

await check("George can see the client in account list", async () => {
  const res = await getJson("/platform/accounts", georgeCookie);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json() as { accounts?: { username: string }[] };
  const found = body.accounts?.some((a) => a.username === CLIENT_USER);
  if (!found) throw new Error(`'${CLIENT_USER}' not found in account list`);
  return `${body.accounts?.length ?? 0} accounts visible`;
});

await check("George can impersonate (login as) client", async () => {
  const res = await postJson(`/platform/accounts/${CLIENT_USER}/impersonate`, {}, georgeCookie);
  if (!res.ok) {
    const b = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(b.error ?? `HTTP ${res.status}`);
  }
  // Impersonation sets TWO cookies: aio_sid (client session) + aio_admin_sid (george stash).
  // Both must be sent together on subsequent requests so /me resolves correctly
  // and exit-impersonation can restore the george session.
  clientCookie = mergeCookies(georgeCookie, extractCookies(res));
  if (!clientCookie) throw new Error("No session cookie from impersonate");
  return "both cookies captured";
});

await check("Impersonated session is george-client with client role", async () => {
  const res = await getJson("/platform/me", clientCookie);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json() as {
    account?: { username?: string; role?: string };
    impersonating?: { by: string } | null;
  };
  const acc = body.account;
  if (!acc) throw new Error("No account in /me response");
  if (acc.username !== CLIENT_USER) throw new Error(`Expected '${CLIENT_USER}', got '${acc.username}'`);
  if (acc.role !== "client") throw new Error(`Expected role=client, got '${acc.role}'`);
  const by = body.impersonating?.by;
  if (!by) throw new Error("impersonating field missing — banner won't show");
  return `username=${acc.username} role=${acc.role} impersonating.by=${by}`;
});

await check("George can exit impersonation and return", async () => {
  const res = await postJson("/platform/exit-impersonation", {}, clientCookie);
  if (!res.ok) {
    const b = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(b.error ?? `HTTP ${res.status}`);
  }
  const body = await res.json() as { account?: { username?: string } };
  const backAs = body.account?.username;
  if (backAs !== AGENCY_USER) throw new Error(`Expected to return as '${AGENCY_USER}', got '${backAs}'`);
  // Restore george's cookie from the response
  georgeCookie = mergeCookies(georgeCookie, extractCookies(res));
  return `returned as '${backAs}'`;
});

// ── Phase 4: Project & platform features ─────────────────────────────────────
console.log("\n── Phase 4: Project & platform features ──");

await check("Admin generates a project for George's client (SSE)", async () => {
  const res = await postJson("/admin/generate-from-url", { url: TEST_URL }, adminCookie);
  const { result, error } = await consumeSse(res);
  if (error || !result) throw new Error(error ?? "No result from generate-from-url");
  const r = result as { projectId?: string; projectName?: string };
  if (!r.projectId) throw new Error("No projectId in response");
  projectId = r.projectId;
  return `project '${r.projectName}' (${projectId})`;
});

// Re-enter impersonation to test client's store access
await check("George's client can list projects via store API", async () => {
  const impRes = await postJson(`/platform/accounts/${CLIENT_USER}/impersonate`, {}, georgeCookie);
  if (!impRes.ok) {
    const b = await impRes.json().catch(() => ({})) as { error?: string };
    throw new Error(`Re-impersonate failed: ${b.error ?? impRes.status}`);
  }
  clientCookie = mergeCookies(georgeCookie, extractCookies(impRes));
  const res = await getJson("/store/projects", clientCookie);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json() as { projects?: unknown[] };
  return `${body.projects?.length ?? 0} project(s) visible to client`;
});

await check("LLM search queries endpoint responds", async () => {
  if (!projectId) throw new Error("No projectId from earlier step");
  // Use george's session (owns the project)
  const res = await postJson("/content/llm-queries", { projectId }, georgeCookie);
  if (!res.ok) {
    const b = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(b.error ?? `HTTP ${res.status}`);
  }
  const body = await res.json() as { queries?: unknown; v?: number };
  if (!body.queries && body.v === undefined) throw new Error("Unexpected response shape");
  return "queries generated";
});

await check("GEO diagnostic endpoint responds (SSE)", async () => {
  if (!projectId) throw new Error("No projectId");
  const res = await postJson("/diagnostic", { projectId }, georgeCookie);
  const { result, error } = await consumeSse(res);
  if (error) throw new Error(error);
  if (!result) throw new Error("No result from /diagnostic");
  const r = result as { score?: number };
  return `score=${r.score ?? "n/a"}`;
});

await check("Earned Media (LLM check) endpoint responds (SSE)", async () => {
  if (!projectId) throw new Error("No projectId");
  const res = await postJson("/llm-check", { projectId }, georgeCookie);
  const { result, error } = await consumeSse(res);
  if (error) throw new Error(error);
  if (!result) throw new Error("No result from /llm-check");
  const r = result as { visibilityScore?: number };
  return `visibilityScore=${r.visibilityScore ?? "n/a"}`;
});

// ── Phase 5: Admin visibility of George ──────────────────────────────────────
console.log("\n── Phase 5: Admin visibility ──");

await check("Admin can see george in accounts list", async () => {
  const res = await getJson("/platform/admin/accounts", adminCookie);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json() as { accounts?: { username: string }[] };
  const found = body.accounts?.some((a) => a.username === AGENCY_USER);
  if (!found) throw new Error(`'${AGENCY_USER}' not found in admin accounts list`);
  return `${body.accounts?.length ?? 0} total accounts`;
});

await check("Admin can impersonate george and exit cleanly", async () => {
  const res = await postJson(`/platform/accounts/${AGENCY_USER}/impersonate`, {}, adminCookie);
  if (!res.ok) {
    const b = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(b.error ?? `HTTP ${res.status}`);
  }
  const admImpCookie = mergeCookies(adminCookie, extractCookies(res));
  const exitRes = await postJson("/platform/exit-impersonation", {}, admImpCookie);
  if (!exitRes.ok) {
    const b = await exitRes.json().catch(() => ({})) as { error?: string };
    throw new Error(`Exit failed: ${b.error ?? exitRes.status}`);
  }
  const body = await exitRes.json() as { account?: { username?: string } };
  if (body.account?.username !== "admin") throw new Error(`Expected 'admin' after exit, got '${body.account?.username}'`);
  return "impersonated + exited cleanly";
});

// ── Phase 6: Cleanup (optional) ──────────────────────────────────────────────
if (CLEANUP) {
  console.log("\n── Phase 6: Cleanup ──");

  await check("Delete george-client account", async () => {
    const res = await deleteReq(`/platform/accounts/${CLIENT_USER}`, adminCookie);
    if (res.ok || res.status === 404) return "deleted";
    throw new Error(`HTTP ${res.status}`);
  });

  await check("Delete george account", async () => {
    const res = await deleteReq(`/platform/accounts/${AGENCY_USER}`, adminCookie);
    if (res.ok || res.status === 404) return "deleted";
    throw new Error(`HTTP ${res.status}`);
  });
}

// ── Summary ───────────────────────────────────────────────────────────────────

const passed  = results.filter((r) => r.ok).length;
const failed  = results.filter((r) => !r.ok).length;
const totalMs = results.reduce((a, r) => a + r.durationMs, 0);

console.log("\n" + "=".repeat(64));
console.log("  GEORGE SMOKE TEST — SUMMARY");
console.log("=".repeat(64));
console.log(`  Passed : ${passed}`);
console.log(`  Failed : ${failed}`);
console.log(`  Total  : ${results.length}  (${(totalMs / 1000).toFixed(1)}s)`);
console.log("=".repeat(64));

if (failed > 0) {
  console.log("\nFailed checks:");
  for (const r of results.filter((x) => !x.ok)) {
    console.log(`  ✗  ${r.name}`);
    if (r.detail) console.log(`       ${r.detail}`);
  }
  console.log();
  process.exit(1);
} else {
  console.log("\n  All checks passed. Platform is healthy.\n");
}
