/**
 * Guarded selective importer primitives.
 *
 * This module intentionally has no database or application imports. Callers
 * provide a small transaction adapter, which makes the safety contract
 * testable without ever opening a production connection. The default is a
 * dry run; applying requires a byte-bound manifest digest and independently
 * supplied destination approval evidence.
 */
import { createHash } from "node:crypto";
import { computeManifestSha256 } from "./selective-migration-readiness.js";

export interface ImportRow {
  table: string;
  /** Explicit column/value pairs; values are passed as query parameters. */
  values: Readonly<Record<string, unknown>>;
  /** Stable source key used for deterministic retries and provenance. */
  sourceKey: string;
  /** All columns that constitute the destination uniqueness check. */
  conflictKeys: readonly string[];
}
export interface StoredProvenance {
  manifestSha256: string;
  table: string;
  sourceKey: string;
  destinationKey: Readonly<Record<string, unknown>>;
  insertedFingerprint: string;
  insertedColumns?: readonly string[];
}

export interface ImportManifest {
  external: true;
  frozen: true;
  reviewed: true;
  sha256: string;
  sourceEndpoint: string;
  destinationEndpoint: string;
  rows: readonly ImportRow[];
  expectedFingerprints: {
    source: { schema: string; rows: string };
    destination: { schema: string; rows: string };
  };
}

export interface DestinationApproval {
  manifestSha256: string;
  destinationEndpoint: string;
  approved: true;
  scratchOnly?: boolean;
  liveOnly?: boolean;
}
export interface FingerprintEvidence {
  source: { schema: string; rows: string };
  destination: { schema: string; rows: string };
}

export interface ImportTransaction {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  /** Must write into the same transaction as imported rows. */
  recordProvenance(record: ProvenanceRecord): Promise<void>;
  findProvenance(manifestSha256: string, table: string, sourceKey: string): Promise<StoredProvenance | null>;
  insertRow(table: string, values: Readonly<Record<string, unknown>>): Promise<void>;
  deleteImportedRow(table: string, conflictKeys: Readonly<Record<string, unknown>>): Promise<void>;
}

export interface ImportOptions {
  manifest: ImportManifest;
  destinationApproval?: DestinationApproval;
  /** Must be true only for an explicitly approved, isolated scratch rehearsal. */
  apply?: boolean;
  sourceReadOnly?: boolean;
  transaction: ImportTransaction;
  observedFingerprints?: FingerprintEvidence;
}

export interface ProvenanceRecord {
  manifestSha256: string;
  sourceKey: string;
  table: string;
  destinationEndpoint: string;
  destinationKey: Readonly<Record<string, unknown>>;
  insertedFingerprint: string;
  insertedColumns?: readonly string[];
}

export interface ImportReport {
  mode: "dry-run" | "apply";
  inserted: number;
  skipped: number;
  rows: readonly string[];
}

