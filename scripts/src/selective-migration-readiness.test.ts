import assert from "node:assert/strict";
import test from "node:test";
import {
  computeManifestSha256,
  type ReadinessEvidence,
  type SelectiveMigrationReadinessInput,
  validateSelectiveMigrationReadiness,
} from "./selective-migration-readiness";

function makeInput(): SelectiveMigrationReadinessInput {
  const selectedProjects = Array.from({ length: 15 }, (_, index) => ({
    id: `project-${index + 1}`,
    name: `Synthetic project ${index + 1}`,
    sourceOwner: { stableId: `source-owner-${index + 1}`, slug: `source-login-${index + 1}` },
    targetOwner: { stableId: `target-owner-${index + 1}`, slug: `target-login-${index + 1}` },
    parentProjectId: null,
  }));
  const manifest = {
    external: true as const,
    frozen: true as const,
    reviewed: true as const,
    selectionMode: "explicit" as const,
    includeAllProjects: false as const,
    selectedProjects,
    accountMappings: selectedProjects.map((project) => ({
      source: project.sourceOwner,
      target: project.targetOwner,
      role: "owner",
      parent: null,
    })),
    excluded: { projectIds: [], projectNames: [], logins: [] },
    expectedInsertionCounts: { projects: 15, accounts: 15 },
    sha256: "",
  };
  manifest.sha256 = computeManifestSha256(manifest);
  const fingerprint = { schema: "schema-fingerprint", rows: "row-fingerprint" };
  const evidence: ReadinessEvidence = {
    sourceBinding: {
      verified: true,
      independentlyVerified: true,
      databaseIdentity: "opaque-source-db",
      endpointIdentity: "opaque-source-endpoint",
      distinctFromOtherBinding: true,
    },
    destinationBinding: {
      verified: true,
      independentlyVerified: true,
      databaseIdentity: "opaque-destination-db",
      endpointIdentity: "opaque-destination-endpoint",
      distinctFromOtherBinding: true,
    },
    sourceFingerprint: fingerprint,
    destinationFingerprint: fingerprint,
    expectedSourceFingerprint: fingerprint,
    expectedDestinationFingerprint: fingerprint,
    expectedManifestSha256: manifest.sha256,
    coverage: { history: "verified", assets: "verified", security: "verified", entitlements: "verified" },
    accountSafety: {
      activeSessions: false,
      passwordReset: false,
      verificationPending: false,
      trustedGrants: false,
      invitations: false,
    },
    conflicts: [],
    sourceBackup: { fresh: true, checksum: "a".repeat(64), isolatedRestoreVerified: true },
    destinationBackup: { fresh: true, checksum: "b".repeat(64), isolatedRestoreVerified: true },
    rehearsalCompleted: true,
    idempotencyVerified: true,
    rollbackVerified: true,
    observedInsertionCounts: { projects: 15, accounts: 15 },
  };
  return {
    manifest,
    evidence,
    approvals: { manifestApproved: true, destinationApproved: true },
  };
}

function codes(input: SelectiveMigrationReadinessInput): string[] {
  return validateSelectiveMigrationReadiness(input).blockers.map((blocker) => blocker.code);
}

function refreshManifestDigest(input: SelectiveMigrationReadinessInput): void {
  input.manifest.sha256 = computeManifestSha256(input.manifest);
  input.evidence.expectedManifestSha256 = input.manifest.sha256;
}

test("accepts a complete frozen offline report and is not an importer", () => {
  const input = makeInput();
  const report = validateSelectiveMigrationReadiness(input);
  assert.equal(report.ready, true);
  assert.equal(report.isImporter, false);
  assert.equal(report.offlineEvidenceOnly, true);
});

test("blocks an unapproved account collision", () => {
  const input = makeInput();
  input.manifest.accountMappings = [
    ...input.manifest.accountMappings,
    {
      source: { stableId: "other-source-account", slug: "other-source-login" },
      target: { stableId: "target-owner-1", slug: "other-target-login" },
      role: "member",
      parent: null,
    },
  ];
  refreshManifestDigest(input);
  assert.ok(codes(input).includes("ACCOUNT_MAPPING_CONFLICT"));
});

test("requires each selected owner pair to be an exact account mapping", () => {
  const input = makeInput();
  input.manifest.accountMappings = input.manifest.accountMappings.slice(1);
  refreshManifestDigest(input);
  assert.ok(codes(input).includes("PROJECT_OWNER_MAPPING_MISSING"));
});

