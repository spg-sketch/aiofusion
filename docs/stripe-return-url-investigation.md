# Stripe sandbox missing return URL investigation

## Finding

The missing `return_url` SetupIntent warning is not produced by the current AIO Fusion billing implementation or by the Stripe sandbox connection attached to this project.

The application does not create or confirm SetupIntents or PaymentIntents directly. Its payment entry points create Stripe-hosted objects:

- Main subscription: Checkout Session with an environment-derived `success_url` and `cancel_url`
- Project add-on: Checkout Session with an environment-derived `success_url` and `cancel_url`
- Payment-method management: Customer Portal Session with an environment-derived `return_url`

Stripe Checkout and Customer Portal own any intent confirmation performed inside those hosted pages.

## Evidence checked

On 19 September 2026:

1. A repository-wide search found no calls to create or confirm SetupIntents or PaymentIntents and no use of Stripe.js `confirmSetup` or `confirmPayment`.
2. The connected Stripe sandbox API returned no SetupIntents, no failed PaymentIntents, and no `setup_intent.setup_failed` or `payment_intent.payment_failed` events in the latest 100 records.
3. The same sandbox contained 24 AIO Fusion Checkout Sessions and 11 AIO Fusion `checkout.session.completed` events. Recent main-subscription and project-add-on sessions had both destinations present, with success and cancel origins set to `https://staging.aiofusion.ai`.
4. The latest completed AIO Fusion sandbox event was a paid, complete project add-on and had an associated Stripe request, confirming that the hosted flow and event delivery completed.
5. The application routes pass destinations from `getAppBaseUrl()`, so staging sessions return to staging rather than the live site when the staging deployment environment is configured.
6. Route tests now assert the complete success, cancel, and portal return destinations instead of checking only partial query strings.

## Conclusion

There is no app-owned intent confirmation boundary at which to add `return_url` or `redirect: "if_required"`. Adding intent-confirmation behavior would introduce a second payment flow and would not fix the reported request.

If the warning recurs, capture the Stripe request ID from the warning or Dashboard request log before changing application code. The owning Stripe account and request origin can then be compared with this project's connected sandbox.