---
name: AIO Fusion shared (server-side) projects store
description: Cross-device project sync design, its conflict/deletion guards, and how to test the api-server. Read before touching projectSync.ts or the store routes.
---

# Shared projects store

Projects, their Set-Up (intake) answers and logos are mirrored to a Postgres
`projects` table via api-server `/api/store/*` routes, with localStorage kept as
a fast cache. Frontend sync lives in `artifacts/aio-fusion/src/lib/projectSync.ts`.

## Store is now per-account gated (3-tier account model)
**The `/api/store/*` routes are auth-gated via platform sessions and isolated by
account subtree.** An admin (master "AIO Fusion") sees all; an agency sees itself
plus descendant clients; a leaf client sees only its own. Roles overload the
existing `role` varchar: `admin | agency | client` (+ legacy `user` = agency),
with no DB schema change. `getVisibleUsernames`/`canManage`/`canCreateSubAccounts`
in api-server `platform-auth.ts` define the rules; store routes scope every
read AND write to the caller's visible owner set.
**Why:** the product moved off "one login sees everything" to real reseller
hierarchy (agencies manage their own clients). Display names live in
`platform_meta` kv under `account:profile:<username>` (also no schema change).
**How to apply:** owner-reassignment (`POST /store/projects/owner`) and
soft-delete must use `ownerPredicate(visible)` as an atomic write scope; the
owner endpoint additionally uses `.returning()` and reports 409 when 0 rows match
(closes the TOCTOU false-success). The client owner handler awaits the server
FIRST and only mirrors locally on success. Creation gating: non-admins are
coerced to `client`; leaf clients are blocked (`canCreateSubAccounts`).

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

## Visibility relies on the list endpoint returning `name` + client hydration
The `/store/projects` list endpoint must return the `name` COLUMN, not just the
`data` jsonb blob. Intake-only rows (created via the `/intake` route before the
hub `upsert` reached the server) have `data = {}`, so without the name column the
client renders them blank or drops them. `projectSync.hydrateServerProject` then
guarantees every merged project has a valid `id` + non-empty `name`, and the
both-exist merge spreads local under server (`{...lp, ...hydrate(sp)}`) so an
empty server blob never wipes a good local entry.
**Why:** root cause of "colleagues can't see each other's projects" was nameless
`data={}` rows plus sync only running on mount.
**How to apply:** keep name in the list select; never `merged.push(sp.data)` raw.

## A placeholder/empty project name must never win over a real name on merge
Intake-only server rows have an empty name column + empty `data` blob (only the
`/intake` route ran, never the hub `upsert`); their only real name is the intake
company answer (Set-Up field 4.1). The sync merge (`{...lp, ...hydrate(sp)}`)
persists its result to localStorage, so a bad resolved name corrupts the local
copy too, not just the view.
**Why:** resolving a name to the generic "New Project" (or trusting a stale
placeholder in `data.name`) and letting it override a genuine name made
"Simpatico PR" vanish from the hub and overwrote the good local copy.
**How to apply:** (1) server list endpoint recovers the name from the intake
company field when the name column is empty (do it in SQL, do not ship the heavy
intake blob); (2) client name resolution must prefer a REAL (non-empty,
non-placeholder) name across data/column/local sources before ever using the
placeholder; (3) self-heal by pushing the repaired record up once when the
server row is empty/placeholder, gated so it converges and never loops.

## Blank Set-Up must never overwrite a populated one (two-layer guard)
A blank/empty Set-Up (intake) must never replace a populated one, on either side.
Emptiness detection is shared server-side in `api-server/src/lib/intake-guards.ts`
(`intakeIsEmpty` = no real formData answers AND empty category lists/duals).
- **Server:** the `/store/projects/intake` (and `upsert`) conflict update only
  writes the incoming intake when it is non-empty; when empty it
  `coalesce(existing.intake, incoming::jsonb)` so a populated row is kept and an
  empty one is only adopted when there was nothing before.
- **Client (`syncIntakeForProject`):** if remote is empty and local is populated,
  push local UP (this is what HEALS a wiped server copy); if local is empty and
  remote populated, adopt remote; otherwise fall back to the timestamp logic.
  `pushIntake` itself also refuses to send a blank copy.
**Why:** a stale device sending a blank Draft wiped Bluhalo's completed Set-Up in
prod (server unconditionally overwrote, and "default" shared the bare key).
**How to apply:** keep emptiness checks on BOTH sides; a server-only guard still
lets a blank local cache adopt-then-repush nothing, and a client-only guard is
bypassed by any direct POST.

## Legacy "default" project intake key is now namespaced
Every project, including the legacy `id="default"`, now stores intake under
`aio.intake.v2::<id>` (default included). `ensureDefaultIntakeMigrated()` copies
the old bare `aio.intake.v2` onto `aio.intake.v2::default` NON-destructively (only
when the namespaced slot is absent), and is called at the start of
`syncIntakeForProject`, `syncProjectsOnLoad`, and `IntakeForm.currentIntakeKey()`.
**Why:** "default" sharing the bare key let two different people's "default"
projects collide across devices, contributing to the wipe.
**How to apply:** never read the bare key directly for "default"; resolve via the
namespaced key after migration. Migration must stay non-destructive (keep the bare
key) so the old answers remain recoverable.

## Smoke-testing server guards needs a workflow restart
The api-server dev workflow did NOT hot-reload route changes during this work;
a live curl smoke test showed the OLD (unguarded) behaviour until the
`artifacts/api-server: API Server` workflow was restarted, after which the guard
worked. **How to apply:** restart the api-server workflow before curl-smoke-testing
any server route change, or you will validate stale code.

## Live refresh, not just on-load
The hub re-syncs on `visibilitychange`, window `focus`, and a 60s interval (all
no-op when offline) so a project created on another device appears without a
manual reload. Sync still also runs once on mount.

## Permanent backups: append-only snapshots + reversible restore
Every distinct version of a project (name/data/intake/logo) is copied into a
separate append-only history table so client Set-Up data can always be recovered,
even after deletion. Restore writes a chosen version back and is itself reversible
(the live state is backed up first).
**Why:** guards stop a blank from overwriting a populated record, but they cannot
bring back a version that was already replaced; concrete backups can.
**How to apply:** (1) the history table has NO foreign key to projects, so deletes
never cascade the backups away (and a backup can outlive its project). (2) Dedupe
each save against the LATEST snapshot only (stable-stringify compare) so identical
re-saves do not grow history while every genuine change is kept. (3) Split the
fail policy by operation: ADDITIVE saves (upsert/intake) are fail-open (a backup
hiccup must not block the user saving), but DESTRUCTIVE ops (delete, restore)
abort with 503 if the pre-op backup cannot be written, so nothing is lost
unrecoverably. (4) Because the history table has no FK, any route that lists/reads
it by project id MUST still prove ownership: when no project row exists to check
against, only an admin may read the orphaned history (else it leaks across
accounts).

## Testing the api-server
`$REPLIT_DEV_DOMAIN/api/...` routes to the WEB app (Vite), NOT api-server, so it
returns empty. Test api-server directly at `http://localhost:8080` (its PORT), or
through the preview proxy. The api-server runtime bundles `@workspace/db` from
source, but `tsc --noEmit` resolves db TYPES from `lib/db/dist/*.d.ts` (project
references, `emitDeclarationOnly`). So after adding a NEW export to `@workspace/db`
(e.g. a new table), api-server typecheck reports "no exported member" until you
regenerate the declarations: `pnpm --filter @workspace/db exec tsc -b`.
