---
name: Exact Media target phrases
description: Durable identity, attribution, and fallback rules for carrying Project Set-Up phrases through Content and Media.
---

Exact target phrases use a deterministic ID derived from intent group plus locale-independent, whitespace-normalised text capped consistently at 500 characters. Saved content and planner records keep both IDs and immutable phrase snapshots.

**Why:** Current Project Set-Up wording can change after an article is created. Recomputing from current setup loses historical intent, while locale-dependent casing or inconsistent length limits makes valid client IDs fail server validation.

**How to apply:** Prefer a saved article or planner snapshot. Fall back to current Project Set-Up phrases only for legacy records where both phrase fields are absent; an explicit empty array means no phrases. Validate IDs again at API boundaries.

Treat phrase snapshots and effective provider queries as evidence, not generated copy: prose sanitation must not change their punctuation or spelling. Identical effective query text in different intent groups can share provider observations while retaining separate phrase identities.

**Why:** Sanitising an em dash after measuring can make the displayed phrase disagree with its canonical ID and the prompt actually sent. Scheduling the same text separately for multiple groups and then matching only by text can overcount completed repetitions.

**How to apply:** Keep exact evidence labels untouched when cleaning generated prose. Attribute observations by scheduled phrase IDs, and distinguish the number of canonical targets from distinct provider queries. Never infer that the separate identity probe is a non-branded target.

Recommendation explanations must distinguish a full normalised phrase match from weaker recorded topic or keyword overlap. Live-discovery fit text is AI-suggested unless separately supported by cited evidence; never present inferred relevance or placement ideas as measured authority, citations, or visibility gains.

**Why:** A shared word is not an exact phrase match, and cited publication evidence does not automatically ground model-written fit or outcome claims.

**How to apply:** Persist the match classification with phrase attribution so reloads and reranking retain the same honest label. Keep recorded publication authority/reach context separate from AI-suggested fit and placement angles.