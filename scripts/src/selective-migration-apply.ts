/**
 * Guarded production apply entry point for Task 301.
 *
 * This command is intentionally dry-run by default.  A redacted review
 * artifact is evidence, not authority: application requires a replacement
 * exact manifest with reviewed=true, approved=true and applyAllowed=true,
 * plus an explicit --apply and a production endpoint identity check.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { chmodSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { endpointSha256, sameDatabaseEndpoint } from "./selective-backup.js";
import { runSelectiveImport, rollbackImported, rowFingerprint, type ImportManifest, type ImportRow, type ProvenanceRecord, type RollbackAdapter, type StoredProvenance } from "./selective-migration-import.js";

const HEX = /^[a-f0-9]{64}$/i;
const MIGRATION_TABLES = new Set([
  "platform_accounts", "platform_companies", "platform_memberships", "projects",
  "archive_items", "planner_items", "scoring_configs", "saved_audits",
  "saved_diagnostics", "saved_content_geo", "saved_tech_geo", "project_snapshots",
  "audit_locks", "token_usage",
]);
export const APPROVED_SOURCE_BUNDLE = ".local/selective-backups/beta-production-source-833971f7-0bb0-4ef1-9293-9d6fa976f0fe";
export const FRESH_DESTINATION_BUNDLE = ".local/selective-backups/published-staging-bridge-ca82825e-f913-4bd0-9623-20a743f896cb";
export const SUPERSEDED_DIGESTS = new Set([
  "4136adc8d25d281f0318749b1f95d21d0dc56f537de76cd04f30dd1b72a86d3a",
  "8f30fbad0280b6873b0f043c9c750809943ae69ba490a0c35182998d55d6c2f9",
  "d9e5902c4536545aa8a64abbca5f5ba3c6998924f693be93ec2376d00a5f0307",
  "f2e48f75df9b6128fa5167d29b04513f1a96bfd58deae4bc450f7b4020fd5eaa",
  "76b3b97de7ad0d35ad6971c4313fd79d67987e2e92764e20d2aa7bdb3c38d43e",
  "6a57048bbc2e8f34fb05c4aad35a0d95347c769ff3c34eff41a252db2013e063",
]);

export interface ApplyReview {
  reviewed: boolean; approved: boolean; applyAllowed: boolean;
  applicationDatabaseWritesAuthorized: boolean; manifestSha256: string;
  source: { clusterDatabaseSha256: string; schemaSha256: string; rowFingerprint: string };
  destination: { clusterDatabaseSha256: string; schemaSha256: string; rowFingerprint: string };
  schemaDrift?: { classification: string; supersedes?: string; projectSetUnchanged?: boolean };
  identitySets?: Record<string, { count: number; sha256: string }>;
  counts?: { firstImport: number };
  snapshotIdMap?: Record<string, number>;
  payloadDigest?: string;
}
export interface BundleEvidence {
  schemaVersion: 1; dumpFile: string; dumpSha256: string;
  endpointSha256: string;
  clusterDatabaseSha256: string; projectSetSha256: string; schemaSha256: string;
  tableCount: number; tables: Array<{ schema: string; table: string; rowCount: number; rowsSha256: string }>;
}
export interface ApplyGuardInput {
  sourceBundle: string; destinationBundle: string; reviewPath: string;
  approvedDigest: string; apply: boolean; rollback?: boolean; productionUrl?: string; betaUrl?: string;
}
function redactedEndpoint(value: string): string {
  const url = new URL(value);
  const database = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, ""));
  return `${url.protocol}//${url.hostname.toLowerCase()}:${url.port || "5432"}/${database}`;
}
export interface ProductionApplyClient {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number }>;
}
interface LiveClient extends ProductionApplyClient { connect(): Promise<void>; end(): Promise<void>; }
const require = createRequire(import.meta.url);
const { Client } = require("pg") as { Client: new (config: Record<string, unknown>) => LiveClient };

function privateFile(path: string): string {
  const full = resolve(path), root = resolve(".local", "selective-backups");
  if (!full.startsWith(`${root}/`)) throw new Error("Apply bundles must be inside .local/selective-backups.");
  const stat = lstatSync(full);
  if (!stat.isFile() || (stat.mode & 0o777) !== 0o600) throw new Error("Apply inputs must be regular mode-0600 files.");
  return full;
}
function privateReviewFile(path: string): string {
  const full = resolve(path), root = resolve(".local", "migration", "restricted");
  if (!full.startsWith(`${root}/`)) throw new Error("Review evidence must be inside .local/migration/restricted.");
  const stat = lstatSync(full);
  if (!stat.isFile() || (stat.mode & 0o777) !== 0o600) throw new Error("Review evidence must be a regular mode-0600 file.");
  return full;
}
function sha256(path: string): string { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function bundle(path: string): BundleEvidence {
  const manifestPath = privateFile(join(path, "manifest.json"));
  const evidence = JSON.parse(readFileSync(manifestPath, "utf8")) as BundleEvidence;
  if (evidence.schemaVersion !== 1 || !HEX.test(evidence.dumpSha256) || !evidence.dumpFile || evidence.dumpFile.includes("/") || evidence.dumpFile.includes("\\")) {
    throw new Error("Backup manifest is invalid.");
  }
  const dump = privateFile(join(path, evidence.dumpFile));
  if (sha256(dump) !== evidence.dumpSha256.toLowerCase()) throw new Error("Backup dump checksum does not match its manifest.");
  return evidence;
}
function review(path: string): ApplyReview {
  const value = JSON.parse(readFileSync(privateReviewFile(path), "utf8")) as ApplyReview;
  if (!HEX.test(value.manifestSha256) || !value.source || !value.destination) throw new Error("Replacement review evidence is invalid.");
  return value;
}
function digestTables(evidence: BundleEvidence): string {
  return createHash("sha256").update(JSON.stringify(evidence.tables.map((t) => ({
    schema: t.schema, table: t.table, rowCount: t.rowCount, rowsSha256: t.rowsSha256,
  })).sort((a, b) => `${a.schema}.${a.table}`.localeCompare(`${b.schema}.${b.table}`)))).digest("hex");
}
function protectedTablesDigest(evidence: BundleEvidence): string {
  return createHash("sha256").update(JSON.stringify(evidence.tables
    .filter((table) => table.schema === "public" && MIGRATION_TABLES.has(table.table))
    .map((table) => ({
      schema: table.schema, table: table.table, rowCount: table.rowCount, rowsSha256: table.rowsSha256,
    }))
    .sort((a, b) => `${a.schema}.${a.table}`.localeCompare(`${b.schema}.${b.table}`)))).digest("hex");
}

/** Validates all non-secret gates without connecting to any database. */
export function validateApplyInputs(input: ApplyGuardInput): { source: BundleEvidence; destination: BundleEvidence; review: ApplyReview } {
  if (input.sourceBundle !== APPROVED_SOURCE_BUNDLE || input.destinationBundle !== FRESH_DESTINATION_BUNDLE) {
    throw new Error("Apply requires the approved beta bundle and the fresh pre-import staging bundle.");
  }
  const source = bundle(input.sourceBundle), destination = bundle(input.destinationBundle), evidence = review(input.reviewPath);
  if (input.approvedDigest !== evidence.manifestSha256) throw new Error("Approved digest does not match replacement review evidence.");
  if (SUPERSEDED_DIGESTS.has(evidence.manifestSha256)) throw new Error("The prior manifest approval is superseded by fresh staging drift.");
  if (evidence.source.clusterDatabaseSha256 !== source.clusterDatabaseSha256 ||
      evidence.destination.clusterDatabaseSha256 !== destination.clusterDatabaseSha256 ||
      evidence.source.schemaSha256 !== source.schemaSha256 ||
      evidence.destination.schemaSha256 !== destination.schemaSha256 ||
      evidence.source.rowFingerprint !== digestTables(source) ||
      evidence.destination.rowFingerprint !== digestTables(destination)) {
    throw new Error("Replacement review evidence does not match the exact backup bundles.");
  }
  if (!evidence.schemaDrift ||
      !["additive-compatible-review-required", "destination-data-and-project-set-drift-review-required"].includes(evidence.schemaDrift.classification)) {
    throw new Error("Destination drift requires explicit replacement review.");
  }
  if (!input.apply) return { source, destination, review: evidence };
  if (!evidence.reviewed || !evidence.approved || !evidence.applyAllowed || !evidence.applicationDatabaseWritesAuthorized) {
    throw new Error("Apply requires explicit reviewed approval and application-write authorization.");
  }
  if (!input.productionUrl) throw new Error("PRODUCTION_DATABASE_URL is required for apply.");
  if (sameDatabaseEndpoint(input.productionUrl, input.betaUrl ?? "")) {
    throw new Error("Production destination must not be the beta database.");
  }
  if (endpointSha256(input.productionUrl) !== destination.endpointSha256) throw new Error("Production endpoint does not match the fresh staging backup identity.");
  return { source, destination, review: evidence };
}

