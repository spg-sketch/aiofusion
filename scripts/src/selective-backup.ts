/**
 * Guarded, read-only snapshot backup and isolated restore verification.
 *
 * This is intentionally independent of the application.  `@workspace/db`
 * starts an application pool when imported, so this file resolves the
 * already-installed `pg` package with createRequire instead.  No application
 * module (or ORM schema) is imported.
 */
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
// Resolve relative to the workspace DB package's dependency graph, but require
// only pg.  Resolving the package entry does not evaluate its application pool.
const dbRequire = createRequire(require.resolve("@workspace/db"));
interface PgClient {
  connect(): Promise<void>;
  end(): Promise<void>;
  query<T = Record<string, unknown>>(text: string): Promise<{ rows: T[] }>;
  on(event: string, listener: (...args: unknown[]) => void): PgClient;
}
interface PgClientConstructor { new (config: PgClientConfig): PgClient }
interface PgClientConfig {
  host: string; port: number; database: string; user?: string;
  password?: string; ssl?: Record<string, never>; options: string;
  connectionTimeoutMillis: number; query_timeout: number;
  application_name?: string;
}
const { Client } = dbRequire("pg") as { Client: PgClientConstructor };

export type EnvironmentKey = "BETA_DATABASE_URL" | "PRODUCTION_DATABASE_URL";
export interface TableFingerprint { schema: string; table: string; rowCount: number; rowsSha256: string }
export interface BackupManifest {
  schemaVersion: 1;
  createdAt: string;
  environment: string;
  endpointSha256: string;
  clusterDatabaseSha256: string;
  projectSetSha256: string;
  schemaCount: number;
  tableCount: number;
  schemaSha256: string;
  tables: TableFingerprint[];
  dumpSha256: string;
  dumpFile: string;
}
export interface BackupConfig {
  envKey: EnvironmentKey;
  databaseUrl: string;
  label: string;
  expectedEndpointSha256: string;
  expectedClusterDatabaseSha256: string;
  expectedProjectSetSha256: string;
  outputRoot?: string;
}

const HEX = /^[a-f0-9]{64}$/i;
const UNSAFE_LABEL = /[^a-z0-9._-]/g;
const CONNECT_TIMEOUT_MS = 15_000;
const STATEMENT_TIMEOUT_MS = 120_000;
const ALLOWED_QUERY_PARAMETERS = new Set(["sslmode", "connect_timeout", "statement_timeout", "application_name"]);

export function canonicalizeDatabaseUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Database URL is not valid."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname) {
    throw new Error("Database URL must use postgres:// or postgresql:// and include a host.");
  }
  const port = url.port || (url.protocol === "postgres:" || url.protocol === "postgresql:" ? "5432" : "");
  const database = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, ""));
  if (!database) throw new Error("Database URL must include a database name.");
  // Credentials and all query parameters (including pooler options) are not
  // endpoint identity.  Host aliases are not guessed: DNS aliases are not
  // safely distinguishable from a different database.
  return `postgres://${url.hostname.toLowerCase().replace(/\.$/, "")}:${port}/${database}`;
}

export function endpointSha256(databaseUrl: string): string {
  return createHash("sha256").update(canonicalizeDatabaseUrl(databaseUrl)).digest("hex");
}

export function sameDatabaseEndpoint(a: string, b: string): boolean {
  try { return canonicalizeDatabaseUrl(a) === canonicalizeDatabaseUrl(b); } catch { return false; }
}

export function normaliseLabel(value: string | undefined): string {
  const label = (value ?? "").trim().toLowerCase();
  if (!label || label.length > 80 || label.includes("://") || label.includes("@")) {
    throw new Error("A short, non-secret environment label is required.");
  }
  return label;
}

export function allowedEnvironmentKey(value: string | undefined): EnvironmentKey {
  if (value === "BETA_DATABASE_URL" || value === "PRODUCTION_DATABASE_URL") return value;
  throw new Error("Environment key must be BETA_DATABASE_URL or PRODUCTION_DATABASE_URL.");
}

