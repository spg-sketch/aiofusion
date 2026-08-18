---
name: AIO Fusion Stripe Tax (VAT at checkout)
description: Durable rules for VAT/automatic tax at checkout - fallback policy, VAT-number handling, sync semantics.
---

- Taxless fallback when Stripe Tax is not activated is allowed in TEST MODE ONLY, and the live/test determination must be made fresh per decision (never cached - credentials can swap test-to-live without a restart). Unknown mode = live. **Why:** a UK business must never silently sell without VAT; a cached "test" answer once let live fallback through in review.
- Match the "Tax not activated" error narrowly (invalid_request on the automatic_tax param or the explicit activation message); broader tax/config errors must fail checkout.
- Never pass a stored VAT number inline when creating the Stripe customer - attach it separately and fail-soft, so a malformed value cannot block checkout (the customer can enter one at checkout via tax_id_collection).
- Billing-details sync to the Stripe customer is fail-soft and serialised per account; clearing the address in the app must clear it in Stripe too (send empty, do not omit), and tax-ID reconciliation deletes stale IDs before creating the wanted one.
- Reusing an existing customer with automatic tax requires customer_update address/name "auto" on the checkout session.
