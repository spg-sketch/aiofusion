---
name: AIO Fusion in-tab AI run ownership
description: Rules for long-running AI operations that must survive route changes without crossing identity boundaries.
---

Long-running AI work within an open tab belongs to an app-level lifecycle rather than a routed page. Bind every run to the authenticated session, workspace, project, operation and stable subject. Capture immutable inputs, the absolute start time and the starting estimate once. Treat a closed response stream as an uncertain transport outcome, not proof that server work failed.

**Why:** Routed pages unmount during normal navigation. Page-owned promises lose progress and recovery state, while remounted interval counters restart estimates and background throttling distorts elapsed time. Identity changes can also let late results appear or write in the wrong workspace unless the lifecycle invalidates them. Staging requests can be aborted at the 300-second transport limit while the server still completes and persists the operation moments later.

**How to apply:** Keep request execution and exactly-once completion effects outside page mount lifetimes. Pages subscribe to retained snapshots, derive elapsed time from `Date.now() - startedAt`, and restore results only into the captured subject. Clear all runs at authentication or workspace boundaries. When a long stream closes without its terminal event, reconcile against the server-owned result for the captured identity and start time before showing failure or allowing a retry.