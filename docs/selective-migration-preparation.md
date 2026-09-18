# Selective beta migration: preparation status

Date: 17 September 2026.

**Blocked, not ready to import. No application-database writes.**

This is an interim evidence summary, not an approved migration manifest. The
existing published staging database is the future live database, not a
replacement target. Beta remains live and unchanged.

The earlier review digest
`4136adc8d25d281f0318749b1f95d21d0dc56f537de76cd04f30dd1b72a86d3a` is
superseded. The mandatory fresh staging pre-import bundle
`published-staging-pre-import-a99052e7-9063-4ee3-8b21-c6aac1c51843` has schema
fingerprint `5f0a2846ab6a6d167eb3534077737d8a276a14ed6458f92e60689cbce416c243`,
50 tables rather than 49, and an unchanged project set. The drift is additive:
`media_contact_correction_reports` gained `resolution_note`, `reviewed_by` and
`source_check_id`, and `media_discoveries` was added. A replacement exact
manifest must be reviewed and approved separately; no prior approval carries
forward. The current redacted replacement review artifact has digest
`8f30fbad0280b6873b0f043c9c750809943ae69ba490a0c35182998d55d6c2f9` and
remains `reviewed=false`, `approved=false`, `applyAllowed=false`.

## Identity evidence

- Staging deployment service: `https://aio-fusion-staging.replit.app`, published,
  public, successful build.
- Beta deployment: `https://www.aiofusion.ai`, as reported by the user-provided
  independent beta Agent report. This Agent cannot directly inspect the other
  project's deployed configuration.
- The source connection matches all 15 exact project IDs, names and owners in
  that independent report, plus all four protected login candidates.
- Source and destination have different PostgreSQL cluster/database identity
  digests. Both probes used read-only transactions.
- The destination digest and project-set fingerprint independently match this
  project's production read-only database tool. The task/editor database has a
  different endpoint and project set and was not used as the destination.
- The subsequent beta Agent report independently verifies the live binding:
  its deployment service identifies the active public Autoscale deployment,
  Publishing shows "Production database connected", production metadata names
  `DATABASE_URL`, the deployed database library uses that setting, and deployment
  logs identify the API service. A query through the production database target
  returned the cluster/database fingerprint
  `28b874bf56f31cde7da00f18931cf590e0799ddab636e60dc792db7533192bca`,
  exactly matching the candidate source and saved source backup.
- Source binding verification is now satisfied by the user-supplied independent
  beta Agent evidence. This Agent did not directly access the other project's
  deployment configuration. No connection value was disclosed.

No connection strings, credential hashes, tokens or customer content are in this
document. Restricted inventories and exact stable-record references are local
under `.local/migration/restricted/`; do not commit or publicly serve them.

## Selection coverage at the read-only snapshot

| Table | Selected rows | Included deletion markers |
|---|---:|---:|
| projects | 15 | 0 |
| archive_items | 31 | 6 |
| planner_items | 31 | 2 |
| project_snapshots | 33 | n/a |
| saved_audits | 13 | 0 |
| saved_diagnostics | 12 | 0 |
| audit_locks | 38 | n/a |
| token_usage | 650 | n/a |
| saved_content_geo | 0 | 0 |
| saved_tech_geo | 0 | 0 |

These are **823 project-related candidate rows**. The isolated rehearsal's
exact delta is 826 rows after adding two new workspace rows and Natalie's
single explicitly scoped owner membership; the rehearsal does not authorize
those writes to the application database. Existing staging rows must not be
overwritten or deleted.

The source also has four selected legacy accounts, three corresponding
companies, three membership-linked human identities, three memberships and four
account-profile metadata records. One protected legacy account has no matching
company or membership. No additional parent account is required by the selected
project owners or known company hierarchy. Human-identity resolution remains
subject to security review.

### Missing-data warnings

- All 15 project rows have a non-null intake value. This is not evidence that
  every intake answer is complete.
- Two selected projects have no server-saved audit or diagnostic history; a
  further project has no saved diagnostic. One has no project snapshots.
  Browser history cannot be inferred from these absences.
- The old source planner schema has no `source_archive_id`. Do not invent
  relationships by matching titles; preserve standalone legacy planner records.
- There are 25 usage rows for selected account slugs with no project ID and
  385 rows for other projects. Neither group is silently included. Determine
  how account-wide limits remain correct without importing excluded projects.
- Six media contacts are unscoped. One category has an unmatched scope.
  Neither is automatically assigned to selected workspaces. Bulk catalogue and
  unrelated public/support data remain excluded.
