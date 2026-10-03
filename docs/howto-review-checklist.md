# How-to drafts: Natalie's editorial review

## Target and saving status

**Not saved to a target.** This is the prepared catalogue, not a staging or live CMS inventory. Development baseline was inspected through a read-only database query. Authorized target saving remains required.

Each review-* id below is a reserved catalogue identity until its outcome says created. A skipped entry can have been deliberately deleted; do not claim that it remains available. Management route: `/admin/howto`; filter Draft and search the exact id. The current management screen does not select an entry through an id query parameter.

## Existing coverage, preserved unchanged

- `getting-started`: Getting started with AIO Fusion (published).
- `aio-diagnostic`: Running an AIO Diagnostic (published).
- `comms-planner`: Building a comms plan that scores (published).
- `content-optimiser`: Optimising content for AI citation (published).
- `measuring-growth`: Measuring AI authority growth (published).
- `multiple-projects`: Working with multiple projects (published).

Existing broad topics are referenced in the matrix below. New guides are narrower workflow supplements, not replacements. Existing wording mentioning other models, fixed audit duration, guaranteed automatic saving, restoration from Archived Projects or old control names needs Natalie's separate review. No existing entries, IDs, images or bodies were edited.

## Review checklist

P1 = core or safety-critical workflow; P2 = useful specialist workflow. Source notes below mean implementation inspection, not a successful external provider/payment journey. Every guide still needs editorial review.

| Review | Guide | Audience | Priority | Existing overlap | Reserved draft ID / outcome | Selected shared image | Verification notes |
|---|---|---|---|---|---|---|---|
| [ ] | Sign up and choose Agency / Partner or Direct Client | New Agency and direct Client Owners | P1 | getting-started | `review-signup-account-type` / not saved | `article-1-pr-ai` | PlatformHomePage.tsx; AccountTypeSelectPage.tsx; source-inspected; role/control wording needs final review |
| [ ] | Start a managed Client Project as an Agency Partner | Agency Partner Owners and project managers | P1 | getting-started; multiple-projects | `review-agency-client-project` / not saved | `article-1-pr-ai` | SubAccountsPage.tsx; source-inspected; role/control wording needs final review |
| [ ] | Create a project in a direct Client workspace | Direct Client Owners and permitted project editors | P1 | getting-started; multiple-projects | `review-direct-client-project` / not saved | `article-1-pr-ai` | ClientSelectorPage.tsx; App.tsx; source-inspected; role/control wording needs final review |
| [ ] | Build the brand profile and search queries in Project Set-Up | Agency and Client project editors | P1 | getting-started | `review-project-setup-profile` / not saved | `article-3-b2b-authority` | IntakeForm.tsx; source-inspected; role/control wording needs final review |
| [ ] | Prepare messages, spokespeople and media targets | Agency and Client project editors | P1 | getting-started | `review-project-setup-messaging` / not saved | `article-4-agentic-media` | IntakeForm.tsx; ContentCreatorPage.tsx; source-inspected; role/control wording needs final review |
| [ ] | Run and save an Earned Media Visibility Audit | Agency and Client project users with audit access | P1 | getting-started; measuring-growth | `review-earned-audit-baseline` / not saved | `article-3-b2b-authority` | LlmCheckPage.tsx; auditSync.ts; source-inspected; role/control wording needs final review |
| [ ] | Reopen saved audits and make fair comparisons | Agency and Client project users | P1 | measuring-growth; aio-diagnostic | `review-saved-audit-results` / not saved | `article-3-b2b-authority` | Sidebar.tsx; LlmCheckPage.tsx; DiagnosticPage.tsx; source-inspected; role/control wording needs final review |
| [ ] | Audit a website or supplied page text | Agency and Client project users with audit access | P1 | aio-diagnostic | `review-website-audit-inputs` / not saved | `article-3-b2b-authority` | DiagnosticPage.tsx; source-inspected; role/control wording needs final review |
| [ ] | Create and save an article with Content Creator | Agency and Client content editors | P1 | getting-started | `review-creator-draft` / not saved | `article-1-pr-ai` | ContentCreatorPage.tsx; source-inspected; role/control wording needs final review |
| [ ] | Edit a saved article and hand it to the planner | Agency and Client content editors | P1 | content-optimiser; comms-planner | `review-optimiser-library-handoff` / not saved | `article-1-pr-ai` | OptimiserPage.tsx; ContentCreatorPage.tsx; contentStore.ts; source-inspected; role/control wording needs final review |
| [ ] | Review article quality without confusing it with authority | Agency and Client content editors | P2 | content-optimiser | `review-article-quality` / not saved | `article-3-b2b-authority` | OptimiserPage.tsx; source-inspected; role/control wording needs final review |
| [ ] | Review linked articles in Comms Planner | Agency and Client campaign planners | P1 | comms-planner | `review-planner-linked-content` / not saved | `article-3-b2b-authority` | PlannerPage.tsx; PlannerPush.tsx; source-inspected; role/control wording needs final review |
| [ ] | Find and reopen saved content | Agency and Client project users | P1 | getting-started; comms-planner | `review-content-library` / not saved | `article-1-pr-ai` | ArchivePage.tsx; ContentArchiveCard.tsx; source-inspected; role/control wording needs final review |
| [ ] | Use shared contacts and My Media Database safely | Agency and Client media users | P1 | None | `review-media-database-private` / not saved | `article-4-agentic-media` | MediaDatabasePage.tsx; media-collection-ownership.md; source-inspected; role/control wording needs final review |
| [ ] | Match an article to saved media contacts | Agency and Client content and media users | P1 | None | `review-media-recommendations` / not saved | `article-4-agentic-media` | MediaResearchPage.tsx; source-inspected; role/control wording needs final review |
| [ ] | Find additional journalists online and send them for review | Agency and Client media users | P2 | None | `review-media-online-discovery` / not saved | `article-4-agentic-media` | MediaResearchPage.tsx; media-discovery-runs.ts; source-inspected; role/control wording needs final review |
| [ ] | Understand exact phrases and broader topic matches | Agency and Client media users | P2 | None | `review-media-exact-phrases` / not saved | `article-3-b2b-authority` | MediaResearchPage.tsx; exact-target-phrases.ts; source-inspected; role/control wording needs final review |
| [ ] | Preview and import a private media spreadsheet | Agency and direct Client users with import access | P1 | None | `review-media-import` / not saved | `article-4-agentic-media` | MediaDatabasePage.tsx; source-inspected; role/control wording needs final review |
| [ ] | Download media data for a working list | Agency and Client media users with export access | P2 | None | `review-media-export` / not saved | `article-4-agentic-media` | MediaExportDownload.tsx; MediaDatabasePage.tsx; MediaResearchPage.tsx; source-inspected; role/control wording needs final review |
| [ ] | Plan outreach and record what actually happened | Agency and Client media editors | P1 | None | `review-outreach-records` / not saved | `article-4-agentic-media` | MediaOutreachPanel.tsx; MediaResearchPage.tsx; media-outreach.ts; source-inspected; role/control wording needs final review |
| [ ] | Report a contact change without overwriting trusted data | Agency and Client media users | P2 | None | `review-media-corrections` / not saved | `article-4-agentic-media` | MediaDatabasePage.tsx; media-contact-review.ts; source-inspected; role/control wording needs final review |
| [ ] | Research events and awards with verified source details | Agency and Client campaign planners | P2 | None | `review-marketing-intelligence` / not saved | `article-3-b2b-authority` | MarketingIntelligencePage.tsx; source-inspected; role/control wording needs final review |
| [ ] | Build a report from saved project evidence | Agency report writers and Client project stakeholders | P1 | measuring-growth | `review-measure-report` / not saved | `article-3-b2b-authority` | ReportPage.tsx; auditSync.ts; source-inspected; role/control wording needs final review |
| [ ] | Switch workspaces without confusing client data | People who already belong to more than one workspace | P1 | multiple-projects | `review-workspace-switch` / not saved | `article-1-pr-ai` | PlatformHomePage.tsx; App.tsx; source-inspected; role/control wording needs final review |
| [ ] | Invite colleagues and choose their workspace access | Agency and direct Client Owners with team management access | P1 | None | `review-team-invitations` / not saved | `article-1-pr-ai` | TeamSection.tsx; team.ts; source-inspected; role/control wording needs final review |
| [ ] | Maintain your profile and personal sign-in security | Signed-in Agency and Client members | P1 | None | `review-account-profile-security` / not saved | `article-1-pr-ai` | AccountSecurityCard.tsx; App.tsx; platform-mfa.ts; source-inspected; role/control wording needs final review |
| [ ] | Review billing and add project capacity | Agency and direct Client Owners or authorized billing members | P1 | multiple-projects | `review-billing-project-capacity` / not saved | `article-3-b2b-authority` | BillingOnlyPage.tsx; App.tsx; stripe.ts; source-inspected; role/control wording needs final review |
| [ ] | Archive and restore an agency's client scope | Agency Owners with client management access | P2 | multiple-projects (different scope) | `review-agency-client-archive` / not saved | `article-1-pr-ai` | SubAccountsPage.tsx; source-inspected; role/control wording needs final review |
| [ ] | Set up personal two-factor authentication | Signed-in Agency and Client members | P1 | None | `review-personal-mfa` / not saved | `article-1-pr-ai` | MfaPanels.tsx; AccountSecurityCard.tsx; source-inspected; role/control wording needs final review |
| [ ] | Update payment details or cancel at renewal | Owners and authorized billing members | P2 | None | `review-billing-payment-renewal` / not saved | `article-3-b2b-authority` | SubscriptionCard.tsx; source-inspected; role/control wording needs final review |

