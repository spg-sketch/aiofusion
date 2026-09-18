import assert from "node:assert/strict";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { runRehearsal } from "./selective-migration-rehearsal.js";

test("dry-run validates private bundles and remains blocked without database access", async () => {
  const root = mkdtempSync(join(tmpdir(), "rehearsal-test-"));
  const old = process.cwd();
  try {
    process.chdir(root); mkdirSync(".local/selective-backups/b", { recursive: true, mode: 0o700 });
    const dump = join(root, ".local/selective-backups/b/database.dump");
    writeFileSync(dump, "scratch", { mode: 0o600 }); chmodSync(dump, 0o600);
    const sha = createHash("sha256").update("scratch").digest("hex");
    writeFileSync(join(root, ".local/selective-backups/b/manifest.json"), JSON.stringify({
      schemaVersion: 1, dumpFile: "database.dump", dumpSha256: sha, schemaSha256: "0".repeat(64),
      clusterDatabaseSha256: "1".repeat(64), projectSetSha256: "2".repeat(64), tables: [],
    }), { mode: 0o600 });
    const report = await runRehearsal(".local/selective-backups/b", ".local/selective-backups/b", true);
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.mode, "dry-run");
    assert.equal(report.evidence.checksumVerified, true);
    assert.match(report.blockers.join("\n"), /credentials\/MFA/);
  } finally { process.chdir(old); rmSync(root, { recursive: true, force: true }); }
});