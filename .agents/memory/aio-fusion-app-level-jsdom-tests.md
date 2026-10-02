---
name: App-level jsdom render tests
description: Stubs and patterns needed to render the full aio-fusion App in vitest/jsdom
---

Rendering the whole `App` (not just a page) in jsdom works, but needs:
- `document.elementFromPoint = () => null` — input-otp's password-manager badge polls it on a timer; missing stub throws uncaught exceptions after tests "pass".
- Stubs for ResizeObserver/IntersectionObserver/matchMedia (lazy marketing chunks).
- `vi.stubGlobal("fetch", ...)` returning 401 makes bootstrapAuth resolve signed-out and all sync effects no-op.
- Set the URL via `window.history.replaceState({}, "", url)` BEFORE `await import("./App")` + render, since App captures query params in useState initializers.

**Why:** the redirect-param regression tests (oauth_status/verify_status/reset_token) render App end-to-end to lock in the capture-before-history-sync ordering.
**How to apply:** copy the beforeEach in `src/App.redirect-params.test.tsx` for any future App-level test. After remount with a clean URL, App lands on the landing view — don't assert sign-in text; assert absence of the stale panel.

**Rule:** Background route work in App-level tests must not bypass mocked page boundaries.

**Why:** Asynchronous page warming can make a test render a real component instead of its intended mock, and shared control labels can let that test pass accidentally.

**How to apply:** Disable nonessential background imports in App-level tests and include at least one mock-only sentinel assertion.

**Rule:** Tests that start on an authenticated page should set its canonical URL before rendering rather than navigating through a timed synthetic history event.

**Why:** Under full-suite load, a fixed delay can expire before the history listener is attached. The synthetic event is lost and assertions run against the public page even though authentication succeeded.

**How to apply:** Initialize the desired route before import/render; reserve simulated navigation for tests that actually exercise navigation and wait for an observable ready state first.

**Rule:** A cold authenticated lazy route may need a larger bounded assertion wait under full-suite load. Do not infer a missing navigation handler from the previous screen remaining visible during Suspense.

**Why:** A Security deep-link assertion exceeded its ordinary wait during the full release suite but reached the correct panel in under a second when isolated. Static inspection confirmed its navigation effect already existed.

**How to apply:** Reconcile the actual navigation effects and isolate the failing test before editing app behaviour. When timing is the issue, keep the exact destination-content assertion and extend only its bounded wait.
