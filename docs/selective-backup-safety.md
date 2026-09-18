# Selective snapshot backup safety

This tooling is a **backup and restore-verification guard only**. It is not an
application importer or a rehearsal of an import. It does not call application
modules, send notifications, prune older backups, or connect a restore to a
remote database.

## Modes and required guards

`scripts/src/selective-backup.ts` is dry-run by default. A real backup requires
`--backup` and all of the following explicit values:

```sh
SELECTIVE_BACKUP_ENV_KEY=BETA_DATABASE_URL \
SELECTIVE_BACKUP_ENV_LABEL=beta \
SELECTIVE_BACKUP_EXPECTED_ENDPOINT_SHA256=... \
SELECTIVE_BACKUP_EXPECTED_CLUSTER_DATABASE_SHA256=... \
SELECTIVE_BACKUP_EXPECTED_PROJECT_SET_SHA256=... \
./scripts/node_modules/.bin/tsx scripts/src/selective-backup.ts --backup
```

The only accepted connection-variable names are
`BETA_DATABASE_URL` and `PRODUCTION_DATABASE_URL`. Labels are descriptive and
never authoritative: the endpoint digest is compared to the canonical URL
endpoint, the cluster-database digest is compared to
`sha256(system_identifier || '/' || current_database())`, and the project-set
digest is compared to the sorted `public.projects` ID set captured in the same
snapshot. All three expected SHA-256 values are explicit operator inputs.
Credentials, URL query parameters, and a trailing database slash are excluded
from endpoint identity. Host aliases are not guessed; only aliases with the
same canonical host are considered equal.

Run these examples from the workspace root. The selected connection must
already exist in protected environment settings; do not paste a URL into shell
history. The historical names do not establish source/destination roles.

Dry-run validates these guards without opening a connection, creating a
directory, or invoking a PostgreSQL tool. Backup output is a new
`.local/selective-backups/<label>-<unique-id>` directory with mode `0700`.
The custom-format dump and manifest are mode `0600`; existing paths are never
overwritten and older paths are never pruned.

## Snapshot and manifest

The backup opens one `REPEATABLE READ READ ONLY` transaction, exports one
PostgreSQL snapshot, and keeps that transaction open while `pg_dump
--snapshot` writes the custom-format dump. Credentials are supplied to
`pg_dump` only through a minimal sanitized `PG*` environment, never argv.
Startup options request read-only transactions. The manifest contains no URL,
credential, or row content. It contains schema/table counts, a column-schema
digest, a sorted SHA-256 aggregate of every row's content hash for every
reviewed user table, the project-set digest, endpoint and cluster-database
digests, and dump checksum.

The reviewed application schema set is `public`, `_system`, and `stripe`.
`_system` is allowed only for the exact ordinary
`replit_database_migrations_v1` table and its own indexes/sequences. `stripe`
is allowed only when it has no tables, views, materialized views, foreign
tables, or functions. Unknown schemas, extra `_system` relations, or any
Stripe relation/function are refused rather than omitted. Foreign objects,
subscriptions, event triggers, user triggers, untrusted functions, and
untrusted extensions are also refused. The full `pg_dump` therefore includes
the reviewed `_system` metadata while retaining a strict blocker for any
unreviewed Stripe expansion.
No database write is issued by backup.

The script resolves the already-installed `pg` package with Node's
`createRequire`; it deliberately does **not** import `@workspace/db`, because
that package starts the application's connection pool at module load.

## Isolated restore verification

Restore verification takes a local manifest and dump:

```sh
./scripts/node_modules/.bin/tsx scripts/src/selective-backup.ts \
  --verify-restore --manifest .local/selective-backups/.../manifest.json
```

Only mode-0600 regular files in the tool's own `.local/selective-backups`
bundle are accepted. This is a local path/permissions guard, not authenticated
provenance: an operator must still establish that the manifest and dump came
from the reviewed backup invocation. A same-user process can replace local
files, and a checksum alone does not make an untrusted SQL dump safe.
It first checks the dump checksum. It
then creates a unique private local
PostgreSQL cluster, starts it with `listen_addresses=''` and a private Unix
socket, creates a scratch database, and invokes `pg_restore` with
`--exit-on-error --single-transaction --no-owner --no-privileges`. It compares
all source table fingerprints, schema digest, counts, and project-set digest
after restore. The cluster is stopped and removed in `finally`, including
failure paths; if stopping fails, the directory is deliberately retained and
its safe cleanup location is reported. There is no arbitrary `TARGET_URL`
option and the application is never started.

The tool requires `initdb`, `pg_ctl`, `createdb`, `pg_dump`, and `pg_restore`
on `PATH`. It does not install dependencies, read secrets, execute a backup,
or connect to a remote database merely by being reviewed or tested.