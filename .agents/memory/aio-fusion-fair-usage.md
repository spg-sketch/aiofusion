---
name: AIO Fusion fair usage policy
description: Product boundaries for content action allowances, tier limits, multipliers, and excluded audit operations.
---

Content fair usage is enforced per project over a rolling 30-day window. Standard, Premium, and Max allowances are 50, 75, and 150 actions. A positive account-level admin multiplier applies after the project tier allowance is resolved.

Only content-generation and optimisation actions count. LLM Check audits and LLM query generation are excluded because they use separate 21-day locks. Excluded operations must remain available when the content allowance is exhausted, but all AI operations still remain subject to the account-wide spend cap.

**Why:** Published project packs promise tier-specific content allowances, while audits and query generation have separately communicated timing controls. Mixing these limits blocks a product operation under the wrong policy.

Media discovery and journalist coverage research are not content-writing actions, including older usage records named as content operations. They remain subject to the account spend cap. For a multi-contact coverage check, reserve the whole eligible batch before making any provider call, then settle each attempted call from measured usage; retain an estimate for attempted calls that fail before usage is available. A near-cap rejection must not start a subset of searches that cannot yield a saved result.

**Why:** Counting research against content allowance produced a misleading AI-limit error, while recording coverage checks at zero bypassed the real spend guard. Independent reservations for a five-contact batch could also spend money on a request that returned only a cap error.

**How to apply:** When adding another research action, keep content-quota accounting separate from spend accounting. If a result needs an all-or-nothing group of provider calls, reserve that group atomically before dispatch and wait for every started call before responding.

The canonical platform-admin workspace is not a subscribed customer, so a tier lookup returns zero even for its own internal projects. Its own content actions must bypass the tier-based action count, but retain the monthly spend cap; accessing a customer-owned project from that privileged session must not inherit the bypass.

**Why:** Enabling tier enforcement after an account switchover blocked the platform team's first Content Creator action as "fair usage exhausted" despite no content actions being counted.

**How to apply:** Keep the exception tied to both the authenticated platform-admin role and ownership of the requested project, after the spend-cap check. Do not use the human's email as a quota identity.