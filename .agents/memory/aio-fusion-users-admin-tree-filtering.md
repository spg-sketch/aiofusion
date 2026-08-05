---
name: Users admin tree filtering/sectioning
description: Durable hierarchy invariant for the Users admin account tree
---
Any filter or section applied to the Users admin tree must be evaluated per-account through the WHOLE hierarchy:

- Every account appears in exactly one section based on its OWN `archived` flag (archiving does not cascade). Mixed-status chains (active→archived→active) are valid; mismatched children become standalone roots ("orphans") in their own section.
- Ancestor-retention for filter sets must be section-scoped: only promote an account to visible if a matching descendant exists **within the same section**, never across sections.

**How to apply:** any new filter or grouping on UsersAdminPage.tsx must follow this pattern; add nested + mixed-status-chain cases in UsersAdminPage.test.tsx.
