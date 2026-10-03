# AIO Fusion form and application security audit

## Scope, source and evidence standard

- Audited application baseline: `fbccffc0a99397a7f8f45df12925dbdc98fff2a9`, with audit-only tests, tooling and documentation added in the working tree. Application behaviour and dependencies were not changed.
- Scope: production-import-reachable AIO Fusion React/Express source and application-owned database code; related untrusted form, URL, editor, file, import, background-sync and stored-value inputs. Development mockup code is excluded absent demonstrated reachability.
- Environment: local Linux/Node/pnpm workspace, executed PGlite fixtures, plus newly built web/API and a new loopback PostgreSQL cluster with synthetic `.invalid` identities. Detailed tool versions and actual outcomes are in [evidence ledger](evidence-ledger.json).
- **No published deployment was probed or certified.** No shared/customer database, real account, card, payment, provider AI request or third-party website was used. Dependency scanners query vulnerability intelligence, not application customers.
- Severity is impact-based and conditional on stated prerequisites. “Confirmed” means the stated behaviour is reproduced or directly demonstrated, not that the published service has been exploited.
- Counts: 275 literal or finitely resolved application routes, 440 UI control/editor/sink records, 519 API/storage/URL callers and 762 SQL-related call-site records. Constant paths, the legacy recovery loop and both GEO route-factory instantiations are included. These include overlapping statements and potentially inactive UI imports. The [coverage matrix](coverage.md) and registers describe limitations rather than implying everything is safe.

## Executive result

**No exploitable SQL injection was confirmed in the reviewed application source or executed regression paths.** ORM usage was not treated as sufficient proof: raw expressions and direct PostgreSQL calls were traced, and malicious-looking values were inserted/read/updated through actual server handlers and disposable databases. Valid apostrophes and punctuation remain accepted in tested names and text.

Four medium-severity weaknesses or missing resource guarantees were demonstrated without exploitation, affecting remote body budgets, spreadsheet inflation, contact anti-abuse limits and anonymous paid-operation budgets. A classifier representation gap remains an unverified concern, not a confirmed high-severity SSRF finding: real Node DNS normalises the tested mapped address to a rejected form. Actual availability loss and financial loss were deliberately not tested.

### Finding register

| ID | Severity | Confidence | Confirmed local behaviour | Deployment qualification |
|---|---|---|---|---|
| U1 | Unverified concern, not confirmed vulnerability | High for stubbed branch; reachability not established | Injected hexadecimal mapped address passes classifier, but actual Node DNS normalises it to a rejected dotted form | No demonstrated production input route to the vulnerable representation |
| F2 | Medium | High | Auxiliary robots/sitemap paths consume whole response before truncation; header-phase timer is not a complete body deadline | Requires attacker-controlled/compromised remote content; no exhaustion attempted |
| F3 | Medium | High | XLSX inflation runs without `maxOutputLength` before verifying untrusted advertised uncompressed size | Requires authorised importer; tiny malformed fixture only, no decompression bomb |
| F4 | Medium | High locally; proxy-dependent | Contact limiter trusts first X-Forwarded-For value instead of the configured trusted hop | Exploitation depends on deployed proxy preserving an attacker-selected prefix |
| F5 | Medium | High | Anonymous draft-field request reaches captured AI SDK while skipping account spend check | Requires provider configured and reachable; intentional public design needs an explicit approved public budget |

## Unverified network concern

### U1. Classifier representation gap, not demonstrated SSRF

**Source:** `artifacts/api-server/src/lib/safe-fetch.ts`, `isPrivateIP`, `validateUrl`, pinned connector; a similar duplicated classifier exists in `routes/seo-audit.ts`.

**Input trace:** URL -> DNS A/AAAA -> `isPrivateIP` -> selected address -> pinned connector. The classifier rejects dotted `::ffff:127.0.0.1` but not an artificially supplied hexadecimal `::ffff:7f00:1`. A captured test reaches socket selection with that artificial resolver result. A separate real UDP DNS fixture returning the encoded AAAA address shows Node resolves it as `::ffff:127.0.0.1`, which is rejected. The stubbed branch therefore does not establish a production-reachable SSRF.

**Missing prerequisite:** an actual reachable input source producing the unchecked representation. Caller URL and attacker DNS control alone did not establish this under the tested Node resolver. `safe-fetch` remains used by public and authenticated routes; other reserved-address forms, literal URLs and deployment egress need further review.

