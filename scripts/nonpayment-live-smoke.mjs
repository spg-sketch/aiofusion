#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Read-only production smoke checks. No credentials, cookies, form submissions,
// signup requests, AI calls, payment endpoints, or customer data are involved.
const origin = new URL(process.argv[2] ?? "");
if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") {
  throw new Error("Supply the verified HTTPS deployment origin only.");
}
const output = resolve(process.argv[3] ?? ".local/feature-test-reports/live-smoke.json");
const pages = ["/", "/about", "/for-inhouse", "/for-agencies", "/pricing", "/insights", "/contact", "/trust-security", "/privacy-policy", "/terms-conditions", "/for-agents"];
const endpoints = [
  ["/api/healthz", 200],
  ["/api/platform/me", 200],
  ["/api/store/projects", 401],
  ["/api/store/media-db/contacts", 401],
  ["/api/store/media-db/outlets", 401],
  ["/api/store/media-db/bookmarks", 401],
];
const results = [];
async function check(path, expected, html = false) {
  const started = performance.now();
  try {
    const response = await fetch(new URL(path, origin), {
      method: "GET", redirect: "follow", signal: AbortSignal.timeout(30_000),
      headers: { "user-agent": "AIO-Fusion-Read-Only-Feature-Smoke/1.0" },
    });
    const body = await response.text();
    let error;
    if (response.status !== expected) error = `Expected HTTP ${expected}, got ${response.status}`;
    if (html && (!response.headers.get("content-type")?.includes("text/html") || !/<h1[\s>]/i.test(body))) {
      error = [error, "Missing HTML page heading"].filter(Boolean).join("; ");
    }
    if (path === "/api/platform/me" && response.ok) {
      try {
        if (JSON.parse(body).account !== null) error = "Anonymous identity unexpectedly has an account";
      } catch { error = "Identity response is not valid JSON"; }
    }
    results.push({ path, expectedStatus: expected, actualStatus: response.status, status: error ? "failed" : "passed", milliseconds: Math.round(performance.now() - started), ...(error ? { error } : {}) });
    return { body, response };
  } catch (error) {
    results.push({ path, expectedStatus: expected, status: "failed", milliseconds: Math.round(performance.now() - started), error: error.message });
    return null;
  }
}
// Limit concurrency so these checks do not load a newly published server.
for (let i = 0; i < pages.length; i += 3) await Promise.all(pages.slice(i, i + 3).map(path => check(path, 200, true)));
for (let i = 0; i < endpoints.length; i += 3) await Promise.all(endpoints.slice(i, i + 3).map(([path, status]) => check(path, status)));
const homepage = await check("/", 200, true);
if (homepage) {
  const assets = [...homepage.body.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)]
    .map(match => match[1]).filter(path => new URL(path, origin).origin === origin.origin).slice(0, 4);
  await Promise.all(assets.map(path => check(path, 200)));
  const footer = homepage.body.match(/<footer[\s\S]*?<\/footer>/i)?.[0] ?? "";
  results.push({ path: "/#footer", status: /href="[^"]*\/for-agents"/.test(footer) ? "passed" : "failed", description: "Published homepage footer links to For Agents" });
}
const report = {
  checkedAt: new Date().toISOString(), target: origin.origin, environment: "live, anonymous, read-only",
  status: results.some(result => result.status === "failed") ? "failed" : "passed", results,
  exclusions: ["Authenticated writes", "Live beta registration", "Real email delivery", "Real AI generation", "Payments and billing"],
};
await mkdir(resolve(output, ".."), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.status === "passed" ? 0 : 1;