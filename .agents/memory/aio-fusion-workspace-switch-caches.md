---
name: Workspace switch local-cache clearing
description: Which localStorage keys must be cleared on switch-workspace and why
---

**Rule:** `clearWorkspaceScopedCaches()` (lib/auth.ts) runs before the reload in `serverSwitchWorkspace` and must clear every workspace-global bare key: `aio.activeProjectId`, `aio.projects.v1`, `aio.clientLogos.v1`, `aio.intake.updatedAt.v1`, `aio.scoring.v1`, `aio.auditTiming.*`. Keep `aio.store.migrated.v1` so the one-time legacy migration cannot re-run.

**Why:** `syncProjectsOnLoad` pushes any "local only" project to the CURRENT workspace's server store - leftover `aio.projects.v1` from the previous workspace gets copied into the new one (cross-workspace data leak). Project-id-namespaced keys are safe to keep.

**How to apply:** any new bare (non project-scoped) localStorage key that caches account/workspace data must be added to this clear list.

**Rule:** After a server-side workspace switch sets a new session cookie, navigate through the artifact base path with an explicit authenticated-entry flag. Do not use a plain reload of the current root URL.

**Why:** The active authenticated view is client state, not a distinct path. Reloading the root can switch successfully on the server but return the browser to the public landing page. A root-relative URL can also escape Replit's artifact path.

**How to apply:** Any session swap that requires a full reload must include an App-recognized route flag and build its destination from the configured artifact base path.

Related lessons from the same wave:
- IntakePage prefill runs in useState initialisers; a profile refresh fetched on intake open arrives AFTER mount, so IntakeForm has an effect applying a later `accountProfile` only to untouched fields (blank or equal to the previous prefill).
- App's `VIEW_TO_SLUG` is now DERIVED from `PUBLIC_ROUTES` in marketing/pageMeta.ts (single source of truth for public pages); prerender-entry hard-fails (exit 1) on missing meta/component/shell-only output; pageMeta.consistency.test.ts guards drift. New public pages: add to PUBLIC_ROUTES + PAGE_META (+ SLUG_TO_VIEW alias if needed).
