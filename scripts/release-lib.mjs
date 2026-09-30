import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GIT_REVISION_PATTERN = /^[0-9a-f]{40}$/i;

export const RELEASE_STAGE_TIMEOUTS = Object.freeze({
  "release automation guard": 60_000,
  typecheck: 10 * 60_000,
  // The full-workbook import test can use 10 minutes by itself, while the rest
  // of the PGlite-backed API files still need time to finish.
  "api regression suite": 30 * 60_000,
  "web regression suite": 10 * 60_000,
  "operational script suite": 10 * 60_000,
  "API production build": 10 * 60_000,
  "web production build": 10 * 60_000,
  "production API startup smoke": 2 * 60_000,
  "critical browser journeys": 15 * 60_000,
});
export const DEFAULT_STAGE_TIMEOUT_MS = 10 * 60_000;

export const RELEASE_STAGES = [
  ["release automation guard", "pnpm run release:validate-automation", RELEASE_STAGE_TIMEOUTS["release automation guard"]],
  ["typecheck", "pnpm run typecheck", RELEASE_STAGE_TIMEOUTS.typecheck],
  // Release checks run sequentially on this eight-CPU workspace. Use more
  // file workers here without raising the default used alongside typechecking.
  // The planner schema test starts its own PGlite instance; under four busy
  // workers its setup can stall even though it passes when run separately.
  // Keep it mandatory, but run it alone in the same fail-closed stage.
  ["api regression suite", "pnpm --filter @workspace/api-server exec vitest run --maxWorkers=4 --exclude src/lib/ensure-planner-content-columns.test.ts && pnpm --filter @workspace/api-server exec vitest run src/lib/ensure-planner-content-columns.test.ts --maxWorkers=1", RELEASE_STAGE_TIMEOUTS["api regression suite"]],
  ["web regression suite", "pnpm --filter @workspace/aio-fusion run test", RELEASE_STAGE_TIMEOUTS["web regression suite"]],
  ["operational script suite", "pnpm --filter @workspace/scripts run test", RELEASE_STAGE_TIMEOUTS["operational script suite"]],
  ["API production build", "pnpm --filter @workspace/api-server run build", RELEASE_STAGE_TIMEOUTS["API production build"]],
  ["web production build", "pnpm --filter @workspace/aio-fusion run build", RELEASE_STAGE_TIMEOUTS["web production build"]],
  ["production API startup smoke", "node scripts/release-smoke.mjs", RELEASE_STAGE_TIMEOUTS["production API startup smoke"]],
  ["critical browser journeys", "pnpm exec playwright test --config=playwright.release.config.ts", RELEASE_STAGE_TIMEOUTS["critical browser journeys"]],
];

export function assertReleaseEnvironment(env = process.env) {
  const target = env.RELEASE_ENVIRONMENT;
  if (!target) {
    throw new Error("RELEASE_ENVIRONMENT is required and must explicitly target staging.");
  }
  if (target !== "staging") {
    throw new Error("Release candidates must target staging. Production verification runs only after an explicit release.");
  }
  if (env.RELEASE_BASE_URL) {
    let url;
    try {
      url = new URL(env.RELEASE_BASE_URL);
    } catch {
      throw new Error("RELEASE_BASE_URL must be a valid absolute URL.");
    }
    const hostname = url.hostname.toLowerCase();
    const loopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
    const namedStagingHost = hostname.startsWith("staging.");
    if (!["http:", "https:"].includes(url.protocol) || (!loopback && !namedStagingHost)) {
      throw new Error("Release candidate checks refuse a non-staging RELEASE_BASE_URL hostname.");
    }
  }
  return target;
}

