# Client/project package capacity: staging verification

## Scope and safety

This is the disposable-account scenario set for the existing end-to-end Stripe payment verification work. Automated regression tests use an isolated in-memory database and mocked Stripe responses; they do **not** prove published-site payment or webhook delivery.

Run these scenarios only after this change is published to **staging**. A live-domain check cannot verify code that exists only in the development preview or staging. Confirm the deployment identity, staging database, and Stripe **test mode** before creating accounts or submitting a test card. Do not use production credentials, real cards, existing customer accounts, or customer projects.

Create uniquely named disposable Agency and Direct Client workspaces through normal signup, recording their generated account/project identifiers in the verification report. Use a separate fresh pair for cancellation tests. Do not delete or repurpose historical customer records. Cleanup must target only the recorded disposable identifiers; cancel their Stripe test subscriptions before any approved cleanup.

## Capacity contract

- Agency beta: two client/project packages. An active empty managed client reserves one package. Its first project reuses that package; a second project is not allowed.
- Paid Agency: three included packages plus one for each verified capacity add-on purchase.
- Direct Client beta: one project. Paid Direct Client: one included project plus purchased project capacity, all in the same client account.
- Existing legacy Agency-owned projects consume packages. An active managed client with historical excess projects consumes the larger of one or its live project count.
- Archiving an empty client releases its reservation; archiving a client with live projects does not make those projects free. Restoring must pass the current capacity checks.
- Free access uses the account type's included paid allowance; it is not unlimited. Master administrative exceptions are separate from customer entitlements.
- Existing excess remains readable and editable. Normal operations may not increase the excess.

The capacity response distinguishes `reserved` capacity units from `used` live projects. Never label an unused paid capacity unit as an already-created project.

## Agency beta and conversion

1. Start a fresh Agency beta trial. Verify included 2, purchased 0, reserved 0, remaining 2.
2. Create two empty managed clients. Verify reserved 2, live projects 0, remaining 0. Attempt a third client through the UI and API; both must explain agency Billing.
3. Create one project for each client, including one through intake-first creation. Verify reserved remains 2 and live projects becomes 2. Re-submit the same project identifiers; no duplicate capacity is consumed.
4. Attempt a second project for either client and a new Agency-root project. Both must be rejected, without blocking either existing hub.
5. Open base-plan checkout, then cancel or use a failing test payment. Included capacity must stay at 2.
6. Complete base-plan checkout with a Stripe test card. Before verified confirmation, the UI must not claim paid capacity. After confirmation, included becomes 3 while the original client/project identities and content remain unchanged.
7. Create a third client. A fourth is blocked until a paid package is confirmed.
8. Purchase one annual additional client/project package. Confirm the specific add-on purchase, tier and available/reserved state. Create a fourth client, then its first project. Purchased 1, reserved 4; no fifth client or second project for the fourth client.

## Direct Client beta and paid add-on

1. Start a fresh Direct Client beta, create its one project, and verify a second is blocked.
2. Confirm it cannot create child accounts, regardless of requested role.
3. Convert to paid using test checkout. Included remains 1 and the original project is retained.
4. Buy an annual additional project package. After verified payment, create project two in the **same account**. No extra client account is created.
5. Verify failed, abandoned and delayed add-on payments do not grant capacity. Replay the successful event via Stripe test tooling; purchased capacity must not increase twice.

## Retry, restore and transfer checks

- Submit two simultaneous client creations for the last free package. Exactly one distinct client is created. Retry the successful request with the same idempotency key: it returns the same client, including auto-generated slugs.
- Reuse an idempotency key with different creation data: expect a conflict, not a second client.
- Submit two simultaneous project creations for one empty managed client: exactly one succeeds. Concurrent upsert/intake for the same identifier must converge on one project.
- Soft-delete a managed client's project, create a replacement, then try restoring the original. Reject the restore while the replacement is live.
- Restore a deleted Direct Client project only when a slot is available; restoring a version of an already-live project does not consume capacity.
- Transfer an Agency-root legacy project into an empty managed client; capacity must not increase accidentally. Transfers to an occupied managed client fail.
- Reparent a disposable client across Agencies using authorized administrative controls. Confirm ownership, billing root, tier and add-on bindings follow the documented exception/entitlement policy, without letting the receiving Agency create further excess.
- Move an add-on-funded client out of the source Agency. Create a replacement client and its first project in that Agency; verify the released package funds the replacement at the purchased tier. Cancel that add-on and confirm only the replacement funded project is retired.
- Move a project-bearing client into an Agency with three reserved included packages and one unassigned purchased package. A single successful transfer must immediately bind the purchased package and its tier to that project. Cancelling the package must retire that exact project.
- In an isolated fixture, reclassify an Agency as a Direct Client while retaining stale Agency plan metadata. Confirm included capacity stays at one, project two binds to its purchased add-on, and cancellation retires that funded project.
- Seed historical excess **only in disposable fixtures**. Check existing hubs remain accessible, while new clients and extra child projects are blocked.

## Tier changes and cancellation

1. Preview an immediate tier upgrade. Confirm the prorated charge is shown and paid before applying the upgrade. Neither an upgrade nor a queued renewal-time downgrade creates another capacity unit.
2. Cancel an unassigned add-on. At the effective cancellation event, purchased capacity falls by one; the UI must not claim a project was deleted when no project existed.
3. Cancel an Agency add-on reserved by an empty client. The client remains visible as historical data. While over limit, its first project and restoration of a cancelled funded project must both be rejected; the old reservation is not a way to reuse cancelled capacity. Check the displayed over-limit state.
4. Cancel an add-on funding a project. At effective cancellation, verify the existing soft-retirement behavior for that specific project. Its snapshots and underlying data remain recoverable. No unrelated client/project is deleted.
5. Verify restores are capacity-checked and cancelled project/add-on bindings cannot be resurrected through stale sync or webhook replay.

## Evidence to record

Record staging build/deployment identity, scenario date, disposable workspace/project identifiers, Stripe **test** session/subscription/event identifiers, before/after capacity responses, visible confirmation screenshots, and pass/fail results. Do not include passwords, cookies, keys, or full personal/billing data. State explicitly which scenarios were not run; do not turn mocked-test success into a published-payment verification claim.