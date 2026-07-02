---
name: AIO Fusion account impersonation + hierarchy redesign
description: How "View account" (support impersonation) and the nested accounts tree work on UsersAdminPage, and how to e2e-test it safely.
---

Support impersonation ("View account") swaps the `aio_sid` cookie server-side to the
target account's session, stashing the admin's original session id in a short-lived
`aio_admin_sid` cookie (4hr TTL) so exit can restore it without a fresh login. Nested
impersonation (impersonating while already impersonating) is rejected with 400.

**Why:** keeps the real security boundary server-side (scrypt+cookie), matching the
existing platform-auth model, rather than trusting any client-side "view as" state.

**How to apply:** any future admin-support tooling on this page should extend the
existing stash/restore pair in `platform-auth.ts` rather than inventing a second
session mechanism.

The accounts list on UsersAdminPage renders via a recursive `renderAccountNode`
(children keyed by `parent`), not a flat `.map()` with `marginLeft` indentation.
Sub-accounts nest inside a `border-l-2` rail container per style-guide accent, with
a chevron expand/collapse and a sub-account count badge on any master with children.

**Why:** margin-based indentation was explicitly called out by the client as "clunky"
for hierarchy clarity; the bordered/rail nesting pattern is now the expected idiom
for this page.

**E2e testing tip:** do NOT try to log in as the real "admin" account in tests —
`PLATFORM_ADMIN_PASSWORD` is a secret you cannot read, and the dev fallback constant
in `demo-run.ts` only applies when the secret is unset. Instead seed disposable
test accounts directly via SQL (matching `platform_accounts` schema: `username`,
`password_hash` as `scrypt$<salt>$<derivedHex>` using Node's `crypto.scryptSync`
with keylen 64, `role`, `parent`), run the test, then delete them afterward.
