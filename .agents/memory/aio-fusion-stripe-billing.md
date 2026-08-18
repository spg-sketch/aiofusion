---
name: AIO Fusion Stripe billing foundation
description: Stripe connection quirks, webhook secret location, entitlement/tier rules, and test-DDL ripple effects for the billing system
---

# Stripe billing foundation (subscriptions + per-project action tiers)

- **Connection API key names**: the Replit Stripe connection exposes the API key at `settings.secret` (NOT `settings.secret_key`) and the publishable key at `settings.publishable`. There is **no webhook secret** in the connection settings.
- **Webhook secret** lives in `stripe._managed_webhooks.secret`, written by `stripe-replit-sync`'s `findOrCreateManagedWebhook`. `getWebhookSecret()` in `lib/billing.ts` reads it as the fallback. `runMigrations` must run before `findOrCreateManagedWebhook` or it fails with `relation "stripe.accounts" does not exist` (the first boot after adding the integration can race — a restart fixes it).
- **Entitlement model**: `platform_companies` carries stripe_customer_id/subscription_id/plan/billing_frequency/subscription_status/current_period_end (schema v8); `projects.tier` (standard/premium/max = 50/75/150 actions per month). Billing rides on the top-level parent (`resolveBillingSlug` walks parents). Unsubscribed accounts keep the legacy flat 50 (beta grandfathering) — do not break this.
- **Webhook hardening rules** (keep when extending handlers):
  - claim event id in platform_meta BEFORE handling; on handler failure **release the claim** and return 5xx so Stripe retries (otherwise a transient error permanently swallows the event);
  - invoice/subscription lifecycle events must be matched against the STORED `stripe_subscription_id` — a stale event for a superseded subscription must never mutate status;
  - `getProjectActionLimit` only honours a project's tier when the project's `owner` resolves to the same billing slug (prevents quota theft via arbitrary project ids).
- The webhook route uses `express.raw` and is registered BEFORE `express.json()` in app.ts; signature failure → 400, internal failure → 500.
- **Why:** all of the above came out of an architect review flagging entitlement-loss and quota-abuse paths; tests in `routes/billing.test.ts` cover them.
- **How to apply:** any new webhook event type or billing route must follow the claim/release + stored-subscription-match patterns and be added to the ai-action-guards allowlist.

## Project add-ons (extra projects)
- Add-ons live in platform_meta `projectAddons:<billing slug>` as a JSON array `{subscriptionId, tier, projectId|null, pendingTier?}`; each add-on is its own annual Stripe subscription with metadata `{slug, kind:"project-addon", tier, projectId?}`.
- **Why:** one shared pool per billing account (agency + managed children resolve to one billing root) keeps allowance = included + add-ons enforceable subtree-wide.
- **How to apply:** all count/insert/assign work must run inside `withBillingLock` (in-process per-billing-slug mutex; never nest for the same slug - deadlocks); tier writes only via `setProjectTierScoped` (ownership + not-deleted in the SQL predicate, 0 rows = stale, treat as failure).
- Cross-account project transfer must detach the add-on binding and clear the tier BEFORE the owner update - but keep `pendingTier` (it belongs to the subscription; renewal must lower the slot's tier even while unassigned).
- Queued downgrades are only consumed by invoices with `billing_reason === "subscription_cycle"` - Stripe webhooks are unordered.
- `getProjectAllowance`: entitled = exactly included + add-ons (In-House 1, Agency 3); LEGACY_PROJECT_CAP 2 only for unsubscribed/malformed state. Legacy `Math.max(2, ...)` gave subscribers a free second project - don't reintroduce.
- Locks are in-process only: a multi-process deployment needs DB-backed locking before scaling.
- Test gotcha: PGlite-backed route tests hitting billing paths need platform_accounts (column is `password_hash`, not `password`), platform_meta and platform_companies DDL; fully-faked-db route tests should `vi.mock("../lib/billing")` instead.
