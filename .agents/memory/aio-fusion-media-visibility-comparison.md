---
name: Media visibility comparison
description: Comparability and causation rules for exact-phrase LLM visibility impact reporting.
---

Treat exact-phrase LLM checks as comparable only when the effective query actually sent, provider, model, expected run count, and measurement methodology version are identical. Keep incomplete or incompatible attempts visible, but exclude them from calculated change.

**Why:** A stable phrase label or ID does not prove that two provider prompts used the same company disambiguation or scoring method. Comparing different prompts or methods would present a misleading change.

**How to apply:** Persist the effective provider query and methodology version with each phrase measurement. Require all comparability fields to match before calculating deltas. Describe intervening content, outreach, and placements as time-correlated evidence, never as proven causes.