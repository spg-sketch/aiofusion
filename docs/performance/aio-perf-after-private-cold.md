# AIO Fusion after private cold-fixture performance profile

This is a sanitized profiling capture. Public routes use the published staging origin. Private journeys use a temporary static server and intercepted synthetic fixtures; they do not use real authentication, accounts, secrets, or database data.

- Captured: 2026-09-17T15:47:56.962Z
- Build: `/tmp/aio-perf-after`
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
| login-to-hub | 3 | 2059.57 | 924.91 | 251.85 | 147.97 | 908.62 | 2 | 0 |
| account-settings | 3 | 1321.67 | — | 257.67 | 124.22 | 0 | 3 | 0 |
| background-resync | 3 | 3067.4 | — | 264.23 | 124.35 | 908.83 | 5 | 2 |
| project-media | 3 | 4333.45 | 340 | 288.63 | 126.62 | 913.74 | 4 | 0 |
| project-content | 3 | 4118.73 | 835.41 | 257.71 | 122.81 | 907.3 | 7 | 0 |

Detailed request/resource records are in the adjacent JSON file. Query strings are omitted from stored API paths.