const PROJECTS = [
  "proj-1787645971188-zqr4l", "proj-1788507119679-fobpa", "proj-1789125605485-0q0f5",
  "proj-1789373392351-welar", "gen-bluhalo-u8qk", "proj-1788342504731-oqxln",
  "proj-1787304772283-gi5e9", "proj-1786696056540-lvuzt", "proj-1784206557757-gh9mi",
  "proj-1788342956731-nnryn", "proj-1785746011456-3cpla", "proj-1788948448319-vsooc",
  "proj-1781529868302-n8va2", "proj-1788785183865-4287h", "proj-1787225051953-kp3gf",
] as const;
const OWNER: Record<string, string> = { admin: "admin", aiodemo: "aiodemo" };
const COMPANY: Record<string, string> = {
  bluhalo: "a6f656d2-5e90-5b5a-bfc3-688e0512fbbf",
  natalie1990: "193d2146-c773-5a6b-80d2-8af0ffe89975",
};
const NATALIE = "96a03862-7724-4f1a-8bef-40232276bc2e";
const APPROVED_NATALIE_USER_SHA256 = "c1bbf18ce22ee07cd89db26f56b647be32f832b712f3119083b0cbd3ac4ec9b9";
const TABLES = ["projects", "archive_items", "planner_items", "saved_audits", "saved_diagnostics",
  "saved_content_geo", "saved_tech_geo", "project_snapshots", "audit_locks", "token_usage"] as const;