## Intentional omissions and blocked topics

- Project archiving/restoring from Project Hub: the current Archive handler opens a static empty Archived Projects screen rather than persisting an archive transition. Do not document it as functioning. Agency client archiving is a different workflow and is not verified by that screen.
- Device/session listing and remove-device controls, logout of all other devices on password change: not documented as available.
- Automatic pitch sending, automatic publication to external websites, automatic acceptance of shared contact corrections or public discoveries: not supported by these guides.
- Perplexity/Gemini or other model audits: intentionally omitted; the customer model scope is ChatGPT and Claude.
- Steward/platform-administrator procedures and destructive account deletion: outside the customer workflow library; do not broaden ordinary customer or editorial permissions.
- SSO signup, initial package purchase, real checkout/tax and invitation-email delivery need dedicated environment checks before a detailed end-to-end onboarding/payment guide can be approved. Existing project onboarding guides begin with an authenticated eligible workspace.
- Agency client access issuance varies by agency type. Agency Partner Client Projects must remain managed, without promised independent client sign-in. Legacy nonpartner agency credential issuance is not covered by the Partner guide.

## Image provenance

The selected assets are existing AIO Fusion shared-media editorial illustrations: article-1-pr-ai (collaboration), article-3-b2b-authority (strategy) and article-4-agentic-media (communication). Each was visually inspected from the checked-in approved Insights library and found in the development shared-media inventory. They are not customer screenshots or invented product screens. No new image generation or upload is needed. The importer verifies active metadata and delivered image content before writing.

Each guide has descriptive alt text and an explicit illustration caption. Its first saved image provides the library-card preview. Card crop and complete body presentation must be verified in the isolated browser journey; this does not establish published staging App Storage delivery.

## Natalie's review and publication steps

1. Sign in with your already-approved editorial identity in the explicitly confirmed environment. No new permissions are required or granted by the importer.
2. Open Manage How-to Library, filter Draft and search the entry id. If access is missing, confirm the existing Insights identity rather than assigning a broader role.
3. Read the whole guide in Preview. Return to Edit to revise the continuous Guide content box, titles, descriptions and reading-time labels.
4. Select words to format them. Select an image and use Change image to choose an existing asset or upload through the shared picker. Check Image description and Caption after replacement.
5. Choose Save draft and wait for confirmed saved feedback. Reopen the entry to check the retained text and images.
6. Decide independently whether to Publish this entry. Drafts are hidden from anonymous readers and GEO George. Published entries enter George by default unless Available in GEO George is unticked.
7. Mark your checkbox only after completing your own review. This document does not assert that Natalie's real sign-in has been tested.

## Safety, reruns and environment caveats

The importer is an explicit one-off operation, never application startup or the initial published seed migration. Preview performs only GET requests after existing sign-in. Apply creates only new illustrated drafts through existing CMS authorization and validation. A transactional per-entry ledger preserves edited, published, deleted and colliding entries on later runs. No automatic retries follow uncertain writes; stop and reconcile using preview. Media are reused without changing their metadata.

Run evidence and unresolved checks are recorded in docs/howto-library-editorial-handoff.md. A local built-code journey with a temporary PostgreSQL database is fixture evidence only, not staging/live saving or Natalie identity evidence.

## Complete prepared copy

### Sign up and choose Agency / Partner or Direct Client

Reserved id: `review-signup-account-type`; 3 min read; order 100.

The account follows the appropriate agency or direct Client setup path and can proceed to its approved workspace.

**Before you start**

New Agency and direct Client Owners. Use your own business email and company details. If you have a workspace invitation, follow that invitation instead of creating an unrelated workspace.

Image: `article-1-pr-ai`. Alt: Illustration of a professional collaborating with a glowing AI figure beside analytical displays.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Choose a sign-in method**: From Platform Home, open the sign-up form. You can use Continue with Google or Continue with Microsoft, or complete the email and password form.

