---
name: AIO Fusion discount invites (beta/VIP)
description: Admin subscription overview + single-use discount invite links; storage keys, coupon conventions, redemption rules.
---

## Storage (platform_meta, no schema change)
- `discount-invite:<token>` -> invite JSON (email, accountType client|agency, percent 1-99, label, expiresAt 30d, usedAt/usedBySlug)
- `account-discount:<slug>` -> redeemed discount JSON (percent, label, inviteEmail, redeemedAt, endedAt?)
- `billing:last-payment:<slug>` -> upserted fail-soft in handleInvoicePaymentSucceeded for the admin overview

## Rules worth keeping
- Single-use is enforced by an atomic compare-and-swap UPDATE on the stored invite JSON (`WHERE key AND value = original`); never rely on a prior lookup. **Why:** concurrent signups both saw "unused" and both got discounts before the CAS.
- Redemption is email-bound: signup rejects if the submitted email differs from the invite email (bearer URL alone is not enough).
- If redemption fails after account creation, the signup route rolls back the account/user/membership/meta rows so the email is not stuck behind a 409.
- Stripe coupon: deterministic id `aio-invite-<pct>pct`, percent_off, duration `forever`, attached at checkout via `discounts:[{coupon}]` (subscription-level, persists on renewals). No coupon codes ever reach the client.
- End discount = `subscriptions.deleteDiscount` (full price from next invoice, current period untouched) + `endedAt` stamp; tolerate `resource_missing`. 100% off is NOT a discount invite - use the existing free-access flag.
- `requireMasterAdmin(req,res,{mutate})` in admin.ts: restricted masters (membershipRole admin/other on the master workspace) can read but not mutate. `masterSubrole()` reads `account.membershipRole`, not platform_meta.
- Known limitation: SSO signup bypasses invite redemption (UI hides SSO buttons on invited signups, but direct SSO navigation loses the discount).
- Known race (accepted): an in-flight Checkout Session created before an admin ends the discount can still complete discounted.
- New routes must be added to the ai-action-guards PUBLIC_ALLOWLIST test, and no em dashes anywhere (both suites have a no-em-dash test).
