# AIO Fusion Live Cutover Runbook

## Purpose and non-negotiable boundary

This runbook governs a potential data cutover into the live AIO Fusion service. The existing live database is authoritative. Staging is a test environment and its seeded demonstration data is excluded by default. No one may substitute staging records for live records, merge the two, or treat a staging count as an approval to import data.

Schema changes are made only through **Replit Publish**. This runbook does not authorise direct production DDL, direct database console changes, DNS changes, publishing, or secret changes.

## Current readiness status

The cutover is **NO-GO** until every blocker in `CUTOVER-READINESS-2026-08-29.md` is closed. In particular, the database exposed as `production` by this staging Repl belongs to the staging deployment. It is not evidence for the legacy live database behind `https://aiofusion.ai`.

Deployment-specific values must live in Replit environment settings, not checked-in `.replit` configuration:

| Deployment | `DEPLOYMENT_ENV` | `CANONICAL_DOMAIN` |
|---|---|---|
| Staging | `staging` | `staging.aiofusion.ai` |
| Production | `production` | `aiofusion.ai` |

The API fails startup when a deployed environment is missing these values or they point to the wrong hostname.

## Roles and stop authority

Nominate a cutover lead, data reviewer, application reviewer and business owner before scheduling. Record names, start window, expected duration and rollback owner in the change record. Any reviewer may call **STOP** for a count mismatch, unclassified data, uncertain environment, failed backup verification, unauthorised write, or external integration uncertainty. Stop means no retrying with altered commands until the issue is reviewed.

## Before the window

1. Confirm the source is the current live database and label it `production` in the change record. Confirm the target and every scratch restore database are separately labelled.
2. Review proposed schema changes and renames. A rename needs an explicit compatibility and rollback review: old and new name, dependants, migration owner, data-preservation evidence, and reversal plan. Do not infer a rename from similarly named tables or columns.
3. Run a read-only inventory against each approved database:

   ```bash
   DATABASE_URL='<approved URL>' INVENTORY_ENV_LABEL=production \
     pnpm --filter @workspace/scripts run inventory
   ```

   Use `staging` or `restored-production-snapshot` only for the corresponding environment. The script requires a non-secret label, prints no connection string or row values, makes only `SELECT` statements, and must not be used as a migration tool. Attach the report to the change record. Do not paste it into public channels.
4. Compare schema/table counts and the primary key, unique and foreign key summary. Record expected table counts, soft-deleted counts where applicable, and relationship checks in the reconciliation plan.
5. Create and verify a fresh backup using the approved operational process. Record its object name, UTC timestamp, checksum and manifest counts. A backup is not verified merely because it exists.
6. Restore that snapshot only to an isolated scratch database and run the documented dry-run restore verification. Compare its inventory with the source inventory. The dry run must complete before the live window.
7. Agree a write freeze notice, start time and acknowledgement path. Pause user-facing writes, imports, support changes, billing changes and background jobs that write data for the entire cutover and verification window.
8. Confirm that no staging seed process, demo records or browser-local test export is included. Any exception requires separate written data-import approval.

## Cutover window

1. Announce the write freeze and confirm active writers are stopped. Capture the final, read-only production inventory immediately after the freeze.
2. Verify the backup identity and checksum again. Verify the restore dry run refers to the same or a later authoritative snapshot.
3. Publish approved schema changes through Replit Publish only. Do not run ad hoc SQL, use a database GUI for DDL, or apply an unreviewed rename.
4. Perform a separately approved import only if a signed import plan exists. The import must be deterministic and idempotent, use stable source identifiers, have a documented conflict policy, produce a non-PII audit summary, and be safe to re-run without duplicating records. If no such approval exists, **do not import data**.
5. Run the after inventory with the explicit environment label. Compare it to the frozen before inventory and the expected schema change list.
6. Perform the before/after table counts and relationship checks in `DATA-RECONCILIATION-PLAN.md`. Investigate every unexplained difference before reopening writes.
7. Confirm login, authorised project visibility, a representative read-only user journey and expected application health using approved operational checks. Do not use real customer data in screenshots or tickets.
8. Obtain business owner approval, record the final results and only then lift the write freeze.

## Rollback

Rollback is mandatory for failed publication, missing/extra schema objects, unapproved data change, failed integrity check, count mismatch outside approved tolerances, or failure of a critical integration.