2. **Enter company information**: For email signup, enter the requested personal details, company name and company website, choose a password and review the form before choosing Create account.

3. **Verify the address**: If asked to verify your email, open the verification message and follow its link. Use Resend verification email if needed rather than creating a second account.

4. **Choose the workspace type**: At the account-type screen, choose Agency / Partner if you manage work for clients, or Direct Client if you manage your own company or brand. Choose Continue.

5. **Finish the offered setup**: Review the onboarding and package information shown for your account and complete the required steps. Open Project Hub only after the app confirms your workspace is ready.

**What to expect**

The account follows the appropriate agency or direct Client setup path and can proceed to its approved workspace.

**Important limitations**

The setup gate, email delivery and provider callback must be checked in the intended environment. A provider sign-in or payment screen alone does not prove setup completed. This draft is source-inspected, not a successful real signup test.

Tip: Use the company type that matches who pays for and manages the work. Invitation acceptance and independent signup are different journeys.

### Start a managed Client Project as an Agency Partner

Reserved id: `review-agency-client-project`; 3 min read; order 110.

The agency has a managed client scope and can work on its project without confusing it with another client's data.

**Before you start**

Agency Partner Owners and project managers. Sign in to your Agency Partner workspace with permission to manage clients. Confirm your package capacity before creating a Client Project.

Image: `article-1-pr-ai`. Alt: Illustration of a professional collaborating with a glowing AI figure beside analytical displays.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Open client management**: From Platform Home, open your client management area. Check the active agency name so you do not create the client under another workspace.

2. **Add the client**: In Add a Client Project, enter the client's company details and select the offered package information. Review the details, then choose Add Client Project.

3. **Confirm creation**: Wait for confirmed creation. If Project save pending appears, follow the recovery message rather than creating another client with the same details.

4. **Open the first project**: Open the new Client Project and use Create Project in its Project Hub if its first project has not yet been created. Use a name that identifies the brand and programme.

5. **Complete the brief**: Open Project Set-Up for that project and enter the client-specific profile and messages before using content or audit tools.

**What to expect**

The agency has a managed client scope and can work on its project without confusing it with another client's data.

**Important limitations**

Agency Partner Client Projects are permanently managed by the agency. Do not promise the client an independent login or team administration. An empty Client Project can still reserve package capacity.

Tip: Return to the agency workspace before creating a different client. A project switch is not the same as a workspace switch.

### Create a project in a direct Client workspace

Reserved id: `review-direct-client-project`; 3 min read; order 120.

The new project appears in the direct Client Project Hub and has its own brief and working content.

**Before you start**

Direct Client Owners and permitted project editors. Use a direct Client workspace, not an agency-managed client. You need project creation access and available project capacity.

Image: `article-1-pr-ai`. Alt: Illustration of a professional collaborating with a glowing AI figure beside analytical displays.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Open Project Hub**: From Platform Home, choose Project Hub. Confirm the company shown is the workspace in which you want the new project.

2. **Create the project**: Choose Create Project. Enter a recognisable project name and the requested company information, then confirm the creation.

3. **Check capacity**: If Project limit reached is shown, review your allowance in Billing rather than deleting a project to bypass the limit.

4. **Open the project**: Select the project card. Confirm its name in the sidebar, then open Project Set-Up.

5. **Add the working brief**: Supply the brand profile, website and communication context. Check the completion indicators before requesting AI work.

**What to expect**

The new project appears in the direct Client Project Hub and has its own brief and working content.

**Important limitations**

Additional projects remain in this Client account; creating one does not create a separate agency client or a new team. Access depends on membership and capacity.

Tip: Keep programme names specific. A product launch and an ongoing corporate programme may need different briefs.

### Build the brand profile and search queries in Project Set-Up

Reserved id: `review-project-setup-profile`; 3 min read; order 130.

The project has an identifiable brand and reviewed queries that provide context for subsequent tools.

**Before you start**

Agency and Client project editors. Open the correct project and gather the full company name, website, sector and approved brand descriptions.

Image: `article-3-b2b-authority`. Alt: Illustration of blue and gold chess pieces around a connected AI symbol.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Open the brief**: Choose Project Set-Up from the project sidebar. Work through the company profile fields using the real legal or trading name and the website that identifies the same business.

2. **Check market context**: Enter the relevant market, audiences and competitors in their own fields. Avoid using a broad acronym alone when another company may share it.

3. **Review LLM queries**: In field 1.6, review the discovery, shortlist and comparison query groups. Keep each question specific to a buying or discovery need in your market.

4. **Generate only when needed**: If the query generation control is available, review the supplied profile before running it. A displayed lock or next-run date is a real restriction, not a reason to submit repeatedly.

5. **Confirm progress**: Check the completion indicators and any save feedback. Return to the project later to confirm the retained brief before relying on it for an audit.

**What to expect**

The project has an identifiable brand and reviewed queries that provide context for subsequent tools.

**Important limitations**

Query generation has its own run lock. More fields completed does not guarantee a specific audit score or model mention.

Tip: Use the company's full name and domain consistently. Correct a misleading identity before generating more content.

### Prepare messages, spokespeople and media targets

Reserved id: `review-project-setup-messaging`; 3 min read; order 140.

The brief gives content tools a consistent message and a clearer targeting context.

**Before you start**

Agency and Client project editors. Collect approved messages, supporting facts and spokesperson details. Do not enter confidential information that should not be used in content.

Image: `article-4-agentic-media`. Alt: Illustration of a professional and a robot exchanging messages across a connected media network.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Complete the communication brief**: Open Project Set-Up and add the approved messages and supporting context in the corresponding sections. Separate evidence from aspirations.

2. **Add spokespeople**: Enter the names, roles and approved expertise of spokespeople. Check spelling and do not invent quotations or credentials.

3. **Identify audiences**: Describe the audiences and communication needs for this project, then review the planned content context.

4. **Set phrase defaults**: Review field 1.9 for the exact media target phrases you want to use as project defaults. Keep exact phrases distinct from broader topics.

5. **Check article-level targeting**: When you open Content Creator or Content Optimiser & Editor, review its Media target selection. Those choices use accessible Media Database industries rather than blindly copying every Set-Up phrase.

**What to expect**

The brief gives content tools a consistent message and a clearer targeting context.

**Important limitations**

Project defaults and an individual article's media target are different inputs. AI output still needs fact checking and editorial approval.

Tip: If a claim needs evidence, include the source context in the brief and check the generated wording against it.

### Run and save an Earned Media Visibility Audit

Reserved id: `review-earned-audit-baseline`; 3 min read; order 150.

A baseline can be reopened from this project's saved results and used for later reporting.

**Before you start**

