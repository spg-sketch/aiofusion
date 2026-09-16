# AIO Fusion brand and UI guidelines

> **Status: proposed, not approved implementation**  
> Date: 16 September 2026  
> Owner: product and brand review

## Executive summary

AIO Fusion already has a coherent character: warm editorial marketing, a focused pink and navy onboarding flow, and a cool, information-dense workspace. This draft source-based audit names genuine drift without flattening deliberate context differences.

**Decision in one line:** adopt Alice plus Inter as the shared voice, pink as selection and action accent, navy or teal by surface, amber for the global keyboard focus cue, and explicit exceptions for marketing, onboarding and Project Hub. **Keep Project Hub exactly as approved.**

**Boundary:** this is a draft source-based audit, not a complete visual review or implementation approval. Authenticated review remains pending and is not complete. The current workspace home screenshot is evidence for route `/` only. Other authenticated recommendations stay pending visual review unless labelled as a source observation or prior fixture capture.

## Evidence and coverage

| Surface | Evidence available | State |
| --- | --- | --- |
| Marketing home | `artifacts/aio-fusion/src/marketing/LandingPage.tsx`, `artifacts/aio-fusion/src/marketing/MarketingPage.tsx`, current workspace home screenshot reference | Source reviewed and current workspace home screenshot observed |
| Other marketing | `artifacts/aio-fusion/src/marketing/AboutPage.tsx`, `artifacts/aio-fusion/src/marketing/ForAgenciesPage.tsx`, `artifacts/aio-fusion/src/marketing/ForAgentsPage.tsx`, `artifacts/aio-fusion/src/marketing/ForInhousePage.tsx`, `artifacts/aio-fusion/src/marketing/PricingPage.tsx`, `artifacts/aio-fusion/src/marketing/InsightsPage.tsx`, `artifacts/aio-fusion/src/marketing/ContactPage.tsx`, `artifacts/aio-fusion/src/marketing/TrustSecurityPage.tsx`, `artifacts/aio-fusion/src/marketing/ArticleDetailView.tsx` | Source-reviewed; public-page visual review pending |
| Project Hub | `artifacts/aio-fusion/src/pages/PlatformHomePage.tsx`, `artifacts/aio-fusion/src/index.css` | Approved reference, keep exactly |
| Settings and account | `artifacts/aio-fusion/src/pages/SubAccountsPage.tsx`, `artifacts/aio-fusion/src/pages/SubAccountsPage.css`, account security and billing components | Source-reviewed; authenticated visual review pending |
| Onboarding and set-up | `artifacts/aio-fusion/src/pages/FocusedOnboardingShell.css`, `artifacts/aio-fusion/src/pages/FocusedOnboardingShell.tsx`, `artifacts/aio-fusion/src/pages/GuidedOnboardingPage.tsx`, `artifacts/aio-fusion/src/IntakeForm.tsx` | Source-reviewed; role-specific visual review pending |
| Tools and reports | `artifacts/aio-fusion/src/pages/OptimiserPage.tsx`, `artifacts/aio-fusion/src/pages/PlannerPage.tsx`, `artifacts/aio-fusion/src/pages/MediaResearchPage.tsx`, `artifacts/aio-fusion/src/pages/MediaDatabasePage.tsx`, `artifacts/aio-fusion/src/ReportPage.tsx`, `artifacts/aio-fusion/src/pages/DiagnosticPage.tsx`, `artifacts/aio-fusion/src/SeoAuditPage.tsx` | Source-reviewed; rendered review pending |

### Evidence-label wording

- **Observed in source:** exact source reference found in the current tree.
- **Observed screenshot:** visible in the current workspace home screenshot, with provenance stated.
- **Approved exception:** deliberate context or density difference retained by decision.
- **Pending visual review:** source review is not enough to decide across rendered states, roles or viewports.
- **Proposed guideline:** direction for review, not an implementation instruction or compliance claim.

The current workspace home screenshot was freshly captured this turn from route `/` and saved at `docs/brand/references/home-workspace.jpg` (1280 x 720). It is current workspace home visual evidence, not a claim of staging or authenticated role coverage for every route. The static HTML companion embeds it as a JPEG data URI and embeds `artifacts/aio-fusion/public/images/logo-color.png` as a PNG data URI.

