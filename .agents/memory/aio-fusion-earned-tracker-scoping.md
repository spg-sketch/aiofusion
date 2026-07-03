---
name: AIO Fusion Earned Media Tracker per-client scoping
description: The Earned Media Tracker (ReportPage.tsx) used one global localStorage key with no per-client isolation, causing one client's rows to appear under another.
---

# Earned Media Tracker storage

- The tracker (`aio.earnedTracker.v2`) originally had NO client/project scoping at all - a single shared localStorage key meant every client's rows commingled and any client viewing the tab could see another client's earned-media items.
- Fixed by applying the same convention as Archive/Planner (see `aio-fusion-archive-storage.md`): `effectiveProjectId(clientId)` resolves the project id; "default" keeps the bare key, non-default projects get `aio.earnedTracker.v2::<projectId>`.
- Non-default projects start **empty** rather than inheriting the old bare-key data - do not try to backfill/guess which historical rows belonged to which client (same "never migrate bare data into another project" rule).
- `loadTracker`/`saveTracker` now take `clientId`; the component must re-load tracker state in a `useEffect` keyed on `activeClient.id`, not just on mount, or switching clients won't refresh the visible rows.

**How to apply:** Any other localStorage-backed feature in ReportPage.tsx (or elsewhere) that reads/writes a bare app-wide key without threading `clientId`/`effectiveProjectId` through is a latent cross-client leak - check for this pattern before trusting "per-client" UI copy.
