---
name: Incremental journalist discovery runs
description: Durable and incremental behavior expected from live Media Research searches.
---

Live journalist searches must persist as identity- and article-scoped server runs. Candidate evidence states are part of the durable run result, not transient component state. Verified candidates may be reviewed while other checks remain pending; failed candidates remain visible with an explicit reason.

**Why:** Public source checks vary greatly in latency. Waiting for every page hides useful verified results, while browser-owned requests lose progress on navigation or refresh.

**How to apply:** Any future live-discovery change must preserve polling/rehydration, server-generated approval tokens for currently verified candidates, and explicit pending/verified/failed UI states.

Media Research should use a countdown estimate, not an elapsed-time counter. Estimate expiry must never cancel source checks or imply that a search has completed.

**Why:** The user requested the same countdown behaviour as the rest of the site, but public source verification has variable latency and can exceed its estimated duration.

**How to apply:** Capture the estimate once per run, preserve the original start time through navigation/recovery, and learn only from fully observed successful searches, not failures or partially resumed runs. Identify browser-local timing history honestly rather than claiming a server-wide average.