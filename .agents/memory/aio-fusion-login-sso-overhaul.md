---
name: AIO Fusion login/SSO overhaul — session revocation + signup changes
description: Key decisions from Steps 1–4 of the login/SSO overhaul; covers schema additions, fast-path session revocation, and removal of the pending_approval gate.
---

## What was done (Steps 1–4)

**Step 1 — Schema additions** (`lib/db/src/schema/platform.ts`):
- `platform_users`: `session_version integer NOT NULL DEFAULT 0`, `microsoft_id varchar(255) UNIQUE`
- `platform_sessions`: `session_version integer` (nullable; null = legacy, skip check)
- `platform_companies`: `free_access boolean NOT NULL DEFAULT false`, `billing_email varchar(255)`, `vat_number varchar(64)`, `display_name varchar(128)`

**Step 2 — Session revocation** (`artifacts/api-server/src/lib/platform-auth.ts`):
- `incrementSessionVersion(userId)` — exported; call on password change, revocation, suspension
- `createPlatformSession` now reads `platform_users.session_version` and stamps it on the session row
- `getPlatformSessionAccount` checks version mismatch after expiry check; `row.sessionVersion != null` guards legacy sessions
- Migration: `ensure-platform-schema-v2.ts` (registered fire-and-forget in `index.ts`)

**Why:** `null` session_version on a session row = legacy (pre-revocation) session, skip check. Loose `!= null` in the check treats `undefined` the same as null, so pre-existing test sessions without the field also skip the check cleanly.

**Steps 3+4 — Remove pending_approval gate:**
- Password signup (`POST /platform/signup`): now creates `status: "active"`, creates session + sets cookie, returns `{ ok: true, username, role: "agency" }`
- Google OAuth new-user registration: `status: "active"` + session cookie + redirect to `/?oauth_status=ok` (not `pending`)
- Login endpoint: removed `pending_approval` 403 blocks from both new-path and legacy-path
- Frontend `serverSignUp` in `auth.ts`: now returns `{ ok: true; session: Session }` — caller gets a session back and calls `onLoginSuccess(session)` directly
- PlatformHomePage: removed "pending approval" holding screen; signup now goes straight to dashboard

**How to apply:**
- PGlite test setups in route tests need ALL new columns in their `CREATE TABLE` DDL (see `platform-login-signup.test.ts`, `platform-exit-impersonation.test.ts`, `platform-users.test.ts`). Keep them in sync with the schema file whenever schema changes happen.
- `db.update().set().where().returning()` chain is used by `incrementSessionVersion`; the platform-auth mock in unit tests supports this pattern via its `usersById` map.
- Cookie name is `aio_sid` (not `aio_platform_session`); check for `aio_sid=` in Set-Cookie headers in tests.
- Test `res.headers.getSetCookie?.()` (not `.get("set-cookie")`) to get ALL Set-Cookie headers as an array — needed when the server sets multiple cookies (e.g. clearing oauth state + setting session).

## Remaining plan steps

- **Step 5**: Email verification — send verification email on signup; gate certain actions on verified status
- **Step 6**: Account type selection screen — after signup, route user to choose agency/client type before dashboard
- **Step 7**: Google SSO first-time flow fix — largely resolved by Step 4 (new Google users now `active` immediately); may need polish
- **Step 8**: Microsoft Entra ID SSO — `microsoft_id` column pre-added in Step 1; OAuth flow to build
