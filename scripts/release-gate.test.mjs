import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  appendReleaseHistory,
  assertReleaseEnvironment,
  assertReleaseEvidenceCurrent,
  getGitSourceState,
  readCurrentReleaseEvidence,
  RELEASE_STAGES,
  runReleaseGate,
  runStagingPublication,
} from "./release-lib.mjs";
import {
  assertGuardedStagingAutomation,
  validateReleaseAutomation,
} from "./release-automation-guard.mjs";
import { verifyGuardedStagingPublication } from "./release-staging-verification.mjs";
import { runManagedStagingBuild } from "./release-managed-build.mjs";

const MATCHING_SOURCE = {
  gitRevision: "0123456789abcdef0123456789abcdef01234567",
  gitTree: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  sourceState: "clean",
};

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceState = async () => MATCHING_SOURCE;
const execFileAsync = promisify(execFile);

test("keeps every release-blocking stage in the required order", () => {
  assert.deepEqual(RELEASE_STAGES.map(([name]) => name), [
    "release automation guard",
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

test("rejects repository automation that invokes a publisher directly", () => {
  assert.throws(
    () => assertGuardedStagingAutomation(
      ".github/workflows/publish-staging.yml",
      "run: replit deploy --environment staging",
    ),
    /bypasses the release-evidence guard/,
  );
});

test("rejects a package script that aliases a publisher outside the guard", () => {
  assert.throws(
    () => assertGuardedStagingAutomation(
      "package.json",
      '{"scripts":{"publish:staging":"replit deploy --environment staging"}}',
    ),
    /bypasses the release-evidence guard/,
  );
});

test("rejects a direct publisher chained with guarded command text", () => {
  assert.throws(
    () => assertGuardedStagingAutomation(
      ".github/workflows/publish-staging.yml",
      "run: replit deploy --environment staging && pnpm run release:publish -- replit deploy --environment staging",
    ),
    /bypasses the release-evidence guard/,
  );
});

test("rejects a direct publisher when guarded command text appears only in a comment", () => {
  assert.throws(
    () => assertGuardedStagingAutomation(
      ".github/workflows/publish-staging.yml",
      "run: replit deploy --environment staging # pnpm run release:publish -- replit deploy",
    ),
    /bypasses the release-evidence guard/,
  );
});

test("rejects an unguarded script in minified package JSON containing another guarded script", () => {
  assert.throws(
    () => assertGuardedStagingAutomation(
      "package.json",
      '{"scripts":{"safe":"pnpm run release:publish -- replit deploy","unsafe":"replit deploy"}}',
    ),
    /scripts\.unsafe/,
  );
});

for (const operator of ["||", "&&"]) {
  test(`rejects a package script that uses ${operator} to publish outside the guard`, () => {
    assert.throws(
      () => assertGuardedStagingAutomation(
        "package.json",
        JSON.stringify({
          scripts: {
            "publish:staging": `pnpm run release:publish -- true ${operator} replit deploy --environment staging`,
          },
        }),
      ),
      /scripts\.publish:staging/,
    );
  });
}

test("accepts repository automation that invokes a publisher through the guard", () => {
  assert.doesNotThrow(() => assertGuardedStagingAutomation(
    ".github/workflows/publish-staging.yml",
    "run: RELEASE_ENVIRONMENT=staging pnpm run release:publish -- replit deploy --environment staging",
  ));
});

test("rejects a publisher hidden in a shell helper", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "release-automation-"));
  await mkdir(path.join(cwd, "scripts", "release"), { recursive: true });
  await writeFile(
    path.join(cwd, "scripts", "release", "publish-staging.sh"),
    "#!/bin/sh\nreplit deploy --environment staging\n",
  );

  await assert.rejects(
    validateReleaseAutomation({ cwd, configs: ["scripts"] }),
    /scripts[\\/]release[\\/]publish-staging\.sh:2/,
  );
});

test("rejects a publisher hidden in a JavaScript helper", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "release-automation-"));
  await mkdir(path.join(cwd, "scripts"), { recursive: true });
  await writeFile(
    path.join(cwd, "scripts", "publish-staging.mjs"),
    'await run("replit publish --environment staging");\n',
  );

  await assert.rejects(
    validateReleaseAutomation({ cwd, configs: ["scripts"] }),
    /scripts[\\/]publish-staging\.mjs:1/,
  );
});