1. Keep the write freeze in place and announce rollback.
2. Record the failure, time, affected environment and inventories. Do not delete evidence or overwrite the verified backup.
3. Use the pre-approved Replit Publish rollback path for schema/application rollback. Restore data only into the approved recovery target and only under the backup restore procedure. Never restore over a live database by accident.
4. Run a read-only inventory and relationship checks after recovery. Obtain reviewer and business owner confirmation before reopening writes.
5. Hold a follow-up review before scheduling another cutover.

## External service checklist

Complete each item in the correct environment. Values, secrets and tokens must never be copied into the change record.

### OAuth

- Register Google production callback `https://aiofusion.ai/api/platform/auth/google/callback`.
- Retain Google staging callback `https://staging.aiofusion.ai/api/platform/auth/google/callback`.
- Register Microsoft production callback `https://aiofusion.ai/api/platform/auth/microsoft/callback`.
- Retain Microsoft staging callback `https://staging.aiofusion.ai/api/platform/auth/microsoft/callback`.
- Confirm authorised origins, consent-screen status, tenant restrictions and callback paths.
- Retain existing production client registrations until rollback risk has passed.
- Test an approved non-production account where possible and record only pass/fail.

### Stripe

- Register the production webhook as `https://aiofusion.ai/api/stripe/webhook`.
- Confirm live mode is used only in production and test mode remains isolated to staging.
- Confirm products, prices and the webhook signing secret belong to the same Stripe mode.
- Activate Stripe Tax separately in live mode and verify the business address and required registrations.
- Confirm checkout success URL `https://aiofusion.ai/?account_section=billing&checkout=success`, cancel URL `https://aiofusion.ai/?account_section=billing&checkout=cancelled`, and portal return URL `https://aiofusion.ai/?account_section=billing`.
- Verify webhook delivery monitoring and prevent test events reaching production processing.
- Do not create charges merely to test the cutover without finance approval.

### Resend

- Confirm SPF, DKIM and DMARC for the sending domain, sender alignment, `RESEND_FROM`, reply-to policy and production audience safeguards.
- Confirm notification links resolve through `CANONICAL_DOMAIN`, then appropriate `REPLIT_DOMAINS`; staging must not fall back to `https://aiofusion.ai`.
- Confirm the public email logo loads from the production API runtime and in a delivered email.
- Send only an approved operational test and record delivery status, not recipient addresses.

### GA4

- Confirm measurement ID `G-DTSDJVJN0Q`, production domain configuration, cross-domain settings if used, and internal-traffic filters.
- Confirm page views and approved conversion events arrive in the correct property without recording personal data.

### Domain and release routing

- Confirm `https://aiofusion.ai` is the only canonical production origin and its TLS certificate is valid.
- Confirm `https://www.aiofusion.ai/*` permanently redirects with HTTP 301 or 308 to the equivalent apex path. Do not accept a duplicate HTTP 200.
- Confirm `https://aiofusion.ai/sitemap.xml` contains all 25 approved canonical URLs, including the promo page.
- Confirm `https://aiofusion.ai/robots.txt` references the apex sitemap and disallows `/api/`.
- Confirm representative public routes serve pre-rendered HTML to a crawler user agent.
- Confirm `/api/healthz` succeeds, private app responses expose no account data without authentication, and unknown/private-looking paths do not leak content.
- Confirm staging domain remains distinct and cannot use the production database.
- DNS changes are outside this runbook and require their own approved change.

## Future staging-to-live release flow

1. Develop using only isolated development and staging data.
2. Run the authoritative release-candidate gate in `RELEASE-QUALITY-GATES.md`. Any failure, timeout or skipped critical check is **NO-GO**.
3. After application-reviewer approval, publish the approved release to staging.
4. Complete the staging sign-off checklist. Staging evidence never proves the change is live.
5. Run read-only staging inventory and test external services in their staging/test modes.
6. Take and verify a production backup, then prove a restore to scratch.
7. Create a production change record with reconciliation baseline, write-freeze plan, integration checklist, explicit business-owner approval and rollback owner.
8. Publish to production through Replit Publish. Only then run the production-only checks in `RELEASE-QUALITY-GATES.md`, complete read-only reconciliation, observe logs and finish sign-off.

Staging releases validate code and schema compatibility. They never promote staging demonstration rows into live data by default.