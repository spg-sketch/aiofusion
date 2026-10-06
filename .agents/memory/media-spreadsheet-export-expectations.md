---
name: Media spreadsheet export expectations
description: Working-spreadsheet intent, CSV contract separation and Calc compatibility verification.
---

Authorised Media Database Excel downloads must contain the same fields, in the same order, as the equivalent CSV download, while retaining readable widths and spreadsheet formatting. This supersedes the earlier compact Excel field selection, not the customer CSV-only access policy.

**Why:** On 2026-10-06 the user clarified that they want Excel to match the CSV column fields. CSV itself cannot preserve the wider cell settings they requested.

**How to apply:** Share scoped headers and values between the formats; do not expose restricted fields through Excel or restore customer Excel access implicitly. Preserve unrelated workbook layouts and the dedicated story outreach CSV. Use synthetic examples, not customer data. Publication still requires separate approval.

An OOXML auto-filter element alone can leave filter buttons hidden in LibreOffice Calc, even though its range is present in the worksheet XML. A hidden filter database named range is also needed for this interoperability path.

**Why:** Actual Calc review caught missing dropdowns that the original XML assertions did not detect.

**How to apply:** Review representative workbooks in a spreadsheet application when changing workbook metadata or presentation. XML assertions cannot establish visible filter controls, font rendering or readable wrapping.

The user reviewed the workbook examples and approved them on 2026-10-03.

**Why:** In response to the outstanding desktop Excel review, the user said, “i've revied looks good to go”.

**How to apply:** Do not continue presenting that review as outstanding. Revisit compatibility review only if subsequent changes materially alter the workbook output.

Story outreach planning uses a dedicated nine-column CSV: First Name, Last Name, Role, Publication, Email, LinkedIn, Publication Website, Industry and Country. This policy is specific to that story-list download, not all Media Database or Master exports.

**Why:** On 2026-10-06 the user chose this simplified layout after unwanted metadata and cramped spreadsheet display caused confusion. They want the reviewer asked about additional fields afterwards, not more fields included pre-emptively.

**How to apply:** Preserve all stored data and other export contracts. Keep industry values grounded in recorded contact sectors (publication category only as a fallback), never silently recategorise records to improve export appearance. Explain that CSV may open in Excel but cannot preserve spreadsheet column widths.