Agency and Client project users with audit access. Complete the brand profile and open the intended project. Check the displayed audit eligibility and run-lock information.

Image: `article-3-b2b-authority`. Alt: Illustration of blue and gold chess pieces around a connected AI symbol.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Open the current audit**: Choose Earned Media Visibility Audit in the sidebar. Review the brand, sector and query inputs shown for this run.

2. **Confirm the request**: Choose Run Visibility Audit, review the confirmation and choose Confirm. If Audit locked is displayed, follow its next-run date. Force Re-run Audit is an administrator override, not an ordinary customer action.

3. **Let the run finish**: Watch the progress state. If you navigate elsewhere within the app, return to this same project to inspect the run rather than starting another request.

4. **Read the evidence**: Compare ChatGPT and Claude results, brand mentions, competitor mentions and the supplied assessment where present. Read the actual responses, not only the headline score.

5. **Keep the result**: Use Save this report and wait for confirmation. Open the saved audit from the project's history to confirm the result you want to retain.

**What to expect**

A baseline can be reopened from this project's saved results and used for later reporting.

**Important limitations**

The audit measures responses obtained during this run. It does not prove every consumer gets the same answer or guarantee future citations. An unavailable assessment should not be treated as a zero score.

Tip: Keep a baseline before changing the brief or starting a content programme, and record why later inputs differ.

### Reopen saved audits and make fair comparisons

Reserved id: `review-saved-audit-results`; 3 min read; order 160.

You can retrieve the historical evidence and share the appropriate report without overwriting the baseline.

**Before you start**

Agency and Client project users. At least one completed audit must have been saved in the selected project.

Image: `article-3-b2b-authority`. Alt: Illustration of blue and gold chess pieces around a connected AI symbol.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Confirm the project**: Check the project name in the sidebar before looking for historical results. A different project has a different audit history.

2. **Open saved evidence**: Expand the saved results section for the relevant audit type and select the dated result you want to inspect.

3. **Check the run context**: Review the date and saved inputs. Distinguish Earned Media Visibility Audit responses from Website Visibility Audit findings.

4. **Export the right result**: Use the report's offered export action, and check the downloaded file describes the saved run you selected rather than a newer unsaved result.

5. **Compare cautiously**: Keep input changes, provider context and run methodology alongside a before-and-after comparison. Explain missing data instead of substituting invented scores.

**What to expect**

You can retrieve the historical evidence and share the appropriate report without overwriting the baseline.

**Important limitations**

Historical results are snapshots, not live monitoring. Saved browser-only content scoring and saved visibility audits do not have identical storage behavior.

Tip: Label exports with the project and run date outside the app so colleagues know which evidence they are reading.

### Audit a website or supplied page text

Reserved id: `review-website-audit-inputs`; 3 min read; order 170.

You have a saved, dated website assessment and a list of findings to review with the website team.

**Before you start**

Agency and Client project users with audit access. Have an accessible website URL or the page text you are permitted to assess. Check the project's current audit restriction.

Image: `article-3-b2b-authority`. Alt: Illustration of blue and gold chess pieces around a connected AI symbol.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Open Website Visibility Audit**: Choose Website Visibility Audit in the sidebar. Review the available URL and supplied-text input options.

2. **Prepare the input**: Use the full website URL for a website assessment, or provide the requested page text where that option is available. Verify the subject matches the selected project.

3. **Run the analysis**: Choose Run Diagnostic and confirm the request. If a permitted Force Re-run Diagnostic control is shown, read the warning before using it.

4. **Review findings**: Read the scored findings and recommendations. Prioritise concrete corrections that the report actually identified rather than inferring missing technical checks.

5. **Save for follow-up**: Choose Save audit, wait for confirmation and reopen the saved diagnostic. Use the available export when briefing the website team.

**What to expect**

You have a saved, dated website assessment and a list of findings to review with the website team.

**Important limitations**

Supplied text cannot establish every live website property. This tool does not apply changes to your website, and completion time varies.

Tip: Verify a recommendation on the real website before assigning development work. Do not present the score as a search ranking.

### Create and save an article with Content Creator

Reserved id: `review-creator-draft`; 3 min read; order 180.

The reviewed article is retained in the project's Content Library for further editing and planning.

**Before you start**

Agency and Client content editors. Complete the relevant Project Set-Up fields and gather accurate source information for the story. You need content editing access and available usage.

Image: `article-1-pr-ai`. Alt: Illustration of a professional collaborating with a glowing AI figure beside analytical displays.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Set the article context**: Choose Content Creator. Enter the working title and content type, then review the spokesperson, publication date and story context fields.

2. **Select Media target**: Choose suitable industries from Media target. Check the choices against the story rather than selecting every available category.

3. **Generate or write**: Use the available generation action after reviewing the brief, or write the article in the content area. Wait for the request's confirmed result.

4. **Review the draft**: Check names, statistics, attributed claims, quotations and tone. Replace unsupported statements with verified wording before sharing the copy.

5. **Save the article**: Use Save to Content Library and wait for success. Open Content Library in the same project and confirm the correct article appears.

**What to expect**

The reviewed article is retained in the project's Content Library for further editing and planning.

**Important limitations**

Generation consumes the applicable content usage allowance and is not automatic publication. Saved content is not proof that a journalist received it.

Tip: If Restore draft appears, compare the recovered local changes with the last confirmed version before choosing which to keep.

### Edit a saved article and hand it to the planner

Reserved id: `review-optimiser-library-handoff`; 3 min read; order 190.

The saved article and its planner reference retain a single editorial identity rather than becoming unrelated copies.

**Before you start**

Agency and Client content editors. Start with an existing article or paste the complete copy into Content Optimiser & Editor. Keep an external copy if the text is important.

Image: `article-1-pr-ai`. Alt: Illustration of a professional collaborating with a glowing AI figure beside analytical displays.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Open the article**: Open the saved piece from Content Library in the editor, or choose Content Optimiser & Editor from the sidebar and supply the copy and article context.

2. **Review optimisation**: Use the available optimisation action when needed. Inspect the revised wording and change information; check that facts and intended meaning remain correct.

3. **Edit the retained copy**: Make the editorial changes you want to keep. Do not assume an AI score approves claims or quotations.

4. **Save first**: Save the piece to Content Library and wait for confirmation. If you are leaving with unsaved changes, use the save/stay/discard prompt deliberately.

5. **Plan the same article**: Where offered, choose Push to Comms Planner and review the linked row in Comms Planner. If the app says the library save succeeded but the planner save failed, retry the handoff rather than creating another article.

**What to expect**

The saved article and its planner reference retain a single editorial identity rather than becoming unrelated copies.

**Important limitations**

Editing an article does not rewrite historical outreach evidence. Optimisation and planning do not publish the copy to external channels.

