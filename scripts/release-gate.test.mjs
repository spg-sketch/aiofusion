import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { assertReleaseEnvironment, RELEASE_STAGES, runReleaseGate } from "./release-lib.mjs";

test("keeps every release-blocking stage in the required order", () => {
  assert.deepEqual(RELEASE_STAGES.map(([name]) => name), [
    "typecheck",
    "api regression suite",
    "web regression suite",
    "operational script suite",
    "API production build",
    "web production build",
    "production API startup smoke",
    "critical browser journeys",
  ]);
  assert.match(RELEASE_STAGES.at(-1)[1], /playwright/);
  assert.ok(RELEASE_STAGES.every(([, , timeoutMs]) => timeoutMs > 0));
});

test("runs stages in order and records non-sensitive evidence", async () => {
  const calls = [];
  const dir = await mkdtemp(path.join(tmpdir(), "release-gate-"));
  const result = await runReleaseGate({
    stages: [["one", "first"], ["two", "second"]],
    run: async (command) => calls.push(command),
    env: { RELEASE_ENVIRONMENT: "staging", SECRET_TOKEN: "must-not-appear" },
    evidencePath: path.join(dir, "evidence.json"),
  });
  assert.equal(result.status, "passed");
  assert.deepEqual(calls, ["first", "second"]);
  const evidence = await readFile(path.join(dir, "evidence.json"), "utf8");
  assert.match(evidence, /"environment": "staging"/);
  assert.doesNotMatch(evidence, /must-not-appear|SECRET_TOKEN/);
});

test("stops at the first failed stage and reports it", async () => {
  const calls = [];
  const result = await runReleaseGate({
    stages: [["one", "first"], ["two", "second"], ["three", "third"]],
    run: async (command) => {
      calls.push(command);
      if (command === "second") throw new Error("boom");
    },
    env: { RELEASE_ENVIRONMENT: "staging" },
    evidencePath: path.join(await mkdtemp(path.join(tmpdir(), "release-gate-")), "evidence.json"),
  });
  assert.equal(result.status, "failed");
  assert.equal(result.failedStage, "two");
  assert.deepEqual(calls, ["first", "second"]);
});

test("times out a hanging stage and persists its name in evidence", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "release-gate-"));
  const result = await runReleaseGate({
    stages: [["hanging stage", "hang", 10]],
    run: () => new Promise(() => {}),
    env: { RELEASE_ENVIRONMENT: "staging" },
    evidencePath: path.join(dir, "evidence.json"),
  });
  assert.equal(result.status, "failed");
  assert.equal(result.failedStage, "hanging stage");
  assert.equal(result.stages[0].timedOut, true);
  const evidence = JSON.parse(await readFile(path.join(dir, "evidence.json"), "utf8"));
  assert.equal(evidence.failedStage, "hanging stage");
  assert.equal(evidence.stages[0].timedOut, true);
});

test("fails closed for missing, invalid, or live production prerequisites", () => {
  assert.throws(() => assertReleaseEnvironment({}), /RELEASE_ENVIRONMENT is required/);
  assert.throws(() => assertReleaseEnvironment({ RELEASE_ENVIRONMENT: "production" }), /must target staging/);
  assert.throws(() => assertReleaseEnvironment({
    RELEASE_ENVIRONMENT: "staging",
    RELEASE_BASE_URL: "https://aiofusion.ai",
  }), /non-staging/);
  assert.throws(() => assertReleaseEnvironment({
    RELEASE_ENVIRONMENT: "staging",
    RELEASE_BASE_URL: "https://aiofusion.ai/path?redirect=staging.example",
  }), /non-staging/);
  assert.throws(() => assertReleaseEnvironment({
    RELEASE_ENVIRONMENT: "staging",
    RELEASE_BASE_URL: "https://notstaging.example",
  }), /non-staging/);
  assert.equal(assertReleaseEnvironment({
    RELEASE_ENVIRONMENT: "staging",
    RELEASE_BASE_URL: "https://staging.aiofusion.ai",
  }), "staging");
  assert.equal(assertReleaseEnvironment({
    RELEASE_ENVIRONMENT: "staging",
    RELEASE_BASE_URL: "http://127.0.0.1:5000",
  }), "staging");
});

test("persists the canonical environment-safeguard failure", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "release-gate-"));
  const evidencePath = path.join(dir, "evidence.json");
  const result = await runReleaseGate({
    stages: [],
    env: { RELEASE_ENVIRONMENT: "production" },
    evidencePath,
  });
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  assert.equal(result.status, "failed");
  assert.equal(result.failedStage, "environment safeguards");
  assert.deepEqual(evidence, result);
});