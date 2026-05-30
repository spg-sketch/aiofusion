---
name: AIO Fusion hub data storage
description: Where the AIO Fusion hub keeps projects, logos, intake, users/session — and what that means for persistence and backup.
---

# AIO Fusion hub data storage

All hub data lives in **browser localStorage only**. There is no server-side store for it (the api-server handles audits/probing, not hub records). Keys:
- `aio.projects.v1` — created projects (array of Client)
- `aio.clientLogos.v1` — project logos as data URLs, keyed by project id (separate from projects because logos are large)
- `aio.intake.v2` — legacy single-intake (migrated into a project on load)
- session/users seeded locally (admin seed)

**Why it matters:**
- Data is per-browser and per-device. It is NOT backed up anywhere. Clearing browser data, switching browser/device, or incognito = data gone. Replit checkpoints back up code, not the user's localStorage.
- localStorage has a ~5MB ceiling. Logos are stored as data URLs, so large images can exhaust it. Card upload guards at 1MB/file; `saveClientLogos` alerts on quota failure instead of silently dropping.

**How to apply:**
- Logos must be persisted via `saveClientLogos`/`loadClientLogos`; never leave logo state in-memory only (that was the original "can't add a logo" bug — it vanished on refresh).
- If asked to "back up", "share across devices", or "why did my data disappear", the answer is the localStorage-only architecture; a real backend would be needed for durable/shared storage.

**Per-project store scoping convention.** Intake, planner and archive are all scoped per project using the active-project id from `aio.activeProjectId` (set via `setActiveProjectId`/read via `getActiveProjectId`). The key for the `"default"` (legacy) project is the **bare** key; any other project appends `::${id}`. Intake uses `currentIntakeKey()`; planner/archive use `scopedStoreKey(base, clientId?)` where `loadArchive/saveArchive/loadPlannerProjects/savePlannerProjects` take an OPTIONAL `clientId` that defaults to the active project — so no-arg call sites scope to the active project automatically, and the hub passes an explicit `client.id` per card to show per-project counts. Hub scorecard figures are computed live at render (Authority Score/trend from `loadCycle(client.id)`, Plans from planner length, Content from archive length); the stored `Client.avgScore/contentCount/activePlans` fields are NOT used for display.
**Why:** planner/archive were once global (bare keys), so a one-time migration (`aio.stores.perproject.migrated.v1`) moves legacy bare data into the first non-default project. It must NOT set the migrated flag while legacy data exists but no real project does yet (defer and retry on a later boot), or the data is stranded.

**Intake persistence has parallel write paths — keep them in lockstep.** In `IntakeForm.tsx`, intake state is written to `currentIntakeKey()` in TWO places: the autosave `useEffect` and the manual `saveDraft()` ("Save for later"). Any new persisted field (e.g. `optimisedFields`, `aiWebsite`) must be added to BOTH JSON.stringify payloads AND rehydrated in the matching `useState` initialiser, or "Save for later" silently drops it on reload. `acceptProjectData` writes a separate archive record to `aio.projectData.archive` with its own field list — a third place to update for archived fields.