function expectedSha(value: string | undefined, name: string): string {
  if (!value || !HEX.test(value.trim())) throw new Error(`${name} must be a 64-character SHA-256 hex digest.`);
  return value.trim().toLowerCase();
}

export function connectionEnvironment(databaseUrl: string): NodeJS.ProcessEnv {
  let url: URL;
  try { url = new URL(databaseUrl); } catch { throw new Error("Database URL is not valid."); }
  const database = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, ""));
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !database) {
    throw new Error("Database URL must include a postgres host and database.");
  }
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_QUERY_PARAMETERS.has(key)) throw new Error(`Unsupported database URL parameter: ${key}.`);
  }
  const sslmode = url.searchParams.get("sslmode");
  const statementTimeout = url.searchParams.get("statement_timeout") ?? String(STATEMENT_TIMEOUT_MS);
  const connectTimeout = url.searchParams.get("connect_timeout") ?? String(CONNECT_TIMEOUT_MS / 1000);
  if (!/^\d+$/.test(statementTimeout) || !/^\d+$/.test(connectTimeout)) {
    throw new Error("Database timeout URL parameters must be numeric.");
  }
  const env: NodeJS.ProcessEnv = {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: database,
    PGCONNECT_TIMEOUT: connectTimeout,
    PSQLRC: "/dev/null",
    PGOPTIONS: `-c default_transaction_read_only=on -c statement_timeout=${statementTimeout} -c datestyle=ISO,MDY -c timezone=UTC`,
  };
  if (url.username) env.PGUSER = decodeURIComponent(url.username);
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
  if (sslmode) env.PGSSLMODE = sslmode;
  const appName = url.searchParams.get("application_name");
  if (appName) env.PGAPPNAME = appName;
  return env;
}

export function outputPath(root: string | undefined, label: string, id = randomUUID()): string {
  const safe = normaliseLabel(label).replace(UNSAFE_LABEL, "-");
  const base = resolve(root ?? join(".local", "selective-backups"));
  return join(base, `${safe}-${id}`);
}

function sha256File(file: string): string {
  // Files are written by pg_dump before this synchronous helper is called.
  // Reading synchronously avoids opening an event-loop escape hatch while the
  // source snapshot transaction is still held.
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

export function verifyFileChecksum(file: string, expected: string): void {
  if (!existsSync(file) || sha256File(file) !== expected.toLowerCase()) {
    throw new Error("Dump checksum does not match its manifest.");
  }
}

function runTool(command: string, args: string[], env: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, args, { env, encoding: "utf8", stdio: ["ignore", "ignore", "pipe"] });
  if (result.error || result.status !== 0) {
    const diagnostic = /unrecognized configuration parameter/.test(result.stderr ?? "") ? "unsupported configuration"
      : /already exists/.test(result.stderr ?? "") ? "object already exists"
      : /does not exist/.test(result.stderr ?? "") ? "missing object"
      : /Permission denied|permission denied/.test(result.stderr ?? "") ? "permission denied"
      : /locale/.test(result.stderr ?? "") ? "locale configuration"
      : result.error ? "tool unavailable" : "details redacted";
    throw new Error(`${command} failed (${diagnostic}); no database error details are retained.`);
  }
}

function quote(value: string): string { return `"${value.replace(/"/g, "\"\"")}"`; }
function safeError(error: unknown): Error {
  // Driver and PostgreSQL messages are intentionally not forwarded: they can
  // contain connection strings, SQL, role names, or row values.
  const message = error instanceof Error ? error.message : "";
  const safePrefixes = [
    "pg_dump failed", "pg_restore failed", "pg_ctl failed", "createdb failed", "initdb failed",
    "Database endpoint", "Cluster-database", "Project-set", "Could not establish", "Refusing", "Isolated cluster",
    "Dump checksum", "Manifest schema", "Restored", "Environment key",
    "A short", "Expected", "Database URL", "Restore verification requires",
  ];
  const safe = safePrefixes.find((prefix) => message.startsWith(prefix));
  return new Error(safe ? message.split("\n")[0] : "Operation failed; database details are not retained.");
}

