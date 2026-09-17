# AIO Fusion after performance profile

This is a sanitized profiling capture. Public routes use the published staging origin. Private journeys use a temporary static server and intercepted synthetic fixtures; they do not use real authentication, accounts, secrets, or database data.

- Captured: 2026-09-17T15:43:30.297Z
- Build: `/tmp/aio-perf-after`
- Browser: `/repl/tools/bin/chromium`
- Public samples per route: 3
- API writes: blocked, except the synthetic fixture login POST.

## Public navigation

| Route | Samples | Median FCP ms | Median document bytes | Median JS chunks | Median JS chunk bytes |
|---|---:|---:|---:|---:|---:|
| / | 3 | 836 | 45236 | 9 | 766805 |
| /pricing | 3 | 916 | 43513 | 8 | 760643 |
| /insights | 3 | 976 | 32218 | 8 | 823483 |

## Synthetic private journeys

| Journey | Samples | Median total elapsed ms | Median login ms | Median /me ms | Median projects ms | Median redundant API requests |
|---|---:|---:|---:|---:|---:|---:|
| login-to-hub | 3 | 1186.55 | 265.83 | 123.22 | 88.19 | 2 |
| account-settings | 3 | 1291.56 | 253.65 | 126.45 | 87.46 | 6 |
| project-media | 3 | 1518.78 | 265.03 | 138.38 | 88.17 | 4 |
| project-content | 3 | 1485.85 | 259.73 | 174.71 | 88.1 | 4 |

Detailed request/resource records are in the adjacent JSON file. Query strings are omitted from stored API paths.
