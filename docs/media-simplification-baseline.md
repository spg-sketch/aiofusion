# Media simplification: read-only baseline and source-field audit

Checked against the published staging deployment and its production read replica on 28 September 2026, before implementing the Media Database and Media Research changes. These are aggregate observations, not an instruction to re-import or rewrite production data.

## Current data and behavior

- The deployment reported a successful published build at `https://aio-fusion-staging.replit.app`. An anonymous request to `/api/store/media-db/search` returned HTTP 401; signed-in search behavior still needs its own verification after the new code is published.
- Production has one committed media import batch, dated 18 September 2026. Its summary reports 13,119 created contacts and 5,359 created publications. The active tables contain those same shared-record counts, plus 276 contacts and 85 publications owned by the `admin` workspace. This supersedes the "outstanding import" status in `media-v33-operational-status.md`.
- Existing research history is not an account-owned saved media list. There are three persisted recommendation decisions. The new bookmarks must not be derived by copying those decisions or the shared records.

## Imported field mapping

The workbook parser in `media-csv-import.ts` maps `website` directly to the publication website, `outlet_description` to description, `country` to country, and `publication_reach` to reach. The reconciliation layer retains source row metadata. The V33 import contains source values that do not look like those fields' advertised meanings:

- Of 5,444 active publications, 630 have a blank website, 345 have a digits-only website, 2,975 have a blank country, 381 have a digits-only description and 50 have a digits-only country.
- Reach is stored as the source's raw reach field. `29` appears in 1,653 publication reach fields and `76` in 485. These are not verified audience measurements. `28` appears as a digits-only website in 125 records; an unexplained number under a title must not be relabeled as a description or authority score.
- Of 13,119 shared contacts, only 38 have a nonempty `publication_authority`, while 10,271 have a `publication_reach` value and 9,999 have a manually supplied LinkedIn URL. Source metadata retains the original workbook cells for review. A bounded example had digits-only source URL and website values, showing that the source cells themselves contain anomalies rather than a simple frontend label swap.
- Of shared contacts, 851 have a digits-only source URL. Five have a nonempty email not matching the ordinary address shape. Such values must not be clickable or sendable.

The product should render missing or invalid URLs as unavailable and qualify ambiguous source reach as source-provided rather than measured. It must retain raw metadata and allow authorised stewards to correct the existing records through review, not fabricate replacements. Verified publication authority is shown only when supported by a verified source. No existing records were modified for this audit.

## Release evidence still needed

The target for **stored** search is first meaningful result card visible within 2 seconds at p95 for signed-in warm staging journeys against the actual collection. Measure from Search click, not API response, and report cold-start and large-filter samples separately. The currently published build cannot verify unmerged changes. Do not represent a local unit test or an anonymous HTTP 401 as signed-in staging performance evidence. Review any schema change and a recoverable backup before a production migration.

The development database has 278 active contacts and 87 active publications, not a realistic V33-sized collection. A disposable direct-client browser signup reached the required email-verification step, so the local signed-in journey could not continue without access to that inbox. API integration tests use isolated synthetic accounts to check private records, bookmarks, linked-journalist suppression and parent/child isolation, but they do not substitute for signed-in staging measurements or browser verification. No production release, production import, production schema change or customer-data write was made for this work.

The release-candidate workflow's previous failing snapshot predates the final fixes. The full API and web regression suites and TypeScript checks now pass locally, but the release gate itself requires a clean committed source tree, so its final built-browser and startup stages must be run from a release candidate. Do not treat these local checks as authorization to publish.