test("requires account parent closure and rejects parent cycles", () => {
  const outside = makeInput();
  outside.manifest.accountMappings[0].parent = "missing-source-account";
  refreshManifestDigest(outside);
  assert.ok(codes(outside).includes("ACCOUNT_PARENT_OUTSIDE_MAPPING"));

  const cycle = makeInput();
  cycle.manifest.accountMappings[0].parent = "source-owner-2";
  cycle.manifest.accountMappings[1].parent = "source-owner-1";
  refreshManifestDigest(cycle);
  assert.ok(codes(cycle).includes("ACCOUNT_PARENT_CYCLE"));
});

test("rejects a slug reused for inconsistent stable IDs", () => {
  const input = makeInput();
  input.manifest.accountMappings[1].source.slug =
    input.manifest.accountMappings[0].source.slug;
  input.manifest.accountMappings[1].source.stableId = "different-source-id";
  refreshManifestDigest(input);
  assert.ok(codes(input).includes("ACCOUNT_SLUG_ID_CONFLICT"));
});

test("blocks equal source and destination database aliases", () => {
  const input = makeInput();
  input.evidence.destinationBinding.databaseIdentity =
    input.evidence.sourceBinding.databaseIdentity;
  assert.ok(codes(input).includes("SOURCE_DESTINATION_IDENTITY_EQUAL"));
});

test("blocks schema and row fingerprint drift", () => {
  const input = makeInput();
  input.evidence.destinationFingerprint = { schema: "changed-schema", rows: "changed-rows" };
  const found = codes(input);
  assert.ok(found.includes("DESTINATION_SCHEMA_DRIFT"));
  assert.ok(found.includes("DESTINATION_ROW_DRIFT"));
});

test("blocks unknown security mapping and excluded project/login overlap", () => {
  const input = makeInput();
  input.evidence.coverage.security = "unknown";
  input.manifest.excluded.projectIds = ["project-1"];
  input.manifest.excluded.logins = ["source-login-1"];
  refreshManifestDigest(input);
  const found = codes(input);
  assert.ok(found.includes("SECURITY_UNKNOWN"));
  assert.ok(found.includes("EXCLUDED_PROJECT_OVERLAP"));
  assert.ok(found.includes("EXCLUDED_LOGIN_OVERLAP"));
});

test("requires the exact frozen manifest digest", () => {
  const input = makeInput();
  input.manifest.sha256 = "0".repeat(64);
  assert.ok(codes(input).includes("MANIFEST_DIGEST_MISMATCH"));
});

test("never supports an apply request, and distinguishes unapproved apply", () => {
  const input = makeInput();
  input.applyRequested = true;
  input.approvals = { manifestApproved: false, destinationApproved: false };
  const found = codes(input);
  assert.ok(found.includes("UNAPPROVED_APPLY"));
  assert.ok(!found.includes("APPLY_NOT_SUPPORTED"));

  input.approvals = { manifestApproved: true, destinationApproved: true };
  assert.ok(codes(input).includes("APPLY_NOT_SUPPORTED"));
});

test("requires fresh isolated backups and rehearsal evidence", () => {
  const input = makeInput();
  input.evidence.sourceBackup.fresh = false;
  input.evidence.destinationBackup.isolatedRestoreVerified = false;
  input.evidence.rehearsalCompleted = false;
  input.evidence.idempotencyVerified = false;
  input.evidence.rollbackVerified = false;
  const found = codes(input);
  assert.ok(found.includes("BACKUP_NOT_FRESH"));
  assert.ok(found.includes("BACKUP_NOT_ISOLATED"));
  assert.ok(found.includes("REHEARSAL_MISSING"));
  assert.ok(found.includes("IDEMPOTENCY_NOT_VERIFIED"));
  assert.ok(found.includes("ROLLBACK_NOT_VERIFIED"));
});

test("requires valid SHA-256 backup checksums", () => {
  const input = makeInput();
  input.evidence.sourceBackup.checksum = "not-a-sha256";
  assert.ok(codes(input).includes("BACKUP_CHECKSUM_INVALID"));
});

test("malformed runtime JSON fails closed instead of throwing", () => {
  const input = makeInput();
  (input.manifest.excluded as unknown as { projectNames: unknown[] }).projectNames = [42];
  assert.ok(codes(input).includes("INVALID_INPUT"));
  assert.deepEqual(
    validateSelectiveMigrationReadiness(null as unknown as SelectiveMigrationReadinessInput)
      .blockers,
    [{ code: "INVALID_INPUT" }],
  );
});

test("freezes and compares expected insertion counts", () => {
  const input = makeInput();
  input.evidence.observedInsertionCounts = { projects: 14, accounts: 15 };
  assert.ok(codes(input).includes("INSERTION_COUNTS_MISMATCH"));
});
