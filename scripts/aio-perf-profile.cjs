/* AIO Fusion performance profile.
 *
 * This is a measurement harness, not an end-to-end correctness suite. Public
 * pages are measured against the published staging origin. Private journeys
 * use a temporary static server for an already-built frontend and intercepted,
 * read-only API fixtures. They never use an account, credentials, database, or
 * deployment workflow.
 *
 * Usage:
 *   node scripts/aio-perf-profile.cjs --phase before
 *   node scripts/aio-perf-profile.cjs --phase after
 *
 * The phase is deliberately metadata only; pass the corresponding build with
 * --build-dir. The default before directory is /tmp/aio-perf-before.
 */
const { chromium } = require("@playwright/test");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const PUBLIC_ORIGIN = "https://aio-fusion-staging.replit.app";
const CHROMIUM = "/repl/tools/bin/chromium";
const PHASE = readArg("--phase") || "before";
const BUILD_DIR = readArg("--build-dir") || (PHASE === "before" ? "/tmp/aio-perf-before" : "/tmp/aio-perf-after");
const SAMPLES = Number(readArg("--samples") || 3);
const PRIVATE_ONLY = process.argv.includes("--private-only");
const COLD_FIXTURE = process.argv.includes("--cold");
const OUTPUT_DIR = path.resolve("docs/performance");
const OUTPUT_SUFFIX = COLD_FIXTURE ? "-private-cold" : "";
const OUTPUT_JSON = path.join(OUTPUT_DIR, `aio-perf-${PHASE}${OUTPUT_SUFFIX}.json`);
const OUTPUT_MD = path.join(OUTPUT_DIR, `aio-perf-${PHASE}${OUTPUT_SUFFIX}.md`);
const FIXTURE_LATENCY_MS = COLD_FIXTURE
  ? { me: 120, accounts: 900, projects: 900, workspaceData: 900 }
  : { me: 120, accounts: 70, projects: 85, workspaceData: 45 };

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safePath(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.pathname;
  } catch {
    return String(rawUrl).split("?")[0];
  }
}

function fixtureProject() {
  return {
    id: "fixture-project-1",
    name: "Synthetic Measurement Project",
    sector: "Technology",
    initials: "SM",
    color: "#1f748f",
    contentCount: 2,
    avgScore: 74,
    scoreTrend: 3,
    activePlans: 1,
    lastActive: "2026-01-15",
    recentActivity: "Synthetic fixture",
    owner: "synthetic-agency",
  };
}

