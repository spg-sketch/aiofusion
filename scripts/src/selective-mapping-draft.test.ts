import assert from "node:assert/strict";
import test from "node:test";
import {
  compileSelectiveMappingDraft,
  type SelectiveMappingDraftInput,
  type WorkspaceDecision,
} from "./selective-mapping-draft";

const sourceDigest = "a".repeat(64);
const targetDigest = "b".repeat(64);

function decision(
  sourceUsername: string,
  action: WorkspaceDecision["action"],
  targetUsername: string,
  sourceRole: string,
  sourceParent: string | null,
  targetParent: string | null,
  extra: Partial<WorkspaceDecision> = {},
): WorkspaceDecision {
  return {
    sourceUsername, action, targetUsername, sourceRole, sourceParent,
    targetRole: sourceRole, targetParent,
    preserveExistingMembers: true,
    preserveExistingSettings: true,
    preserveExistingCredentials: true,
    ...extra,
  };
}

function fixture(): SelectiveMappingDraftInput {
  return {
    source: {
      accounts: [
        { username: "admin", role: "agency", parent: null },
        { username: "aiodemo", role: "agency", parent: "admin" },
        { username: "bluhalo", role: "agency", parent: "admin" },
        { username: "natalie1990", role: "agency", parent: "admin" },
      ],
      companies: [
        { id: "source-admin", slug: "admin" },
        { id: "source-aio", slug: "aiodemo" },
        { id: "source-blu", slug: "bluhalo" },
      ],
      projects: [
        { id: "project-a", name: "Bluhalo named project", owner: "aiodemo" },
        { id: "project-b", name: "Unselected protected agency project", owner: "bluhalo" },
        { id: "project-c", name: "Unselected legacy project", owner: "natalie1990" },
        { id: "project-not-selected", name: "Do not include", owner: "aiodemo" },
      ],
      physicalDatabaseSha256: sourceDigest,
    },
    target: {
      accounts: [
        { username: "target-admin", role: "agency", parent: null },
        { username: "target-aio", role: "agency", parent: "target-admin" },
      ],
      companies: [
        { id: "target-admin-company", slug: "target-admin" },
        { id: "target-aio-company", slug: "target-aio" },
        { id: "target-blu-master", slug: "bluhalo" },
      ],
      users: [{ id: "target-human-natalie" }],
      physicalDatabaseSha256: targetDigest,
    },
    selectedProjectIds: ["project-a"],
    protectedAccountUsernames: ["bluhalo", "natalie1990"],
    excludedProjectIds: [],
    excludedLogins: [],
    workspaceDecisions: [
      decision("admin", "reuse", "target-admin", "agency", null, null, {
        sourceCompanyId: "source-admin", targetCompanyId: "target-admin-company", targetCompanySlug: "target-admin",
      }),
      decision("aiodemo", "reuse", "target-aio", "agency", "admin", "target-admin", {
        sourceCompanyId: "source-aio", targetCompanyId: "target-aio-company", targetCompanySlug: "target-aio",
      }),
      decision("bluhalo", "new", "bluhalo-import", "agency", "admin", "target-admin", {
        sourceCompanyId: "source-blu",
        candidateSlug: "bluhalo-import",
        noCopySourcePassword: null,
      }),
      decision("natalie1990", "reconstruct", "natalie-import", "agency", "admin", "target-admin", {
        candidateSlug: "natalie-import",
        targetHumanId: "target-human-natalie",
        retainExistingGoogle: true, noCopySourcePassword: true,
      }),
    ],
  };
}

function codes(input: unknown): string[] {
  return compileSelectiveMappingDraft(input as SelectiveMappingDraftInput).blockers.map((b) => b.code);
}

