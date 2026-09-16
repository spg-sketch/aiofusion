# Account Settings button mapping

## Scope and reference

Project Hub is the approved reference. Its ordinary controls use the existing
`aio-button` family: Inter 13px/700, 44px minimum height, 16px icons, 12px radius.
Compact actions use 12px text, 36px minimum height and 10px radius. The Hub's large
create/archive/guidance cards are not form-button templates.

This pass changes only Account Settings CSS and the purpose classes on its
client-management controls. Global styles, Hub, onboarding, shared component
implementations, sidebar navigation, layouts, permissions and handlers are unchanged.

## Mapping

| Settings action | Treatment | Decision |
| --- | --- | --- |
| Back to platform | Existing return variant, matching Hub Platform home | Already 44px, 13px/700, 12px radius; unchanged |
| Profile/project save, account-type confirmation, add client | Primary | Already shared proportions; unchanged |
| Go to Client Project / open client account | Compact primary, like Hub Enter | Match adjacent compact client-row actions |
| Profile/company edit and cancel | Outline; compact for client rows | Remove client-row 1.5px border override and use compact row proportions |
| Company information save, checkout/trial actions | Primary, ordinary rounded rectangle | Settings-only removal of pill radius, uppercase and tracking overrides |
| Payment-method and cancellation portal actions | Compact outline; retain cancellation warning colour | Settings-only 10px radius and normal case; portal behavior unchanged |
| Switch to Master | Navy secondary | Already distinct and consistent; unchanged |
| Client credential/access actions | Compact outline | Add missing variant and remove local border-width conflicts; green grant/pink resend cues retained |
| Archive / restore | Compact outline | Standard border and typography; no behavior changes |
| Delete client, including archived client | Compact destructive | Explicit destructive variant instead of an untyped pink outline |
| Security disclosures and low-emphasis photo removal | Text | Existing text hierarchy retained |
| GEOrge action | Existing primary | Remove desktop/mobile padding overrides; retain placement and width |
| Account-type, subscription-tier choices, nav, image controls | Specialized selection/navigation controls | Not converted into ordinary form actions |

The billing override requires both `.aio-account-settings` and `.settings-content`.
It cannot affect standalone subscription/company cards on onboarding or Hub.

## Evidence and verification

- Actual staging reference: `https://aio-fusion-staging.replit.app`, signed in using
  an existing Agency Partner account supplied by the user. No payments, data edits
  or deletions were performed there.
- Staging references: `screenshots/hub-staging-*-before.png`,
  `screenshots/settings-staging-*-before.png`,
  `screenshots/billing-staging-desktop-before.png`.
- Direct-client, Agency Partner and Master rendering is additionally covered by
  isolated workspace fixtures using the real Settings components, not invented UI.
  Each screenshot has a visible fixture/environment label.
- Before/after billing comparisons: `screenshots/billing-{client,agency,admin}-workspace-{before,after}.png`
  and corresponding `workspace-mobile` files.
- `scripts/settings-button-review.cjs` intercepts every API call, never reads a
  credential and never sends an account mutation. It checks keyboard return
  navigation/focus, client edit/save/cancel, company save/loading/disabled state,
  mobile overflow, client-row cancellation and security disclosure toggling.
- Focused component tests retain role/permission, navigation, saving and account
  security/billing behavior coverage. The browser fixtures are not claims of
  authenticated end-to-end verification for direct-client or Master accounts.

No production publishing is part of this pass. Staging screenshots show the
reference build; after screenshots show workspace-only changes.

Verification result: frontend typecheck passed; 33 focused Settings/security/
subscription tests passed. Workspace fixtures for all three roles reported no
page errors or billing-page horizontal overflow at 390px, retained a 3px keyboard
focus outline, and confirmed the company-save control at 44px/13px/700 with a
12px radius. The pre-existing full-workspace workflow failure is in an unrelated
signup regression; it is not evidence of a Settings failure or a clean full suite.