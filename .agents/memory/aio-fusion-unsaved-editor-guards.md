---
name: AIO Fusion editor unsaved-change guards
description: Durable rules for protecting in-memory editor work during navigation and confirmed saves.
---

Use an exact serialised editor snapshot as the saved baseline, and advance it only to the exact snapshot confirmed by server persistence. A central navigation coordinator should own the pending destination and dialog, while each editor owns its current snapshot, busy state, and canonical save.

**Why:** React state updates from a confirmed save may not refresh a parent registration before a save-and-open handler requests navigation. Without an explicit confirmed-save handoff, the newly saved editor can immediately prompt again. Advancing the baseline to live state after a slow save can also hide edits made while that save was in flight.

**How to apply:** Include every authored field and metadata value that persists, but exclude presentation-only controls. Keep stable record IDs across retries. Route page, project, workspace, account, retrieval-replacement, and browser-history actions through the coordinator. After a combined save-and-open action is fully confirmed, explicitly clear the editor registration before invoking its destination.

For browser Back/Forward, give each in-app history entry a stable position. When a dirty editor receives a popstate, travel back to the committed editor entry before opening the dialog; on confirmed leave, traverse to the preserved target entry again. Never replace the target entry with the editor URL, because Stay would permanently remove the user's original Back/Forward destination.