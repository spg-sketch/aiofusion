---
name: AIO Fusion DB backups
description: How the verified scheduled Postgres backup/restore system works and why the verification gate is non-negotiable.
---

# AIO Fusion verified DB backups

Backup/restore lives in the `@workspace/scripts` package (`scripts/src/backup-db.ts`,
`scripts/src/restore-db.ts`, `scripts/src/lib/object-storage.ts`). Runbook: `backups/RESTORE.md`.

## The rule that must never be broken
A dump is only a "good backup" if it is **verified to contain the project rows**.
The gate compares `projects` rows parsed from the plain pg_dump COPY block against
the live `select count(*) from projects`, AND requires the live table to be
non-empty. On any mismatch the dump is quarantined (`*.failed`), the job exits
non-zero, and **existing backups are NOT pruned**.

**Why:** the 2026-06-12 one-off dump captured ZERO project rows while live data
existed, so there was nothing to restore from when data was lost. An unverified
empty dump silently masquerading as a backup is the exact failure this prevents.
Keep only aggregate verification metadata as evidence, never database contents.

## Durable storage, not the local folder
Verified dumps + JSON manifests go to an environment-specific object-storage
destination declared with `BACKUP_BUCKET_ID` and `BACKUP_PREFIX` (GCS via the
Replit sidecar). Enabled jobs must pass a create/read/delete probe before
touching the database. `DEPLOYMENT_ENV` and `BACKUP_ENABLED` are mandatory;
staging may be intentionally disabled rather than inheriting production storage.
The local `backups/` folder is ephemeral; new local downloads are gitignored.
`latest.json` points at the newest good backup. Retention = last
`BACKUP_RETENTION` (default 14), pruned only after a successful verify.

## Scheduling
Runs as a Replit **Scheduled Deployment** (cron, daily), command
`pnpm --filter @workspace/scripts run backup`. Must be created from the main
project's Publishing UI — a task agent cannot publish. Each deployment must
carry its own explicit database and backup-destination configuration. Never let
staging infer or reuse the production destination.

The user requires daily backups at **02:00 GMT (fixed UTC)**, not a
Europe/London daylight-saving schedule.

**Why:** The user explicitly requested daily 2am backups and clarified GMT.

**How to apply:** Use cron `0 2 * * *` with timezone UTC. Treat the runbook as
desired configuration, not proof of activation; verify scheduled run history
and the resulting private snapshot before claiming daily automation is working.

## Restore test guard
`restore:verify` restores `latest` into a scratch `TARGET_DATABASE_URL` and
asserts row count matches the manifest. It refuses to run if
`TARGET_DATABASE_URL === DATABASE_URL` (anti-footgun). pg_dump/psql 16.x come
from the `postgresql-16` nix module and match the server version.

## Download containment
Check the actual download directory and Git ignore coverage before downloading
a database backup. Keep local restore inputs in a restricted, ignored directory.

**Why:** A filtered pnpm script runs in its package directory. A relative
`backups/` destination can therefore be `scripts/backups/`, outside an ignore
rule anchored to the repository root. Automatic checkpoints can then capture
the dump, including authentication material and customer data.

**How to apply:** Verify ignore coverage for the resolved path before download,
check tracked files before completion, and retain only private object-storage
copies plus non-sensitive verification documentation.

## Backup provenance and freshness

Do not treat a production-labelled storage destination or a manifest's
`verified` flag as proof that a snapshot belongs to the current live database.
Cross-check source identity, creation time, the latest pointer, and restore
evidence before declaring production recovery coverage.

**Why:** An operational inspection found snapshots with different source counts
in the documented production destination, while its latest pointer lagged newer
objects. Creation-time row-count verification alone did not establish current
production provenance or a functioning daily schedule.

**How to apply:** Inspect safe manifest metadata without downloading database
contents. Confirm the published application's actual database target separately.
Verify scheduled run history and freshness; never repair the latest pointer by
simply choosing the newest filename.
