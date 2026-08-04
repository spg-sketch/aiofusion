---
name: Security alert email recipient resolution
description: How to pick which user gets account-security emails for a workspace
---
Rule: when emailing a security notice about a workspace/account (MFA reset, password change, etc.), resolve the recipient to the workspace's **owner membership** (earliest owner, inner-joined to platform_users), falling back to the legacy platform_accounts email — never `getUserByCompanySlug`, which returns the *latest* membership of any role.

**Why:** a recently invited content/viewer/billing teammate would otherwise intercept security alerts meant for the account holder (code review rejected this once).

**How to apply:** any new notify-email trigger keyed by company slug must use the owner-membership query pattern (see reset-mfa handler) and stay fail-soft. Tests must seed an owner + a later non-owner member to prove non-owners don't receive it; clear stale memberships first since logins auto-create owner memberships.

Also: an account event (like a password change) usually has THREE routes — self-service, email-reset, and admin-acting-on-account (`/api/platform/accounts/password`); a notification hook must cover all of them or code review rejects it. Fire-and-forget IIFE after `res.json` is the established non-fatal send pattern.