// Explicitly excludes all auth/session/credential and billing relations.
const ALLOWED_TABLES = new Set([
  "platform_accounts", "platform_companies", "platform_memberships",
  "projects", "archive_items", "planner_items", "scoring_configs", "saved_audits",
  "saved_diagnostics", "saved_content_geo", "saved_tech_geo", "project_snapshots",
  "audit_locks", "token_usage",
]);
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ALLOWED_COLUMNS: Readonly<Record<string, ReadonlySet<string>>> = {
  platform_accounts: new Set(["username", "password_hash", "role", "parent", "max_seats", "created_at", "status"]),
  platform_companies: new Set(["id", "slug", "role", "parent_slug", "max_seats", "free_access", "status", "setup_complete", "created_at", "beta_trial_started_at", "beta_trial_ends_at"]),
  platform_memberships: new Set(["user_id", "company_id", "company_slug", "role", "project_access", "created_at"]),
  projects: new Set(["id", "name", "data", "intake", "logo", "owner", "tier", "updated_at", "deleted_at"]),
  archive_items: new Set(["id", "project_id", "owner", "title", "content_type", "spokesperson", "status", "tags", "headline", "standfirst", "body_copy", "action_notes", "body", "selected_messages", "media_cats", "target_phrases", "target_phrase_ids", "pub_date", "released_at", "release_channel", "source", "created_at", "updated_at", "deleted_at"]),
  planner_items: new Set(["id", "project_id", "owner", "title", "content_type", "spokesperson", "key_message", "audience", "channels", "week", "status", "release_date", "notes", "headline", "standfirst", "body_copy", "action_notes", "source_archive_id", "body", "selected_messages", "media_cats", "pub_date", "target_phrases", "target_phrase_ids", "created_at", "updated_at", "deleted_at"]),
  scoring_configs: new Set(["owner", "config", "updated_at"]),
  saved_audits: new Set(["id", "project_id", "owner", "saved_at", "result", "deleted_at"]),
  saved_diagnostics: new Set(["id", "project_id", "owner", "saved_at", "result", "deleted_at"]),
  saved_content_geo: new Set(["id", "project_id", "owner", "saved_at", "result", "deleted_at"]),
  saved_tech_geo: new Set(["id", "project_id", "owner", "saved_at", "result", "deleted_at"]),
  project_snapshots: new Set(["id", "project_id", "name", "data", "intake", "logo", "owner", "reason", "created_at"]),
  audit_locks: new Set(["project_id", "audit_type", "owner", "last_run_at"]),
  // token_usage is diagnostic history, not an authentication token table.
  token_usage: new Set(["id", "account_id", "operation", "model", "input_tokens", "output_tokens", "cost_gbp_estimate", "project_id", "created_at"]),
};
export function rowFingerprint(value: unknown): string {
  const canonical = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonical);
    if (input instanceof Date) return input.toISOString();
    if (typeof input === "string" && (input.startsWith("{") || input.startsWith("["))) {
      try { return canonical(JSON.parse(input)); } catch { /* preserve ordinary text */ }
    }
    if (input && typeof input === "object") {
      return Object.keys(input as Record<string, unknown>).sort().reduce<Record<string, unknown>>((out, key) => {
        out[key] = canonical((input as Record<string, unknown>)[key]); return out;
      }, {});
    }
    return input;
  };
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
const REQUIRED_KEYS: Readonly<Record<string, readonly string[]>> = {
  platform_accounts: ["username"], platform_companies: ["id"], platform_memberships: ["user_id", "company_id"],
  projects: ["id"], archive_items: ["id"], planner_items: ["id"], scoring_configs: ["owner"],
  saved_audits: ["id"], saved_diagnostics: ["id"], saved_content_geo: ["id"], saved_tech_geo: ["id"],
  project_snapshots: ["id"], audit_locks: ["project_id", "audit_type"], token_usage: ["id"],
};

function endpoint(value: string): string {
  try {
    const u = new URL(value);
    if (!["postgres:", "postgresql:"].includes(u.protocol) || !u.hostname) throw new Error();
    const db = decodeURIComponent(u.pathname.replace(/^\/+|\/+$/g, ""));
    if (!db) throw new Error();
    return `${u.protocol}//${u.hostname.toLowerCase()}:${u.port || "5432"}/${db}`;
  } catch {
    throw new Error("Database endpoint is invalid.");
  }
}

function digest(manifest: ImportManifest): string {
  return computeManifestSha256(manifest as never);
}

