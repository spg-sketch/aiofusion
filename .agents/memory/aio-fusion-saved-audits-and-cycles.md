---
name: AIO Fusion saved-audits + App/LlmCheckPage coupling
description: Cross-component refresh signal for saved audits and the pre-existing circular import between App.tsx and LlmCheckPage.tsx
---

# Saved-audit refresh signal
Saved Earned Media Visibility audits live in `localStorage` per client (`aio.savedAudits.{clientId}`) and are owned by `LlmCheckPage` state. The sidebar in `App.tsx` (`SidebarContent`) reads them on render via the exported `loadSavedAudits`, so it does NOT see saves/deletes made inside `LlmCheckPage` automatically.

All FOUR audits now share this saved-list + sidebar pattern, each keyed per client and rendered in the sidebar under its nav id:
- Earned Media: `aio.savedAudits.{clientId}` (owned by `LlmCheckPage`, helper `loadSavedAudits`), nav id `llm-check`.
- Website Visibility: `aio.savedDiagnostics.{clientId}` (owned by `DiagnosticPage` in `App.tsx`, helper `loadSavedDiagnostics`), nav id `diagnostic`.
- Website Content GEO: `aio.savedContentGeo.{clientId}` (owned by `GeoContentPage` in `App.tsx`), nav id `geo-content`. Static data, so reopen just sets `hasResults=true`; saved entry stores only `{id,savedAt,score}`.
- Website Technical GEO: `aio.savedTechGeo.{clientId}` (owned by `SeoAuditPage.tsx`), nav id `seo-audit`. Stores the FULL `{id,savedAt,score,result}` so reopen can restore the live result + url.

The two GEO audits use generic helpers `loadSavedScored`/`persistSavedScored` + key builders `contentGeoKey`/`techGeoKey` exported from `App.tsx` (shape `SavedScored = {id,savedAt,score}`). `SeoAuditPage` deliberately re-implements its own local load/persist (same `aio.savedTechGeo.{clientId}` key) instead of importing from `App.tsx`, to avoid widening the circular import below — the sidebar still reads it via `loadSavedScored(techGeoKey(id))`.

All saved-lists share the ONE `aio:saved-audits-changed` event below; the sidebar re-reads all on that event.

**Auto-save on completion:** audits persist to history automatically the moment a fresh run finishes, not only on the manual Save button. The save helper takes an optional explicit result arg and is called right after `setResult(data)` with that same `data` (never the async state, which is still stale at that point). The manual button still works and is idempotent via the dedup guard. Dedup keys: Earned Media on `result.checkedAt`, Website Technical GEO on `result.url + result.fetchedAt`. When wiring a button straight to the helper, use `onClick={() => save()}` not `onClick={save}` or the click event gets passed in as the result.

**Gotcha (parity bug fixed once already):** a "re-run/re-scan" handler must `setJustSaved(false)` so the just-run audit can be saved again; otherwise the Save button stays disabled after the first save of the session.

**Rule:** any save/delete of saved audits must dispatch `window.dispatchEvent(new Event("aio:saved-audits-changed"))`. `App` listens for that event and bumps a version state to force the sidebar to re-read.

**Why:** App and LlmCheckPage are sibling-ish components with no shared store; child state changes don't re-render the parent sidebar. The window event is the lightweight bridge.

**How to apply:** if you add another mutation path for saved audits, fire the same event, or the sidebar "latest few" list goes stale until an unrelated navigation.

# App <-> LlmCheckPage circular import (pre-existing)
`LlmCheckPage.tsx` imports `loadCycle`/`cycleKey`/`CycleHistory` from `App.tsx`, and `App.tsx` imports `loadSavedAudits` from `LlmCheckPage.tsx`. This is a real circular import that works only because these are hoisted function declarations used at call-time, not at module-init.

**Why:** shared localStorage helpers were exported from `App.tsx` rather than a neutral module.

**How to apply:** do not add module-init-time (top-level) usage across this cycle. If the coupling grows, extract the shared localStorage helpers/types into a small non-React util module instead of adding more cross-imports.
