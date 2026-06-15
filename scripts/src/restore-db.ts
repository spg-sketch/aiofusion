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
    throw new Error(`Restore failed: ${restore.stderr || restore.error?.message}`);
  }

  const count = spawnSync(
    "psql",
    [target, "-tAc", "select count(*) from projects"],
    { encoding: "utf8" },
  );
  if (count.status !== 0) {
    throw new Error(
      `Could not read projects after restore: ${count.stderr}`,
    );
  }
  const restored = Number((count.stdout || "").trim());

  const { prefix } = getBackupLocation();
  const bucket = getBackupBucket();
  const [manifestBuf] = await bucket
    .file(`${prefix}/${path.basename(objectName).replace(/\.sql\.gz$/, ".json")}`)
    .download();
  const expected = (JSON.parse(manifestBuf.toString("utf8")) as {
    projectsCount: number;
  }).projectsCount;

  await Promise.all([rm(gz, { force: true }), rm(sql, { force: true })]);

  if (restored !== expected) {
    throw new Error(
      `[restore] ❌ Restored projects (${restored}) != backup manifest (${expected})`,
    );
  }
  console.log(
    `[restore] ✅ Restore verified: ${restored} projects recovered from ` +
      `${path.basename(objectName)} into the scratch database.`,
  );
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

main().catch((err) => {
  console.error(`[restore] ❌ ${err?.stack || err}`);
  process.exit(1);
});