- Asset-like references occur in 14 current project logos and 29 snapshot
  logos. This limited pattern scan is not a verified external-asset inventory,
  and a database backup does not copy external objects or browser-only files.
- Source account metadata has no selected MFA/managed-access entries. This
  does not establish what protections the older deployed runtime enforced.

## Conflicts requiring decisions

### Confirmed preparation direction

On 17 September 2026, the user chose to prepare beta's Bluhalo agency as a
**separate destination agency workspace**, leaving the existing staging
Bluhalo Master workspace untouched. This is approval of a mapping direction
only, not account creation, identity linking, ownership reassignment or import.

Do not map the source agency to the existing staging `bluhalo` company.
The new agency's destination slug/ID, parent mapping, human identity,
memberships, credentials, security state and entitlements are not yet approved.
Project names and source project IDs remain unchanged.

The user also confirmed that beta and staging `aiodemo` represent the **same
intended demo workspace**. Prepare a candidate mapping to the existing staging
workspace, preserving its credentials, permissions, memberships, settings,
billing/trial state and pre-existing data. This does not approve merging human
identities, replacing profile metadata, importing all owner projects or applying
any database writes. Exact dependency mappings still require review.

The user confirmed that beta and staging `admin` represent the **same intended
Master workspace**. Prepare a candidate mapping to staging's existing `admin`,
preserving all existing team memberships, roles, credentials, settings and
data. Do not promote members or import source memberships automatically.

The user subsequently confirmed the preparation-only entitlement policy:
`aiodemo`, the separate Bluhalo agency and the reconstructed `natalie1990`
agency receive a new 60-day beta trial beginning at the eventual approved
import timestamp. Admin/Master receives no beta trial and no payment
activation. The migration must not call Stripe, create a subscription or
charge anyone. This policy does not authorise database writes; its exact
effect on any existing `aiodemo` billing/trial fields must be shown in the
final conflict review before approval.

All three same-name workspace relationships now have user-confirmed preparation
directions. These confirmations do not resolve human-identity collisions,
legacy account reconstruction, billing/security policy or final insert counts,
and do not approve application-database writes.

Three protected account/company slugs already exist in staging. Two source human
identities match staging emails, but have different stable IDs. These are
conflicts, not approved identity merges.

One same-named workspace is an agency under the source master but a top-level
admin/Master workspace with billing state in staging. Reusing it automatically
could change access and entitlements. Preserve all existing staging credentials,
roles, memberships, billing/trial dates, projects and settings.

Nine selected snapshot numeric IDs collide with staging; use a reviewed frozen
ID map, not `ON CONFLICT DO NOTHING`, overwrite, or an unrecorded sequence
allocation. No selected project/archive/planner/saved-audit/diagnostic IDs
collide. Two selected profile metadata keys also collide.

Source has an older schema without destination membership project restrictions,
session versions, verification state, project tiers and billing/trial fields.
Absent columns are **unknown/unrepresented**, not approved defaults. Password
format checks found scrypt markers but no credential compatibility proof has
been performed. No password hashes have been transplanted.

## Fresh backup evidence

Each full dump used an exported repeatable-read, read-only snapshot. All
ordinary user tables, including reviewed platform migration metadata, were
counted and fingerprinted within that same snapshot. No retention pruning,
email notification, application startup or Stripe API call was used.

| Snapshot | UTC boundary | Tables | Rows | Dump SHA-256 |
|---|---|---:|---:|---|
| Beta source | 2026-09-17 14:25:47.740 | 28 | 1,931 | `5123bb174ce8fced4fd4b7d3b65d4e7c6da221fb0193cc3d49376e01edde49bc` |
| Published staging destination | 2026-09-17 14:26:04.948 | 49 | 1,230 | `95c5b82788b93307ed8c445271655f32362ebdf7101c3a9ddbdaa8ac9fc54636` |

Both exact dumps passed checksum checks before being restored into separate,
new local PostgreSQL clusters with private Unix sockets and no TCP listener.
All table row counts and content fingerprints, schema column fingerprints,
schema counts and project-ID set fingerprints matched. Both scratch clusters
were stopped and removed.

