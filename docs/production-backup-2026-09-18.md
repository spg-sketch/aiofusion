# Pre-import backup verification, 18 September 2026

The explicit production connection was used for a fresh full schema-and-data
backup before the proposed V33 import. No media import was performed.

- Backup: `aio-fusion-db-20260918-140833.sql.gz`
- SHA-256: `2a11715d24836d17a328e215feb87ad821e3e622863654b302a8f433f8623229`
- Durable bucket: `replit-objstore-802dbaf4-ecde-4956-b539-7205f1d4aed4`
- Object: `.private/db-backups/aio-fusion-db-20260918-140833.sql.gz`

The approved backup command reported 38 live projects and 38 projects in the
dump, uploaded the gzip and manifest, and made it the latest verified backup.
The stored file was downloaded, passed gzip integrity checking, and was fully
restored with `ON_ERROR_STOP` into disposable local PostgreSQL. Its checksum
matched the backup notification. The disposable restored database was stopped
and removed.

| Restored aggregate | Count |
|---|---:|
| Projects | 38 |
| Active media contacts | 276 |
| Active media outlets | 85 |
| Media import batches | 0 |

This proves recovery of this snapshot, not the deployed API's database binding,
Master approval of an import, or a completed import. Recheck freshness and the
intended target before resuming the import. MFA recovery and the media import
are separate operations.

The local downloaded copy was accidentally tracked during verification and has
since been removed from the current source tree/index and local Git history.
Remote/checkpoint exposure assessment remains unresolved; see
`backup-containment-status.md`.