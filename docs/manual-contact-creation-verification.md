# Manual contact creation verification

Verified on 2026-10-03. This is local built-application evidence, not a claim about the currently published site or the user's original attempted submission.

## Defect reproduced

The pre-change page entered management with `resultMode = none`. Its successful contact POST closed the form, then called `loadData()` with that mode. Categories loaded, but contacts did not.

The updated free-typed-publication UI regression was run against a temporary copy of the pre-change component. The mocked POST succeeded and the form closed, but the assertion for `Alex Editor` failed because the saved contact was not rendered. Temporary baseline source/test files were removed afterward. This reproduces the client visibility defect; it does not establish that a production POST succeeded or explain an unobserved production server failure.

## Changes

- Management now loads the contact list on entry, including re-entry after reload.
- Successful creation clears contact filters, returns to page one, and shows newest contacts first. It refreshes both contact and publication totals.
- A visible confirmation includes a direct link to the saved contact's profile, using the persisted ID and publication link returned by the server.
- Rejected/network-failed submissions keep the form and entered values. A persisted success followed by a list-refresh failure is explicitly distinguished from a failed save, with retry guidance that warns against adding a duplicate.
- Late responses are ignored after unmount or a workspace change. Workspace-scoped metadata and saved-contact feedback are cleared on workspace change.
- No production API mutation behavior, ownership, privacy suppression, ID counters, or spreadsheet-export behavior was changed.

## Checks

| Check | Result |
| --- | --- |
| `pnpm --filter @workspace/aio-fusion exec vitest run src/pages/MediaDatabasePage.test.tsx` | 58 passed |
| `pnpm --filter @workspace/api-server exec vitest run src/routes/media-discovery-approval.test.ts` | 8 passed |
| `pnpm --filter @workspace/aio-fusion run typecheck` | Passed |
| `pnpm exec playwright test --config=playwright.manual-contacts.config.ts` | 1 passed; 19.4 seconds test time, 37.1 seconds total |
| `git diff --check` | Passed |

The browser configuration rebuilds frontend and API code before starting a loopback-only server with disposable PostgreSQL. It uses real sign-in, session cookies, endpoints, database writes and same-origin authenticated reads, not mocked application endpoints. Only synthetic `.invalid` identities and synthetic contacts are seeded or created.

### Browser assertions

1. Open management from the initial `Contacts (0)` state and open Add contact.
2. Submit a rejected four-digit name identifier, assert HTTP 400, and assert the entered name and typed publication remain in the form without a success message.
3. Correct the name and save. Assert the contact and typed publication are displayed without Browse contacts or manual refresh; counts show `Contacts (1)` and `Publications (1)`.
4. Apply a filter that excludes that contact, create another contact without a publication, and assert the filter is cleared, the new contact is displayed, and the contact count is two.
5. Leave and return, then reload. Assert both contacts persist and the original typed publication remains linked to the original persisted contact and outlet IDs.
6. Sign in separately to another synthetic workspace. Assert no private contacts or publications are returned and modification of the first workspace's contact is denied with HTTP 403.
7. Sign in as a synthetic viewer. Assert Add contact is absent and a direct contact POST is denied with HTTP 403.

API regressions also cover shared Master manual entry and suppression rejection before an outlet is created. UI regressions cover pagination reset, network failure, list-refresh failure/retry without a second POST, and a late save response after a workspace switch.

The initial browser fixture used a three-digit token, which is not rejected by the existing four-digit-identifier rule. That fixture was corrected to match the existing contract; application name-validation rules were not broadened. Harness seed columns and project-navigation selectors were also corrected before the successful run.

## Evidence and limitations

- Browser screenshot: `test-results/manual-contact-creation-ma-6ab87-t-leaking-across-workspaces-built-manual-contacts/created-contact-visible.png`, also attached to the test result. Test-results files are local generated evidence, not committed application assets.
- Temporary PostgreSQL cleanup was verified after the browser run: no `aio-release-pg-*` directories remained.
- Frontend unit tests emitted existing jsdom navigation warnings. The browser build emitted non-blocking sourcemap, mixed-import and bundle-size warnings.
- The full project regression suite and published staging/production application were not tested by this focused run.
- No customer workspace was used, no production data or counters were changed, and no production publication was performed.