---
name: Wide table horizontal-scroll affordance
description: Pattern used to fix "must scroll to bottom of table to find the horizontal scrollbar" on tall wide tables (e.g. Comms Planner calendar).
---

Tall tables using `overflow-x-auto` only expose their native horizontal scrollbar at the very bottom of the scroll container, which is unreachable without first scrolling down through the whole table on smaller screens.

**Why:** client feedback (smaller-resolution laptop) reported the only way to scroll the Comms Planner calendar sideways was to scroll all the way to the bottom of the table first.

**How to apply:** wrap the `overflow-x-auto` div in a `position: relative` container. Add floating chevron buttons as children of that container, each inside its own `position: absolute; inset-y-0` column (full height of the table, `pointer-events-none` on the column, `pointer-events-auto` on the button) with the button itself set to `position: sticky; top: <fixed px>`. This makes the button track the viewport vertically (reachable no matter where the user has scrolled down to) while staying pinned horizontally to the table's visible left/right edge. Button `onClick` calls `scrollRef.current.scrollBy({ left, behavior: "smooth" })`. Track `canScrollLeft`/`canScrollRight` via a scroll/resize/ResizeObserver listener on the scroll container to show/hide arrows only when there's more content in that direction. Any hooks/refs for this must live at the top level of the component (not inside a conditionally-invoked view-switch closure) to respect Rules of Hooks.
