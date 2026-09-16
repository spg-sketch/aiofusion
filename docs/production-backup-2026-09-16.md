# Production backup verification, 16 September 2026

## Result

A full schema-and-data export was taken from the configured production connection at 08:50:02 UTC. The connection's project-set fingerprint and aggregate counts matched the production read-only query tool before export.

The compressed export was checksum-checked, decompressed and successfully restored with `ON_ERROR_STOP` into a new disposable local PostgreSQL instance. The restored counts and project-set fingerprint matched the source. The disposable database was stopped and removed.

| Check | Result |
|---|---:|
| Projects | 30 |
| Media contacts | 276 |
| Media outlets | 85 |
| Platform accounts | 17 |
| Platform users | 17 |
| Compressed bytes | 1,239,561 |

Filename: `aio-fusion-db-20260916-085002.sql.gz`

SHA-256: `416f854f846d1021bc9eef799a4bf7fc9c9a2587f85d5cc302842c7d601b7a38`

## Durable private copy verified

The original configured bucket rejected access with `no allowed resources`. The user created a new bucket through App Storage. The new bucket supports authenticated uploads and downloads; anonymous reads of both a harmless probe and the uploaded backup returned HTTP 403.

The exact test-restored gzip and its verification manifest are now stored durably in bucket `replit-objstore-802dbaf4-ecde-4956-b539-7205f1d4aed4`, under `.private/db-backups/production/pre-media-import/20260916-084958/`. A download of the stored gzip matched the SHA-256 above. Creation-only writes prevented overwriting existing objects. No older backup was deleted or overwritten.

A restricted local copy is also retained under `.local/backups/protected-production-pre-media-import-20260916-084958/`, outside version control. The original application's storage environment variables were not changed: this one-off backup targeted the newly created bucket explicitly.

Production records were not modified. No V33 import was performed. The staging runtime-to-database binding remains a separate verification gate.

## Next operation

Durable storage and restore verification are complete for this snapshot. If significant source changes occur before the import, take and verify a fresh backup. Publishing the reviewed importer, staging runtime-to-database confirmation and the authenticated Master merge review remain separate import gates.