export function validateImportManifest(manifest: ImportManifest): void {
  if (!manifest || manifest.external !== true || manifest.frozen !== true || manifest.reviewed !== true) {
    throw new Error("Manifest must be external, frozen and reviewed.");
  }
  if (!DIGEST.test(manifest.sha256) || digest(manifest) !== manifest.sha256) {
    throw new Error("Manifest digest does not match its contents.");
  }
  if (!manifest.sourceEndpoint || !manifest.destinationEndpoint) throw new Error("Manifest endpoints are required.");
  if (endpoint(manifest.sourceEndpoint) === endpoint(manifest.destinationEndpoint)) {
    throw new Error("Refusing source and destination with the same database identity.");
  }
  if (!Array.isArray(manifest.rows)) throw new Error("Manifest rows are required.");
  const keys = new Set<string>();
  for (const row of manifest.rows) {
    if (!ALLOWED_TABLES.has(row.table)) {
      throw new Error(`Manifest contains a forbidden table: ${row.table}.`);
    }
    if (!row.sourceKey || keys.has(`${row.table}:${row.sourceKey}`)) {
      throw new Error("Manifest contains duplicate source keys.");
    }
    keys.add(`${row.table}:${row.sourceKey}`);
    const columns = Object.keys(row.values);
    const allowed = ALLOWED_COLUMNS[row.table]!;
    if (!columns.length || columns.some((column) => {
      const ssoBridgePassword = row.table === "platform_accounts" && column === "password_hash" &&
        row.values[column] === "sso-only-no-password";
      return !IDENTIFIER.test(column) || !allowed.has(column) ||
        (!ssoBridgePassword && /(password|secret|session|verification|reset|google|microsoft|email)/i.test(column));
    })) {
      throw new Error("Manifest contains invalid columns.");
    }
    const required = REQUIRED_KEYS[row.table]!;
    if (row.conflictKeys.length !== required.length ||
        required.some((key, index) => row.conflictKeys[index] !== key) ||
        row.conflictKeys.some((key: string) => !columns.includes(key))) {
      throw new Error(`Manifest conflict keys do not match required key for ${row.table}.`);
    }
  }
  if (!manifest.expectedFingerprints?.source || !manifest.expectedFingerprints.destination) {
    throw new Error("Manifest schema and row fingerprints are required.");
  }
}

/**
 * Validate and optionally insert rows. The adapter must use a read-only
 * source connection; this function never receives or writes to one.
 */
export async function runSelectiveImport(options: ImportOptions): Promise<ImportReport> {
  validateImportManifest(options.manifest);
  const destination = endpoint(options.manifest.destinationEndpoint);
  if (options.sourceReadOnly === false) throw new Error("Source connection must be read-only.");
  const approval = options.destinationApproval;
  const applying = options.apply === true;
  if (applying && (!options.observedFingerprints ||
      JSON.stringify(options.observedFingerprints) !== JSON.stringify(options.manifest.expectedFingerprints))) {
    throw new Error("Source or destination fingerprint drift detected.");
  }
  if (applying) {
    if (!approval?.approved || approval.manifestSha256 !== options.manifest.sha256 ||
        endpoint(approval.destinationEndpoint) !== destination ||
        (approval.scratchOnly !== true && approval.liveOnly !== true)) {
      throw new Error("Apply requires exact manifest approval for an isolated scratch destination.");
    }
  }
  const result: string[] = [];
  let inserted = 0;
  let skipped = 0;
  if (!applying) {
    return { mode: "dry-run", inserted: 0, skipped: options.manifest.rows.length, rows: options.manifest.rows.map((r) => `${r.table}:${r.sourceKey}`) };
  }
  if (applying && typeof options.transaction.recordProvenance !== "function") {
    throw new Error("Atomic provenance support is required for apply.");
  }
  await options.transaction.begin();
  try {
    for (const row of options.manifest.rows) {
      const columns = Object.keys(row.values);
      const quoted = columns.map((column) => `"${column}"`).join(", ");
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
      const where = row.conflictKeys.map((column, i) => `"${column}" = $${i + 1}`).join(" AND ");
      const key = Object.fromEntries(row.conflictKeys.map((column) => [column, row.values[column]]));
      const prior = await options.transaction.findProvenance(options.manifest.sha256, row.table, row.sourceKey);
      if (prior) {
        const current = await options.transaction.query(`SELECT ${columns.map((column) => `"${column}"`).join(", ")} FROM "${row.table}" WHERE ${where} LIMIT 1`, row.conflictKeys.map((column) => row.values[column]));
        if (!current.rows.length || rowFingerprint(current.rows[0]) !== rowFingerprint(row.values) || prior.insertedFingerprint !== rowFingerprint(row.values)) {
          throw new Error("Idempotent retry refused: destination row changed or is missing.");
        }
        result.push(`${row.table}:${row.sourceKey}`);
        skipped++;
        continue;
      }
      const existing = await options.transaction.query(
        `SELECT 1 FROM "${row.table}" WHERE ${where} LIMIT 1`,
        row.conflictKeys.map((column) => row.values[column]),
      );
      if (existing.rows.length) throw new Error(`Insert collision in ${row.table}.`);
      await options.transaction.insertRow(row.table, row.values);
      await options.transaction.recordProvenance({
        manifestSha256: options.manifest.sha256, sourceKey: row.sourceKey,
        table: row.table, destinationEndpoint: destination, destinationKey: key,
        insertedFingerprint: rowFingerprint(row.values), insertedColumns: columns,
      });
      result.push(`${row.table}:${row.sourceKey}`);
      inserted++;
    }
    await options.transaction.commit();
     return { mode: "apply", inserted, skipped, rows: result };
  } catch (error) {
    await options.transaction.rollback().catch(() => undefined);
    throw error instanceof Error ? error : new Error("Selective import failed.");
  }
}