The repeatable rehearsal entry point is
`pnpm --filter @workspace/scripts run selective-rehearsal -- --source
.local/selective-backups/beta-production-source-<id> --destination
.local/selective-backups/published-staging-destination-<id>`. Add
`--dry-run` to validate only private manifest/checksum inputs. Without it, the
harness restores each exact bundle into separate disposable PostgreSQL clusters
bound only to private Unix sockets, fingerprints the destination, and cleans
both clusters. It never reads deployment database URLs, starts the app, sends
mail, or calls Stripe. The full restored rehearsal reports `PASSED` with
explicit limitations, and the importer is exercised only inside the restored
destination. Bluhalo
access is intentionally omitted because the destination account password is
non-nullable; Natalie uses the reviewed existing Google identity with
`project_access=[]`. The rehearsal uses a fixed test-only trial timestamp and
the eventual import would use its approved transaction timestamp. It verifies
first import, idempotent retry, scoped rollback and full fingerprint
restoration. External assets remain blocked because dumps do not copy object
storage.

Local dump bundles are mode 0600 in mode 0700 directories under
`.local/selective-backups/`. Full backups include credentials and sessions for
disaster recovery; those records are **not** thereby authorised for selective
import. Do not attach dumps to chat, commit them, or serve them through the app.

**Private durable copies are now verified.** The configured App Storage bucket
still rejects object creation. The separately documented backup bucket rejects
bucket-metadata reads but supports object-level operations. After an actual
harmless-object upload/readback and anonymous denial check, both exact
restore-tested dumps and their manifests were uploaded with creation-only
writes and private object ACLs to the existing documented backup bucket.

Every remote file was downloaded and its SHA-256 matched the local original.
Object ACL inspection found neither `allUsers` nor `allAuthenticatedUsers`;
anonymous reads of all four files returned HTTP 403. The source dump is
2,752,680 bytes and the staging dump is 9,471,643 bytes. Restricted object paths
and checksums are recorded in
`.local/migration/restricted/backup-storage-evidence.json`. No existing object,
bucket policy or application setting was changed.

These backups cover the stated snapshot boundaries, not subsequent activity.
Reassess freshness and revalidate drift before an eventual approved import.

## Tooling and remaining gates

`scripts/src/selective-backup.ts` is a dry-run-default backup/isolated-restore
helper, not an importer. `scripts/src/selective-migration-readiness.ts` validates
offline evidence only; supplied booleans are not authenticated authorisation.
Neither provides an application-database import operation.

`scripts/src/selective-migration-apply.ts` is the separate guarded apply
surface. It is dry-run by default, requires the exact approved source and
fresh destination bundles and replacement digest, rejects the beta endpoint,
and refuses to connect until the replacement artifact is explicitly reviewed,
approved and write-authorized. The current redacted replacement review remains
unapproved, so the apply path fails closed.

An offline workspace/project draft compiler now also checks explicit protected
accounts even when they own no selected projects, deterministic new company-ID
candidates, exact reused company IDs, hierarchy, exclusions, and preservation
of existing destination records. It cannot connect to a database or apply an
import, and always reports `draft: true` and `applyAllowed: false`.

`scripts/src/selective-manifest-compiler.ts` now compiles the reviewed
read-only inventory shape into a deterministic, redacted manifest envelope.
The compiler requires exactly 15 selected projects and all four protected
account mappings, sorts records deterministically, records dependency order,
snapshot-ID remapping, legacy missing columns, excluded security tables,
source/destination drift fingerprints and expected insert counts, and computes
the manifest digest without self-reference. The envelope is intentionally
`reviewed: false`: it is frozen for review but is not import authorization.
Its entitlement policy records no beta/payment for Admin/Master and a new
60-day beta trial from the approved import timestamp for `aiodemo`, the
separate Bluhalo agency and `natalie1990`; Stripe operations are disabled.
The compiler has no database, network, environment or filesystem access.

The restricted snapshot produced the following exact review mapping. It is not
approval for a real import:

| Source account | Proposed destination | Action | Selected projects |
|---|---|---|---:|
| admin | Existing admin | Reuse without modifying existing records | 13 |
| aiodemo | Existing aiodemo | Reuse without modifying existing records | 2 |
| bluhalo | beta-bluhalo (unapproved candidate slug) | Separate agency candidate | 0 |
| natalie1990 | natalie1990 | Agency reconstruction using existing Google identity | 0 |

Both proposed agencies retain the source parent relationship to the mapped
Master. The exact candidate records, named exclusion IDs and dependency
identity-set hashes are private in
`.local/migration/restricted/final-review-manifest.json`.

All 60 script tests and the script package typecheck passed. The restored
rehearsal inserted 826 rows, retried with 0 inserts and 826 skips, rolled back
826 rows, and restored the exact pre-existing staging fingerprint.

Still required before any real application-database import:

1. Revalidate identities and snapshot freshness before an eventual approved
   import. Source runtime-binding evidence and durable private backup access are
   now verified.
