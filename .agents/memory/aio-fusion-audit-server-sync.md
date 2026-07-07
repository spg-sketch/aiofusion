---
name: AIO Fusion audit server sync
description: How all four audit/score types are persisted server-side and synced to localStorage. Covers sync-epoch delete-resurrection prevention, startup table safety, and which components are the authoritative delete surfaces.
---

## Four synced audit types
- Earned Media audits → `saved_audits` table, `/api/store/projects/:id/audits`
- Website/GEO diagnostics → `saved_diagnostics` table, `/api/store/projects/:id/diagnostics`
- Content GEO scores → `saved_content_geo` table, `/api/store/projects/:id/content-geo`
- Technical GEO scores → `saved_tech_geo` table, `/api/store/projects/:id/tech-geo`

All four tables: id varchar PK, project_id, owner, saved_at varchar ISO, result JSONB, deleted_at timestamptz.
Drizzle schema in `lib/db/src/schema/content.ts`; startup-safe CREATE TABLE IF NOT EXISTS in `artifacts/api-server/src/lib/ensure-saved-audit-tables.ts`.

## Sync-epoch delete-resurrection prevention
**Rule:** A per-project-per-kind ISO timestamp (`aio.syncEpoch.<kind>.<projectId>`) is written to localStorage after each SUCCESSFUL server fetch (network errors must NOT advance the epoch or pre-epoch local items get stranded).

- First sync (no epoch): push ALL local items up (one-time migration) AND keep them in merged result.
- Subsequent syncs: local-only items with `savedAt > epoch` → kept in result + pushed (pending write retry). Local-only items with `savedAt <= epoch` → DROPPED from result and NOT pushed (they were deleted on another login).

**Why:** Without this, stale localStorage on device B re-uploads items that device A deleted on the server ("delete resurrection").

## Server-fetch failure must not advance epoch
If `fetchServer*` returns `{ ok: false }` (network error/non-200), the sync function returns the local list unchanged and does NOT call `writeSyncEpoch`. If it did, offline-created items would become stranded (savedAt < advanced epoch) and get dropped on next sync.

## Startup table safety pattern
New tables must have a `CREATE TABLE IF NOT EXISTS` ensure function called from `artifacts/api-server/src/index.ts` on startup — in addition to drizzle-kit push. This protects deployed environments where push may not have run.

## Delete surfaces per type
- **Earned Media audits**: LlmCheckPage has its own in-page history list with Trash2 → calls `deleteServerAudit`.
- **Diagnostics / Content GEO / Tech GEO**: No in-page history list — delete is exposed via Trash2 buttons in the Sidebar's recent history section (hover-reveal). Handlers: `deleteDiagnostic`, `deleteContentGeoItem`, `deleteTechGeoItem` defined in `SidebarContent`.

## Server-first loading surfaces
- LlmCheckPage, DiagnosticPage, GeoContentPage, SeoAuditPage, ReportPage: sync on mount via `syncXForProject`.
- DashboardPage: useState + useEffect calling `syncAuditsForProject` + `syncDiagnosticsForProject` on mount.
- Sidebar (SidebarContent): useState + useEffect calling all four sync functions on mount; also listens to `aio:saved-audits-changed` event for reactive updates.

## `savedAuditsKey` must be exported from LlmCheckPage
`auditSync.ts` imports this key to write merged audit list back to localStorage.