async function queryRows(client: PgClient, text: string): Promise<any[]> {
  try { return (await client.query(text)).rows; } catch { throw new Error("Read-only snapshot query failed."); }
}

async function tableRefs(client: PgClient): Promise<Array<{ schema: string; table: string }>> {
  return queryRows(client, `SELECT n.nspname AS schema, c.relname AS table
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','_system','stripe') ORDER BY 1,2;`);
}

async function assertSafeSource(client: PgClient): Promise<void> {
  const rows = await queryRows(client, `SELECT n.nspname AS schema FROM pg_catalog.pg_namespace n
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
      AND n.nspname NOT IN ('public','_system','stripe');`);
  if (rows.length) throw new Error("Refusing a database containing an unsupported user schema.");
  const reviewed = await queryRows(client, `SELECT n.nspname AS schema, c.relname AS relation, c.relkind, c.oid,
      CASE WHEN n.nspname='_system' AND c.relkind='i' THEN ix.indrelid
           WHEN n.nspname='_system' AND c.relkind='S' THEN dep.refobjid END AS parent_oid
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_catalog.pg_index ix ON ix.indexrelid=c.oid
    LEFT JOIN pg_catalog.pg_depend dep ON dep.classid='pg_class'::regclass AND dep.objid=c.oid
      AND dep.refclassid='pg_class'::regclass AND dep.deptype IN ('a','i')
    WHERE n.nspname IN ('_system','stripe') AND c.relkind IN ('r','p','v','m','f','S','i');`);
  const migrationTable = reviewed.filter((row) =>
    row.schema === "_system" && row.relkind === "r" && row.relation === "replit_database_migrations_v1");
  const invalidSystem = reviewed.some((row) => {
    if (row.schema !== "_system") return false;
    if (row.relkind === "r" && row.relation === "replit_database_migrations_v1") return false;
    if ((row.relkind === "i" || row.relkind === "S") &&
        String(row.parent_oid) === String(migrationTable[0]?.oid)) return false;
    return true;
  });
  const invalidStripe = reviewed.some((row) => row.schema === "stripe");
  if (migrationTable.length !== 1 || invalidSystem || invalidStripe) {
    throw new Error("Refusing unreviewed _system or non-empty stripe relations.");
  }
  const functions = await queryRows(client, `SELECT n.nspname AS schema FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('_system','stripe');`);
  if (functions.length) throw new Error("Refusing functions in reviewed _system or stripe schemas.");
  const unsafe = await queryRows(client, `SELECT 'foreign table' AS kind FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='f' AND n.nspname NOT LIKE 'pg_%'
    UNION ALL SELECT 'foreign server' FROM pg_catalog.pg_foreign_server
    UNION ALL SELECT 'user mapping' FROM pg_catalog.pg_user_mappings
    UNION ALL SELECT 'subscription' FROM pg_catalog.pg_subscription
    UNION ALL SELECT 'event trigger' FROM pg_catalog.pg_event_trigger
    UNION ALL SELECT 'trigger' FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal
    UNION ALL SELECT 'untrusted function' FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
      JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname NOT LIKE 'pg_%' AND NOT l.lanpltrusted;`);
  if (unsafe.length) throw new Error("Refusing unsafe foreign objects, extensions, functions, or triggers.");
  const extensions = await queryRows(client, `SELECT e.extname FROM pg_catalog.pg_extension e
    LEFT JOIN pg_catalog.pg_available_extension_versions a ON a.name=e.extname AND a.version=e.extversion
    WHERE COALESCE(a.trusted, false) = false AND e.extname <> 'plpgsql';`);
  if (extensions.length) throw new Error("Refusing an untrusted database extension.");
}

function rowHashAggregate(rows: Array<{ row_json: string }>): string {
  const hashes = rows.map((r) => createHash("sha256").update(r.row_json).digest("hex")).sort();
  return createHash("sha256").update(hashes.join("\n")).digest("hex");
}