function jsonResponse(body, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

function fixtureFor(pathname) {
  if (pathname === "/api/platform/me") {
    return {
      account: {
        username: "synthetic-agency",
        role: "agency",
        membershipRole: null,
        projectAccess: null,
      },
      impersonating: null,
      setupComplete: true,
      hasPassword: true,
      emailVerified: true,
      masterOwner: false,
      accountProfile: { displayName: "Synthetic Agency", website: "https://example.invalid" },
      sessionIdentity: {
        userName: "Synthetic User",
        userEmail: "synthetic@example.invalid",
        companyName: "Synthetic Agency",
      },
      workspaces: [],
      insightsCmsAccess: false,
    };
  }
  if (pathname === "/api/platform/accounts") {
    return {
      accounts: [
        {
          username: "synthetic-agency",
          role: "agency",
          displayName: "Synthetic Agency",
          website: "https://example.invalid",
        },
      ],
    };
  }
  if (pathname === "/api/store/projects") {
    return { projects: [fixtureProject()], deletedIds: [] };
  }
  if (pathname === "/api/platform/workspaces") return { workspaces: [] };
  if (pathname === "/api/support/tickets") return { tickets: [] };
  if (pathname === "/api/store/archive") return { items: [] };
  if (pathname === "/api/store/planner") return { projects: [] };
  if (pathname === "/api/store/scoring-config") return { config: {} };
  if (pathname === "/api/store/projects/fixture-project-1/intake") return { intake: {} };
  if (pathname === "/api/store/media-db/outlets") {
    return { outlets: [{ id: 1, name: "Synthetic News", category: "Technology", website: "https://example.invalid", description: "", country: "UK", reachBand: "National", accountId: null, collectionScope: "shared" }] };
  }
  if (pathname === "/api/store/media-db/contacts") {
    return { contacts: [{ id: 1, firstName: "Synthetic", lastName: "Reporter", role: "Editor", email: "", phone: "", notes: "", accountId: null, beats: ["technology"], sectors: ["technology"], outletId: 1 }], total: 1, page: 1, pageSize: 200 };
  }
  if (pathname === "/api/store/media-categories") return { standard: ["Technology"], custom: [] };
  if (pathname === "/api/store/media-db/search") return { results: [], total: 0 };
  if (pathname === "/api/store/media-db/recommendations") return { recommendations: [] };
  if (pathname === "/api/store/media-db/recommendations/decisions") return { decisions: [] };
  if (pathname === "/api/store/media-db/recommendations/brief") return { brief: null };
  if (pathname === "/api/store/media-db/discoveries") return { discoveries: [] };
  if (pathname === "/api/store/media-db/recommendations/contact-restriction") return { restricted: false };
  if (pathname === "/api/store/projects/fixture-project-1/audits") return { audits: [] };
  if (pathname === "/api/store/projects/fixture-project-1/diagnostics") return { diagnostics: [] };
  if (pathname.endsWith("/content-media")) return { items: [] };
  return {};
}

async function launchStaticServer(root) {
  assert.ok(fs.existsSync(path.join(root, "index.html")), `No production index.html in ${root}`);
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const requested = path.resolve(root, `.${pathname}`);
    const inRoot = requested === root || requested.startsWith(`${root}${path.sep}`);
    const target = inRoot && fs.existsSync(requested) && fs.statSync(requested).isFile()
      ? requested
      : path.join(root, "index.html");
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405);
      response.end();
      return;
    }
    response.setHeader("Content-Type", mime[path.extname(target)] || "application/octet-stream");
    response.setHeader("Cache-Control", "no-store");
    fs.createReadStream(target).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return { origin: `http://127.0.0.1:${address.port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

async function resourceMetrics(page) {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const paint = performance.getEntriesByName("first-contentful-paint")[0];
    const resources = performance.getEntriesByType("resource").map((entry) => {
      const resource = entry;
      const url = new URL(resource.name, location.href);
      return {
        path: url.pathname,
        kind: url.pathname.includes("/assets/") ? "chunk" : "resource",
        initiatorType: resource.initiatorType,
        transferSize: resource.transferSize || 0,
        encodedBodySize: resource.encodedBodySize || 0,
        decodedBodySize: resource.decodedBodySize || 0,
        duration: Math.round(resource.duration * 100) / 100,
      };
    });
    const scripts = resources.filter((resource) =>
      resource.kind === "chunk" && (resource.initiatorType === "script" || resource.path.endsWith(".js")),
    );
    const styles = resources.filter((resource) =>
      resource.kind === "chunk" && (resource.initiatorType === "link" || resource.path.endsWith(".css")),
    );
    const sum = (items, key) => items.reduce((total, item) => total + item[key], 0);
    return {
      navigation: navigation ? {
        type: navigation.type,
        duration: Math.round(navigation.duration * 100) / 100,
        responseStart: Math.round(navigation.responseStart * 100) / 100,
        domContentLoaded: Math.round(navigation.domContentLoadedEventEnd * 100) / 100,
        loadEventEnd: Math.round(navigation.loadEventEnd * 100) / 100,
        transferSize: navigation.transferSize || 0,
        encodedBodySize: navigation.encodedBodySize || 0,
      } : null,
      fcp: paint ? Math.round(paint.startTime * 100) / 100 : null,
      document: navigation ? {
        count: 1,
        transferBytes: navigation.transferSize || 0,
        encodedBytes: navigation.encodedBodySize || 0,
      } : { count: 0, transferBytes: 0, encodedBytes: 0 },
      chunks: {
        count: scripts.length,
        transferBytes: sum(scripts, "transferSize"),
        encodedBytes: sum(scripts, "encodedBodySize"),
        resources: scripts,
      },
      styles: {
        count: styles.length,
        transferBytes: sum(styles, "transferSize"),
        encodedBytes: sum(styles, "encodedBodySize"),
        resources: styles,
      },
      resources,
    };
  });
}

function createRequestTracker(page) {
  const started = new Map();
  const requests = [];
  const trackerStartedAt = performance.now();
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/")) started.set(request, performance.now());
  });
  page.on("requestfinished", async (request) => {
    if (!started.has(request)) return;
    const startedAt = started.get(request);
    const response = await request.response();
    requests.push({
      path: safePath(request.url()),
      method: request.method(),
      status: response ? response.status() : null,
      startOffset: Math.round((startedAt - trackerStartedAt) * 100) / 100,
      elapsed: Math.round((performance.now() - startedAt) * 100) / 100,
    });
    started.delete(request);
  });
  page.on("requestfailed", (request) => {
    if (!started.has(request)) return;
    requests.push({
      path: safePath(request.url()),
      method: request.method(),
      status: null,
      startOffset: Math.round((started.get(request) - trackerStartedAt) * 100) / 100,
      elapsed: Math.round((performance.now() - started.get(request)) * 100) / 100,
    });
    started.delete(request);
  });
  return {
    async snapshot() {
      await page.waitForTimeout(20);
      return requests.slice();
    },
  };
}

function summarizeApi(requests) {
  const byPath = {};
  for (const request of requests) {
    const key = `${request.method} ${request.path}`;
    byPath[key] = (byPath[key] || 0) + 1;
  }
  const pathTimings = (paths) => requests
    .filter((request) => paths.includes(request.path))
    .map((request) => request.elapsed);
  return {
    total: requests.length,
    redundant: Object.entries(byPath)
      .filter(([, count]) => count > 1)
      .reduce((total, [, count]) => total + count - 1, 0),
    byPath,
    authoritativeMe: {
      count: requests.filter((request) => request.path === "/api/platform/me").length,
      elapsed: pathTimings(["/api/platform/me"]),
    },
    accounts: {
      count: requests.filter((request) => request.path === "/api/platform/accounts").length,
      elapsed: pathTimings(["/api/platform/accounts"]),
    },
    projects: {
      count: requests.filter((request) => request.path === "/api/store/projects").length,
      elapsed: pathTimings(["/api/store/projects"]),
    },
  };
}

async function measurePage(page, url, waitFor, configure) {
  const tracker = createRequestTracker(page);
  if (configure) await configure();
  const startedAt = performance.now();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  if (waitFor) await waitFor(page);
  const renderElapsed = Math.round((performance.now() - startedAt) * 100) / 100;
  await page.waitForTimeout(350);
  const requests = await tracker.snapshot();
  return {
    url: new URL(url).pathname,
    renderElapsed,
    performance: await resourceMetrics(page),
    api: summarizeApi(requests),
    apiRequests: requests,
  };
}

async function publicSamples(browser, route) {
  const samples = [];
  for (let sample = 1; sample <= SAMPLES; sample += 1) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      samples.push({ sample, ...(await measurePage(
        page,
        `${PUBLIC_ORIGIN}${route}`,
        async (current) => {
          await current.waitForTimeout(900);
          await current.locator("body").waitFor();
        },
      )) });
    } catch (error) {
      samples.push({ sample, error: String(error), url: route });
    } finally {
      await page.close();
    }
  }
  return samples;
}

async function configureFixtures(page) {
  let signedIn = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = safePath(request.url());
    if (method === "POST" && pathname === "/api/platform/login") {
      signedIn = true;
      await route.fulfill(jsonResponse({ account: { username: "synthetic-agency", role: "agency" } }));
      return;
    }
    if (method !== "GET" && method !== "HEAD") {
      await route.abort("blockedbyclient");
      return;
    }
    if (pathname === "/api/platform/me" && !signedIn) {
      await route.fulfill(jsonResponse({ error: "Not authenticated" }, 401));
      return;
    }
    const delay = pathname === "/api/platform/me"
      ? FIXTURE_LATENCY_MS.me
      : pathname === "/api/platform/accounts"
        ? FIXTURE_LATENCY_MS.accounts
        : pathname === "/api/store/projects"
          ? FIXTURE_LATENCY_MS.projects
          : FIXTURE_LATENCY_MS.workspaceData;
    await sleep(delay);
    await route.fulfill(jsonResponse(fixtureFor(pathname)));
  });
}

async function login(page, origin) {
  await page.goto(`${origin}/?oauth_status=ok`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByPlaceholder("Email or username").fill("synthetic@example.invalid");
  await page.getByPlaceholder("Password").fill("synthetic-fixture-password");
  const started = performance.now();
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.getByRole("button", { name: /project hub/i }).waitFor({ timeout: 30000 });
  return Math.round((performance.now() - started) * 100) / 100;
}

async function privateJourney(browser, origin, journey) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const tracker = createRequestTracker(page);
  const started = performance.now();
  try {
    await configureFixtures(page);
    const loginElapsed = await login(page, origin);
    let target;
    let navigationElapsed = null;
    let backgroundApiRequests = [];
    if (journey === "login-to-hub") {
      const hubStarted = performance.now();
      await page.getByRole("button", { name: /project hub/i }).click();
      await page.getByText("Synthetic Measurement Project", { exact: true }).waitFor({ timeout: 30000 });
      target = "project-hub";
      navigationElapsed = Math.round((performance.now() - hubStarted) * 100) / 100;
    } else if (journey === "account-settings") {
      await page.getByRole("button", { name: /account.*team settings/i }).click();
      await page.getByText("Account type", { exact: true }).waitFor({ timeout: 30000 });
      target = "account-settings";
    } else if (journey === "background-resync") {
      await page.getByRole("button", { name: /project hub/i }).click();
      await page.getByText("Synthetic Measurement Project", { exact: true }).waitFor({ timeout: 30000 });
      target = "background-resync";
    } else {
      await page.getByRole("button", { name: /project hub/i }).click();
      await page.getByText("Synthetic Measurement Project", { exact: true }).waitFor({ timeout: 30000 });
      await page.getByRole("button", { name: /^enter$/i }).click();
      await page.getByRole("button", { name: new RegExp(journey === "project-media" ? "Media Research" : "Content Creator", "i") }).waitFor({ timeout: 30000 });
      const navigationStarted = performance.now();
      await page.getByRole("button", { name: new RegExp(journey === "project-media" ? "Media Research" : "Content Creator", "i") }).click();
      const label = journey === "project-media" ? /Media Research/i : /Content Creator/i;
      await page.locator('main[aria-label="AIO Fusion workspace"] h1').filter({ hasText: label }).waitFor({ timeout: 30000 });
      navigationElapsed = Math.round((performance.now() - navigationStarted) * 100) / 100;
      target = journey;
    }
    await page.waitForTimeout(350);
    let apiRequests = await tracker.snapshot();
    if (journey === "background-resync") {
      const initialRequestCount = apiRequests.length;
      const refreshStarted = performance.now();
      await page.evaluate(() => {
        window.dispatchEvent(new Event("focus"));
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.waitForTimeout(COLD_FIXTURE ? 1100 : 220);
      apiRequests = await tracker.snapshot();
      backgroundApiRequests = apiRequests.slice(initialRequestCount).map((request) => ({
        ...request,
        backgroundElapsed: Math.round((performance.now() - refreshStarted) * 100) / 100,
      }));
    }
    return {
      journey,
      target,
      loginElapsed,
      renderElapsed: Math.round((performance.now() - started) * 100) / 100,
      navigationElapsed,
      performance: await resourceMetrics(page),
      api: summarizeApi(apiRequests),
      backgroundApi: backgroundApiRequests.length ? summarizeApi(backgroundApiRequests) : null,
      backgroundApiRequests,
      apiRequests,
      synthetic: true,
      fixtureLatencyMs: FIXTURE_LATENCY_MS,
    };
  } catch (error) {
    return {
      journey,
      synthetic: true,
      error: String(error),
      api: summarizeApi(await tracker.snapshot()),
      apiRequests: await tracker.snapshot(),
    };
  } finally {
    await page.close();
  }
}

function aggregate(samples) {
  const values = (read) => samples.map(read).filter((value) => Number.isFinite(value));
  const median = (items) => {
    const sorted = items.slice().sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  };
  return {
    samples: samples.length,
    journeyElapsedMedian: median(values((sample) => sample.renderElapsed)),
    navigationElapsedMedian: median(values((sample) => sample.navigationElapsed)),
    navigationDurationMedian: median(values((sample) => sample.performance?.navigation?.duration)),
    fcpMedian: median(values((sample) => sample.performance?.fcp)),
    documentTransferBytesMedian: median(values((sample) => sample.performance?.document?.transferBytes)),
    chunkCountMedian: median(values((sample) => sample.performance?.chunks?.count)),
    chunkTransferBytesMedian: median(values((sample) => sample.performance?.chunks?.transferBytes)),
    apiRequestCountMedian: median(values((sample) => sample.api?.total)),
    redundantRequestCountMedian: median(values((sample) => sample.api?.redundant)),
    authoritativeMeElapsedMedian: median(values((sample) => Math.max(0, ...(sample.api?.authoritativeMe?.elapsed || [])))),
    projectsElapsedMedian: median(values((sample) => Math.max(0, ...(sample.api?.projects?.elapsed || [])))),
  };
}

function markdownReport(results) {
  const lines = [
    `# AIO Fusion ${PHASE}${COLD_FIXTURE ? " private cold-fixture" : ""} performance profile`,
    "",
    "This is a sanitized profiling capture. Public routes use the published staging origin. Private journeys use a temporary static server and intercepted synthetic fixtures; they do not use real authentication, accounts, secrets, or database data.",
    "",
    `- Captured: ${results.capturedAt}`,
    `- Build: \`${BUILD_DIR}\``,
    `- Browser: \`${CHROMIUM}\``,
    `- Public samples per route: ${PRIVATE_ONLY ? "not captured (private-only run)" : SAMPLES}`,
    "- API writes: blocked, except the synthetic fixture login POST.",
    COLD_FIXTURE ? "- Cold synthetic fixture delays: /me 120 ms; accounts, projects, archive, planner, scoring and other workspace reads 900 ms." : "",
    "",
    "## Public navigation",
    "",
    "| Route | Samples | Median FCP ms | Median document bytes | Median JS chunks | Median JS chunk bytes |",
    "|---|---:|---:|---:|---:|---:|",
  ];
  for (const [route, group] of Object.entries(results.public)) {
    const a = aggregate(group);
    lines.push(`| ${route} | ${a.samples} | ${a.fcpMedian ?? "—"} | ${a.documentTransferBytesMedian ?? "—"} | ${a.chunkCountMedian ?? "—"} | ${a.chunkTransferBytesMedian ?? "—"} |`);
  }
  lines.push("", "## Synthetic private journeys", "", "| Journey | Samples | Median total journey ms | Median target navigation ms | Median login ms | Median /me ms | Median projects ms | Median redundant API requests | Background projects/accounts |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const [journey, group] of Object.entries(results.private)) {
    const a = aggregate(group);
    const login = group.map((sample) => sample.loginElapsed).filter(Number.isFinite);
    login.sort((x, y) => x - y);
    const loginMedian = login.length ? login[Math.floor(login.length / 2)] : "—";
    const backgroundReadCounts = group.map((sample) => {
      const requests = sample.backgroundApiRequests || [];
      return requests.filter((request) => request.path === "/api/store/projects" || request.path === "/api/platform/accounts").length;
    }).filter(Number.isFinite);
    const backgroundReadMedian = backgroundReadCounts.length
      ? backgroundReadCounts.sort((left, right) => left - right)[Math.floor(backgroundReadCounts.length / 2)]
      : "—";
    lines.push(`| ${journey} | ${a.samples} | ${a.journeyElapsedMedian ?? "—"} | ${a.navigationElapsedMedian ?? "—"} | ${loginMedian} | ${a.authoritativeMeElapsedMedian ?? "—"} | ${a.projectsElapsedMedian ?? "—"} | ${a.redundantRequestCountMedian ?? "—"} | ${backgroundReadMedian} |`);
  }
  lines.push("", "Detailed request/resource records are in the adjacent JSON file. Query strings are omitted from stored API paths.");
  return `${lines.join("\n")}\n`;
}

