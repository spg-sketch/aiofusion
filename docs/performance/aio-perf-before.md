# AIO Fusion before performance profile

This is a sanitized profiling capture. Public routes use the published staging origin. Private journeys use a temporary static server and intercepted synthetic fixtures; they do not use real authentication, accounts, secrets, or database data.

- Captured: 2026-09-17T15:42:46.725Z
- Build: `/tmp/aio-perf-before`
- Browser: `/repl/tools/bin/chromium`
- Public samples per route: 3
- API writes: blocked, except the synthetic fixture login POST.

## Public navigation

| Route | Samples | Median FCP ms | Median document bytes | Median JS chunks | Median JS chunk bytes |
|---|---:|---:|---:|---:|---:|
| / | 3 | 712 | 45236 | 9 | 766805 |
| /pricing | 3 | 908 | 43513 | 8 | 760643 |
| /insights | 3 | 900 | 32218 | 8 | 823483 |

## Synthetic private journeys

| Journey | Samples | Median total elapsed ms | Median login ms | Median /me ms | Median projects ms | Median redundant API requests |
|---|---:|---:|---:|---:|---:|---:|
| login-to-hub | 3 | 1293.76 | 270.41 | 139.88 | 87.95 | 3 |
| account-settings | 3 | 1212.85 | 269.91 | 153.34 | 87.68 | 7 |
| project-media | 3 | 1407.85 | 267.88 | 143.74 | 87.84 | 5 |
| project-content | 3 | 1614.39 | 286.06 | 165.85 | 88.37 | 5 |

Detailed request/resource records are in the adjacent JSON file. Query strings are omitted from stored API paths.
