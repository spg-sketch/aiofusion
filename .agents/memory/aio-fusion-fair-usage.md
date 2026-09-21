---
name: AIO Fusion fair usage policy
description: Product boundaries for content action allowances, tier limits, multipliers, and excluded audit operations.
---

Content fair usage is enforced per project over a rolling 30-day window. Standard, Premium, and Max allowances are 50, 75, and 150 actions. A positive account-level admin multiplier applies after the project tier allowance is resolved.

Only content-generation and optimisation actions count. LLM Check audits and LLM query generation are excluded because they use separate 21-day locks. Excluded operations must remain available when the content allowance is exhausted, but all AI operations still remain subject to the account-wide spend cap.

**Why:** Published project packs promise tier-specific content allowances, while audits and query generation have separately communicated timing controls. Mixing these limits blocks a product operation under the wrong policy.