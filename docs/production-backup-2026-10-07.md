# Production backup and isolated restore verification — 7 October 2026

## Scope and source

The user authorised a fresh backup of the live application database and a
restore test into an isolated temporary database. No production restore,
production data changes, schedule changes, or previous-backup deletions occurred.

Deployment metadata confirmed the public, successfully built production app at
`https://aiofusion.ai`, with `DEPLOYMENT_ENV=production`. The backup source was
explicitly bound using the application's published bootstrap binding:
`PRODUCTION_DATABASE_URL`, with the beta-target exclusion check.
Read-only source checks reported 63 projects both before and after the operation.
This did not rely on the database pane's implicit production target.

## Durable recovery snapshot

- File: `aio-fusion-db-20261007-102551.sql.gz`
- Manifest creation time: `2026-10-07T10:26:57.150Z`
- Private bucket: `replit-objstore-802dbaf4-ecde-4956-b539-7205f1d4aed4`
- Prefix: `.private/db-backups`
- Compressed size: 21,249,683 bytes
- SHA-256: `25ac023e9b878473d02b080ac4853d032b554ab82330d1dce9f7743901cd8049`
- Verified projects: 63

The existing backup script passed its storage capability and project-count
checks, uploaded the dump and manifest, and updated `latest.json`. Retention
was overridden for this process only to preserve all previous snapshots.

## Restore evidence

The uploaded object was downloaded directly from private storage into restricted
temporary storage outside the workspace. Its SHA-256 and compressed byte size
matched the stored manifest; gzip decompression succeeded.

The full SQL was restored with `ON_ERROR_STOP=1` into a newly initialised local
PostgreSQL instance with TCP listening disabled and a private Unix socket.
All 90 COPY-section table counts matched the dump, covering 84,061 rows in total.
The restored project count also matched the manifest's 63 projects.

The temporary PostgreSQL instance was stopped and its data directory and all
local dump inputs were removed. No database contents or credentials were
printed, committed, or retained in project files.

## Limits

This proves recovery of this database snapshot, not future daily automation,
email delivery, application behaviour after a disaster, independent App Storage
file recovery, or recovery of deployment secrets and external-service settings.
The previously identified scheduling, separate-file coverage, and historical
backup-containment follow-ups are not closed by this operation.
