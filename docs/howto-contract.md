# How-to CMS API contract

The How-to library is served from `/api/howto` and edited at `/api/admin/howto`.
Reader endpoints are anonymous and return only published entries, ordered by
`displayOrder` and then stable `id`.

## Entry

```ts
type HowtoEntry = {
  id: string; // stable kebab-case id, supplied on creation
  title: string;
  description: string;
  type: "Article" | "Guide" | "Video";
  readTime: string;
  displayOrder: number;
  status: "draft" | "published";
  body: HowtoBlock[];
  createdAt: string; // server-owned ISO timestamp
  updatedAt: string; // server-owned ISO timestamp
  publishedAt: string | null; // server-owned ISO timestamp, first publish
};
type InlineRun = { text: string; bold?: boolean; italic?: boolean; href?: string };
type HowtoBlock =
  | { type: "heading" | "paragraph" | "tip"; runs: InlineRun[] }
  | { type: "step"; number: number; title: string; runs: InlineRun[] }
  | { type: "list"; items: string[] }
  | { type: "image"; mediaId: string; altText: string; caption?: string; url?: string | null }
  | { type: "video"; url: string; caption?: string };
```

Inline links and video URLs must use HTTPS. Image blocks reference an existing,
active image in the shared Insights media library by `mediaId`; returned image
blocks additionally include the resolved `url`.

## Guidance library presentation

Platform home and Project Hub both open `/guidance`. Public `/insights` remains
a separate collection. Library previews use the first saved image block with
a non-empty resolved URL, retaining its saved alt text. No cover field or
editorial data rewrite is required. Cards reserve their image area while loading
and show the same branded fallback when no image is resolved or loading fails.
The reader still renders the complete saved body, including images and captions.

Presentation regression checks:

- `pnpm --filter @workspace/aio-fusion exec vitest run src/pages/GuidancePage.test.tsx src/App.mediaManagementNavigation.test.tsx src/pages/ClientSelectorPage.test.tsx`
- `pnpm exec playwright test --config=playwright.howto.config.ts tests/howto/guidance-library.spec.ts`

The browser check uses the built app and real sign-in in the disposable loopback
harness, with synthetic published-content responses and a generated PNG served
by test routes. It verifies desktop/mobile rendering, image failure, filters,
full-body opening, return navigation, refresh and browser Back. Its screenshots
are fixture evidence, not proof of production content or App Storage delivery.

## Operations

- `GET /howto` — published entries.
- `GET /howto/:id` — one published entry; drafts and missing ids return 404.
- `GET /admin/howto` — all entries, requires the existing Insights CMS editor access.
- `POST /admin/howto` — create an entry. Requires every editable entry field,
  including stable kebab-case `id`.
- `GET /admin/howto/:id` — retrieve any entry (draft included).
- `PATCH /admin/howto/:id` — partial update of editable fields; `id` cannot change.
- `DELETE /admin/howto/:id` — delete an entry.
- `DELETE /admin/insights/media/:id` — soft-delete an unused shared media item;
  returns 409 while any Insights or How-to entry references it.

Create and patch bodies may contain only editable fields (`title`,
`description`, `type`, `readTime`, `displayOrder`, `status`, `body`; create also
requires `id`). Timestamps are never client writable.

Schema lifecycle follows `replit.md`: push the Drizzle schema in development
with `pnpm --filter @workspace/db run push`, or publish for Replit to apply the
schema in production. Then run
`pnpm --filter @workspace/api-server run migrate:howto` as an explicit,
data-only seed migration. The command requires both tables to exist and never
runs at application startup. Its durable migration ledger prevents deleted or
edited initial seed entries from being restored on rerun.