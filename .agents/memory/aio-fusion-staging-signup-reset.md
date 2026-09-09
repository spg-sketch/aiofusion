---
name: Reusable staging signup accounts
description: Safety constraints for returning a dedicated password login to first-time onboarding on staging.
---

Reusable signup resets must be staging-only, admin-controlled and limited to a dedicated password owner with one workspace membership, no teammates and no child accounts. Preserve the login identity, but revoke its sessions and reset onboarding, trial and workspace data in one database transaction. Refuse Stripe-linked accounts and accounts whose media records are referenced across workspaces.

**Why:** A reusable login is useful for repeat onboarding tests, but partial cleanup, shared identities or external billing links can erase unrelated data or leave the account in a state that cannot start onboarding again.

**How to apply:** Keep the capability and mutation behind the same server-side staging and administrator checks. Preflight cross-workspace dependencies inside the transaction, reject unsafe targets before committing, and cover credential preservation plus rollback with focused tests.