Tip: Keep the same working title across the library and plan so colleagues can follow the article's progress.

### Review article quality without confusing it with authority

Reserved id: `review-article-quality`; 3 min read; order 200.

The assessment is tied to the current copy and can support, rather than replace, editorial judgement.

**Before you start**

Agency and Client content editors. Use a real article in the editor and make sure its current context and media targets are correct.

Image: `article-3-b2b-authority`. Alt: Illustration of blue and gold chess pieces around a connected AI symbol.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Open the current text**: Choose Content Optimiser & Editor and open the saved article or paste the content you want to assess.

2. **Review context**: Check the article's content type, target context and project brief before requesting an assessment.

3. **Read the assessment**: Use the offered scoring or optimisation controls and inspect the detailed findings alongside the text, not just the score.

4. **Make targeted edits**: Correct unsupported claims, unclear entities or structural issues where the findings justify a change.

5. **Assess the revised copy**: After changing the text or scoring context, obtain a current assessment before quoting the previous score as evidence of improvement. Save the final working article.

**What to expect**

The assessment is tied to the current copy and can support, rather than replace, editorial judgement.

**Important limitations**

Article quality is not the same metric as campaign Authority in Comms Planner, or measured model visibility in an audit.

Tip: Keep the reasons for important revisions with your editorial notes; a higher number alone does not prove better real-world coverage.

### Review linked articles in Comms Planner

Reserved id: `review-planner-linked-content`; 3 min read; order 210.

The schedule and linked article context are available for the project team to review.

**Before you start**

Agency and Client campaign planners. Save at least one article to Content Library and use the offered planner handoff if you want a linked item.

Image: `article-3-b2b-authority`. Alt: Illustration of blue and gold chess pieces around a connected AI symbol.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Open the plan**: Choose Comms Planner in the correct project. Review any loading or save errors before editing.

2. **Choose a view**: Use Calendar View or the alternative plan view to inspect the campaign schedule. Scroll horizontally where the calendar is wider than the screen.

3. **Review article context**: Open the relevant item and check its working title, date, media target and linked content before making changes.

4. **Save the item**: Use Save in the item's editor and wait for the pending save to finish. Reopen the item to check the retained date and context.

5. **Interpret scores**: Read Visibility and Authority as planning measures with their stated scoring context. Compare the plan with actual saved content and outreach records.

**What to expect**

The schedule and linked article context are available for the project team to review.

**Important limitations**

Planner scores are not proof of publication, outreach delivery or AI citations. The existing introductory guide's Add item description needs editorial comparison with the current controls.

Tip: If a library handoff partly fails, finish the link from the original article rather than duplicating the draft.

### Find and reopen saved content

Reserved id: `review-content-library`; 3 min read; order 220.

You can retrieve the right article and keep its identity through subsequent edits.

**Before you start**

Agency and Client project users. Content must have been saved in the selected project. Your membership needs access to that project.

Image: `article-1-pr-ai`. Alt: Illustration of a professional collaborating with a glowing AI figure beside analytical displays.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Open Content Library**: Choose Content Library in the sidebar and wait for the saved pieces to load.

2. **Find the right piece**: Use the available search and filters. Check the working title and type so similarly named drafts are not confused.

3. **Open for review**: Open a piece and read its retained content. Use the offered editing action when you need to revise it.

4. **Save revisions**: Save in the relevant content editor, wait for confirmation, then return to Content Library to confirm the revised piece.

5. **Handle loading failures safely**: If the library reports an expired session or network error, sign in or retry the load as directed. Do not treat a failed load as an empty library or replace it with a new copy.

**What to expect**

You can retrieve the right article and keep its identity through subsequent edits.

**Important limitations**

A library status does not publish an article on your website or send a pitch. Deleting content is separate from discarding unsaved edits.

Tip: Check the selected project before deciding a piece is missing.

### Use shared contacts and My Media Database safely

Reserved id: `review-media-database-private`; 3 min read; order 230.

You can distinguish reusable shared records from media saved privately by the active workspace.

**Before you start**

Agency and Client media users. Open a workspace with Media Database access. Understand whether you are browsing shared media or your own workspace collection.

Image: `article-4-agentic-media`. Alt: Illustration of a professional and a robot exchanging messages across a connected media network.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Open the database**: Choose Media Database and review the publication and contact views. Use the available filters to narrow your target industries.

2. **Inspect the contact**: Open the relevant contact or publication and review its role, publication and available source details before adding it to a list.

3. **Use the private collection**: Choose My Media Database when working with your own saved media. Saving or bookmarking a shared record is not the same as modifying the canonical shared contact.

4. **Add your own contact**: Where Add contact is available, enter accurate details and choose Save contact. Check the collection ownership shown in the form.

5. **Confirm workspace scope**: Reopen the saved contact in the same workspace. Switch workspaces only when you intend to use that other workspace's collection.

**What to expect**

You can distinguish reusable shared records from media saved privately by the active workspace.

**Important limitations**

An agency's hierarchy does not pool every client's private collection. Shared-source corrections require the appropriate review, not a silent overwrite. Source reach is currently hidden in these views.

Tip: Treat contact information as working evidence that may need a current public-source check before outreach.

### Match an article to saved media contacts

Reserved id: `review-media-recommendations`; 3 min read; order 240.

Your story has a shortlist grounded in accessible saved contacts and clearly labelled evidence.

**Before you start**

Agency and Client content and media users. Save or prepare an article with a meaningful Media target. Ensure the current project and article are the intended ones.

Image: `article-4-agentic-media`. Alt: Illustration of a professional and a robot exchanging messages across a connected media network.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Open Media Research**: Choose Media Research for the article you are researching and review its story brief and targeting inputs.

2. **Review database recommendations**: Read Recommended from your Media Database. Inspect editorial fit, evidence confidence and outreach readiness separately.

3. **Use pagination**: Use See next five and Previous five to inspect additional recommendations without assuming they trigger a new coverage check.

4. **Check coverage deliberately**: If you need recent evidence, use the explicit coverage-check action and read its warning. It checks up to five contacts from the global top five and counts toward AI spend limits.

5. **Select for the story**: Use Plan outreach for this story on appropriate candidates. Review Story outreach planning before exporting or recording activity.

**What to expect**

Your story has a shortlist grounded in accessible saved contacts and clearly labelled evidence.

**Important limitations**

Fit is not a guaranteed response. Pagination does not run coverage enrichment. Saving to My Media Database alone does not mark a contact as pitched.

Tip: Read the article evidence and the journalist's beat before relying on the ranking.

### Find additional journalists online and send them for review

Reserved id: `review-media-online-discovery`; 3 min read; order 250.

Suitable public candidates are submitted for review without being presented as already approved contacts.

**Before you start**

Agency and Client media users. Open a saved article's Media Research view and wait for its story brief to load successfully.

