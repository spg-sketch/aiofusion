# AIO Fusion Organic Search Action Plan

**Baseline date:** 27 August 2026  
**Production domain:** https://aiofusion.ai  
**Measurement property:** GA4 `G-DTSDJVJN0Q`

## 1. Current baseline

### Production crawl check

The production domain currently serves an older client-rendered shell rather than the SEO build in this repository:

| Check | Production result on 27 August 2026 | Target after publishing |
|---|---|---|
| Homepage response | HTTP 200 | HTTP 200 |
| Rendered H1 in source HTML | 0 | At least 1 |
| Page title | `AIO Fusion Demo` | Unique intent-led title |
| Canonical link | Missing | Correct absolute canonical |
| Sitemap URLs | 1 | Every canonical public page and complete article |
| Homepage transfer | 1,144 bytes | Pre-rendered page content |
| Server response start | 0.177 seconds from the development check location | Monitor, no regression |

The repository build already contains static pre-rendering, route-specific metadata, structured data, a generated sitemap and crawlable navigation. These improvements will not affect `aiofusion.ai` until the latest application is published and the production domain points to that publication.

### Data that requires owner access

Search Console index coverage, search queries, rankings, organic landing-page sessions and field Core Web Vitals cannot be truthfully recorded from the codebase. Record these values in the monthly template below as soon as Search Console has collected data. Do not substitute estimates.

The public PageSpeed Insights API returned a quota response during this baseline. Run the named reports in Search Console and PageSpeed Insights after publication rather than treating a lab test from staging as production data.

## 2. Search intent and page map

Each page should satisfy one distinct need. Avoid creating several pages that repeat the same product copy.

| Page | Primary intent | Supporting topics | Conversion |
|---|---|---|---|
| `/` | Generative engine optimisation platform | AI visibility, ChatGPT and Claude monitoring, PR workflow | Explore features or book a demo |
| `/for-agencies` | GEO software for PR agencies | Multi-client workspaces, reporting, content optimisation | Book an agency demo |
| `/for-inhouse` | AI visibility software for in-house PR teams | Brand monitoring, communications planning, measurable authority | Book an in-house demo |
| `/pricing` | GEO software pricing | Included projects, annual and quarterly billing, project packs | Book a demo |
| `/insights/seo-aio` | SEO to AIO transition guide | GEO fundamentals, measurement, content and earned media | Continue to related learning or product page |
| `/insights/geo-signals` | GEO signals to track | Technical, content and authority signals | Read the transition guide or Authority Report guide |
| `/insights/earned-media` | Earned media and AI visibility | Third-party authority and citations | Read thought-leadership guidance |
| `/insights/authority-report` | How to measure AI authority | Scoring and prioritisation | Set up a project or compare plans |

Priority query themes to validate in Search Console:

- generative engine optimisation platform
- GEO software
- AI visibility platform
- ChatGPT brand visibility
- GEO platform for PR agencies
- AI visibility software for PR teams
- generative engine optimisation for PR
- AI search visibility monitoring
- GEO software pricing

Search Console evidence decides which wording deserves further investment. A theme with impressions but a low click-through rate usually needs a better title and description. A theme with no impressions may need stronger content or may not represent real demand.

## 3. GEO content cluster

Use `/insights/seo-aio` as the pillar page for the initial cluster.

### Pillar

- From SEO to AIO: a transition playbook for marketing teams

### GEO fundamentals

- The six GEO signal categories every brand should track
- Why earned media beats paid in the AI era
- Why thought leadership is the engine of AI visibility

### Measurement and business value

- Running an Authority Report and reading the results
- AI is changing the rules of B2B visibility
- Will AI finally prove that B2B PR drives sales?

### PR team adoption

- PR professionals should not see AI as a threat
- Why agentic media relations is coming faster than you think
- AIO Fusion guidance articles for setup, optimisation and media research

Every article should link to at least one related learning resource and one relevant commercial or product resource where that link genuinely helps the reader. Keep promotional links outside editorial arguments so the article remains credible.

## 4. Search Console owner checklist

There is no Google Search Console connector available in this workspace, so these account-level actions must be completed by a verified owner:

1. Open Google Search Console and add a **Domain property** for `aiofusion.ai`.
2. Verify ownership using the DNS TXT record Google provides. Keep any existing DNS records.
3. After the latest site is published, inspect `https://aiofusion.ai/` and confirm Google sees the new title, rendered H1 and canonical.
4. Submit `https://aiofusion.ai/sitemap.xml`.
5. Inspect `/for-agencies`, `/for-inhouse`, `/pricing`, `/insights/seo-aio` and `/insights/geo-signals`.
6. Request indexing only after each inspected page passes the live test.
7. Check **Pages** weekly until the sitemap URLs move into indexed status.
8. Check **Core Web Vitals** for mobile and desktop after enough field data is available.
9. Link Search Console to the GA4 property under the GA4 product links settings.
10. Record access ownership internally so verification is not tied to one person.

## 5. GA4 measurement checklist

The shared site head contains GA4 Measurement ID `G-DTSDJVJN0Q`.

After publication:

1. Use GA4 Realtime to confirm a visit to the homepage is received.
2. Visit pricing, agency, in-house and contact pages and confirm page views use the correct paths.
3. Mark the successful contact or demo-request event as a key event. Do not treat a button click as a lead if the form was not successfully submitted.
4. Create an organic-search exploration showing landing page, session source/medium, engaged sessions and successful enquiries.
5. Exclude internal traffic only if the team has a stable and supportable way to identify it.

## 6. Monthly SEO report

Complete this table on the same date each month.

| Metric | Current month | Previous month | Change | Action |
|---|---:|---:|---:|---|
| Valid indexed pages |  |  |  |  |
| Excluded or error pages |  |  |  |  |
| Organic impressions |  |  |  |  |
| Organic clicks |  |  |  |  |
| Search click-through rate |  |  |  |  |
| Average position |  |  |  |  |
| Organic engaged sessions |  |  |  |  |
| Organic demo enquiries |  |  |  |  |
| Mobile URLs passing Core Web Vitals |  |  |  |  |

Also record:

- five queries with the largest increase in impressions
- five queries ranking between positions 4 and 20
- pages with high impressions and below-average click-through rate
- organic landing pages that generate successful enquiries
- indexing or structured-data errors requiring action
- one content update and one technical improvement for the next month

## 7. 30, 60 and 90-day programme

### First 30 days

- Publish the current SEO build to production.
- Complete Search Console verification and sitemap submission.
- Confirm GA4 page views and successful enquiry tracking.
- Capture the first production crawl and PageSpeed baseline.
- Inspect the four commercial pages and the GEO pillar page.

### Days 31–60

- Review real query impressions and refine titles or introductions where evidence supports it.
- Expand the SEO-to-AIO pillar where Search Console reveals unanswered questions.
- Add one original, evidence-led resource that answers a genuine buyer question.
- Address any mobile Core Web Vitals failures with the greatest affected URL count.

### Days 61–90

- Compare organic enquiries by landing page and search theme.
- Refresh pages ranking on the second page of results before creating new pages.
- Develop a digital PR campaign around original AIO Fusion research or methodology.
- Decide the next content cluster from measured query and conversion data.

## 8. Quality rules

- Write for a specific reader need, not a keyword count.
- Keep ChatGPT and Claude as the supported product scope.
- Do not publish unsupported outcome claims or unattributed statistics.
- Show authorship, methodology and evidence where available.
- Keep canonical URLs, visible breadcrumbs and schema aligned.
- Add a page to the canonical route registry so pre-rendering and the sitemap cannot drift apart.
- Re-run the production build and public-page tests before every publication.