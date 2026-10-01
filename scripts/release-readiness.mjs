#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertReleaseEnvironment,
  assertReleaseEvidenceCurrent,
  getGitSourceState,
  readCurrentReleaseEvidence,
  runReleaseGate,
} from "./release-lib.mjs";
import { acquireReleaseReadinessLock } from "./release-readiness-lock.mjs";

/**
 * Full execution stays in runReleaseGate. This entry point only avoids
 * executing it again when the shared approval policy proves it already passed.
 */
export async function runReleaseReadiness({
  force = false,
  env = process.env,
  evidencePath = path.join("release-evidence", "latest.json"),
  getSourceState = getGitSourceState,
  validateEvidence = readCurrentReleaseEvidence,
  runGate = runReleaseGate,
  acquireLock = acquireReleaseReadinessLock,
  log = console.log,
} = {}) {
  const environment = assertReleaseEnvironment(env);
  const initialSource = await getSourceState();
  if (initialSource.sourceState !== "clean") {
    throw new Error("New checks required: commit the verified changes first. Release readiness requires clean source; focused developer checks are not publishing approval.");
  }

  let waitingReported = false;
  const lock = await acquireLock({
    lockPath: path.join(path.dirname(evidencePath), "readiness.lock"),
    source: initialSource,
    environment,
    onWaiting() {
      if (!waitingReported) {
        log("[release-ready] Checks running; waiting for the shared result.");
        waitingReported = true;
      }
    },
  });
  try {
    const lockedSource = await getSourceState();
    assertReleaseEvidenceCurrent({ status: "passed", ...initialSource }, lockedSource);
    let approval;
    let rejection;
    if (!force) {
      try {
        approval = await validateEvidence({ evidencePath, getSourceState });
      } catch (error) {
        rejection = error;
      }
      if (approval) {
        log("[release-ready] Current version approved. Reusing its complete passing release check; no suites rerun.");
        return { status: "passed", environment, reused: true, ...approval };
      }
      // A caller that waited for this same candidate must see the shared
      // failure, not immediately launch the identical expensive run again.
      const failedEvidence = rejection?.releaseEvidence;
      const matchingDurableOutcome = lock.contended
        && (!failedEvidence?.gitTree || failedEvidence.gitTree === initialSource.gitTree)
        && (!failedEvidence?.environment || failedEvidence.environment === environment);
      if (matchingDurableOutcome || lock.observedOwners.some((owner) => owner.gitTree === initialSource.gitTree && owner.environment === environment)) {
        throw new Error("Checks failed: the shared run did not produce valid approval for this version. Inspect its failed stage before retrying.", { cause: rejection });
      }
      log(`[release-ready] New checks required: ${rejection?.message ?? "no complete approval"}`);
    } else {
      log("[release-ready] Fresh checks requested. Running every release stage.");
    }

    const result = await runGate({ env, evidencePath, getSourceState });
    if (result.status !== "passed") {
      throw new Error(`Checks failed: ${result.failedStage ?? "release validation failed"}. Publishing remains blocked.`);
    }
    // Read persisted evidence through the same policy as managed publishing.
    // This also rejects source changes immediately after the gate finished.
    approval = await validateEvidence({ evidencePath, getSourceState });
    log("[release-ready] Current version approved. The complete release check passed.");
    return { status: "passed", environment, reused: false, ...approval };
  } finally {
    await lock.release();
  }
}

export async function releaseReadinessCli(args = process.argv.slice(2)) {
  if (args.some((arg) => arg !== "--force") || args.length > 1) {
    console.error("[release-ready] Usage: pnpm run release:ready [--force]");
    return 1;
  }
  try {
    await runReleaseReadiness({ force: args.includes("--force") });
    return 0;
  } catch (error) {
    console.error(`[release-ready] NOT APPROVED: ${error instanceof Error ? error.message : "checks failed"}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await releaseReadinessCli();
}