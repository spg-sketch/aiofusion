import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const files = ["sql-test-results", "boundary-test-results", "additional-test-results", "privacy-retest-results", "editor-test-results", "dns-format-test-results", "form-family-test-results"];
const batches = files.map(name => {
  const result = JSON.parse(readFileSync(`docs/security/${name}.json`, "utf8"));
  return { file: `${name}.json`, success: result.success, total: result.numTotalTests,
    passed: result.numPassedTests, failed: result.numFailedTests,
    startedAt: new Date(result.startTime).toISOString(),
    suites: result.testResults.map(suite => ({
      file: suite.name.replace(process.cwd() + "/", ""),
      status: suite.status, tests: suite.assertionResults.length,
      durationMs: suite.endTime - suite.startTime,
    })) };
});
const browser = JSON.parse(readFileSync("docs/security/browser-results.json", "utf8"));
const commands = {
  inventory: "node scripts/security-inventory.mjs",
  sqlGuard: "node scripts/security-sql-guard.mjs",
  sqlFixtures: "pnpm --filter @workspace/api-server exec vitest run src/routes/store-content-isolation.test.ts src/routes/store-intake.test.ts src/routes/howto.test.ts src/routes/media-import.test.ts src/routes/contact-security.test.ts src/routes/platform-login-signup.test.ts src/routes/journalist-privacy.integration.test.ts src/lib/security-fetch-audit.test.ts --reporter=json --outputFile=../../docs/security/sql-test-results.json",
  boundaryFixtures: "pnpm --filter @workspace/api-server exec vitest run src/routes/ai-assist-security.test.ts src/routes/auth-return-to.test.ts src/lib/safe-return-to.test.ts src/app.stripe-webhook.test.ts src/routes/insights-homepage-pins.test.ts --reporter=json --outputFile=../../docs/security/boundary-test-results.json",
  additionalFixtures: "pnpm --filter @workspace/api-server exec vitest run src/routes/journalist-privacy.integration.test.ts src/routes/team-personal-mfa.test.ts src/routes/platform-mfa.test.ts src/routes/billing.test.ts src/lib/media-csv-import.test.ts src/lib/cleanup-expired-tokens.test.ts src/lib/media-parser-security.test.ts --maxWorkers=2 --reporter=json --outputFile=../../docs/security/additional-test-results.json",
  editorFixtures: "pnpm --filter @workspace/aio-fusion exec vitest run src/lib/howto.test.ts src/lib/howtoDocument.test.ts src/components/howto/HowtoDocumentEditor.clipboard.test.ts --maxWorkers=2 --reporter=json --outputFile=../../docs/security/editor-test-results.json",
  privacyRetest: "pnpm --filter @workspace/api-server exec vitest run src/routes/journalist-privacy.integration.test.ts --reporter=json --outputFile=../../docs/security/privacy-retest-results.json",
  dnsFormat: "pnpm --filter @workspace/api-server exec vitest run src/lib/security-dns-format.test.ts --reporter=json --outputFile=../../docs/security/dns-format-test-results.json",
  remainingFormFamilies: "pnpm --filter @workspace/api-server exec vitest run src/routes/form-family-sql.test.ts --reporter=json --outputFile=../../docs/security/form-family-test-results.json",
  builtBrowser: "pnpm exec playwright test --config=playwright.security.config.ts",
  typecheck: "pnpm run typecheck",
};
const version = (command, args) => execFileSync(command, args, { encoding: "utf8" }).trim();
const ledger = {
  sourceRevision: version("git", ["rev-parse", "HEAD"]),
  generatedAt: new Date().toISOString(),
  scope: "Local source and isolated runtime only. No published deployment, existing database, real account, payment or paid AI verified.",
  environment: { node: process.version, pnpm: version("pnpm", ["--version"]), postgres: version("psql", ["--version"]), platform: process.platform },
  commands, batches, browser: { file: "browser-results.json", stats: browser.stats, errors: browser.errors },
  typecheck: { status: "passed", command: commands.typecheck },
  sqlGuard: { status: "passed", reviewedExceptions: 8 },
  scanners: { file: "audit-scanners.json", dependency: "fulfilled, zero", static: "fulfilled, one medium false positive", privacy: "fulfilled, zero" },
  releaseReadiness: {
    command: "RELEASE_ENVIRONMENT=staging pnpm run release:ready",
    status: "not approved",
    attemptedOutcome: "failed before release stages because an interrupted readiness lock exists",
    rerun: "intentionally skipped: full web prerender fetches published Insights, conflicting with audit-only scope; no lock removal or fabricated approval",
  },
  limitation: "Batch totals overlap suites. Additional batch has one fixture limiter interaction failure, corrected and separately passed in privacy-retest-results.json. Retain the original failure rather than relabelling it passed. Totals are assertions executed, not unique routes tested.",
};
writeFileSync("docs/security/evidence-ledger.json", JSON.stringify(ledger, null, 2) + "\n");
console.log(JSON.stringify({ batches: batches.map(b => ({ file: b.file, passed: b.passed, failed: b.failed })), browser: browser.stats }));
if (batches.some(b => !b.success && b.file !== "additional-test-results.json") || browser.errors.length || browser.stats.unexpected || browser.stats.skipped) process.exitCode = 1;