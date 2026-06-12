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
