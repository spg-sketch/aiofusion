/**
 * Offline, fail-closed readiness checks for a selective migration.
 *
 * This module is deliberately not an importer.  It has no database, network,
 * filesystem, ORM, or application imports and has no write/apply operation.
 * It checks independently supplied evidence; it cannot establish that the
 * evidence describes live systems.
 */
import { createHash } from "node:crypto";

export interface StableIdentity {
  stableId: string;
  slug: string;
}

export interface SelectedProject {
  id: string;
  name: string;
  sourceOwner: StableIdentity;
  targetOwner: StableIdentity;
  parentProjectId?: string | null;
}

export interface AccountMapping {
  source: StableIdentity;
  target: StableIdentity;
  role: string;
  /** Source stable ID of the parent account, or null for a root account. */
  parent: string | null;
}

export interface FrozenSelectiveMigrationManifest {
  /** Must be an externally supplied, reviewed, frozen manifest. */
  external: true;
  frozen: true;
  reviewed: true;
  selectionMode: "explicit";
  includeAllProjects: false;
  selectedProjects: readonly SelectedProject[];
  accountMappings: readonly AccountMapping[];
  excluded: {
    projectIds: readonly string[];
    projectNames: readonly string[];
    logins: readonly string[];
  };
  expectedInsertionCounts: Readonly<Record<string, number>>;
  sha256: string;
}

export interface BindingEvidence {
  verified: true;
  independentlyVerified: true;
  /** These are opaque labels, not connection strings or credentials. */
  databaseIdentity: string;
  endpointIdentity: string;
  distinctFromOtherBinding: true;
}

export interface Fingerprint {
  schema: string;
  rows: string;
}

export type EvidenceStatus = "verified" | "unknown" | "missing";

export interface CoverageEvidence {
  history: EvidenceStatus;
  assets: EvidenceStatus;
  security: EvidenceStatus;
  entitlements: EvidenceStatus;
}

export interface AccountSafetyEvidence {
  activeSessions: false;
  passwordReset: false;
  verificationPending: false;
  trustedGrants: false;
  invitations: false;
}

export interface ConflictRecord {
  key: string;
  sourceValue: string;
  targetValue: string;
  approved: true;
  exactMapping: {
    source: string;
    target: string;
  };
}

export interface BackupEvidence {
  fresh: boolean;
  checksum: string;
  isolatedRestoreVerified: boolean;
}

export interface ReadinessEvidence {
  sourceBinding: BindingEvidence;
  destinationBinding: BindingEvidence;
  sourceFingerprint: Fingerprint;
  destinationFingerprint: Fingerprint;
  expectedSourceFingerprint: Fingerprint;
  expectedDestinationFingerprint: Fingerprint;
  expectedManifestSha256: string;
  coverage: CoverageEvidence;
  accountSafety: AccountSafetyEvidence;
  conflicts: readonly ConflictRecord[];
  sourceBackup: BackupEvidence;
  destinationBackup: BackupEvidence;
  rehearsalCompleted: boolean;
  idempotencyVerified: boolean;
  rollbackVerified: boolean;
  observedInsertionCounts: Readonly<Record<string, number>>;
}

export interface FinalReadinessApprovals {
  /**
   * Evidence assertions only.  This offline module does not authenticate an
   * approver or cryptographically bind an approval to manifest bytes or a
   * destination; it must not be treated as authorization.
   */
  manifestApproved: boolean;
  destinationApproved: boolean;
}

export interface SelectiveMigrationReadinessInput {
  manifest: FrozenSelectiveMigrationManifest;
  evidence: ReadinessEvidence;
  approvals: FinalReadinessApprovals;
  /** A readiness validator never accepts an apply request. */
  applyRequested?: boolean;
  dryRunReadyReport?: boolean;
}

