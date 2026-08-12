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
