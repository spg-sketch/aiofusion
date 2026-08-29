/**
 * Read-only database inventory for a proposed data cutover.
 *
 * This command deliberately uses psql rather than the application ORM so it
 * can inspect any supplied PostgreSQL DATABASE_URL without importing app
 * configuration. Every database statement issued by this file begins SELECT.
 * It never writes schema or data.
 *
 * Usage:
 *   DATABASE_URL=postgres://... INVENTORY_ENV_LABEL=production \
 *     pnpm --filter @workspace/scripts run inventory
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export interface InventoryEnvironment {
  label: string;
  isProduction: boolean;
}

export function normaliseEnvironmentLabel(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function looksProductionRelated(value: string): boolean {
  return /(^|[^a-z])(prod|production|live)([^a-z]|$)/i.test(value);
}

/**
 * A production-looking URL must always have an explicit, human-supplied label.
 * A label is required for every invocation so the report can be safely saved
 * and compared during a cutover.
 */
export function resolveInventoryEnvironment(
  labelValue: string | undefined,
  databaseUrl: string,
): InventoryEnvironment {
  const label = normaliseEnvironmentLabel(labelValue);
  if (!label) {
    throw new Error(
      "INVENTORY_ENV_LABEL is required (for example: production, staging, or restored-snapshot). " +
        "It must be a non-secret descriptive label, not a database URL.",
    );
  }
  if (label.includes("://") || label.includes("@") || label.length > 80) {
    throw new Error("INVENTORY_ENV_LABEL must be a short non-secret descriptive label.");
  }

  const databaseLooksProduction = looksProductionRelated(databaseUrl);
  const labelIdentifiesProduction =
    looksProductionRelated(label) ||
    /\brestored[-_ ]?production\b/i.test(label);
  if (databaseLooksProduction && !labelIdentifiesProduction) {
    throw new Error(
      "Refusing a production-looking DATABASE_URL with an ambiguous INVENTORY_ENV_LABEL. " +
        "Use an explicit non-secret label such as production or restored-production-snapshot.",
    );
  }
  return { label, isProduction: databaseLooksProduction || labelIdentifiesProduction };
}

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be supplied for a read-only inventory.");
  }
  return databaseUrl;
}

function postgresEnvironment(databaseUrl: string): NodeJS.ProcessEnv {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres or postgresql scheme.");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!url.hostname || !database) {
    throw new Error("DATABASE_URL must include a hostname and database name.");
  }

  const sslMode = url.searchParams.get("sslmode");
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: database,
    ...(sslMode ? { PGSSLMODE: sslMode } : {}),
  };
}

function runSelect(databaseUrl: string, query: string): string {
  const connectionEnv = postgresEnvironment(databaseUrl);
  const result = spawnSync(
    "psql",
    ["-X", "-v", "ON_ERROR_STOP=1", "-A", "-t", "-F", "\t", "-c", query],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: undefined,
        ...connectionEnv,
        PGOPTIONS: `${process.env.PGOPTIONS ?? ""} -c default_transaction_read_only=on`.trim(),
        PSQLRC: "/dev/null",
      },
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `Read-only inventory query failed: ${result.stderr || result.error?.message || "psql failed"}`,
    );
  }
  return result.stdout.trim();
}

interface TableRef {
  schema: string;
  table: string;
}

function quotedIdentifier(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function parseTableRefs(output: string): TableRef[] {
  if (!output) return [];
  return output.split("\n").map((line) => {
    const [schema, table] = line.split("\t");
    if (!schema || !table) throw new Error("Unexpected table inventory output.");
    return { schema, table };
  });
}

const TABLES_QUERY = `
SELECT n.nspname, c.relname
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p')
  AND n.nspname = 'public'
ORDER BY n.nspname, c.relname;`;

const SCHEMA_SUMMARY_QUERY = `
SELECT
  count(DISTINCT n.nspname) AS schemas,
  count(*) AS tables
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p')
  AND n.nspname = 'public';`;

const INTEGRITY_SUMMARY_QUERY = `
SELECT
  count(*) FILTER (WHERE contype = 'p') AS primary_keys,
  count(*) FILTER (WHERE contype = 'u') AS unique_constraints,
  count(*) FILTER (WHERE contype = 'f') AS foreign_keys,
  count(*) FILTER (WHERE contype = 'f' AND convalidated) AS validated_foreign_keys,
  count(*) FILTER (WHERE contype = 'f' AND NOT convalidated) AS unvalidated_foreign_keys
FROM pg_catalog.pg_constraint
WHERE connamespace = (
  SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = 'public'
);`;

const SCHEMA_FINGERPRINT_QUERY = `
SELECT
  c.table_schema,
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  COALESCE(c.column_default, '')
FROM information_schema.columns c
WHERE c.table_schema = 'public'
ORDER BY c.table_schema, c.table_name, c.ordinal_position;`;

function parseSingleRow(output: string, names: string[]): Record<string, string> {
  const values = output.split("\t");
  if (values.length !== names.length) throw new Error("Unexpected inventory summary output.");
  return Object.fromEntries(names.map((name, index) => [name, values[index] ?? "0"]));
}

async function main(): Promise<void> {
  const databaseUrl = requireDatabaseUrl();
  const environment = resolveInventoryEnvironment(
    process.env.INVENTORY_ENV_LABEL,
    databaseUrl,
  );
  const tables = parseTableRefs(runSelect(databaseUrl, TABLES_QUERY));
  const schemaSummary = parseSingleRow(
    runSelect(databaseUrl, SCHEMA_SUMMARY_QUERY),
    ["schemas", "tables"],
  );
  const integritySummary = parseSingleRow(
    runSelect(databaseUrl, INTEGRITY_SUMMARY_QUERY),
    ["primaryKeys", "uniqueConstraints", "foreignKeys", "validatedForeignKeys", "unvalidatedForeignKeys"],
  );
  const schemaFingerprint = createHash("sha256")
    .update(runSelect(databaseUrl, SCHEMA_FINGERPRINT_QUERY))
    .digest("hex");

  console.log("AIO Fusion read-only database inventory");
  console.log(`Environment label: ${environment.label}`);
  console.log(`Production review required: ${environment.isProduction ? "yes" : "no"}`);
  console.log(`Schemas: ${schemaSummary.schemas}; tables: ${schemaSummary.tables}`);
  console.log(`Column schema SHA-256: ${schemaFingerprint}`);
  console.log("Table row counts (names and counts only; no PII):");
  for (const { schema, table } of tables) {
    const qualified = `${quotedIdentifier(schema)}.${quotedIdentifier(table)}`;
    const count = runSelect(databaseUrl, `SELECT count(*) FROM ${qualified};`);
    if (!/^\d+$/.test(count)) throw new Error(`Unexpected row count for ${schema}.${table}.`);
    console.log(`  ${schema}.${table}: ${count}`);
  }
  console.log("Constraint integrity summary (catalogue metadata only):");
  console.log(`  Primary keys: ${integritySummary.primaryKeys}`);
  console.log(`  Unique constraints: ${integritySummary.uniqueConstraints}`);
  console.log(`  Foreign keys: ${integritySummary.foreignKeys}`);
  console.log(`  Validated foreign keys: ${integritySummary.validatedForeignKeys}`);
  console.log(`  Unvalidated foreign keys: ${integritySummary.unvalidatedForeignKeys}`);
  console.log("Completed with SELECT-only statements. No schema or data was changed.");
}

const isDirectExecution =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]!).href;

if (isDirectExecution) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[inventory] ${message}`);
    process.exit(1);
  });
}