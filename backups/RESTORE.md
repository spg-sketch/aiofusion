# Database backups & restore runbook

Automatic, **verified** Postgres backups for AIO Fusion. The whole point of this
system is that an empty or partial dump can **never** be trusted as a good
backup — every dump is checked against the live database before it is kept.

> Background: a one-off dump taken on **2026-06-12** captured **zero project
> rows** while the live database had data, so when data was lost there was
> nothing to restore from. `backups/aio-fusion-db-20260612-151628.sql(.gz)` is
> kept only as evidence of that failure mode — it is **not** a usable backup.

## What the backup job does

`scripts/src/backup-db.ts` (`pnpm --filter @workspace/scripts run backup`):

1. **Checks its destination before touching the database.** Enabled jobs create,
   read, and delete a harmless unique probe under their configured backup prefix.
   A failed probe stops the run before `pg_dump`.
2. **Dumps** the full database (schema + data) with `pg_dump` using the app's
   `DATABASE_URL` (no hardcoded credentials).
3. **Verifies** the dump before trusting it:
   - the dump contains the schema and the `projects` table, and
   - the number of `projects` rows in the dump **equals** the live count, and
   - the live `projects` table is **non-empty**.
   If any check fails, the dump is renamed `*.failed`, a loud error is logged,
   the job exits non-zero, and **existing good backups are left untouched** (no
   pruning). A project-less dump is never kept as the "latest good" backup.
4. **Uploads** the verified, gzipped dump plus a JSON manifest (row count,
   sha256, sizes, timestamp) to **object storage** under the explicit
   `BACKUP_BUCKET_ID` and `BACKUP_PREFIX`. Object storage is durable and survives
   container restarts / redeploys — unlike the local `backups/` folder. A
   `latest.json` pointer always names the most recent good backup.
5. **Prunes** old backups beyond the rolling retention window
   (`BACKUP_RETENTION`, default **14**). Pruning runs **only after a successful
   verify**, so one bad run can never delete all known-good backups.

## Failure notifications (email via Resend)

Backup and restore alerts are sent as plain-text emails via Resend — the same
`RESEND_API_KEY` and `RESEND_FROM` used by the API server for all other
operational alerts (spend spikes, quota breaches, sign-ups, approvals). No
separate secret is needed.

| Event | Notification |
|---|---|
| Backup succeeds | ✅ summary: backup name, project row count, compressed size, sha256 |
| Backup verification fails | ❌ failure reason + quarantine path |
| Backup job crashes (unexpected error) | ❌ error detail |
| `restore:verify` passes | ✅ summary: backup name, all table row counts |
| `restore:verify` fails | ❌ failed table checks |
| `restore:verify` crashes (unexpected error) | ❌ error detail |

If `RESEND_API_KEY` is **not set**, all notification calls log a `⚠️` console
warning and continue — the backup job is never interrupted by a missing key.

A delivery failure (Resend API error or network issue) also prints a `⚠️`
console warning but **never** crashes the backup or restore job.

Every backup notification names the deployment environment and destination
identifier (`staging:...` or `production:...`). It never includes database or
object-storage credentials.

### Required environment variables

Backup storage is deployment-specific and must not be inferred from
`PRIVATE_OBJECT_DIR`. Configure each Scheduled Deployment explicitly:

```
DEPLOYMENT_ENV=production
BACKUP_ENABLED=true
BACKUP_BUCKET_ID=<production bucket ID>
BACKUP_PREFIX=.private/db-backups
RESEND_API_KEY=re_...          # Resend API key (same as the app)
RESEND_FROM=AIO Fusion Alerts <info@aiofusion.ai>   # optional — this is the default
```

Production uses its separately provisioned and verified production bucket.
Staging must either use its own writable destination:

```
DEPLOYMENT_ENV=staging
BACKUP_ENABLED=true
BACKUP_BUCKET_ID=<staging bucket ID>
BACKUP_PREFIX=.private/db-backups
```

or be intentionally disabled:

```
DEPLOYMENT_ENV=staging
BACKUP_ENABLED=false
```

Do not point staging at the production bucket. A disabled job exits successfully
without reading the database, sending an alert, or producing a dump.

You can smoke-test the backup alert from the admin panel: **Admin →
Test email alerts** sends one of each alert type including a backup failure
test, so you can confirm delivery before the next scheduled run.

## Schedule (automatic, no human action)

Run as a **Replit Scheduled Deployment** (cron-style job that does not depend on
a long-lived in-process timer):

1. Open the **Publishing / Deployments** tool → **Create deployment** →
   **Scheduled**.
2. **Requested schedule:** daily at **02:00 GMT**, cron `0 2 * * *`,
   timezone **UTC**. This is fixed GMT, not Europe/London: it must not move with
   British Summer Time. These are configuration instructions, not evidence that
   a scheduled job is active.