export type ReadinessBlockerCode =
  | "INVALID_INPUT"
  | "MANIFEST_NOT_EXTERNAL"
  | "MANIFEST_NOT_FROZEN"
  | "MANIFEST_NOT_REVIEWED"
  | "MANIFEST_SELECTION_NOT_EXPLICIT"
  | "IMPLICIT_ALL_PROJECT_IMPORT"
  | "EXACT_PROJECT_COUNT_REQUIRED"
  | "PROJECT_RECORD_INVALID"
  | "DUPLICATE_PROJECT_ID"
  | "DUPLICATE_PROJECT_NAME"
  | "PROJECT_PARENT_OUTSIDE_SELECTION"
  | "PROJECT_PARENT_CYCLE"
  | "PROJECT_OWNER_MAPPING_MISSING"
  | "ACCOUNT_MAPPING_INCOMPLETE"
  | "ACCOUNT_MAPPING_CONFLICT"
  | "ACCOUNT_SLUG_ID_CONFLICT"
  | "ACCOUNT_PARENT_OUTSIDE_MAPPING"
  | "ACCOUNT_PARENT_CYCLE"
  | "MANIFEST_DIGEST_MISSING"
  | "MANIFEST_DIGEST_MISMATCH"
  | "EXPECTED_MANIFEST_DIGEST_MISSING"
  | "EXPECTED_MANIFEST_DIGEST_MISMATCH"
  | "BINDING_EVIDENCE_MISSING"
  | "BINDING_NOT_INDEPENDENTLY_VERIFIED"
  | "BINDING_IDENTITY_MISSING"
  | "SOURCE_DESTINATION_IDENTITY_EQUAL"
  | "FINGERPRINT_MISSING"
  | "SOURCE_SCHEMA_DRIFT"
  | "SOURCE_ROW_DRIFT"
  | "DESTINATION_SCHEMA_DRIFT"
  | "DESTINATION_ROW_DRIFT"
  | "HISTORY_MISSING"
  | "HISTORY_UNKNOWN"
  | "ASSETS_MISSING"
  | "ASSETS_UNKNOWN"
  | "SECURITY_MISSING"
  | "SECURITY_UNKNOWN"
  | "ENTITLEMENTS_MISSING"
  | "ENTITLEMENTS_UNKNOWN"
  | "ACCOUNT_SAFETY_UNKNOWN"
  | "ACTIVE_SESSION"
  | "PASSWORD_RESET_PENDING"
  | "VERIFICATION_PENDING"
  | "TRUSTED_GRANT"
  | "INVITATION"
  | "CONFLICT_NOT_EXPLICITLY_APPROVED"
  | "CONFLICT_EXACT_MAPPING_MISSING"
  | "EXCLUDED_PROJECT_OVERLAP"
  | "EXCLUDED_LOGIN_OVERLAP"
  | "EXCLUSION_SET_MISSING"
  | "BACKUP_MISSING"
  | "BACKUP_CHECKSUM_MISSING"
  | "BACKUP_CHECKSUM_INVALID"
  | "BACKUP_NOT_FRESH"
  | "BACKUP_NOT_ISOLATED"
  | "REHEARSAL_MISSING"
  | "IDEMPOTENCY_NOT_VERIFIED"
  | "ROLLBACK_NOT_VERIFIED"
  | "INSERTION_COUNTS_MISSING"
  | "INSERTION_COUNTS_MISMATCH"
  | "MANIFEST_APPROVAL_MISSING"
  | "DESTINATION_APPROVAL_MISSING"
  | "UNAPPROVED_APPLY"
  | "APPLY_NOT_SUPPORTED";

export interface ReadinessBlocker {
  code: ReadinessBlockerCode;
}

export interface SelectiveMigrationReadinessReport {
  ready: boolean;
  blockers: readonly ReadinessBlocker[];
  /** An explicit statement suitable for callers displaying this report. */
  isImporter: false;
  offlineEvidenceOnly: true;
}

const HASH_RE = /^[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * JSON canonicalisation used for the frozen manifest digest.  The digest
 * excludes only the manifest's own sha256 field, avoiding a self-reference.
 */
function canonicalValue(value: unknown, omitSha256 = false): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalValue(item));
  if (isRecord(value)) {
    return Object.keys(value)
      .filter((key) => !omitSha256 || key !== "sha256")
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = canonicalValue(value[key]);
        return result;
      }, {});
  }
  return value;
}

/** Generic deterministic digest for JSON-like evidence or draft manifests. */
export function computeCanonicalSha256(value: unknown, omitSha256 = false): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalValue(value, omitSha256)))
    .digest("hex");
}

