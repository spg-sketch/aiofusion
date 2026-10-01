import test from "node:test";
import assert from "node:assert/strict";
import { link, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir, hostname } from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { RELEASE_STAGES, readCurrentReleaseEvidence } from "./release-lib.mjs";
import { runManagedStagingBuild } from "./release-managed-build.mjs";
import { runReleaseReadiness, releaseReadinessCli } from "./release-readiness.mjs";
import { acquireReleaseReadinessLock } from "./release-readiness-lock.mjs";

const execFileAsync = promisify(execFile);
const source = {
  gitRevision: "0123456789abcdef0123456789abcdef01234567",
  gitTree: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  sourceState: "clean",
};
const environment = { RELEASE_ENVIRONMENT: "staging" };
function fullEvidence() {
  return {
    status: "passed", environment: "staging", ...source,
    startedAt: "2026-10-01T12:00:00.000Z", finishedAt: "2026-10-01T12:01:00.000Z",
    stages: RELEASE_STAGES.map(([name]) => ({ name, status: "passed", durationMs: 1 })),
  };
}
async function fixture(t, evidence = fullEvidence()) {
  const directory = await mkdtemp(path.join(tmpdir(), "release-readiness-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const evidencePath = path.join(directory, "latest.json");
  if (evidence !== null) await writeFile(evidencePath, JSON.stringify(evidence));
  return { directory, evidencePath };
}
function options(evidencePath, overrides = {}) {
  return {
    evidencePath, env: environment, getSourceState: async () => source,
    log() {}, ...overrides,
  };
}

test("reuses complete current approval without running any expensive stages", async (t) => {
  const { evidencePath } = await fixture(t);
  let executions = 0;
  const result = await runReleaseReadiness(options(evidencePath, {
    runGate: async () => { executions++; throw new Error("must not run"); },
  }));
  assert.equal(result.reused, true);
  assert.equal(executions, 0);
});

test("reuses clean source-identical bookkeeping commits", async (t) => {
  const { evidencePath } = await fixture(t);
  const result = await runReleaseReadiness(options(evidencePath, {
    getSourceState: async () => ({ ...source, gitRevision: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }),
    runGate: async () => { throw new Error("must not run"); },
  }));
  assert.equal(result.reused, true);
});

const misses = [
  ["missing", () => null],
  ["failed", () => ({ ...fullEvidence(), status: "failed" })],
  ["incomplete", () => ({ ...fullEvidence(), stages: fullEvidence().stages.slice(0, -1) })],
  ["wrong environment", () => ({ ...fullEvidence(), environment: "production" })],
  ["stale source", () => ({ ...fullEvidence(), gitRevision: "cccccccccccccccccccccccccccccccccccccccc", gitTree: "dddddddddddddddddddddddddddddddddddddddd" })],
  ["dirty recorded source", () => ({ ...fullEvidence(), sourceState: "dirty" })],
  ["skipped stage", () => ({ ...fullEvidence(), stages: fullEvidence().stages.map((stage, i) => i === 2 ? { ...stage, status: "skipped" } : stage) })],
  ["timed-out stage", () => ({ ...fullEvidence(), stages: fullEvidence().stages.map((stage, i) => i === 2 ? { ...stage, timedOut: true } : stage) })],
  ["invalid chronology", () => ({ ...fullEvidence(), finishedAt: "2026-09-01T00:00:00.000Z" })],
];
for (const [name, makeEvidence] of misses) {
  test(`${name} approval runs the complete gate exactly once instead of reusing`, async (t) => {
    const { evidencePath } = await fixture(t, makeEvidence());
    const calls = [];
    const result = await runReleaseReadiness(options(evidencePath, {
      runGate: async (input) => {
        calls.push(input);
        const evidence = fullEvidence();
        await writeFile(evidencePath, JSON.stringify(evidence));
        return evidence;
      },
    }));
    assert.equal(result.reused, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].env, environment);
    assert.equal(calls[0].evidencePath, evidencePath);
    assert.equal(Object.hasOwn(calls[0], "stages"), false, "readiness must not narrow mandatory gate stages");
  });
}

test("malformed JSON cannot be reused", async (t) => {
  const { evidencePath } = await fixture(t);
  await writeFile(evidencePath, "{broken");
  let executions = 0;
  await runReleaseReadiness(options(evidencePath, {
    runGate: async () => {
      executions++;
      await writeFile(evidencePath, JSON.stringify(fullEvidence()));
      return fullEvidence();
    },
  }));
  assert.equal(executions, 1);
});

test("dirty current source fails promptly without rewriting previous evidence", async (t) => {
  const { evidencePath } = await fixture(t);
  const before = await readFile(evidencePath, "utf8");
  await assert.rejects(runReleaseReadiness(options(evidencePath, {
    getSourceState: async () => ({ ...source, sourceState: "dirty" }),
    runGate: async () => { throw new Error("must not run"); },
  })), /commit the verified changes first/);
  assert.equal(await readFile(evidencePath, "utf8"), before);
});

test("invalid target environment fails before gate execution or lock acquisition", async () => {
  for (const env of [{}, { RELEASE_ENVIRONMENT: "production" }, { ...environment, RELEASE_BASE_URL: "https://aiofusion.ai" }]) {
    await assert.rejects(runReleaseReadiness({
      env, acquireLock: async () => { throw new Error("must not acquire"); },
      runGate: async () => { throw new Error("must not run"); },
    }), /required|must target staging|non-staging/);
  }
});

test("force always executes the full gate even when current approval exists", async (t) => {
  const { evidencePath } = await fixture(t);
  let executions = 0;
  const result = await runReleaseReadiness(options(evidencePath, {
    force: true,
    runGate: async (input) => {
      executions++;
      assert.equal(Object.hasOwn(input, "stages"), false);
      await writeFile(evidencePath, JSON.stringify(fullEvidence()));
      return fullEvidence();
    },
  }));
  assert.equal(result.reused, false);
  assert.equal(executions, 1);
});

test("a failed fresh run replaces approval and cannot be hidden by its prior success", async (t) => {
  const { evidencePath } = await fixture(t);
  await assert.rejects(runReleaseReadiness(options(evidencePath, {
    force: true,
    runGate: async () => {
      const failed = { ...fullEvidence(), status: "failed", failedStage: "critical browser journeys" };
      await writeFile(evidencePath, JSON.stringify(failed));
      return failed;
    },
  })), /Checks failed: critical browser journeys/);
  await assert.rejects(readCurrentReleaseEvidence({ evidencePath, getSourceState: async () => source }), /passed gate/);
});

test("source changes before acquiring approval fail closed", async (t) => {
  const { evidencePath } = await fixture(t);
  let reads = 0;
  await assert.rejects(runReleaseReadiness(options(evidencePath, {
    getSourceState: async () => ++reads === 1 ? source : { ...source, gitTree: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
    runGate: async () => { throw new Error("must not run"); },
  })), /different Git revision/);
});

test("source becoming dirty after the gate still blocks readiness", async (t) => {
  const { evidencePath } = await fixture(t, null);
  let dirty = false;
  await assert.rejects(runReleaseReadiness(options(evidencePath, {
    getSourceState: async () => ({ ...source, sourceState: dirty ? "dirty" : "clean" }),
    runGate: async () => {
      await writeFile(evidencePath, JSON.stringify(fullEvidence()));
      dirty = true;
      return fullEvidence();
    },
  })), /current source state is dirty/);
});

test("fresh gate claiming success without complete persisted approval fails closed", async (t) => {
  const { evidencePath } = await fixture(t, null);
  await assert.rejects(runReleaseReadiness(options(evidencePath, {
    runGate: async () => {
      await writeFile(evidencePath, JSON.stringify({ ...fullEvidence(), stages: [] }));
      return { status: "passed" };
    },
  })), /complete|required|stage/i);
});

for (const fail of [false, true]) {
  test(`independent readiness processes share one ${fail ? "failed" : "successful"} run`, async (t) => {
    const { directory, evidencePath } = await fixture(t, null);
    const marker = path.join(directory, "executions");
    const readyModule = new URL("./release-readiness.mjs", import.meta.url).href;
    const script = `
      import { appendFile, writeFile } from 'node:fs/promises';
      import { runReleaseReadiness } from ${JSON.stringify(readyModule)};
      try {
        const result = await runReleaseReadiness({
          env: ${JSON.stringify(environment)}, evidencePath: ${JSON.stringify(evidencePath)},
          getSourceState: async () => (${JSON.stringify(source)}), log() {},
          runGate: async () => {
            await appendFile(${JSON.stringify(marker)}, 'gate\\n');
            await new Promise(resolve => setTimeout(resolve, 350));
            const evidence = ${JSON.stringify(fullEvidence())};
            ${fail ? "evidence.status = 'failed'; evidence.failedStage = 'api regression suite';" : ""}
            await writeFile(${JSON.stringify(evidencePath)}, JSON.stringify(evidence));
            return evidence;
          }
        });
        console.log(JSON.stringify({reused: result.reused}));
      } catch(error) { console.error(error.message); process.exitCode = 1; }
    `;
    const first = execFileAsync(process.execPath, ["--input-type=module", "-e", script], { timeout: 5000 });
    // Attach a handler immediately: the failing owner must not produce an
    // unhandled rejection while the waiter process is being started.
    first.catch(() => {});
    for (let i = 0; ; i++) {
      try { await readFile(marker); break; } catch (error) {
        if (error.code !== "ENOENT" || i > 200) throw error;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }
    const second = execFileAsync(process.execPath, ["--input-type=module", "-e", script], { timeout: 5000 });
    const results = await Promise.allSettled([first, second]);
    assert.equal((await readFile(marker, "utf8")).trim(), "gate");
    if (fail) {
      assert.ok(results.every((result) => result.status === "rejected"));
      assert.match(results[1].reason.stderr, /shared run did not produce valid approval/);
    } else {
      assert.ok(results.every((result) => result.status === "fulfilled"));
      assert.deepEqual(results.map((result) => JSON.parse(result.value.stdout).reused), [false, true]);
    }
    await assert.rejects(readFile(path.join(directory, "readiness.lock")), { code: "ENOENT" });
  });
}

test("lock waiting is bounded and never deletes a live owner's lock", async (t) => {
  const { directory } = await fixture(t);
  const lockPath = path.join(directory, "readiness.lock");
  const lock = await acquireReleaseReadinessLock({ lockPath, source, environment: "staging" });
  try {
    await assert.rejects(acquireReleaseReadinessLock({
      lockPath, source, environment: "staging", timeoutMs: 10, intervalMs: 1,
    }), /Timed out waiting/);
    assert.ok(await readFile(lockPath));
  } finally {
    await lock.release();
  }
});

test("interrupted and unknown lock owners fail closed with actionable output", async (t) => {
  const { directory } = await fixture(t);
  const lockPath = path.join(directory, "readiness.lock");
  await writeFile(lockPath, JSON.stringify({ token: "interrupted", pid: 2147483647, host: hostname() }));
  await assert.rejects(acquireReleaseReadinessLock({ lockPath, source, environment: "staging" }), /interrupted.*workers have stopped/);
  await writeFile(lockPath, "{}");
  await assert.rejects(acquireReleaseReadinessLock({ lockPath, source, environment: "staging" }), /unknown owner/);
});

test("a failed owner releasing before its record can be read cannot trigger a duplicate gate", async (t) => {
  const { evidencePath } = await fixture(t);
  let collided = false;
  let executions = 0;
  await assert.rejects(runReleaseReadiness(options(evidencePath, {
    acquireLock: (input) => acquireReleaseReadinessLock({
      ...input,
      linkFile: async (...args) => {
        if (!collided) {
          collided = true;
          // Model the precise EEXIST -> ENOENT handoff: the owner has
          // durably published failure, then removed its ephemeral lock.
          await writeFile(evidencePath, JSON.stringify({
            ...fullEvidence(), status: "failed", failedStage: "api regression suite",
          }));
          throw Object.assign(new Error("owner released"), { code: "EEXIST" });
        }
        return link(...args);
      },
    }),
    runGate: async () => { executions++; throw new Error("must not run"); },
  })), /shared run did not produce valid approval/);
  assert.equal(executions, 0);
});

test("a normal owner exiting between record read and liveness check is a harmless handoff", async (t) => {
  const { directory } = await fixture(t);
  const lockPath = path.join(directory, "readiness.lock");
  await writeFile(lockPath, JSON.stringify({ token: "finished", pid: process.pid, host: hostname() }));
  const acquired = await acquireReleaseReadinessLock({
    lockPath, source, environment: "staging",
    isOwnerAlive: async () => { await unlink(lockPath); return false; },
  });
  assert.equal(acquired.contended, true);
  await acquired.release();
});

test("killing a fresh check before completion cannot leave its old success publishable", async (t) => {
  const { directory, evidencePath } = await fixture(t);
  const marker = path.join(directory, "started");
  const readyModule = new URL("./release-readiness.mjs", import.meta.url).href;
  const libModule = new URL("./release-lib.mjs", import.meta.url).href;
  const script = `
    import { writeFile } from 'node:fs/promises';
    import { runReleaseReadiness } from ${JSON.stringify(readyModule)};
    import { runReleaseGate } from ${JSON.stringify(libModule)};
    await runReleaseReadiness({
      force: true, env: ${JSON.stringify(environment)}, evidencePath: ${JSON.stringify(evidencePath)},
      getSourceState: async () => (${JSON.stringify(source)}), log() {},
      runGate: input => runReleaseGate({
        ...input,
        run: async () => {
          await writeFile(${JSON.stringify(marker)}, 'started');
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      })
    });
  `;
  const child = spawn(process.execPath, ["--input-type=module", "-e", script], { stdio: "ignore" });
  const exited = new Promise((resolve, reject) => {
    child.once("exit", resolve);
    child.once("error", reject);
  });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); await exited; });
  for (let i = 0; ; i++) {
    try { await readFile(marker); break; } catch (error) {
      if (error.code !== "ENOENT" || i > 200) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  assert.equal(JSON.parse(await readFile(evidencePath, "utf8")).status, "running");
  child.kill("SIGKILL");
  await exited;
  await assert.rejects(readCurrentReleaseEvidence({
    evidencePath, getSourceState: async () => source,
  }), /passed gate/);
  let builds = 0;
  await assert.rejects(runManagedStagingBuild({
    command: "unused-build",
    cwd: directory,
    env: environment,
    validateEvidence: () => readCurrentReleaseEvidence({ evidencePath, getSourceState: async () => source }),
    spawnProcess: () => { builds++; throw new Error("must not build"); },
    recordHistory: async () => {},
  }), /passed gate/);
  assert.equal(builds, 0);
});

test("the Run action and completion configuration cannot silently launch extra full suites", async () => {
  // Extract only workflow metadata, never credential-bearing .replit sections.
  const { stdout } = await execFileAsync("awk", [
    '/^\\[workflows\\]/{p=1} p && /^\\[/ && !/^\\[\\[?workflows([.\\]]|$)/{p=0} p{print}',
    new URL("../.replit", import.meta.url).pathname,
  ]);
  assert.match(stdout, /runButton\s*=\s*"release-candidate"/);
  const project = stdout.split('name = "Project"')[1]?.split("[[workflows.workflow]]")[0];
  assert.ok(project);
  assert.deepEqual([...project.matchAll(/args\s*=\s*"([^"]+)"/g)].map((match) => match[1]), ["release-candidate"]);
  assert.equal([...stdout.matchAll(/isValidation\s*=\s*true/g)].length, 1);
  for (const name of ["test", "typecheck", "release-full"]) {
    const workflow = stdout.split(`name = "${name}"`)[1]?.split("[[workflows.workflow]]")[0];
    assert.ok(workflow, `${name} must remain manually available`);
    assert.doesNotMatch(workflow, /isValidation\s*=\s*true/);
  }
  assert.match(stdout, /args\s*=\s*"RELEASE_ENVIRONMENT=staging pnpm run release:ready"/);
  assert.match(stdout, /args\s*=\s*"RELEASE_ENVIRONMENT=staging pnpm run release:check"/);
});

test("unknown CLI arguments cannot accidentally trigger a full check", async () => {
  assert.equal(await releaseReadinessCli(["--unexpected"]), 1);
  assert.equal(await releaseReadinessCli(["--force", "--force"]), 1);
});