test("compiles a deterministic offline draft with explicit selected scope", () => {
  const input = fixture();
  const first = compileSelectiveMappingDraft(input);
  const second = compileSelectiveMappingDraft(input);
  assert.deepEqual(first, second);
  assert.equal(first.draft, true);
  assert.equal(first.applyAllowed, false);
  assert.equal(first.exactMappingApproved, false);
  assert.deepEqual(first.blockers, []);
  assert.equal(first.projectMappings.length, 1);
  assert.equal(first.projectMappings.some((p) => p.sourceProjectId === "project-not-selected"), false);
  const named = first.projectMappings.find((p) => p.sourceProjectId === "project-a");
  assert.equal(named?.name, "Bluhalo named project");
  assert.equal(named?.targetOwner, "target-aio");
  assert.equal(first.candidateWorkspaces.length, 4);
  assert.equal(first.candidateWorkspaces.find((w) => w.sourceUsername === "aiodemo")?.companyId, "target-aio-company");
  const fresh = first.candidateWorkspaces.find((w) => w.sourceUsername === "bluhalo");
  assert.equal(fresh?.slug, "bluhalo-import");
  assert.equal(fresh?.noCopySourcePassword, null);
  assert.equal(fresh?.credentialPolicy, "not-reviewed");
  assert.match(fresh?.companyId ?? "", /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(first.candidateWorkspaces.find((w) => w.sourceUsername === "natalie1990")?.membershipInsertApproved, false);
});

test("keeps existing workspace IDs and flags legacy Google-only reconstruction without password copying", () => {
  const report = compileSelectiveMappingDraft(fixture());
  const legacy = report.candidateWorkspaces.find((w) => w.sourceUsername === "natalie1990");
  assert.match(legacy?.companyId ?? "", /^[0-9a-f]{8}-/);
  assert.equal(legacy?.targetHumanId, "target-human-natalie");
  assert.equal(legacy?.preserveExisting.googleIdentity, true);
  assert.equal(legacy?.noCopySourcePassword, true);
  assert.equal(legacy?.userMerge, false);
});

test("rejects the existing target bluhalo slug for a separate agency candidate", () => {
  const input = fixture();
  const bluhalo = input.workspaceDecisions.find((d) => d.sourceUsername === "bluhalo")!;
  bluhalo.candidateSlug = "bluhalo";
  bluhalo.targetUsername = "bluhalo";
  assert.ok(codes(input).includes("TARGET_WORKSPACE_COLLISION"));
});

test("requires a destination inventory user ID and both reconstruction policy confirmations", () => {
  const input = fixture();
  input.target.users = [];
  assert.ok(codes(input).includes("TARGET_HUMAN_NOT_FOUND"));
  const natalie = input.workspaceDecisions.find((d) => d.sourceUsername === "natalie1990")!;
  natalie.retainExistingGoogle = false;
  natalie.noCopySourcePassword = false;
  assert.ok(codes(input).includes("RECONSTRUCTION_POLICY_REQUIRED"));
});

test("requires explicit parent decisions and catches excluded parents", () => {
  const missing = fixture();
  missing.workspaceDecisions = missing.workspaceDecisions.filter((d) => d.sourceUsername !== "admin");
  assert.ok(codes(missing).includes("MISSING_WORKSPACE_DECISION"));
  const excluded = fixture();
  excluded.excludedLogins = ["admin"];
  assert.ok(codes(excluded).includes("EXCLUDED_PARENT"));
});

test("checks source and destination hierarchy and only permits new agencies", () => {
  const input = fixture();
  const aio = input.workspaceDecisions.find((d) => d.sourceUsername === "aiodemo")!;
  aio.targetParent = null;
  assert.ok(codes(input).includes("DECISION_HIERARCHY_MISMATCH"));
  const client = fixture();
  client.source.accounts = client.source.accounts.map((a) =>
    a.username === "bluhalo" ? { ...a, role: "client" } : a);
  assert.ok(codes(client).includes("NEW_WORKSPACE_NOT_AGENCY"));
});

test("fails closed for malformed runtime input and equal physical database digests", () => {
  assert.deepEqual(compileSelectiveMappingDraft(null as never), {
    draft: true, applyAllowed: false, exactMappingApproved: false,
    blockers: [{ code: "INVALID_RUNTIME_INPUT" }],
    candidateWorkspaces: [], projectMappings: [],
  });
  const equal = fixture();
  equal.target.physicalDatabaseSha256 = sourceDigest;
  assert.ok(codes(equal).includes("SAME_DATABASE_DIGEST"));
});

test("new and reconstructed agencies must preserve all existing destination records", () => {
  for (const name of ["bluhalo", "natalie1990"]) {
    const input = fixture();
    input.workspaceDecisions.find(d => d.sourceUsername === name)!.preserveExistingCredentials = false;
    assert.ok(codes(input).includes("PRESERVE_EXISTING_REQUIRED"));
  }
});

test("new agency requires its exact source company, and ID generation ignores hash casing", () => {
  const invalid = fixture();
  invalid.workspaceDecisions.find(d => d.sourceUsername === "bluhalo")!.sourceCompanyId = "unrelated";
  assert.ok(codes(invalid).includes("SOURCE_COMPANY_MAPPING_MISMATCH"));
  const lower = fixture();
  const upper = fixture();
  upper.source.physicalDatabaseSha256 = sourceDigest.toUpperCase();
  upper.target.physicalDatabaseSha256 = targetDigest.toUpperCase();
  assert.deepEqual(compileSelectiveMappingDraft(lower), compileSelectiveMappingDraft(upper));
});

test("duplicate candidate destination identities cannot merge protected agencies", () => {
  const input = fixture();
  const legacy = input.workspaceDecisions.find(d => d.sourceUsername === "natalie1990")!;
  legacy.targetUsername = "bluhalo-import";
  legacy.candidateSlug = "bluhalo-import";
  assert.ok(codes(input).includes("DUPLICATE_TARGET_CANDIDATE"));
});