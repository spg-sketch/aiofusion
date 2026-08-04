---
name: Users admin tree filtering/sectioning
description: Rules for filtering or sectioning the hierarchical Users admin account tree
---
The Users admin page renders a recursive account tree. Any visibility rule (filters, active/archived split) must apply per-account through the WHOLE hierarchy, not just top-level roots.

**Rules established (client-accepted):**
- Every account appears in exactly one section based on its OWN `archived` flag — archiving does not cascade server-side, so mixed-status chains (active→archived→active) are valid persisted states. Children whose flag mismatches their parent's section are surfaced as standalone roots in their own section ("orphans").
- Filter ancestor-retention sets (e.g. the "Only without 2FA" set) must be section-scoped: propagate matches upward only through same-section ancestors, or an archived parent shows because of an active child that then doesn't render under it.

**Why:** Root-only filtering left nested accounts visible/invisible incorrectly and got the completion review rejected twice.

**How to apply:** Any new filter or grouping on UsersAdminPage.tsx should reuse this pattern; add nested + mixed-status-chain test cases in UsersAdminPage.test.tsx.

Also: Vitest 3.x removed tuple-style `vi.fn<[Args], Ret>` generics — use plain `vi.fn()` and let `mockReturnValue` drive inference.