**Safe reproduction:** `security-fetch-audit.test.ts`, test “records confirmed hexadecimal IPv4-mapped loopback bypass without making a request”. Synthetic DNS returns only `::ffff:7f00:1`; the captured connector receives it and fixture fetch is called. Ordinary IPv4/IPv6 private values and a redirect to `127.0.0.1` are separately rejected. No packet is sent to an internal host.

**Disposition:** unverified defence-in-depth concern. Do not claim internal-network access or assign it as a confirmed high-severity vulnerability. No internal service read/write or metadata access was attempted. Actual DNS formatting is repeatable in `security-dns-format.test.ts`.

**Recommended remedy:** separately approve one shared, tested address classifier which normalises IPv4-mapped IPv6 and rejects all private/reserved/non-global representations before connection and on every redirect. Keep DNS pinning, TLS verification, redirect bounds, explicit scheme/port policy and egress restrictions. Validate `safe-fetch`, SEO and other fetchers independently rather than copying an unchecked classifier.

## Confirmed findings

### F2. Whole-body consumption defeats stated auxiliary response budgets

**Source:** `lib/safe-fetch.ts` auxiliary `fetchTextResource`; `routes/seo-audit.ts` `fetchRobotsTxt` and main `fetchHtml`.

**Trace:** external URL -> validated/pinned header fetch -> `Response.text()` or `arrayBuffer()` -> truncation/length check. `safe-fetch` HTML has a bounded streaming reader with a body deadline. Its robots/sitemap helper instead reads everything before slicing. SEO's robots reader behaves similarly; its main HTML path checks buffer length only after allocation. Header-fetch abort timers are cleared before these body reads and do not provide the complete streaming body deadline implemented by the bounded HTML reader.

**Safe reproduction:** captured robots/sitemap fixture in `security-fetch-audit.test.ts` records a `text()` call. Source confirms the post-read substring and separate header-phase timer. No large response or stalled production request was sent. SEO body behaviour is source evidence, not a separate live network reproduction.

**Impact/prerequisites:** an attacker-controlled or compromised reachable website can cause unbudgeted memory retention or prolonged body reads. Severity is medium because actual exhaustion, concurrency and deployed egress behaviour are not tested.

**Recommended remedy:** enforce cumulative decompressed byte caps and a total body deadline while consuming the stream, cancel/release on every exit, and apply separate small limits to robots/sitemap. Do not treat Content-Length or a post-allocation check as a hard bound.

### F3. XLSX advertised-size checks run before unbounded inflation

**Source:** `lib/media-csv-import.ts`, `parseMediaImportXlsx`.

**Trace:** bounded base64 upload -> ZIP central directory -> claimed uncompressed size/ratio check -> `inflateRawSync(body)` without `maxOutputLength` -> actual-size equality and aggregate-byte check. A malicious central directory can understate size. The later mismatch rejects the workbook but only after inflation has already allocated the result.

**Safe reproduction:** `media-parser-security.test.ts` constructs a tiny ZIP entry containing a few dozen bytes but claims one uncompressed byte. The parser rejects the final size mismatch, and a spy wrapping actual zlib verifies inflation was called with no output cap. There is no large allocation, bomb or load test.

**Prerequisites/impact:** an authorised user with import rights can submit a crafted workbook. Potential memory/CPU denial of service; actual worker/process exhaustion not attempted. Existing input-size, row, relationship, declared-ratio and aggregate-size checks remain valuable but are not an inflation-time guarantee.

**Recommended remedy:** pass an output cap to zlib before inflation, enforce a remaining aggregate budget per entry, validate compressed bounds and directory/local metadata, and reject duplicate/ambiguous paths as needed. Preserve ordinary workbook compatibility and existing relationship/row safety tests.

### F4. Contact-form rate limit keys accept a spoofable forwarded prefix

**Source:** `routes/contact.ts`, custom `contactLimiter.keyGenerator`; `app.ts` configures `trust proxy = 1`.

**Trace:** caller/proxy `X-Forwarded-For` -> custom first-element selection -> limiter bucket. Express's configured trusted hop would select the same last client address in the tested two-element chain, but the custom limiter chooses the first.

**Safe reproduction:** `contact-security.test.ts` with a real Express server and PGlite: five accepted synthetic submissions share `203.0.113.100, 192.0.2.2`; sixth is 429; changing only the prefix to `.101` makes another accepted submission. Emails are captured. No real lead/email or traffic flood is generated.

