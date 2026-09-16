# V33 shared collection: implementation and operational status

## Approved visibility

The collection is shared across project hubs. Writable Master users maintain it centrally. Workspace-private imports, contacts, shortlist decisions and outreach are not converted into shared data.

## User-approved release split

The user approved releasing the importer implementation separately from the production-backed import. The code must first be merged into the main project and published; publishing an isolated in-progress task does not include its changes. Completion of the code-release task is not completion of the data import. The operational follow-up retains the actual Master preview, database identity confirmation, import commit, count reconciliation and signed-in staging verification.

## Source inventory

The source is `AIO_Fusion_Master_Media_Database_V33_040926_(1)_1789542841485.xlsx`, 3,422,264 bytes, SHA-256 `69627faa25733fd48160c5690b48689ea5f9503e5f723c4358dac1dcd0e7069b`.

The parser inventory is in `media-v33-workbook-inventory.json`. It accounts for 129 sheets: 125 contact/data sheets and four supporting sheets. It accepts 19,275 source rows (19,159 contact rows and 116 publication-only rows), rejects 161 rows lacking outlet names, and retains 1,236 invalid-email warnings. Warnings overlap accepted rows; they are not additional records. Supporting-sheet content is not contact data.

These are source-row counts, not unique-contact totals or a production import result.

## Verification performed

- Exact encoded workbook preview and commit through the application route in isolated PGlite.
- Shared search/recommendation visibility for agency and client identities; unrelated private contact exclusion.
- Reviewed source/hash/category binding, stale preview rejection, retry and concurrency coverage.
- Identity-conflict checks, manual field protection, additive sector/beat metadata and source-assertion verification provenance.
- Frontend coverage of Master/read-only capabilities, import acknowledgements, publication/refresh-only imports, rich exports and source evidence.

The isolated empty-workspace workbook test expects 13,119 new contacts, 3,643 conflicted rows, 2,413 duplicate rows and 100 publication-only outlet rows. It expects 5,359 newly created outlet identities; publication-only outlets are included in that mutation count. Full compound outlet/person identity groups are quarantined when their supplied identities contradict one another, rather than importing the first row encountered. This is not a reviewed merge preview against staging's existing records.

## Operational gates still outstanding

1. Independently confirm that the deployed staging API uses the intended production database. The deployment service identified `https://aio-fusion-staging.replit.app`; this alone does not prove database connection identity.
2. Check backup freshness before import. The production snapshot taken on 16 September 2026 has been restored successfully into disposable PostgreSQL, uploaded to the newly user-created private bucket, and downloaded with a matching checksum. See `production-backup-2026-09-16.md` for recovery location and evidence. Refresh it if significant source changes have occurred.
3. Publish the implementation through the supported deployment process. Preview runtime checks do not establish deployed availability.
4. A signed-in authorised Master previews this exact workbook with the shared collection selected and reviews all sheet/row conflicts and rejections before committing.
5. Commit through that reviewed application flow, then re-read import batch hash/timestamp/outcomes and same-database aggregate counts.
6. Verify signed-in staging search, sector membership totals and multiple real saved-article recommendation/shortlist/export/outreach journeys.

The fresh read-only production baseline was 276 active contacts, 85 active outlets, zero soft-deleted records of either type, and zero import batches. No production import outcome or post-import metadata coverage is claimed. Only the user-approved code-release stage may be completed on the basis of implementation and isolated tests; the actual import remains outstanding.