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

**E2e testing tip:** you can log in as the real "admin" via `curl -d
"{\"password\":\"$PLATFORM_ADMIN_PASSWORD\"}"` — bash expands the env var without
ever printing it to you, and the login response/cookie jar contain no secret
either. Use that admin session to POST a disposable test account with a
password *you* choose (`/api/platform/accounts`), run the browser/e2e test as
that account, then delete it via `/api/platform/accounts/delete`. Simpler than
seeding rows via SQL and avoids duplicating the scrypt hash format by hand.

**Density/layout, not just hierarchy:** fixing the nesting structure alone did
not satisfy "make this page better laid out" — the client's real complaint was
row-level clutter (5-7 always-visible pill buttons wrapping onto multiple
lines) and a page background that didn't match the rest of the app. Fixed by:
background `#1A647B` teal → light `#f8fafc` (teal is a client-approved
exception reserved for the in-project Dashboard only, per
`AIO_Fusion_Style_Guide.md` — don't reuse it elsewhere without asking); and
collapsing secondary per-account actions (Name/Password/Role/Seat
cap/Sessions/Delete) into one kebab "more actions" dropdown, leaving only
"View account" as a visible pill. Projects sub-list truncates to 3 with a
"Show all N" toggle when an account owns more.

**Why:** a purely structural fix (tree nesting) reads as cosmetic if the
per-row information density and off-brand background are untouched — those
are what actually register as "cluttered" to a non-technical reviewer.
