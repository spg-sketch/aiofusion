# AIO Fusion Cutover Readiness - 29 August 2026

## Decision

**NO-GO for live cutover.** Code and operational preparation can continue, but publishing to `https://aiofusion.ai` must wait until the authoritative legacy live database is accessible for read-only inventory, backup and restore rehearsal.

## Environment identification

- Development database: accessible from the workspace.
- Current deployment database: accessible through this Repl's production database tooling, but the active deployment is `https://aio-fusion-staging.replit.app` with custom domain `https://staging.aiofusion.ai`. This is the staging dataset.
- Legacy live database behind `https://aiofusion.ai`: not exposed by this Repl and not inventoried.

The checked-in `.replit` file no longer carries the staging canonical hostname or environment identity into another Repl. Before the next staging publish, set `DEPLOYMENT_ENV=staging` and `CANONICAL_DOMAIN=staging.aiofusion.ai` in deployment-specific settings that are not committed to source control. The live deployment must separately use `production` and `aiofusion.ai`.

## Read-only inventory captured

The public application schema matches between development and the current staging deployment:

| Check | Development | Current staging deployment |
|---|---:|---:|
| Public tables | 31 | 31 |
| Primary keys | 31 | 31 |
| Unique constraints | 5 | 5 |
| Foreign keys | 9 | 9 |
| Validated foreign keys | 9 | 9 |
| Unvalidated foreign keys | 0 | 0 |
| Independent public column-schema MD5 | `4875230b3213cbeed331da7946643fdc` | `4875230b3213cbeed331da7946643fdc` |

Selected exact row counts, captured through read-only queries:

| Table | Development | Current staging deployment |
|---|---:|---:|
| `platform_accounts` | 10 | 16 |
| `platform_companies` | 7 | 9 |
| `platform_users` | 6 | 9 |
| `platform_memberships` | 6 | 10 |
| `projects` | 26 | 27 |
| `project_snapshots` | 26 | 34 |
| `platform_invitations` | 0 | 8 |
| `saved_audits` | 0 | 2 |
| `saved_diagnostics` | 0 | 1 |
| `media_outlets` | 85 | 85 |
| `media_contacts` | 276 | 276 |
| `support_faq` | 141 | 282 |
| `token_usage` | 90 | 162 |

These differences confirm that development and staging contain independent records. They must not be treated as candidates for wholesale production import.

Aggregate relationship checks returned zero for missing company accounts, missing membership users or companies, membership slug mismatches, active projects without owners, snapshots without projects, saved audits or diagnostics without projects, and media contacts without outlets.

Five project owner values in each accessible dataset do not match a `platform_accounts.username`. They may represent an intentional legacy/admin ownership convention, but this must be classified before any data reconciliation logic relies on owner-to-account equality.

## Blocking items

1. Obtain read-only access to the authoritative legacy live database.
2. Run and retain a production inventory using `INVENTORY_ENV_LABEL=production-before-freeze`.
3. Configure staging-only `DEPLOYMENT_ENV`, `CANONICAL_DOMAIN` and `PRODUCTION_DB_IDENTIFIERS` outside source control. Use reviewed non-secret production database hostname/name fragments for the isolation guard.
4. Create a fresh production backup, verify its manifest and checksum, and restore it to an isolated scratch database.
5. Rehearse the schema publication against the restored production snapshot using Replit Publish's approved schema changes only.
6. Classify every staging-only record. Default decision is exclude. Any legitimate exception needs field mapping, deduplication, conflict policy and separate written approval.
7. Verify Google and Microsoft production callback registrations, Stripe live-mode webhook and Tax settings, Resend DNS alignment, and GA4 access.
8. Obtain approval for the write-freeze and rollback window.
9. Publish only after the business owner accepts the frozen production baseline.

## Evidence rule

Do not paste database URLs, credentials, row values, email addresses, tokens, JSON content or personal data into the change record. Store only approved aggregate counts, schema fingerprints, backup identifiers, checksums and pass/fail outcomes.