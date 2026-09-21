---
name: Incremental journalist discovery runs
description: Durable and incremental behavior expected from live Media Research searches.
---

Live journalist searches must persist as identity- and article-scoped server runs. Candidate evidence states are part of the durable run result, not transient component state. Verified candidates may be reviewed while other checks remain pending; failed candidates remain visible with an explicit reason.

**Why:** Public source checks vary greatly in latency. Waiting for every page hides useful verified results, while browser-owned requests lose progress on navigation or refresh.

**How to apply:** Any future live-discovery change must preserve polling/rehydration, server-generated approval tokens for currently verified candidates, and explicit pending/verified/failed UI states.