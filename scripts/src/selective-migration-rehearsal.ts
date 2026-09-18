/**
 * Disposable, socket-only rehearsal harness for Task 301.
 *
 * This command never reads deployment database URLs. It only accepts the two
 * private, checksum-verified custom-format bundles produced by selective-backup.
 * It restores them into throwaway local clusters, fingerprints the destination,
 * compiles a restricted review manifest, and exercises apply, retry and guarded
 * rollback only against the throwaway destination restore.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { rollbackImported, runSelectiveImport, rowFingerprint, type ImportManifest, type ImportRow, type ImportTransaction, type ProvenanceRecord, type RollbackAdapter, type StoredProvenance } from "./selective-migration-import.js";

const require = createRequire(import.meta.url);
const { Client } = require("pg") as { Client: new (config: Record<string, unknown>) => PgClient };
type PgClient = {
  connect(): Promise<void>;
  end(): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
};

export interface RehearsalBundle {
  schemaVersion: 1;
  dumpFile: string;
  dumpSha256: string;
  schemaSha256: string;
  clusterDatabaseSha256: string;
  projectSetSha256: string;
  tables: Array<{ schema: string; table: string; rowCount: number; rowsSha256: string }>;
}
export interface RehearsalReport {
  status: "BLOCKED" | "PASSED";
  mode: "dry-run" | "restored";
  sourceBundle: string;
  destinationBundle: string;
  preExistingDestinationFingerprint?: string;
  postRollbackDestinationFingerprint?: string;
  repeatedImport?: "not-run" | "passed";
  retryInserted?: number;
  retrySkipped?: number;
  importedRows?: number;
  rolledBackRows?: number;
  entitlementTransform?: "applied-and-rolled-back" | "blocked";
  blockers: string[];
  warnings?: string[];
  evidence: { checksumVerified: boolean; sourceRestored: boolean; destinationRestored: boolean };
}

const LIMITATIONS = [
  "The separate Bluhalo workspace is intentionally omitted because the staging schema requires every workspace slug to have a matching legacy login account",
  "The selected Bluhalo project remains imported under the approved aiodemo target owner; no Bluhalo login credentials/MFA, identity or membership is imported",
  "external asset objects are not copied by a database dump",
];
const HEX = /^[a-f0-9]{64}$/i;

function safeBundlePath(path: string): string {
  const full = resolve(path);
  const root = resolve(".local", "selective-backups");
  if (!full.startsWith(`${root}/`)) throw new Error("Rehearsal bundles must be inside .local/selective-backups.");
  const stat = lstatSync(full);
  if (!stat.isFile() || (stat.mode & 0o777) !== 0o600) throw new Error("Rehearsal inputs must be regular mode-0600 files.");
  return full;
}
function sha256(file: string): string { return createHash("sha256").update(readFileSync(file)).digest("hex"); }
function readBundle(dir: string): { manifest: RehearsalBundle; dump: string } {
  const manifestPath = safeBundlePath(join(dir, "manifest.json"));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as RehearsalBundle;
  if (manifest.schemaVersion !== 1 || !HEX.test(manifest.dumpSha256) || !manifest.dumpFile ||
      manifest.dumpFile.includes("/") || manifest.dumpFile.includes("\\")) {
    throw new Error("Rehearsal bundle manifest is invalid.");
  }
  const dump = safeBundlePath(join(dir, manifest.dumpFile));
  if (sha256(dump) !== manifest.dumpSha256.toLowerCase()) throw new Error("Rehearsal dump checksum does not match its manifest.");
  return { manifest, dump };
}
function bundleRowsDigest(manifest: RehearsalBundle): string {
  return createHash("sha256").update(JSON.stringify(manifest.tables
    .map((table) => ({ schema: table.schema, table: table.table, rowCount: table.rowCount, rowsSha256: table.rowsSha256 }))
    .sort((a, b) => `${a.schema}.${a.table}`.localeCompare(`${b.schema}.${b.table}`)))).digest("hex");
}
function tool(name: string, args: string[], env: NodeJS.ProcessEnv = process.env): void {
  const result = spawnSync(name, args, { env, encoding: "utf8", stdio: ["ignore", "ignore", "pipe"] });
  if (result.error || result.status !== 0) throw new Error(`${name} failed; private diagnostic output discarded.`);
}
function cluster(label: string): { root: string; socket: string; data: string; database: string; env: NodeJS.ProcessEnv } {
  const root = mkdtempSync(join("/tmp", `smr-${label}-`), { encoding: "utf8" });
  chmodSync(root, 0o700);
  const socket = join(root, "socket"), data = join(root, "data");
  mkdirSync(socket, { mode: 0o700 });
  const database = "rehearsal";
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, PGHOST: socket, PGPORT: "5432",
    PGDATABASE: database, PGUSER: "selective_rehearsal", PSQLRC: "/dev/null" };
  tool("initdb", ["--no-locale", "--encoding=UTF8", "--username=selective_rehearsal", "-D", data], env);
  tool("pg_ctl", ["-D", data, "-o", `-c listen_addresses='' -c unix_socket_directories='${socket}'`, "-w", "start"], env);
  tool("createdb", ["--maintenance-db=postgres", database], env);
  return { root, socket, data, database, env };
}
async function fingerprint(client: PgClient): Promise<string> {
  const tables = await client.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  const values: string[] = [];
  for (const table of tables.rows) {
    // Table names come from information_schema and are identifier-quoted.
    const rows = await client.query<{ row_json: string }>(
      `SELECT to_jsonb(t)::text AS row_json FROM public."${table.table_name.replaceAll('"', '""')}" t`);
    const rowHash = rows.rows.map((r) => createHash("sha256").update(r.row_json).digest("hex")).sort().join("\n");
    values.push(`${table.table_name}:${rows.rows.length}:${createHash("sha256").update(rowHash).digest("hex")}`);
  }
  return createHash("sha256").update(values.join("\n")).digest("hex");
}
async function restore(bundle: { dump: string; manifest: RehearsalBundle }, label: string): Promise<{ scratch: ReturnType<typeof cluster>; client: PgClient; before: string }> {
  const scratch = cluster(label);
  tool("pg_restore", ["--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges", "--dbname=rehearsal", bundle.dump], scratch.env);
  const client = new Client({ host: scratch.socket, port: 5432, database: scratch.database,
    user: "selective_rehearsal", options: "-c statement_timeout=120000 -c timezone=UTC",
    connectionTimeoutMillis: 15000 });
  await client.connect();
  await client.query("SET session_replication_role = replica");
  const restoredTables = await client.query<{ table_schema: string; table_name: string }>(
    "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema IN ('public','_system') ORDER BY table_schema, table_name");
  for (const expected of bundle.manifest.tables) {
    const actual = restoredTables.rows.some((table) => table.table_schema === expected.schema && table.table_name === expected.table);
    if (!actual) throw new Error("Restored bundle is missing a manifest table.");
    const rows = await client.query<{ row_json: string }>(`SELECT to_jsonb(t)::text AS row_json FROM ${quoteIdentifier(expected.schema)}.${quoteIdentifier(expected.table)} t`);
    const hashes = rows.rows.map((row) => createHash("sha256").update(row.row_json).digest("hex")).sort().join("\n");
    if (rows.rows.length !== expected.rowCount || createHash("sha256").update(hashes).digest("hex") !== expected.rowsSha256) {
      throw new Error("Restored bundle table fingerprint does not match its manifest.");
    }
  }
  // Replication-role bypass is needed only while validating a restored dump.
  // The rehearsal itself must enforce the same foreign keys as production.
  await client.query("SET session_replication_role = origin");
  return { scratch, client, before: await fingerprint(client) };
}
async function stop(restored: { scratch: ReturnType<typeof cluster>; client: PgClient }): Promise<void> {
  await restored.client.end().catch(() => undefined);
  try { tool("pg_ctl", ["-D", restored.scratch.data, "-w", "stop", "-m", "fast"], restored.scratch.env); }
  finally { rmSync(restored.scratch.root, { recursive: true, force: true }); }
}

const SELECTED_PROJECTS = [
  "proj-1787645971188-zqr4l", "proj-1788507119679-fobpa", "proj-1789125605485-0q0f5",
  "proj-1789373392351-welar", "gen-bluhalo-u8qk", "proj-1788342504731-oqxln",
  "proj-1787304772283-gi5e9", "proj-1786696056540-lvuzt", "proj-1784206557757-gh9mi",
  "proj-1788342956731-nnryn", "proj-1785746011456-3cpla", "proj-1788948448319-vsooc",
  "proj-1781529868302-n8va2", "proj-1788785183865-4287h", "proj-1787225051953-kp3gf",
];
const EXCLUDED_PROJECTS = [
  { id: "proj-1784191474907-42nbb", name: "Content Guru" },
  { id: "gen-mmc-qo21", name: "MMC" },
  { id: "proj-1784119778792-byhgp", name: "MNC" },
  { id: "gen-move-marketing-vjfy", name: "Move Marketing" },
  { id: "ogilvy-782925", name: "Ogilvy" },
  { id: "proj-1780400571224-hdn3g", name: "SMG" },
  { id: "proj-1781779501637-2s0a8", name: "Truffle Social" },
  { id: "proj-1784024562039-q9rg6", name: "Without" },
  { id: "proj-1784976880085-dznvv", name: "xFlo" },
] as const;
const OWNER_MAP: Record<string, string> = { admin: "admin", aiodemo: "aiodemo" };
const COMPANY_MAP: Record<string, string> = {
  "admin": "8e5a96f9-d41d-404d-be44-07c1520b9883",
  "aiodemo": "21af7ee1-e14c-4a57-970b-41d26d2ff972",
  "bluhalo": "a6f656d2-5e90-5b5a-bfc3-688e0512fbbf",
  "natalie1990": "193d2146-c773-5a6b-80d2-8af0ffe89975",
};
const REHEARSAL_TIMESTAMP = "2026-09-17T18:00:00.000Z";
const NATALIE_USER = "96a03862-7724-4f1a-8bef-40232276bc2e";
const IMPORT_TABLES = ["platform_accounts", "platform_companies", "platform_memberships", "projects",
  "archive_items", "planner_items", "saved_audits", "saved_diagnostics", "saved_content_geo",
  "saved_tech_geo", "project_snapshots", "audit_locks", "token_usage"] as const;

function quoteIdentifier(name: string): string { return `"${name.replaceAll('"', '""')}"`; }
function jsonValue(value: unknown): unknown {
  // pg returns jsonb as objects; the importer intentionally receives values,
  // not SQL fragments. This also makes embedded ownership/asset scans explicit.
  return value;
}
async function columns(client: PgClient, table: string): Promise<Set<string>> {
  const result = await client.query<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [table]);
  return new Set(result.rows.map((r) => r.column_name));
}
async function rowsFor(client: PgClient, table: string, projectIds: readonly string[]): Promise<Record<string, unknown>[]> {
  const cols = await columns(client, table);
  if (!cols.size) return [];
  const hasProject = cols.has("project_id");
  if (hasProject && !projectIds.length) return [];
  const selected = [...cols].map(quoteIdentifier).join(", ");
  const result = hasProject
    ? await client.query<Record<string, unknown>>(`SELECT ${selected} FROM ${quoteIdentifier(table)} WHERE project_id = ANY($1::text[])`, [projectIds])
    : await client.query<Record<string, unknown>>(`SELECT ${selected} FROM ${quoteIdentifier(table)}`);
  return result.rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, jsonValue(v)])));
}
function allowedValues(table: string, row: Record<string, unknown>, projectMap: Record<string, string>, snapshotMap: Map<number, number>): Record<string, unknown> {
  const allowed: Record<string, readonly string[]> = {
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
  const out: Record<string, unknown> = {};
  for (const key of allowed[table] ?? []) if (key in row) out[key] = row[key];
  const jsonColumns = new Set(["data", "intake", "tags", "selected_messages", "media_cats", "target_phrases", "target_phrase_ids", "channels", "result", "config"]);
  for (const key of Object.keys(out)) {
    if (!jsonColumns.has(key) || typeof out[key] !== "string") continue;
    try { out[key] = JSON.parse(out[key] as string); }
    catch { throw new Error(`embedded JSON mapping is invalid in ${table}.${key}`); }
  }
  for (const key of Object.keys(out)) if (jsonColumns.has(key) && out[key] !== null && out[key] !== undefined) out[key] = JSON.stringify(out[key]);
  if (out.owner && typeof out.owner === "string") out.owner = OWNER_MAP[out.owner] ?? out.owner;
  if (out.project_id && typeof out.project_id === "string") out.project_id = projectMap[out.project_id] ?? out.project_id;
  if (table === "token_usage" && typeof out.account_id === "string") out.account_id = OWNER_MAP[out.account_id] ?? out.account_id;
  if (table === "project_snapshots" && typeof out.id === "number") out.id = snapshotMap.get(out.id) ?? out.id;
  return out;
}
function keyFor(table: string, row: Record<string, unknown>): { sourceKey: string; conflictKeys: string[] } {
  if (table === "platform_memberships") return { sourceKey: `${row.user_id}:${row.company_id}`, conflictKeys: ["user_id", "company_id"] };
  if (table === "audit_locks") return { sourceKey: `${row.project_id}:${row.audit_type}`, conflictKeys: ["project_id", "audit_type"] };
  return { sourceKey: `${table}:${String(row.id ?? row.username ?? row.owner)}`, conflictKeys: [table === "platform_accounts" ? "username" : table === "scoring_configs" ? "owner" : "id"] };
}
function sqlAdapter(client: PgClient): RollbackAdapter & { records: ProvenanceRecord[] } {
  const records: ProvenanceRecord[] = [];
  const valuesByKey = new Map<string, Record<string, unknown>>();
  const makeKey = (table: string, key: Readonly<Record<string, unknown>>) => `${table}:${JSON.stringify(key)}`;
  return {
    records,
    query: (sql, params) => client.query(sql, params as unknown[]),
    begin: async () => { await client.query("BEGIN"); },
    commit: async () => { await client.query("COMMIT"); },
    rollback: async () => { await client.query("ROLLBACK"); },
    insertRow: async (table, values) => {
      const keys = Object.keys(values); const params = keys.map((key) => values[key]);
      try {
        await client.query(`INSERT INTO ${quoteIdentifier(table)} (${keys.map(quoteIdentifier).join(",")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")})`, params);
      } catch (error) {
        throw new Error(`scratch insert failed in ${table} columns=${keys.join(",")}: ${error instanceof Error ? error.message : "database error"}`);
      }
      const keyColumns = table === "platform_memberships" ? ["user_id", "company_id"] : table === "audit_locks" ? ["project_id", "audit_type"] : [table === "platform_accounts" ? "username" : "id"];
      valuesByKey.set(makeKey(table, Object.fromEntries(keyColumns.map((key) => [key, values[key]]))), { ...values });
    },
    recordProvenance: async (record) => {
      records.push(record);
      await client.query("INSERT INTO rehearsal_provenance (manifest_sha256, table_name, source_key, destination_key, inserted_fingerprint) VALUES ($1,$2,$3,$4::jsonb,$5)", [record.manifestSha256, record.table, record.sourceKey, JSON.stringify(record.destinationKey), record.insertedFingerprint]);
    },
    findProvenance: async (manifestSha256, table, sourceKey) => {
      const result = await client.query<StoredProvenance>("SELECT manifest_sha256 AS \"manifestSha256\", table_name AS table, source_key AS \"sourceKey\", destination_key AS \"destinationKey\", inserted_fingerprint AS \"insertedFingerprint\" FROM rehearsal_provenance WHERE manifest_sha256=$1 AND table_name=$2 AND source_key=$3", [manifestSha256, table, sourceKey]);
      return result.rows[0] ?? null;
    },
    deleteImportedRow: async (table, key) => {
      const fields = Object.keys(key); await client.query(`DELETE FROM ${quoteIdentifier(table)} WHERE ${fields.map((f, i) => `${quoteIdentifier(f)}=$${i + 1}`).join(" AND ")}`, fields.map((f) => key[f]));
    },
    currentFingerprint: async (table, key) => {
      const values = valuesByKey.get(makeKey(table, key)); if (!values) return null;
      const fields = Object.keys(values), where = Object.keys(key).map((field, i) => `${quoteIdentifier(field)}=$${i + 1}`).join(" AND ");
      const result = await client.query(`SELECT ${fields.map(quoteIdentifier).join(",")} FROM ${quoteIdentifier(table)} WHERE ${where} LIMIT 1`, Object.keys(key).map((field) => key[field]));
      return result.rows.length ? rowFingerprint(result.rows[0]) : null;
    },
    hasExternalReferences: async (table, key) => {
      if (table === "projects") {
        const result = await client.query<{ n: string }>("SELECT (SELECT count(*) FROM archive_items WHERE project_id=$1)+(SELECT count(*) FROM planner_items WHERE project_id=$1)+(SELECT count(*) FROM project_snapshots WHERE project_id=$1)+(SELECT count(*) FROM saved_audits WHERE project_id=$1)+(SELECT count(*) FROM saved_diagnostics WHERE project_id=$1)+(SELECT count(*) FROM audit_locks WHERE project_id=$1)+(SELECT count(*) FROM token_usage WHERE project_id=$1) AS n", [key.id]);
        return Number(result.rows[0]?.n ?? 0) > 0;
      }
      if (table === "platform_companies") {
        const result = await client.query<{ n: string }>("SELECT count(*) AS n FROM platform_memberships WHERE company_id=$1", [key.id]);
        return Number(result.rows[0]?.n ?? 0) > 0;
      }
      return false;
    },
    deleteProvenanceRow: async () => {},
  };
}

export async function runRehearsal(sourceDir: string, destinationDir: string, dryRun = false): Promise<RehearsalReport> {
  const source = readBundle(sourceDir), destination = readBundle(destinationDir);
  const report: RehearsalReport = {
    status: dryRun ? "BLOCKED" : "PASSED", mode: dryRun ? "dry-run" : "restored",
    sourceBundle: source.manifest.clusterDatabaseSha256, destinationBundle: destination.manifest.clusterDatabaseSha256,
    blockers: dryRun ? [...LIMITATIONS] : [], warnings: dryRun ? undefined : [...LIMITATIONS],
    repeatedImport: "not-run", evidence: { checksumVerified: true, sourceRestored: false, destinationRestored: false },
  };
  if (dryRun) return report;
  let sourceScratch: Awaited<ReturnType<typeof restore>> | undefined;
  let destinationScratch: Awaited<ReturnType<typeof restore>> | undefined;
  try {
    sourceScratch = await restore(source, "source");
    report.evidence.sourceRestored = true;
    destinationScratch = await restore(destination, "destination");
    report.evidence.destinationRestored = true;
    report.preExistingDestinationFingerprint = destinationScratch.before;
    await destinationScratch.client.query("CREATE TEMP TABLE rehearsal_provenance (manifest_sha256 text, table_name text, source_key text, destination_key jsonb, inserted_fingerprint text, PRIMARY KEY (manifest_sha256, table_name, source_key))");
    const projectRows = await sourceScratch.client.query<Record<string, unknown>>(
      `SELECT * FROM projects WHERE id = ANY($1::text[]) ORDER BY id`, [SELECTED_PROJECTS]);
    const projectMap = Object.fromEntries(projectRows.rows.map((row) => [String(row.id), OWNER_MAP[String(row.owner)] ? String(row.id) : String(row.id)]));
    for (const row of projectRows.rows) if (typeof row.owner === "string") row.owner = OWNER_MAP[row.owner] ?? row.owner;
    const targetSnapshotIds = new Set((await destinationScratch.client.query<{ id: number }>("SELECT id FROM project_snapshots")).rows.map((r) => r.id));
    const sourceSnapshots = await rowsFor(sourceScratch.client, "project_snapshots", SELECTED_PROJECTS);
    const snapshotMap = new Map<number, number>();
    for (const row of sourceSnapshots) if (typeof row.id === "number") {
      let id = row.id; if (targetSnapshotIds.has(id)) id = 1000000000 + id;
      snapshotMap.set(row.id, id);
    }
    const rows: ImportRow[] = [];
    const addRows = async (table: string, sourceRows: Record<string, unknown>[]) => {
      for (const original of sourceRows) {
        const values = allowedValues(table, original, projectMap, snapshotMap);
        if (table === "projects") {
          const owner = String(original.owner); values.owner = OWNER_MAP[owner] ?? owner;
        }
        if (!Object.keys(values).length) continue;
        const keys = keyFor(table, values);
        rows.push({ table, values, sourceKey: `${table}:${keys.sourceKey}`, conflictKeys: keys.conflictKeys });
      }
    };
    await addRows("projects", projectRows.rows);
    for (const table of IMPORT_TABLES) {
      if (table === "projects" || table === "platform_accounts" || table === "platform_companies" || table === "platform_memberships") continue;
      await addRows(table, await rowsFor(sourceScratch.client, table, SELECTED_PROJECTS));
    }
    // Natalie is the only new workspace. A deterministic invalid password
    // sentinel satisfies the legacy workspace foreign key without creating a
    // usable password credential. She reuses the already-reviewed
    // Google identity and gets an explicitly empty project scope. The
    // separate Bluhalo workspace is omitted because staging requires every
    // workspace slug to have a matching legacy login account.
    const companyColumns = await columns(sourceScratch.client, "platform_companies");
    const companySelect = ["slug", "role", "parent_slug", "max_seats", "free_access", "status", "setup_complete", "created_at"]
      .filter((name) => companyColumns.has(name)).map(quoteIdentifier).join(", ");
    const companies = await sourceScratch.client.query<Record<string, unknown>>(`SELECT ${companySelect} FROM platform_companies WHERE slug='natalie1990'`);
    const companyRows = ["natalie1990"].map((slug) => companies.rows.find((r) => r.slug === slug) ?? {
      slug, role: "agency", parent_slug: "admin", max_seats: 1, free_access: true, status: "active", setup_complete: false, created_at: REHEARSAL_TIMESTAMP,
    });
    await addRows("platform_accounts", [{
      username: "natalie1990", password_hash: "sso-only-no-password", role: "agency",
      parent: "admin", max_seats: 1, created_at: REHEARSAL_TIMESTAMP, status: "active",
    }]);
    await addRows("platform_companies", companyRows.map((r) => ({
      ...r, id: COMPANY_MAP.natalie1990,
      slug: "natalie1990", parent_slug: "admin",
      beta_trial_started_at: REHEARSAL_TIMESTAMP,
      beta_trial_ends_at: "2026-11-16T18:00:00.000Z",
    })));
    rows.push({ table: "platform_memberships", sourceKey: "natalie1990:owner", conflictKeys: ["user_id", "company_id"],
      values: { user_id: NATALIE_USER, company_id: COMPANY_MAP.natalie1990, company_slug: "natalie1990", role: "owner", project_access: "[]", created_at: REHEARSAL_TIMESTAMP } });
    // Existing aiodemo is the one approved scratch transformation; it is
    // reverted before the destination fingerprint is compared.
    const priorAio = await destinationScratch.client.query<Record<string, unknown>>("SELECT beta_trial_started_at, beta_trial_ends_at FROM platform_companies WHERE slug='aiodemo'");
    if (priorAio.rows.length) {
      await destinationScratch.client.query("UPDATE platform_companies SET beta_trial_started_at=$1, beta_trial_ends_at=$2 WHERE slug='aiodemo'", [REHEARSAL_TIMESTAMP, "2026-11-16T18:00:00.000Z"]);
      report.entitlementTransform = "applied-and-rolled-back";
    } else report.entitlementTransform = "blocked";
    const manifest = {
      external: true, frozen: true, reviewed: true, sha256: "",
      sourceEndpoint: "postgres://scratch-source/rehearsal", destinationEndpoint: "postgres://scratch-destination/rehearsal",
      rows, expectedFingerprints: { source: { schema: source.manifest.schemaSha256, rows: bundleRowsDigest(source.manifest) },
      destination: { schema: destination.manifest.schemaSha256, rows: bundleRowsDigest(destination.manifest) } },
    } as ImportManifest;
    const { computeManifestSha256 } = await import("./selective-migration-readiness.js");
    manifest.sha256 = computeManifestSha256(manifest as never);
    const identitySets: Record<string, { count: number; sha256: string }> = {};
    for (const table of IMPORT_TABLES) {
      const identities = rows.filter((row) => row.table === table).map((row) => ({ sourceKey: row.sourceKey, conflictKeys: row.conflictKeys, destinationKey: Object.fromEntries(row.conflictKeys.map((key) => [key, row.values[key]])) }));
      identitySets[table] = { count: identities.length, sha256: createHash("sha256").update(JSON.stringify(identities)).digest("hex") };
    }
    const reviewEvidence = {
      schemaVersion: 1, reviewed: false, approved: false, applyAllowed: false,
      applicationDatabaseWritesAuthorized: false, manifestSha256: manifest.sha256,
      source: { clusterDatabaseSha256: source.manifest.clusterDatabaseSha256, schemaSha256: source.manifest.schemaSha256, rowFingerprint: bundleRowsDigest(source.manifest) },
      destination: { clusterDatabaseSha256: destination.manifest.clusterDatabaseSha256, schemaSha256: destination.manifest.schemaSha256, rowFingerprint: bundleRowsDigest(destination.manifest) },
      schemaDrift: { classification: "additive-compatible-review-required", supersedes: "4136adc8d25d281f0318749b1f95d21d0dc56f537de76cd04f30dd1b72a86d3a", addedTables: ["public.media_discoveries"], addedColumns: ["public.media_contact_correction_reports.resolution_note", "public.media_contact_correction_reports.reviewed_by", "public.media_contact_correction_reports.source_check_id"], projectSetUnchanged: true },
      projects: projectRows.rows.map((row) => ({ id: row.id, name: row.name, sourceOwner: row.owner, targetOwner: OWNER_MAP[String(row.owner)] ?? row.owner })).sort((a, b) => String(a.id).localeCompare(String(b.id))),
      identitySets, counts: { firstImport: rows.length, retryInserted: 0, retrySkipped: rows.length },
      snapshotIdMap: Object.fromEntries([...snapshotMap.entries()].sort((a, b) => a[0] - b[0])),
      newAccounts: [{ username: "natalie1990", authentication: "existing-approved-google-sso-only", passwordLogin: false }],
      newCompanies: [{ id: COMPANY_MAP.natalie1990, slug: "natalie1990" }],
      memberships: { natalie: { userId: NATALIE_USER, companyId: COMPANY_MAP.natalie1990, role: "owner", projectAccess: [] }, bluhalo: "none" },
      entitlements: {
        rehearsalTimestamp: REHEARSAL_TIMESTAMP,
        liveImportStart: "approved-import-transaction-timestamp",
        durationDays: 60,
        workspaces: ["aiodemo", "natalie1990"],
        admin: "none",
        paymentActivation: false,
        stripeOperations: false,
        existingAiodemoOldValueSha256: priorAio.rows.length ? createHash("sha256").update(JSON.stringify(priorAio.rows[0])).digest("hex") : null,
      },
      exclusions: {
        projects: EXCLUDED_PROJECTS,
        allOtherSourceProjects: true,
        logins: ["riseamplify"],
        tables: ["platform_sessions", "platform_password_resets", "platform_email_verifications", "platform_invitations"],
        credentials: true,
        externalAssets: true,
      },
      limitations: LIMITATIONS,
      expectedDeltas: { insertedRows: rows.length, transformedExistingRows: priorAio.rows.length ? 1 : 0, bluhaloMemberships: 0 },
      rollback: { required: true, scoped: true, reverseDependencyOrder: true },
    };
    mkdirSync(resolve(".local/migration/restricted"), { recursive: true, mode: 0o700 });
    writeFileSync(".local/migration/restricted/final-review-manifest.json", `${JSON.stringify(reviewEvidence, null, 2)}\n`, { mode: 0o600 });
    const adapter = sqlAdapter(destinationScratch.client);
    const approval = { approved: true as const, scratchOnly: true as const, manifestSha256: manifest.sha256, destinationEndpoint: manifest.destinationEndpoint };
    const first = await runSelectiveImport({ manifest, apply: true, sourceReadOnly: true, observedFingerprints: manifest.expectedFingerprints, destinationApproval: approval, transaction: adapter });
    report.importedRows = first.inserted;
    // A second invocation must consult provenance and insert nothing.
    const retry = await runSelectiveImport({ manifest, apply: true, sourceReadOnly: true, observedFingerprints: manifest.expectedFingerprints, destinationApproval: approval, transaction: adapter });
    if (retry.inserted !== 0 || retry.skipped !== first.inserted) throw new Error("Idempotent retry accounting is incorrect.");
    report.retryInserted = retry.inserted;
    report.retrySkipped = retry.skipped;
    report.repeatedImport = "passed";
    // Roll back only rows created by this rehearsal, then restore the
    // explicitly transformed existing entitlement.
    const expected = Object.fromEntries(adapter.records.map((record) => [`${record.table}:${record.sourceKey}`, record.insertedFingerprint]));
    report.rolledBackRows = await rollbackImported(adapter, adapter.records, manifest.sha256, expected);
    if (priorAio.rows.length) await destinationScratch.client.query("UPDATE platform_companies SET beta_trial_started_at=$1, beta_trial_ends_at=$2 WHERE slug='aiodemo'", [priorAio.rows[0].beta_trial_started_at, priorAio.rows[0].beta_trial_ends_at]);
    report.postRollbackDestinationFingerprint = await fingerprint(destinationScratch.client);
    if (report.preExistingDestinationFingerprint !== report.postRollbackDestinationFingerprint) throw new Error("Destination fingerprint changed during scratch rollback.");
    return report;
  } finally {
    if (sourceScratch) await stop(sourceScratch);
    if (destinationScratch) await stop(destinationScratch);
  }
}

function args(argv: string[]): { source: string; destination: string; dryRun: boolean; report: string } {
  const value = (name: string): string => {
    const index = argv.indexOf(name);
    if (index < 0 || !argv[index + 1] || argv[index + 1]!.startsWith("--")) throw new Error(`${name} requires a value.`);
    return argv[index + 1]!;
  };
  return { source: value("--source"), destination: value("--destination"), dryRun: argv.includes("--dry-run"),
    report: argv.includes("--report") ? value("--report") : join(".local", "migration", "restricted", "rehearsal-report.json") };
}
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = args(argv);
  const report = await runRehearsal(parsed.source, parsed.destination, parsed.dryRun);
  mkdirSync(resolve(parsed.report, ".."), { recursive: true, mode: 0o700 });
  writeFileSync(parsed.report, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(`Selective rehearsal ${report.status}; report written to restricted output.`);
}
const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direct) main().catch((error) => { console.error(error instanceof Error ? error.message : "Rehearsal failed."); process.exitCode = 1; });