# Accessibility regression checklist

Use this checklist with a signed-in account and keyboard-only navigation. Run it
for every release that changes the authenticated shell, navigation, forms,
dialogs, or async loading states. Record the browser, zoom level, OS, and
screen reader used with each run.

## Keyboard-only pass

- [ ] Start with the address bar, press `Tab`, and reach the authenticated
  navigation, page actions, and sign-out control without using a pointer.
- [ ] Every focusable control has a visible, high-contrast `:focus-visible`
  indicator. The indicator remains visible on dark navigation surfaces and
  light cards.
- [ ] Focus order follows the visual and reading order. No control traps focus,
  requires a mouse hover, or introduces a positive `tabindex`.
- [ ] Buttons, links, tabs, selects, checkboxes, date fields, and text fields
  can be operated with Enter or Space as appropriate.
- [ ] Pressing Escape closes an open dialog or popover when that interaction is
  supported, and focus returns to the control that opened it.
- [ ] There is a usable skip path to the main content, or the page can reach
  the main content in a small number of predictable Tab presses.

Check these flows on each authenticated surface:

| Surface | Keyboard flow |
| --- | --- |
| Set-Up | Move through the progress navigation, company fields, account choice, and Continue/Sign out actions. Verify validation and loading states do not move focus unexpectedly. |
| Archive | Reach keyword and filter controls, message filter buttons, each item action, and Clear filters. Confirm an empty library still has a readable heading and instructions. |
| Planner | Switch Calendar View/List View, reach date range controls, reset, add/edit/delete actions, horizontal calendar controls, and footer view controls. |
| Audit | Reach the URL field and Run Audit, then Save/download, Print/PDF, expandable findings, previous-audit Load, and Delete actions when results exist. |
| Account | Reach profile, security, billing, project, and account-type controls. Verify every opened panel can be completed and closed without a pointer. |
| Team | Reach invite fields, role and project restriction controls, Send invite, pending invite Accept/Decline, member role/access controls, and remove/revoke/resend actions. |

## Dialog and focus management

- [ ] Open every dialog in Set-Up, Planner, Audit, Account, and Team.
- [ ] The dialog has `role="dialog"` (or an equivalent native dialog),
  `aria-modal="true"`, and a meaningful accessible name.
- [ ] Opening a dialog moves focus into it, ideally to its heading or first
  useful control. Background content is not reachable while it is modal.
- [ ] Dialog headings, close buttons, Cancel buttons, and confirmation
  messages are announced and have accessible names.
- [ ] Closing, cancelling, submitting, and showing a server error return focus
  to a sensible control. A failed submit does not discard entered values.
- [ ] Expandable audit findings and Planner panels expose their expanded state
  and do not move focus when content appears.

## Zoom and narrow reflow

- [ ] At 200% browser zoom, Set-Up, Archive, Planner, Audit, Account, and Team
  retain readable text, visible labels, and usable controls without clipped
  content.
- [ ] At 400% zoom, verify the equivalent 320 CSS pixel reflow view: content
  reflows into one column where possible, and there is no two-dimensional
  page scroll for ordinary text and controls.
- [ ] At narrow widths, tables and calendars provide an intentionally labelled
  horizontal scrolling region where a wide layout is essential. The page
  itself does not unexpectedly scroll sideways.
- [ ] At 200% and 400%, check long workspace names, validation errors, empty
  states, status badges, dialog buttons, and live messages for overlap.
- [ ] Touch targets remain usable when zoomed and no important action is
  available only through hover.

## Reduced motion

- [ ] Enable the operating-system `prefers-reduced-motion: reduce` setting,
  reload, and repeat the Set-Up, Archive, Planner, Audit, Account, and Team
  flows.
- [ ] No loader, progress bar, pop-in, hover effect, modal, or route transition
  has distracting or continuous motion. The global rule shortens transitions
  and holds the indeterminate bar in a visible position.
- [ ] Reduced motion does not remove essential state: loading text, completed
  progress, selected tabs, expanded sections, validation errors, success
  messages, and disabled/busy states remain perceivable.
- [ ] Turn the preference off and confirm normal motion still communicates the
  same state changes.

## Screen reader and live status

- [ ] With a screen reader, each surface announces a meaningful page heading
  and the main navigation landmark. Set-Up progress identifies the current
  step.
- [ ] Every input, select, checkbox, date field, button, link, tab, and dialog
  has a useful accessible name. Placeholder text is not the only label.
- [ ] Loading, success, validation, authentication, and server-error messages
  are announced through an appropriate `role="status"` or `role="alert"` live
  region, without repeatedly re-announcing unchanged content.
- [ ] Set-Up announces step changes and submit errors. Archive announces filter
  results and empty/session-expired states. Planner announces saves, deletes,
  and view changes. Audit announces scan progress, errors, and completed
  results. Account and Team announce save, invite, accept/decline, and
  permission outcomes.
- [ ] Icons that convey no information are hidden from the accessibility tree;
  icons that convey meaning have a text alternative.
- [ ] Tables expose header relationships and row content in a sensible order.
  Status is conveyed by text, not colour alone.

## Evidence

- [ ] Attach a short recording or notes for any failure, including route,
  viewport/zoom, browser, screen reader, expected result, and actual result.
- [ ] Re-test the affected flow after a fix at keyboard-only, 400% zoom, and
  reduced-motion settings before marking the regression closed.