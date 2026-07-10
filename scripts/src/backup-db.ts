/**
 * Verified, scheduled Postgres backup for AIO Fusion.
 *
 * Why this exists: a one-off dump taken on 2026-06-12 captured ZERO project
 * rows while the live DB had data, so when data was lost there was nothing to
 * restore from. This job dumps the whole database, then VERIFIES the dump
 * actually contains the project rows before it is ever trusted or kept as the
 * latest good backup. A dump that does not verify is quarantined (`.failed`)
 * and never counted as a success, and existing good backups are never pruned on
 * a failed run.
 *
 * Run manually:   pnpm --filter @workspace/scripts run backup
 * Run on a schedule: see backups/RESTORE.md (Replit Scheduled Deployment).
 */
import { spawnSync } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { getBackupBucket, getBackupLocation } from "./lib/object-storage.js";
import { notifyFailure, notifySuccess } from "./lib/notify.js";

// Keep the last N verified daily backups. One bad run can never overwrite all
// known-good backups because pruning only runs after a successful verify and
// only ever removes verified-good backups beyond this window.
const RETENTION = Number(process.env.BACKUP_RETENTION ?? "14");

interface BackupManifest {
  file: string;
  timestamp: string;
  createdAt: string;
  projectsCount: number;
  liveProjectsCount: number;
  bytesGzipped: number;
  bytesPlain: number;
  sha256: string;
  verified: true;
}

function isoStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL must be set. The backup job reuses the same database " +
        "connection as the app; do not hardcode credentials.",
    );
  }
  return url;
}

/** Count rows in the live `projects` table using psql. */
function liveProjectsCount(databaseUrl: string): number {
  const res = spawnSync(
    "psql",
    [databaseUrl, "-tAc", "select count(*) from projects"],
    { encoding: "utf8" },
  );
  if (res.status !== 0) {
    throw new Error(
      `Failed to read live projects count: ${res.stderr || res.error?.message}`,
    );
  }
  const n = Number((res.stdout || "").trim());
  if (!Number.isInteger(n)) {
    throw new Error(`Unexpected live projects count output: ${res.stdout}`);
  }
  return n;
}

/**
 * Count `projects` rows captured in a plain-text pg_dump by parsing its COPY
 * block. pg_dump escapes data values (newlines become \n, etc.) so a standalone
 * `\.` line reliably terminates the data section.
 */
function projectsRowsInDump(sql: string): number {
  const lines = sql.split("\n");
  let inCopy = false;
  let count = 0;
  for (const line of lines) {
    if (!inCopy) {
      // Match: COPY public.projects (...) FROM stdin;
      if (/^COPY\s+(public\.)?projects\s*\(.*\)\s+FROM\s+stdin;/.test(line)) {
        inCopy = true;
      }
      continue;
    }
    if (line === "\\.") break;
    count++;
  }
  return count;
}

async function gzipFile(src: string, dest: string): Promise<void> {
  await pipeline(
    createReadStream(src),
    createGzip({ level: 9 }),
    createWriteStream(dest),
  );
}

async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