const QUOTE = (value: string) => `"${value.replaceAll('"', '""')}"`;
const tool = (name: string, args: string[], env: NodeJS.ProcessEnv): void => {
  const result = spawnSync(name, args, { env, encoding: "utf8", stdio: ["ignore", "ignore", "pipe"] });
  if (result.error || result.status !== 0) throw new Error(`${name} failed; private diagnostics discarded.`);
};
function sourceCluster(dump: string): { root: string; socket: string; data: string; client: LiveClient } {
  const root = mkdtempSync(join(tmpdir(), "sma-")); chmodSync(root, 0o700);
  const socket = join(root, "socket"), data = join(root, "data"); mkdirSync(socket, { mode: 0o700 });
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, PGHOST: socket, PGPORT: "5432", PGDATABASE: "rehearsal", PGUSER: "selective_apply", PSQLRC: "/dev/null" };
  tool("initdb", ["--no-locale", "--encoding=UTF8", "--username=selective_apply", "-D", data], env);
  tool("pg_ctl", ["-D", data, "-o", `-c listen_addresses='' -c unix_socket_directories='${socket}'`, "-w", "start"], env);
  tool("createdb", ["--maintenance-db=postgres", "rehearsal"], env);
  tool("pg_restore", ["--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges", "--dbname=rehearsal", dump], env);
  const client = new Client({ host: socket, port: 5432, database: "rehearsal", user: "selective_apply", options: "-c default_transaction_read_only=on -c statement_timeout=120000 -c timezone=UTC", connectionTimeoutMillis: 15000 });
  return { root, socket, data, client };
}
async function stopSource(cluster: { root: string; data: string; client: LiveClient }): Promise<void> {
  await cluster.client.end().catch(() => undefined);
  try { tool("pg_ctl", ["-D", cluster.data, "-w", "stop", "-m", "fast"], { PATH: process.env.PATH, HOME: process.env.HOME }); }
  finally { rmSync(cluster.root, { recursive: true, force: true }); }
}
async function cols(client: ProductionApplyClient, table: string): Promise<Set<string>> {
  const result = await client.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [table]);
  return new Set(result.rows.map((r) => r.column_name));
}
async function sourceRows(client: ProductionApplyClient, table: string): Promise<Record<string, unknown>[]> {
  const columns = await cols(client, table); if (!columns.size) return [];
  const selected = [...columns].map(QUOTE).join(", ");
  const hasProject = columns.has("project_id");
  const result = hasProject
    ? await client.query<Record<string, unknown>>(`SELECT ${selected} FROM ${QUOTE(table)} WHERE project_id = ANY($1::text[])`, [PROJECTS])
    : await client.query<Record<string, unknown>>(`SELECT ${selected} FROM ${QUOTE(table)}`);
  return result.rows;
}
const ALLOWED: Record<string, readonly string[]> = {
  platform_accounts: ["username", "password_hash", "role", "parent", "max_seats", "created_at", "status"],
  platform_companies: ["id", "slug", "role", "parent_slug", "max_seats", "free_access", "status", "setup_complete", "created_at", "beta_trial_started_at", "beta_trial_ends_at"],
  platform_memberships: ["user_id", "company_id", "company_slug", "role", "project_access", "created_at"],
  projects: ["id", "name", "data", "intake", "logo", "owner", "tier", "updated_at", "deleted_at"],
  archive_items: ["id", "project_id", "owner", "title", "content_type", "spokesperson", "status", "tags", "headline", "standfirst", "body_copy", "action_notes", "body", "selected_messages", "media_cats", "target_phrases", "target_phrase_ids", "pub_date", "released_at", "release_channel", "source", "created_at", "updated_at", "deleted_at"],
  planner_items: ["id", "project_id", "owner", "title", "content_type", "spokesperson", "key_message", "audience", "channels", "week", "status", "release_date", "notes", "headline", "standfirst", "body_copy", "action_notes", "source_archive_id", "body", "selected_messages", "media_cats", "pub_date", "target_phrases", "target_phrase_ids", "created_at", "updated_at", "deleted_at"],
  saved_audits: ["id", "project_id", "owner", "saved_at", "result", "deleted_at"], saved_diagnostics: ["id", "project_id", "owner", "saved_at", "result", "deleted_at"],
  saved_content_geo: ["id", "project_id", "owner", "saved_at", "result", "deleted_at"], saved_tech_geo: ["id", "project_id", "owner", "saved_at", "result", "deleted_at"],
  project_snapshots: ["id", "project_id", "name", "data", "intake", "logo", "owner", "reason", "created_at"],
  audit_locks: ["project_id", "audit_type", "owner", "last_run_at"], token_usage: ["id", "account_id", "operation", "model", "input_tokens", "output_tokens", "cost_gbp_estimate", "project_id", "created_at"],
};
function mapped(table: string, row: Record<string, unknown>, snapshots: Map<number, number>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of ALLOWED[table] ?? []) if (key in row) result[key] = row[key];
  for (const key of ["data", "intake", "tags", "selected_messages", "media_cats", "target_phrases", "target_phrase_ids", "channels", "result"]) {
    if (typeof result[key] === "string") { try { result[key] = JSON.stringify(JSON.parse(result[key] as string)); } catch { throw new Error("Invalid embedded JSON in approved source."); } }
    else if (result[key] !== null && result[key] !== undefined && typeof result[key] === "object") result[key] = JSON.stringify(result[key]);
  }
  if (typeof result.owner === "string") result.owner = OWNER[result.owner] ?? result.owner;
  if (typeof result.project_id === "string" && !PROJECTS.includes(result.project_id as never)) throw new Error("Unexpected project dependency in approved source.");
  if (table === "token_usage" && typeof result.account_id === "string") result.account_id = OWNER[result.account_id] ?? result.account_id;
  if (table === "project_snapshots" && typeof result.id === "number") result.id = snapshots.get(result.id) ?? result.id;
  return result;
}
function importKey(table: string, row: Record<string, unknown>): { sourceKey: string; conflictKeys: string[] } {
  if (table === "platform_memberships") return { sourceKey: `${row.user_id}:${row.company_id}`, conflictKeys: ["user_id", "company_id"] };
  if (table === "audit_locks") return { sourceKey: `${row.project_id}:${row.audit_type}`, conflictKeys: ["project_id", "audit_type"] };
  if (table === "platform_accounts") return { sourceKey: `${table}:${String(row.username)}`, conflictKeys: ["username"] };
  return { sourceKey: `${table}:${String(row.id)}`, conflictKeys: ["id"] };
}
function identityEvidence(rows: readonly ImportRow[]): Record<string, { count: number; sha256: string }> {
  const result: Record<string, { count: number; sha256: string }> = {};
  for (const table of [...new Set(rows.map((row) => row.table))]) {
    const identities = rows.filter((row) => row.table === table).map((row) => ({
      sourceKey: row.sourceKey, conflictKeys: row.conflictKeys,
      destinationKey: Object.fromEntries(row.conflictKeys.map((key) => [key, row.values[key]])),
    }));
    result[table] = { count: identities.length, sha256: createHash("sha256").update(JSON.stringify(identities)).digest("hex") };
  }
  return result;
}
function payloadDigest(rows: readonly ImportRow[]): string {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}
function isEmptyProjectAccess(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value !== "string") return false;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.length === 0;
  } catch {
    return false;
  }
}
async function compileRows(source: ProductionApplyClient, destination: ProductionApplyClient, startedAt: string, endsAt: string, includeTrial = false, approvedSnapshotIdMap?: Record<string, number>): Promise<ImportRow[]> {
  const projects = await source.query<Record<string, unknown>>("SELECT * FROM projects WHERE id = ANY($1::text[]) ORDER BY id", [PROJECTS]);
  if (projects.rows.length !== 15) throw new Error("Approved source project selection drifted.");
  const targetIds = new Set((await destination.query<{ id: number }>("SELECT id FROM project_snapshots")).rows.map((r) => r.id));
  const sourceSnapshots = await sourceRows(source, "project_snapshots"), snapshots = new Map<number, number>();
  for (const row of sourceSnapshots) if (typeof row.id === "number") {
    const approved = approvedSnapshotIdMap?.[String(row.id)];
    if (approvedSnapshotIdMap && approved === undefined) throw new Error("Approved snapshot ID map is incomplete.");
    snapshots.set(row.id, approved ?? (targetIds.has(row.id) ? 1000000000 + row.id : row.id));
  }
  const rows: ImportRow[] = [];
  const add = (table: string, sourceRowsValue: Record<string, unknown>[]) => {
    for (const original of sourceRowsValue) {
      const values = mapped(table, original, snapshots); if (!Object.keys(values).length) continue;
      const key = importKey(table, values); rows.push({ table, values, sourceKey: `${table}:${key.sourceKey}`, conflictKeys: key.conflictKeys });
    }
  };
  add("projects", projects.rows);
  for (const table of TABLES) if (table !== "projects") add(table, await sourceRows(source, table));
  add("platform_accounts", [{
    username: "natalie1990", password_hash: "sso-only-no-password", role: "agency",
    parent: "admin", max_seats: 1, created_at: "2026-09-17T18:00:00.000Z", status: "active",
  }]);
  const companyColumns = await cols(source, "platform_companies");
  const companySelect = ["slug", "role", "parent_slug", "max_seats", "free_access", "status", "setup_complete", "created_at"]
    .filter((name) => companyColumns.has(name)).map(QUOTE).join(", ");
  const companies = await source.query<Record<string, unknown>>(
    `SELECT ${companySelect} FROM platform_companies WHERE slug='natalie1990'`,
  );
  for (const slug of ["natalie1990"]) {
    const row = companies.rows.find((candidate) => candidate.slug === slug) ?? { slug, role: "agency", parent_slug: "admin", max_seats: 1, free_access: true, status: "active", setup_complete: false, created_at: "2026-09-17T18:00:00.000Z" };
    // Trial timestamps are applied separately inside the same transaction so
    // the exact manifest remains deterministic and retries can verify only the
    // imported source fields.
    const values = { ...row, id: COMPANY[slug]!, slug, parent_slug: "admin",
      ...(includeTrial ? { beta_trial_started_at: startedAt, beta_trial_ends_at: endsAt } : {}) };
    add("platform_companies", [values]);
  }
  rows.push({ table: "platform_memberships", sourceKey: "natalie1990:owner", conflictKeys: ["user_id", "company_id"], values: { user_id: NATALIE, company_id: COMPANY.natalie1990, company_slug: "natalie1990", role: "owner", project_access: "[]", created_at: "2026-09-17T18:00:00.000Z" } });
  return rows;
}

