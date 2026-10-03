# Homepage demo dialog verification

Tested in the **Replit development preview**, not staging or production.
The repeatable command is `node scripts/demo-dialog-responsive.cjs after`.
All API traffic is intercepted in this browser run. No real enquiries, sign-ins,
accounts, or delivery records are created.

## Coverage

| Viewport | Before first field top | After first field top | After close target |
| --- | ---: | ---: | --- |
| 320 × 568 | 820px | 259px | 44 × 44px |
| 375 × 667 | 690px | 259px | 44 × 44px |
| 430 × 932 | 703px | 323px | 44 × 44px |
| 568 × 320 landscape | 549px | 206px | 44 × 44px |
| 932 × 430 landscape | 171px | 206px | 44 × 44px |
| 1440 × 1000 desktop | 341px | 329px | 44 × 44px |

`before-*.png` and `after-*.png` capture the hydrated, automatically opened
dialog on each viewport. JSON files record its bounds, first-field position,
input font size and close-button bounds before/after scrolling.

The before screenshots include Replit's development-only banner. This banner
intercepts clicks on the close button at narrow widths, so the after browser
harness hides it with test-only CSS. Product code and deployment settings are
not changed to hide the banner.

The responsive checks assert:

- Visible outer margins and horizontal bounds for all form controls.
- Persistent 44 × 44px close control after scrolling.
- Hidden secondary promotional content on phones, including short landscape;
  desktop keeps its two columns and benefits.
- Fresh-visitor automatic opening after hydration, Escape dismissal,
  focus wrapping, manual reopening and focus restoration.
- Background scroll-lock styles and restoration on dismissal.
- Native empty-field and invalid-email validation.
- Simulated delivery error, retained inputs, successful retry and confirmation.
- Reachable opt-out preference, persistence across reload, and manual reversal.
- Phone inputs at 16px; all fields and close control remain visible while focused
  in a synthetic 260px visual viewport with a 40px top offset.
- Standalone Contact form remains at its existing 14px size and four textarea
  rows, outside the dialog's scoped CSS.
- No uncaught browser errors.

The focused unit suite covers ten behaviors, including viewport event cleanup,
parent rerenders without stealing focus, hidden controls and return-focus
preservation. The frontend TypeScript check passes.

## Limits

These are Chromium responsive viewport checks with emulated touch capability,
**not physical-device testing**. The reduced-viewport screenshots and tests
exercise visualViewport sizing and scroll-to-focus logic; they do not open a
real iOS or Android software keyboard. Native keyboard animation, browser
toolbar changes, iOS focus-zoom behavior, notch safe areas and platform-specific
scroll behavior still require an actual iPhone/Safari and Android/Chrome check.
The CSS uses safe-area insets, 16px mobile input text and fixed-body scroll
locking to address those cases, without claiming they were physically tested.

No production deployment was performed.