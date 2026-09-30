---
name: Contact email delivery ambiguity
description: How to handle contact messages when historical or interrupted provider acceptance cannot be determined.
---

Treat unknown acceptance as a distinct state, not as a failed send eligible for automatic retry. Commit the unknown state before contacting a provider, then only restore retryability after explicit proof of rejection. Keep a stable provider idempotency key per submission and message kind.

**Why:** The former combined failure flag could not distinguish which of two messages the provider had already accepted. Retrying both could duplicate a customer confirmation; older failed submissions cannot be reconstructed from that flag alone.

**How to apply:** When changing lead delivery or migrations, preserve unknown as unknown until provider evidence or human review resolves it. Do not interpret a failed combined flag as proof that both sends failed.