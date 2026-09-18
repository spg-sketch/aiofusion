/**
 * Offline compiler for the restricted selective-migration manifest.
 *
 * This module accepts already exported, redacted inventory records. It never
 * opens a database, reads environment variables, or performs filesystem I/O.
 * The resulting manifest is deliberately not import authorization.
 */
import { createHash } from "node:crypto";
import { computeCanonicalSha256, type SelectedProject, type AccountMapping } from "./selective-migration-readiness";

export interface ManifestProject {
  id: string;
  name: string;
  sourceOwner: { stableId: string; slug: string };
  targetOwner: { stableId: string; slug: string };
  parentProjectId?: string | null;
}
export interface ManifestAccount {
  source: { stableId: string; slug: string };
  target: { stableId: string; slug: string };
  role: string;
  parent: string | null;
  action: "reuse" | "new" | "reconstruct";
}
export interface ManifestInventory {
  sourceProjects: readonly ManifestProject[];
  accounts: readonly ManifestAccount[];
  excludedProjectIds: readonly string[];
  excludedProjectNames: readonly string[];
  excludedLogins: readonly string[];
  expectedInsertionCounts: Readonly<Record<string, number>>;
  sourceFingerprint: { schema: string; rows: string };
  destinationFingerprint: { schema: string; rows: string };
}

export interface SelectiveManifest {
  draft: true;
  applyAllowed: false;
  external: true;
  /** A draft is not frozen/reviewed and cannot be passed to readiness/import. */
  frozen: false;
  reviewed: false;
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
  compatibility: {
    dependencyOrder: readonly string[];
    snapshotIdMapRequired: true;
    legacyMissingColumns: readonly string[];
    excludedTables: readonly string[];
  };
  entitlements: {
    betaTrial: Readonly<Record<string, "none" | "new-60-days-from-approved-import">>;
    paymentActivation: false;
    stripeOperations: false;
  };
  coverage: {
    history: "partial";
    assets: "unknown";
    security: "partial";
    browserOnlyData: "not-in-database";
  };
  driftFingerprints: {
    source: { schema: string; rows: string };
    destination: { schema: string; rows: string };
  };
}

const DEPENDENCY_ORDER = [
  "platform_companies", "platform_accounts", "platform_users",
  "platform_memberships", "projects", "archive_items", "planner_items",
  "project_snapshots", "saved_audits", "saved_diagnostics", "audit_locks",
  "token_usage",
] as const;
const EXCLUDED_TABLES = [
  "platform_sessions", "password_reset_tokens", "verification_tokens",
  "trusted_devices", "pending_invitations",
];
const LEGACY_MISSING_COLUMNS = [
  "platform_memberships.project_access", "platform_memberships.session_version",
  "platform_accounts.status", "platform_companies.billing/trial fields",
];

function canonical(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(canonical);
  if (input && typeof input === "object") {
    return Object.keys(input as Record<string, unknown>).sort().reduce<Record<string, unknown>>(
      (out, key) => { out[key] = canonical((input as Record<string, unknown>)[key]); return out; }, {});
  }
  return input;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Compile deterministic redacted manifest data; no apply operation exists. */
export function compileSelectiveManifest(input: ManifestInventory): SelectiveManifest {
  if (!input || !Array.isArray(input.sourceProjects) || !Array.isArray(input.accounts)) {
    throw new Error("manifest compiler requires exported sourceProjects and accounts arrays");
  }
  const projects = clone(input.sourceProjects).sort((a, b) => a.id.localeCompare(b.id));
  if (projects.length !== 15) throw new Error(`expected exactly 15 selected projects, received ${projects.length}`);
  const accountMappings = clone(input.accounts).sort((a, b) => a.source.slug.localeCompare(b.source.slug))
    .map(({ source, target, role, parent }) => ({ source, target, role, parent }));
  if (accountMappings.length !== 4) throw new Error(`expected four protected account mappings, received ${accountMappings.length}`);
  const selectedSlugs = new Set(accountMappings.map((m) => m.source.slug));
  if (!selectedSlugs.has("admin") || !selectedSlugs.has("aiodemo") ||
      !selectedSlugs.has("bluhalo") || !selectedSlugs.has("natalie1990")) {
    throw new Error("manifest must include admin, aiodemo, bluhalo and natalie1990 mappings");
  }
  const base = {
    draft: true as const, applyAllowed: false as const,
    external: true as const, frozen: false as const, reviewed: false as const,
    selectionMode: "explicit" as const, includeAllProjects: false as const,
    selectedProjects: projects, accountMappings,
    excluded: {
      projectIds: [...input.excludedProjectIds].sort(),
      projectNames: [...input.excludedProjectNames].sort(),
      logins: [...input.excludedLogins].sort(),
    },
    expectedInsertionCounts: clone(input.expectedInsertionCounts),
  };
  const unsigned = {
    ...base,
    compatibility: {
      dependencyOrder: DEPENDENCY_ORDER,
      snapshotIdMapRequired: true as const,
      legacyMissingColumns: LEGACY_MISSING_COLUMNS,
      excludedTables: EXCLUDED_TABLES,
    },
    entitlements: {
      betaTrial: { admin: "none", aiodemo: "new-60-days-from-approved-import",
        bluhalo: "new-60-days-from-approved-import", natalie1990: "new-60-days-from-approved-import" },
      paymentActivation: false, stripeOperations: false,
    } as const,
    coverage: { history: "partial", assets: "unknown", security: "partial", browserOnlyData: "not-in-database" } as const,
    driftFingerprints: { source: clone(input.sourceFingerprint), destination: clone(input.destinationFingerprint) },
  };
  const sha256 = computeCanonicalSha256(unsigned, true);
  return { ...unsigned, sha256 };
}

/** Stable digest for restricted inventory evidence, useful for drift reports. */
export function fingerprintManifestInputs(input: ManifestInventory): string {
  return createHash("sha256").update(JSON.stringify(canonical(input))).digest("hex");
}