async function main(): Promise<void> {
  const databaseUrl = requireDatabaseUrl();
  const stamp = isoStamp();
  const baseName = `aio-fusion-db-${stamp}`;
  const workDir = path.join(tmpdir(), "aio-fusion-backups");
  await mkdir(workDir, { recursive: true });

  const plainPath = path.join(workDir, `${baseName}.sql`);
  const gzPath = path.join(workDir, `${baseName}.sql.gz`);

  console.log(`[backup] Starting backup ${baseName} (UTC)`);

  // 1. Dump full schema + data. --no-owner/--no-privileges keeps restores clean
  //    on a fresh database that may have a different role.
  const dump = spawnSync(
    "pg_dump",
    ["--no-owner", "--no-privileges", "-f", plainPath, databaseUrl],
    { encoding: "utf8" },
  );
  if (dump.status !== 0) {
    throw new Error(`pg_dump failed: ${dump.stderr || dump.error?.message}`);
  }

  const sql = await readFile(plainPath, "utf8");

  // 2. VERIFICATION GATE. The dump must contain the project rows and match the
  //    live count. This is the whole point of the task: an empty/partial dump
  //    must never be trusted as a good backup.
  const liveCount = liveProjectsCount(databaseUrl);
  const dumpCount = projectsRowsInDump(sql);
  console.log(
    `[backup] projects rows — live=${liveCount}, in dump=${dumpCount}`,
  );

  const verifyFailed: string[] = [];
  if (!sql.includes("CREATE TABLE") && !sql.includes("public.projects")) {
    verifyFailed.push("dump does not appear to contain the schema");
  }
  if (dumpCount !== liveCount) {
    verifyFailed.push(
      `projects row count mismatch (dump ${dumpCount} != live ${liveCount})`,
    );
  }
  if (liveCount === 0) {
    verifyFailed.push(
      "live projects table is EMPTY — refusing to keep a project-less backup " +
        "as a good backup (this is exactly the silent-data-loss failure mode)",
    );
  }

  if (verifyFailed.length > 0) {
    const failedPath = `${plainPath}.failed`;
    await rename(plainPath, failedPath);
    const verifyMsg = verifyFailed.join("; ");
    console.error(
      `[backup] ❌ VERIFICATION FAILED: ${verifyMsg}`,
    );
    console.error(
      `[backup] Quarantined unverified dump at ${failedPath}. ` +
        `Existing good backups were NOT pruned. No good backup was produced.`,
    );
    await notifyFailure(
      `AIO Fusion backup VERIFICATION FAILED for ${baseName}\n` +
        `Reason: ${verifyMsg}\n` +
        `Quarantined at ${failedPath}. Existing good backups were NOT pruned.`,
      { label: "backup notify" },
    );
    process.exit(1);
  }

  // 3. Compress the verified dump and compute integrity metadata.
  await gzipFile(plainPath, gzPath);
  const [{ size: bytesPlain }, { size: bytesGzipped }, sha256] =
    await Promise.all([stat(plainPath), stat(gzPath), sha256File(gzPath)]);

  const manifest: BackupManifest = {
    file: `${baseName}.sql.gz`,
    timestamp: stamp,
    createdAt: new Date().toISOString(),
    projectsCount: dumpCount,
    liveProjectsCount: liveCount,
    bytesGzipped,
    bytesPlain,
    sha256,
    verified: true,
  };
  const manifestPath = path.join(workDir, `${baseName}.json`);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  // 4. Upload verified backup + manifest to durable object storage so it
  //    survives restarts/redeploys (the local backups/ folder is ephemeral).
  const bucket = getBackupBucket();
  const { prefix } = getBackupLocation();
  await bucket.upload(gzPath, {
    destination: `${prefix}/${baseName}.sql.gz`,
    metadata: { metadata: { verified: "true", projectsCount: String(dumpCount) } },
  });
  await bucket.upload(manifestPath, {
    destination: `${prefix}/${baseName}.json`,
    contentType: "application/json",
  });
  // A stable "latest good backup" pointer for the restore runbook.
  await bucket.file(`${prefix}/latest.json`).save(JSON.stringify(manifest, null, 2), {
    contentType: "application/json",
  });
  const successSummary =
    `AIO Fusion backup succeeded: ${baseName}.sql.gz\n` +
    `  projects: ${dumpCount} row(s) | gzipped: ${(bytesGzipped / 1024).toFixed(1)} KB | plain: ${(bytesPlain / 1024).toFixed(1)} KB\n` +
    `  sha256: ${sha256}`;
  console.log(
    `[backup] ✅ Verified backup uploaded: ${prefix}/${baseName}.sql.gz ` +
      `(${dumpCount} projects, ${bytesGzipped} bytes gzipped)`,
  );
  await notifySuccess(successSummary, { label: "backup notify" });

  // 5. Retention: prune verified backups beyond the rolling window. This only
  //    runs after a successful verify, so a bad run never deletes good backups.
  await pruneOldBackups();

  // Tidy local temp files.
  await Promise.all([
    rm(plainPath, { force: true }),
    rm(gzPath, { force: true }),
    rm(manifestPath, { force: true }),
  ]);
}

async function pruneOldBackups(): Promise<void> {
  const bucket = getBackupBucket();
  const { prefix } = getBackupLocation();
  const [files] = await bucket.getFiles({ prefix: `${prefix}/` });
  const dumps = files
    .filter((f) => f.name.endsWith(".sql.gz"))
    .map((f) => f.name)
    .sort(); // timestamped names sort chronologically
  const excess = dumps.slice(0, Math.max(0, dumps.length - RETENTION));
  if (excess.length === 0) {
    console.log(
      `[backup] Retention OK: ${dumps.length} backup(s) kept (limit ${RETENTION}).`,
    );
    return;
  }
  for (const dumpName of excess) {
    const base = dumpName.replace(/\.sql\.gz$/, "");
    await bucket.file(dumpName).delete({ ignoreNotFound: true });
    await bucket.file(`${base}.json`).delete({ ignoreNotFound: true });
    console.log(`[backup] Pruned old verified backup: ${dumpName}`);
  }
}

main().catch(async (err) => {
  const detail = err?.message || String(err);
  console.error(`[backup] ❌ Backup job failed: ${err?.stack || err}`);
  await notifyFailure(
    `AIO Fusion backup job FAILED with an unexpected error\nError: ${detail}`,
    { label: "backup notify" },
  );
  process.exit(1);
});