async function databaseFingerprint(client: ProductionApplyClient): Promise<string> {
  const tables = await client.query<{ schema_name: string; table_name: string }>(
    "SELECT table_schema AS schema_name, table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1::text[]) ORDER BY table_schema,table_name",
    [[...MIGRATION_TABLES]],
  );
  const values: Array<{ schema: string; table: string; rowCount: number; rowsSha256: string }> = [];
  for (const table of tables.rows) {
    const schema = QUOTE(table.schema_name), name = QUOTE(table.table_name);
    const rows = await client.query<{ row_json: string }>(`SELECT to_jsonb(t)::text AS row_json FROM ${schema}.${name} t`);
    const hashes = rows.rows.map((row) => createHash("sha256").update(row.row_json).digest("hex")).sort();
    values.push({ schema: table.schema_name, table: table.table_name, rowCount: rows.rows.length, rowsSha256: createHash("sha256").update(hashes.join("\n")).digest("hex") });
  }
  values.sort((a, b) => `${a.schema}.${a.table}`.localeCompare(`${b.schema}.${b.table}`));
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}
async function schemaFingerprint(client: ProductionApplyClient): Promise<string> {
  const rows = await client.query<Record<string, unknown>>(`SELECT table_schema,table_name,ordinal_position,column_name,data_type,udt_name,
    is_nullable,COALESCE(column_default,'') AS column_default FROM information_schema.columns
    WHERE table_schema IN ('public','_system','stripe') ORDER BY 1,2,3`);
  return createHash("sha256").update(rows.rows.map((row) => Object.values(row).join("\t")).join("\n")).digest("hex");
}
async function preExistingFingerprint(client: ProductionApplyClient, imported: readonly ImportRow[]): Promise<string> {
  const tables = await client.query<{ schema_name: string; table_name: string }>(
    "SELECT table_schema AS schema_name, table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1::text[]) ORDER BY table_schema,table_name",
    [[...MIGRATION_TABLES]],
  );
  const values: Array<{ schema: string; table: string; rowCount: number; rowsSha256: string }> = [];
  for (const table of tables.rows) {
    const result = await client.query<{ row_json: Record<string, unknown> }>(`SELECT to_jsonb(t) AS row_json FROM ${QUOTE(table.schema_name)}.${QUOTE(table.table_name)} t`);
    const kept = result.rows.map((row) => row.row_json).filter((value) => {
      if (table.schema_name === "public" && table.table_name === "platform_meta" && value.key === undefined) return true;
      if (table.schema_name === "public" && table.table_name === "platform_meta" && typeof value.key === "string" && value.key.startsWith("migration:selective:")) return false;
      return !imported.some((candidate) => candidate.table === table.table_name &&
        candidate.conflictKeys.every((key) => String(value[key]) === String(candidate.values[key])));
    }).map((value) => {
      if (table.schema_name === "public" && table.table_name === "platform_companies" && value.slug === "aiodemo") {
        return { ...value, beta_trial_started_at: null, beta_trial_ends_at: null };
      }
      return value;
    });
    const hashes = kept.map((row) => createHash("sha256").update(JSON.stringify(row)).digest("hex")).sort();
    values.push({ schema: table.schema_name, table: table.table_name, rowCount: kept.length, rowsSha256: createHash("sha256").update(hashes.join("\n")).digest("hex") });
  }
  values.sort((a, b) => `${a.schema}.${a.table}`.localeCompare(`${b.schema}.${b.table}`));
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}
function pgConfig(urlValue: string): Record<string, unknown> {
  const url = new URL(urlValue);
  return {
    host: url.hostname, port: Number(url.port || 5432),
    database: decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, "")),
    user: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    ssl: url.searchParams.get("sslmode") && url.searchParams.get("sslmode") !== "disable" ? {} : undefined,
    options: "-c statement_timeout=120000 -c lock_timeout=15000 -c timezone=UTC",
    connectionTimeoutMillis: 15000,
  };
}
async function verifyPostCommit(urlValue: string, start: string, end: string, imported: readonly ImportRow[], expectedPreExisting: string): Promise<void> {
  const check = new Client(pgConfig(urlValue));
  try {
    await check.connect();
    await check.query("SET default_transaction_read_only=on");
    const projects = await check.query<{ count: string }>("SELECT count(*)::text AS count FROM projects WHERE id = ANY($1::text[])", [PROJECTS]);
    if (Number(projects.rows[0]?.count) !== PROJECTS.length) throw new Error("Post-commit selected project count verification failed.");
    const trials = await check.query<{ slug: string; beta_trial_started_at: string; beta_trial_ends_at: string }>("SELECT slug,beta_trial_started_at,beta_trial_ends_at FROM platform_companies WHERE slug IN ('aiodemo','natalie1990')");
    if (trials.rows.length !== 2 || trials.rows.some((row) => new Date(row.beta_trial_started_at).toISOString() !== start || new Date(row.beta_trial_ends_at).toISOString() !== end)) throw new Error("Post-commit trial verification failed.");
    const bluhalo = await check.query<{ count: string }>("SELECT count(*)::text AS count FROM platform_memberships WHERE company_id=$1 OR company_slug='beta-bluhalo'", [COMPANY.bluhalo]);
    if (Number(bluhalo.rows[0]?.count) !== 0) throw new Error("Post-commit Bluhalo access verification failed.");
    const account = await check.query<{ count: string }>("SELECT count(*)::text AS count FROM platform_accounts WHERE username='beta-bluhalo'");
    if (Number(account.rows[0]?.count) !== 0) throw new Error("Post-commit Bluhalo credential verification failed.");
    const company = await check.query<{ count: string }>("SELECT count(*)::text AS count FROM platform_companies WHERE slug='beta-bluhalo' OR id=$1", [COMPANY.bluhalo]);
    if (Number(company.rows[0]?.count) !== 0) throw new Error("Post-commit Bluhalo workspace omission verification failed.");
    const natalie = await check.query<{ project_access: unknown }>("SELECT project_access FROM platform_memberships WHERE user_id=$1 AND company_id=$2", [NATALIE, COMPANY.natalie1990]);
    if (natalie.rows.length !== 1 || !isEmptyProjectAccess(natalie.rows[0]!.project_access)) throw new Error("Post-commit Natalie scope verification failed.");
    const natalieAccount = await check.query<{ password_hash: string; status: string }>("SELECT password_hash,status FROM platform_accounts WHERE username='natalie1990'");
    if (natalieAccount.rows.length !== 1 || natalieAccount.rows[0]!.password_hash !== "sso-only-no-password" || natalieAccount.rows[0]!.status !== "active") {
      throw new Error("Post-commit Natalie SSO bridge verification failed.");
    }
    const natalieUser = await check.query<{ row_json: Record<string, unknown> }>("SELECT to_jsonb(u) AS row_json FROM platform_users u WHERE id=$1", [NATALIE]);
    if (natalieUser.rows.length !== 1 ||
        createHash("sha256").update(JSON.stringify(natalieUser.rows[0]!.row_json)).digest("hex") !== APPROVED_NATALIE_USER_SHA256) {
      throw new Error("Post-commit Natalie Google identity fingerprint changed.");
    }
    for (const row of imported) {
      const columns = Object.keys(row.values);
      const where = row.conflictKeys.map((column, index) => `${QUOTE(column)}=$${index + 1}`).join(" AND ");
      const current = await check.query(
        `SELECT ${columns.map(QUOTE).join(",")} FROM ${QUOTE(row.table)} WHERE ${where} LIMIT 1`,
        row.conflictKeys.map((column) => row.values[column]),
      );
      if (!current.rows.length || rowFingerprint(current.rows[0]) !== rowFingerprint(row.values)) {
        throw new Error("Post-commit imported row fingerprint verification failed.");
      }
    }
    if (await preExistingFingerprint(check, imported) !== expectedPreExisting) throw new Error("Post-commit pre-existing destination fingerprint changed.");
  } finally { await check.end().catch(() => undefined); }
}
function liveAdapter(client: LiveClient, manifestSha: string, destinationEndpoint: string): RollbackAdapter & { finalCommit(): Promise<void>; records: ProvenanceRecord[]; setEntitlement(value: Record<string, unknown>): void } {
  const records: ProvenanceRecord[] = [], payload: StoredProvenance[] = [];
  const valuesByKey = new Map<string, Readonly<Record<string, unknown>>>();
  let entitlement: Record<string, unknown> = {};
  let active = false, provenanceWritten = false, provenanceDeleted = false;
  const key = `migration:selective:${manifestSha}`;
  const keyFor = (table: string, values: Readonly<Record<string, unknown>>) => Object.fromEntries(
    (table === "platform_memberships" ? ["user_id", "company_id"] : table === "audit_locks" ? ["project_id", "audit_type"] : [table === "platform_accounts" ? "username" : "id"]).map((name) => [name, values[name]]),
  );
  return {
    records,
    query: (sql, params) => client.query(sql, params),
    begin: async () => {
      if (active) return;
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      await client.query("SET LOCAL statement_timeout='120s'; SET LOCAL lock_timeout='15s'");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('task-301-selective-migration', 0))");
      active = true;
    },
    commit: async () => {
      if (provenanceWritten || !records.length || !Object.keys(entitlement).length) return;
      if (provenanceDeleted) return;
      const value = JSON.stringify({ manifestSha, destinationEndpoint, ...entitlement, records: records.map((record) => ({
        table: record.table, sourceKey: record.sourceKey, destinationKey: record.destinationKey, insertedFingerprint: record.insertedFingerprint, insertedColumns: record.insertedColumns,
      })) });
      if (Buffer.byteLength(value, "utf8") > 5_000_000) throw new Error("Migration provenance exceeds the reviewed metadata limit.");
      await client.query("INSERT INTO platform_meta (key,value) VALUES ($1,$2)", [key, value]);
      provenanceWritten = true;
    },
    finalCommit: async () => { await client.query("COMMIT"); active = false; },
    setEntitlement: (value) => { entitlement = { ...value }; },
    rollback: async () => { await client.query("ROLLBACK").catch(() => undefined); active = false; },
    insertRow: async (table, values) => {
      const columns = Object.keys(values);
      if (!columns.length || columns.some((column) => !/^[a-z_][a-z0-9_]*$/.test(column))) throw new Error("Unsafe import column.");
      await client.query(`INSERT INTO ${QUOTE(table)} (${columns.map(QUOTE).join(",")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")})`, columns.map((column) => values[column]));
      valuesByKey.set(`${table}:${JSON.stringify(keyFor(table, values))}`, { ...values });
    },
    recordProvenance: async (record) => { records.push(record); payload.push(record); },
    findProvenance: async (digest, table, sourceKey) => {
      const found = await client.query<{ value: string }>("SELECT value FROM platform_meta WHERE key=$1", [`migration:selective:${digest}`]);
      if (!found.rows.length) return null;
      const stored = JSON.parse(found.rows[0]!.value) as { records?: StoredProvenance[] };
      return stored.records?.find((record) => record.table === table && record.sourceKey === sourceKey) ?? null;
    },
    deleteImportedRow: async (table, destinationKey) => {
      const columns = Object.keys(destinationKey);
      await client.query(`DELETE FROM ${QUOTE(table)} WHERE ${columns.map((column, index) => `${QUOTE(column)}=$${index + 1}`).join(" AND ")}`, columns.map((column) => destinationKey[column]));
    },
    currentFingerprint: async (table, destinationKey) => {
      const record = records.find((candidate) => candidate.table === table && JSON.stringify(candidate.destinationKey) === JSON.stringify(destinationKey));
      if (!record) return null;
      const columns = record?.insertedColumns ?? Object.keys(valuesByKey.get(`${table}:${JSON.stringify(destinationKey)}`) ?? destinationKey);
      const found = await client.query(`SELECT ${columns.map(QUOTE).join(",")} FROM ${QUOTE(table)} WHERE ${Object.keys(destinationKey).map((column, index) => `${QUOTE(column)}=$${index + 1}`).join(" AND ")} LIMIT 1`, Object.keys(destinationKey).map((column) => destinationKey[column]));
      return found.rows.length ? rowFingerprint(found.rows[0]) : null;
    },
    hasExternalReferences: async (table, destinationKey) => {
      if (table === "projects") {
        const found = await client.query<{ count: string }>("SELECT ((SELECT count(*) FROM archive_items WHERE project_id=$1)+(SELECT count(*) FROM planner_items WHERE project_id=$1)+(SELECT count(*) FROM project_snapshots WHERE project_id=$1)+(SELECT count(*) FROM saved_audits WHERE project_id=$1)+(SELECT count(*) FROM saved_diagnostics WHERE project_id=$1)+(SELECT count(*) FROM audit_locks WHERE project_id=$1)+(SELECT count(*) FROM token_usage WHERE project_id=$1))::text AS count", [destinationKey.id]);
        return Number(found.rows[0]?.count ?? 0) > 0;
      }
      if (table === "platform_companies") {
        const found = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM platform_memberships WHERE company_id=$1", [destinationKey.id]);
        return Number(found.rows[0]?.count ?? 0) > 0;
      }
      return false;
    },
    deleteProvenanceRow: async () => {
      await client.query("DELETE FROM platform_meta WHERE key=$1", [key]);
      provenanceDeleted = true; provenanceWritten = true;
    },
  };
}

