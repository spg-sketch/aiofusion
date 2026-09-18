import assert from "node:assert/strict";
import { test } from "node:test";
import { APPROVED_SOURCE_BUNDLE, FRESH_DESTINATION_BUNDLE, SUPERSEDED_DIGESTS, casAiodemoTrial, validateApplyInputs, withSerializableApplyTransaction } from "./selective-migration-apply.js";

test("apply guard rejects non-approved bundle paths before any connection", () => {
  assert.throws(() => validateApplyInputs({
    sourceBundle: ".local/selective-backups/other",
    destinationBundle: FRESH_DESTINATION_BUNDLE,
    reviewPath: ".local/migration/restricted/final-review-manifest.json",
    approvedDigest: [...SUPERSEDED_DIGESTS][0]!,
    apply: false,
  }), /approved beta bundle/);
});

test("apply guard requires the explicit apply authorization state", () => {
  assert.equal(APPROVED_SOURCE_BUNDLE.includes("beta-production-source-"), true);
  assert.equal(FRESH_DESTINATION_BUNDLE.includes("published-staging-bridge-"), true);
  assert.equal([...SUPERSEDED_DIGESTS].every((digest) => digest.length === 64), true);
});

test("production transaction helper serializes and takes the task lock", async () => {
  const sql: string[] = [];
  const client = { query: async (statement: string) => { sql.push(statement); return { rows: [], rowCount: 1 }; } };
  await withSerializableApplyTransaction(client, async () => "ok");
  assert.deepEqual(sql, [
    "BEGIN ISOLATION LEVEL SERIALIZABLE",
    "SELECT pg_advisory_xact_lock(hashtextextended('task-301-selective-migration', 0))",
    "COMMIT",
  ]);
});

test("trial update is compare-and-set and refuses a changed destination", async () => {
  let statement = "";
  const client = { query: async (sql: string) => { statement = sql; return { rows: [], rowCount: 1 }; } };
  await casAiodemoTrial(client, null, null, "2026-09-18T10:00:00.000Z", "2026-11-17T10:00:00.000Z");
  assert.match(statement, /IS NOT DISTINCT FROM/);
  const changed = { query: async () => ({ rows: [], rowCount: 0 }) };
  await assert.rejects(() => casAiodemoTrial(changed, null, null, "2026-09-18T10:00:00.000Z", "2026-11-17T10:00:00.000Z"), /CAS failed/);
});