---
name: AIO Fusion editor unsaved-change guards
description: Durable rules for protecting in-memory editor work during navigation and confirmed saves.
---

Use an exact serialised editor snapshot as the saved baseline, and advance it only to the exact snapshot confirmed by server persistence. A central navigation coordinator should own the pending destination and dialog, while each editor owns its current snapshot, busy state, and canonical save.

**Why:** React state updates from a confirmed save may not refresh a parent registration before a save-and-open handler requests navigation. Without an explicit confirmed-save handoff, the newly saved editor can immediately prompt again. Advancing the baseline to live state after a slow save can also hide edits made while that save was in flight.

**How to apply:** Include every authored field and metadata value that persists, but exclude presentation-only controls. Keep stable record IDs across retries. Route page, project, workspace, account, retrieval-replacement, and browser-history actions through the coordinator. After a combined save-and-open action is fully confirmed, explicitly clear the editor registration before invoking its destination.

For browser Back/Forward, give each in-app history entry a stable position. When a dirty editor receives a popstate, travel back to the committed editor entry before opening the dialog; on confirmed leave, traverse to the preserved target entry again. Never replace the target entry with the editor URL, because Stay would permanently remove the user's original Back/Forward destination.

Crash-recovery snapshots must be scoped by workspace, project, and editor, and include the canonical article ID when one exists. A blank editor may offer an explicit restore for its scoped article draft, but an explicitly opened different article must never receive that recovery prompt. Clear recovery after persistence only when the stored snapshot exactly matches the snapshot confirmed by the save.

**Why:** Users often reopen an editor from the sidebar after a crash, so requiring the same Library preload would make valid recovery inaccessible. Snapshot matching also prevents a slow save from deleting newer edits written to recovery while the request was in flight.

**How to apply:** Treat recovery as a single lightweight emergency draft, not version history. Restoration is always user-confirmed, and successful saves use compare-and-clear semantics.