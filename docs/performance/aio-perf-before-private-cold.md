# AIO Fusion before private cold-fixture performance profile

This is a sanitized profiling capture. Public routes use the published staging origin. Private journeys use a temporary static server and intercepted synthetic fixtures; they do not use real authentication, accounts, secrets, or database data.

- Captured: 2026-09-17T15:46:56.381Z
- Build: `/tmp/aio-perf-before`
- Browser: `/repl/tools/bin/chromium`
- Public samples per route: not captured (private-only run)
- API writes: blocked, except the synthetic fixture login POST.
- Cold synthetic fixture delays: /me 120 ms; accounts, projects, archive, planner, scoring and other workspace reads 900 ms.

## Public navigation

| Route | Samples | Median FCP ms | Median document bytes | Median JS chunks | Median JS chunk bytes |
|---|---:|---:|---:|---:|---:|

## Synthetic private journeys

| Journey | Samples | Median total journey ms | Median target navigation ms | Median login ms | Median /me ms | Median projects ms | Median redundant API requests | Background projects/accounts |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| login-to-hub | 3 | 3145.03 | 2030.68 | 291.88 | 126.05 | 909.03 | 3 | 0 |
| account-settings | 3 | 1532.13 | — | 319.18 | 126.59 | 0 | 3 | 0 |
| background-resync | 3 | 4158.07 | — | 277.9 | 125.7 | 916.1 | 10 | 4 |
| project-media | 3 | 4881.79 | 362.31 | 279.54 | 124.06 | 905.05 | 5 | 0 |
| project-content | 3 | 4791.95 | 367.31 | 284.24 | 169.01 | 905.94 | 5 | 0 |

Detailed request/resource records are in the adjacent JSON file. Query strings are omitted from stored API paths.