test("accepts guarded helper publishers and unrelated deployment utilities", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "release-automation-"));
  await mkdir(path.join(cwd, "scripts"), { recursive: true });
  await writeFile(
    path.join(cwd, "scripts", "publish-staging.sh"),
    "#!/bin/sh\npnpm run release:publish -- replit deploy --environment staging\n",
  );
  await writeFile(
    path.join(cwd, "scripts", "inspect-deployments.mjs"),
    'await inspectDeployment({ environment: "staging" });\n',
  );

  await validateReleaseAutomation({ cwd, configs: ["scripts"] });
});

test("current repository publication automation passes the guard", async () => {
  await validateReleaseAutomation({ cwd: REPOSITORY_ROOT });
});

test("every managed artifact production build uses the release-evidence guard", async () => {
  for (const artifactToml of [
    "artifacts/api-server/.replit-artifact/artifact.toml",
    "artifacts/aio-fusion/.replit-artifact/artifact.toml",
  ]) {
    const source = await readFile(path.join(REPOSITORY_ROOT, artifactToml), "utf8");
    assert.match(
      source,
      /scripts\/release-managed-build\.mjs/,
      `${artifactToml} must fail closed through the managed build guard`,
    );
    assert.match(
      source,
      /RELEASE_ENVIRONMENT\s*=\s*"staging"/,
      `${artifactToml} must explicitly target staging`,
    );
  }
});

test("fails closed when HEAD changes while Git source state is captured", async () => {
  const outputs = [
    `${MATCHING_SOURCE.gitRevision}\n${MATCHING_SOURCE.gitTree}\n`,
    "",
    `fedcba9876543210fedcba9876543210fedcba98\n${MATCHING_SOURCE.gitTree}\n`,
  ];
  await assert.rejects(
    getGitSourceState({
      exec: async () => ({ stdout: outputs.shift() }),
    }),
    /revision or tree changed while release source state was being captured/,
  );
});

test("runs stages in order and records non-sensitive evidence", async () => {
  const calls = [];
  const dir = await mkdtemp(path.join(tmpdir(), "release-gate-"));
  const result = await runReleaseGate({
    stages: [["one", "first"], ["two", "second"]],
    run: async (command) => calls.push(command),
    env: { RELEASE_ENVIRONMENT: "staging", SECRET_TOKEN: "must-not-appear" },
    evidencePath: path.join(dir, "evidence.json"),
    getSourceState: sourceState,
  });
  assert.equal(result.status, "passed");
  assert.deepEqual(calls, ["first", "second"]);
  const evidence = await readFile(path.join(dir, "evidence.json"), "utf8");
  assert.match(evidence, /"environment": "staging"/);
  assert.match(evidence, new RegExp(`"gitRevision": "${MATCHING_SOURCE.gitRevision}"`));
  assert.match(evidence, /"sourceState": "clean"/);
  assert.doesNotMatch(evidence, /must-not-appear|SECRET_TOKEN/);
  const historyDirectory = path.join(dir, "history", MATCHING_SOURCE.gitRevision);
  const [historyName] = await import("node:fs/promises").then(({ readdir }) => readdir(historyDirectory));
  const history = JSON.parse(await readFile(path.join(historyDirectory, historyName), "utf8"));
  assert.equal(history.event, "release-candidate");
  assert.equal(history.status, "passed");
  assert.doesNotMatch(JSON.stringify(history), /must-not-appear|SECRET_TOKEN/);
});

