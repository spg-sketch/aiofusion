---
name: AIO Fusion performance measurement
description: Distinguishing deployment latency from controlled frontend benchmarks and keeping auth authoritative.
---

Treat published request logs, anonymous browser traces and fixture-backed production-build profiles as different evidence. A fast anonymous `/me` response does not measure the database work for a signed-in session. A simulated database benchmark demonstrates query scaling, not published endpoint latency.

**Why:** Published staging showed first project/account reads around a second while immediate repeats were tens of milliseconds. Route imports were not the only source of delay. Browser journey timers can also mistakenly stop on sidebar labels before the destination has rendered.

**How to apply:** Obtain current deployment metadata, separate cold-like and warm samples, and time a unique destination content element plus its required data. Keep server-authoritative authentication and account-switch abort scopes intact. Do not replace authority with a stale identity cache to improve timings. Publish only with approval and explicitly label local-build comparisons when the deployment is unchanged.