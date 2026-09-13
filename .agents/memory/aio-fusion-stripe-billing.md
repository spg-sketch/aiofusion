---
name: AIO Fusion Stripe billing foundation
description: Stripe connection quirks, webhook secret location, entitlement/tier rules, and test-DDL ripple effects for the billing system
---

# Stripe billing foundation (subscriptions + per-project action tiers)

- **Connection API key names**: the Replit Stripe connection exposes the API key at `settings.secret` (NOT `settings.secret_key`) and the publishable key at `settings.publishable`. There is **no webhook secret** in the connection settings.
- **Connection environment selection**: Replit can return both Stripe records in one response: sandbox is normally `environment: development`, live is `environment: production`. Never use `items[0]`. Staging/development accepts only test keys and production only live keys.
- **Published staging limitation**: Replit exposes only its live credential slot to a published deployment and rejects sandbox keys in that slot. A staging deployment must use the protected `STRIPE_STAGING_SECRET_KEY` override, validated as `sk_test_`/`rk_test_`; production must ignore it.
- **Why:** a staging deployment received the live record first and created a `cs_live_` Checkout session even though the Replit integration UI correctly showed the staging sandbox.
- **How to apply:** every Stripe client, startup sync, webhook registration, and mode check must obtain credentials through the same environment-aware selector. Never add an order-based or cross-environment fallback. Keep the staging override in Replit Secrets, never source or chat.
- **Webhook secret** lives in `stripe._managed_webhooks.secret`, written by `stripe-replit-sync`'s `findOrCreateManagedWebhook`. `getWebhookSecret()` in `lib/billing.ts` reads it as the fallback. `runMigrations` must run before `findOrCreateManagedWebhook` or it fails with `relation "stripe.accounts" does not exist` (the first boot after adding the integration can race — a restart fixes it).
- **Entitlement model**: `platform_companies` carries stripe_customer_id/subscription_id/plan/billing_frequency/subscription_status/current_period_end (schema v8); `projects.tier` (standard/premium/max = 50/75/150 actions per month). Billing rides on the top-level parent (`resolveBillingSlug` walks parents). Unsubscribed accounts keep the legacy flat 50 (beta grandfathering) — do not break this.
- **Webhook hardening rules** (keep when extending handlers):
  - claim event id in platform_meta BEFORE handling; on handler failure **release the claim** and return 5xx so Stripe retries (otherwise a transient error permanently swallows the event);
  - invoice/subscription lifecycle events must be matched against the STORED `stripe_subscription_id` — a stale event for a superseded subscription must never mutate status;
  - `getProjectActionLimit` only honours a project's tier when the project's `owner` resolves to the same billing slug (prevents quota theft via arbitrary project ids).
- The webhook route uses `express.raw` and is registered BEFORE `express.json()` in app.ts; signature failure → 400, internal failure → 500.
- **Why:** all of the above came out of an architect review flagging entitlement-loss and quota-abuse paths; tests in `routes/billing.test.ts` cover them.
- **How to apply:** any new webhook event type or billing route must follow the claim/release + stored-subscription-match patterns and be added to the ai-action-guards allowlist.

## Checkout claim concurrency invariant

The checkout-in-progress guard must remain live from the moment a claim is issued until Stripe can no longer complete the session. The core rule: **a pre-session claim is TTL-preemptable; a finalized claim (with a session id) is not** - it may only be released by a webhook (`checkout.session.completed` or `checkout.session.expired`). Releasing on URL-return or TTL alone is insufficient once a live Stripe session exists.

If finalization fails (DB write), the route must expire the Stripe session and return an error - never return the URL with an unprotected claim still in place.

Checkout claims must bind every parameter that changes what the customer will buy, including billing frequency. Reuse an open Stripe URL only when those parameters match; otherwise expire the old session, conditionally release its claim, and create the newly selected checkout. For legacy claims, recover the frequency from Stripe session metadata before deciding.

Before reusing any finalized claim, retrieve the Stripe session and check its status. An expired session is dead even if its expiry webhook was missed: conditionally release that claim and create a fresh checkout. A completed session stays locked until fulfilment applies, preventing a duplicate subscription while its webhook is pending.

During the one-time sandbox-to-live Stripe transition, a finalized claim can still reference a `cs_test_` session that the new live key cannot retrieve. Release and replace it only when all three facts agree: test-session prefix, live credentials, and Stripe `resource_missing`. Never generalise this to missing live sessions because an old live session may still be chargeable under another account.

**Why:** installing Replit Integrated Payments on the live account changes the deployment from sandbox to live credentials, but the durable checkout claim survives in PostgreSQL and otherwise blocks the first live checkout.

The same transition can leave a sandbox customer ID in the billing record. Before checkout, verify the stored customer exists under the connected Stripe account; if it is missing and the account has no active entitlement, replace it with a customer in the current account. Never auto-replace the customer for an entitled account because that could detach a real subscription.

The completion webhook conditional UPDATE must allow: (a) first purchase (null stored sub), (b) idempotent replay (same sub), (c) re-subscription after cancellation (status = 'cancelled'). An incoming sub that matches none of these is a late duplicate and must be cancelled via the Stripe API immediately.

**Why:** an architect review found that TTL preemption of a finalized claim and an unconditional completion UPDATE both created windows for double-billing; cancelled re-subscription is a legitimate flow that the duplicate guard must not block.

## Project add-ons (extra projects)
- Each extra project is funded by its own annual Stripe add-on subscription; add-on state is a shared pool per billing root (agency + managed children share one).
- **Why:** allowance = plan-included + purchased add-ons, enforced subtree-wide; the paid slot buys the project's EXISTENCE, so cancelling an assigned add-on retires (soft-deletes) its project — otherwise cancellation is a revenue bypass.
- **How to apply:** allowance check + insert + slot assignment must be one critical section under the billing-root lock; tier/delete writes must carry subtree ownership in the SQL predicate and treat 0 rows as stale. Cross-account transfer detaches the binding (clear first, then persist) but keeps a queued downgrade — it belongs to the subscription.
- Queued downgrades apply only on `billing_reason === "subscription_cycle"` invoices (Stripe webhooks are unordered). Legacy cap 2 is for unsubscribed accounts only — never Math.max it into entitled allowances.
- Locks are in-process; multi-process deployment needs DB-backed locking first.

## Product meaning of an instance
- Treat an "instance" as one additional independent project workspace for another brand, client, or programme.
- **Why:** customers may also use "instance" to mean extra environments or parallel runtime workloads inside one project, but that is a separate capacity need and should not be bundled into project packs.
- **How to apply:** describe Standard, Premium, and Max packs as independent project workspaces. Do not introduce an instance-capacity add-on until a confirmed customer requirement calls for multiple environments or parallel workloads within one existing project.