test("release history uses immutable files for the same revision and UTC time", async () => {
  const historyRoot = path.join(await mkdtemp(path.join(tmpdir(), "release-history-")), "history");
  const entry = {
    gitRevision: MATCHING_SOURCE.gitRevision,
    event: "publication",
    status: "succeeded",
    recordedAt: "2026-09-23T12:00:00.000Z",
    historyRoot,
  };
  const firstPath = await appendReleaseHistory(entry);
  const secondPath = await appendReleaseHistory(entry);
  assert.notEqual(firstPath, secondPath);
  assert.equal(JSON.parse(await readFile(firstPath, "utf8")).recordedAt, entry.recordedAt);
  assert.equal(JSON.parse(await readFile(secondPath, "utf8")).recordedAt, entry.recordedAt);
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
    getSourceState: sourceState,
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
    getSourceState: sourceState,
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
    getSourceState: sourceState,
  });
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  assert.equal(result.status, "failed");
  assert.equal(result.failedStage, "environment safeguards");
  assert.deepEqual(evidence, result);
});

test("accepts passed evidence for the matching clean revision", () => {
  assert.equal(assertReleaseEvidenceCurrent({
    status: "passed",
    ...MATCHING_SOURCE,
  }, MATCHING_SOURCE), true);
});

test("rejects stale evidence for a different revision", () => {
  assert.throws(() => assertReleaseEvidenceCurrent({
    status: "passed",
    ...MATCHING_SOURCE,
  }, {
    ...MATCHING_SOURCE,
    gitRevision: "fedcba9876543210fedcba9876543210fedcba98",
    gitTree: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  }), /different Git revision/);
});

test("accepts an empty publication commit only when the tracked source is identical and clean", () => {
  assert.equal(assertReleaseEvidenceCurrent({
    status: "passed",
    ...MATCHING_SOURCE,
  }, {
    ...MATCHING_SOURCE,
    gitRevision: "fedcba9876543210fedcba9876543210fedcba98",
  }), true);

  assert.throws(() => assertReleaseEvidenceCurrent({
    status: "passed",
    gitRevision: MATCHING_SOURCE.gitRevision,
    sourceState: "clean",
  }, {
    ...MATCHING_SOURCE,
    gitRevision: "fedcba9876543210fedcba9876543210fedcba98",
  }), /different Git revision/);
});

test("rejects evidence from dirty source and matching evidence with new uncommitted changes", () => {
  assert.throws(() => assertReleaseEvidenceCurrent({
    status: "passed",
    ...MATCHING_SOURCE,
    sourceState: "dirty",
  }, MATCHING_SOURCE), /source state was dirty/);

  assert.throws(() => assertReleaseEvidenceCurrent({
    status: "passed",
    ...MATCHING_SOURCE,
  }, {
    ...MATCHING_SOURCE,
    sourceState: "dirty",
  }), /current source state is dirty/);
});

test("publishes staging when latest evidence passed for the matching clean revision", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "release-publish-"));
  const evidencePath = path.join(dir, "latest.json");
  await writeFile(evidencePath, JSON.stringify({ status: "passed", ...MATCHING_SOURCE }));
  let publications = 0;
  let publicationMetadata;
  const history = [];

  const result = await runStagingPublication({
    env: { RELEASE_ENVIRONMENT: "staging" },
    evidencePath,
    getSourceState: async () => MATCHING_SOURCE,
    publish: async (metadata) => {
      publications += 1;
      publicationMetadata = metadata;
    },
    recordHistory: async (entry) => history.push(entry),
  });

  assert.equal(publications, 1);
  assert.equal(result.evidence.status, "passed");
  assert.deepEqual(publicationMetadata, {
    environment: "staging",
    gitRevision: MATCHING_SOURCE.gitRevision,
  });
  assert.equal(history.length, 1);
  assert.equal(history[0].status, "succeeded");
  assert.equal(history[0].gitRevision, MATCHING_SOURCE.gitRevision);
});

test("records a non-sensitive publication rejection for an approved revision", async () => {
  const history = [];
  await assert.rejects(runStagingPublication({
    env: { RELEASE_ENVIRONMENT: "staging" },
    readEvidence: async () => ({ status: "passed", ...MATCHING_SOURCE }),
    getSourceState: sourceState,
    publish: async () => {
      throw new Error("publisher exposed details that must not be copied");
    },
    recordHistory: async (entry) => history.push(entry),
  }), /publisher exposed details/);
  assert.equal(history.length, 1);
  assert.equal(history[0].status, "rejected");
  assert.doesNotMatch(JSON.stringify(history[0]), /exposed details/);
});

