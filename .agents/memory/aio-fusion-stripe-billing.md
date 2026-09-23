---
name: AIO Fusion Stripe billing foundation
description: Stripe connection quirks, webhook secret location, entitlement/tier rules, and test-DDL ripple effects for the billing system
---

# Stripe billing foundation (subscriptions + per-project action tiers)

## Tier-change payment evidence

An upgrade's payment evidence must identify the invoice created by that specific Stripe update, not simply the newest paid invoice on the subscription. An uncertain payment response must not encourage an automatic retry with a fresh charge.

**Why:** the newest paid invoice can still be the previous renewal when the new payment is incomplete. A transport failure can also occur after Stripe has already applied the change. Either case can produce a false success or a duplicate-charge risk.

**How to apply:** reconcile the update's returned invoice against the approved amount and currency, and separate uncertain post-update outcomes from safe pre-charge preview failures.

## Staging verification resource safety

Do not assume a legacy beta connection, workspace database, and published staging database are the same. Prove the target independently before seeding, and preflight its complete required schema before creating Stripe test resources.

**Why:** creating external test resources before proving the target can leave immutable test invoice history even when mutable fixtures are cleaned up.

**How to apply:** stop before Stripe writes if schema or target checks fail. Persist recovery IDs before each external write, guarantee compensating database cleanup, and verify scoped cleanup. Deleting test clocks does not erase historical Stripe test invoices or charges.

## Staging database target promotion

When staging is rebound from Replit's deployment database to the dedicated beta database, validate identity using exact secret equality, not a hostname/name substring list.

**Why:** a stale `PRODUCTION_DB_IDENTIFIERS` value classified the correct beta URL as production. Compilation succeeded, but the API exited during Autoscale service creation and the publish UI did not show the application error; deployment runtime logs did.

**How to apply:** bind `DATABASE_URL` to `BETA_DATABASE_URL` before database imports, assert exact equality afterward, and reject exact equality with `PRODUCTION_DATABASE_URL`. Preflight the full startup schema and exact production bundle against beta, with Stripe disabled during local readiness checks so it cannot move the published webhook.

## Payment recovery evidence

Treat checkout acknowledgement, subscription activation, and complete Billing details as separate checks.

**Why:** a staging checkout was acknowledged and activated while its renewal date remained empty. Stripe returned item-level billing periods, not the legacy subscription-level period. The historical delivery failure was absent from available logs, so a signing-secret mismatch could not be established as its cause.

**How to apply:** verify the existing transaction against persisted entitlement and renewal data. Inspect actual payloads and delivery responses; local webhook tests do not establish deployed delivery success.

- **Connection API key names**: the Replit Stripe connection exposes the API key at `settings.secret` (NOT `settings.secret_key`) and the publishable key at `settings.publishable`. There is **no webhook secret** in the connection settings.
- **Connection environment selection**: Replit can return both Stripe records in one response: sandbox is normally `environment: development`, live is `environment: production`. Never use `items[0]`. Staging/development accepts only test keys and production only live keys.
- **Published staging limitation**: Replit exposes only its live credential slot to a published deployment and rejects sandbox keys in that slot. A staging deployment must use the protected `STRIPE_STAGING_SECRET_KEY` override, validated as `sk_test_`/`rk_test_`; production must ignore it.
- **Staging override readiness**: any Stripe startup/configured guard must count a valid staging override as configured. Otherwise checkout works but migrations, webhook registration, and backfill silently skip.
- **Staging webhook independence**: use the protected signing-secret override and direct Stripe endpoint update; keep business entitlement handling independent of mirror/backfill success. Run Stripe migrations before this staging branch and start backfill afterward.
- **Webhook URL updates do not update signing secrets**: moving a managed endpoint to the staging URL while retaining a secret from another endpoint causes every delivery to fail signature verification. The protected staging secret must come from the exact test-mode endpoint receiving `/api/stripe/webhook`.
- **Why:** a valid test subscription and paid invoice remained unapplied because Stripe deliveries reached staging but all returned 400 from a mismatched endpoint secret.
- **How to apply:** after any staging endpoint or secret change, republish and require both a 2xx `checkout.session.completed` delivery and no signature-verification warning in deployment logs.
- **Approved billing confirmation UI**: preserve the Account and Team Settings billing layout with payment confirmation, plan/frequency, Active status, renewal date, invoice link, and update/cancel actions.

**Why:** The user confirmed this exact post-checkout Billing details presentation looked great after a successful annual sandbox subscription.

**How to apply:** Future billing or checkout changes should retain this information hierarchy and continue routing successful onboarding payments directly to this screen.

- **Renewal communication**: successful paid onboarding pauses on a dedicated confirmation screen before Billing; Billing derives paid-until and days remaining from Stripe's period end.

**Why:** The user wanted a clear payment acknowledgement and visible time remaining, while keeping the approved Billing details page as the final destination.

**How to apply:** Keep the confirmation as an explicit user step with a Billing CTA. Renewal emails use a database claim tied to the exact period end, exclude non-renewing subscriptions, and reset only when the period changes.
- **Managed webhook ownership**: local development and published staging can share the same sandbox account and database. `stripe-replit-sync` deletes other managed webhook URLs, so development must never register/manage the webhook; only staging/production deployments may do so.
- **Why:** a staging deployment received the live record first and created a `cs_live_` session. After correcting credentials, a later development restart replaced the staging webhook URL, so successful sandbox payment events never activated onboarding.
- **How to apply:** every Stripe client, startup sync, webhook registration, and mode check must obtain credentials through the same environment-aware selector. Never add an order-based or cross-environment fallback. Keep the staging override in Replit Secrets, never source or chat.
- **Webhook secret** lives in `stripe._managed_webhooks.secret`, written by `stripe-replit-sync`'s `findOrCreateManagedWebhook`. `getWebhookSecret()` in `lib/billing.ts` reads it as the fallback. `runMigrations` must complete before any environment-specific webhook configuration or readiness probe, or signed staging deliveries can reach a missing `stripe.accounts` mirror.
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

## Paid onboarding confirmation
- Paid onboarding should arrive at Billing with a visible server-verified acknowledgement, rather than leaving customers to find their subscription under another settings tab.
- **Why:** the user completed a paid signup but interpreted the absence of confirmation, followed by an active subscription beside “Confirming payment…”, as an uncertain payment outcome.
- **How to apply:** distinguish confirmation of the returned checkout from verification of an existing active subscription. A success URL alone proves neither; retain clear pending/error states and never require another purchase to resolve uncertainty.

## Additional-workspace confirmation
Confirm the specific add-on purchase separately from the main subscription. An unassigned paid workspace is available for the next new project; it is not an already-created project.

**Why:** the generic active-subscription banner made an extra-workspace purchase look indistinguishable from the customer's existing plan. The main subscription renewal date also does not establish the add-on's renewal date.

**How to apply:** use the server-verified purchase kind and persisted workspace grant for the tier and assignment wording. Do not infer a fresh purchase from an existing active subscription, old unused slots, or a success URL.
