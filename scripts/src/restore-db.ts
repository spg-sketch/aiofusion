/**
 * Restore / verify-restore helper for AIO Fusion database backups.
 *
 * Modes:
 *   --list                 List verified backups in object storage.
 *   --download [name]      Download a backup (default: the latest good one)
 *                          to ./backups/ as a .sql.gz file.
 *   --verify-restore       Download the latest good backup, restore it into a
 *                          throwaway TARGET_DATABASE_URL, and confirm the
 *                          projects rows come back. Used to prove the restore
 *                          path works end-to-end (see backups/RESTORE.md).
 *
 * Examples:
 *   pnpm --filter @workspace/scripts run restore:list
 *   pnpm --filter @workspace/scripts run restore:download
 *   TARGET_DATABASE_URL=postgres://... pnpm --filter @workspace/scripts run restore:verify
 */
import { spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { getBackupBucket, getBackupLocation } from "./lib/object-storage.js";
import { notifyFailure, notifySuccess } from "./lib/notify.js";

/**
 * Thrown when a verify-restore failure has already been notified inside the
 * command function. The top-level catch uses this to skip sending a second
 * (misleading "unexpected error") notification for the same event.
 */
class AlreadyNotifiedError extends Error {
  readonly alreadyNotified = true;
  constructor(message: string) {
    super(message);
    this.name = "AlreadyNotifiedError";
  }
}

async function listBackups(): Promise<
  { name: string; base: string; updated: string }[]
> {
  const bucket = getBackupBucket();
  const { prefix } = getBackupLocation();
  const [files] = await bucket.getFiles({ prefix: `${prefix}/` });
  return files
    .filter((f) => f.name.endsWith(".sql.gz"))
    .map((f) => ({
      name: f.name,
      base: path.basename(f.name),
      updated: f.metadata.updated ?? "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function latestBackupName(): Promise<string> {
  const bucket = getBackupBucket();
  const { prefix } = getBackupLocation();
  const latest = bucket.file(`${prefix}/latest.json`);
  const [exists] = await latest.exists();
  if (exists) {
    const [buf] = await latest.download();
    const manifest = JSON.parse(buf.toString("utf8")) as { file: string };
    return `${prefix}/${manifest.file}`;
  }
  const backups = await listBackups();
  if (backups.length === 0) throw new Error("No backups found in object storage.");
  return backups[backups.length - 1]!.name;
}

async function downloadTo(objectName: string, destGz: string): Promise<void> {
  const bucket = getBackupBucket();
  await mkdir(path.dirname(destGz), { recursive: true });
  await bucket.file(objectName).download({ destination: destGz });
}

async function gunzipTo(srcGz: string, destSql: string): Promise<void> {
  const { createReadStream } = await import("node:fs");
  await pipeline(
    createReadStream(srcGz),
    createGunzip(),
    createWriteStream(destSql),
  );
}

async function cmdList(): Promise<void> {
  const backups = await listBackups();
  if (backups.length === 0) {
    console.log("No verified backups found in object storage yet.");
    return;
  }
  console.log(`Verified backups (${backups.length}):`);
  for (const b of backups) {
    console.log(`  ${b.base}  (updated ${b.updated})`);
  }
  const latest = await latestBackupName();
  console.log(`Latest good backup: ${path.basename(latest)}`);
}

async function cmdDownload(nameArg?: string): Promise<void> {
  const { prefix } = getBackupLocation();
  const objectName = nameArg
    ? `${prefix}/${path.basename(nameArg)}`
    : await latestBackupName();
  const dest = path.join("backups", path.basename(objectName));
  await downloadTo(objectName, dest);
  console.log(`Downloaded ${objectName} -> ${dest}`);
}

/**
 * Tables that must exist in the restored database.
 * - projects / users: must exist AND contain at least one row (a backup with
 *   zero rows in either is not trustworthy).
 * - sessions / audit_locks: must exist but may be legitimately empty (sessions
 *   expire; audit_locks are only populated while an audit is running).
 */
const MUST_HAVE_ROWS: ReadonlyArray<string> = ["projects", "users"];
const MUST_EXIST: ReadonlyArray<string> = ["sessions", "audit_locks"];

function queryCount(dbUrl: string, table: string): { ok: boolean; count: number; error: string } {
  const res = spawnSync(
    "psql",
    [dbUrl, "-tAc", `select count(*) from ${table}`],
    { encoding: "utf8" },
  );
  if (res.status !== 0) {
    return { ok: false, count: -1, error: res.stderr || String(res.error?.message ?? "") };
  }
  const n = Number((res.stdout || "").trim());
  return { ok: true, count: Number.isInteger(n) ? n : -1, error: "" };
}

async function cmdVerifyRestore(): Promise<void> {
  const target = process.env.TARGET_DATABASE_URL;
  if (!target) {
    throw new Error(
      "TARGET_DATABASE_URL must point to a SCRATCH database to restore into. " +
        "Never point this at the live DATABASE_URL.",
    );
  }
  if (target === process.env.DATABASE_URL) {
    throw new Error(
      "Refusing to restore over the live DATABASE_URL. Use a scratch database.",
    );
  }

  const objectName = await latestBackupName();
  const work = path.join(tmpdir(), "aio-fusion-restore");
  await mkdir(work, { recursive: true });
  const gz = path.join(work, path.basename(objectName));
  const sql = gz.replace(/\.gz$/, "");

  console.log(`[restore] Downloading ${objectName}`);
  await downloadTo(objectName, gz);
  await gunzipTo(gz, sql);

  console.log(`[restore] Restoring into scratch database...`);
  const restore = spawnSync("psql", [target, "-v", "ON_ERROR_STOP=1", "-f", sql], {
    encoding: "utf8",
  });
  if (restore.status !== 0) {
    await Promise.all([rm(gz, { force: true }), rm(sql, { force: true })]);
    throw new Error(`Restore failed: ${restore.stderr || restore.error?.message}`);
  }

  await Promise.all([rm(gz, { force: true }), rm(sql, { force: true })]);

  // Fetch the manifest so we can cross-check the projects count.
  const { prefix } = getBackupLocation();
  const bucket = getBackupBucket();
  const [manifestBuf] = await bucket
    .file(`${prefix}/${path.basename(objectName).replace(/\.sql\.gz$/, ".json")}`)
    .download();
  const manifest = JSON.parse(manifestBuf.toString("utf8")) as {
    projectsCount: number;
  };

  // --- Table verification ---
  const failures: string[] = [];
  const report: string[] = [];

  for (const table of MUST_HAVE_ROWS) {
    const { ok, count, error } = queryCount(target, table);
    if (!ok) {
      failures.push(`table '${table}' is not queryable after restore: ${error}`);
      report.push(`  ❌ ${table}: query error — ${error}`);
      continue;
    }
    if (count === 0) {
      failures.push(`table '${table}' is empty after restore (expected rows > 0)`);
      report.push(`  ❌ ${table}: 0 rows (expected > 0)`);
      continue;
    }
    // Extra check: projects row count must match the manifest.
    if (table === "projects" && count !== manifest.projectsCount) {
      failures.push(
        `projects row count mismatch: restored ${count} but manifest says ${manifest.projectsCount}`,
      );
      report.push(
        `  ❌ projects: ${count} rows (manifest says ${manifest.projectsCount})`,
      );
      continue;
    }
    report.push(`  ✅ ${table}: ${count} row(s)`);
  }

  for (const table of MUST_EXIST) {
    const { ok, count, error } = queryCount(target, table);
    if (!ok) {
      failures.push(`table '${table}' does not exist or is not queryable after restore: ${error}`);
      report.push(`  ❌ ${table}: query error — ${error}`);
    } else {
      report.push(`  ✅ ${table}: ${count} row(s) (may be empty — existence confirmed)`);
    }
  }

  console.log(`[restore] Table verification results:`);
  for (const line of report) console.log(line);

  if (failures.length > 0) {
    const failureDetail =
      `[restore] ❌ Dry-run restore FAILED (${failures.length} issue(s)):\n` +
      failures.map((f) => `  • ${f}`).join("\n");
    await notifyFailure(
      `AIO Fusion dry-run restore FAILED for ${path.basename(objectName)}\n` +
        failures.map((f) => `  • ${f}`).join("\n"),
      { label: "restore notify" },
    );
    // Use AlreadyNotifiedError so the top-level catch doesn't send a second
    // (misleading "unexpected error") notification for the same failure.
    throw new AlreadyNotifiedError(failureDetail);
  }

  const backupName = path.basename(objectName);
  const restoreSummary =
    `AIO Fusion dry-run restore PASSED for ${backupName}\n` +
    `  projects: ${manifest.projectsCount} row(s) confirmed\n` +
    report.join("\n");
  console.log(
    `\n[restore] ✅ Dry-run restore PASSED: all core tables present and populated.\n` +
      `  Backup: ${backupName}\n` +
      `  projects: ${manifest.projectsCount} row(s) confirmed.`,
  );
  await notifySuccess(restoreSummary, { label: "restore notify" });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--list")) return cmdList();
  if (args.includes("--verify-restore")) return cmdVerifyRestore();
  if (args.includes("--download")) {
    const idx = args.indexOf("--download");
    const name = args[idx + 1] && !args[idx + 1]!.startsWith("--")
      ? args[idx + 1]
      : undefined;
    return cmdDownload(name);
  }
  console.log(
    "Usage: restore-db [--list | --download [name] | --verify-restore]",
  );
}

main().catch(async (err) => {
  const detail = err?.message || String(err);
  console.error(`[restore] ❌ ${err?.stack || err}`);
  // Only notify for --verify-restore (scheduled), not --list/--download
  // (interactive). Skip if the error was already notified inside the command
  // function (AlreadyNotifiedError) to avoid duplicate alerts.
  const alreadyNotified =
    err instanceof AlreadyNotifiedError || err?.alreadyNotified === true;
  if (process.argv.includes("--verify-restore") && !alreadyNotified) {
    await notifyFailure(
      `AIO Fusion restore:verify FAILED with an unexpected error\nError: ${detail}`,
      { label: "restore notify" },
    );
  }
  process.exit(1);
});
