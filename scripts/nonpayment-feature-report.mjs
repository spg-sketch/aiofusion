#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const dir = resolve(".local/feature-test-reports");
const [browser, live, coverage] = await Promise.all([
  readFile(resolve(dir, "features.json"), "utf8").then(JSON.parse),
  readFile(resolve(dir, "live-smoke.json"), "utf8").then(JSON.parse),
  readFile("tests/features/coverage.json", "utf8").then(JSON.parse),
]);
const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);
let retestNotes = "";
try {
  retestNotes = await readFile(resolve(dir, "feature-retest-notes.md"), "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const rows = [];
function visit(suite, parent = "") {
  const label = [parent, suite.title].filter(Boolean).join(" / ");
  for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) {
    const result = test.results?.at(-1);
    rows.push({
      title: [label, spec.title].filter(Boolean).join(" / "),
      status: result?.status ?? test.status ?? "not tested",
      duration: result?.duration,
      error: (result?.errors ?? []).map(error => error.message ?? error.value ?? "").join("\n")
        .replace(/\u001b\[[0-9;]*m/g, "").replace(/token=[a-z0-9]+/gi, "token=[redacted]").slice(0, 3500),
      steps: result?.steps ?? [],
    });
  }
  for (const child of suite.suites ?? []) visit(child, label);
}
for (const suite of browser.suites ?? []) visit(suite);
function stepsHtml(steps) {
  return steps.map(step => `<li><strong>${step.error ? "Failed" : "Completed"}:</strong> ${escape(step.title)}${step.steps?.length ? `<ul>${stepsHtml(step.steps)}</ul>` : ""}</li>`).join("");
}
const failures = rows.filter(row => row.status === "failed" || row.status === "timedOut" || row.status === "interrupted");
const incomplete = rows.filter(row => row.status !== "passed" && !failures.includes(row));
const liveFailures = live.results.filter(row => row.status === "failed");
const globalErrors = browser.errors ?? [];
const overall = failures.length || liveFailures.length || globalErrors.length ? "Failures need investigation"
  : incomplete.length || !rows.length ? "Incomplete browser coverage" : "Covered checks passed";
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AIO Fusion - Non-payment feature test report</title>
<style>body{font:16px/1.6 system-ui,sans-serif;background:#f4f6f8;color:#163544;margin:0}main{max-width:1060px;margin:auto;padding:36px 22px}h1,h2,h3{line-height:1.25}header,section{background:white;border:1px solid #d8e0e4;border-radius:12px;padding:24px;margin-bottom:22px}.notice{border-left:5px solid #a52f60;padding-left:18px}table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:11px;text-align:left;border-bottom:1px solid #e4eaed}th{background:#f4f6f8}.passed{color:#126341}.failed,.timedOut,.interrupted{color:#a31536}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f7f8fa;padding:16px;font-size:12px}small{color:#586a73}ul{padding-left:22px}summary{cursor:pointer;font-weight:600}details ul ul{display:none}.scroll{overflow:auto}code{background:#f0f3f5;padding:2px 5px;border-radius:4px}</style>
<main><header><small>Generated ${escape(new Date().toISOString())}</small><h1>AIO Fusion non-payment feature tests</h1><h2>${escape(overall)}</h2>
<p class="notice">This report separates live, read-only checks from production-build browser tests using a temporary local database. It is not evidence that every product feature works in production. Payments are deferred; external email delivery and AI-provider execution are not verified.</p>
<p><strong>Live target:</strong> ${escape(live.target)}<br><strong>Live checked:</strong> ${escape(live.checkedAt)}<br><strong>Browser environment:</strong> ${escape(coverage.runtime.database)}</p></header>
<section><h2>Summary</h2><ul><li>Live read-only checks: ${live.results.length - liveFailures.length} passed, ${liveFailures.length} failed.</li><li>Isolated browser scenarios: ${rows.filter(row => row.status === "passed").length} passed, ${failures.length} failed, ${incomplete.length} incomplete.</li><li>Test infrastructure errors: ${globalErrors.length}.</li></ul><p>A failed browser scenario may be a test, fixture or application failure. Read the first failed step before treating it as a confirmed live bug.</p></section>
<section><h2>Browser journey results</h2>${rows.map(row => `<h3>${escape(row.title)}</h3><p class="${escape(row.status)}">${escape(row.status)}${row.duration != null ? ` (${(row.duration / 1000).toFixed(1)} seconds)` : ""}</p>${row.error ? `<pre>${escape(row.error)}</pre>` : ""}<details><summary>Completed and failed test steps</summary><ul>${stepsHtml(row.steps)}</ul></details>`).join("") || "<p>No browser scenario results were produced.</p>"}${globalErrors.map(error => `<pre>${escape(error.message ?? error)}</pre>`).join("")}${retestNotes ? `<details><summary>Run history and test-only corrections</summary><pre>${escape(retestNotes)}</pre></details>` : ""}</section>
<section><h2>Live read-only checks</h2><div class="scroll"><table><thead><tr><th>Page or endpoint</th><th>Result</th><th>HTTP status</th><th>Detail</th></tr></thead><tbody>${live.results.map(row => `<tr><td>${escape(row.path)}</td><td class="${escape(row.status)}">${escape(row.status)}</td><td>${escape(row.actualStatus ?? "")}</td><td>${escape(row.error ?? row.description ?? "")}</td></tr>`).join("")}</tbody></table></div></section>
<section><h2>Intended coverage</h2><p>This is the scope of the automated journey, not a claim that unreached steps passed.</p><ul>${coverage.tested.map(value => `<li>${escape(value)}</li>`).join("")}</ul><h3>Deferred</h3><ul>${coverage.deferred.map(value => `<li>${escape(value)}</li>`).join("")}</ul><h3>Blocked / not exercised</h3><ul>${coverage.blocked.map(value => `<li>${escape(value)}</li>`).join("")}</ul>
<p>Live account creation and email delivery, Google/Microsoft sign-in, complete role permutations, AI audit/generation, editorial/planner/research/report workflows and beta expiry boundary journeys need separate coverage. No customer accounts or records were changed.</p></section>
<section><h2>Run again</h2><pre>pnpm test:features
pnpm test:features:live ${escape(live.target)}
node scripts/nonpayment-feature-report.mjs</pre><p>The detailed Playwright report is under <code>.local/feature-test-reports/playwright/index.html</code>. Failure screenshots, traces and videos stay local to the project. ${escape(coverage.runtime.cleanup)}.</p></section></main></html>`;
await mkdir(dir, { recursive: true });
const file = resolve(dir, "summary.html");
await writeFile(file, html);
console.log(JSON.stringify({ report: file, overall, browserScenarios: rows.length, browserFailures: failures.length, liveChecks: live.results.length, liveFailures: liveFailures.length }));