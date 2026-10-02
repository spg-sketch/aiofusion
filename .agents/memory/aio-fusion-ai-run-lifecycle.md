---
name: AIO Fusion in-tab AI run ownership
description: Rules for long-running AI operations that must survive route changes without crossing identity boundaries.
---

Use the countdown as the single numeric duration estimate for audit work. Confirmation and running explanations should set expectations without promising a separate fixed range.

**Why:** Hardcoded GEO and Earned Media/LLM timing ranges contradicted their starting countdowns and remained misleading when learned estimates changed.

**How to apply:** Check both confirmation and running states against the captured countdown estimate, including learned histories and overtime. Do not describe a source-only correction as published.

Long-running AI work within an open tab belongs to an app-level lifecycle rather than a routed page. Bind every run to the authenticated session, workspace, project, operation and stable subject. Capture immutable inputs, the absolute start time and the starting estimate once. Treat a closed response stream as an uncertain transport outcome, not proof that server work failed.

**Why:** Routed pages unmount during normal navigation. Page-owned promises lose progress and recovery state, while remounted interval counters restart estimates and background throttling distorts elapsed time. Identity changes can also let late results appear or write in the wrong workspace unless the lifecycle invalidates them. Staging requests can be aborted at the 300-second transport limit while the server still completes and persists the operation moments later.

**How to apply:** Keep request execution and exactly-once completion effects outside page mount lifetimes. Pages subscribe to retained snapshots, derive elapsed time from `Date.now() - startedAt`, and restore results only into the captured subject. Clear all runs at authentication or workspace boundaries.

An explicit "new search / reset" is different from routine navigation. It must invalidate the current tab's app-owned result and prevent older server-persisted history for that same subject from immediately repopulating the cleared view, without deleting audit history or other saved work. Only an explicit fresh run should resume recovery for that subject.

**Why:** Clearing local page state alone let a late result return after reset; clearing only the app-owned run still let the server's latest-run rehydration restore the result after reselecting the same article.

**How to apply:** Guard both client lifecycle completion and server-history rehydration against the reset boundary. Keep normal remount recovery unchanged where the user has not reset.

An AI run's person identity must match the identity established by the app shell, separately from its workspace identity. A workspace slug must never stand in for the signed-in human in run scope.

**Why:** When those identities differed for a team member, a successful streamed draft result and even the run's timeout were ignored by the lifecycle identity check. Content Creator kept showing "Writing draft" while its independent Planner action could still save earlier editor copy.

**How to apply:** Check both person and workspace values when adding AI run callers, especially for team members whose email/name differs from the workspace slug. Keep save and handoff actions unavailable while draft generation is active so a prior editor snapshot cannot be mistaken for the completed draft.

For browser-streamed content drafting, a server-side model completion is not proof that the page received a terminal result. The in-tab run needs its own wall-clock failure boundary, separate from the transport's abort timer, and the page should derive its loading display directly from that run rather than mirror it in local state.

**Why:** A live generation completed on the server in about a minute while the browser still displayed the final progress stage more than nine minutes beyond its estimate. The exact response-delivery failure was not observable from the available server log, so neither a successful model stop reason nor a client-side fetch timeout alone was enough to explain the stuck page.

**How to apply:** End an overdue run visibly, keep the original editor inputs intact, and ignore any completion that arrives after failure or identity change. Do not mistake this safeguard for recovery of a draft whose response was lost.

For audit work that can exceed an HTTP proxy limit, the app-level lifecycle is only the presentation layer. The server must return a durable run ID before doing the expensive work, persist progress and terminal state, and expose identity-scoped discovery and status endpoints. The page polls by run ID and attaches to an existing running project audit when it remounts.

**Why:** A retained browser promise still depends on the original HTTP connection. Proxy timeouts, refreshes and route changes must not cancel server work or turn a successful saved audit into a transport failure.

**How to apply:** Keep claim creation before the immediate start response, update the claim lease while work progresses, and commit the saved result, audit lock and successful run state together. Polling errors and terminal audit errors are separate states.

For URL-based audits, persist the bounded fetched content and measured page facts in the claim, not just the URL submitted by the user. Resume from that immutable snapshot and keep the original run ID.

**Why:** Refetching after a restart can analyse a changed page, fail for a newly unavailable URL, or produce a different result under the identity of the original run.

**How to apply:** Fetch and validate first, then claim with the exact analysis input. On completion, require the current worker lease before inserting the saved result, and commit both changes in one transaction so retries cannot create duplicate records.