---
name: Market Intelligence evidence labels
description: Product truthfulness rules for event research, scoring and exports.
---

Market Intelligence must distinguish deterministic page evidence from AI-generated interpretation. Event identity, full date range, region, published costs and deadline dates may be presented as verified only when the cited page supports them. Audience, organiser descriptions, relevance reasoning and the 0-100 ranking remain AI summaries or estimates.

**Why:** A cited URL does not substantiate every field generated around it. Over-broad verification language makes plausible model output look measured or independently confirmed.

**How to apply:** Keep UI and export caveats aligned with server checks. Call the ranking an AI relevance estimate, never measured reach or authority. Do not describe a future deadline as an open or immediately actionable window unless open-window evidence is separately verified.

Structured research responses can omit inline citation annotations even when the search tool consulted valid source pages. Provider-owned search metadata is also evidence; a URL merely written into the generated answer is not.

**Why:** A real event search returned no results when only inline annotations were considered, but returned verified upcoming events when search-tool source metadata was included.

**How to apply:** Request and inspect provider-owned sources, then retain the independent page checks. Do not solve missing annotations by trusting arbitrary model-generated URLs.

Project-specific descriptive categories are valid Marketing Intelligence inputs even when they are absent from the shared media-industry taxonomy.

**Why:** Project defaults can describe services and customer segments. Silently substituting a general-business search fails to answer the selected brief.

**How to apply:** Preserve bounded descriptive labels as untrusted reference data and retain exact category matching in the returned results.