export function computeManifestSha256(
  manifest: Omit<FrozenSelectiveMigrationManifest, "sha256"> |
    FrozenSelectiveMigrationManifest,
): string {
  return computeCanonicalSha256(manifest, true);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stableIdentityIsComplete(value: unknown): value is StableIdentity {
  return (
    isRecord(value) &&
    nonEmpty(value.stableId) &&
    nonEmpty(value.slug)
  );
}

function fingerprintIsComplete(value: unknown): value is Fingerprint {
  return (
    isRecord(value) &&
    nonEmpty(value.schema) &&
    nonEmpty(value.rows)
  );
}

function add(
  blockers: Set<ReadinessBlockerCode>,
  code: ReadinessBlockerCode,
): void {
  blockers.add(code);
}

function checkCoverage(
  evidence: ReadinessEvidence,
  blockers: Set<ReadinessBlockerCode>,
): void {
  const coverage = isRecord(evidence) ? evidence.coverage : undefined;
  const checks: readonly [
    keyof CoverageEvidence,
    ReadinessBlockerCode,
    ReadinessBlockerCode,
  ][] = [
    ["history", "HISTORY_MISSING", "HISTORY_UNKNOWN"],
    ["assets", "ASSETS_MISSING", "ASSETS_UNKNOWN"],
    ["security", "SECURITY_MISSING", "SECURITY_UNKNOWN"],
    ["entitlements", "ENTITLEMENTS_MISSING", "ENTITLEMENTS_UNKNOWN"],
  ];
  for (const [field, missingCode, unknownCode] of checks) {
    const status = isRecord(coverage) ? coverage[field] : undefined;
    if (status === "missing" || status === undefined) add(blockers, missingCode);
    else if (status !== "verified") add(blockers, unknownCode);
  }
}

function checkAccountSafety(
  evidence: ReadinessEvidence,
  blockers: Set<ReadinessBlockerCode>,
): void {
  const safety = isRecord(evidence) ? evidence.accountSafety : undefined;
  if (!isRecord(safety)) {
    add(blockers, "ACCOUNT_SAFETY_UNKNOWN");
    return;
  }
  const checks: readonly [keyof AccountSafetyEvidence, ReadinessBlockerCode][] = [
    ["activeSessions", "ACTIVE_SESSION"],
    ["passwordReset", "PASSWORD_RESET_PENDING"],
    ["verificationPending", "VERIFICATION_PENDING"],
    ["trustedGrants", "TRUSTED_GRANT"],
    ["invitations", "INVITATION"],
  ];
  for (const [field, code] of checks) {
    if (!hasOwn(safety, field)) add(blockers, "ACCOUNT_SAFETY_UNKNOWN");
    else if (safety[field] !== false) add(blockers, code);
  }
}

function checkBackups(
  evidence: ReadinessEvidence,
  blockers: Set<ReadinessBlockerCode>,
): void {
  for (const key of ["sourceBackup", "destinationBackup"] as const) {
    const backup = isRecord(evidence) ? evidence[key] : undefined;
    if (!isRecord(backup)) {
      add(blockers, "BACKUP_MISSING");
      continue;
    }
    if (!nonEmpty(backup.checksum)) add(blockers, "BACKUP_CHECKSUM_MISSING");
    else if (!/^[a-f0-9]{64}$/i.test(backup.checksum)) {
      add(blockers, "BACKUP_CHECKSUM_INVALID");
    }
    if (backup.fresh !== true) add(blockers, "BACKUP_NOT_FRESH");
    if (backup.isolatedRestoreVerified !== true) add(blockers, "BACKUP_NOT_ISOLATED");
  }
}

function checkCounts(
  manifest: FrozenSelectiveMigrationManifest,
  evidence: ReadinessEvidence,
  blockers: Set<ReadinessBlockerCode>,
): void {
  const expected = manifest.expectedInsertionCounts;
  const observed = isRecord(evidence) ? evidence.observedInsertionCounts : undefined;
  if (!isRecord(expected) || !isRecord(observed)) {
    add(blockers, "INSERTION_COUNTS_MISSING");
    return;
  }
  const expectedKeys = Object.keys(expected).sort();
  const observedKeys = Object.keys(observed).sort();
  if (
    expectedKeys.length === 0 ||
    expectedKeys.length !== observedKeys.length ||
    expectedKeys.some((key, index) => key !== observedKeys[index])
  ) {
    add(blockers, "INSERTION_COUNTS_MISMATCH");
    return;
  }
  for (const key of expectedKeys) {
    if (
      !Number.isSafeInteger(expected[key]) ||
      expected[key] < 0 ||
      observed[key] !== expected[key]
    ) {
      add(blockers, "INSERTION_COUNTS_MISMATCH");
    }
  }
}

function checkManifest(
  manifest: unknown,
  blockers: Set<ReadinessBlockerCode>,
): manifest is FrozenSelectiveMigrationManifest {
  if (!isRecord(manifest)) {
    add(blockers, "INVALID_INPUT");
    return false;
  }
  if (manifest.external !== true) add(blockers, "MANIFEST_NOT_EXTERNAL");
  if (manifest.frozen !== true) add(blockers, "MANIFEST_NOT_FROZEN");
  if (manifest.reviewed !== true) add(blockers, "MANIFEST_NOT_REVIEWED");
  if (manifest.selectionMode !== "explicit") add(blockers, "MANIFEST_SELECTION_NOT_EXPLICIT");
  if (manifest.includeAllProjects !== false) add(blockers, "IMPLICIT_ALL_PROJECT_IMPORT");

  const projects = manifest.selectedProjects;
  if (!Array.isArray(projects) || projects.length !== 15) {
    add(blockers, "EXACT_PROJECT_COUNT_REQUIRED");
  }
  const ids = new Set<string>();
  const names = new Set<string>();
  if (Array.isArray(projects)) {
    for (const project of projects) {
      if (
        !isRecord(project) ||
        !nonEmpty(project.id) ||
        !nonEmpty(project.name) ||
        !stableIdentityIsComplete(project.sourceOwner) ||
        !stableIdentityIsComplete(project.targetOwner)
      ) {
        add(blockers, "PROJECT_RECORD_INVALID");
        continue;
      }
      const id = project.id.trim();
      const name = project.name.trim().toLocaleLowerCase();
      if (ids.has(id)) add(blockers, "DUPLICATE_PROJECT_ID");
      if (names.has(name)) add(blockers, "DUPLICATE_PROJECT_NAME");
      ids.add(id);
      names.add(name);
    }
    for (const project of projects) {
      if (!isRecord(project) || project.parentProjectId == null) continue;
      if (typeof project.parentProjectId !== "string" || !ids.has(project.parentProjectId)) {
        add(blockers, "PROJECT_PARENT_OUTSIDE_SELECTION");
      }
    }
    for (const project of projects) {
      if (!isRecord(project) || typeof project.id !== "string") continue;
      const seen = new Set<string>();
      let parent: unknown = project.parentProjectId;
      while (typeof parent === "string") {
        if (seen.has(parent)) {
          add(blockers, "PROJECT_PARENT_CYCLE");
          break;
        }
        seen.add(parent);
        const parentProject = projects.find(
          (candidate) => isRecord(candidate) && candidate.id === parent,
        );
        if (!parentProject) break;
        parent = parentProject.parentProjectId;
      }
    }
  }

  const mappings = manifest.accountMappings;
  if (!Array.isArray(mappings) || mappings.length === 0) {
    add(blockers, "ACCOUNT_MAPPING_INCOMPLETE");
  } else {
    const sourceIds = new Set<string>();
    const targetIds = new Set<string>();
    const sourceSlugIds = new Map<string, string>();
    const targetSlugIds = new Map<string, string>();
    const sourceParentIds = new Set<string>();
    for (const mapping of mappings) {
      if (
        !isRecord(mapping) ||
        !stableIdentityIsComplete(mapping.source) ||
        !stableIdentityIsComplete(mapping.target) ||
        !nonEmpty(mapping.role) ||
        !hasOwn(mapping, "parent") ||
        (mapping.parent !== null && !nonEmpty(mapping.parent))
      ) {
        add(blockers, "ACCOUNT_MAPPING_INCOMPLETE");
        continue;
      }
      const sourceId = mapping.source.stableId;
      const targetId = mapping.target.stableId;
      const sourceSlug = mapping.source.slug.toLocaleLowerCase();
      const targetSlug = mapping.target.slug.toLocaleLowerCase();
      const previousSourceId = sourceSlugIds.get(sourceSlug);
      const previousTargetId = targetSlugIds.get(targetSlug);
      if (
        (previousSourceId !== undefined && previousSourceId !== sourceId) ||
        (previousTargetId !== undefined && previousTargetId !== targetId)
      ) {
        add(blockers, "ACCOUNT_SLUG_ID_CONFLICT");
      }
      sourceSlugIds.set(sourceSlug, sourceId);
      targetSlugIds.set(targetSlug, targetId);
      if (sourceIds.has(sourceId) || targetIds.has(targetId)) {
        add(blockers, "ACCOUNT_MAPPING_CONFLICT");
      }
      sourceIds.add(sourceId);
      targetIds.add(targetId);
      sourceParentIds.add(sourceId);
    }

    for (const mapping of mappings) {
      if (!isRecord(mapping) || !stableIdentityIsComplete(mapping.source)) continue;
      const parent = mapping.parent;
      if (typeof parent === "string" && !sourceParentIds.has(parent)) {
        add(blockers, "ACCOUNT_PARENT_OUTSIDE_MAPPING");
      }
    }
    for (const mapping of mappings) {
      if (!isRecord(mapping) || !stableIdentityIsComplete(mapping.source)) continue;
      const seen = new Set<string>();
      let parent: unknown = mapping.parent;
      while (typeof parent === "string") {
        if (seen.has(parent)) {
          add(blockers, "ACCOUNT_PARENT_CYCLE");
          break;
        }
        seen.add(parent);
        const parentMapping = mappings.find(
          (candidate) =>
            isRecord(candidate) &&
            stableIdentityIsComplete(candidate.source) &&
            candidate.source.stableId === parent,
        );
        if (!parentMapping) break;
        parent = parentMapping.parent;
      }
    }

    if (Array.isArray(manifest.selectedProjects)) {
      for (const project of manifest.selectedProjects) {
        if (
          !isRecord(project) ||
          !stableIdentityIsComplete(project.sourceOwner) ||
          !stableIdentityIsComplete(project.targetOwner)
        ) {
          continue;
        }
        const sourceOwner = project.sourceOwner;
        const targetOwner = project.targetOwner;
        const hasExactOwnerMapping = mappings.some(
          (mapping) =>
            isRecord(mapping) &&
            stableIdentityIsComplete(mapping.source) &&
            stableIdentityIsComplete(mapping.target) &&
            mapping.source.stableId === sourceOwner.stableId &&
            mapping.source.slug === sourceOwner.slug &&
            mapping.target.stableId === targetOwner.stableId &&
            mapping.target.slug === targetOwner.slug,
        );
        if (!hasExactOwnerMapping) add(blockers, "PROJECT_OWNER_MAPPING_MISSING");
      }
    }
  }

  if (!nonEmpty(manifest.sha256)) add(blockers, "MANIFEST_DIGEST_MISSING");
  else if (!HASH_RE.test(manifest.sha256) || computeManifestSha256(manifest as unknown as FrozenSelectiveMigrationManifest) !== manifest.sha256) {
    add(blockers, "MANIFEST_DIGEST_MISMATCH");
  }
  return true;
}

function checkExclusions(
  manifest: FrozenSelectiveMigrationManifest,
  blockers: Set<ReadinessBlockerCode>,
): void {
  if (!isRecord(manifest.excluded)) {
    add(blockers, "EXCLUSION_SET_MISSING");
    return;
  }
  if (
    !Array.isArray(manifest.excluded.projectIds) ||
    !Array.isArray(manifest.excluded.projectNames) ||
    !Array.isArray(manifest.excluded.logins)
  ) {
    add(blockers, "EXCLUSION_SET_MISSING");
    return;
  }
  if (
    manifest.excluded.projectIds.some((value) => !nonEmpty(value)) ||
    manifest.excluded.projectNames.some((value) => !nonEmpty(value)) ||
    manifest.excluded.logins.some((value) => !nonEmpty(value))
  ) {
    add(blockers, "INVALID_INPUT");
    return;
  }
  const projects = Array.isArray(manifest.selectedProjects) ? manifest.selectedProjects : [];
  const ids = new Set(
    Array.isArray(manifest.excluded.projectIds)
      ? manifest.excluded.projectIds
      : [],
  );
  const names = new Set(
    Array.isArray(manifest.excluded.projectNames)
      ? manifest.excluded.projectNames.map((name) => name.toLocaleLowerCase())
      : [],
  );
  if (
    projects.some(
      (project) =>
        isRecord(project) &&
        ((typeof project.id === "string" && ids.has(project.id)) ||
          (typeof project.name === "string" && names.has(project.name.toLocaleLowerCase()))),
    )
  ) {
    add(blockers, "EXCLUDED_PROJECT_OVERLAP");
  }

  const excludedLogins = new Set(
    Array.isArray(manifest.excluded.logins)
      ? manifest.excluded.logins.map((login) => login.toLocaleLowerCase())
      : [],
  );
  const mappedLogins: string[] = [];
  const mappings = Array.isArray(manifest.accountMappings) ? manifest.accountMappings : [];
  for (const mapping of mappings) {
    if (!isRecord(mapping)) continue;
    for (const side of ["source", "target"] as const) {
      const identity = mapping[side];
      if (stableIdentityIsComplete(identity)) mappedLogins.push(identity.slug.toLocaleLowerCase());
    }
  }
  for (const project of projects) {
    if (!isRecord(project)) continue;
    for (const side of ["sourceOwner", "targetOwner"] as const) {
      const identity = project[side];
      if (stableIdentityIsComplete(identity)) mappedLogins.push(identity.slug.toLocaleLowerCase());
    }
  }
  if (mappedLogins.some((login) => excludedLogins.has(login))) {
    add(blockers, "EXCLUDED_LOGIN_OVERLAP");
  }
}

function checkEvidence(
  manifest: FrozenSelectiveMigrationManifest,
  evidence: unknown,
  blockers: Set<ReadinessBlockerCode>,
): evidence is ReadinessEvidence {
  if (!isRecord(evidence)) {
    add(blockers, "INVALID_INPUT");
    return false;
  }
  const sourceBinding = evidence.sourceBinding;
  const destinationBinding = evidence.destinationBinding;
  if (!isRecord(sourceBinding) || !isRecord(destinationBinding)) {
    add(blockers, "BINDING_EVIDENCE_MISSING");
  } else {
    for (const binding of [sourceBinding, destinationBinding]) {
      if (binding.verified !== true || binding.independentlyVerified !== true) {
        add(blockers, "BINDING_NOT_INDEPENDENTLY_VERIFIED");
      }
      if (
        !nonEmpty(binding.databaseIdentity) ||
        !nonEmpty(binding.endpointIdentity) ||
        binding.distinctFromOtherBinding !== true
      ) {
        add(blockers, "BINDING_IDENTITY_MISSING");
      }
    }
    if (
      nonEmpty(sourceBinding.databaseIdentity) &&
      nonEmpty(destinationBinding.databaseIdentity) &&
      sourceBinding.databaseIdentity === destinationBinding.databaseIdentity
    ) {
      add(blockers, "SOURCE_DESTINATION_IDENTITY_EQUAL");
    }
    if (
      nonEmpty(sourceBinding.endpointIdentity) &&
      nonEmpty(destinationBinding.endpointIdentity) &&
      sourceBinding.endpointIdentity === destinationBinding.endpointIdentity
    ) {
      add(blockers, "SOURCE_DESTINATION_IDENTITY_EQUAL");
    }
  }

  const source = evidence.sourceFingerprint;
  const destination = evidence.destinationFingerprint;
  const expectedSource = evidence.expectedSourceFingerprint;
  const expectedDestination = evidence.expectedDestinationFingerprint;
  if (
    !fingerprintIsComplete(source) ||
    !fingerprintIsComplete(destination) ||
    !fingerprintIsComplete(expectedSource) ||
    !fingerprintIsComplete(expectedDestination)
  ) {
    add(blockers, "FINGERPRINT_MISSING");
  } else {
    if (source.schema !== expectedSource.schema) add(blockers, "SOURCE_SCHEMA_DRIFT");
    if (source.rows !== expectedSource.rows) add(blockers, "SOURCE_ROW_DRIFT");
    if (destination.schema !== expectedDestination.schema) add(blockers, "DESTINATION_SCHEMA_DRIFT");
    if (destination.rows !== expectedDestination.rows) add(blockers, "DESTINATION_ROW_DRIFT");
  }

  checkCoverage(evidence as unknown as ReadinessEvidence, blockers);
  checkAccountSafety(evidence as unknown as ReadinessEvidence, blockers);
  checkBackups(evidence as unknown as ReadinessEvidence, blockers);
  checkCounts(manifest, evidence as unknown as ReadinessEvidence, blockers);

  if (!Array.isArray(evidence.conflicts)) {
    add(blockers, "CONFLICT_NOT_EXPLICITLY_APPROVED");
  } else {
    for (const conflict of evidence.conflicts) {
      if (!isRecord(conflict) || conflict.approved !== true) {
        add(blockers, "CONFLICT_NOT_EXPLICITLY_APPROVED");
      } else if (
        !isRecord(conflict.exactMapping) ||
        !nonEmpty(conflict.exactMapping.source) ||
        !nonEmpty(conflict.exactMapping.target) ||
        conflict.exactMapping.source !== conflict.sourceValue ||
        conflict.exactMapping.target !== conflict.targetValue
      ) {
        add(blockers, "CONFLICT_EXACT_MAPPING_MISSING");
      }
    }
  }

  if (evidence.rehearsalCompleted !== true) add(blockers, "REHEARSAL_MISSING");
  if (evidence.idempotencyVerified !== true) add(blockers, "IDEMPOTENCY_NOT_VERIFIED");
  if (evidence.rollbackVerified !== true) add(blockers, "ROLLBACK_NOT_VERIFIED");

  if (!nonEmpty(evidence.expectedManifestSha256)) {
    add(blockers, "EXPECTED_MANIFEST_DIGEST_MISSING");
  } else if (evidence.expectedManifestSha256 !== manifest.sha256) {
    add(blockers, "EXPECTED_MANIFEST_DIGEST_MISMATCH");
  }
  return true;
}

/**
 * Validate only supplied, independently verified evidence.  This function
 * never connects to a database and never performs an import or any write.
 */
function invalidInputReport(): SelectiveMigrationReadinessReport {
  return {
    ready: false,
    blockers: [{ code: "INVALID_INPUT" }],
    isImporter: false,
    offlineEvidenceOnly: true,
  };
}

function validateSelectiveMigrationReadinessInternal(
  input: SelectiveMigrationReadinessInput,
): SelectiveMigrationReadinessReport {
  const blockers = new Set<ReadinessBlockerCode>();
  if (!isRecord(input)) {
    add(blockers, "INVALID_INPUT");
    return {
      ready: false,
      blockers: [{ code: "INVALID_INPUT" }],
      isImporter: false,
      offlineEvidenceOnly: true,
    };
  }

  const manifestOk = checkManifest(input.manifest, blockers);
  if (manifestOk) {
    checkExclusions(input.manifest, blockers);
    checkEvidence(input.manifest, input.evidence, blockers);
  } else if (!isRecord(input.evidence)) {
    add(blockers, "INVALID_INPUT");
  }

  if (!isRecord(input.approvals) || input.approvals.manifestApproved !== true) {
    add(blockers, "MANIFEST_APPROVAL_MISSING");
  }
  if (!isRecord(input.approvals) || input.approvals.destinationApproved !== true) {
    add(blockers, "DESTINATION_APPROVAL_MISSING");
  }

  if (input.applyRequested === true || (isRecord(input) && input["apply"] === true)) {
    if (
      !isRecord(input.approvals) ||
      input.approvals.manifestApproved !== true ||
      input.approvals.destinationApproved !== true
    ) {
      add(blockers, "UNAPPROVED_APPLY");
    } else {
      add(blockers, "APPLY_NOT_SUPPORTED");
    }
  }

  const sortedCodes = [...blockers].sort();
  return {
    ready: sortedCodes.length === 0,
    blockers: sortedCodes.map((code) => ({ code })),
    isImporter: false,
    offlineEvidenceOnly: true,
  };
}

/**
 * The boundary catches malformed runtime JSON-like values as well as
 * malformed TypeScript callers.  Readiness never throws an operational
 * error: malformed evidence is simply not ready.
 */
export function validateSelectiveMigrationReadiness(
  input: SelectiveMigrationReadinessInput,
): SelectiveMigrationReadinessReport {
  try {
    return validateSelectiveMigrationReadinessInternal(input);
  } catch {
    return invalidInputReport();
  }
}

/** Short alias for callers that use the report's domain name. */
export const validateReadiness = validateSelectiveMigrationReadiness;
