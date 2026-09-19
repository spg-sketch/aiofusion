---
name: Reusable staging signup accounts
description: Safety constraints for returning a dedicated login identity to first-time onboarding on staging.
---

Reusable signup resets must be staging-only, admin-controlled and limited to one dedicated owner with a usable password, Google or Microsoft identity, one workspace membership, no teammates and no child accounts. Preserve the login identity, but revoke its sessions and reset onboarding, trial and workspace data in one database transaction. Refuse Stripe-linked accounts and accounts whose media records are referenced across workspaces.

**Why:** A reusable login is useful for repeat onboarding tests, but partial cleanup, shared identities or external billing links can erase unrelated data or leave the account in a state that cannot start onboarding again.

**How to apply:** Keep the capability and mutation behind the same server-side staging and administrator checks. Preflight cross-workspace dependencies inside the transaction, reject unsafe targets before committing, and cover credential preservation plus rollback with focused tests.

If deletion leaves the configured password-capable E2E identity with zero memberships, a valid staging login may self-repair by creating a brand-new isolated workspace under a random unused slug. Never reclaim a fixed slug or mutate an existing account/company during repair.

**Why:** Workspace deletion can leave the human identity and slug-scoped data behind. Reusing a fixed slug risks account takeover or exposing stale test data; a fresh random slug preserves isolation.

**How to apply:** Require the exact configured email, a verified identity with a password, successful password verification and zero memberships. Optional linked SSO IDs are acceptable for the dedicated identity, but only password login triggers repair. Lock the user and create new neutral account/company/owner rows atomically; production and ordinary identities remain ineligible.