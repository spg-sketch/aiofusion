---
name: Stripe webhook readiness
description: Fail-safe checkout gating when a deployed Stripe endpoint and local signing secret drift apart.
---

Staging and production checkout must remain unavailable until startup receives a tagged Stripe event through the intended endpoint and verifies its signature with the locally selected signing secret. Never log secrets or probe identifiers.

**Why:** Stripe does not return an existing webhook endpoint's signing secret through its API, and endpoint metadata cannot attest to that secret. A real signed delivery proves the endpoint URL, Stripe-side secret, and local secret work together.

**How to apply:** Keep the readiness state process-local and fail-closed in deployed environments. Use a temporary tagged Stripe customer to trigger the probe, observe it only after normal signature verification, and delete it afterward. Development bypasses the gate. Both plan and project add-on checkout paths must pass through the same readiness assertion.