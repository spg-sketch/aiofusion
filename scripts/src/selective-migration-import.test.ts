import assert from "node:assert/strict";
import { test } from "node:test";
import { computeManifestSha256 } from "./selective-migration-readiness.js";
import { rowFingerprint, runSelectiveImport, validateImportManifest, type ImportManifest, type ImportTransaction } from "./selective-migration-import.js";

const base = {
  external: true as const, frozen: true as const, reviewed: true as const,
  sourceEndpoint: "postgres://source.example/beta",
  destinationEndpoint: "postgres://target.example/staging",
  rows: [{ table: "projects", sourceKey: "p1", conflictKeys: ["id"], values: { id: "p1", name: "A" } }],
  expectedFingerprints: { source: { schema: "s", rows: "r" }, destination: { schema: "s", rows: "r" } },
};
function manifest(): ImportManifest {
  const value = { ...base, sha256: "" } as ImportManifest;
  value.sha256 = computeManifestSha256(value as never);
  return value;
}
test("rejects same database and forbidden credential tables", () => {
  const m = { ...manifest(), sourceEndpoint: "postgres://same/db", destinationEndpoint: "postgres://same/db" };
  m.sha256 = computeManifestSha256(m as never);
  assert.throws(() => validateImportManifest(m), /same database/);
  const forbidden = { ...manifest(), rows: [{ table: "platform_sessions", sourceKey: "x", conflictKeys: ["sid"], values: { sid: "x" } }] };
  forbidden.sha256 = computeManifestSha256(forbidden as never);
  assert.throws(() => validateImportManifest(forbidden), /forbidden/);
});
test("dry run never opens the transaction", async () => {
  let began = false;
  const tx: ImportTransaction = { begin: async () => { began = true; }, commit: async () => {}, rollback: async () => {}, recordProvenance: async () => {}, findProvenance: async () => null, insertRow: async () => {}, deleteImportedRow: async () => {}, query: async <T = Record<string, unknown>>() => ({ rows: [] as T[] }) };
  const report = await runSelectiveImport({ manifest: manifest(), transaction: tx });
  assert.equal(report.mode, "dry-run");
  assert.equal(began, false);
});
test("apply requires scratch approval and rolls back on collision", async () => {
  let rolledBack = false;
  const tx: ImportTransaction = { begin: async () => {}, commit: async () => {}, rollback: async () => { rolledBack = true; }, recordProvenance: async () => {}, findProvenance: async () => null, insertRow: async () => {}, deleteImportedRow: async () => {}, query: async <T = Record<string, unknown>>() => ({ rows: [{} as T] }) };
  const m = manifest();
  await assert.rejects(() => runSelectiveImport({ manifest: m, transaction: tx, apply: true, observedFingerprints: m.expectedFingerprints, destinationApproval: { approved: true, scratchOnly: true, manifestSha256: m.sha256, destinationEndpoint: m.destinationEndpoint } }), /collision/);
  assert.equal(rolledBack, true);
});
test("token usage is accepted as diagnostic history", () => {
  const m = manifest();
  const token = { ...m, rows: [{ table: "token_usage", sourceKey: "u", conflictKeys: ["id"], values: { id: 1, account_id: "a", operation: "x", model: "m", input_tokens: 1, output_tokens: 2, created_at: "2020-01-01" } }] } as ImportManifest;
  token.sha256 = computeManifestSha256(token as never);
  assert.doesNotThrow(() => validateImportManifest(token));
});
test("password-like columns are rejected", () => {
  const m = { ...manifest(), rows: [{ table: "projects", sourceKey: "p", conflictKeys: ["id"], values: { id: "p", password_hash: "x" } }] } as ImportManifest;
  m.sha256 = computeManifestSha256(m as never);
  assert.throws(() => validateImportManifest(m), /invalid columns/);
});

