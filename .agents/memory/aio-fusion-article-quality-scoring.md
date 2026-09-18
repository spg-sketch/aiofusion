---
name: AIO Fusion article quality scoring
description: Durable product boundary and freshness rule for Content Optimiser assessments.
---

Content Optimiser scores are deterministic article-quality assessments, not campaign Authority scores. Each comparison must use the same versioned rubric and Project Set-Up context for both drafts.

**Why:** Article content can show observable quality signals, but it cannot prove publication authority, rankings, backlinks, coverage or live AI citations. Persisted scores also become misleading after content or scoring context changes.

**How to apply:** Keep the metric named article quality. Persist the rubric version, before/after content fingerprints and context fingerprint, and hide the assessment whenever the current article or relevant selected inputs no longer match.