## Genuine drift versus intentional context

### Genuine drift to resolve first

1. The global DM Serif token versus the approved Alice, Georgia, serif stack.
2. Marketing dark teal `#102B36` and cream versus product navy `#0A1628` and cool neutrals without documented role names.
3. Button radius, casing and uppercase treatment across contexts.
4. `My Account` versus `My account`.
5. Orange global focus versus pink local focus. Focus should be a focus cue, not a brand accent.

### Not drift to fix

- Project Hub card scale and deliberate density.
- Focused onboarding's standalone rail and progress sequence.
- Settings left navigation versus data-heavy report tables.
- Marketing editorial spacing and public navigation treatment.
- Context-specific button hierarchy when it is labelled and measured.

## Foundations

### Colour role map

| Role | Value | Guidance |
| --- | --- | --- |
| Marketing teal | `#102B36` | Marketing headings, footer and editorial ink |
| Product navy | `#0A1628` | Authenticated headings, secondary actions and account surfaces |
| Hub teal | `#1A647B` | Existing Project Hub/header context. Preserve |
| Raspberry | `#C8497A` | Primary action, selection, active accent and links |
| Marketing cream | `#FBF6EC` | Public editorial canvas |
| Product cool | `#F8FAFC` | Product canvas and utility surfaces |
| Settings mint | `#F5FAF9` | Settings background, not a marketing replacement |
| Keyboard focus | `#F59E0B` | Global focus cue in current `artifacts/aio-fusion/src/index.css`; keep distinct from pink selection |

### Contrast calculations

Ratios below were calculated from sRGB relative luminance and rounded to two decimals. They are pair measurements, not a blanket accessibility or compliance claim.

| Pair | Ratio | Use note |
| --- | ---: | --- |
| `#102B36` on `#FBF6EC` | **13.72:1** | Recommended marketing reading pair |
| `#0A1628` on white | **18.13:1** | Recommended product reading pair |
| `#C8497A` on white | **4.48:1** | Pink may fail a 4.5:1 small-text target. For normal buttons, prefer dark text on a light surface, or a darker pink subject to approval. Do not treat large white text as the standard fix |
| `#F59E0B` on `#0A1628` | **8.44:1** | Measured focus-outline relationship |
| `#15803D` on white | **5.02:1** | Pair with text or icon, never colour alone |

### Typography scale

- **Display:** 60px maximum, 1.05 line height, Alice, Georgia, serif fallback.
- **Page title:** 50px maximum, 32px mobile, 1.12 line height, Alice stack.
- **Section title:** 24px, 1.25 line height.
- **Card title:** 18px, 1.35 line height.
- **Body:** 15px, 1.7 line height, Inter stack.
- **Supporting:** 13px, 1.6 line height.
- **Label:** 13px, 600 weight.
- **Meta:** 12px, 1.4 line height.
- **Eyebrow:** 11px, 700 weight, 0.16em tracking, uppercase.

No local Alice or Inter font file was found in the reviewed source tree. The final static HTML therefore uses the approved Alice, Georgia, serif fallback stack and loads no external font or dependency.

### Spacing, cards and forms

- Use a 4px base rhythm, with common steps 8, 12, 16, 24, 32, 40, 56 and 72.
- Reading cards use a 16px radius and 24 to 36px padding depending on context.
- Ordinary product controls use a 44px minimum height, 12px radius and 13px Inter bold.
- Compact row actions use a 36px minimum height, 10px radius and 12px text.
- Inputs use a 44px minimum height, 12px radius, visible label, helper copy and adjacent error copy.
- Use shadows to separate surfaces, not to make every card float.
- The Hub's large create, archive and guidance cards are not ordinary form-button templates.

## Patterns

### Illustrative button specimens

The HTML button samples are illustrative, not screenshots and not a component-library implementation.

