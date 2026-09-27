# Staging main-database recovery verification - 27 September 2026

This records a read-only verification of the staging target and a one-time
recovery check. No live database was restored, merged, reset, or changed for
this check. The account holders' Google and personal MFA sign-ins are a
separate attended verification and are **not** confirmed here.

## Protected copies

On 27 September 2026, separate full PostgreSQL dumps were made from the main
published database and the beta database. Both passed the existing backup
job's live-versus-dump project-row gate:

| Source | Live project rows | Dump project rows | Private object prefix |
| --- | ---: | ---: | --- |
| Main | 56 | 56 | `.private/db-backups/recovery-20260927/main/` |
| Beta | 38 | 38 | `.private/db-backups/recovery-20260927/beta/` |

The prefixes are in this project's bound App Storage bucket, not in the tracked
workspace or a public object search path. The older default storage environment
binding denied object writes; the project-bound bucket passed create, read,
private-access and delete checks. The upload for each source was downloaded,
its byte count and SHA-256 checked against `latest.json`, and anonymous access
to the uploaded dump was denied. Each dump was then restored separately into
an isolated, temporary local PostgreSQL database using the project's
`restore:verify` procedure. The restored main and beta project counts were 56
and 38 respectively; the required users, sessions and audit-lock tables passed
the procedure's checks. Both temporary databases and their downloaded files
were removed afterward.

These are **one-time snapshots**, not evidence that a scheduled backup job is
running. When recovery is needed, use the bound private bucket and the relevant
prefix's manifest, verify its checksum, and restore to an empty scratch database
first. Do not point `TARGET_DATABASE_URL` at either live source. Do not use the
older, inaccessible default storage binding or copy one source's MFA records
into the other.

## Uploaded media

- Main has six active Insights images with database-backed image blobs. Their
  metadata and bytes are in the full database dump; all six published staging
  image endpoints returned HTTP 200 during this check.
- Main and beta have 16 and 25 embedded project logos respectively, stored in
  database columns and included in their full dumps. Main also has one
  account-image metadata entry in the database.
- Each database has nine active Insights image records that contain only a URL,
  not an uploaded object or database blob. Their URLs are preserved in the
  database dump, but the dump cannot preserve bytes hosted elsewhere. Do not
  treat external URL availability as a verified local media backup.
- Beta has no active database-backed or object-only Insights uploads in this
  inventory. No private object was deleted or moved.

## Staging target and remaining proof

The published staging health endpoint returned HTTP 200 with bundled revision
`d47a17410cd230080136912db41bd2cb736d005b`. That revision's bootstrap
selects `PRODUCTION_DATABASE_URL` for a staging deployment; the production
deployment configuration reports `DEPLOYMENT_ENV=staging`. More concretely,
the staging site returned HTTP 200 for all six main-only database-backed image
paths, while beta has zero image blobs. This independently confirms the
published **read** path reaches the main database. The selected main database
role has INSERT and UPDATE privilege and is not in read-only transaction mode.
No synthetic write was made to live data, so a successful staging write has not
been independently demonstrated in this check. Staging activity against this
connection can affect main data.

## Beta-period inventory - do not merge silently

The read-only comparison since 23 September found two beta membership
creations, two beta sessions, three beta `content-generate` usage records, nine
beta Insights URL-only media records, and a media re-verification run. These
counts are not a complete per-person audit: sessions expire, some records have
no useful creation time, and MFA metadata has no reliable timestamp. Earlier
incident inventory noted a beta MFA enrollment; the present key-only comparison
finds three beta MFA metadata entries and 38 main entries, with no shared keys,
but cannot date or attribute an enrollment. Factor values were not read or
copied.

There are 16 active project IDs present in both sources, nine active IDs found
only in main, and eight active IDs found only in beta. These are distinct
collections, not an import queue. Retain the beta database and review any
specific beta-period work with its owner before considering a selective
transfer. Do not merge MFA, sessions, memberships or projects automatically.