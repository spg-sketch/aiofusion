---
name: AIO Fusion subsection header pink-wash pattern
description: Standard styling for group/subsection headers within cards and pages (distinct from top-level Section 1 header and from repeated per-item eyebrow labels).
---

Subsection headers (grouping content within a card/page, e.g. "CORE BOILERPLATE", "Score Breakdown by Category", "Priority Actions", "Measured On Your Page") use a mini pink-wash bar:

```
<div className="rounded-xl px-4 py-2.5 flex items-center gap-2.5" style={{ background: "#FBF1F0" }}>
  <span className="w-1 h-4 rounded-full flex-shrink-0" style={{ background: accentPink }} />
  <h3 className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: navy }}>{label}</h3>
</div>
```

**Why:** matches the client-approved Section 1 header treatment in IntakeForm; an earlier "bleed to card edge" negative-margin approach was rejected because card padding varies (p-6 vs p-8) and is too fragile across pages.

**How to apply:** use this ONLY on the Project Set-Up (IntakeForm) page's field-grouping headings (e.g. "CORE BOILERPLATE") — client explicitly scoped it there, not app-wide. Do NOT wrap repeated per-item eyebrow labels inside a loop (e.g. "Spokesperson 1", per-category "Findings"/"Recommendations", per-event "Opportunities (N)"). A first pass mistakenly applied this to ReportPage, DiagnosticPage, MarketingIntelligencePage, MediaResearchPage and PlannerPage subsection headers too; client feedback ("we only need this on the first project set up page") reverted all of those back to plain navy `h3`/accent-bar headers — check with the client before extending this pattern beyond Project Set-Up again.
