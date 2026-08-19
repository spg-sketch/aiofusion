---
name: AIO Fusion last sign-in semantics
description: The distinction between genuine authentication activity and session changes that must not update a client's last-sign-in record.
---

Persist last-sign-in timestamps separately from session rows because logout removes the session. Record only after a successful password, MFA, OAuth, email-verification, invite-acceptance, or password-setup authentication completes.

**Why:** The agency client list needs to remember access after logout, while impersonation and workspace switching are operator/session-management actions and otherwise create false client activity and destructive-action warnings.

**How to apply:** Route genuine authentication completions through the shared recording session helper. Keep impersonation and workspace-switch paths on plain session creation. Client lists and recent-access warnings must read only the persisted timestamp, never a session-row fallback.