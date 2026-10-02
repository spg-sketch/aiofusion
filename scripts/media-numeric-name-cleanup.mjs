import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
// Resolve pg without evaluating the application's default database pool.
const dbRequire = createRequire(require.resolve("@workspace/db"));
const { Client } = dbRequire("pg");

export function validateCleanupPlan(plan) {
  if (plan?.schemaVersion !== 1 || plan?.kind !== "numeric-news-desk-cleanup"
    || plan?.expectedRetainedUnnamed !== 641 || !Array.isArray(plan.records)
    || plan.records.length !== 10) {
    throw new Error("The approved plan must contain exactly 10 desk corrections and retain 641 unnamed records.");
  }
  const ids = new Set();
  for (const row of plan.records) {
    if (!Number.isSafeInteger(row.id) || row.id < 1 || ids.has(row.id)
      || typeof row.beforeFirstName !== "string" || !/^\d{4}$/.test(row.beforeFirstName)
      || typeof row.lastName !== "string" || row.lastName.trim().toLowerCase() !== "news desk"
      || !/^[a-f0-9]{32}$/.test(row.preservedFingerprint ?? "")) {
      throw new Error("Invalid or duplicate record in the approved cleanup plan.");
    }
    ids.add(row.id);
  }
  return createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}

const retainedQuery = `SELECT count(*)::int AS count FROM media_contacts
  WHERE deleted_at IS NULL AND account_id IS NULL
    AND btrim(first_name) ~ '^[0-9]{4}$' AND btrim(last_name) = ''`;
const contactsQuery = `SELECT c.id, c.first_name AS "firstName", c.last_name AS "lastName",
  md5((to_jsonb(c) - 'first_name')::text) AS fingerprint
  FROM media_contacts c WHERE c.id = ANY($1::int[]) AND c.deleted_at IS NULL AND c.account_id IS NULL
  ORDER BY c.id FOR UPDATE`;

/** Only first_name is changed. Even contact timestamps are preserved. No DDL. */
export async function repairNumericDeskNames({ client, plan, apply = false, approvalDigest }) {
  const digest = validateCleanupPlan(plan);
  if (apply && approvalDigest !== digest) throw new Error("Exact cleanup-plan approval digest is required.");
  const auditKey = `media-db:numeric-name-cleanup:${digest}`;
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
  try {
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    await client.query("SET LOCAL lock_timeout = '5s'");
    const { rows } = await client.query(contactsQuery, [plan.records.map((record) => record.id)]);
    const { rows: retained } = await client.query(retainedQuery);
    if (retained[0]?.count !== plan.expectedRetainedUnnamed || rows.length !== plan.records.length) {
      throw new Error("Database inventory differs from the reviewed production plan. No changes allowed.");
    }
    const byId = new Map(rows.map((row) => [row.id, row]));
    const { rows: previousAudit } = await client.query("SELECT value FROM platform_meta WHERE key = $1", [auditKey]);
    const alreadyApplied = previousAudit.length > 0;
    for (const expected of plan.records) {
      const actual = byId.get(expected.id);
      if (actual?.firstName !== (alreadyApplied ? "" : expected.beforeFirstName)
        || actual?.lastName !== expected.lastName || actual?.fingerprint !== expected.preservedFingerprint) {
        throw new Error("A reviewed record changed or the target database does not match. No changes allowed.");
      }
    }
    if (!apply || alreadyApplied) {
      await client.query("ROLLBACK");
      return { status: alreadyApplied ? "already-applied" : "preview", digest, corrected: alreadyApplied ? 10 : 0, candidates: 10, retained: retained[0].count };
    }
    // Persist the reversible field-level backup in the same transaction as the correction.
    // No emails, phones or other personal data are copied into this audit.
    await client.query("INSERT INTO platform_meta (key, value) VALUES ($1, $2)", [
      auditKey,
      JSON.stringify({ kind: plan.kind, approvalDigest: digest, appliedAt: new Date().toISOString(),
        records: plan.records.map((record) => ({ ...record, afterFirstName: "" })), retainedUnnamed: retained[0].count }),
    ]);
    for (const record of plan.records) {
      const result = await client.query(`UPDATE media_contacts SET first_name = ''
        WHERE id = $1 AND first_name = $2 AND last_name = $3
          AND account_id IS NULL AND deleted_at IS NULL RETURNING id`,
      [record.id, record.beforeFirstName, record.lastName]);
      if (result.rows.length !== 1) throw new Error("A contact correction did not match its approved record.");
    }
    const { rows: after } = await client.query(contactsQuery, [plan.records.map((record) => record.id)]);
    if (after.some((row) => row.firstName !== "" || row.fingerprint !== byId.get(row.id)?.fingerprint)
      || after.length !== rows.length
      || (await client.query(retainedQuery)).rows[0]?.count !== plan.expectedRetainedUnnamed) {
      throw new Error("Preservation check failed. Rolling back the entire cleanup.");
    }
    await client.query("COMMIT");
    return { status: "applied", digest, corrected: 10, retained: retained[0].count, unrelatedContactFieldsUnchanged: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const planIndex = args.indexOf("--plan");
  const approvalIndex = args.indexOf("--approve-digest");
  if (planIndex < 0 || !args[planIndex + 1]) throw new Error("Use --plan FILE; applying also requires --apply --approve-digest DIGEST.");
  const plan = JSON.parse(await readFile(args[planIndex + 1], "utf8"));
  validateCleanupPlan(plan);
  if (!process.env.PRODUCTION_DATABASE_URL) throw new Error("The protected production connection is required; no development fallback is allowed.");
  const client = new Client({ connectionString: process.env.PRODUCTION_DATABASE_URL,
    connectionTimeoutMillis: 10000, query_timeout: 15000, application_name: "approved-numeric-desk-cleanup" });
  try {
    await client.connect();
    console.log(JSON.stringify(await repairNumericDeskNames({ client, plan,
      apply: args.includes("--apply"), approvalDigest: approvalIndex >= 0 ? args[approvalIndex + 1] : undefined })));
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    // Never print a connection string, database exception payload or contact data.
    console.error("Numeric desk cleanup failed validation or connection checks. No partial changes are permitted.");
    process.exitCode = 1;
  });
}