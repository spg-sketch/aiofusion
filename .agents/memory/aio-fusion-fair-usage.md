---
name: AIO Fusion fair usage policy
description: Product boundaries for content action allowances, tier limits, multipliers, and excluded audit operations.
---

Content fair usage is enforced per project over a rolling 30-day window. Standard, Premium, and Max allowances are 50, 75, and 150 actions. A positive account-level admin multiplier applies after the project tier allowance is resolved.

Only content-generation and optimisation actions count. LLM Check audits and LLM query generation are excluded because they use separate 21-day locks. Excluded operations must remain available when the content allowance is exhausted. All AI operations still record estimated costs, while the monthly GBP cap is enforced only outside active beta and internal admin use.

**Why:** Published project packs promise tier-specific content allowances, while audits and query generation have separately communicated timing controls. Mixing these limits blocks a product operation under the wrong policy.

Media discovery and journalist coverage research are not content-writing actions, including older usage records named as content operations. They remain subject to the spend policy for their account. For a multi-contact coverage check, reserve the whole eligible batch before making any provider call, then settle each attempted call from measured usage; retain an estimate for attempted calls that fail before usage is available. A near-cap rejection must not start a subset of searches that cannot yield a saved result.

**Why:** Counting research against content allowance produced a misleading AI-limit error, while recording coverage checks at zero bypassed the real spend guard. Independent reservations for a five-contact batch could also spend money on a request that returned only a cap error.

**How to apply:** When adding another research action, keep content-quota accounting separate from spend accounting. If a result needs an all-or-nothing group of provider calls, reserve that group atomically before dispatch and wait for every started call before responding.

The canonical platform-admin workspace is not a subscribed customer, so a tier lookup returns zero even for its own internal projects. Its own content actions must bypass the tier-based action count; accessing a customer-owned project from that privileged session must not inherit the action-count bypass. Its monthly GBP cap is monitoring-only during internal use.

**Why:** Enabling tier enforcement after an account switchover blocked the platform team's first Content Creator action as "fair usage exhausted" despite no content actions being counted.

**How to apply:** Keep the action-count exception tied to both the authenticated platform-admin role and ownership of the requested project. Do not use the human's email as a quota identity.

Active beta billing roots and the internal admin workspace monitor monthly GBP spend without blocking at the stored threshold. Managed child workspaces inherit active beta status from their billing root. Keep measured usage, configured thresholds, and threshold alerts; paid and expired accounts still enforce their monthly caps. Journalist coverage batch reservations must still record cost but must not enforce the threshold for monitoring-only accounts.

**Why:** During beta, hard GBP caps truncate observation of actual provider usage; removing cap records or skipping queries would discard the very measurements needed to choose future limits. A stored threshold should be reinstated automatically when beta ends.

**How to apply:** Resolve active beta status from the billing root at request time, and distinguish monitoring-only alerts from real 429 blocks in both API and admin UI. Do not remove usage writes or weaken the independent per-project action allowances.