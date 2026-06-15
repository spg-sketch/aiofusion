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
`backups/aio-fusion-db-20260612-*.sql(.gz)` are kept tracked as evidence only.

## Durable storage, not the local folder
Verified dumps + JSON manifests go to **object storage** under
`<PRIVATE_OBJECT_DIR>/db-backups/` (GCS via the Replit sidecar — same auth block
the api-server uses). The local `backups/` folder is ephemeral; new local
downloads are gitignored. `latest.json` points at the newest good backup.
Retention = last `BACKUP_RETENTION` (default 14), pruned only after a successful verify.

## Scheduling
Runs as a Replit **Scheduled Deployment** (cron, daily), command
`pnpm --filter @workspace/scripts run backup`. Must be created from the main
project's Publishing UI — a task agent cannot publish. Production deployment must
carry the same DATABASE_URL + object-storage env vars.

## Restore test guard
`restore:verify` restores `latest` into a scratch `TARGET_DATABASE_URL` and
asserts row count matches the manifest. It refuses to run if
`TARGET_DATABASE_URL === DATABASE_URL` (anti-footgun). pg_dump/psql 16.x come
from the `postgresql-16` nix module and match the server version.
