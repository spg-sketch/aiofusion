# AIO Fusion performance comparison

This is a focused, sanitized comparison of the two local production builds:

- Before: `/tmp/aio-perf-before`
- After: `/tmp/aio-perf-after`
- Browser: `/repl/tools/bin/chromium`
- Three samples per synthetic journey
- Fixture-only private journeys; no real authentication, account, secret, or
  database data was used. All API writes were blocked except the fulfilled
  fixture login POST.

The cold fixture uses deterministic delays of 120 ms for `/api/platform/me` and
900 ms for accounts, projects, archive, planner, scoring, and other workspace
reads. It makes ordering visible; it is not a production latency prediction.
Raw samples and request start offsets are in
`aio-perf-before-private-cold.json` and `aio-perf-after-private-cold.json`.

## Cold private journey medians

| Journey | Before total ms | After total ms | Before target navigation ms | After target navigation ms | Before `/me` ms | After `/me` ms | Before exact projects ms | After exact projects ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Login → project hub card | 3,145 | 2,060 | 2,031 | 925 | 124 | 127 | 909 | 909 |
| Account settings | 1,532 | 1,322 | — | — | 127 | 124 | 0* | 0* |
| Project Media Research | 4,882 | 4,333 | 362 | 340 | 124 | 123 | 905 | 914 |
| Project Content Creator | 4,792 | 4,119 | 367 | 835 | 163 | 123 | 906 | 907 |

\* Account Settings has no completed exact `/api/store/projects` request
observed in this journey. The `0` is not a zero-millisecond network latency.
Total journey time includes fixture/login setup and the harness's fixed 350 ms
settling wait. Media/Content target navigation is measured from the sidebar
click to the unique heading inside the workspace main region; it is not the
total journey. The Content Creator after median is noisy (two samples were
about 835 ms and one was 361 ms), so this capture does not support a broad
faster-page claim.

## Ordering and duplicate-read evidence

For login → hub, the median request start offsets were:

- Before: archive started at 649 ms; projects at 1,558 ms; accounts at
  1,559 ms. The project/account reads started after the approximately 900 ms
  archive/planner/scoring group completed.
- After: archive started at 703 ms; projects at 705 ms; accounts at 705 ms.
  The project/account reads started alongside the approximately 900 ms content
  reads, rather than after them.

The cold `background-resync` journey dispatches focus and visibility together:

- Before: 4 background project/account reads (two projects + two accounts)
  per sample.
- After: 2 background project/account reads (one project + one accounts) per
  sample, consistent with one coalesced refresh.

The same startup samples show the non-admin support-ticket poll count changing
from 2 to 1. Startup redundant API requests changed from 3 to 2 for the login
→ hub journey. These are request-count observations, not correctness tests.

## Public routes

The public captures in `aio-perf-before.md` and `aio-perf-after.md` are
measurements of the same published staging origin
`https://aio-fusion-staging.replit.app`; no deployment was made as part of this
work. They should be treated as time-varying staging observations, not as an
attributed before/after frontend result. Each has three samples for `/`,
`/pricing`, and `/insights`, with document bytes, JS chunk count/bytes, FCP,
navigation timing, and raw resources in the adjacent JSON files.