3. **Build command:** `pnpm install --frozen-lockfile`
4. **Run command:** bind the same explicit main database secret used by the live
   application's bootstrap, and reject an absent or beta target:
   ```bash
   test -n "$PRODUCTION_DATABASE_URL" && test "$PRODUCTION_DATABASE_URL" != "$BETA_DATABASE_URL" && DATABASE_URL="$PRODUCTION_DATABASE_URL" pnpm --filter @workspace/scripts run backup
   ```
5. Make the existing `PRODUCTION_DATABASE_URL` secret available to the backup
   job through the secure deployment settings; never paste it into source code
   or logs. Set `DEPLOYMENT_ENV`, `BACKUP_ENABLED`, and, when enabled,
   `BACKUP_BUCKET_ID` plus `BACKUP_PREFIX` explicitly for that deployment.
   Production destination:
   `BACKUP_BUCKET_ID=replit-objstore-802dbaf4-ecde-4956-b539-7205f1d4aed4`,
   `BACKUP_PREFIX=.private/db-backups`, `DEPLOYMENT_ENV=production`,
   `BACKUP_ENABLED=true`. Default retention is 14 successful snapshots.
   Keep the live web app's deployment type unchanged; this is a backup job,
   not a replacement for the web deployment.

After activation, confirm the next-run timestamp is 02:00 UTC, inspect the first
scheduled run's success, and verify that a new private backup and matching
manifest appeared. A successful manual run does not prove the schedule works.

> Scheduling must be created from the **main** project (the Publishing UI), not
> from a task agent. After this change is merged, set up the scheduled
> deployment once as above. Optionally tune retention with a `BACKUP_RETENTION`
> env var on the deployment.

## Inspecting backups

```bash
pnpm --filter @workspace/scripts run restore:list        # list verified backups + latest
pnpm --filter @workspace/scripts run restore:download     # download latest good backup to ./backups/
pnpm --filter @workspace/scripts run restore:download aio-fusion-db-YYYYMMDD-HHMMSS.sql.gz
```

## Restoring a backup

**Always restore into a scratch/empty database first and verify the row counts
before pointing anything at it.** Never restore directly over a live database
unless you have confirmed the backup is the one you want.

1. **Download** the backup you want (defaults to the latest verified one):
   ```bash
   pnpm --filter @workspace/scripts run restore:download
   gunzip backups/aio-fusion-db-YYYYMMDD-HHMMSS.sql.gz
   ```
2. **Restore** into the target database (use a scratch DB URL):
   ```bash
   psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -f backups/aio-fusion-db-YYYYMMDD-HHMMSS.sql
   ```
3. **Confirm** the project rows came back:
   ```bash
   psql "$TARGET_DATABASE_URL" -tAc "select count(*) from projects"
   ```
   This count must match `projectsCount` in the backup's `*.json` manifest.

### Automated dry-run restore test (proves the path works end-to-end)

`pnpm --filter @workspace/scripts run restore:verify` downloads the latest
verified backup from object storage, restores it into a **throwaway** scratch
database, and confirms that all four core tables are present and populated:

| Table | Assertion |
|---|---|
| `projects` | exists + row count matches the backup manifest |
| `users` | exists + at least one row |
| `sessions` | exists (may be empty — sessions expire) |
| `audit_locks` | exists (may be empty — only set during live audits) |

The script exits **non-zero** and prints a clear `❌` failure message if any
check fails. It refuses to run if `TARGET_DATABASE_URL` equals the live
`DATABASE_URL`, as a safety guard against accidentally overwriting production.

Run before any major release or whenever you want confidence that the backup is
genuinely recoverable:

```bash
# 1. Create a throwaway scratch database
psql "$DATABASE_URL" -c "CREATE DATABASE aio_fusion_restore_test"

# 2. Run the dry-run restore (downloads latest backup, restores, verifies)
TARGET_DATABASE_URL="$(node -e "const u=new URL(process.env.DATABASE_URL);u.pathname='/aio_fusion_restore_test';console.log(u.toString())")" \
  pnpm --filter @workspace/scripts run restore:verify

# 3. Drop the scratch database when done
psql "$DATABASE_URL" -c "DROP DATABASE aio_fusion_restore_test"
```

Expected output on success:
```
[restore] Downloading db-backups/aio-fusion-db-YYYYMMDD-HHMMSS.sql.gz
[restore] Restoring into scratch database...
[restore] Table verification results:
  ✅ projects: N row(s)
  ✅ users: N row(s)
  ✅ sessions: N row(s) (may be empty — existence confirmed)
  ✅ audit_locks: N row(s) (may be empty — existence confirmed)

[restore] ✅ Dry-run restore PASSED: all core tables present and populated.
  Backup: aio-fusion-db-YYYYMMDD-HHMMSS.sql.gz
  projects: N row(s) confirmed.
```

This procedure was validated end-to-end on 2026-06-15: a verified backup
(8 projects) was restored into a scratch database and all 8 project rows came
back intact.
