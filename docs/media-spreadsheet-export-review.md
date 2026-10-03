# Media spreadsheet export review

## Scope and status

Implemented in the existing AIO Fusion product, without publishing it or changing production data. Verification used synthetic records and an isolated in-memory test database, not live customer exports.

Excel remains the primary saved/selected download. The adjacent CSV button is for importing complete machine-friendly records into other tools, not a formatting substitute. Search, saved-media and record-management views use the same two-format control for both contacts and publications. Internal full-collection and story-shortlist CSV controls are unchanged.

## Workbook presentation

- Existing sheets, field order and column sets retained, including source reach.
- Slate header, lightly alternating rows, 11-point Calibri.
- Ordinary contact rows: 24 points, even with very long website and LinkedIn destinations.
- Useful prose wraps: roles, outlet names, sectors, publication descriptions and journalist lists.
- Two-line examples: 36 points. Very long prose is capped at 72 points to keep the working sheet compact.
- Full prose is retained. The cap means unusually long text is not all visible at once; select the cell to inspect it in the formula bar, or manually expand the row. Wrapped prose is top-aligned so its beginning remains visible.
- URL and short-field columns do not wrap or determine row height. Wide sheets still support horizontal scrolling.
- Header freeze and filters retained. There are no decorative title rows or merged cells.

## Link handling and re-import

Website links display their hostname. Valid LinkedIn links display “LinkedIn profile”. Full HTTP(S) destinations are stored as genuine external hyperlink relationships, never formulas.

Unambiguous bare-domain addresses use HTTPS for navigation and retain their original text in bounded hyperlink metadata. Supported contact re-imports recover full URLs, including original bare-domain text. Formula-like, credential-bearing, malformed and unsafe addresses stay literal; blanks stay blank. Non-LinkedIn addresses in the LinkedIn field are not mislabeled as profiles.

Only safe external links on individual cells in recognized website/LinkedIn columns can replace the expected compact labels during import. The importer does not follow links, evaluate formulas, expand hyperlink ranges or trust unrelated tooltips. Existing ZIP/file/row bounds remain in place. Publication-only workbook imports were not added; the existing importer’s supported sheet contract is unchanged.

## Actual spreadsheet-application review

Opened both final synthetic workbooks in LibreOffice Calc 24.8.7.2 on an isolated desktop:

- Four ordinary contact rows displayed compactly without URL-driven blank space.
- Multiline roles/descriptions wrapped; capped long prose retained its beginning.
- Header, alternating rows, Unicode, blanks and source-reach strings displayed correctly.
- Formula-like strings appeared as literal text, not calculated results.
- Opened the header filter dropdown and confirmed its sort controls and value checklist.
- Navigated to row 40 and confirmed that row 1 stayed frozen.
- Opened Calc’s hyperlink dialog and confirmed the short label and underlying destination.
- Loaded both workbooks through Calc and exported temporary ODS copies. Compared Calc’s retained hyperlink targets with the original workbook metadata: all 7 contact targets and all 4 publication targets matched exactly, including long paths/query strings. The ODS copies are verification output only, not replacement downloads.
- Calc initially hid the filter buttons with the older minimal workbook metadata. The final workbook includes the hidden filter database range, and the buttons were then visible and usable.

Screenshots in `exports/media-spreadsheet-review/` record the actual Calc views, filter dropdown, frozen header and hyperlink dialog. They contain synthetic data only.

## Regression verification

Targeted workbook/import/API/interface checks pass, as do the API and frontend TypeScript checks. Coverage includes:

- Both formats for saved and selected contacts/publications.
- Matching filenames, MIME types, explicit format requests, busy states, errors and fallback download names.
- Full destinations, compact labels, bare-domain round trips, unsafe literals, Unicode, blanks and long text.
- Existing CSV/workbook field differences, formula-injection protection and source-reach data.
- Active-workspace bookmarks, visible outlets/contacts, privacy suppression, departed filtering, independent linked-journalist bookmarks, forbidden full exports, duplicate IDs and the 25-record selected limit.
- The existing large multi-sheet import regression.

The API regression suite logs an existing recoverable worker-dispatch connection warning during isolated import tests; the tests still complete successfully. Both application services start successfully.

## Review files and manual review approval

- `exports/media-spreadsheet-review/Synthetic Media Contacts.xlsx`
- `exports/media-spreadsheet-review/Synthetic Media Publications.xlsx`
- `exports/media-spreadsheet-review/Review findings.html` - self-contained visual findings for Natalie.

Recreate the workbooks offline with:

```sh
pnpm --filter @workspace/api-server exec tsx scripts/media-export-examples.ts
```

Microsoft Excel desktop was not available in this environment. The following checks were supplied for the user's review:

1. No repair warning, and fonts/row heights/wrapping remain readable.
2. Filter dropdowns and the frozen header work.
3. Clicking a compact link uses the full intended destination.
4. Long prose can be inspected or expanded without lost content.

On 3 October 2026, the user confirmed that they had reviewed the examples and that they look good to go. The requested manual review is approved and is no longer outstanding. The original visual findings report records the checks and application availability at the time of the agent's review.

The authenticated download controls were exercised through interface tests with test responses and independently through real API routes backed by synthetic data. A real staging-browser download pass remains a separate pre-release check. No production exports or deployment were performed for this work.