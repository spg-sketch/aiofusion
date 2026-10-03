---
name: Marketing browser verification
description: Reliable timing for visual and interaction checks of the public marketing pages.
---

The home page's demo dialog can appear after the initial document load. Wait for the hydrated dialog and dismiss it before checking the content beneath it.

**Why:** A browser check that began at document-ready interacted before hydration, then the dialog appeared and intercepted hover attempts. This produced a misleading failure even though the hover style worked.

**How to apply:** For public-page browser checks, wait for the home page's demo dialog before dismissing it; wait for navigation completion before asserting the destination of a CTA. Tailwind's independent `translate` and `scale` properties are better signals for the card hover than the legacy `transform` property.

The production-built release browser gate must continue asserting that the fresh visitor sees the demo dialog. Under heavy release-suite load, hydration can exceed the default short visibility wait, while clicking the close button can stall waiting for element stability. After an explicit bounded visibility wait, dismiss with Escape (the dialog's supported keyboard action), then confirm it closed before continuing into sign-in and workspace isolation.

**Why:** One gate failed before testing authentication despite the dialog eventually appearing in the captured page; a focused run passed with a bounded hydration wait and keyboard dismissal. Making the dialog optional would mask a real regression instead of addressing the timing problem.

**How to apply:** Keep public-dialog, sign-in, and cross-workspace denial assertions in the same production-built browser gate. Extend only their test budget when launch-time hydration is slow, not the product behavior or the authorization assertions.

The Replit development-only banner can cover and intercept the homepage dialog's close control on narrow phone viewports. Do not diagnose that interception as a product modal failure.

**Why:** The development banner sits above the product overlay and intercepted an otherwise visible, stable close button during responsive checks. The published product does not include that banner.

**How to apply:** For development-preview browser interaction checks, hide the banner with test-only CSS and disclose that test-environment adjustment in the results. Do not change production modal styles or deployment configuration to accommodate development tooling.