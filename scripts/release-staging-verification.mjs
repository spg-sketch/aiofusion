#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendReleaseHistory,
  assertReleaseEnvironment,
  assertReleaseEvidenceCurrent,
  getGitSourceState,
} from "./release-lib.mjs";

const DEFAULT_EVIDENCE_PATH = path.join("release-evidence", "latest.json");
const MISMATCHED_REVISION = "0000000000000000000000000000000000000000";
const GIT_REVISION_PATTERN = /^[0-9a-f]{40}$/i;

function healthUrl(baseUrl) {
  return new URL("/api/healthz", baseUrl).toString();
}

function safeObservedRevision(value) {
  return GIT_REVISION_PATTERN.test(value ?? "") ? value : "unavailable";
}

async function runGuardedPublisher(publisherArgs, {
  env,
  cwd = process.cwd(),
  spawnProcess = spawn,
  stdio = "inherit",
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(
      process.execPath,
      [fileURLToPath(new URL("./release-publish.mjs", import.meta.url)), ...publisherArgs],
      { cwd, env, stdio },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

async function waitForPublishedRevision(baseUrl, expectedRevision, {
  fetchImpl = fetch,
  timeoutMs = 120_000,
  intervalMs = 2_000,
} = {}) {
  const endpoint = healthUrl(baseUrl);
  const deadline = Date.now() + timeoutMs;
  let lastObserved = "unavailable";
  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(endpoint, { headers: { accept: "application/json" } });
      const body = response.ok ? await response.json() : {};
      lastObserved = body.releaseRevision ?? `HTTP ${response.status}`;
      if (body.status === "ok" && body.releaseRevision === expectedRevision) {
        return { health: body, observedRevision: body.releaseRevision };
      }
    } catch (error) {
      lastObserved = error instanceof Error ? error.message : "request failed";
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  const error = new Error(
    `Staging did not report verified revision ${expectedRevision} at ${endpoint} `
    + `(last observed: ${lastObserved}).`,
  );
  error.observedRevision = lastObserved;
  throw error;
}

export async function verifyGuardedStagingPublication({
  publisherArgs,
  env = process.env,
  cwd = process.cwd(),
  evidencePath = DEFAULT_EVIDENCE_PATH,
  read = readFile,
  write = writeFile,
  getSourceState = () => getGitSourceState({ cwd }),
  runPublisher = (args, options) => runGuardedPublisher(args, options),
  verifyRevision = waitForPublishedRevision,
  now = () => new Date(),
  recordHistory = appendReleaseHistory,
} = {}) {
  assertReleaseEnvironment(env);
  if (!env.RELEASE_BASE_URL) {
    throw new Error("RELEASE_BASE_URL is required for staging publication verification.");
  }
  if (!publisherArgs?.length) {
    throw new Error("A real staging publisher command is required.");
  }

  const originalEvidence = await read(evidencePath, "utf8");
  const evidence = JSON.parse(originalEvidence);
  const currentSource = await getSourceState();
  assertReleaseEvidenceCurrent(evidence, currentSource);

  const publication = await runPublisher(publisherArgs, { cwd, env, stdio: "inherit" });
  if (publication.code !== 0) {
    throw new Error(`Guarded staging publication failed (${publication.code ?? publication.signal}).`);
  }
  let observedRevision;
  try {
    const observation = await verifyRevision(env.RELEASE_BASE_URL, evidence.gitRevision);
    observedRevision = safeObservedRevision(observation?.observedRevision
      ?? observation?.releaseRevision
      ?? evidence.gitRevision);
  } catch (error) {
    observedRevision = safeObservedRevision(error?.observedRevision);
    await recordHistory({
      gitRevision: evidence.gitRevision,
      event: "staging-health",
      status: "mismatched",
      recordedAt: now().toISOString(),
      historyRoot: path.join(path.dirname(evidencePath), "history"),
      details: {
        approvedRevision: evidence.gitRevision,
        observedRevision,
        revisionsMatch: false,
      },
    });
    throw error;
  }
  const revisionsMatch = observedRevision === evidence.gitRevision;
  await recordHistory({
    gitRevision: evidence.gitRevision,
    event: "staging-health",
    status: revisionsMatch ? "matched" : "mismatched",
    recordedAt: now().toISOString(),
    historyRoot: path.join(path.dirname(evidencePath), "history"),
    details: {
      approvedRevision: evidence.gitRevision,
      observedRevision,
      revisionsMatch,
    },
  });
  if (!revisionsMatch) {
    throw new Error("Staging health revision did not match the approved release revision.");
  }

  const staleRevision = evidence.gitRevision === MISMATCHED_REVISION
    ? "1111111111111111111111111111111111111111"
    : MISMATCHED_REVISION;
  try {
    await write(evidencePath, `${JSON.stringify({ ...evidence, gitRevision: staleRevision }, null, 2)}\n`, { mode: 0o600 });
    const blocked = await runPublisher(publisherArgs, { cwd, env, stdio: "pipe" });
    if (blocked.code === 0) {
      throw new Error("The guarded entry point invoked the staging publisher with mismatched evidence.");
    }
  } finally {
    await write(evidencePath, originalEvidence, { mode: 0o600 });
  }

  return { gitRevision: evidence.gitRevision, environment: "staging" };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const result = await verifyGuardedStagingPublication({ publisherArgs: process.argv.slice(2) });
    console.log(
      `[release] VERIFIED guarded staging publication for ${result.gitRevision}; `
      + "mismatched evidence was blocked.",
    );
  } catch (error) {
    console.error(`[release] STAGING VERIFICATION FAILED: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  }
}