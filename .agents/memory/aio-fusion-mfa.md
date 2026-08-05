---
name: AIO Fusion MFA (TOTP)
description: How two-factor login works — mandatory for master (admin) accounts, opt-in for others.
---

- TOTP (RFC 6238) in `api-server/src/lib/mfa.ts` — no external dependency. QR rendered client-side with `react-qr-code`.
- MFA state lives in **platform_meta** (`account:mfa:<username>`, JSON {secret, enabled, recoveryHashes}) — NOT platform_users columns. Works uniformly for legacy accounts (incl. seeded master admin with no platform_users row) and needs no schema/PGlite fixture changes.
- Login two-step: correct password → stateless HMAC pending-token (`mfaToken`, 10-min TTL, signed with SESSION_SECRET) instead of session; `/platform/mfa/verify` or `/mfa/enable` exchanges for cookie. Both platform_users and legacy login branches go through `finishLoginOrChallenge`.
- Master (`role === "admin"`) = forced enrolment on first login, cannot disable. Others: opt-in.
- Recovery codes: 10 single-use, sha256-hashed; shown exactly once at enrolment.
- SSO logins also challenged via `finishOauthLoginOrChallenge`: OAuth callback redirects `/?oauth_status=mfa&mfa_mode=verify|enroll`; pending token delivered via short-lived non-httpOnly cookie `aio_oauth_mfa_token` (10 min) — keeps token out of address bar/proxy logs.
- SSO→MFA redirect hits the App.tsx URL-param-wipe race: params captured in App state (`oauthRedirectParams` prop → PlatformHomePage) before history-sync strips them. Any NEW redirect query param needs the same App-level capture treatment.
- Trusted devices: opt-in at verify, `aio_mfa_trust` HMAC cookie + server-side device record in platform_meta. Cookie alone is not enough — server checks device id still on stored list, enabling server-side revocation. Disable + admin reset clear the list.
- Admin MFA reset: `POST /platform/accounts/reset-mfa` (canManage-guarded, no self-reset).
- react-qr-code's class typings break under React 19 JSX types — cast import to function-component signature at use site.
- platform-mfa.test.ts was scrambled by a prior bad merge; if MFA tests fail with ReferenceErrors, suspect merge damage and restore from last good git version.
