---
name: Article workflow identity
description: Editorial identity across Library, Planner and Research, distinct from historical outreach evidence.
---

Use a stable library article identity throughout the editorial workflow. Do not infer links from titles, or treat routine edit/save/place actions as requests to create new versions.

**Why:** Previously, planner handoffs copied only scheduling metadata, research received incompatible planner IDs, and reopening articles created disconnected duplicates. Titles can change or collide, so title matching would silently associate the wrong article.

**How to apply:** Preserve full copy and targeting on handoffs, keep linked planner snapshots current, and retain a recoverable pending sync if the article save succeeds before its planner update fails. Never fabricate prose when adopting legacy planner-only records. Check null as well as missing fields when converting combined legacy body text.

Outreach and placement evidence is different: later editorial changes must not rewrite the article, contact or phrase snapshots captured when outreach was planned.

**Why:** Historical evidence must describe what motivated that outreach, not whichever wording is currently in the editor.

**How to apply:** Use the canonical identity for navigation and decisions while retaining immutable outreach snapshots. Removing a scheduling entry must not erase the library article or historical outreach.