- **Primary:** for normal buttons, prefer dark text on a light surface, or a darker pink subject to approval. Do not treat large white text as the standard fix for the current 4.48:1 pink pair.
- **Secondary:** product navy fill, white text.
- **Outline:** white surface, slate border, navy text.
- **Text:** transparent, slate text, used for low-emphasis actions.
- **Compact:** 36px minimum height and 10px radius for row actions.
- **Marketing CTA:** can use the public shell's 8px radius and teal or navy fill.
- Hover uses modest brightness or border change. Active uses a one-pixel press or tone change. Disabled reduces opacity and removes pointer affordance. Loading preserves width, announces status and prevents duplicate submission.
- Proposed global focus is a 3px amber outline with 3px offset and dark offset ring. Pink indicates selection, not keyboard focus.
- Destructive actions use explicit red treatment and confirmation copy, not an untyped pink outline.

### Forms

Every control has a visible persistent label. Placeholder text is an example, not the label. Group related fields with clear headings. Keep errors adjacent, specific and announced where appropriate. Use pink for selected choice and amber for focus. Use green, amber and red with text or icon, not colour alone. On mobile, stack fields before shrinking type and do not add horizontal scrolling to an ordinary form.

The pink-wash mini bar is approved only for field-grouping headings on the first Project Set-Up page, as recorded in `.agents/memory/aio-fusion-subsection-headers.md`. Do not extend it to reports, diagnostics, media research or planner headings without a new decision.

### Navigation terminology and language

- Canonical account label: **My Account**. Avoid `My account` when it is a proper navigation item.
- Use **Project Hub**, not Dashboard, for the approved workspace home.
- Use **Back to website** for the public return action and **Back to platform** from settings.
- Use **Project Set-Up**, **Media Research**, **Content Optimiser**, **Comms Planner** and **Reports** consistently.
- Use UK spelling: optimise, organisation and personalised. Do not use em dashes. Use a full stop or a hyphen instead.

### Approved context exceptions

1. **Marketing:** teal `#102B36`, cream `#FBF6EC`, editorial Alice headings and public navigation.
2. **Focused onboarding:** standalone shell, pink selection, navy/teal icon treatments and progress rail. Do not add ordinary Settings navigation before setup completes.
3. **Project Hub:** existing palette, card scale, navigation and density are protected. Consistency work must be isolated from Hub consumers.
4. **Settings:** cool mint canvas, left navigation and ordinary form actions can follow the settings mapping without redesigning Hub or onboarding.

## Prioritised section-by-section audit matrix