test("blocks staging publication for failed, stale, or dirty release evidence", async () => {
  const blockedCases = [
    {
      name: "failed evidence",
      evidence: { status: "failed", ...MATCHING_SOURCE },
      currentSource: MATCHING_SOURCE,
      message: /passed gate/,
    },
    {
      name: "another revision",
      evidence: { status: "passed", ...MATCHING_SOURCE },
      currentSource: {
        ...MATCHING_SOURCE,
        gitRevision: "fedcba9876543210fedcba9876543210fedcba98",
        gitTree: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
      message: /different Git revision/,
    },
    {
      name: "recorded dirty source",
      evidence: { status: "passed", ...MATCHING_SOURCE, sourceState: "dirty" },
      currentSource: MATCHING_SOURCE,
      message: /source state was dirty/,
    },
    {
      name: "current dirty source",
      evidence: { status: "passed", ...MATCHING_SOURCE },
      currentSource: { ...MATCHING_SOURCE, sourceState: "dirty" },
      message: /current source state is dirty/,
    },
  ];

  for (const blockedCase of blockedCases) {
    let publications = 0;
    await assert.rejects(runStagingPublication({
      env: { RELEASE_ENVIRONMENT: "staging" },
      readEvidence: async () => blockedCase.evidence,
      getSourceState: async () => blockedCase.currentSource,
      publish: async () => {
        publications += 1;
      },
    }), blockedCase.message, blockedCase.name);
    assert.equal(publications, 0, blockedCase.name);
  }
});

test("blocks staging publication when latest evidence cannot be read", async () => {
  let sourceReads = 0;
  let publications = 0;
  await assert.rejects(runStagingPublication({
    env: { RELEASE_ENVIRONMENT: "staging" },
    evidencePath: "release-evidence/latest.json",
    readEvidence: async () => {
      throw new Error("missing");
    },
    getSourceState: async () => {
      sourceReads += 1;
      return MATCHING_SOURCE;
    },
    publish: async () => {
      publications += 1;
    },
  }), /could not be read/);
  assert.equal(sourceReads, 0);
  assert.equal(publications, 0);
});

test("managed staging build passes only the approved revision to its build command", async () => {
  let spawned;
  const result = await runManagedStagingBuild({
    command: "pnpm",
    args: ["run", "build"],
    env: { RELEASE_ENVIRONMENT: "staging" },
    validateEvidence: async () => ({
      evidence: { status: "passed", ...MATCHING_SOURCE },
      currentSource: MATCHING_SOURCE,
    }),
    spawnProcess: (command, args, options) => {
      spawned = { command, args, options };
      return {
        once(event, callback) {
          if (event === "exit") queueMicrotask(() => callback(0, null));
          return this;
        },
      };
    },
  });

  assert.deepEqual(result, { environment: "staging", gitRevision: MATCHING_SOURCE.gitRevision });
  assert.equal(spawned.command, "pnpm");
  assert.deepEqual(spawned.args, ["run", "build"]);
  assert.equal(spawned.options.env.RELEASE_GIT_REVISION, MATCHING_SOURCE.gitRevision);
});

test("managed staging build never starts when release evidence is rejected", async () => {
  let spawned = false;
  const history = [];
  await assert.rejects(runManagedStagingBuild({
    command: "pnpm",
    env: { RELEASE_ENVIRONMENT: "staging" },
    validateEvidence: async () => {
      const error = new Error("Release evidence is stale because it covers a different Git revision.");
      error.releaseEvidence = { status: "passed", ...MATCHING_SOURCE };
      throw error;
    },
    spawnProcess: () => {
      spawned = true;
    },
    recordHistory: async (entry) => history.push(entry),
  }), /different Git revision/);
  assert.equal(spawned, false);
  assert.equal(history[0].status, "rejected");
  assert.equal(history[0].gitRevision, MATCHING_SOURCE.gitRevision);
});

test("reads current evidence through the shared release policy", async () => {
  const accepted = await readCurrentReleaseEvidence({
    readEvidence: async () => ({ status: "passed", ...MATCHING_SOURCE }),
    getSourceState: sourceState,
  });
  assert.equal(accepted.evidence.gitRevision, MATCHING_SOURCE.gitRevision);

  await assert.rejects(readCurrentReleaseEvidence({
    readEvidence: async () => ({ status: "failed", ...MATCHING_SOURCE }),
    getSourceState: sourceState,
  }), /passed gate/);
});

test("staging verification runs the real guarded entry point and invokes the publisher exactly once", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "release-staging-verification-"));
  const evidencePath = path.join(cwd, "release-evidence", "latest.json");
  const publisherPath = path.join(cwd, "publisher.mjs");
  const callsPath = path.join(cwd, "publisher-calls.txt");
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await writeFile(path.join(cwd, ".gitignore"), "release-evidence/\npublisher-calls.txt\n");
  await writeFile(publisherPath, [
    "#!/usr/bin/env node",
    'import { appendFile } from "node:fs/promises";',
    `await appendFile(${JSON.stringify(callsPath)}, \`\${process.env.RELEASE_GIT_REVISION}\\n\`);`,
    "",
  ].join("\n"));
  await chmod(publisherPath, 0o755);
  await execFileAsync("git", ["init"], { cwd });
  await execFileAsync("git", ["config", "user.email", "release-verification@example.invalid"], { cwd });
  await execFileAsync("git", ["config", "user.name", "Release Verification"], { cwd });
  await execFileAsync("git", ["add", ".gitignore", "publisher.mjs"], { cwd });
  await execFileAsync("git", ["commit", "-m", "verification fixture"], { cwd });
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd });
  const gitRevision = stdout.trim();
  const evidence = `${JSON.stringify({
    status: "passed",
    environment: "staging",
    gitRevision,
    sourceState: "clean",
  }, null, 2)}\n`;
  await writeFile(evidencePath, evidence);
  const verifiedRevisions = [];

  const result = await verifyGuardedStagingPublication({
    publisherArgs: [publisherPath],
    cwd,
    evidencePath,
    env: {
      ...process.env,
      RELEASE_ENVIRONMENT: "staging",
      RELEASE_BASE_URL: "https://staging.aiofusion.ai",
    },
    verifyRevision: async (baseUrl, revision) => {
      verifiedRevisions.push({ baseUrl, revision });
    },
  });

  assert.deepEqual(result, { environment: "staging", gitRevision });
  assert.deepEqual((await readFile(callsPath, "utf8")).trim().split("\n"), [gitRevision]);
  assert.deepEqual(verifiedRevisions, [{
    baseUrl: "https://staging.aiofusion.ai",
    revision: gitRevision,
  }]);
  assert.equal(await readFile(evidencePath, "utf8"), evidence);
});