**Impact/prerequisites:** contact anti-spam bucket bypass if the deployed proxy retains an attacker-controlled prefix. The general API limiter still applies and is not bypassed by this test. In-process limits also do not establish a shared multi-replica quota.

**Recommended remedy:** align custom keys with a verified trusted-proxy `req.ip` policy and normalised IPv6 handling; determine deployed header rewrite behaviour before making a production claim. Consider appropriate shared anti-abuse state and delivery budget.

### F5. Anonymous AI drafting has no account spend-budget enforcement

**Source:** `routes/ai-assist.ts` draft/optimise handlers and `spendLimitCheck`; `middleware/platform-auth.ts` entitlement guard passes when no account exists.

**Trace:** anonymous accepted field/URL -> per-IP rate limiter -> spend checker explicitly skips `!req.account` -> privileged Anthropic request -> token accounting under `"anonymous"`. A source comment confirms anonymous drafting is intentional. This is not an authentication bypass of a private feature; it is a missing explicit public financial budget.

**Safe reproduction:** `ai-assist-security.test.ts`: no session, synthetic provider configuration, captured SDK and synthetic website content. Draft-field returns 200, provider SDK capture is called once and account spend-cap function is never called. No real network or paid call occurs. Public audit routes have separate limits/controls and were not assumed identical to this handler.

**Impact/prerequisites:** when a real provider is configured, unauthenticated requests can consume paid quota without an account-based cap. Distributed clients can multiply a per-IP allowance; limits are in-process. Actual spend, concurrent abuse and provider/global caps are unknown. Severity medium, not a claim of unlimited billing.

**Recommended remedy:** separately choose authenticated-only drafting or a deliberate anonymous demonstration budget with shared global cost/concurrency ceilings, input/token bounds and identity/abuse controls. Reserve cost before work where necessary, avoid retries after uncertain completion, and preserve legitimate onboarding.

## Unverified concerns and test gaps

- **CSRF:** disallowed Origin is rejected before routes, but requests without Origin are allowed. There is no universal CSRF token/Fetch-Metadata policy. SameSite=Lax limits many cross-site POSTs; same-site sibling origins, GET side effects and cookie/proxy settings deserve deployment-specific review. This is a concern, not a confirmed exploit. The browser harness tests an explicit hostile Origin, not every CSRF technique.
- **Role/tenant races:** selected item writes repeat owner predicates and owner/tier changes use locks/CAS. Project access checked before a subordinate write is not an automatic proof of every concurrent owner/member change. Full interleavings and every role combination remain test gaps.
- **Quotas:** fair-usage, spend checks, paid coverage reservation and package ownership were traced. Not every check is an atomic distributed reservation; anonymous routes have differing policies. No concurrency/load/paid-provider test.
- **XSS:** React escapes normal text; How-to inline runs permit HTTPS links and typed blocks; report/intake export helpers escape dynamic strings in reviewed locations. Rich-editor parsing, clipboard HTML and all exported report paths are separate trust boundaries. No production-reachable stored/reflected/DOM XSS was reproduced. CSP on API responses does not prove CSP on deployed static web HTML or downloaded reports.
- **Storage/uploads:** raster magic-byte checks, metadata length checks and private fixed path prefix constrain supported uploads. Real signed-URL ACLs, sidecar grants, every format/decode case and serving headers untested.
- **Logs/privacy:** request logging strips query strings, but contact handling logs email addresses and some helpers log URL/error objects. This is evidence of personal-data logging, not proof of public disclosure. Retention, access and redaction configuration remain operational gaps. Scanner zero findings is not a data-minimisation guarantee.
- **Webhook/payment:** raw signature validation, event claims, customer/subscription binding and invite CAS are present and covered by local captured tests. Live secret correctness, reverse proxy, Stripe Tax, webhook delivery and real payments untested.

## False positives and stale findings

- **SAST redirect at `routes/auth.ts:175`:** manually traced through `getSafeReturnTo`. Only root-relative paths are accepted; protocol-relative URLs, backslash/control-character variants and origin changes are denied. Validator and actual route regression tests passed. Disposition: false positive for this reviewed source path, not a suppression of all redirects. Prior redirect-review suggestion is not new remediation work.
- **Raw numeric list/static tables:** reviewed as described in database-evidence.md, not SQL injection merely because `sql.raw` exists.
- **PressReleasePage raw HTML:** import reachability not established; no production finding asserted.
- **Historical cross-member session issue:** current source scopes named listing/revocation by user ID, and legacy branches exclude user-backed sessions. Existing merged work #97/#136 is referenced rather than re-proposed.
- **Historical item-delete TOCTOU issue:** current mutation predicates repeat item-owner scope; merged work #99 applies. The remaining project-transition concurrency question is distinct and unverified.
- **Old password-change-session proposal #41:** current named-user paths increment session versions and legacy change-password revokes other sessions. Do not duplicate the stale proposal without first reconciling its expected behaviour with merged session-hygiene work.
- **Seed password logging:** current seed script does not print supplied passwords. The threat model's old statement was removed.

