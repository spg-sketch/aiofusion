# Backup containment status

## Release hold

A full production database backup downloaded for restore verification was
accidentally tracked in the isolated task branch. The file can contain customer
data and reusable authentication material. Local history cleanup is complete,
but remote/checkpoint exposure and credential precautions remain unresolved.
Do not publish while that assessment remains open.

## Containment completed

- Removed the dump from the current Git index and working source directory.
- Moved the local restore input into the ignored `.local/backups/` area with
  restricted directory and file permissions.
- Added recursive backup ignore rules covering package-relative downloads.
- Confirmed no `.sql.gz`, `.dump` or `.backup` files remain tracked.
- The existing durable private backup remains available. No database contents
  were printed during this containment check.
- With explicit user approval, rewrote only affected local task history and
  checkpoint-related local refs. Every non-backup tree entry was preserved;
  the current HEAD tree and main-project branch identity were unchanged.
- Expired affected local task reflogs. Verified that the backup blob was absent
  from all locally referenced and reflog-reachable history.
- Removed 26 unreachable loose Git objects containing or referencing the backup,
  without pruning unrelated objects. The backup object is no longer locally
  readable, and Git's connectivity check passed.

## Scope established and limitations

The main-project branch did not contain the accidental commit. Later inspection
also found local Replit ledger and gitsafe tracking refs, which were cleaned.
The configured gitsafe remote is platform storage; changing a local tracking
ref does not delete its remote counterpart.

A read-only GitHub branch-reference check succeeded: one branch reference was
advertised, with its history already locally available. This is not a historical
access audit or proof of remote-object erasure. No remote force push, external
checkpoint deletion, live credential invalidation or real-user MFA reset has
been performed.

## Required decisions before release

1. Determine whether external Git references, collaborators, clones or platform
   checkpoints can access the snapshot. Platform-retained copies may require
   assistance from Replit Support; local Git cleanup does not prove erasure.
2. Assess and explicitly authorise invalidation/rotation of reusable
   authentication material as appropriate. Do not bulk-reset MFA while the
   retained Master access path is unresolved.

The media import remains unperformed. The MFA recovery code is not published.