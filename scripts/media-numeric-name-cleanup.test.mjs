import { test } from "node:test";
import assert from "node:assert/strict";
import { repairNumericDeskNames, validateCleanupPlan } from "./media-numeric-name-cleanup.mjs";

function plan() {
  return { schemaVersion: 1, kind: "numeric-news-desk-cleanup", expectedRetainedUnnamed: 641,
    records: Array.from({ length: 10 }, (_, index) => ({ id: index + 1, beforeFirstName: "2396",
      lastName: "News Desk", preservedFingerprint: "a".repeat(32) })) };
}
function database(input, options = {}) {
  const calls = [];
  const rows = input.records.map((row) => ({ id: row.id, firstName: row.beforeFirstName,
    lastName: row.lastName, fingerprint: row.preservedFingerprint }));
  return { calls, query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith("SELECT count")) return { rows: [{ count: options.retained ?? 641 }] };
    if (sql.startsWith("SELECT c.id")) return { rows: rows.map((row) => ({ ...row })) };
    if (sql.startsWith("SELECT value")) return { rows: [] };
    if (sql.startsWith("UPDATE")) {
      const row = rows.find((item) => item.id === params[0]);
      row.firstName = "";
      if (options.changeOtherField) row.fingerprint = "b".repeat(32);
      return { rows: [{ id: row.id }] };
    }
    return { rows: [] };
  } };
}

test("preview performs no mutations", async () => {
  const input = plan(), client = database(input);
  assert.equal((await repairNumericDeskNames({ client, plan: input })).status, "preview");
  assert.equal(client.calls.some(({ sql }) => /^(UPDATE|INSERT|DELETE)/.test(sql)), false);
});
test("requires the exact reviewed plan digest", async () => {
  const input = plan(), client = database(input);
  await assert.rejects(repairNumericDeskNames({ client, plan: input, apply: true, approvalDigest: "wrong" }));
  assert.equal(client.calls.length, 0);
});
test("backs up original numeric values and changes only the ten first-name fields", async () => {
  const input = plan(), client = database(input);
  const result = await repairNumericDeskNames({ client, plan: input, apply: true, approvalDigest: validateCleanupPlan(input) });
  assert.equal(result.corrected, 10);
  assert.equal(result.retained, 641);
  assert.equal(client.calls.filter(({ sql }) => sql.startsWith("UPDATE")).length, 10);
  for (const call of client.calls.filter(({ sql }) => sql.startsWith("UPDATE"))) {
    assert.match(call.sql, /^UPDATE media_contacts SET first_name = ''\s+WHERE/);
    assert.doesNotMatch(call.sql, /updated_at|phone|\bDELETE\b/i);
  }
  const backup = client.calls.find(({ sql }) => sql.startsWith("INSERT"));
  assert.equal(JSON.parse(backup.params[1]).records[0].beforeFirstName, "2396");
  assert.equal(client.calls.at(-1).sql, "COMMIT");
});
test("rejects an inventory mismatch before writing", async () => {
  const input = plan(), client = database(input, { retained: 640 });
  await assert.rejects(repairNumericDeskNames({ client, plan: input, apply: true, approvalDigest: validateCleanupPlan(input) }));
  assert.equal(client.calls.some(({ sql }) => /^(UPDATE|INSERT)/.test(sql)), false);
  assert.equal(client.calls.at(-1).sql, "ROLLBACK");
});
test("rolls back if another contact field or timestamp changes", async () => {
  const input = plan(), client = database(input, { changeOtherField: true });
  await assert.rejects(repairNumericDeskNames({ client, plan: input, apply: true, approvalDigest: validateCleanupPlan(input) }));
  assert.equal(client.calls.at(-1).sql, "ROLLBACK");
});
test("cannot expand the approved scope or duplicate IDs", () => {
  const input = plan();
  input.records[1].id = input.records[0].id;
  assert.throws(() => validateCleanupPlan(input));
  assert.throws(() => validateCleanupPlan({ ...plan(), expectedRetainedUnnamed: 0 }));
});