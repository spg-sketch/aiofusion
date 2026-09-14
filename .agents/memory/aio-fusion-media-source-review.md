---
name: Media source review safety
description: Rules for keeping public-source observations separate from user-approved media contact data.
---

Store each public-source check as an immutable, workspace-scoped observation with its own outcome, evidence, differences, and review time. Never treat a failed or changed source as permission to delete or overwrite contact data.

**Why:** Public pages can disappear or change, and browser-submitted findings are not trustworthy. A contact record may also contain deliberate user-owned overrides that must take precedence over later source observations.

**How to apply:** Fetch only the stored source URL through the server SSRF boundary. Approval may apply only a supported difference recorded by that server check, only after an explicit user action, and must skip fields marked as user-owned overrides.

Automatic reverification must use expiring database claims, workspace-fair batch limits, and exponential retry delays for unavailable sources. A failed fetch is a check attempt, not a successful verification.

**Why:** The API can run in multiple processes, and public-source outages must not create duplicate work, unbounded traffic, or misleading "verified" timestamps.

**How to apply:** Claim eligible rows transactionally with skip-locked semantics, cap work globally and per workspace, release stale claims after a short lease, and keep successful verification dates unchanged when a fetch fails.