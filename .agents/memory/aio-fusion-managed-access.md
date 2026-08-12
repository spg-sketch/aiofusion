---
name: Managed client access flag
description: Access-disable for managed client accounts - enforcement principles and revoke pitfalls.
---

# Managed client access flag

A platform_meta flag marks a client workspace as access-disabled ("managed" by the agency).

**Rule:** the flag must be enforced at every sign-in/entry chokepoint (password login, OAuth callbacks, MFA completion, workspace switching) - never treat it as UI-only state. Agency impersonation ("View account") intentionally bypasses the checks.

**Why:** scrambling passwords is NOT sufficient revocation - multi-workspace humans keep their shared credential (which must not be damaged) and SSO identities can't be scrambled at all. A code review rejected a scramble-only revoke as broken access control. A second review rejected the route for (a) missing membership-role gating (viewer/billing members could revoke) and (b) claiming email-grant success when no set-password token could be issued.

**How to apply:**
- Revoke = set the flag (the enforcement) + credential scramble/session/token/trusted-device cleanup as defense in depth; only touch the shared user credential when the human belongs solely to the target workspace.
- Login paths should route multi-workspace humans to a non-managed workspace rather than locking them out.
- Grant-by-email must refuse (409) when the contact email belongs to a human with other workspaces, and must not clear the flag unless a usable set-password token was actually issued.
- Destructive access routes need membership-role gating (owner/team-admin only), not just subtree checks.
- Any new sign-in surface must add the managed check.
- Backfill for accounts created before the flag existed: the access route's `mark-managed` action (alias of revoke behaviour) + a "Mark as managed" button in the client list; there is no reliable heuristic (pre-flag managed accounts got a random password hash indistinguishable from an agency-set one).

## Recent-sign-in confirmation gate
Destructive access actions (revoke, mark-managed) on POST /platform/accounts/access return 409 `{requiresConfirmation, lastSignInAt}` when the client's newest platform_sessions row is <30 days old, unless the body has `confirmRecentSignIn: true`. Signal = max(sessions.createdAt) (sessions vanish on logout; task for durable last-sign-in is separate). Client double-confirm lives in SubAccountsPage handlers via serverSetClientAccess opts.
**Why:** so an agency tidying "Mark as managed" badges can't silently lock out an actively-signing-in client.
**How to apply:** any new destructive credential action on client accounts should reuse this gate; note impersonation ("View account") also creates a session row for the client, so warnings can be conservative false-positives.