export async function getGitSourceState({ cwd = process.cwd(), exec = execFileAsync } = {}) {
  const commandOptions = { cwd, encoding: "utf8" };
  const revisionArgs = ["rev-parse", "HEAD", "HEAD^{tree}"];
  const { stdout: before } = await exec("git", revisionArgs, commandOptions);
  const { stdout: status } = await exec("git", ["status", "--porcelain", "--untracked-files=normal"], commandOptions);
  const { stdout: after } = await exec("git", revisionArgs, commandOptions);
  const [gitRevision, gitTree] = before.trim().split(/\s+/);
  if (!GIT_REVISION_PATTERN.test(gitRevision ?? "") || !GIT_REVISION_PATTERN.test(gitTree ?? "")) {
    throw new Error("Could not determine a valid Git revision and tree for release evidence.");
  }
  if (before.trim() !== after.trim()) {
    throw new Error("Git revision or tree changed while release source state was being captured.");
  }
  return {
    gitRevision,
    gitTree,
    sourceState: status.trim() ? "dirty" : "clean",
  };
}

export function assertReleaseEvidenceCurrent(evidence, currentSource) {
  if (!evidence || evidence.status !== "passed") {
    throw new Error("Release evidence must show a passed gate.");
  }
  // Replit records a successful publish as an empty commit. A matching Git tree
  // is the same tracked source even when that bookkeeping commit changes HEAD.
  // Older evidence without a tree retains the stricter revision-only rule.
  const sameRevision = evidence.gitRevision && evidence.gitRevision === currentSource?.gitRevision
    && (!evidence.gitTree || evidence.gitTree === currentSource?.gitTree);
  const sameTree = GIT_REVISION_PATTERN.test(evidence.gitTree ?? "")
    && evidence.gitTree === currentSource?.gitTree;
  if (!sameRevision && !sameTree) {
    throw new Error("Release evidence is stale because it covers a different Git revision.");
  }
  if (evidence.sourceState !== "clean") {
    throw new Error("Release evidence is not approvable because its source state was dirty.");
  }
  if (currentSource.sourceState !== "clean") {
    throw new Error("Release evidence is not approvable while the current source state is dirty.");
  }
  return true;
}

function safeUtcKey(isoTime) {
  return isoTime.replaceAll(":", "-");
}

export async function appendReleaseHistory({
  gitRevision,
  event,
  status,
  environment = "staging",
  recordedAt = new Date().toISOString(),
  historyRoot = path.join("release-evidence", "history"),
  details = {},
} = {}) {
  if (!GIT_REVISION_PATTERN.test(gitRevision ?? "")) {
    throw new Error("Release history requires a valid Git revision.");
  }
  if (!/^[a-z][a-z0-9-]*$/.test(event ?? "")) {
    throw new Error("Release history requires a safe event name.");
  }
  if (!["passed", "failed", "succeeded", "rejected", "matched", "mismatched"].includes(status)) {
    throw new Error("Release history requires a supported status.");
  }

  const directory = path.join(historyRoot, gitRevision.toLowerCase());
  const basename = `${safeUtcKey(recordedAt)}-${event}`;
  const record = {
    schemaVersion: 1,
    recordedAt,
    environment,
    gitRevision,
    event,
    status,
    ...details,
  };
  await mkdir(directory, { recursive: true });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
    const recordPath = path.join(directory, `${basename}${suffix}.json`);
    try {
      await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600, flag: "wx" });
      return recordPath;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
  throw new Error("Could not allocate an immutable release-history filename.");
}

export async function readCurrentReleaseEvidence({
  evidencePath = path.join("release-evidence", "latest.json"),
  getSourceState = getGitSourceState,
  readEvidence = async (filePath) => JSON.parse(await readFile(filePath, "utf8")),
} = {}) {
  let evidence;
  try {
    evidence = await readEvidence(evidencePath);
  } catch (error) {
    const detail = error instanceof SyntaxError ? "is not valid JSON" : "could not be read";
    throw new Error(`Release evidence ${detail}: ${evidencePath}`, { cause: error });
  }

  const currentSource = await getSourceState();
  try {
    assertReleaseEvidenceCurrent(evidence, currentSource);
  } catch (error) {
    error.releaseEvidence = evidence;
    throw error;
  }
  return { evidence, currentSource };
}

