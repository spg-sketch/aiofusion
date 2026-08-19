---
name: Live invitation uniqueness
description: Keeping expired invitations from conflicting with the durable one-live-invite-per-email database rule.
---

Treat expired invitations as retired before applying or relying on the state-based unique index for active invitations. Creation must retire a matching expired invite and create its replacement under the same workspace lock.

**Why:** PostgreSQL partial indexes cannot safely use the moving current time in their predicate. A state-only unique index otherwise treats an expired, unused row as live and blocks a replacement despite the product's expiry semantics.

**How to apply:** Before creating or maintaining the index, mark legacy expired rows revoked. In any new invitation-creation path, serialize on the workspace row, retire matching expired rows, then test for a still-live invitation before inserting.