async function fingerprints(client: PgClient, refs: Array<{ schema: string; table: string }>): Promise<TableFingerprint[]> {
  const output: TableFingerprint[] = [];
  for (const ref of refs) {
    const rows = await queryRows(client, `SELECT to_jsonb(t)::text AS row_json FROM ${quote(ref.schema)}.${quote(ref.table)} t;`);
    output.push({ schema: ref.schema, table: ref.table, rowCount: rows.length, rowsSha256: rowHashAggregate(rows) });
  }
  return output;
}

async function projectDigest(client: PgClient): Promise<string> {
  const rows = await queryRows(client, `SELECT id::text AS id FROM public.projects ORDER BY id;`);
  return createHash("sha256").update(rows.map((r) => r.id).join("\n")).digest("hex");
}

async function clusterDatabaseDigest(client: PgClient): Promise<string> {
  const rows = await queryRows(client, `SELECT encode(sha256(convert_to(
    system_identifier::text || '/' || current_database(), 'UTF8')), 'hex') AS digest
    FROM pg_catalog.pg_control_system();`);
  const digest = rows[0]?.digest;
  if (typeof digest !== "string" || !HEX.test(digest)) throw new Error("Could not establish the cluster identity.");
  return digest.toLowerCase();
}

async function schemaDigest(client: PgClient): Promise<string> {
  const rows = await queryRows(client, `SELECT table_schema,table_name,ordinal_position,column_name,data_type,udt_name,
    is_nullable,COALESCE(column_default,'') AS column_default FROM information_schema.columns
    WHERE table_schema IN ('public','_system','stripe') ORDER BY 1,2,3;`);
  return createHash("sha256").update(rows.map((r) => Object.values(r).join("\t")).join("\n")).digest("hex");
}

async function schemaCount(client: PgClient): Promise<number> {
  const rows = await queryRows(client, `SELECT count(*)::int AS count FROM pg_catalog.pg_namespace
    WHERE nspname IN ('public','_system','stripe');`);
  return Number(rows[0]?.count ?? 0);
}

async function snapshotCreatedAt(client: PgClient): Promise<string> {
  const rows = await queryRows(client, "SELECT transaction_timestamp()::text AS created_at;");
  const value = rows[0]?.created_at;
  if (typeof value !== "string") throw new Error("Could not establish the snapshot boundary.");
  return new Date(value).toISOString();
}

async function manifestSnapshot(client: PgClient, config: BackupConfig): Promise<Omit<BackupManifest, "dumpSha256" | "dumpFile">> {
  const refs = await tableRefs(client);
  const tables = await fingerprints(client, refs);
  return {
    schemaVersion: 1, createdAt: await snapshotCreatedAt(client), environment: config.label,
    endpointSha256: endpointSha256(config.databaseUrl),
    clusterDatabaseSha256: await clusterDatabaseDigest(client),
    projectSetSha256: await projectDigest(client),
    schemaCount: await schemaCount(client), tableCount: refs.length,
    schemaSha256: await schemaDigest(client), tables,
  };
}

function pgClientConfig(databaseUrl: string): PgClientConfig {
  connectionEnvironment(databaseUrl);
  const url = new URL(databaseUrl);
  const statementTimeout = Number(url.searchParams.get("statement_timeout") ?? STATEMENT_TIMEOUT_MS);
  const connectTimeout = Number(url.searchParams.get("connect_timeout") ?? CONNECT_TIMEOUT_MS / 1000);
  return {
    host: url.hostname, port: Number(url.port || 5432),
    database: decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, "")),
    user: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    ssl: url.searchParams.get("sslmode") && url.searchParams.get("sslmode") !== "disable" ? {} : undefined,
    options: `-c default_transaction_read_only=on -c statement_timeout=${statementTimeout} -c datestyle=ISO,MDY -c timezone=UTC`,
    connectionTimeoutMillis: connectTimeout * 1000,
    query_timeout: statementTimeout,
    application_name: url.searchParams.get("application_name") ?? undefined,
  };
}

