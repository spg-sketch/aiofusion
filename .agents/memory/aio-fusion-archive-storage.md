---
name: AIO Fusion archive/planner storage & per-project isolation
description: How the content Archive and Comms Planner are stored, scoped per project, and why demo-seeding + the "move bare to first project" migration were removed.
---

# Archive / Planner storage (localStorage only)

- The content **Archive** (`aio.archive.v1`) and **Comms Planner** (`aio.planner.projects.v1`) live in **localStorage only** - they are NOT synced to the server store. They are per-browser.
- Scoping helper `scopedStoreKey(base, clientId?)` (App.tsx): default project uses the **bare key** (`aio.archive.v1`); non-default uses `aio.archive.v1::<projectId>`. `clientId` falls back to `getActiveProjectId()` (IntakeForm, reads `aio.activeProjectId`). So `loadArchive()` with no arg is scoped to the currently-open project, and the Media Research page + Optimiser rely on this.

## Why demo-seeding and the first-project migration were removed
- `seedDemoDataIfEmpty()` wrote demo Archive + Planner items (ids prefixed `seed-`) into the default project's bare key on first load. These showed up as "test articles" in the Media Research dropdown.
- `migrateGlobalStoresToFirstProject()` moved the bare-key (default) archive/planner into the **first non-default project** on a later boot.
  - **Why this leaked:** once the default project became a real client (Bluhalo), this migration relocated Bluhalo's (and the seed) content into another project - exactly the "a project sees articles that aren't its own" complaint.
- Replaced both with `removeDemoSeedData()`: one-time (guard `aio.seed.demo.purged.v1`) cleanup that scans every bare/`::id` archive+planner key and filters out items whose `id` starts with `seed-`.

**How to apply:** Demo/seed content is identifiable by `id.startsWith("seed-")`. The default project deliberately reads the bare key - never "migrate"/move bare-key data into another project. To clean local stores across projects, iterate `localStorage` keys matching the bare key or `base::` prefix.
