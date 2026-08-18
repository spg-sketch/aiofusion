---
name: AIO Fusion Stripe Tax (VAT at checkout)
description: How VAT/automatic tax, VAT-number sync and invoice links work in checkout; fallback and mode rules.
---

- Both checkout paths add `automatic_tax` + `billing_address_collection: required` + `tax_id_collection` + `customer_update: {address, name: auto}` via a shared `createSessionWithTax` helper. **Why:** customer_update is required when reusing a customer with automatic tax.
- "Stripe Tax not activated" fallback is TEST MODE ONLY (key prefix sk_live/rk_live check, cached; unknown = live) and matched narrowly (invalid_request on param automatic_tax or "Stripe Tax ... activat" message). Live mode refuses checkout instead of silently selling without VAT.
- VAT numbers are never passed inline as `tax_id_data` on customers.create - attach separately, fail-soft, so a malformed stored VAT number cannot block checkout. `vatNumberToTaxId` maps GB/XI -> gb_vat, EU prefixes -> eu_vat, others null.
- `syncStripeBillingDetails(slug)` is fail-soft, serialised per slug via withSlugLock("billing-sync:<slug>"), clears the Stripe address when the app address is cleared (send "" not omit), and reconciles tax IDs (delete stale, create wanted). Called on billing-details save (awaited) and before reusing a customer at checkout.
- Owner one-time dashboard steps (activate Stripe Tax, origin address, registrations, "email finished invoices") are documented at the bottom of replit.md.
- Subscription endpoint returns `latestInvoiceUrl` (hosted invoice link, fail-soft null).
