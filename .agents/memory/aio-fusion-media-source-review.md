---
name: Media source review safety
description: Rules for keeping public-source observations separate from user-approved media contact data.
---

Store each public-source check as an immutable, workspace-scoped observation with its own outcome, evidence, differences, and review time. Never treat a failed or changed source as permission to delete or overwrite contact data.

**Why:** Public pages can disappear or change, and browser-submitted findings are not trustworthy. A contact record may also contain deliberate user-owned overrides that must take precedence over later source observations.

**How to apply:** Fetch only the stored source URL through the server SSRF boundary. Approval may apply only a supported difference recorded by that server check, only after an explicit user action, and must skip fields marked as user-owned overrides.