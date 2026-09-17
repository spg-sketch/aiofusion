# Page-load investigation

## Environment and limits

Deployment metadata obtained on 2026-09-17 identifies this workspace's published app as **https://aio-fusion-staging.replit.app**, public visibility, autoscale, successful build. This is staging, not the live-domain database. No deployment configuration, published build, credentials or production records were changed.

Three different kinds of evidence must not be combined:

1. Published staging logs measure real server response times, without separating database connection establishment, queries or application work.
2. Published browser samples measure anonymous public pages on the **unchanged deployed build**. Files called `before` and `after` are chronological samples, not a deployed performance improvement.
3. Private journeys compare local production builds with intercepted, controlled API responses. They measure frontend scheduling and navigation, **not real password verification, session middleware or database latency**. A real authenticated staging comparison remains necessary after approved publication.

## Published observations

The initial log sample contained:

| Endpoint | Requests | Minimum | Median | Maximum |
|---|---:|---:|---:|---:|
| `/api/store/projects` | 5 | 64 ms | 87 ms | 1,168 ms |
| `/api/platform/accounts` | 5 | 77 ms | 95 ms | 1,086 ms |
| `/api/support/tickets` | 16 | 83 ms | 838 ms | 966 ms |
| `/api/platform/me` | 20 | 0 ms | 1 ms | 3 ms |

The `/me` sample does not establish authenticated performance: anonymous requests skip the signed-in database path. At 14:52 UTC, projects/accounts took 872/947 ms, immediately followed by 64/77 ms repeats. Repeated five-minute support polls took 824–955 ms. This supports investigating connection/wake-up costs but does **not** prove a cold-start cause.

The signed-in middleware and `/me` route perform several serial account/user/company/membership reads, including repeated lookups. These were inspected but not rewritten or cached: a safe real-session query trace is needed before changing that security-sensitive path. The PostgreSQL pool uses default connection lifecycle settings. No pool or deployment tuning was attempted.

Anonymous public FCP medians in the saved three-sample baseline capture were home 712 ms, pricing 908 ms and Insights 900 ms. Detailed document timings, resource timings and API records are in the JSON captures.

A header probe of the deployed main JS asset with `Accept-Encoding: gzip, br` returned 494,539 bytes, `cache-control: private`, and no `Content-Encoding`. Browser traces likewise showed approximately 0.76–0.82 MB of transferred JavaScript. Compression and immutable hashed-asset caching deserve an approved hosting review; they were not changed here.

## Focused changes

- Project/account reads now start alongside Content archive/planner/scoring reads after authentication, instead of waiting for those reads. Legacy content migration remains ordered.
- Passive focus/visibility refreshes join an in-flight project/account refresh within the same abort scope. Post-mutation refreshes still fetch anew.
- Removed the duplicate five-minute support poll. The remaining poll skips hidden tabs, coalesces overlapping checks and aborts on identity changes.
- Speculative route imports wait until authentication resolves, receive a one-second foreground head start and wait for the previous import to settle. Hover/focus/navigation warming remains immediate. Failed imports remain retryable; canceled queues do not continue.
- Support lists batch display-name queries. Outstanding counts use SQL aggregation rather than downloading rows to count in JavaScript. `mine=true` summaries are account-scoped, including for administrators.

No authentication authority, payment verification or immediate shell-stable navigation rule was relaxed. Account profile refreshes that can reflect edits were left intact rather than replaced by a stale cache.

Completion validation also exposed outdated media cleanup test fixtures and an unclassified AI enrichment route. The fixtures were repaired without changing database schemas. The enrichment route now uses the existing read-only-member and paid/trial guards: usage quotas alone are not authorization. This is a narrowly scoped access-control repair discovered during validation, not a page-speed optimization.

## Support query scaling experiment

`artifacts/api-server/scripts/support-query-benchmark.ts` simulates the old/new query algorithms with 240 tickets, 80 users and a serialized 4 ms mock query delay. It does **not** execute the HTTP handler or a real database.

| Operation | Before | After |
|---|---:|---:|
| List query count | 81 | 2 |
| List simulated median | 341.44 ms | 8.38 ms |
| Summary rows transferred | 160 | 1 |
| Summary simulated median | 4.25 ms | 4.14 ms |

The normal user's `mine=true` poll has only one username, so batching does not remove its database connection cost. Do not use these simulated list timings to claim that the observed 0.9-second support polls are fixed.

## Verification and reproduction

The final controlled cold-like comparison is in [aio-perf-comparison.md](aio-perf-comparison.md). Login-to-hub total journey median fell from 3,145 to 2,060 ms, with the hub/card stage falling from 2,031 to 925 ms. Focus/visibility project/account reads fell from four to two. However, direct Content navigation measured 367 to 835 ms in this small sample, while Media was 362 to 340 ms. This is a remaining performance trade-off/uncertainty, not evidence that every page is faster. Total journey timings include setup and a fixed settling wait.

- Frontend focused tests: auth, account profile, in-session sign-in, passive refresh concurrency, content/project parallelism and route scheduling.
- Auth destination handoff and redirect-shell regression tests pass.
- Support route regression tests pass, including unauthorized requests, empty lists, batch profile reads and `mine=true` summary isolation.
- Workspace typecheck passes.
- Frontend/API workflows start cleanly; existing orphan-account warnings remain unrelated. Home-page preview renders.

The profiling harness is `scripts/aio-perf-profile.cjs`. It requires an existing production frontend build and the installed Chromium binary. Its temporary static server is only a measurement fixture, not a replacement workflow. See the adjacent reports and sanitized raw JSON for sample methodology, timings and explicit uncertainty.