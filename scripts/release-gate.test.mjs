import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assertReleaseEnvironment,
  assertReleaseEvidenceCurrent,
  getGitSourceState,
  RELEASE_STAGES,
  runReleaseGate,
  runStagingPublication,
} from "./release-lib.mjs";
import {
  assertGuardedStagingAutomation,
  validateReleaseAutomation,
} from "./release-automation-guard.mjs";

const MATCHING_SOURCE = {
  gitRevision: "0123456789abcdef0123456789abcdef01234567",
  sourceState: "clean",
};

const sourceState = async () => MATCHING_SOURCE;

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

test("current repository publication automation passes the guard", async () => {
  await validateReleaseAutomation();
});

test("fails closed when HEAD changes while Git source state is captured", async () => {
  const outputs = [
    `${MATCHING_SOURCE.gitRevision}\n`,
    "",
    "fedcba9876543210fedcba9876543210fedcba98\n",
  ];
  await assert.rejects(
    getGitSourceState({
      exec: async () => ({ stdout: outputs.shift() }),
    }),
    /revision changed while release source state was being captured/,
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

  const result = await runStagingPublication({
    env: { RELEASE_ENVIRONMENT: "staging" },
    evidencePath,
    getSourceState: async () => MATCHING_SOURCE,
    publish: async (metadata) => {
      publications += 1;
      publicationMetadata = metadata;
    },
  });

  assert.equal(publications, 1);
  assert.equal(result.evidence.status, "passed");
  assert.deepEqual(publicationMetadata, {
    environment: "staging",
    gitRevision: MATCHING_SOURCE.gitRevision,
  });
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
      currentSource: { ...MATCHING_SOURCE, gitRevision: "fedcba9876543210fedcba9876543210fedcba98" },
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
