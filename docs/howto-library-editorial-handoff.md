# How-to Library editorial handoff

## Reach the library

Project Hub's How-to Library opens the existing Guidance cards. Signed-in eligible editors see **Manage How-to Library** there and on a guide detail page. Platform Home also offers **Manage How-to Library** beside Insights management. The editor route is `/admin/howto`; the reader catalogue is `/guidance`.

Use the existing sign-in and verified editorial identity. This feature creates no new authentication or project/account permissions. Anonymous readers retain their existing access to published guidance. Draft reads, previews and every editing endpoint require the same server decision as Insights.

## Edit an entry

1. Search or filter the list by type/status, then select an entry, or choose **New entry**.
2. Set the title, short description, Article/Guide/Video type, reading-time label and numeric display order. The permanent entry id is fixed after its first save.
3. Add/reorder headings, paragraphs, lists, numbered steps, tips, screenshot images and HTTPS video links. Select words to make them bold/italic or add an HTTPS link. Images use the shared media picker/upload and require descriptive alt text; captions are optional. Videos are external links, not arbitrary embeds or uploaded files.
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