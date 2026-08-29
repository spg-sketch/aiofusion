# AIO Fusion Data Reconciliation Plan

## Scope and decision rule

The old live data store remains authoritative until the business owner formally accepts completed reconciliation. Staging demonstration and seeded data is excluded by default. There is no implied staging-to-live data migration.

This plan is for read-only comparison before and after an approved Replit Publish schema release, or a separately approved deterministic import. It does not authorise writes. Use `LIVE-CUTOVER-RUNBOOK.md` for sequencing, freeze and rollback.

## Evidence collection

Run the inventory command against the authoritative live source, an isolated restored snapshot, and the live target after the approved change:

```bash
DATABASE_URL='<approved URL>' INVENTORY_ENV_LABEL=production \
  pnpm --filter @workspace/scripts run inventory
```

For a restored copy use `INVENTORY_ENV_LABEL=restored-production-snapshot`; for staging use `staging`. Labels are non-secret and required. Do not include a URL, credential, email address, token, JSON payload or exported row in the evidence. The inventory reports schema/table counts and catalogue constraint summary only, performs `SELECT` statements only, and never changes schema or data.

Record for every run: operator, UTC time, non-secret environment label, approved backup identity where relevant, schema count, table list/counts, primary key/unique/foreign-key totals, and pass/fail. Store evidence in the restricted change record.

## Exact data classification

Classification is determined from the live schema inventory and this application schema review, not from staging examples. Re-review after every schema change.

| Classification | Known areas | Handling |
|---|---|---|
| Restricted personal and authentication data | `users`, `sessions`, `platform_accounts`, `platform_users`, `platform_sessions`, `platform_memberships`, invitations, email verification/password reset records | Never print values. Preserve only through approved backup/restore or approved idempotent import. Restrict evidence access. |
| Restricted commercial and billing data | `platform_companies`, subscriptions/customer identifiers, billing addresses, VAT numbers, contact submissions | Never place values in reports. Reconcile counts and approved relationship checks only. |
| Restricted content and project data | `projects`, snapshots, archive/planner items, saved audit/diagnostic/GEO results, support records | Content and JSON can contain client information. Do not sample or export in the standard cutover evidence. |
| Restricted media contacts | `media_contacts` and associated account-scoped media data | Names, email, phone and notes are PII. Use counts only. |
| Operational security data | audit events/locks, token usage, platform metadata, invite-link failures | Treat identifiers, IP hints, tokens and event metadata as restricted. Never output values. |
| Business reference data | media categories/outlets, support FAQ or other explicitly reviewed public reference data | Still compare counts only unless a separate content review allows sampling. |
| Staging demo data | records created by `seed-staging` or any tester-created staging content | Excluded. It may validate behaviour but must not be copied to production. |

If an inventory reveals an unknown table, classify it before proceeding. Unknown data is restricted by default.

## Count and relationship worksheet

Fill this worksheet before the freeze, immediately after the freeze, after the publish/import, and after any rollback. A blank expected value is a stop condition, not a zero.

| Check | Before | After | Expected change | Result |
|---|---:|---:|---|---|
| Number of non-system schemas |  |  | Only approved schema change |  |
| Number of tables |  |  | Only approved schema change |  |
| Every table row count |  |  | 0 unless approved import/retention change |  |
| Primary key, unique and foreign-key catalogue totals |  |  | Approved migration delta only |  |
| Validated versus unvalidated foreign keys |  |  | No new unvalidated key without explicit approval |  |
| `platform_companies` to `platform_accounts` |  |  | No newly orphaned company slug |  |
| `platform_memberships` to `platform_users` and `platform_companies` |  |  | No orphaned membership |  |
| Invitations, email verifications and password resets to `platform_users`/companies |  |  | No orphaned required reference |  |
| Content/audit/planner/archive records to projects and owners |  |  | No unexplained orphan or count loss |  |
| `media_contacts` to `media_outlets` |  |  | No orphaned outlet reference |  |
| Active versus soft-deleted records for applicable tables |  |  | Approved delta only |  |

Relationship checks must use approved `SELECT` queries that return aggregate counts only. Do not put keys, names, emails, content, session IDs, passwords, tokens or row-level errors in the output. Where a relationship is not enforced by a database foreign key, document the query and expected zero-or-approved result in the restricted change record.

## Import controls

No import occurs unless separately approved in writing by the data owner and change approver. The approval must specify source/target, exact classified fields, legal basis and retention, mapping, stable identifier, deduplication key, ordering, conflict policy, expected count delta, validation query, audit output, rollback method and named operator.

An approved import must be deterministic and idempotent: the same authorised input produces the same target state, uses stable source IDs, and can be safely retried without creating duplicate users, companies, projects, billing records or audit records. Do not use timestamps, generated random IDs or display names as the only matching rule. A failed or partially completed import keeps the write freeze in place until rollback or reconciliation completes.

## Acceptance and escalation

Accept only when all table and relationship checks match the approved expectation, the backup and dry-run restore are verified, no unclassified data exists, and the business owner signs the restricted change record. A difference is acceptable only when it is pre-approved, explained and recorded.

For any mismatch: stop writes, preserve inventory evidence, do not edit rows to make counts match, invoke the rollback steps in the runbook, and reconvene data/application reviewers. The authoritative old live data and verified backup remain the recovery reference.