export async function runStagingPublication({
  env = process.env,
  evidencePath = path.join("release-evidence", "latest.json"),
  getSourceState = getGitSourceState,
  readEvidence = async (filePath) => JSON.parse(await readFile(filePath, "utf8")),
  publish,
  now = () => new Date(),
  recordHistory = appendReleaseHistory,
  historyRoot = path.join(path.dirname(evidencePath), "history"),
} = {}) {
  assertReleaseEnvironment(env);
  if (typeof publish !== "function") {
    throw new Error("A staging publication command is required.");
  }

  let evidence;
  try {
    evidence = await readEvidence(evidencePath);
    const currentSource = await getSourceState();
    assertReleaseEvidenceCurrent(evidence, currentSource);
    await publish({
      environment: "staging",
      gitRevision: evidence.gitRevision,
    });
    await recordHistory({
      gitRevision: evidence.gitRevision,
      event: "publication",
      status: "succeeded",
      recordedAt: now().toISOString(),
      historyRoot,
    });
    return { evidence, currentSource };
  } catch (error) {
    if (GIT_REVISION_PATTERN.test(evidence?.gitRevision ?? "")) {
      await recordHistory({
        gitRevision: evidence.gitRevision,
        event: "publication",
        status: "rejected",
        recordedAt: now().toISOString(),
        historyRoot,
        details: { reason: "publication guard or publisher rejected the release" },
      });
    }
    if (evidence === undefined) {
      const detail = error instanceof SyntaxError ? "is not valid JSON" : "could not be read";
      throw new Error(`Release evidence ${detail}: ${evidencePath}`, { cause: error });
    }
    throw error;
  }
}

export async function runCommand(command, options = {}) {
  const { timeoutMs = 0, ...spawnOptions } = options;
  await new Promise((resolve, reject) => {
    // A detached shell gives us a process group, so grandchildren are not left
    // behind when a release command hangs.
    const child = spawn(command, { shell: true, stdio: "inherit", detached: process.platform !== "win32", ...spawnOptions });
    let timer;
    let settled = false;
    let timedOut = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      callback(value);
    };
    child.once("error", (error) => finish(reject, error));
    child.once("exit", (code, signal) => {
      if (timedOut) return;
      code === 0 ? finish(resolve) : finish(reject, new Error(`exited ${code ?? `by ${signal}`}`));
    });
    if (timeoutMs > 0) {
      timer = setTimeout(async () => {
        timedOut = true;
        await stopChild(child);
        const error = new Error(`timed out after ${timeoutMs}ms`);
        error.code = "RELEASE_STAGE_TIMEOUT";
        finish(reject, error);
      }, timeoutMs);
      timer.unref?.();
    }
  });
}