export async function performBackup(config: BackupConfig): Promise<BackupManifest> {
  allowedEnvironmentKey(config.envKey);
  const expectedEndpoint = expectedSha(config.expectedEndpointSha256, "Expected endpoint SHA-256");
  const expectedClusterDatabase = expectedSha(config.expectedClusterDatabaseSha256, "Expected cluster-database SHA-256");
  const expectedProjectSet = expectedSha(config.expectedProjectSetSha256, "Expected project-set SHA-256");
  const actualEndpoint = endpointSha256(config.databaseUrl);
  if (actualEndpoint !== expectedEndpoint) throw new Error("Database endpoint does not match the expected digest.");
  const base = resolve(config.outputRoot ?? join(".local", "selective-backups"));
  if (!base.startsWith(resolve(".local") + "/") && base !== resolve(".local")) {
    throw new Error("Backup output must be inside the private .local directory.");
  }
  const out = outputPath(config.outputRoot, config.label);
  mkdirSync(base, { recursive: true, mode: 0o700 }); chmodSync(base, 0o700);
  mkdirSync(out, { mode: 0o700 }); chmodSync(out, 0o700);
  const dumpFile = join(out, "database.dump"), manifestFile = join(out, "manifest.json");
  const client = new Client(pgClientConfig(config.databaseUrl));
  client.on("error", () => undefined);
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;");
    await client.query("SET LOCAL datestyle = 'ISO, MDY'; SET LOCAL timezone = 'UTC';");
    await assertSafeSource(client);
    const snapshot = (await client.query("SELECT pg_export_snapshot() AS snapshot")).rows[0]?.snapshot;
    if (typeof snapshot !== "string") throw new Error("Could not establish a consistent export snapshot.");
    const captured = await manifestSnapshot(client, config);
    if (captured.clusterDatabaseSha256 !== expectedClusterDatabase) {
      throw new Error("Cluster-database identity does not match the expected digest.");
    }
    if (captured.projectSetSha256 !== expectedProjectSet) {
      throw new Error("Project-set digest does not match the expected digest.");
    }
    writeFileSync(dumpFile, "", { mode: 0o600, flag: "wx" });
    runTool("pg_dump", ["--format=custom", "--file", dumpFile, "--snapshot", snapshot], {
      ...connectionEnvironment(config.databaseUrl), PATH: process.env.PATH, HOME: process.env.HOME,
    });
    const manifest: BackupManifest = { ...captured, dumpSha256: sha256File(dumpFile), dumpFile: basename(dumpFile) };
    writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    chmodSync(manifestFile, 0o600); chmodSync(dumpFile, 0o600);
    await client.query("COMMIT");
    return manifest;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* connection may not have started */ }
    throw safeError(error);
  } finally {
    await client.end().catch(() => undefined);
  }
}

function localClusterDir(): string {
  // PostgreSQL Unix socket paths are limited to 108 bytes.  Keep this
  // private temporary cluster deliberately short; the durable dump remains
  // under .local and is checked separately.
  const dir = mkdtempSync(join("/tmp", "sb-")); chmodSync(dir, 0o700);
  return dir;
}

function privateBackupFile(file: string): string {
  const root = resolve(".local", "selective-backups");
  const resolved = resolve(file);
  if (!resolved.startsWith(root + "/")) throw new Error("Restore inputs must be inside .local/selective-backups.");
  const info = lstatSync(resolved);
  if (!info.isFile() || (info.mode & 0o777) !== 0o600) {
    throw new Error("Restore inputs must be regular mode-0600 files.");
  }
  return resolved;
}

