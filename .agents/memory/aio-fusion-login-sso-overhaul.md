---
name: AIO Fusion login/SSO overhaul
description: Schema, API, and frontend patterns for email verification, account type selection, and Microsoft SSO.
---

## Schema (ensurePlatformSchemaV3)
- `platform_users.email_verified` — nullable bool. NULL=legacy/SSO (treated as verified), false=unverified, true=verified.
- `platform_companies.setup_complete` — nullable bool. NULL=legacy (skip setup screen), false=needs type selection, true=done.
- `platform_email_verifications` — single-use token (64 char hex), consumed on click.
- **Nullable columns mean no migration for existing accounts; NULL always treated as "already done".**

## Email verification (password signup only)
1. Signup → no session, returns `{ needsVerification: true }`, sends token email.
2. Token link → marks used, sets emailVerified + setupComplete=false, issues session, redirects `/?needs_setup=true`.
3. Errors → `/?verify_status=expired|invalid|error` — PlatformHomePage detects and shows resend UI.
4. `POST /platform/resend-verification` always returns ok (never reveals email existence).

## Account type selection
- `AccountTypeSelectPage` full-page gate in App.tsx when `needsSetup && session && !authLoading`.
- Triggered by: `?needs_setup=true` URL param, `bootstrapAuth()` returning `needsSetup: true`, or `onNeedsSetup()` callback on PlatformHomePage.

## Microsoft SSO
- State in `aio_ms_state` cookie (httpOnly, 10 min). User info from Microsoft Graph `/v1.0/me`.
- Email: `profile.mail || profile.userPrincipalName`. Identity resolution: by microsoftId → email in platform_users → email in platform_accounts → create.
- Env vars: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` — without them routes return `?oauth_status=error&oauth_msg=microsoft_not_configured`.

## Email base URL
- `getAppBaseUrl()` reads `CANONICAL_DOMAIN` env var (fallback: `https://www.aiofusion.ai`).
- **Set `CANONICAL_DOMAIN=staging.aiofusion.ai` on staging** so verification links don't point to prod.
