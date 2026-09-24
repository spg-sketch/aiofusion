---
name: Personal MFA transition
description: Safety constraints for moving historical shared workspace MFA to individual protection.
---

Historical workspace factors are not evidence of personal ownership, even for
the earliest Owner. Never clone a shared secret or trusted-device list into
multiple people. Individually attributable moves require existing-factor proof;
ambiguous cases require independently verified, explicit individual recovery.

**Why:** Multiple Owners previously inherited one factor while other Master
members bypassed it. Assigning that shared factor to people would preserve the
security flaw, and silently discarding it would remove existing protection.

**How to apply:** Preserve the shared workspace, identities, roles and deliberate
revocations. Require personal MFA for Master members regardless of role or
sign-in provider. Keep legitimate non-Master userless compatibility isolated;
never revive shared Master bootstrap credentials as a recovery workaround.

Rollout is separate from implementation. Keep at least one independently
verified named Owner recovery/access path throughout an attended transition.
Do not publish or perform real-person resets without explicit environment and
action approval. A reset/transition must not be retried blindly after a lost
response because the person may already have re-enrolled.

**Why:** Security generations and revoked access cannot safely be rolled back
like ordinary application code. Fixtures prove code behavior, not live provider
configuration or a real person's ability to recover.

**How to apply:** Follow the rollout handoff in the repository, inspect the
selected database before writes, migrate one person at a time, and distinguish
fixture/development verification from target-domain publication.

Staging now permits an attended recovery alternative: an existing verified
Master Owner proves both their bound Google identity afresh and a current
legacy authenticator code, then enrolls a newly generated personal factor.
The shared factor remains intact and is never copied. This is distinct from
offline operator approval and must not silently become a production policy.

**Why:** A shared-to-personal MFA transition can block the first Owner before
another Owner is available to assist. Proof must combine the bound individual
identity with the existing factor; neither chat assertions nor Google alone
establish sufficient recovery authority.

**How to apply:** Keep the route staging-only, reject already enrolled identities,
recheck current access at proof consumption, and preserve the separate
operator-assisted process for people lacking either proof. See the rollout
document for publication and attended enrollment boundaries.

For real staging MFA rollout work, verify the database fingerprint against the
dedicated staging-tier connection before any write. `BETA_DATABASE_URL` may
point to an older beta schema and is not proof that it serves
`staging.aiofusion.ai`.

**Why:** An operator recovery applied against the beta database did not affect
the named person's staging login, leaving the legacy-authenticator screen
active.

**How to apply:** Run the guarded migration dry-run first, confirm the target
identity and schema, then apply only when the same staging fingerprint matches.

Do not assume that a staging-tier verification connection is distinct from the
production connection just because its variable has "staging" in the name.
Check target equality without printing connection strings, and confirm which
database the running staging app actually uses before attributing MFA history.

**Why:** A later comparison found the staging-tier verification target equal to
the production target while the beta target was separate. The same person's
personal MFA had an earlier production enrollment and a later first enrollment
in the beta-backed staging app; no reset or disable event was recorded there.

**How to apply:** Compare read-only MFA presence and enrollment audit timestamps
on verified targets, never factor secrets or recovery values. Distinguish a
first staging enrollment from a reset of an already enrolled personal factor.

The staging deployment's database routing changed after an attended MFA setup:
its startup now forces the beta database. The earlier MFA enrollment was found
in the other configured database, while the beta-backed staging deployment
recorded a fresh enrollment only after the switch. This is evidence of a
target change, not evidence that the person used the production website.

**Why:** Inferring the browser hostname from the database that held an MFA
record incorrectly contradicted the user's firsthand account of using the
staging domain. A source-control change and staging startup logs established
the later routing change.

**How to apply:** Before explaining a repeated MFA prompt, establish both
the URL used and the database target *at that time*. Do not change routing
or copy factors as a quick fix; the other target may contain live data.
