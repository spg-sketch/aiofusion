---
name: Editorial recommendation evidence
description: Keep editorial suitability, evidence confidence and contact readiness separate; preserve checked history during enrichment failures.
---

Rank editorial suitability separately from contact readiness and evidence confidence. Email availability, imported verification dates and publication fame must not inflate editorial fit. Missing factors remain unknown rather than fabricated positives or automatic negatives.

**Why:** The previous keyword-plus-email formula saturated at 100 and conflated ease of contact with suitability. A specialist outlet can be a better audience match than a larger publication.

**How to apply:** Keep fixed factor budgets and show weighted-model coverage alongside fit in detailed review surfaces. Feedback can change ordering, not the underlying evidence assessment. Treat the weights as an initial heuristic, not calibrated placement probabilities.

Missing personal identity is a data-quality limitation, not an editorial-fit factor. Keep unnamed records eligible when their topic and outlet evidence is useful, but apply one bounded reduction to the persisted recommendation base score, retain its explanation through feedback reranking, and require identity review before outreach.

**Why:** A publication-only record must not outrank an otherwise comparable named journalist or regain unexplained priority after refinement.

**How to apply:** Determine identity only from meaningful personal-name fields, never outlet or publication labels. Keep the editorial fit score unchanged, and expose the identity limitation separately in ranking reasons, readiness, warnings and recommendation cards.

Equal recommendation scores from equal available factors are genuine ties, not hidden ranking precision. Present the tie count and state that deterministic ordering inside the tie is not a quality difference.

**Why:** Sparse imported profiles often share broad beat, audience and geography labels, so many contacts can legitimately receive the same score.

**How to apply:** Do not add arbitrary variation or use contact IDs as a quality signal. Preserve stable ordering for repeatability, but label repeated scores as shared evidence outcomes until contact-specific evidence differentiates them.

Public search suggestions are not checked reporting evidence. A recency claim requires an author-attributed, relevant page and a publication date actually extracted from that page, with the final redirect destination retained.

**Why:** Model-produced dates and titles can look plausible, and a collector can pass mocked tests while expecting metadata its real fetch helper does not return. Fetching an old article today also does not establish a current role.

**How to apply:** Test HTML extraction through the real evidence shape. Keep inferred angles labelled as suggestions, not facts or proof of AI visibility gains. Source failures must not erase previous checked evidence or refresh its successful-check timestamp.

Generic phrase/coverage overlap explanations must not be presented as tailored pitch angles or take priority over substantive recorded suggestions.

**Why:** The user reported that the pitch field merely repeated their targeting question and a broad coverage category, obscuring more specific saved opportunities.

**How to apply:** Prefer substantive recorded pitch suggestions. When none exists, state that no tailored angle is recorded rather than disguising a matching template as a personalised recommendation. Preserve matching provenance and historical outreach evidence.

Explicitly generated pitch suggestions are article-specific proposals, not checked reporting evidence. They must not raise editorial fit or evidence confidence, update canonical contact records, or rewrite historical outreach.

**Why:** Users need useful proposed framing even when recent reporting has not been verified. Providing that assistance must not disguise an AI inference as proof about the journalist.

**How to apply:** Generate only on an explicit, bounded action; label the result as an AI suggestion, scope it to the article and project owner, reuse current saved suggestions, and invalidate them when the article, saved brief or editorial contact context changes.

Enrichment must be explicit, bounded, owner/project/article-scoped and concurrency-safe.

**Why:** Slow network work can finish after a newer brief or evidence check. Saving a new targeting brief must not discard prior source history, and a failed provider request must not masquerade as a completed check.

**How to apply:** Reassess retained evidence against the latest brief, preserve historical outreach snapshots, and commit slow enrichment only when its source state is still current.

Paid pitch-angle generation must be user-triggered for at most five displayed contacts, never run automatically on load or pagination.

**Why:** Media match sets can exceed 12,000 contacts. The user requires a small, intentional paid batch, not generation across every match.

**How to apply:** Keep pitch suggestions distinct from verified reporting and source checks. Reuse saved suggestions only while article, targeting brief, contact and publication context remain current; preserve substantive saved angles on provider failure.

Recommendation ranking writes must be exact-set and atomic with their criteria snapshot. Re-read current, non-deleted contact and outlet identities after slow provider work; validate suppression, update enrichment base scores, apply current feedback, and persist contiguous ranks under one shared lock.

**Why:** Criteria-only compare-and-swap does not detect feedback-only rank changes, and reranking "the latest set" can update a different set when generation overlaps enrichment. Pre-provider contact snapshots can also become deleted or suppressed before commit.

**How to apply:** Pass the intended set ID through every rerank. Creation and enrichment transactions must build their response from the same committed set rows. Reapply project, contact and outlet workspace visibility after every slow operation and immediately before response serialization. Exclude records whose outlet became hidden or deleted, prune every contact-keyed criteria map to the final eligible IDs, and never return historical evidence or outlet fields for excluded contacts. Treat zero as a valid base score, not a missing value.

Media Research recommendations and story shortlist use a short contact summary. Omit match explanations, evidence confidence, contact readiness, evidence/contact-check detail and imported notes there without deleting the underlying information or changing the detailed Media Database view. Keep do-not-contact protections visible.

**Why:** The user requested simpler Media Research results with only contact/publication fields, reach, Editorial fit and a suggested pitch angle. Imported source reach is not a measured AI Authority score, and the reference circular indicator was a match-score indicator.

**How to apply:** Keep the summary scoped to Media Research. A circular Editorial fit indicator must use the actual assessment fit, never the legacy ranking score or imported reach. Missing values stay explicit; do not invent angles, links or authority scores. Explain optional public-web discovery separately from database matches and retain human review before saving a new contact.
