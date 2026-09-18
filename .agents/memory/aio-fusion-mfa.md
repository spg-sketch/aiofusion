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
