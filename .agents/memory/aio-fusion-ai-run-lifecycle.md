---
name: AIO Fusion in-tab AI run ownership
description: Rules for long-running AI operations that must survive route changes without crossing identity boundaries.
---

Long-running AI work within an open tab belongs to an app-level lifecycle rather than a routed page. Bind every run to the authenticated session, workspace, project, operation and stable subject. Capture immutable inputs, the absolute start time and the starting estimate once.

**Why:** Routed pages unmount during normal navigation. Page-owned promises lose progress and recovery state, while remounted interval counters restart estimates and background throttling distorts elapsed time. Identity changes can also let late results appear or write in the wrong workspace unless the lifecycle invalidates them.

**How to apply:** Keep request execution and exactly-once completion effects outside page mount lifetimes. Pages subscribe to retained snapshots, derive elapsed time from `Date.now() - startedAt`, and restore results only into the captured subject. Clear all runs at authentication or workspace boundaries.