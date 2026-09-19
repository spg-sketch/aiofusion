---
name: Long media imports
description: Durable execution and retry rules for large shared media workbook imports.
---

Large media imports run as durable jobs. Persist the immutable parsed input before acknowledging the commit, claim work with a stale lease, and recover queued or abandoned work after server startup. Keep the committed batch as the long-term ledger, while the job stores resumable state and the user-facing row outcomes.

**Why:** A reviewed V33 import exceeded the five-minute request window. Request-local background work fixed browser timeouts but could still be stranded by a process restart, and failed jobs could block a legitimate retry.

**How to apply:** Reconcile retries by account plus idempotency key, and verify the exact source hash before replaying. Never make source hash alone globally unique because the same workbook may need a later reviewed re-import. Clear transient input after completion or terminal failure.