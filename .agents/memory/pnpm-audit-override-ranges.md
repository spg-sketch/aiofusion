---
name: pnpm audit override ranges
description: How to avoid pnpm security overrides resolving a legacy dependency to another vulnerable major.
---

When replacing a vulnerable transitive dependency from an older major, use an exact patched version when a broad lower bound can cross majors. Always regenerate the lockfile and scan the exact resolved versions, not just the override declarations.

**Why:** Generated `>=` replacements have crossed majors both into another vulnerable release and into a release incompatible with a direct dependency. In a pnpm workspace, `pnpm audit --fix` run from child directories also targets the shared root and can materialize workspace overrides into the root manifest.

**How to apply:** After `pnpm audit --fix`, inspect every changed manifest and all resolved lockfile entries. Remove generated override duplication, then pin cross-major replacements to a patched version within the parent dependency's expected major.