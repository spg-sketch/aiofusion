---
name: pnpm audit override ranges
description: How to avoid pnpm security overrides resolving a legacy dependency to another vulnerable major.
---

When replacing a vulnerable transitive dependency from an older major, use an exact patched version when a broad lower bound can cross majors. Always regenerate the lockfile and scan the exact resolved versions, not just the override declarations.

**Why:** A generated `>=` replacement for an older nanoid dependency resolved to a later major that was independently vulnerable, leaving the audit finding active despite a seemingly safe minimum.

**How to apply:** After `pnpm audit --fix`, inspect every changed override and all resolved lockfile entries for the affected package families. Tighten cross-major replacements to the patched version within the parent dependency's expected major.