test("staging verification fails before publication for stale evidence", async () => {
  let publisherCalls = 0;
  await assert.rejects(verifyGuardedStagingPublication({
    publisherArgs: ["real-staging-publisher"],
    env: {
      RELEASE_ENVIRONMENT: "staging",
      RELEASE_BASE_URL: "https://staging.aiofusion.ai",
    },
    read: async () => JSON.stringify({
      status: "passed",
      ...MATCHING_SOURCE,
      gitRevision: "fedcba9876543210fedcba9876543210fedcba98",
      gitTree: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    }),
    getSourceState: sourceState,
    runPublisher: async () => {
      publisherCalls += 1;
      return { code: 0, signal: null };
    },
  }), /different Git revision/);
  assert.equal(publisherCalls, 0);
});

test("staging verification records the observed mismatched health revision", async () => {
  const history = [];
  const observedRevision = "fedcba9876543210fedcba9876543210fedcba98";
  const error = new Error("staging revision mismatch");
  error.observedRevision = observedRevision;
  await assert.rejects(verifyGuardedStagingPublication({
    publisherArgs: ["real-staging-publisher"],
    evidencePath: path.join("release-evidence", "latest.json"),
    env: {
      RELEASE_ENVIRONMENT: "staging",
      RELEASE_BASE_URL: "https://staging.aiofusion.ai",
    },
    read: async () => JSON.stringify({ status: "passed", ...MATCHING_SOURCE }),
    getSourceState: sourceState,
    runPublisher: async () => ({ code: 0, signal: null }),
    verifyRevision: async () => {
      throw error;
    },
    recordHistory: async (entry) => history.push(entry),
  }), /staging revision mismatch/);
  assert.equal(history.length, 1);
  assert.deepEqual(history[0].details, {
    approvedRevision: MATCHING_SOURCE.gitRevision,
    observedRevision,
    revisionsMatch: false,
  });
  assert.equal(history[0].status, "mismatched");
});