Image: `article-4-agentic-media`. Alt: Illustration of a professional and a robot exchanging messages across a connected media network.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Start a public search**: Choose Find additional journalists online when the brief is ready. This is separate from recommendations from your Media Database.

2. **Watch verification**: Read Public web discoveries as candidates arrive. Distinguish pending checks, verified results and failed evidence checks.

3. **Inspect sources**: Open the available source links and confirm the candidate's current role and relevance to your article. Do not infer an email address that is not evidenced.

4. **Submit a verified candidate**: Use Send for review on a suitable verified result. A steward must approve it before it becomes a database contact.

5. **Recover carefully**: If a search times out, return to the same article to inspect the server-persisted run. Use Retry live search only after checking what was already verified.

**What to expect**

Suitable public candidates are submitted for review without being presented as already approved contacts.

**Important limitations**

Discovery does not automatically approve, email or add every result. Privacy suppressions and review decisions can exclude a candidate.

Tip: Keep pending candidates separate from verified contact records when preparing an outreach list.

### Understand exact phrases and broader topic matches

Reserved id: `review-media-exact-phrases`; 3 min read; order 260.

The shortlist and reporting distinguish observed phrase matches from estimated relevance.

**Before you start**

Agency and Client media users. Prepare the article and its target phrases. If using Project Set-Up defaults, review field 1.9 first.

Image: `article-3-b2b-authority`. Alt: Illustration of blue and gold chess pieces around a connected AI symbol.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Review phrase inputs**: Open the article's Media Research view and check the target phrases being used for this search.

2. **Read exact-match evidence**: Where an exact phrase result is shown, review the quoted or linked source evidence and the effective query rather than assuming any related word is an exact match.

3. **Separate topic overlap**: Treat broader topic overlap and AI-suggested fit as different evidence categories. Inspect the source before shortlisting.

4. **Keep the snapshot**: When you record outreach for the story, check the retained phrase and article context. Later article edits should not change the historical outreach snapshot.

5. **Compare compatible checks**: Only compare phrase checks when query, provider, model, run count and methodology are compatible. Explain any mismatch.

**What to expect**

The shortlist and reporting distinguish observed phrase matches from estimated relevance.

**Important limitations**

An AI suggestion is not proof that a publication has used the exact phrase or mentioned the brand.

Tip: Use a short, distinctive phrase when exact wording matters, and record why it was chosen.

### Preview and import a private media spreadsheet

Reserved id: `review-media-import`; 3 min read; order 270.

The supported rows are imported or refreshed according to the reviewed preview, with a visible result.

**Before you start**

Agency and direct Client users with import access. Use a supported CSV or XLSX file containing media data you are allowed to retain. Keep the source file and verify the target workspace.

Image: `article-4-agentic-media`. Alt: Illustration of a professional and a robot exchanging messages across a connected media network.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Open the importer**: In Media Database, open Import media contacts. Select the file in the upload area.

2. **Check file limits**: Use CSV files of 2 MB or smaller, or XLSX files of 12 MB or smaller. Read validation feedback before proceeding.

3. **Review ownership**: Check Import target. Ordinary account imports are private to the active workspace; shared collection controls are restricted to appropriate stewards.

4. **Review the preview**: Inspect row counts, publication relationships, categories, duplicates and conflicts. Acknowledge the target ownership and any required conflicts only after understanding them.

5. **Apply and reconcile**: Choose the displayed Import contacts, Import publications or Apply refresh plan action. Wait for progress and Import complete. If the browser times out, check the existing import job before starting a new import.

**What to expect**

The supported rows are imported or refreshed according to the reviewed preview, with a visible result.

**Important limitations**

A preview is not a completed import. Long server work can continue after a browser timeout; submitting the same file again too soon can duplicate work.

Tip: Resolve unexpected field mapping or relationship warnings in the source file before applying the import.

### Download media data for a working list

Reserved id: `review-media-export`; 3 min read; order 280.

You have a file for the intended scope that can be checked before sharing or further use.

**Before you start**

Agency and Client media users with export access. Choose the relevant collection or story list and check that you are permitted to export the contacts.

Image: `article-4-agentic-media`. Alt: Illustration of a professional and a robot exchanging messages across a connected media network.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Select the scope**: Open Media Database or the story's Media Research list. Confirm which collection or selected contacts the offered download will include.

2. **Review the records**: Filter or select the intended contacts and check their publication relationships and available contact fields.

3. **Choose the format**: Use the available download action. Choose a workbook for a working spreadsheet when offered, or CSV for a machine-readable exchange.

4. **Check the downloaded file**: Open it in your spreadsheet tool and confirm headings, row counts and any publication/contact sheets. Preserve identifiers when using a supported round trip.

5. **Export a story shortlist**: For a Media Research story download, select no more than 25 contacts per download. If more are selected, adjust the selection rather than expecting an automatic partial CSV.

**What to expect**

You have a file for the intended scope that can be checked before sharing or further use.

**Important limitations**

Exports are not evidence of outreach delivery. Excel workbook and CSV formats are different contracts; do not assume every arbitrary edited spreadsheet can be reimported losslessly.

Tip: Share only the fields your colleague actually needs and protect downloaded personal contact details.

### Plan outreach and record what actually happened

Reserved id: `review-outreach-records`; 3 min read; order 290.

The story has a traceable outreach record that separates planning, contact, response and verified placement.

**Before you start**

Agency and Client media editors. Have a reviewed article and selected contacts in Story outreach planning. Obtain any needed permission before contacting someone.

Image: `article-4-agentic-media`. Alt: Illustration of a professional and a robot exchanging messages across a connected media network.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Build the story list**: In Media Research, use Plan outreach for this story on suitable recommendations. Open Story outreach planning and check each selected contact.

2. **Review the snapshot**: Check the story and phrase context attached to the outreach record. It is historical evidence, not a live mirror of every later article edit.

3. **Carry out outreach separately**: Send your pitch through your normal approved communication channel. Selecting a contact in AIO Fusion does not send an email.

4. **Record the activity**: Use the outreach panel's available status and activity controls to record contact, response and relevant notes accurately.

5. **Verify placement evidence**: Supply and verify the required evidence before recording placed status. Read any validation message rather than claiming coverage without evidence.

**What to expect**

The story has a traceable outreach record that separates planning, contact, response and verified placement.

**Important limitations**

There is no automatic pitch delivery promised by this guide. Placed status is evidence-gated, and later copy edits do not rewrite outreach history.

Tip: Record an unsuccessful or unanswered pitch honestly; a shortlist is not a result.

### Report a contact change without overwriting trusted data

Reserved id: `review-media-corrections`; 3 min read; order 300.

The proposed change has a workspace-scoped review record with provenance.

**Before you start**