| Section and exact source path | Keep | Change or decision | Exception / pending |
| --- | --- | --- | --- |
| Public shell: `artifacts/aio-fusion/src/marketing/MarketingPage.tsx`, `artifacts/aio-fusion/src/marketing/LandingPage.tsx` | Alice heading intent, cream canvas, teal ink, public navigation and pink accent | Document one marketing token set. Align CTA casing and focus treatment later, in an isolated pass | Marketing is a context exception. Other public routes need visual review |
| Other marketing: `artifacts/aio-fusion/src/marketing/PricingPage.tsx`, `artifacts/aio-fusion/src/marketing/ForAgenciesPage.tsx`, `artifacts/aio-fusion/src/marketing/ForAgentsPage.tsx`, `artifacts/aio-fusion/src/marketing/ForInhousePage.tsx`, `artifacts/aio-fusion/src/marketing/InsightsPage.tsx`, `artifacts/aio-fusion/src/marketing/ContactPage.tsx` | Editorial hierarchy and source-specific content | Replace isolated literals with named roles only after implementation is approved. Keep content and routing | Source-reviewed. Public-page visual review pending |
| Project Hub: `artifacts/aio-fusion/src/pages/PlatformHomePage.tsx`, `artifacts/aio-fusion/src/index.css` | Hub card density, navigation, existing `#1A647B` header and interaction proportions | **Do not change as part of this guideline.** Protect indirect shared CSS and shared button consumers | Approved reference. Keep exactly |
| Account and Settings: `artifacts/aio-fusion/src/pages/SubAccountsPage.tsx`, `artifacts/aio-fusion/src/pages/SubAccountsPage.css`, `artifacts/aio-fusion/src/components/AccountSecurityCard.tsx`, `artifacts/aio-fusion/src/components/BillingDetailsCard.tsx` | Settings-only scoping, Alice headings, Inter body and compact row actions | Use `My Account` casing. Keep ordinary controls at 44px and compact rows at 36px. Review focus and pink action roles separately | Isolated scope. Authenticated role visuals pending |
| Focused onboarding: `artifacts/aio-fusion/src/pages/FocusedOnboardingShell.css`, `artifacts/aio-fusion/src/pages/FocusedOnboardingShell.tsx`, `artifacts/aio-fusion/src/pages/GuidedOnboardingPage.tsx` | Standalone sequence, progress rail, Alice headings, pink selection and mobile transformation | Keep outside permanent Settings navigation. Consider amber focus alignment later without changing progress or selection semantics | Focused flow exception. Rendered review by role and mobile pending |
| Project Set-Up: `artifacts/aio-fusion/src/IntakeForm.tsx` | Project Set-Up naming, progress/status and pink-wash grouping | Use the approved subsection pattern only here. Keep validation and prefill semantics | Scoped pattern. Do not copy to reports, diagnostics, media or planner |
| Tools: `artifacts/aio-fusion/src/pages/OptimiserPage.tsx`, `artifacts/aio-fusion/src/pages/PlannerPage.tsx`, `artifacts/aio-fusion/src/pages/MediaResearchPage.tsx`, `artifacts/aio-fusion/src/pages/MediaDatabasePage.tsx` | Task-specific density, data terminology and workflow affordances | Apply role tokens and focus rules after visual inventory. Keep tables scannable and row actions compact | Source-reviewed. Rendered visual review pending |
| Reports and audits: `artifacts/aio-fusion/src/ReportPage.tsx`, `artifacts/aio-fusion/src/pages/DiagnosticPage.tsx`, `artifacts/aio-fusion/src/SeoAuditPage.tsx` | Report-specific cards, tables, statuses and print affordances | Do not extend Project Set-Up pink-wash bar. Audit amber focus and statuses in rendered tables | Source-reviewed. No broad accessibility or compliance claim |

## Rollout order and non-goals

1. Freeze the Hub boundary. Audit selectors for indirect shared CSS impact before any settings or token change.
2. Agree Alice plus Inter, role-based palette and terminology. Review marketing and product separately.
3. Render desktop and mobile states for Direct Client, Agency Partner and Master before accepting implementation changes.
4. Apply only small, reversible changes with source paths and screenshots attached.

Non-goals: no Project Hub redesign or palette replacement, no component library, no global CSS refactor, no app/source style changes in this deliverable, no content rewrite or route rename, no account operations or production changes, no invented official logo clearspace, no external dependencies, and no unsupported accessibility certification.

The supplied logo is embedded in the HTML as a PNG data URI. Keep its artwork intact, do not redraw or crop it, and do not invent an official clearspace unit. Formal clearspace needs an approved asset study.

## Acceptance checklist

- [ ] Current workspace home route `/` screenshot reviewed from `docs/brand/references/home-workspace.jpg`.
- [ ] Desktop and mobile marketing navigation reviewed.
- [ ] Desktop and mobile Hub reviewed unchanged against the approved reference.
- [ ] Settings rendered for Direct Client, Agency Partner and Master.
- [ ] Onboarding rendered for each account role where the flow permits it.
- [ ] Project Set-Up keyboard path reaches every field group and action.
- [ ] Tools and reports checked at a narrow viewport, including table overflow.
- [ ] Keyboard focus is visible on links, buttons, inputs, selects and dialogs.
- [ ] Focus is distinct from pink selection and hover.
- [ ] Loading, disabled, error and destructive states checked.
- [ ] Reduced-motion preference preserves state changes without disruptive animation.
- [ ] Terminology passes use My Account, Project Hub and UK spelling.
- [ ] No claim is made for routes or roles not actually rendered.
- [ ] Indirect CSS blast radius checked before any implementation merge.

### Authenticated visual limitation

The settings, onboarding, tools and reports notes are source-reviewed recommendations. Prior settings fixture captures were isolated API fixtures with visible environment labels, not freshly validated staging and not proof of Direct Client, Agency Partner or Master authentication. Obtain current role-specific rendered evidence before calling this audit complete.