test("staging verification rejects a returned health response with the wrong revision", async () => {
  const history = [];
  const observedRevision = "fedcba9876543210fedcba9876543210fedcba98";
  await assert.rejects(verifyGuardedStagingPublication({
    publisherArgs: ["real-staging-publisher"],
    evidencePath: path.join("release-evidence", "latest.json"),
    env: {
      RELEASE_ENVIRONMENT: "staging",
      RELEASE_BASE_URL: "https://staging.aiofusion.ai",
    },
    read: async () => JSON.stringify({ status: "passed", ...MATCHING_SOURCE }),
    getSourceState: sourceState,
    runPublisher: async () => ({ code: 0, signal: null }),
    verifyRevision: async () => ({ observedRevision }),
    recordHistory: async (entry) => history.push(entry),
  }), /did not match/);
  assert.equal(history[0].details.observedRevision, observedRevision);
  assert.equal(history[0].details.revisionsMatch, false);
});

test("fails the gate before stages when the initial source is dirty", async () => {
  const calls = [];
  const result = await runReleaseGate({
    stages: [["one", "first"]],
    run: async (command) => calls.push(command),
    env: { RELEASE_ENVIRONMENT: "staging" },
    evidencePath: path.join(await mkdtemp(path.join(tmpdir(), "release-gate-")), "evidence.json"),
    getSourceState: async () => ({ ...MATCHING_SOURCE, sourceState: "dirty" }),
  });
  assert.equal(result.status, "failed");
  assert.equal(result.failedStage, "source revision safeguards");
  assert.equal(result.sourceState, "dirty");
  assert.deepEqual(calls, []);
});

test("fails the gate when the revision changes while stages run", async () => {
  let sourceRead = 0;
  const result = await runReleaseGate({
    stages: [["one", "first"]],
    run: async () => {},
    env: { RELEASE_ENVIRONMENT: "staging" },
    evidencePath: path.join(await mkdtemp(path.join(tmpdir(), "release-gate-")), "evidence.json"),
    getSourceState: async () => {
      sourceRead += 1;
      return sourceRead === 1
        ? MATCHING_SOURCE
        : { ...MATCHING_SOURCE, gitRevision: "fedcba9876543210fedcba9876543210fedcba98" };
    },
  });
  assert.equal(result.status, "failed");
  assert.equal(result.failedStage, "source revision safeguards");
  assert.equal(result.gitRevision, MATCHING_SOURCE.gitRevision);
  assert.deepEqual(result.stages.map(({ status }) => status), ["passed"]);
});

test("fails the gate when stages leave uncommitted source changes", async () => {
  let sourceRead = 0;
  const result = await runReleaseGate({
    stages: [["one", "first"]],
    run: async () => {},
    env: { RELEASE_ENVIRONMENT: "staging" },
    evidencePath: path.join(await mkdtemp(path.join(tmpdir(), "release-gate-")), "evidence.json"),
    getSourceState: async () => ({
      ...MATCHING_SOURCE,
      sourceState: sourceRead++ === 0 ? "clean" : "dirty",
    }),
  });
  assert.equal(result.status, "failed");
  assert.equal(result.failedStage, "source revision safeguards");
});
