---
name: Imported ID counter readiness
description: Sequence readiness after explicit-ID imports and the distinction between counter maintenance and destructive operations.
---

Reviewed imports and restores that preserve explicit numeric IDs must also verify that the next generated identifier is not already occupied.

**Why:** An occupied next backup identifier caused a production backup write to fail and correctly blocked project deletion. A high imported ID alone is not proof of a collision; check actual next-ID occupancy rather than comparing only the maximum stored ID.

**How to apply:** Include serial-counter readiness in migration verification. Keep production checks read-only until counter maintenance is authorised. Never overwrite existing backups, skip backup creation, or treat an identifier collision as a successful backup.