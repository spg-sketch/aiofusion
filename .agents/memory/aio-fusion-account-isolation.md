---
name: AIO Fusion account-based project isolation
description: How auth and per-account project visibility are enforced (server-side) in aio-fusion
---

# Account-based project isolation (server-enforced)

Auth and isolation are enforced on the **server**, not the browser. The browser
keeps a localStorage cache only for synchronous UI reads; it is not the security
boundary.

## Model
- Logins: username/password verified server-side. Passwords hashed with scrypt;
  sessions are httpOnly cookies. Endpoints live under `/api/platform/*`
  (login/logout/me/status/accounts/migrate). The store lives under
  `/api/store/*` and every route requires a platform session.
- Visibility: an admin sees all projects (no filter); a normal account sees its
  own plus every descendant sub-account's projects (BFS over the account
  hierarchy). Ownership is the `projects.owner` column, stamped server-side from
  the session on create. Reads filter by owner; writes/deletes 403 (or 404 on
  intake read) when the project's owner is outside the caller's visible set.

## Rule: the migration endpoint must stay admin-only
**Why:** `/api/platform/migrate` seeds accounts (including admins) and backfills
owners. If it were unauthenticated, a fresh deploy could be hijacked by seeding
admin credentials before the real admin runs it. The client triggers it only
after an admin signs in, before the cache is overwritten (local passwords still
present). It is one-shot via a `platform_meta` flag and skip-existing, so it
never overwrites server passwords.

## Rule: deleting a sub-account must reassign its projects to the actor
**Why:** visibility is derived from *current* ownership. Deleting an owner
without reassigning would orphan its projects out of the parent's view. Enforced
server-side in the account-delete route (reassigns `projects.owner` to the actor
before deleting the account); the client also mirrors this for snappy UI.

## Rule: store conflict-updates must never touch owner or deletedAt
**Why:** a stale client write must not revive a soft-deleted project or reassign
ownership. The upsert/intake `onConflictDoUpdate` sets leave both columns alone.

## Rule: store writes/deletes must carry an atomic owner predicate
The pre-check (`getOwner` + `canSee`) gives the friendly 403, but the write
itself must ALSO be scoped to the caller's visible owners: upsert/intake via
`onConflictDoUpdate({ setWhere: ownerPredicate(visible) })` and delete via
`WHERE id = ? AND owner IN visible`. `ownerPredicate` returns `undefined` for
admins (no restriction).
**Why:** ownership can change between the pre-check read and the write (TOCTOU),
which would let a stale/racing request mutate another account's project. The
predicate closes that window at statement-execution time.

## Gotcha: a NULL-owner (orphaned) project + a stale local session hides it
There is **no API path to set/reassign a project's owner from NULL**: upsert/intake
preserve owner on conflict, `/api/platform/migrate` is one-shot (meta flag), and
account-delete only reassigns by *matching* an existing owner string (a NULL owner
matches nothing, and usernames must be 2-32 chars so you cannot create an account
named ""). The prod DB is read-only via `executeSql` (read replica). So an orphaned
prod project can only be re-owned by a code change + republish.
**Symptom seen in the wild:** an orphaned (NULL-owner) project is visible to admins
both server-side (`canSee(owner, null)===true`) and client-side (admin = no filter),
yet a user reported it missing while their `admin`-owned projects showed. Root cause
was a **stale local session whose role was not "admin"**: `getVisibleUsernames`
returned `{admin,...}` (owner-filter) instead of `null`, so it showed owner=admin
projects and hid the NULL-owner one. **Fix: re-login / hard refresh** -
`bootstrapAuth` re-reads role from `/api/platform/me` and resets the session to
admin, restoring the no-filter view.

## How to edit production project data (no DB write access)
Drive the **live app API** at `https://www.aiofusion.ai` with curl + a cookie jar:
POST `/api/platform/login` then `/api/store/projects/upsert`. The admin account's
password **equals the `PLATFORM_ADMIN_PASSWORD` secret** (also present in the dev
env), so pass it via the env var, never echo it. Upsert **overwrites `data`**, so
always GET the project first and resend its existing `data`/`logo` (only change the
field you mean to). To rename cleanly, set BOTH the `name` column and `data.name`
(display uses `pickName(data.name, colName, ...)`, which ignores the "New Project"
placeholder).

## Self-serve "delete my account and data" (GDPR erasure)
`POST /api/platform/account/self-delete` (any signed-in account, password
re-entry required) hard-deletes every table the account owns (projects,
project_snapshots, archive_items, planner_items, scoring_configs, media_*,
token_usage, audit_locks, platform_sessions/meta/accounts) — unlike the
admin-only `accounts/delete`, which reassigns projects instead of deleting them.
Blocked if the account is the last admin, or still has active sub-accounts
(caller must remove/reassign those first — never cascade-delete another
account's data as a side effect). UI lives in the PlatformHomePage signed-in
card ("Danger Zone").
**Why:** Privacy Policy promises a right-to-erasure; needed a real self-serve
path distinct from the existing admin reassignment-based delete.

## Rule: never seed a hardcoded admin password in production
`ensureDefaultAdmin` only seeds the known fallback credential in development. In
production it requires `PLATFORM_ADMIN_PASSWORD`; if unset it skips seeding and
warns rather than creating a guessable admin.
**Why:** a fresh production deploy with a public default password is an
auth-takeover path. The live DB is already migrated (real admin exists), so the
gate only affects brand-new deployments.