export function rollbackScope(records: readonly ProvenanceRecord[], manifestSha256: string): readonly ProvenanceRecord[] {
  if (!DIGEST.test(manifestSha256)) throw new Error("Rollback requires a valid manifest digest.");
  return records.filter((record) => record.manifestSha256 === manifestSha256);
}

export interface RollbackAdapter extends ImportTransaction {
  currentFingerprint(table: string, key: Readonly<Record<string, unknown>>): Promise<string | null>;
  hasExternalReferences(table: string, key: Readonly<Record<string, unknown>>): Promise<boolean>;
  deleteProvenanceRow(record: ProvenanceRecord): Promise<void>;
}

/** Returns reverse dependency order and refuses edited or externally referenced rows. */
export async function rollbackImported(
  adapter: RollbackAdapter,
  records: readonly ProvenanceRecord[],
  manifestSha256: string,
  expectedFingerprints: Readonly<Record<string, string>>,
): Promise<number> {
  if (!records.length || records.some((r) => r.manifestSha256 !== manifestSha256)) throw new Error("Rollback scope is invalid.");
  const rank: Readonly<Record<string, number>> = { platform_accounts: 1, platform_companies: 2, projects: 3, project_snapshots: 4, archive_items: 5, planner_items: 5, saved_audits: 5, saved_diagnostics: 5, saved_content_geo: 5, saved_tech_geo: 5, audit_locks: 6, token_usage: 6, platform_memberships: 7 };
  const selected = [...records].sort((a, b) => (rank[b.table] ?? 99) - (rank[a.table] ?? 99));
  await adapter.begin();
  try {
    for (const record of selected) {
      if (await adapter.hasExternalReferences(record.table, record.destinationKey)) throw new Error("Rollback refused: external references exist.");
      if (await adapter.currentFingerprint(record.table, record.destinationKey) !== expectedFingerprints[`${record.table}:${record.sourceKey}`]) {
        throw new Error("Rollback refused: imported row was edited.");
      }
      await adapter.deleteImportedRow(record.table, record.destinationKey);
      await adapter.deleteProvenanceRow(record);
    }
    await adapter.commit();
    return selected.length;
  } catch (error) {
    await adapter.rollback().catch(() => undefined);
    throw error;
  }
}

export function manifestDigest(manifest: ImportManifest): string {
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}