export async function verifyRestore(manifestPath: string, dumpPath?: string): Promise<void> {
  const checkedManifest = privateBackupFile(manifestPath);
  const manifest = JSON.parse(readFileSync(checkedManifest, "utf8")) as BackupManifest;
  if (manifest.schemaVersion !== 1 || !HEX.test(manifest.dumpSha256)) throw new Error("Manifest schema or checksum is invalid.");
  if (!manifest.dumpFile || basename(manifest.dumpFile) !== manifest.dumpFile) throw new Error("Manifest dump path is invalid.");
  const dump = privateBackupFile(dumpPath ?? join(dirname(checkedManifest), manifest.dumpFile));
  if (dirname(dump) !== dirname(checkedManifest) || basename(dump) !== manifest.dumpFile) {
    throw new Error("Manifest and dump must be one private backup bundle.");
  }
  verifyFileChecksum(dump, manifest.dumpSha256);
  const cluster = localClusterDir(), socket = join(cluster, "socket"), data = join(cluster, "data");
  mkdirSync(socket, { mode: 0o700 });
  let startAttempted = false;
  try {
    runTool("initdb", ["--no-locale", "--encoding=UTF8", "--username=selective_backup_verifier", "-D", data], { PATH: process.env.PATH, HOME: process.env.HOME });
    startAttempted = true;
    runTool("pg_ctl", ["-D", data, "-o", `-c listen_addresses='' -c unix_socket_directories='${socket}'`, "-w", "start"], { PATH: process.env.PATH, HOME: process.env.HOME });
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, PGHOST: socket, PGPORT: "5432", PGDATABASE: "postgres", PGUSER: "selective_backup_verifier", PSQLRC: "/dev/null" };
    runTool("createdb", ["--maintenance-db=postgres", "selective_restore"], env);
    runTool("pg_restore", ["--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges", "--dbname=selective_restore", dump], { ...env, PGDATABASE: "selective_restore" });
    const client = new Client({
      host: socket, port: 5432, database: "selective_restore", user: env.PGUSER,
      options: "-c default_transaction_read_only=on -c statement_timeout=120000 -c datestyle=ISO,MDY -c timezone=UTC",
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS, query_timeout: STATEMENT_TIMEOUT_MS,
    });
    client.on("error", () => undefined);
    try {
      await client.connect();
      await assertSafeSource(client);
      const refs = await tableRefs(client), found = await fingerprints(client, refs);
      if (await schemaCount(client) !== manifest.schemaCount ||
          found.length !== manifest.tableCount ||
          (await schemaDigest(client)) !== manifest.schemaSha256) throw new Error("Restored schema does not match the manifest.");
      for (const expected of manifest.tables) {
        const actual = found.find((row) => row.schema === expected.schema && row.table === expected.table);
        if (!actual || actual.rowCount !== expected.rowCount || actual.rowsSha256 !== expected.rowsSha256) throw new Error("Restored table fingerprint does not match the manifest.");
      }
      if (await projectDigest(client) !== manifest.projectSetSha256) throw new Error("Restored project-set digest does not match the manifest.");
    } finally { await client.end().catch(() => undefined); }
  } finally {
    let stopFailed = false;
    if (startAttempted) {
      try { runTool("pg_ctl", ["-D", data, "-w", "stop", "-m", "fast"], { PATH: process.env.PATH, HOME: process.env.HOME }); }
      catch { stopFailed = true; }
    }
    if (stopFailed) {
      throw new Error(`Isolated cluster could not be stopped; private cleanup is required at ${cluster}.`);
    }
    rmSync(cluster, { recursive: true, force: true });
  }
}

