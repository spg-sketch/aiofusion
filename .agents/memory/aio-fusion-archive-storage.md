---
name: Legacy content migration isolation
description: Why old browser content must never be assigned to an arbitrary project during migration.
---

# Legacy migration constraint

Never assign unscoped legacy browser content to the first available project, or populate a real project's library with demo articles.

**Why:** A former migration moved the default project's content into a different client's project. Demo articles also appeared as genuine saved stories in Media Research.

**How to apply:** Preserve explicit project ownership when importing old browser data. Treat uncertain ownership as a reconciliation problem rather than guessing a destination. Earlier notes calling the Archive and Planner browser-only are obsolete; inspect current persistence code before working on migration.
