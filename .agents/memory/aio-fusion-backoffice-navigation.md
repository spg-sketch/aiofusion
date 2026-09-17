---
name: AIO Fusion back-office page transitions
description: Preserves immediate, shell-stable navigation between lazy-loaded authenticated pages.
---

Commit back-office destination page state synchronously and contain lazy-page Suspense inside the authenticated content area.

**Why:** React transitions retained the previous page while a cold destination chunk loaded, which made navigation feel slow and looked as if an unrelated page was loading first. A root-only fallback also risked replacing the entire shell.

**How to apply:** Warm destination chunks opportunistically, but do not use a transition that keeps stale page content visible. New authenticated pages must render inside the shell-level Suspense boundary so the sidebar and project context remain stable.

For auth destinations specifically, provide a stable, auth-specific loading
presentation from document arrival through lazy app loading.

**Why:** OAuth/MFA/reset callback queries share the prerendered `/` document;
React-only routing cannot prevent that marketing markup appearing before app startup.

**How to apply:** Keep the pre-app callback presentation and the in-app waiting
layout consistent, and keep protected content hidden until authority resolves.

Payment callbacks need payment-specific waiting content, not the sign-in shell or the editable billing form, across document startup, authentication, onboarding and payment reconciliation.

**Why:** Fixing lazy navigation alone did not remove checkout flashes. Independently completing authentication, onboarding and subscription requests could still briefly reveal an unrelated screen before the thank-you page.

**How to apply:** Keep the pending presentation consistent even when payment confirmation finishes before onboarding loads. Show success only after server confirmation and an authoritative active subscription; keep failures and retry controls visible rather than placing them below a full-screen loader.