Agency and Client media users. Find the contact and have a current public source that supports the proposed correction.

Image: `article-4-agentic-media`. Alt: Illustration of a professional and a robot exchanging messages across a connected media network.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Inspect the record**: Open the contact in Media Database and compare its current role and publication with your source.

2. **Use the review action**: Use the available correction or departed-contact reporting action, rather than editing shared-source facts without approval.

3. **Provide evidence**: Describe what has changed and supply the requested source details. Distinguish a confirmed departure from uncertainty about a person's current role.

4. **Submit for review**: Review your report and submit it. Keep the confirmation or displayed review state as the record of your submission.

5. **Wait for a decision**: Treat the canonical contact fields as unchanged until the appropriate steward has reviewed the report.

**What to expect**

The proposed change has a workspace-scoped review record with provenance.

**Important limitations**

Submitting a report does not guarantee approval or silently change shared fields. Identity-based privacy requests use a separate verified process.

Tip: If the source is ambiguous, say so in the report instead of guessing a replacement name or address.

### Research events and awards with verified source details

Reserved id: `review-marketing-intelligence`; 3 min read; order 310.

You have a source-backed shortlist of opportunities for further campaign planning.

**Before you start**

Agency and Client campaign planners. Know the project's market and the kinds of events or awards you want to investigate.

Image: `article-3-b2b-authority`. Alt: Illustration of blue and gold chess pieces around a connected AI symbol.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Open Marketing Intelligence**: Choose Marketing Intelligence in the sidebar. Review the marketing type, categories and time period.

2. **Choose categories**: Use + Choose categories to select relevant categories, then inspect the selected values before searching.

3. **Run the search**: Choose Search Events and wait for the result. If no events are found, adjust the search context rather than inventing a candidate.

4. **Check deadlines**: Read Top 3 upcoming verified deadlines and the source-checked details for each relevant opportunity.

5. **Verify before committing**: Open the event's source and confirm cost, eligibility, deadline and contact details with the organiser before committing budget or submitting an entry.

**What to expect**

You have a source-backed shortlist of opportunities for further campaign planning.

**Important limitations**

AI-summarised audience and organiser text is not a verified source fact. Relevance is an estimate, not measured Authority or a guarantee of success.

Tip: Treat Not published as missing information to confirm with the organiser, not as free entry or no deadline.

### Build a report from saved project evidence

Reserved id: `review-measure-report`; 3 min read; order 320.

Your report describes actual saved evidence rather than unsupported demonstration figures.

**Before you start**

Agency report writers and Client project stakeholders. Save the project's audit evidence and relevant content/planning records before opening the reporting area.

Image: `article-3-b2b-authority`. Alt: Illustration of blue and gold chess pieces around a connected AI symbol.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Open Measure & Report**: Choose Measure & Report from the selected project's sidebar.

2. **Check evidence availability**: Read the report sections and any no-audit or empty-state messages. A missing result is not a zero or an improvement.

3. **Review each measure**: Compare Earned Media findings, website findings and campaign activity in their own context. Keep article quality and planning scores distinct from measured audit evidence.

4. **Check dates and inputs**: Make sure the report refers to the right saved runs. Explain changes in the query or brief that affect comparability.

5. **Share responsibly**: Use the available report or audit export, inspect the downloaded output and add a clear explanation of limitations before sending it to a client.

**What to expect**

Your report describes actual saved evidence rather than unsupported demonstration figures.

**Important limitations**

Reporting does not perform a fresh audit or prove a causal link between a content score and coverage. Different measures are not interchangeable.

Tip: State the baseline date and assessment period in your commentary.

### Switch workspaces without confusing client data

Reserved id: `review-workspace-switch`; 3 min read; order 330.

The same signed-in person works in the intended company context with that workspace's permissions.

**Before you start**

People who already belong to more than one workspace. Your personal identity must already have authorized membership in the destination workspace. No new access is granted by switching.

Image: `article-1-pr-ai`. Alt: Illustration of a professional collaborating with a glowing AI figure beside analytical displays.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Save current work**: Finish or deliberately discard unsaved editor changes before leaving the current workspace.

2. **Open the workspace choice**: Use the available workspace selector in the account area. Check the destination company name, not only your personal sign-in name.

3. **Select an existing membership**: Choose the workspace you want to enter and wait for the switch to finish.

4. **Open its Project Hub**: Check the active workspace identity and visible projects, then select the project you intend to work on.

5. **Check scoped data**: Open the project's content or media views and confirm they belong to the destination. If the switch fails, stay in the original context and follow the error.

**What to expect**

The same signed-in person works in the intended company context with that workspace's permissions.

**Important limitations**

Switching a project is not switching a workspace. Membership and project restrictions still apply, and private media collections do not pool across an agency tree.

Tip: When troubleshooting a missing project, check workspace and project access before creating a replacement.

### Invite colleagues and choose their workspace access

Reserved id: `review-team-invitations`; 3 min read; order 340.

The colleague receives an invitation to the intended workspace and, after acceptance, the approved role and project scope.

**Before you start**

Agency and direct Client Owners with team management access. Use an Agency or direct Client workspace with team administration rights and an available seat. Agency-managed Clients do not have independent team controls.

Image: `article-1-pr-ai`. Alt: Illustration of a professional collaborating with a glowing AI figure beside analytical displays.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Open team management**: Open Account Settings and its team area. Check the active workspace and the seat availability shown.

2. **Choose the invite details**: Enter the colleague's email and choose the available membership role. Read the role description instead of assuming all roles can edit content or manage billing.

3. **Set project access**: Where project assignment controls appear, choose the projects the colleague should be able to access.

4. **Send and track**: Submit the invitation and check Pending invitations. Use Resend or Revoke deliberately if the invitation needs attention.

5. **Review accepted membership**: After acceptance, inspect the member's role and project access. Change only the access needed for their responsibilities.

**What to expect**

The colleague receives an invitation to the intended workspace and, after acceptance, the approved role and project scope.

**Important limitations**

Owners, administrators, content users, viewers and billing members have different capabilities. An invitation is not proof the recipient accepted or successfully signed in. Seat limits apply.

Tip: Use the narrowest role that lets the colleague do their job. Never grant ownership just to expose an unrelated editorial tool.

### Maintain your profile and personal sign-in security

Reserved id: `review-account-profile-security`; 3 min read; order 350.

The account reflects the intended personal details and the confirmed security state.

**Before you start**

Signed-in Agency and Client members. Sign in as yourself. Keep access to your existing sign-in method and any configured recovery options.

Image: `article-1-pr-ai`. Alt: Illustration of a professional collaborating with a glowing AI figure beside analytical displays.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Open Account Settings**: Use the account settings action and distinguish your personal profile from the active company workspace details.