function args(argv: string[]): Map<string, string | true> {
  const out = new Map<string, string | true>();
  const allowed = new Set([
    "backup", "verify-restore", "dry-run", "env-key", "label",
    "expected-endpoint-sha256", "expected-cluster-database-sha256", "expected-project-set-sha256",
    "output-root", "manifest",
  ]);
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i]; if (!item.startsWith("--")) throw new Error("Unknown argument.");
    const [key, inline] = item.slice(2).split("=", 2);
    if (!allowed.has(key)) throw new Error("Unknown argument.");
    if (inline !== undefined) out.set(key, inline);
    else if (["backup", "verify-restore", "dry-run"].includes(key)) out.set(key, true);
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) out.set(key, argv[++i]);
    else throw new Error("Argument requires a value.");
  }
  return out;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = args(argv);
  if (parsed.has("backup") && parsed.has("verify-restore")) throw new Error("Choose one mode.");
  if (parsed.has("dry-run") && (parsed.has("backup") || parsed.has("verify-restore"))) throw new Error("Choose one mode.");
  if (!parsed.has("backup") && !parsed.has("verify-restore")) {
    // Dry run is deliberately local: it validates the guard inputs but never
    // connects, creates directories, or invokes a database tool.
    const key = allowedEnvironmentKey(String(parsed.get("env-key") ?? process.env.SELECTIVE_BACKUP_ENV_KEY ?? ""));
    const url = process.env[key]; if (!url) throw new Error(`${key} is not set.`);
    const label = normaliseLabel(String(parsed.get("label") ?? process.env.SELECTIVE_BACKUP_ENV_LABEL ?? ""));
    const expectedEndpoint = expectedSha(String(parsed.get("expected-endpoint-sha256") ?? process.env.SELECTIVE_BACKUP_EXPECTED_ENDPOINT_SHA256 ?? ""), "Expected endpoint SHA-256");
    if (endpointSha256(url) !== expectedEndpoint) throw new Error("Database endpoint does not match the expected digest.");
    expectedSha(String(parsed.get("expected-cluster-database-sha256") ?? process.env.SELECTIVE_BACKUP_EXPECTED_CLUSTER_DATABASE_SHA256 ?? ""), "Expected cluster-database SHA-256");
    expectedSha(String(parsed.get("expected-project-set-sha256") ?? process.env.SELECTIVE_BACKUP_EXPECTED_PROJECT_SET_SHA256 ?? ""), "Expected project-set SHA-256");
    console.log(`Dry run: no database connection or filesystem writes; mode=backup environment=${label} key=${key}`);
    return;
  }
  if (parsed.has("verify-restore")) {
    const manifest = String(parsed.get("manifest") ?? process.env.SELECTIVE_BACKUP_MANIFEST ?? "");
    if (!manifest || parsed.has("target-url")) throw new Error("Restore verification requires a local manifest and no target URL.");
    await verifyRestore(manifest);
    console.log("Restore verification completed in an isolated local cluster.");
    return;
  }
  const envKey = allowedEnvironmentKey(String(parsed.get("env-key") ?? process.env.SELECTIVE_BACKUP_ENV_KEY ?? ""));
  const url = process.env[envKey]; if (!url) throw new Error(`${envKey} is not set.`);
  const config: BackupConfig = {
    envKey, databaseUrl: url, label: normaliseLabel(String(parsed.get("label") ?? process.env.SELECTIVE_BACKUP_ENV_LABEL ?? "")),
    expectedEndpointSha256: expectedSha(String(parsed.get("expected-endpoint-sha256") ?? process.env.SELECTIVE_BACKUP_EXPECTED_ENDPOINT_SHA256 ?? ""), "Expected endpoint SHA-256"),
    expectedClusterDatabaseSha256: expectedSha(String(parsed.get("expected-cluster-database-sha256") ?? process.env.SELECTIVE_BACKUP_EXPECTED_CLUSTER_DATABASE_SHA256 ?? ""), "Expected cluster-database SHA-256"),
    expectedProjectSetSha256: expectedSha(String(parsed.get("expected-project-set-sha256") ?? process.env.SELECTIVE_BACKUP_EXPECTED_PROJECT_SET_SHA256 ?? ""), "Expected project-set SHA-256"),
    outputRoot: parsed.get("output-root") ? String(parsed.get("output-root")) : undefined,
  };
  await performBackup(config);
  console.log("Snapshot backup completed; manifest contains hashes and no connection string.");
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direct) main().catch((error) => { console.error(`[selective-backup] ${safeError(error).message}`); process.exitCode = 1; });