---
name: Invite expiry uniqueness
description: How the duplicate-invite invariant stays compatible with time-based expiry.
---

Use a partial unique index only for unresolved invitations (unused, unrevoked, and undeclined). Before creating a replacement invite, lock the workspace row and revoke any expired unresolved invitation for that email in the same transaction.

**Why:** PostgreSQL requires partial-index predicates to be immutable, so an `expires_at > now()` predicate is invalid. A time-independent index alone would otherwise retain an expired row and reject a replacement invite.

**How to apply:** Any invitation-creation path must perform the expiry cleanup, duplicate check, and insert while holding the same workspace lock. Schema setup should also revoke already-expired unresolved invitations before it creates or relies on the index.