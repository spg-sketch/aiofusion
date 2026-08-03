---
name: AIO Fusion MFA (TOTP)
description: How two-factor login works — mandatory for master (admin) accounts, opt-in for others.
---

# AIO Fusion MFA

- TOTP (RFC 6238) implemented on node crypto in `api-server/src/lib/mfa.ts` — no external dependency. QR rendered client-side with `react-qr-code`.
- MFA state lives in **platform_meta** (`account:mfa:<username>`, JSON {secret, enabled, recoveryHashes}) — NOT platform_users columns. **Why:** works uniformly for legacy accounts (incl. the seeded master admin, which has no email/platform_users row) and needs no schema/PGlite fixture changes.
- Login two-step: after a correct password the server returns a stateless HMAC token (`mfaToken`, 10-min TTL, signed with SESSION_SECRET) instead of a session; `/platform/mfa/verify` or `/mfa/enable` exchanges it for the cookie. Both login branches (platform_users + legacy) go through `finishLoginOrChallenge`.
- Master = `role === "admin"` (normalizeRole). Masters: forced enrolment on first login, cannot disable. Others: opt-in via `MfaSecuritySection` on PlatformHomePage signed-in card.
- Recovery codes: 10 single-use, sha256-hashed; shown exactly once at enrolment.
- SSO logins (Google/Microsoft) are now challenged too: the OAuth callbacks route every session-issuing branch through a redirect variant of the challenge (`finishOauthLoginOrChallenge`) that hands the pending token to the frontend via `/?oauth_status=mfa&mfa_mode=verify|enroll&mfa_token=...`; PlatformHomePage's oauth-redirect effect turns that into the same `MfaLoginStep` panel. The token in the URL grants nothing without a valid code.
- OAuth-callback tests: stub `globalThis.fetch` for the Google token/userinfo endpoints (pass everything else through the real fetch) and call the callback with `redirect: "manual"` plus the `aio_oauth_state` cookie.
- react-qr-code 2.2.0 ships class typings incompatible with React 19 JSX; re-typed as `React.FC` at the import site in MfaPanels.
- E2E-test with a disposable seeded admin row; note shell `$`-expansion mangles scrypt hashes when inlining them into `psql "$..."` commands — use execFileSync args.
- Admin MFA reset: POST `/platform/accounts/reset-mfa` (canManage-guarded, no self-reset, logged `mfa_admin_reset`); UI action in Users admin ⋮ menu.
- react-qr-code's class typings break under React 19 JSX types — MfaPanels casts the import to a function-component signature.

- SSO→MFA redirect (oauth_status=mfa&mfa_token=...) hit the App.tsx URL-param-wipe race: params must be captured in App state (oauthRedirectParams prop → PlatformHomePage) before history-sync strips them. Any NEW redirect query param needs the same capture-in-App treatment.

## OAuth MFA token handoff (Aug 2026)
- SSO MFA pending token now handed to frontend via short-lived non-httpOnly cookie `aio_oauth_mfa_token` (10 min, path=/), redirect carries only `?oauth_status=mfa&mfa_mode=...`. Frontend reads once + clears in PlatformHomePage oauth effect.
- **Why:** keep token out of address bar / browser history / proxy logs.
- platform-mfa.test.ts was scrambled by an earlier bad merge (interleaved test bodies); rebuilt from last good git version + a separate "OAuth SSO MFA challenge handoff" describe block using res.headers.getSetCookie().
