# Task 290 Insights CMS migration

`migrate-insights-task-290.ts` is the only path for updating already-published
Insights CMS rows for Task 290. It is intentionally separate from request
rendering, the web build, and API startup.

## Scope and safety

The migration:

- reads only `published` rows whose IDs are explicitly listed in
  `src/lib/insights-content-migration.ts`;
- uses exact `from` values as per-field guards, so a CMS edit made after the
  original seed is preserved;
- updates only the listed first-party article fields and the six promotional
  fields on `ext-guide` (`title`, `excerpt`, `coverImageAlt`, `seoTitle`,
  `seoDescription`, and `focusKeyphrase`);
- never changes an ID, slug, canonical URL, external URL, publication date,
  cover media, or unlisted body block;
- does not edit externally hosted guide content or quotations; and
- does not run from API startup, a request handler, a renderer, or the web
  build.

The exact old/new body sections and metadata fields are the declarative
`TASK_290_CHANGES` list. Do not replace it with a case-insensitive or
whole-document string replacement.

## Invocation

From the repository root, first inspect the target database:

```sh
pnpm --filter @workspace/api-server run migrate:insights:task-290 -- --dry-run
```

The output is JSON and includes the migration ID, eligible row count, matched
and skipped exact changes, and the fields that would be updated. Review this
output and take the normal database backup before applying.

Applying is a separate, explicit command:

```sh
pnpm --filter @workspace/api-server run migrate:insights:task-290 -- --apply
```

The script refuses `--apply` in a production environment unless the operator
also supplies `--allow-production` or sets
`CMS_MIGRATION_ALLOW_PRODUCTION=1`. No production command is run as part of
development, CI, a deploy hook, or these tests. Running `--apply` a second
time is safe: all exact old values have already been replaced, so it reports
zero rows with updates.

The apply transaction takes the migration advisory lock and selects all
matching published rows with `FOR UPDATE` before calculating or writing any
changes. This serializes the read and write with normal CMS row updates; the
exact old-value checks still preserve fields that were already custom-edited.
The dry run intentionally does not hold database locks.

## Invocation and deployment order

1. Review the checked-in editorial diff and the `TASK_290_CHANGES` list. Run
   API/unit tests and build checks.
2. Deploy the API version that contains the Insights schema and migration
   code. The normal startup schema prerequisite must complete before querying
   the database. The existing seed path remains insert-only on conflict; it
   does not apply Task 290 changes to existing CMS rows.
3. Run `--dry-run` against the intended environment and review every proposed
   row and field. Stop if a count or old value is unexpected.
4. Take the approved database backup, then run the explicit `--apply` command
   during the content-change window. For production, use the additional
   production opt-in described above.
5. Deploy/rebuild the web artifact containing the checked-in editorial and
   external-guide fallback values. Do not use a render-time replacement to
   compensate for a skipped migration.
6. Verify public article URLs and the external guide link, then run the
   migration in `--dry-run` mode again. The second report should contain no
   updates. Any custom editorial value that did not match an old value should
   still be present.
