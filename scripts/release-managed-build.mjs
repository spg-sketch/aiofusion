#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendReleaseHistory, assertReleaseEnvironment, readCurrentReleaseEvidence } from "./release-lib.mjs";

export async function runManagedStagingBuild({
  command,
  args = [],
  env = process.env,
  cwd = process.cwd(),
  validateEvidence = readCurrentReleaseEvidence,
  spawnProcess = spawn,
  stdio = "inherit",
  now = () => new Date(),
  recordHistory = appendReleaseHistory,
} = {}) {
  assertReleaseEnvironment(env);
  if (!command) {
    throw new Error("Usage: node scripts/release-managed-build.mjs <build-command> [arguments...]");
  }

  let evidence;
  try {
    ({ evidence } = await validateEvidence());
    const result = await new Promise((resolve, reject) => {
      const child = spawnProcess(command, args, {
        cwd,
        env: {
          ...env,
          RELEASE_GIT_REVISION: evidence.gitRevision,
        },
        stdio,
      });
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    if (result.code !== 0) {
      throw new Error(`Managed staging build exited ${result.code ?? `by ${result.signal}`}.`);
    }
    await recordHistory({
      gitRevision: evidence.gitRevision,
      event: "managed-build",
      status: "succeeded",
      recordedAt: now().toISOString(),
      historyRoot: path.join(cwd, "release-evidence", "history"),
    });
    return { gitRevision: evidence.gitRevision, environment: "staging" };
  } catch (error) {
    evidence ??= error?.releaseEvidence;
    if (evidence?.gitRevision) {
      await recordHistory({
        gitRevision: evidence.gitRevision,
        event: "managed-build",
        status: "rejected",
        recordedAt: now().toISOString(),
        historyRoot: path.join(cwd, "release-evidence", "history"),
        details: { reason: "managed build failed or rejected the release" },
      });
    }
    throw error;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  try {
    const result = await runManagedStagingBuild({ command, args });
    console.log(`[release] Managed staging build approved for ${result.gitRevision}.`);
  } catch (error) {
    console.error(`[release] MANAGED BUILD BLOCKED: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  }
}