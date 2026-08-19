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
- Credential health probes use a deliberately invalid authorization code: Microsoft returning `invalid_grant` confirms it accepted the client ID and secret, without requiring unused app-only Graph permissions. Startup and six-hour checks log success/failure without logging credentials or provider response bodies.
  **Why:** a client-credentials probe can falsely alert when the app has no app-only Graph grant, even though delegated user sign-in is healthy.
  **How to apply:** preserve the `invalid_grant`-is-healthy interpretation when changing the Microsoft OAuth health check; treat `invalid_client`, missing variables, network failures, and other endpoint responses as loud failures.

## Email base URL
- `getAppBaseUrl()` reads `CANONICAL_DOMAIN` env var (fallback: `https://www.aiofusion.ai`).
- **Set `CANONICAL_DOMAIN=staging.aiofusion.ai` on staging** so verification links don't point to prod.

## Task #382 hardening (Aug 2026)
- Progressive login lockout: lib/login-lockout.ts, platform_meta key `login-lockout:<id>`; MFA failures use a separate `mfa:<username>` scope so a fresh password login cannot clear the MFA lockout; cleared only in completeMfaLogin.
- Master sub-roles are membership-role mappings (owner->owner, admin->technical, other->support) via masterSubrole/isRestrictedMaster in platform-auth.ts; guards on admin write endpoints and account-management platform routes. No separate table.
- Impersonation guard isImpersonatedRequest blocks credential/destructive routes incl. /platform/accounts/password and reset-mfa (found by review as bypass).
- Suspension cascade uses `suspended-via:<child>` meta flags; explicit block deletes the flag so parent-unblock never restores; master/self cannot be blocked.
- Billing details on platform_companies (billingEmail/vatNumber); actor's OWN membership role must pass canEditBillingDetails even when target is a managed descendant (canManage alone is not enough).

## Wave 2 gotchas (Aug 2026)
- A master/admin account with `membershipRole: null` is classified as a restricted "support" subrole by `masterSubrole()` (only `undefined` or `"owner"` count as owner). Injected test accounts must use `membershipRole: "owner"`.
- `req.account` never carries `email` in production sessions - routes that email the actor must resolve it from platform_users (via userId) or platform_accounts.
- SSO "last sign-in method" is staged in sessionStorage on button click (`markPendingSso`) and only promoted to localStorage when the redirect returns `oauth_status=ok` (`confirmPendingSso` in App.tsx); failure statuses clear the pending marker.
- Both OAuth POST callbacks reject scanner user-agents (SCANNER_UA_RE) since the no-JS Continue button means form-submitting scanners could redeem the one-time code.
