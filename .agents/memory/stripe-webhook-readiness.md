---
name: Stripe webhook readiness
description: Fail-safe checkout gating when a deployed Stripe endpoint and local signing secret drift apart.
---

Production checkout must remain unavailable until startup receives a tagged Stripe event through the intended endpoint and verifies its signature with the locally selected signing secret. Staging may also recover from ordinary signed webhook traffic, but only after business handling succeeds. Never log secrets or probe identifiers.

**Why:** Stripe does not return an existing webhook endpoint's signing secret through its API, and endpoint metadata cannot attest to that secret. A real signed delivery proves the endpoint URL, Stripe-side secret, and local secret work together.

**How to apply:** Keep the readiness state process-local and initially fail-closed in deployed environments. Use a temporary tagged Stripe customer to trigger the probe, observe it only after signature verification and successful business handling, and delete it afterward. Development bypasses the gate. Both plan and project add-on checkout paths must pass through the same readiness assertion.

Staging recovery must not be overwritten by an older startup timeout or delayed probe cleanup. Optional Stripe mirror failures must not block business handlers or recovery.

**Why:** A deployment can miss the startup probe while later signed renewal events successfully update entitlements. Treating that initial timeout as permanent leaves checkout closed despite demonstrated webhook recovery.

**How to apply:** Accept successful staging deliveries at the verified business-handler boundary, not at signature verification alone. Preserve recovered readiness when startup finishes late. Keep the production tagged-probe policy unchanged unless separately requested.