import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  canonicalizeDatabaseUrl, connectionEnvironment, endpointSha256, normaliseLabel,
  outputPath, sameDatabaseEndpoint, verifyFileChecksum, main,
} from "./selective-backup.js";

test("canonical endpoint omits credentials, query, trailing slash, and default port", () => {
  const a = "postgresql://alice:secret@DB.Example.test:5432/app///?sslmode=require&pgbouncer=true";
  const b = "postgres://bob:other@db.example.test/app";
  assert.equal(canonicalizeDatabaseUrl(a), canonicalizeDatabaseUrl(b));
  assert.equal(sameDatabaseEndpoint(a, b), true);
  assert.equal(endpointSha256(a), createHash("sha256").update("postgres://db.example.test:5432/app").digest("hex"));
});

test("pooled connection options that preserve the host are an alias", () => {
  assert.equal(sameDatabaseEndpoint("postgres://u:p@pool.example.test/app?pgbouncer=true", "postgres://x@y.pool.example.test/app"), false);
  assert.equal(sameDatabaseEndpoint("postgres://u:p@pool.example.test:5432/app?sslmode=require", "postgresql://x@pool.example.test/app/"), true);
});

test("credentials are only emitted as PG environment fields, never endpoint text", () => {
  const env = connectionEnvironment("postgres://user:p%40ss@example.test:6543/app?sslmode=require");
  assert.equal(env.PGUSER, "user"); assert.equal(env.PGPASSWORD, "p@ss");
  assert.equal(env.DATABASE_URL, undefined); assert.equal(env.PGHOST, "example.test");
});

test("labels and output paths are non-secret and unique", () => {
  assert.equal(normaliseLabel("  Beta-2026 "), "beta-2026");
  assert.throws(() => normaliseLabel("postgres://secret"));
  const path = outputPath("/tmp/safe", "Beta label", "00000000-0000-4000-8000-000000000000");
  assert.equal(path, "/tmp/safe/beta-label-00000000-0000-4000-8000-000000000000");
});

test("connection parameters reject unknown values and preserve verified TLS", () => {
  assert.throws(() => connectionEnvironment("postgres://u:p@host/app?unsafe=1"), /Unsupported database URL parameter/);
  const env = connectionEnvironment("postgres://u:p@host/app?sslmode=verify-full&connect_timeout=9&statement_timeout=77");
  assert.equal(env.PGSSLMODE, "verify-full");
  assert.equal(env.PGCONNECT_TIMEOUT, "9");
  assert.match(env.PGOPTIONS ?? "", /statement_timeout=77/);
});

test("default dry-run compares the endpoint and does not create output", async () => {
  const original = process.env.BETA_DATABASE_URL;
  process.env.BETA_DATABASE_URL = "postgres://user:secret@dry-run.example/app";
  try {
    await assert.rejects(
      main([
        "--env-key", "BETA_DATABASE_URL", "--label", "beta",
        "--expected-endpoint-sha256", "0".repeat(64),
        "--expected-cluster-database-sha256", "1".repeat(64),
        "--expected-project-set-sha256", "2".repeat(64),
      ]),
      /endpoint/i,
    );
  } finally {
    if (original === undefined) delete process.env.BETA_DATABASE_URL;
    else process.env.BETA_DATABASE_URL = original;
  }
});

test("checksum mismatch is rejected and backup paths are private", () => {
  const root = mkdtempSync(join(tmpdir(), "selective-backup-test-"));
  try {
    const file = join(root, "dump"); writeFileSync(file, "dump", { mode: 0o600 }); chmodSync(file, 0o600);
    assert.equal((statSync(file).mode & 0o777), 0o600);
    assert.throws(() => verifyFileChecksum(file, "0".repeat(64)), /checksum/i);
    verifyFileChecksum(file, createHash("sha256").update("dump").digest("hex"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});