2. **Update the right identity**: Use the profile controls to update your personal name or image where offered. A workspace logo represents the company, not the signed-in person.

3. **Review sign-in security**: Open the personal security controls and inspect the password and two-factor options available to your account.

4. **Follow confirmation steps**: For password, MFA or destructive changes, complete the proof and confirmation the app requests. Keep recovery information securely outside the guide.

5. **Confirm the outcome**: Wait for save feedback and review the resulting security state. If a verification step fails, keep the existing working sign-in path and follow the displayed recovery route.

**What to expect**

The account reflects the intended personal details and the confirmed security state.

**Important limitations**

SSO accounts do not necessarily have a password. Personal MFA is not a shared workspace factor. This guide does not promise device-session management or logout of every other device after a password change.

Tip: Never paste passwords, recovery codes or authentication tokens into a project brief, guide or support note.

### Review billing and add project capacity

Reserved id: `review-billing-project-capacity`; 3 min read; order 360.

The workspace has a clearly understood billing state and confirmed purchased capacity if checkout succeeds.

**Before you start**

Agency and direct Client Owners or authorized billing members. Use the paying workspace's billing access. Confirm whether you are acting for the agency or a direct Client before beginning checkout.

Image: `article-3-b2b-authority`. Alt: Illustration of blue and gold chess pieces around a connected AI symbol.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Open Billing**: Open the Billing area from Account Settings or the dedicated billing view offered to your membership.

2. **Review the current allowance**: Inspect the current subscription or beta status, project allowance and any purchased packages before adding capacity.

3. **Check billing details**: Review company, billing email, address and VAT information where the form offers them. Save accurate details before a purchase.

4. **Choose additional capacity**: Use Add a project where available and review the offered tier and checkout summary. Read price, tax and renewal information before paying.

5. **Confirm activation**: After checkout, return to the app and confirm the subscription or capacity state has updated. Use View your latest invoice if it is available; if activation is pending, seek support rather than paying again.

**What to expect**

The workspace has a clearly understood billing state and confirmed purchased capacity if checkout succeeds.

**Important limitations**

A project pack adds projects, not parallel runtime environments or extra team seats. Tax depends on billing details and configured Stripe Tax. An agency-managed Client does not independently manage the agency subscription.

Tip: Keep the payment confirmation if activation is delayed. Do not use a second checkout to resolve an uncertain first payment.

### Archive and restore an agency's client scope

Reserved id: `review-agency-client-archive`; 3 min read; order 370.

The agency can pause and restore the client scope without deleting the client's project work.

**Before you start**

Agency Owners with client management access. Save any work and confirm the client scope you intend to pause. This is agency client management, not the Project Hub's currently incomplete project Archive action.

Image: `article-1-pr-ai`. Alt: Illustration of a professional collaborating with a glowing AI figure beside analytical displays.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Open the agency**: From Platform Home, open the agency's client management area. Check the active agency name.

2. **Review the client**: Find the client in Your Client Projects or Your client accounts, depending on your agency type. Confirm the exact company before pausing access.

3. **Archive deliberately**: Choose Archive on the client card and read the confirmation. Confirm only if the client should be paused; existing projects remain available to the agency.

4. **Find the paused client**: Review Archived Client Projects or Archived clients in this same management area.

5. **Restore when appropriate**: Choose Restore on the intended archived client and confirm. Reopen the client scope to check that it is active again.

**What to expect**

The agency can pause and restore the client scope without deleting the client's project work.

**Important limitations**

For an independently accessible client, archiving blocks sign-in until restoration. Agency Partner clients remain agency-managed even after restoration. This does not establish that individual project archiving works.

Tip: Do not choose Delete when your intention is only to pause a client.

### Set up personal two-factor authentication

Reserved id: `review-personal-mfa`; 3 min read; order 380.

Your personal authenticator is enabled after proof, with recovery codes available for a verified recovery.

**Before you start**

Signed-in Agency and Client members. Have an authenticator app and a safe place to store recovery codes. Sign in as yourself, not as another workspace member.

Image: `article-1-pr-ai`. Alt: Illustration of a professional collaborating with a glowing AI figure beside analytical displays.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Open personal security**: Open Account Settings and the two-factor section. Read the state of your own factor, not another member's enrollment.

2. **Start enrollment**: Use the offered enable/setup action. Scan the displayed QR code in your authenticator app, or use the manual setup key if scanning is unavailable.

3. **Confirm a current code**: Enter the 6-digit code from the authenticator and complete the confirmation. If a code is rejected, check that your device clock is correct and use a fresh code.

4. **Keep recovery codes**: Store the displayed recovery codes securely outside AIO Fusion. They are personal secrets and must never be copied into an article, project brief or support message.

5. **Finish and check**: Choose Done after retaining the codes. Confirm the security panel shows the enabled state before closing the account settings.

**What to expect**

Your personal authenticator is enabled after proof, with recovery codes available for a verified recovery.

**Important limitations**

Authentication factors and trusted devices are not shared with the workspace team. Losing both the authenticator and recovery information requires the app's verified recovery process, not a colleague's codes. Exact setup control wording needs final editorial review.

Tip: Keep a working sign-in path until enrollment is confirmed; a scanned QR code alone does not mean two-factor authentication is enabled.

### Update payment details or cancel at renewal

Reserved id: `review-billing-payment-renewal`; 3 min read; order 390.

Payment or cancellation changes are confirmed in the provider portal and can be checked against the app's billing state.

**Before you start**

Owners and authorized billing members. Use the workspace with the relevant subscription. Read its current renewal date and funded project/package details before making a change.

Image: `article-3-b2b-authority`. Alt: Illustration of blue and gold chess pieces around a connected AI symbol.. Caption: Existing AIO Fusion editorial illustration, not a platform screenshot or measured result.

**Follow these steps**

1. **Open the subscription**: Open Billing and review the subscription and invoice information for the active company.

2. **Review the invoice**: Choose View your latest invoice if available and check the company, amount and tax information.

3. **Update payment details**: Where offered, choose Update payment method to open the Stripe customer portal. Complete the portal's confirmation and return to the app.

4. **Cancel deliberately**: If you intend to end the subscription, use Cancel subscription and review the portal's effective date and confirmation before completing the cancellation.

5. **Confirm retained access**: Return to Billing and check the updated state. For package changes, read whether the change takes effect immediately or at renewal and what happens to the funded project.

**What to expect**

Payment or cancellation changes are confirmed in the provider portal and can be checked against the app's billing state.

**Important limitations**

Tier upgrades can be charged immediately at the shown prorated amount; downgrades take effect at renewal. Cancelling a package retires its funded project at the end of the paid period. A successful portal launch alone is not a completed change.

Tip: Keep the confirmation and effective date. Do not confuse a scheduled cancellation with an immediate refund or deletion.