async function main() {
  assert.ok(["before", "after"].includes(PHASE), "--phase must be before or after");
  assert.ok(Number.isInteger(SAMPLES) && SAMPLES > 0, "--samples must be a positive integer");
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] });
  const staticServer = await launchStaticServer(path.resolve(BUILD_DIR));
  try {
    const result = {
      schemaVersion: 1,
      phase: PHASE,
      capturedAt: new Date().toISOString(),
      environment: {
        publicOrigin: PUBLIC_ORIGIN,
        syntheticPrivateOrigin: staticServer.origin,
        buildDir: BUILD_DIR,
        browserExecutable: CHROMIUM,
        synthetic: true,
        note: "Private journeys are read-only fixture profiles, not real auth or DB measurements.",
      },
      fixtureLatencyMs: FIXTURE_LATENCY_MS,
      public: {},
      private: {},
    };
    if (!PRIVATE_ONLY) {
      for (const route of ["/", "/pricing", "/insights"]) {
        result.public[route] = await publicSamples(browser, route);
      }
    }
    for (const journey of ["login-to-hub", "account-settings", "background-resync", "project-media", "project-content"]) {
      const samples = [];
      for (let sample = 1; sample <= SAMPLES; sample += 1) {
        samples.push({ sample, ...(await privateJourney(browser, staticServer.origin, journey)) });
      }
      result.private[journey] = samples;
    }
    fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(result, null, 2)}\n`);
    fs.writeFileSync(OUTPUT_MD, markdownReport(result));
    console.log(`Wrote ${OUTPUT_JSON}`);
    console.log(`Wrote ${OUTPUT_MD}`);
  } finally {
    await staticServer.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});