export async function runReleaseGate({
  stages = RELEASE_STAGES,
  run = runCommand,
  env = process.env,
  now = () => new Date(),
  evidencePath = path.join("release-evidence", "latest.json"),
  defaultStageTimeoutMs = DEFAULT_STAGE_TIMEOUT_MS,
  getSourceState = getGitSourceState,
  recordHistory = appendReleaseHistory,
  historyRoot = path.join(path.dirname(evidencePath), "history"),
} = {}) {
  const startedAt = now().toISOString();
  let environment;
  let result;
  let source = {};
  let safeguardFailure = "environment safeguards";
  const results = [];
  try {
    source = await getSourceState();
    safeguardFailure = "source revision safeguards";
    if (source.sourceState !== "clean") {
      throw new Error("Release checks require a clean source state.");
    }
    safeguardFailure = "environment safeguards";
    environment = assertReleaseEnvironment(env);
    for (const [name, command, configuredTimeoutMs] of stages) {
      const timeoutMs = configuredTimeoutMs ?? defaultStageTimeoutMs;
      const stageStart = now();
      console.log(`\n[release] START ${name}`);
      try {
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
          throw new Error(`stage ${name} has no valid timeout`);
        }
        await withTimeout(
          run(command, { env: { ...env, RELEASE_ENVIRONMENT: environment }, timeoutMs }),
          timeoutMs,
        );
        results.push({ name, status: "passed", durationMs: now() - stageStart });
        console.log(`[release] PASS  ${name}`);
      } catch (error) {
        const timedOut = error?.code === "RELEASE_STAGE_TIMEOUT";
        results.push({ name, status: "failed", durationMs: now() - stageStart, ...(timedOut ? { timedOut: true } : {}) });
        console.error(`[release] FAIL  ${name}: ${error instanceof Error ? error.message : "unknown error"}`);
        throw error;
      }
    }
    safeguardFailure = "source revision safeguards";
    const finalSource = await getSourceState();
    // A publish-record commit is acceptable between releases, not while a
    // release check is running. Each stage must have seen this exact revision.
    if (source.gitRevision !== finalSource.gitRevision || source.gitTree !== finalSource.gitTree) {
      throw new Error("Git revision or tree changed while release stages were running.");
    }
    assertReleaseEvidenceCurrent({ status: "passed", ...source }, finalSource);
    result = { status: "passed", environment, ...source, startedAt, finishedAt: now().toISOString(), stages: results };
  } catch (error) {
    result = {
      status: "failed",
      environment: environment ?? env.RELEASE_ENVIRONMENT ?? "invalid",
      ...source,
      startedAt,
      finishedAt: now().toISOString(),
      stages: results,
      failedStage: results.at(-1)?.status === "failed" ? results.at(-1)?.name : safeguardFailure,
    };
  } finally {
    result ??= {
      status: "failed",
      environment: environment ?? env.RELEASE_ENVIRONMENT ?? "invalid",
      ...source,
      startedAt,
      finishedAt: now().toISOString(),
      stages: results,
      failedStage: safeguardFailure,
    };
    await mkdir(path.dirname(evidencePath), { recursive: true });
    await writeFile(evidencePath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    if (GIT_REVISION_PATTERN.test(result.gitRevision ?? "")) {
      await recordHistory({
        gitRevision: result.gitRevision,
        event: "release-candidate",
        status: result.status,
        recordedAt: result.finishedAt,
        historyRoot,
        details: {
          sourceState: result.sourceState,
          startedAt: result.startedAt,
          finishedAt: result.finishedAt,
          stages: result.stages,
          ...(result.failedStage ? { failedStage: result.failedStage } : {}),
        },
      });
    }
  }
  return result;
}

export async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Could not reserve a port"));
      server.close(() => resolve(address.port));
    });
  });
}

export async function waitForHealth(url, { timeoutMs = 15_000, intervalMs = 200, fetchImpl = fetch } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "not ready";
  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(url);
      if (response.ok && (await response.json()).status === "ok") return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "request failed";
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`health check timed out after ${timeoutMs}ms (${lastError})`);
}

export async function stopChild(child, { timeoutMs = 3_000 } = {}) {
  if (child.exitCode !== null) return;
  const signal = (name) => {
    // Detached children share a process group; terminate the whole group so a
    // shell cannot leave a hanging test/build descendant behind.
    if (process.platform !== "win32" && child.pid) {
      try {
        process.kill(-child.pid, name);
        return;
      } catch {
        // The process may have exited between the check and kill.
      }
    }
    child.kill(name);
  };
  signal("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(() => {
      if (child.exitCode === null) signal("SIGKILL");
      resolve();
    }, timeoutMs)),
  ]);
}

export async function withTimeout(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`timed out after ${timeoutMs}ms`);
          error.code = "RELEASE_STAGE_TIMEOUT";
          reject(error);
        }, timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