2. Review and explicitly approve the frozen exact-record manifest, including
   the named exclusions, asset gaps, expected deltas and entitlement transform.
3. Keep the transactional importer with restricted provenance and
   deterministic ID maps hardened; the isolated rehearsal now covers
   idempotent retry, tombstones, JSON normalization and unchanged
   pre-existing staging rows.
4. Decide whether the current source snapshot is the final boundary or require
   a fresh backup and rebuilt manifest. Bluhalo access remains intentionally
   unavailable and external assets remain outside the database-copy scope.
5. Present final evidence and request explicit approval of the manifest digest
   and destination before any application-database writes.

### Scoped rollback evidence (scratch rehearsal)

The rehearsal recorded every inserted row in temporary provenance within the
same transaction and used the guarded reverse-dependency rollback contract.

On failure inside the transaction, roll it back. After commit, scoped rollback
may remove only rows recorded as newly inserted by that import, in reverse
dependency order, after checking their current fingerprints and external
references. If imported rows were subsequently edited or referenced by
pre-existing/new unrelated data, stop for review instead of cascading. Never
restore a full dump over staging or delete/update pre-existing rows.

Agree the final source snapshot boundary separately. Beta writes after that
boundary are not automatically included; no live freeze or ongoing
synchronisation is authorised.

## Additional compatibility gates

The read-only code review identified these hazards for the eventual rehearsal:

- Legacy password login can attempt user/company/membership creation and still
  return a session if identity linking fails. Do not test logins against either
  application database or use normal signup/login helpers for migration.
- `natalie1990` remains a protected selection candidate, **not an exclusion**.
  Its missing company/membership/human linkage must be resolved explicitly;
  do not infer an owner, silently drop the account or create an unrestricted
  legacy session.
- The user supplied the intended human owner for `natalie1990`. A read-only
  lookup against the verified staging production fingerprint found exactly one
  existing human identity, already an Owner in the Master workspace. That
  identity has Google sign-in and no password. Exact identifiers and the
  user-supplied email are retained only in the restricted mapping review.
  The user confirmed the preparation policy: reuse that identity without changing its existing
  memberships or credentials, and do not transplant the legacy beta password.
  The exact new agency and membership mapping remains pending final review;
  this policy confirmation does not authorise application-database writes.
  No user or membership has been created or changed.
- Missing or malformed membership `project_access` currently means unrestricted
  access in the application parser. The importer must require an explicit
  membership scope rather than relying on that default.
- A scrypt marker alone is not a credential compatibility test. Existing
  staging credentials are never replaced; new identities need a reviewed
  password/SSO/MFA policy without reset-token, session or trusted-grant copying.
- Normal onboarding can initialise trial state. Import must not call it or
  turn absent legacy billing columns into a new trial.
- Snapshot ownership and embedded JSON references need structural review;
  copying a snapshot must not restore source workspace ownership over an
  unrelated staging workspace.
- The source project named Bluhalo is owned by `aiodemo`, not the protected
  `bluhalo` agency. Savi UK is also owned by `aiodemo`; the other 13 selected
  projects are owned by `admin`. Preserve that distinction when mapping.

### Compatibility review

The read-only compatibility map is recorded in the restricted
`.local/migration/restricted/compatibility-map.json`. It defines the reviewed
dependency order (`platform_accounts` → workspaces and human identities →
memberships → projects → snapshots/content/history → diagnostics/usage), the
source and destination column sets, and fields that cannot be safely defaulted
across the legacy/current schemas.

Important gates from that review:

- `project_snapshots` has nine selected serial-ID collisions and requires a
  frozen deterministic ID map. `ON CONFLICT DO NOTHING`, overwrite, and
  unrecorded sequence allocation are prohibited.
- Snapshot `data`/`intake` and saved-result JSON may contain ownership or asset
  references. They must be structurally inspected and remapped only where the
  mapping is explicit; copied history must never reassign an existing staging
  workspace.
- The source has no destination-only project tiers, membership project scopes,
  session versions, verification state or billing/trial fields. These are
  unknown/unrepresented, not permission to invent defaults.
- Sessions, reset/verification tokens, invitations and trusted security state
  are excluded. Six media contacts are unscoped, one media category has no
  matched scope, and external objects/browser-only data are not covered by a
  database backup.
- Admin/Master has no beta trial or payment activation. AIO Demo and the two
  new agency candidates have a preparation-only policy for a new 60-day beta
  trial from the approved import timestamp; Stripe and normal onboarding are
  forbidden.

The map remains preliminary, requires a frozen exact-record manifest, and does
not authorise application-database writes.