---
name: AIO Fusion login/SSO overhaul
description: Schema, API, and frontend patterns for email verification, account type selection, and Microsoft SSO (task #382).
---

# AIO Fusion login/SSO overhaul — Steps 1–8 complete

## Schema v3 (ensurePlatformSchemaV3)
- `platform_users.email_verified` — nullable bool. NULL=legacy/SSO (treated as verified), false=unverified new password signup, true=verified.
- `platform_companies.setup_complete` — nullable bool. NULL=legacy (skip setup screen), false=new account needs to choose type, true=done.
- `platform_email_verifications` — token (PK, 64 char hex), user_id FK, expires_at, used_at. Single-use, consumed on click.

**Why:** Nullable columns mean no migration needed for existing accounts; NULL is always treated as "already done" for legacy users.

## Email verification flow (password signup only)
1. `POST /platform/signup` → creates account, inserts token, sends email via `sendVerificationEmail()`, returns `{ needsVerification: true, email }` (NO session cookie).
2. User clicks link → `GET /platform/verify-email?token=xxx` → marks token used, sets emailVerified=true, sets setupComplete=false on company, issues session cookie, redirects to `/?needs_setup=true`.
3. On error/expiry → redirects to `/?verify_status=expired` or `expired|invalid|error` → PlatformHomePage detects and shows resend UI.
4. `POST /platform/resend-verification` always returns ok (never reveals email existence). loginLimiter applies.

## Account type selection
- `AccountTypeSelectPage` is a full-page gate rendered in App.tsx when `needsSetup && session && !authLoading`.
- `setNeedsSetup(true)` is triggered by: `?needs_setup=true` URL param (OAuth/verify redirect), `bootstrapAuth()` returning `needsSetup: true` (setupComplete===false in /platform/me), `onNeedsSetup()` callback on PlatformHomePage (when login returns needsSetup:true).
- `POST /platform/setup/account-type` sets role on both platform_accounts and platform_companies, sets setupComplete=true.
- Agency and client are the only valid accountType values.

## Microsoft Entra ID SSO
- Routes: `GET /platform/auth/microsoft`, `GET /platform/auth/microsoft/callback`.
- State stored in `aio_ms_state` cookie (httpOnly, secure, sameSite:lax, 10min).
- Token endpoint: `https://login.microsoftonline.com/common/oauth2/v2.0/token`.
- User info: `https://graph.microsoft.com/v1.0/me` (uses access_token, not id_token).
- Email field: `profile.mail || profile.userPrincipalName`.
- Env vars: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` — NOT YET SET in production/staging. Without them, routes return `?oauth_status=error&oauth_msg=microsoft_not_configured`.
- Identity resolution order: by microsoftId → by email in platform_users → by email in platform_accounts (legacy) → create new.
- `linkMicrosoftId()` in platform-auth.ts handles attaching microsoftId to existing users.

## Email URL helper
- `getAppBaseUrl()` in notify-email.ts reads `CANONICAL_DOMAIN` env var. Falls back to `https://www.aiofusion.ai`.
- **Must set `CANONICAL_DOMAIN=staging.aiofusion.ai` on the staging deployment** so verification links point to staging, not prod.
- In dev: RESEND_API_KEY not set → no emails sent → URL doesn't matter.

## Key files
- `lib/db/src/schema/platform.ts` — emailVerified + setupComplete columns, platformEmailVerificationsTable
- `artifacts/api-server/src/lib/ensure-platform-schema-v3.ts` — idempotent migration
- `artifacts/api-server/src/routes/platform.ts` — all new routes
- `artifacts/api-server/src/lib/platform-auth.ts` — getUserByMicrosoftId, linkMicrosoftId
- `artifacts/api-server/src/lib/notify-email.ts` — sendVerificationEmail, getAppBaseUrl
- `artifacts/aio-fusion/src/lib/auth.ts` — serverSignUp (needsVerification), serverResendVerification, serverSetAccountType, bootstrapAuth (returns {session, needsSetup})
- `artifacts/aio-fusion/src/pages/AccountTypeSelectPage.tsx` — new full-page component
- `artifacts/aio-fusion/src/pages/PlatformHomePage.tsx` — verification pending screen, Google+Microsoft SSO buttons, onNeedsSetup prop
- `artifacts/aio-fusion/src/App.tsx` — needsSetup state, AccountTypeSelectPage gate

## PGlite test note
If route tests are added for the new routes, the verify-email token lookup uses `platformEmailVerificationsTable` which requires schema v3 to be applied in the test fixture.