## Scanners and actual test evidence

All three scanners were invoked independently with failure-tolerant collection. Saved raw results: [audit-scanners.json](audit-scanners.json).

| Scanner | Status | Result | Disposition |
|---|---|---|---|
| Dependency audit | Succeeded | 0 reported vulnerabilities across all severities | No upgrades made; scanner scope/advisory freshness limit assurance |
| Static code scan | Succeeded, `incomplete:false` | 1 medium redirect alert | Manually reviewed as false positive on current validated return-path flow |
| Privacy/dataflow scan | Succeeded | 0 reported vulnerabilities | Does not negate observed personal-data logging or prove every flow tracked |

The [evidence ledger](evidence-ledger.json) records commands, successful assertions, durations, tool versions and result files. SQL, boundary, additional, privacy retest, editor, form-family, DNS-format and built-browser result JSON files are machine-readable execution evidence. Missing files or failed status must be treated as gaps, never implied passes. Route fixtures sometimes inject identities and simplify schema constraints; only the built-browser PostgreSQL harness uses real sign-in and the complete generated application schema. Family fixtures additionally cover actual support ticket/message queries and Master instruction CAS with stored quote probes.

Initial SQL import assertion expected unenriched notes and failed; the corrected test verifies the existing provenance prefix plus preserved data. Initial browser attempts exposed harness prerequisites: package-relative prerender directory, explicit deployed environment/canonical settings, temporary database binding under the published variable name, loopback Secure-cookie transport, a 201 create response and a required generated recommendation set for feedback. These were test harness corrections, not application fixes. An additional batch had 223 passes and one privacy fixture rate-limit interaction; audit probes now use distinct synthetic client addresses and the complete privacy suite passed separately. Original failure evidence is retained. Final outcomes are in the ledger. An exploratory command naming non-existent test files only ran the five real matching files; the boundary result lists those actual files, not the absent names. An unmanaged exploratory background command did not produce test evidence and is not counted.

## Separately approved remedy plan

### Completion and release-readiness status

The completion review passed, but the configured command `RELEASE_ENVIRONMENT=staging pnpm run release:ready` failed before any release stages: `A release check was interrupted. Confirm its workers have stopped, then remove release-evidence/readiness.lock and retry.` No release workers were found during subsequent local inspection. The lock was not removed and release approval was not fabricated.

The full release pipeline was deliberately not retried within this audit. Its normal web build calls `runPrerender()` without a controlled snapshot and fetches the published Insights API at the configured canonical host (production fallback `aiofusion.ai`). This conflicts with the explicit prohibition on published/shared-data probing. The isolated security browser harness instead uses `canonicalDomain:null`, newly created PostgreSQL, synthetic identities and captured outbound services.

The required release command is therefore intentionally skipped for audit completion, with this scope conflict recorded. Passing isolated tests and completion review do **not** establish full release readiness or permission to deploy. Future approved fixes must preserve existing site behaviour and pass their applicable normal-use regressions; release approval remains separate.

1. Prioritise confirmed F2-F5. Separately review U1 using real resolver/literal-URL evidence before deciding whether a shared address normaliser or egress change is needed; do not describe the stub-only result as exploitation.
2. Address F2/F3 with streaming decompressed byte/deadline limits and inflation-time output caps. Preserve real workbook compatibility; test bounded malformed fixtures, not bombs.
3. Address F4/F5 with verified proxy-derived keys and an explicit public AI/delivery budget policy. Decide product behaviour before restricting public onboarding.
4. Separately approve any deployment verification using synthetic identities and known isolated data. Verify headers, cookies, proxy rewriting, network egress, distributed quotas and storage grants. Do not infer staging separation from the hostname.
5. Reuse existing session/role/coverage/payment follow-ups where applicable. This report does not create duplicate historical remediation.

No behavioural fixes, dependency upgrades, shared schema/data writes, production changes, deployments or marketing/certification claims are included.