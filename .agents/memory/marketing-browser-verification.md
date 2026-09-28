---
name: Marketing browser verification
description: Reliable timing for visual and interaction checks of the public marketing pages.
---

The home page's demo dialog can appear after the initial document load. Wait for the hydrated dialog and dismiss it before checking the content beneath it.

**Why:** A browser check that began at document-ready interacted before hydration, then the dialog appeared and intercepted hover attempts. This produced a misleading failure even though the hover style worked.

**How to apply:** For public-page browser checks, wait for the home page's demo dialog before dismissing it; wait for navigation completion before asserting the destination of a CTA. Tailwind's independent `translate` and `scale` properties are better signals for the card hover than the legacy `transform` property.