/** Apply the approved exact source snapshot to staging, never to beta. */
export async function applyExactManifest(input: ApplyGuardInput): Promise<Record<string, unknown>> {
  const guarded = validateApplyInputs({ ...input, apply: true });
  const sourceBundle = bundle(input.sourceBundle), cluster = sourceCluster(privateFile(join(input.sourceBundle, sourceBundle.dumpFile)));
  const destination = new Client(pgConfig(input.productionUrl!));
  let adapter: (RollbackAdapter & { finalCommit(): Promise<void>; records: ProvenanceRecord[]; setEntitlement(value: Record<string, unknown>): void }) | undefined;
  let committed = false;
  try {
    await cluster.client.connect();
    await cluster.client.query("SET default_transaction_read_only=on");
    if (await schemaFingerprint(cluster.client) !== sourceBundle.schemaSha256) throw new Error("Approved source schema fingerprint drifted.");
    await destination.connect();
    const rehearsalStart = "2026-09-17T18:00:00.000Z", rehearsalEnd = "2026-11-16T18:00:00.000Z";
    const approvedRows = await compileRows(cluster.client, destination, rehearsalStart, rehearsalEnd, true, guarded.review.snapshotIdMap);
    const rows = approvedRows.map((row) => {
      if (row.table !== "platform_companies" || String(row.values.id) !== COMPANY.natalie1990) return row;
      return { ...row, values: { ...row.values, beta_trial_started_at: undefined, beta_trial_ends_at: undefined } };
    });
    // Undefined fields are omitted from the live payload; the two new
    // workspace trial values are applied by the guarded transaction below.
    for (const row of rows) if (row.table === "platform_companies") {
      const values = Object.fromEntries(Object.entries(row.values).filter(([, value]) => value !== undefined));
      Object.assign(row, { values });
    }
    if (rows.length !== 826) throw new Error("Approved source compiled to an unexpected row count.");
    if (guarded.review.counts?.firstImport !== undefined && guarded.review.counts.firstImport !== rows.length) throw new Error("Compiled row count does not match approved review.");
    if (guarded.review.identitySets) {
      const actualTables = new Set(rows.map((row) => row.table));
      for (const [table, expected] of Object.entries(guarded.review.identitySets)) {
        const identities = rows.filter((row) => row.table === table).map((row) => ({
          sourceKey: row.sourceKey,
          conflictKeys: row.conflictKeys,
          destinationKey: Object.fromEntries(row.conflictKeys.map((key) => [key, row.values[key]])),
        }));
        const actual = {
          count: identities.length,
          sha256: createHash("sha256").update(JSON.stringify(identities)).digest("hex"),
        };
        if (actual.count !== expected.count || actual.sha256 !== expected.sha256) {
          throw new Error(`Compiled identity set does not match approved review for ${table}.`);
        }
        actualTables.delete(table);
      }
      if (actualTables.size) throw new Error("Compiled rows contain a table absent from the approved review.");
    }
    const { computeManifestSha256 } = await import("./selective-migration-readiness.js");
    const approvedTemplate = {
      external: true as const, frozen: true as const, reviewed: true as const, sha256: "",
      sourceEndpoint: "postgres://scratch-source/rehearsal", destinationEndpoint: "postgres://scratch-destination/rehearsal",
      rows: approvedRows, expectedFingerprints: {
        source: { schema: sourceBundle.schemaSha256, rows: digestTables(sourceBundle) },
        destination: { schema: guarded.destination.schemaSha256, rows: digestTables(guarded.destination) },
      },
    } as ImportManifest;
    approvedTemplate.sha256 = computeManifestSha256(approvedTemplate as never);
    if (approvedTemplate.sha256 !== input.approvedDigest) throw new Error("Compiled static rehearsal template does not match the approved digest.");
    console.log("Approved source payload and snapshot mapping verified.");
    const manifest = {
      external: true as const, frozen: true as const, reviewed: true as const, sha256: "",
      sourceEndpoint: "postgres://approved-source-bundle/rehearsal", destinationEndpoint: redactedEndpoint(input.productionUrl!),
      rows, expectedFingerprints: {
        source: { schema: sourceBundle.schemaSha256, rows: digestTables(sourceBundle) },
        destination: { schema: guarded.destination.schemaSha256, rows: digestTables(guarded.destination) },
      },
    } as ImportManifest;
    manifest.sha256 = computeManifestSha256(manifest as never);
    adapter = liveAdapter(destination, manifest.sha256, redactedEndpoint(input.productionUrl!));
    await adapter.begin();
    const started = await destination.query<{ started: string }>("SELECT transaction_timestamp()::text AS started");
    const start = new Date(started.rows[0]!.started).toISOString(), end = new Date(Date.parse(start) + 60 * 86400000).toISOString();
    const priorProvenance = await destination.query<{ value: string }>("SELECT value FROM platform_meta WHERE key=$1", [`migration:selective:${manifest.sha256}`]);
    if (priorProvenance.rows.length) {
      const priorReport = JSON.parse(readFileSync(privateReviewFile(".local/migration/restricted/import-report.json"), "utf8")) as {
        derivedManifestSha256?: string; preExistingFingerprint?: string; transactionStartedAt?: string;
        transactionEndsAt?: string; livePayloadDigest?: string;
      };
      const stored = JSON.parse(priorProvenance.rows[0]!.value) as {
        records?: StoredProvenance[]; appliedStart?: string; appliedEnd?: string;
        priorAiodemoStartedAt?: string | null; priorAiodemoEndsAt?: string | null;
        livePayloadDigest?: string; [key: string]: unknown;
      };
      if (stored.records?.length !== rows.length) throw new Error("Stored selective provenance row set is incomplete.");
      let repairProvenance = false;
      if (!stored.appliedStart || !stored.appliedEnd) {
        if (priorReport.derivedManifestSha256 !== manifest.sha256 ||
            !priorReport.transactionStartedAt || !priorReport.transactionEndsAt ||
            !priorReport.livePayloadDigest || !priorReport.preExistingFingerprint) {
          throw new Error("Stored selective provenance repair requires the matching restricted import report.");
        }
        stored.priorAiodemoStartedAt = null;
        stored.priorAiodemoEndsAt = null;
        stored.appliedStart = priorReport.transactionStartedAt;
        stored.appliedEnd = priorReport.transactionEndsAt;
        stored.livePayloadDigest = priorReport.livePayloadDigest;
        repairProvenance = true;
      }
      for (const row of rows) {
        const record = stored.records.find((candidate) => candidate.table === row.table && candidate.sourceKey === row.sourceKey);
        if (!record) throw new Error("Retry refused: stored provenance row set differs.");
        const where = row.conflictKeys.map((column, index) => `${QUOTE(column)}=$${index + 1}`).join(" AND ");
        const current = await destination.query(`SELECT ${Object.keys(row.values).map(QUOTE).join(",")} FROM ${QUOTE(row.table)} WHERE ${where} LIMIT 1`, row.conflictKeys.map((column) => row.values[column]));
        if (!current.rows.length || rowFingerprint(current.rows[0]) !== record.insertedFingerprint) throw new Error("Retry refused: an imported row fingerprint changed.");
      }
      const trial = await destination.query<{ beta_trial_started_at: string; beta_trial_ends_at: string }>("SELECT beta_trial_started_at,beta_trial_ends_at FROM platform_companies WHERE slug='aiodemo'");
      if (!trial.rows[0] || new Date(trial.rows[0].beta_trial_started_at).toISOString() !== stored.appliedStart || new Date(trial.rows[0].beta_trial_ends_at).toISOString() !== stored.appliedEnd) throw new Error("Retry refused: trial entitlement differs from stored provenance.");
      const importedTrials = await destination.query<{ beta_trial_started_at: string; beta_trial_ends_at: string }>(
        "SELECT beta_trial_started_at,beta_trial_ends_at FROM platform_companies WHERE id=$1",
        [COMPANY.natalie1990],
      );
      if (importedTrials.rows.length !== 1 || importedTrials.rows.some((row) =>
        new Date(row.beta_trial_started_at).toISOString() !== stored.appliedStart ||
        new Date(row.beta_trial_ends_at).toISOString() !== stored.appliedEnd)) {
        throw new Error("Retry refused: imported workspace trial entitlement differs from stored provenance.");
      }
      if (repairProvenance) {
        const repairedValue = JSON.stringify(stored);
        if (Buffer.byteLength(repairedValue, "utf8") > 5_000_000) throw new Error("Repaired migration provenance exceeds the reviewed metadata limit.");
        const repaired = await destination.query("UPDATE platform_meta SET value=$2 WHERE key=$1", [`migration:selective:${manifest.sha256}`, repairedValue]);
        if (repaired.rowCount !== 1) throw new Error("Selective provenance repair did not affect exactly one row.");
      }
      await adapter.finalCommit();
      if (priorReport.derivedManifestSha256 !== manifest.sha256 || !priorReport.preExistingFingerprint) {
        throw new Error("Retry verification requires the matching restricted import report.");
      }
      await verifyPostCommit(input.productionUrl!, stored.appliedStart, stored.appliedEnd, rows, priorReport.preExistingFingerprint);
      console.log("Post-commit row and preservation checks verified.");
      return { status: "PASSED", manifestSha256: input.approvedDigest, derivedManifestSha256: manifest.sha256, insertedRows: 0, skippedRows: rows.length, provenanceRows: 1, retrySafe: true, betaWrites: false, stripeOperations: false };
    }
    const actual = await databaseFingerprint(destination);
    if (actual !== protectedTablesDigest(guarded.destination)) throw new Error("Protected staging data drifted after the approved pre-import snapshot.");
    if (await schemaFingerprint(destination) !== guarded.destination.schemaSha256) throw new Error("Staging schema fingerprint drifted.");
    const natalieUser = await destination.query<{ row_json: Record<string, unknown> }>("SELECT to_jsonb(u) AS row_json FROM platform_users u WHERE id=$1", [NATALIE]);
    if (natalieUser.rows.length !== 1 ||
        createHash("sha256").update(JSON.stringify(natalieUser.rows[0]!.row_json)).digest("hex") !== APPROVED_NATALIE_USER_SHA256) {
      throw new Error("Natalie Google identity drifted after approval.");
    }
    console.log("Protected staging drift gate verified.");
    const preExisting = await preExistingFingerprint(destination, rows);
    console.log("Pre-existing staging fingerprint captured.");
    const approval = { approved: true as const, liveOnly: true as const, manifestSha256: manifest.sha256, destinationEndpoint: input.productionUrl! };
    const imported = await runSelectiveImport({ manifest, apply: true, sourceReadOnly: true, observedFingerprints: manifest.expectedFingerprints, destinationApproval: approval, transaction: adapter });
    const priorAio = await destination.query<{ beta_trial_started_at: string | null; beta_trial_ends_at: string | null }>(
      "SELECT beta_trial_started_at,beta_trial_ends_at FROM platform_companies WHERE slug='aiodemo'",
    );
    if (priorAio.rows.length !== 1) throw new Error("AIO Demo workspace is missing.");
    await casAiodemoTrial(destination, priorAio.rows[0]!.beta_trial_started_at, priorAio.rows[0]!.beta_trial_ends_at, start, end);
    const natalieUpdate = await destination.query("UPDATE platform_companies SET beta_trial_started_at=$1,beta_trial_ends_at=$2 WHERE id=$3", [start, end, COMPANY.natalie1990]);
    if (natalieUpdate.rowCount !== 1) throw new Error("Imported workspace entitlement update did not affect exactly one row.");
    const livePayloadDigest = payloadDigest(rows);
    adapter.setEntitlement({ priorAiodemoStartedAt: priorAio.rows[0]!.beta_trial_started_at, priorAiodemoEndsAt: priorAio.rows[0]!.beta_trial_ends_at, appliedStart: start, appliedEnd: end, livePayloadDigest });
    await adapter.commit();
    await adapter.finalCommit();
    console.log("Selective staging transaction committed.");
    const report = { status: "PASSED", manifestSha256: input.approvedDigest, derivedManifestSha256: manifest.sha256, livePayloadDigest, preExistingFingerprint: preExisting, transactionStartedAt: start, transactionEndsAt: end, insertedRows: imported.inserted, provenanceRows: 1, retrySafe: true, betaWrites: false, stripeOperations: false };
    mkdirSync(resolve(".local", "migration", "restricted"), { recursive: true, mode: 0o700 });
    writeFileSync(resolve(".local", "migration", "restricted", "import-report.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    committed = true;
    await verifyPostCommit(input.productionUrl!, start, end, rows, preExisting);
    console.log("Post-commit row and preservation checks verified.");
    return report;
  } catch (error) {
    if (adapter) await adapter.rollback().catch(() => undefined);
    if (committed) await rollbackExactManifest(input).catch(() => undefined);
    throw error instanceof Error ? error : new Error("Approved selective import failed.");
  } finally {
    await destination.end().catch(() => undefined);
    await stopSource(cluster);
  }
}

export async function rollbackExactManifest(input: ApplyGuardInput): Promise<Record<string, unknown>> {
  const guarded = validateApplyInputs({ ...input, apply: true });
  const reportPath = privateReviewFile(".local/migration/restricted/import-report.json");
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as { derivedManifestSha256?: string };
  if (!report.derivedManifestSha256) throw new Error("Rollback requires a recorded derived manifest digest.");
  const client = new Client(pgConfig(input.productionUrl!));
  const adapter = liveAdapter(client, report.derivedManifestSha256, redactedEndpoint(input.productionUrl!));
  try {
    await client.connect();
    await adapter.begin();
    const found = await client.query<{ value: string }>("SELECT value FROM platform_meta WHERE key=$1", [`migration:selective:${report.derivedManifestSha256}`]);
    if (found.rows.length !== 1) throw new Error("No matching selective migration provenance exists.");
    const stored = JSON.parse(found.rows[0]!.value) as {
      records?: StoredProvenance[]; priorAiodemoStartedAt?: string | null; priorAiodemoEndsAt?: string | null; appliedStart?: string; appliedEnd?: string;
    };
    if (!stored.records || stored.records.length !== 826 || !stored.appliedStart || !stored.appliedEnd) throw new Error("Stored provenance is incomplete for rollback.");
    for (const record of stored.records) adapter.records.push({ ...record, destinationEndpoint: redactedEndpoint(input.productionUrl!), insertedColumns: record.insertedColumns });
    const expected = Object.fromEntries(stored.records.map((record) => [`${record.table}:${record.sourceKey}`, record.insertedFingerprint]));
    const removed = await rollbackImported(adapter, adapter.records, report.derivedManifestSha256, expected);
    await casAiodemoTrial(client, stored.appliedStart, stored.appliedEnd, stored.priorAiodemoStartedAt ?? null, stored.priorAiodemoEndsAt ?? null);
    await adapter.finalCommit();
    return { status: "PASSED", manifestSha256: input.approvedDigest, derivedManifestSha256: report.derivedManifestSha256, rolledBackRows: removed, provenanceRows: 0, betaWrites: false, stripeOperations: false };
  } catch (error) {
    await adapter.rollback().catch(() => undefined);
    throw error instanceof Error ? error : new Error("Selective rollback failed.");
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** Transaction boundary required by the eventual approved adapter. */
export async function withSerializableApplyTransaction<T>(
  client: ProductionApplyClient,
  work: () => Promise<T>,
): Promise<T> {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('task-301-selective-migration', 0))");
    const result = await work();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

/** Exact CAS entitlement update; no onboarding, billing or Stripe code path. */
export async function casAiodemoTrial(
  client: ProductionApplyClient,
  oldStartedAt: string | null,
  oldEndsAt: string | null,
  startedAt: string | null,
  endsAt: string | null,
): Promise<void> {
  const result = await client.query(
    "UPDATE platform_companies SET beta_trial_started_at=$1, beta_trial_ends_at=$2 WHERE slug='aiodemo' AND beta_trial_started_at IS NOT DISTINCT FROM $3 AND beta_trial_ends_at IS NOT DISTINCT FROM $4",
    [startedAt, endsAt, oldStartedAt, oldEndsAt],
  );
  if (result.rowCount !== 1) throw new Error("AIO Demo trial CAS failed; destination changed.");
}

function args(argv: string[]): Map<string, string | true> {
  const out = new Map<string, string | true>();
  const allowed = new Set(["apply", "rollback", "source", "destination", "review", "approved-digest"]);
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i]!; if (!item.startsWith("--")) throw new Error("Unknown argument.");
    const key = item.slice(2); if (!allowed.has(key)) throw new Error("Unknown argument.");
    if (key === "apply" || key === "rollback") out.set(key, true);
    else if (!argv[i + 1] || argv[i + 1]!.startsWith("--")) throw new Error(`--${key} requires a value.`);
    else out.set(key, argv[++i]!);
  }
  return out;
}
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = args(argv);
  const input: ApplyGuardInput = {
    sourceBundle: String(parsed.get("source") ?? APPROVED_SOURCE_BUNDLE),
    destinationBundle: String(parsed.get("destination") ?? FRESH_DESTINATION_BUNDLE),
    reviewPath: String(parsed.get("review") ?? ".local/migration/restricted/final-review-manifest.json"),
    approvedDigest: String(parsed.get("approved-digest") ?? ""),
    apply: parsed.has("apply"),
    rollback: parsed.has("rollback"),
    productionUrl: process.env.PRODUCTION_DATABASE_URL,
    betaUrl: process.env.BETA_DATABASE_URL,
  };
  validateApplyInputs(input);
  if (input.rollback) await rollbackExactManifest(input);
  else if (input.apply) await applyExactManifest(input);
  console.log("Apply dry-run passed bundle, schema-drift and approval guards; no database connection was opened.");
}
const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direct) main().catch((error) => { console.error(error instanceof Error ? error.message : "Selective apply failed."); process.exitCode = 1; });