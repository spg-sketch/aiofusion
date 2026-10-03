# How-to Library editorial handoff

## Reach the library

Project Hub's How-to Library opens the existing Guidance cards. Signed-in eligible editors see **Manage How-to Library** there and on a guide detail page. Platform Home also offers **Manage How-to Library** beside Insights management. The editor route is `/admin/howto`; the reader catalogue is `/guidance`.

Use the existing sign-in and verified editorial identity. This feature creates no new authentication or project/account permissions. Anonymous readers retain their existing access to published guidance. Draft reads, previews and every editing endpoint require the same server decision as Insights.

## Edit an entry

1. Search or filter the list by type/status, then select an entry, or choose **New entry**.
2. Set the title, short description, Article/Guide/Video type, reading-time label and numeric display order. The permanent entry id is fixed after its first save.
3. Edit the whole guide in the continuous **Guide content** box. Paste complete copy, select words and use the toolbar for headings, paragraphs, lists, tips, bold/italic or HTTPS links. Use **Add image** for the shared picker/upload; select an existing image and use **Change image** to replace it. Images require descriptive alt text; captions are optional. Videos are HTTPS links, not arbitrary embeds or uploaded files.
4. **Preview** shows the structured reader presentation. **Save draft** retains an unpublished entry. **Publish** makes it readable immediately without a rebuild. For published entries, **Save changes** updates the reader content, and **Unpublish** removes it from reader responses.
5. Wait for confirmed save feedback. Failed saves retain inputs and offer retry. Leaving unsaved work prompts for save/discard/stay. Browser reload/close also prompts. Deletion requires confirmation and is permanent.

Assets referenced by a draft or published entry, or by any Insights story, cannot be removed through the shared-media deletion endpoint.

## Initial migration

Schema changes use the existing supported Drizzle development/managed publication process. No application-startup schema or seed writes were added.

After the two How-to tables exist, run:

```sh
pnpm --filter @workspace/api-server run migrate:howto
```

The post-merge development setup invokes this data-only command after the existing schema push. Six initial records preserve the original ids, order and instructional structure. A durable ledger makes reruns no-ops, including after edits, unpublishing, deletion, or an intentionally empty library. It never updates existing rows.

Do not use a force option to resolve unrelated legacy-table prompts. Inspect schema command output; a successful process exit alone is not proof that Drizzle applied every change. The seed command fails when its tables do not exist.

## Editorial access issue

The available **development** Natalie identity did not qualify for the existing Insights capability: it lacked the verified, provider-linked staff identity required by the current policy. It was not altered and was not given owner, administrator or wider project access.

This is not a staging or production sign-in result. Natalie should use her already-approved Insights editorial identity in the relevant environment. If that identity has no How-to action, confirm the actual identity and existing Insights access there before changing anything. Do not grant broader privileges as a workaround.

## Verification

- Workspace: `pnpm run typecheck`.
- Affected API regressions: How-to migration/CRUD/reader visibility/validation/media references, existing Insights homepage pins/media upload, and the shared editorial access predicate.
- Affected frontend regressions: Guidance loading/error/empty/missing/filter states, How-to search/edit/save/publication/delete/unsaved guards, generated routes, and existing Insights editor behaviour.
- Isolated browser journey: `pnpm exec playwright test --config=playwright.howto.config.ts`. It builds current code, creates a temporary local PostgreSQL database, uses synthetic editorial/noneditor identities, tests a separate anonymous reader session, and destroys the database afterwards.

No production publication, production content changes or real customer edits were performed. Any later published staging check must first confirm staging contains this change and explicitly identify that environment.

## Prepared illustrated review batch

**Status: target saving is blocked, not complete.** Thirty complete guides are
prepared in `scripts/howto-review-content.mjs`. The review checklist and complete
copy are in `docs/howto-review-checklist.md`. All review boxes are unchecked.
The reserved `review-*` identifiers are not saved development/staging draft IDs.

### Identified target and access evidence

- Intended target: this workspace's **development** API service
  (`artifacts/api-server: API Server`, loopback API port 8080, proxied `/api`),
  with management at the app preview's `/admin/howto`.
- Read-only development inventory: six published entries, no draft entries;
  the example `getting-started` and all other original bodies were inspected.
  All existing content, IDs, statuses and image metadata remain unchanged.
- Three existing illustration records were found in the development shared
  media inventory and visually inspected from the checked-in Insights library.
  No target image uploads, new media records or metadata edits were made.
- Development contains no verified provider-linked AIO Fusion staff user
  eligible through the staff editorial policy. No account was altered.
