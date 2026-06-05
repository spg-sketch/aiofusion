---
name: AIO Fusion shared (server-side) projects store
description: Cross-device project sync design, its conflict/deletion guards, and how to test the api-server. Read before touching projectSync.ts or the store routes.
---

# Shared projects store

Projects, their Set-Up (intake) answers and logos are mirrored to a Postgres
`projects` table via api-server `/api/store/*` routes, with localStorage kept as
a fast cache. Frontend sync lives in `artifacts/aio-fusion/src/lib/projectSync.ts`.

## Deliberate design decision: store is global / ungated
**The store routes are intentionally NOT auth-gated.** Every signed-in user shares
all projects ("one login sees everything, everywhere").
**Why:** the frontend uses its OWN localStorage prototype auth (`aio.auth.*`),
not the backend Replit Auth; this is a shared demo workspace for Simpatico PR.
The other service routes (diagnostic, seo-audit) are ungated the same way.
**How to apply:** do NOT add per-user partitioning or auth to `/api/store/*`
unless the product genuinely moves off the localStorage prototype auth. A code
review will flag this as "broken access control" — it is a conscious tradeoff,
not a bug.

## Two conflict guards that must stay (both are data-loss preventers)
1. **Never clear `deletedAt` on upsert/intake conflict updates** (store.ts). Only
   the delete route sets it. **Why:** a stale write from another tab/device would
   otherwise resurrect a project deleted elsewhere. Verified: delete then
   upsert/intake keeps the row in `deletedIds`.
2. **Untimestamped local intake must never be silently overwritten by the server**
   (`syncIntakeForProject`). If local intake exists but there is no entry in the
   `aio.intake.updatedAt.v1` map, keep local, push it up, then stamp it.
   **Why:** pre-feature / never-synced local answers have `localTime = 0`; a naive
   `remoteTime > localTime` lets any remote copy clobber genuine local work.
   Conflict timing is per-device (localStorage map), not embedded in the payload,
   so a missing timestamp means "unknown age", not "old".

## Testing the api-server
`$REPLIT_DEV_DOMAIN/api/...` routes to the WEB app (Vite), NOT api-server, so it
returns empty. Test api-server directly at `http://localhost:8080` (its PORT), or
through the preview proxy. The api-server builds with esbuild (build.mjs) bundling
`@workspace/db` from source, so `projectsTable` resolves at runtime even though
`tsc --noEmit` reports pre-existing type-resolution errors for db tables.
