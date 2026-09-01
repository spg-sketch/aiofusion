---
name: Media CSV import safety
description: Durable scoping and duplicate-prevention rules for importing media contacts and outlets.
---

Customer-uploaded media lists must always be scoped to the active account, even when the uploader is a platform admin. An admin upload must not silently create globally visible contacts.

**Why:** The platform also supports intentional global records and manual duplicates. Treating every admin import as global risks leaking a customer's private media list, while broad database uniqueness constraints would change existing manual-entry semantics.

**How to apply:** Use the same duplicate-planning rules for preview and commit. Re-plan inside the commit transaction after taking an account-scoped advisory lock. Skip an existing contact before creating its proposed new outlet, so duplicate contacts cannot leave orphan outlets.