- A probe with the existing administrator workspace name returned HTTP 400:
  the current login requires the personal identity, not that workspace name.
  This is not a test of Natalie's actual sign-in or her approved identity's
  password. No credentials or sessions were written to the run documents.
- No approved target editorial session was available to populate these drafts.
  `docs/howto-batch-runs/development-blocked.json` records **created 0,
  skipped 0, failed writes 0, uncertain writes 0, blocked 30**. Do not describe
  these entries as present in the management screen.
- Published staging is **not an alternative write target by assumption**:
  current published database binding uses `PRODUCTION_DATABASE_URL` for both
  staging and production modes. The importer refuses a database matching that
  protected target even if the service is labelled staging. No staging or
  production writes or deployment were performed.

### Safe import operation

This is separate from `migrate:howto` and application startup. It creates only
new illustrated drafts through the existing `/api/admin/howto` authorization,
strict entry validation, shared-media validation and reference lock.
It never patches, publishes or deletes target entries. It reuses existing
images and does not upload or overwrite media.

Generate the local review document without accessing a target:

```sh
node scripts/howto-review-cli.mjs --document
```

Once an **existing, approved** editorial identity is available, supply its
personal sign-in identifier as `HOWTO_EDITOR_USERNAME` and its password only
through protected `HOWTO_EDITOR_PASSWORD` configuration. Do not put either
credential in command arguments or source files. Do not add a password or
broader role just to run this operation on a passwordless identity.
The importer currently supports an already-existing password sign-in; an
SSO-only identity needs an approved existing session handoff before authoring.

Run a read-only content preview first, using the confirmed service origin:

```sh
node scripts/howto-review-cli.mjs --target development \
  --base-url http://127.0.0.1:8080 --preview
```

Only after inspecting the target inventory, existing topic overlaps and valid
media delivery, replace `--preview` with `--apply`. A separately verified
staging service can use `--target staging --base-url https://CONFIRMED-STAGING-ORIGIN`;
this does not permit writing into a production-shared database or automatically
deploy the importer.

The server requires both `X-Howto-Draft-Batch: howto-editorial-review-v1` and
`X-Howto-Target: development|staging`. A transaction commits each create together
with its durable completion record. Edited, published, deleted and colliding
entries are preserved on all later runs. An ambiguous create stops the batch
without retry; the next preview reconciles `X-Howto-Batch-Completed` before a
resume. Each run records created, skipped, failed and uncertain outcomes
separately. A ledger-completed deleted entry remains skipped, not restored.

### Actual verification for this batch

- `pnpm run typecheck`: passed.
- `node --test scripts/howto-review-batch.test.mjs`: 6 passing importer/catalogue
  checks, including preview, missing media/target, failed writes, uncertainty
  and reconciliation.
- `pnpm --filter @workspace/api-server exec vitest run
  src/routes/howto.test.ts src/lib/howto-draft-batch.test.ts`: 32 passing checks.
  Existing publication/George opt-out behavior, image references, preserved
  collisions/edits/deletion, concurrency and target rejection are covered.
- `pnpm exec playwright test --config=playwright.howto.config.ts
  tests/howto/draft-batch.spec.ts`: **1 passed** against built code and a real
  disposable local PostgreSQL database. One real fixture write committed with
  deliberately lost confirmation; preview reconciled it and the remaining 29
  drafts were created. All 30 fixture drafts were hidden from anonymous readers
  and George. The published baseline was unchanged.
- The same isolated journey opened imported Agency and media-import guides in
  the existing continuous editor, selected text, applied italic, inserted text
  with Enter, replaced an image/alt text, saved and reopened, then previewed.
  A separate disposable published record verified the loaded first-image card
  (`naturalWidth > 0`, `object-fit: cover`) and complete reader body.
- Desktop preview and 390px reader screenshots were inspected for legibility,
  image containment and horizontal clipping. No standalone card screenshot was
  produced, so card crop was assertion-verified rather than visually reviewed.
- Fixture deletion and rerun preserved the editorial change and did not
  recreate the deliberately deleted completed entry. The temporary database
  was removed by the harness. This is **local fixture evidence only**, not a
  staging import, external-provider test, real payment or Natalie identity test.
- The unchanged broad editorial suite did not run in the first attempted
  combined command because the new spec hit a module-loading blocker. The CLI
  was split from the importable library; the focused batch test then passed.

### Remaining blockers

Target authoring still needs authorized existing editorial access. Natalie
also needs her already-approved identity in the chosen environment; no synthetic
test proves that identity. If there is no such nonproduction identity or
database, keep these as prepared copy and approve a separate safe transfer
path. Do not silently write into the published database, grant privileges,
publish drafts, or deploy production to resolve this blocker.