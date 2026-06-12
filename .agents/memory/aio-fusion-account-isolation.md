---
name: AIO Fusion account-based project isolation
description: How non-admin project visibility and sub-accounts work in the aio-fusion demo
---

# Account-based project isolation (demo-grade)

Visibility is **client-side display filtering only**. Auth is localStorage
(`aio.auth.users.v3`), separate from OIDC. Projects sync to a GLOBAL ungated
`/api/store/projects`; the `owner` round-trips inside the `data` blob. So the
isolation is cosmetic, not server-enforced - flagged to the user.

## Model (auth.ts)
- `User.parent?` set only for sub-accounts (client logins created by a user).
- `getVisibleUsernames(session)`: returns `null` for admin (= see all), `[]` for
  no session, else self + recursive descendants via BFS with a visited Set
  (cycle-safe). All matching is lowercased.
- `canViewOwner(session, owner)`: admin true always; unowned (`""`/undefined)
  visible only to admin, so legacy ownerless projects never leak to non-admins
  (also `migrateAssignOwnerlessToAdmin` assigns them to first admin).

## Rule: deleting a sub-account must reassign its projects to the parent
**Why:** visibility is derived from *current* ownership graph membership. If you
delete a sub-account without reassigning, `canViewOwner(parent, deletedUser)`
becomes false and those projects vanish from the parent - contradicting the
delete-dialog copy "their projects are kept and stay visible to you".
**How to apply:** SubAccountsPage.handleDelete reassigns owned projects to
`session.username` *before* `deleteLocalUser`. Keep these in lockstep.
