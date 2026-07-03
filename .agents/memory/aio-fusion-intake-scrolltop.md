---
name: IntakeForm scroll-to-top mechanism
description: Why Next/Previous scroll-to-top must set scrollTop directly on the scroll ancestor, not scrollIntoView on a ref
---

The Project Set-Up (IntakeForm) page's scroll-to-top-on-section-change used a hidden `topRef` div plus `topRef.current.scrollIntoView({block:"start"})`. This looked correct but always left a residual scroll offset equal to whatever padding-top existed on the ref's containing wrapper (e.g. `py-8` = 32px), because `scrollIntoView` aligns the ref's own top edge to the viewport, not the true top of the scroll container.

**Why:** Any padding/margin between the scroll container's top and the ref element leaks into the "scrolled to top" position — it never reaches `scrollTop: 0`, which reads as "sometimes doesn't fully return to top."

**How to apply:** For "scroll this container to the very top" behavior, walk up from a ref to find the actual scrollable ancestor (`overflowY: auto/scroll` and `scrollHeight > clientHeight`) and call `scrollParent.scrollTo({top: 0, behavior: "smooth"})` directly, rather than relying on `scrollIntoView` with an anchor element nested inside padded content.
