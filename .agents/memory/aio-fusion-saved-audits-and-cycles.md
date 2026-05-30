---
name: AIO Fusion saved-audits + App/LlmCheckPage coupling
description: Cross-component refresh signal for saved audits and the pre-existing circular import between App.tsx and LlmCheckPage.tsx
---

# Saved-audit refresh signal
Saved Earned Media Visibility audits live in `localStorage` per client (`aio.savedAudits.{clientId}`) and are owned by `LlmCheckPage` state. The sidebar in `App.tsx` (`SidebarContent`) reads them on render via the exported `loadSavedAudits`, so it does NOT see saves/deletes made inside `LlmCheckPage` automatically.

There is now a SECOND saved-list of the same shape: Website Visibility audits (`aio.savedDiagnostics.{clientId}`, owned by `DiagnosticPage` in `App.tsx`, helpers `loadSavedDiagnostics`). Both saved-lists share the ONE `aio:saved-audits-changed` event below; the sidebar re-reads both on that event. Earned items render under nav id `llm-check`, website items under nav id `diagnostic`.

**Rule:** any save/delete of saved audits must dispatch `window.dispatchEvent(new Event("aio:saved-audits-changed"))`. `App` listens for that event and bumps a version state to force the sidebar to re-read.

**Why:** App and LlmCheckPage are sibling-ish components with no shared store; child state changes don't re-render the parent sidebar. The window event is the lightweight bridge.

**How to apply:** if you add another mutation path for saved audits, fire the same event, or the sidebar "latest few" list goes stale until an unrelated navigation.

# App <-> LlmCheckPage circular import (pre-existing)
`LlmCheckPage.tsx` imports `loadCycle`/`cycleKey`/`CycleHistory` from `App.tsx`, and `App.tsx` imports `loadSavedAudits` from `LlmCheckPage.tsx`. This is a real circular import that works only because these are hoisted function declarations used at call-time, not at module-init.

**Why:** shared localStorage helpers were exported from `App.tsx` rather than a neutral module.

**How to apply:** do not add module-init-time (top-level) usage across this cycle. If the coupling grows, extract the shared localStorage helpers/types into a small non-React util module instead of adding more cross-imports.
