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
