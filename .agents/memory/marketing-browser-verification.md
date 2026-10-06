---
name: Marketing browser verification
description: Reliable timing for visual and interaction checks of the public marketing pages.
---

On a visit eligible for automatic opening, the home page's demo dialog can appear after the initial document load. Establish the cookie-choice and demo opt-out state before deciding whether to wait for a dialog.

**Why:** A browser check that began at document-ready interacted before hydration, then the dialog appeared and intercepted hover attempts. This produced a misleading failure even though the hover style worked.

**How to apply:** Keep first-visit cookie-choice checks separate from returning-visitor automatic-demo checks. On eligible visits, wait for the hydrated dialog before dismissing it; wait for navigation completion before asserting the destination of a CTA. Tailwind's independent `translate` and `scale` properties are better signals for the card hover than the legacy `transform` property.

The intended introduction sequence is cookie choice first, then automatic demo on that same homepage visit, including essential-only choices. A saved choice made during app loading must also complete that handoff; ordinary demo dismissal must not be undone by later consent updates.

**Why:** Multiple iPhone visitors reported no automatic demo. Mobile Chromium reproduced a consent handoff requiring a refresh; analytics acceptance must not be a condition for seeing the demo.

**How to apply:** Verify the before-choice and after-choice states separately, plus returning visits, opt-out and manual opening. Chromium iPhone profiles are not native Safari verification; disclose unavailable WebKit or physical-device coverage.

Under heavy release-suite load, hydration can exceed the default short visibility wait, while clicking the close button can stall waiting for element stability. For a visit eligible for automatic opening, use an explicit bounded visibility wait, dismiss with Escape (the dialog's supported keyboard action), then confirm it closed before continuing into sign-in and workspace isolation.

**Why:** One gate failed before testing authentication despite the dialog eventually appearing in the captured page; a focused run passed with a bounded hydration wait and keyboard dismissal. However, an unconditional fresh-visitor dialog expectation became stale when cookie-choice gating was introduced.

**How to apply:** Keep consent-aware public-dialog, sign-in, and cross-workspace denial assertions in the production-built browser gate. Extend only their test budget when launch-time hydration is slow, not the product behavior or the authorization assertions. Do not require a dialog on a fresh visit before a cookie choice.

The Replit development-only banner can cover and intercept the homepage dialog's close control on narrow phone viewports. Do not diagnose that interception as a product modal failure.

**Why:** The development banner sits above the product overlay and intercepted an otherwise visible, stable close button during responsive checks. The published product does not include that banner.

**How to apply:** For development-preview browser interaction checks, hide the banner with test-only CSS and disclose that test-environment adjustment in the results. Do not change production modal styles or deployment configuration to accommodate development tooling.