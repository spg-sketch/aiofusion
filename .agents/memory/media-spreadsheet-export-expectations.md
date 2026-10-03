---
name: Media spreadsheet export expectations
description: Working-spreadsheet intent, CSV contract separation and Calc compatibility verification.
---

Workbook and CSV field sets deliberately differ. Historical workbook presentation approval applies to preserved workbook uses, not as authority to override the current customer download policy in replit.md.

**Why:** A later customer download-policy change superseded the earlier customer workbook request, without removing authorised Master maintenance or unrelated workbook exports.

**How to apply:** Preserve machine-friendly CSV fields independently of workbook presentation. Use synthetic examples for review, not customer contact data. Publication still requires separate approval.

An OOXML auto-filter element alone can leave filter buttons hidden in LibreOffice Calc, even though its range is present in the worksheet XML. A hidden filter database named range is also needed for this interoperability path.

**Why:** Actual Calc review caught missing dropdowns that the original XML assertions did not detect.

**How to apply:** Review representative workbooks in a spreadsheet application when changing workbook metadata or presentation. XML assertions cannot establish visible filter controls, font rendering or readable wrapping.

The user reviewed the workbook examples and approved them on 2026-10-03.

**Why:** In response to the outstanding desktop Excel review, the user said, “i've revied looks good to go”.

**How to apply:** Do not continue presenting that review as outstanding. Revisit compatibility review only if subsequent changes materially alter the workbook output.