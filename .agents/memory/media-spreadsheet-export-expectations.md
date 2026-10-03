---
name: Media spreadsheet export expectations
description: Working-spreadsheet intent, CSV contract separation and Calc compatibility verification.
---

Customer-facing saved/selected media downloads should remain compact working spreadsheets, not decorated reports. Excel is the primary download and CSV is the secondary format for other tools; their existing field sets deliberately differ.

**Why:** The user explicitly rejected CSV as a workaround for Excel formatting. Long URL wrapping caused oversized rows, and extra report structure would interfere with sorting.

**How to apply:** Preserve machine-friendly CSV fields independently of workbook presentation. Use synthetic examples for review, not customer contact data. Publication still requires separate approval.

An OOXML auto-filter element alone can leave filter buttons hidden in LibreOffice Calc, even though its range is present in the worksheet XML. A hidden filter database named range is also needed for this interoperability path.

**Why:** Actual Calc review caught missing dropdowns that the original XML assertions did not detect.

**How to apply:** Review representative workbooks in a spreadsheet application when changing workbook metadata or presentation. XML assertions cannot establish visible filter controls, font rendering or readable wrapping.

The user reviewed the workbook examples and approved them on 2026-10-03.

**Why:** In response to the outstanding desktop Excel review, the user said, “i've revied looks good to go”.

**How to apply:** Do not continue presenting that review as outstanding. Revisit compatibility review only if subsequent changes materially alter the workbook output.