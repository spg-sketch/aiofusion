# Empty journalist search verification

Verified on 3 October 2026. Local fixes are unpublished.

## Original live evidence

The reported article is “Professional Website, Three Days, From £500: The Smarter Route for UK Small Businesses (Article)”, with Marketing & Advertising targeting and UK region.

The user confirms www.aiofusion.ai is the only live site. Deployment metadata reports a public, successful deployment, and the live health endpoint reports revision `9c52f1649086ac4edaad21429d3b21b06dbdd627`. This is the revision currently served, not proof of the revision serving any earlier search.

Read-only production queries joined run history to the exact article title, project and owner. No unrelated customer rows, contact details or approval tokens were retrieved.

| Run start (UTC) | Recorded status | Retained candidates | Verified / failed candidates | Nearby provider usage records |
| --- | --- | --- | --- | --- |
| 3 Oct 14:03:22 | succeeded | 0 | 0 / 0 | 1 |
| 3 Oct 09:42:35 | succeeded | 0 | 0 / 0 | 1 |
| 2 Oct 14:47:26 | succeeded | 0 | 0 / 0 | 0 |
| 2 Oct 14:45:35 | succeeded | 0 | 0 / 0 | 0 |
| 2 Oct 12:58:38 | succeeded | 0 | 0 / 0 | 0 |
| 2 Oct 12:57:19 | succeeded | 0 | 0 / 0 | 0 |

“Nearby” means same account, project and `media-discover` operation, between start and completion plus five seconds. It is a temporal correlation, not a provider request-ID match. The two usage records name gpt-5.4-mini with non-zero input and output tokens.

No matching discovery-stage deployment logs were available. The available runtime log window starts after the newest listed search. The screenshot's exact run time is not supplied, and persisted runs do not retain the targeting request, provider response, raw candidate count, citation rejection count or web-search call count.

**Conclusion:** the app recorded empty success for this article, but the original screenshot run cannot be confirmed as a valid completed current-web search. Zero candidates were retained after the candidate-selection stage. We cannot establish whether the provider explicitly returned no people, returned unusable output, or proposed people that failed the identity/citation filters. Usage records alone do not prove the web-search tool ran. No public-source checks or failures are retained for these six runs. Nothing here establishes that the UK sector genuinely has no suitable journalists.

The currently deployed source contains the missing-output fallback confirmed below. Its presence establishes a fault in live response handling, not that it caused one of these particular historical runs.

## Confirmed faults fixed locally

1. **False empty success:** missing provider text defaulted to `{"items":[]}`, and a missing/non-array `items` field also became an empty list. A completed provider response must now contain valid JSON and an explicit array, with structurally valid candidate fields matching the requested contract. Missing, incomplete, refused, failed and malformed responses persist as failed runs with a clear message. A valid explicit empty array remains successful.
2. **Evidence persistence:** PostgreSQL could not infer the failure-message parameter's type inside `jsonb_build_object`, causing candidate settlement to fail. An explicit text cast fixes both verified and failed settlement paths.
3. **Failure lost on refresh:** the client loaded a historical failed run but did not restore its failure state or retry controls. It now restores that state without issuing another discovery request.

Bounded logs now distinguish returned candidates, citation rejections, candidates admitted to source checking, verified/failed checks and provider validation failure categories. No raw provider text or new contact fields are logged.

## Isolated verification

The real combined API router runs against an isolated in-memory PGlite database. Provider and public-page responses are controlled fixtures. The screenshot article title, UK region and Marketing & Advertising sector are sent using the actual request fields and checked in the provider prompt.

| Fixture outcome | Persisted result |
| --- | --- |
| Completed response with explicit `items: []` | succeeded, zero cards |
| Missing output, incomplete or refused response | failed, explicit provider-response error |
| Invalid JSON, malformed array or candidate shape | failed, not empty success |
| Valid candidate without matching current citation | succeeded, zero admitted candidates; no source fetch |
| Cited page without the journalist's name | succeeded, retained failed evidence card |
| Public-page check blocked by private-IP safety | succeeded, retained failed evidence card; no retry |
| Cited page with the journalist's name | pending, then verified; approval token available |
| Unpublished/inferred candidate email | removed unless its exact address appears on the checked page |

Polling and latest-run reads preserve state and article identity. Foreign-workspace reads return 404 and anonymous reads return 401. Frontend regressions cover verified/pending cards, failure restoration, failed-source cards, explicit emptiness, navigation and scoped remounts. Existing signed-token integrity and bounded source-retry tests also run.

These are fixture-backed findings, not evidence that a real provider returned journalists for the reported article.

## Checks and boundaries

- Focused API tests: 47 passed, covering the provider contract, combined-router discovery outcomes, source reliability, approval tokens and usage accounting.
- Media Research frontend regression suite: 58 passed.
- Workspace type checks and the frontend type check after the failure-restoration change.
- Development services restarted; development health returns OK.
- Public preview renders. Its screenshot is only a basic shell check, not an authenticated Media Research verification.

No new production search, automatic provider retry experiment, customer-data edit, filter relaxation, media recategorisation, import, provider/model replacement or deployment was performed. Citation, safe-fetch, email, approval-token, privacy and workspace safeguards are unchanged.

## Separate decisions

Publishing requires approval. If real provider-backed verification is wanted after publication, obtain separate confirmation for one bounded search in an isolated synthetic workspace on www.aiofusion.ai. Explain that it creates run/usage records and incurs provider usage. Do not reuse old staging verification as evidence, or imply that these local fixes are already live.