test("allows only the deterministic passwordless SSO bridge sentinel", () => {
  const value = manifest();
  value.rows = [{
    table: "platform_accounts",
    sourceKey: "platform_accounts:natalie1990",
    conflictKeys: ["username"],
    values: {
      username: "natalie1990",
      password_hash: "sso-only-no-password",
      role: "agency",
      parent: "admin",
      status: "active",
    },
  }];
  value.sha256 = computeManifestSha256(value as never);
  assert.doesNotThrow(() => validateImportManifest(value));
  value.rows = [{
    ...value.rows[0]!,
    values: { ...value.rows[0]!.values, password_hash: "scrypt$copied$credential" },
  }];
  value.sha256 = computeManifestSha256(value as never);
  assert.throws(() => validateImportManifest(value), /invalid columns/);
});
test("composite key must be exact", () => {
  const m = { ...manifest(), rows: [{ table: "audit_locks", sourceKey: "x", conflictKeys: ["project_id"], values: { project_id: "p", audit_type: "a", owner: "o", last_run_at: "2020-01-01" } }] } as ImportManifest;
  m.sha256 = computeManifestSha256(m as never);
  assert.throws(() => validateImportManifest(m), /conflict keys/);
});
test("apply refuses fingerprint drift", async () => {
  const m = manifest();
  const tx = { begin: async () => {}, commit: async () => {}, rollback: async () => {}, recordProvenance: async () => {}, findProvenance: async () => null, insertRow: async () => {}, deleteImportedRow: async () => {}, query: async <T = Record<string, unknown>>() => ({ rows: [] as T[] }) } satisfies ImportTransaction;
  await assert.rejects(() => runSelectiveImport({ manifest: m, transaction: tx, apply: true, observedFingerprints: { source: { schema: "changed", rows: "r" }, destination: m.expectedFingerprints.destination }, destinationApproval: { approved: true, scratchOnly: true, manifestSha256: m.sha256, destinationEndpoint: m.destinationEndpoint } }), /drift/);
});
test("apply refuses adapters without atomic provenance", async () => {
  const m = manifest();
  const tx = { begin: async () => {}, commit: async () => {}, rollback: async () => {}, query: async <T = Record<string, unknown>>() => ({ rows: [] as T[] }) } as unknown as ImportTransaction;
  await assert.rejects(() => runSelectiveImport({ manifest: m, transaction: tx, apply: true, observedFingerprints: m.expectedFingerprints, destinationApproval: { approved: true, scratchOnly: true, manifestSha256: m.sha256, destinationEndpoint: m.destinationEndpoint } }), /provenance/);
});
test("retry with unchanged provenance skips insertion", async () => {
  const m = manifest(); let inserts = 0;
  const prior = { manifestSha256: m.sha256, table: "projects", sourceKey: "p1", destinationKey: { id: "p1" }, insertedFingerprint: "bad" };
  const tx = { begin: async () => {}, commit: async () => {}, rollback: async () => {}, recordProvenance: async () => {}, findProvenance: async () => prior, insertRow: async () => { inserts++; }, deleteImportedRow: async () => {}, query: async <T = Record<string, unknown>>() => ({ rows: [{ id: "p1", name: "A" }] as T[] }) } satisfies ImportTransaction;
  // A mismatched fingerprint is deliberately refused rather than silently skipped.
  await assert.rejects(() => runSelectiveImport({ manifest: m, transaction: tx, apply: true, observedFingerprints: m.expectedFingerprints, destinationApproval: { approved: true, scratchOnly: true, manifestSha256: m.sha256, destinationEndpoint: m.destinationEndpoint } }), /retry refused/);
  assert.equal(inserts, 0);
});
test("retry report counts provenance matches as skipped, not inserted", async () => {
  const m = manifest();
  const prior = { manifestSha256: m.sha256, table: "projects", sourceKey: "p1", destinationKey: { id: "p1" }, insertedFingerprint: rowFingerprint(m.rows[0]!.values) };
  const tx = { begin: async () => {}, commit: async () => {}, rollback: async () => {}, recordProvenance: async () => {}, findProvenance: async () => prior, insertRow: async () => { throw new Error("must not insert"); }, deleteImportedRow: async () => {}, query: async <T = Record<string, unknown>>() => ({ rows: [m.rows[0]!.values as T] }) } satisfies ImportTransaction;
  const report = await runSelectiveImport({ manifest: m, apply: true, observedFingerprints: m.expectedFingerprints, destinationApproval: { approved: true, scratchOnly: true, manifestSha256: m.sha256, destinationEndpoint: m.destinationEndpoint }, transaction: tx });
  assert.equal(report.inserted, 0);
  assert.equal(report.skipped, 1);
});
test("row fingerprints treat database JSON and timestamps as their source values", () => {
  assert.equal(rowFingerprint({ data: "{\"owner\":\"admin\"}", at: "2026-09-17T18:00:00.000Z" }),
    rowFingerprint({ data: { owner: "admin" }, at: new Date("2026-09-17T18:00:00.000Z") }));
});