# Staging agency tier-change verification

Date: 17 September 2026  
Target: published staging deployment only  
Payment environment: Stripe test mode only

## Scope and safety

- Used newly generated agency and managed-client fixtures in the database belonging to the published staging deployment.
- Used a dedicated Stripe test-clock customer and Stripe test payment method.
- Did not use the customer-live beta database, existing customer subscriptions, live Stripe mode, or real payment methods.
- Removed the dedicated database accounts, memberships, companies, projects and add-on mapping after verification.
- Cancelled the dedicated Stripe subscriptions and deleted their customer and test clock.
- A final scoped check found no remaining dedicated staging database fixtures.
- Stripe retains historical test-mode invoices and charges. These are test records and cannot be erased by deleting the customer or clock.

## Results

| Check | Result | Evidence |
|---|---|---|
| Latest Billing tier controls published | Pass | Published bundle contained the agency-specific included-project disclosure, tier-price availability guard, pending-tier UI and project-tier API integration. |
| Agency sees managed-client projects | Pass | Authenticated staging Billing listed the managed-client included Premium project and managed-client paid Premium add-on, alongside the agency included project. |
| Included Premium → Max annual disclosure | Pass | Billing displayed Max at **£800/year** for the selected managed-client included Premium project. |
| Included Premium → Max attached checkout and charge | **Blocked** | `POST /api/platform/billing/project-checkout` returned 503 with the visible message: “Checkout is temporarily unavailable because the payment notification setup needs attention. Please contact support.” No Checkout Session was created and no card details were entered. |
| Backend failure remains visible | Pass | The 503 message remained visible in the Billing card after the control returned from its working state. Browser evidence was captured during the staging run. |
| Paid add-on Premium → Max | Pass | The staging API returned `applied: now`; reloading authoritative billing state returned Max with no pending tier. |
| Paid add-on prorated charge | Pass for Stripe charge, **fail for pre-confirmation display** | Stripe test mode produced a paid `subscription_update` invoice for **£150**. The UI had shown annual prices and generic proration wording, not the exact £150 immediate charge before submission. |
| Max → Standard scheduling | Pass | The staging API returned `applied: at_renewal`; authoritative billing state remained Max with Standard pending. |
| Limits retained until renewal | Pass | Before the renewal invoice finalized, the project remained Max and the pending Standard tier remained present. |
| Scheduled tier applied at renewal | Pass | A dedicated test-clock cycle produced a paid **£500** Standard annual `subscription_cycle` invoice. Authoritative billing state then returned Standard with no pending tier. |
| Signed webhook handling | Pass for business state | The renewal event updated the project and the webhook endpoint returned 200. The `stripe-replit-sync` mirror logged a fail-soft missing `stripe.accounts` error, but entitlement handling completed. |
| Reload shows authoritative state | Pass | Fresh authenticated reads showed immediate Max after upgrade, Max plus pending Standard after downgrade, then Standard with no pending tier after renewal. |

## Blocking defect

Staging checkout readiness remained closed even though subsequent valid signed Stripe webhook traffic returned 200 and correctly applied the renewal downgrade. The process-local readiness state appears able to remain stale after a startup probe failure. This blocked the included-project Checkout Session and prevented verification of its actual £800 charge.

Follow-up work is tracked separately to:

1. restore checkout readiness after valid Stripe notifications recover; and
2. show the exact immediate prorated upgrade amount before confirmation.

## Validation notes

- The scripts package typecheck passed before the temporary verification harness was removed.
- The configured full regression command reported 1 failed API suite and 76 passed API suites (1,061 tests passed). The failure was in `src/routes/platform-oauth.test.ts` while creating a PGlite index against a missing `project_id` column. It is unrelated to this verification-only work.
- Root typecheck passed in completion validation.