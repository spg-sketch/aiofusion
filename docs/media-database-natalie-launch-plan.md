# Media Database launch plan

Source: Natalie's `MEDIA_DATABASE_(1)` document. This plan keeps the user's later instruction that downloads are CSV, not Word or Excel. A full export is for the internal platform admin only; workspace users can export their saved connections or up to 25 selected records.

## One coordinated implementation

1. **Simplify search.** Offer UK and US, not Europe; remove internal collection badges and unnecessary management language while keeping legitimate shared/private permissions.
2. **Make saved work obvious.** Put **My Media Database** directly in the main Media Database journey. Show saved contacts and publications in sector-organised, spreadsheet-style views with the fields Natalie listed. Make clear that Save stores a private workspace bookmark and where to find it.
3. **Keep management usable.** Expose add/edit/delete for records the workspace owns and unsave for bookmarked records. Preserve internal import, correction review and discovery controls for their existing authorised users rather than deleting operational capability.
4. **Make details trustworthy.** Remove workbook assertions, page-check evidence and notes from the contact profile; handle number-only placeholder names without inventing identities; explain correction submission and review. Show only meaningful authority information and explain the provenance of reach values.
5. **Make publication actions consistent.** Save works for eligible results. Visit opens a valid recorded publication website; missing or unsafe websites are explicitly unavailable, not fabricated.
6. **Verify before launch.** Test saved-list isolation, actions, fields, permissions, corrections, export limits, and the simplified UI. Run typecheck, focused regression suites, production builds and the project's release gate on a clean committed revision. Do not run provider-backed staging searches until staging database isolation is confirmed.

## Acceptance

- A regular workspace user can find a saved contact or publication in **My Media Database**, see the requested information where it is actually known, remove it from saved items, and download only allowed CSVs.
- Owners can add, edit and remove their own records; shared collection records and other workspaces remain protected.
- No number-only value is presented as a verified journalist name, and no unknown authority or reach figure is claimed as independently verified.
- Internal platform admin remains the only role with a full-database CSV export.