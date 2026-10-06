export type LegalDocumentKind = "website-terms" | "privacy-policy" | "cookie-policy" | "legal-review";
export type LegalSection = { title: string; paragraphs: string[] };
export type LegalDocument = { title: string; introduction: string; sections: LegalSection[] };
const company = "AIO Fusion Ltd (company number 17303930), registered in England and Wales at Amelia House, Crescent Road, Worthing, West Sussex, United Kingdom, BN11 1RL. Contact: info@aiofusion.ai.";

export const legalDocuments: Record<LegalDocumentKind, LegalDocument> = {
  "website-terms": {
    title: "Website Terms of Use",
    introduction: "Proposed terms for the public AIO Fusion website, separate from subscription and platform terms. Prepared 6 October 2026 for business and legal review; not an approved replacement agreement.",
    sections: [
      { title: "1. Who we are and the scope of these terms", paragraphs: [
        company,
        "These proposed terms concern browsing our public website, reading its resources and making enquiries. Access to the subscription platform, paid services, trials, billing and customer-uploaded content is governed by the applicable platform agreement and any agreed order form. These website terms do not change an existing platform contract.",
        "Our Privacy Policy explains personal-data processing. Our Cookie Policy explains cookies and similar technologies. Those notices do not require you to waive privacy rights.",
      ] },
      { title: "2. Using the website", paragraphs: [
        "You may use the website for lawful purposes. You must not attempt unauthorised access, introduce malicious software, interfere with availability, impersonate another person or use website information unlawfully. Any information you submit must be accurate to the best of your knowledge and you must have authority to provide it.",
        "Do not collect personal information from the website for unlawful unsolicited marketing. Automated access must respect applicable law and the permissions we expressly provide for search indexing or other authorised access. Permission to index public pages is not permission to access private platform data.",
      ] },
      { title: "3. Intellectual property and permitted use", paragraphs: [
        "We or our licensors own rights in the website's design, branding and original materials. You may view pages and print or download reasonable extracts for your own internal reference, retaining copyright notices and attribution.",
        "Unless permitted by law or written permission, you must not reproduce substantial website materials commercially, present our content as your own, redistribute paid materials or imply our endorsement. Third-party trademarks and source materials remain the property of their owners.",
      ] },
      { title: "4. Information, AI and no guarantee of results", paragraphs: [
        "Website content describes our services and provides general educational information. It is not tailored professional advice. Information, examples and AI-assisted material may be incomplete, inaccurate or become outdated; assess suitability and verify important facts before relying on them.",
        "We do not promise or guarantee search rankings, inclusion or citation in AI answers, media coverage, journalist responses, publication, traffic, leads, sales, revenue, return on investment or any particular business outcome.",
        "Audit scores, examples, benchmarks and recommendations are indicators produced using particular inputs and methodologies, not certifications or predictions of success. Results depend on many factors outside our control, including third-party systems, competitors, editorial decisions and your implementation.",
        "Testimonials and case studies describe particular experiences, not a promise of typical or future results. These statements do not permit misleading advertising or exclude obligations that arise from express contractual commitments.",
      ] },
      { title: "5. Website availability and changes", paragraphs: [
        "We may update, suspend or withdraw public website content and cannot guarantee uninterrupted, error-free or permanently available access. Take reasonable precautions, including maintaining your own copies of information you need.",
        "This provision concerns the public website; it does not override availability commitments, remedies or notice obligations agreed for paid services.",
      ] },
      { title: "6. Links and third-party material", paragraphs: [
        "External links are provided for convenience. We do not control external websites or third-party services, and a link does not imply endorsement. Their terms and privacy practices apply when you use them.",
        "Do not frame our website or create a link that falsely suggests a partnership, approval or endorsement. We may ask you to remove a misleading link.",
      ] },
      { title: "7. Liability and rights that remain protected", paragraphs: [
        "Nothing in these proposed terms excludes or limits liability for death or personal injury caused by negligence, fraud or fraudulent misrepresentation, or any liability or statutory right that cannot lawfully be excluded or limited. Nothing waives your rights or remedies under data-protection law.",
        "For business users, and only to the extent lawful and reasonable, we propose excluding indirect or consequential losses arising from use of the public website, and losses of business profits, anticipated savings, business opportunities or goodwill. This is not an exclusion of liability for every possible loss.",
        "For consumers, mandatory protections remain unaffected. We do not propose excluding losses where doing so would be unfair or unlawful. Any consumer-facing limitation must be checked by a legal adviser before adoption.",
        "No financial liability cap has been adopted in this website draft. Any proposed cap requires review against the use of the site, foreseeable risks, insurance and applicable law. Website limitations cannot silently reduce rights under a paid platform contract.",
      ] },
      { title: "8. Enquiries and feedback", paragraphs: [
        "Submitting an enquiry or demo request does not itself create a paid-services contract or guarantee that a request will be accepted. Do not submit confidential information unless an appropriate arrangement is in place, or personal data you are not authorised to share.",
        "We use personal information submitted through forms as described in the Privacy Policy. An enquiry is not automatically permission to send unrelated marketing.",
      ] },
      { title: "9. Changes, governing law and contact", paragraphs: [
        "If approved, the final terms should identify their effective date. Future changes should be shown with an updated date and should not retrospectively remove accrued rights. Material contractual changes may require separate notice or acceptance.",
        "The proposed governing law is the law of England and Wales. Business disputes would be subject to the courts of England and Wales. Consumers retain mandatory protections and any right to bring proceedings in another court available under applicable law.",
        "Questions about these proposed website terms can be sent to info@aiofusion.ai. The final publication and acceptance wording must be approved before these drafts are treated as operative terms.",
      ] },
    ],
  },
  "privacy-policy": {
    title: "Privacy Policy",
    introduction: "Expanded privacy notice prepared 6 October 2026 for legal and factual review. It covers website visitors, enquiries, subscribers, platform account administration and the journalist contact database. Existing statutory privacy rights continue to apply.",
    sections: [
      { title: "1. Who is responsible for your information", paragraphs: [
        company,
        "AIO Fusion is responsible as controller for its website administration, enquiries, account and billing administration and the professional media database it maintains for its own purposes.",
        "Personal information customers upload solely for processing on their instructions may instead be processed by AIO Fusion as a processor. Customers remain responsible for their own lawful use of that information. The applicable data-processing agreement should describe these roles, instructions and safeguards. A customer's independent outreach activity is not automatically processing on our behalf.",
        "Review note: confirm the controller/processor allocation for each feature and each category of shared or workspace-owned media information before final approval. Ownership of a database record is not, by itself, a legal determination of controller status.",
      ] },
      { title: "2. Who this notice covers", paragraphs: [
        "This notice covers website visitors; people contacting us or requesting demonstrations; account holders, team members and billing contacts; marketing subscribers where subscriptions are offered; journalists and other professional media contacts; and people making privacy requests.",
        "The website currently describes its insights subscription as coming soon. The marketing-subscription paragraphs below explain the proposed approach and must be checked before that service launches. Paying platform subscribers are covered separately by the account and billing sections.",
      ] },
      { title: "3. Information we collect", paragraphs: [
        "Website and enquiry information may include names, work email addresses, company details, enquiry content, browser/device information, pages visited, referral information and security logs. Analytics information is collected only when the visitor permits analytics through our cookie controls.",
        "Platform administration may involve names, emails, roles, workspace membership, authentication and security records, billing information, payment status, support correspondence and service-usage records. Payment-card processing is handled through the payment provider rather than requiring customers to send card details to us.",
        "Project information may include audit inputs, campaign briefs, drafts, saved results, planner entries and outreach records. Some of this may identify spokespeople, staff, journalists or other individuals.",
        "Professional media information may include names, roles, publications, professional contact details, beats/topics, business locations, professional profiles, published work, source links and verification or provenance records. We seek to keep this relevant to professional activity. Do not intentionally add private contact information, sensitive personal information or children's information without a separately assessed lawful basis.",
        "Privacy cases may contain request details, proportionate identity-verification information, correspondence and records of decisions. Please do not send identity documents unless we specifically request them through an appropriate channel.",
      ] },
      { title: "4. Where information comes from", paragraphs: [
        "Information may come directly from you, your organisation, authorised workspace users, public publication websites and professional profiles, publicly accessible published work, supplied or licensed media datasets, and research or verification sources.",
        "Information being publicly available does not remove data-protection obligations. We should identify and retain source provenance where appropriate and review accuracy and permitted use.",
        "Review note: confirm the actual dataset suppliers, source permissions and collection practices. Indirectly obtained information requires an assessed transparency process, normally within one month, or earlier when first contacting the person or first disclosing their information. Any relied-on exception needs documented justification; placing this page online alone is not proof those duties have been fulfilled.",
      ] },
      { title: "5. Purposes and proposed lawful bases", paragraphs: [
        "Enquiries, demonstrations and business relationship administration: responding to requests and managing professional relationships, generally legitimate interests; steps requested before entering an individual contract may instead use the contractual basis.",
        "Account and paid-service administration: operating access, subscriptions and agreed services. Performance of a contract applies where the individual is party to that contract; legitimate interests may apply to an organisation's employees or representatives. Accounting and legally required recordkeeping use legal obligations where applicable.",
        "Security, abuse prevention and service reliability: proportionate legitimate interests in protecting users and systems, or applicable legal obligations. Cookie/storage requirements must be assessed separately from the UK GDPR lawful basis.",
        "Optional website analytics: consent through the site's cookie controls. We have chosen opt-in rather than assuming an analytics exemption applies. Consent can be withdrawn through Cookie preferences.",
        "Marketing subscriptions, when launched: the appropriate consent or other permitted marketing basis, assessed for the recipient and communication channel. A business email address does not automatically remove electronic-marketing rules. An enquiry does not automatically subscribe someone.",
        "Professional media research and database provision: proposed legitimate interests in helping communications teams identify relevant professional contacts and supporting accurate, relevant media research. This requires a documented purpose, necessity and balancing assessment that considers journalists' reasonable expectations, rights and potential impact.",
        "Privacy requests and suppression records: complying with legal obligations and maintaining proportionate evidence of compliance. Do not use rights-request information for unrelated marketing.",
        "Review note: these proposed bases require business verification and legal approval. The ordinary legitimate-interests assessment must not be replaced by an assumption that professional contact data is exempt or that a recognised-legitimate-interest category automatically applies.",
      ] },
      { title: "6. Journalist contacts, database access and outreach", paragraphs: [
        "Authorised platform users may access professional media information for relevant research and communications. Access is permission-controlled; we do not provide a public name/email lookup that confirms whether a person is in the database.",
        "Paid access to professional contact information is a form of disclosure to customers. It should be explained plainly rather than obscured by an unqualified statement that personal data is never sold or shared. This does not give customers permission for unlawful spam, harassment, unrestricted resale or unrelated use.",
        "AIO Fusion's own controller responsibilities are distinct from customers' responsibilities for their contact lists, outreach choices and subsequent processing. Customer terms and data-processing arrangements must support this distinction.",
        "AI-suggested relevance, contact matches or inferred topics are not guaranteed facts. Source verification and human review are needed before relying on them. Review whether any profiling requires additional explanation or safeguards. This notice does not authorise solely automated decisions producing legal or similarly significant effects.",
        "Journalists can use the Journalist privacy rights page or email info@aiofusion.ai to ask for information, correction, objection or removal. A request acknowledgement does not confirm that a matching record exists. Verification and a properly scoped review are needed before disclosure or changes.",
      ] },
      { title: "7. Service providers and other recipients", paragraphs: [
        "Relevant information may be processed by hosting, database and storage providers; transactional email and communications providers; payment and billing providers; security and support providers; and AI providers used for requested audits, research or content generation. The current project uses Replit infrastructure, Resend, Stripe, Google Analytics and OpenAI/Anthropic integrations. Google or Microsoft may process information when their sign-in option is used.",
        "Providers' legal roles depend on the service and contract; not every provider is a processor for every activity. Authorised customers may receive media information as described above. Professional advisers, regulators or authorities may receive information where necessary and legally justified, including in a properly assessed business transfer.",
        "We should send AI providers only the information relevant to the requested function. Their retention, model-training and downstream processing terms depend on the contracted service, integration and configuration.",
        "Review note: verify the actual provider agreements, subprocessors and settings. This draft deliberately does not repeat the previous blanket promise that all AI providers are contractually prevented from training on data, because that promise has not been established by this code review.",
      ] },
      { title: "8. International processing and transfers", paragraphs: [
        "Some services may involve processing outside the UK or EEA. The relevant hosting locations, recipients and transfer arrangements must be verified rather than inferred from a provider's brand or our company address.",
        "Where transfer safeguards are required, the applicable mechanism may include an adequacy decision or appropriate contractual safeguards and associated assessments. You may contact info@aiofusion.ai for information about relevant safeguards, subject to appropriate redactions.",
        "Review note: complete the transfer inventory and verify the actual mechanisms before final publication. This notice is not evidence that an IDTA, UK Addendum or EU Standard Contractual Clauses have already been signed for every provider.",
      ] },
      { title: "9. How long information is kept", paragraphs: [
        "Retention should be tied to each purpose: active accounts and service delivery; enquiries and business follow-up; legally required accounting records; proportionate security records; professional media-data relevance and accuracy; privacy-case evidence; and suppression records needed to prevent renewed unwanted processing.",
        "Data that is no longer needed should be deleted or anonymised, subject to applicable legal duties, disputes, valid holds and the handling of backups. Deleting an active record does not necessarily remove it instantly from every backup; retained copies should remain protected and not be reintroduced into ordinary use without appropriate safeguards.",
        "Cookie preferences are retained for up to 180 days before we request a fresh choice. Accepted Google Analytics cookies are configured for a one-year lifetime, which may refresh during permitted use. Other cookie lifetimes are described in the Cookie Policy.",
        "Review note: a detailed retention schedule, including media review intervals, dormant accounts, enquiries, logs, financial records, backups and rights cases, still needs approval. This draft does not invent deletion deadlines that the current system cannot meet.",
      ] },
      { title: "10. Your rights and how to exercise them", paragraphs: [
        "Depending on the applicable law and processing, you may have rights to access, correct or erase information; restrict processing; object to processing based on legitimate interests; receive certain data in a portable format; withdraw consent; and challenge relevant automated decisions. Not every right applies in every circumstance.",
        "Where processing is for direct marketing, you can object to that use at any time. Withdrawing consent does not retrospectively make earlier consent-based processing unlawful.",
        "Contact info@aiofusion.ai or use the Journalist privacy rights form for media-data requests. We may request proportionate verification or clarification to protect information from unauthorised disclosure. We aim to handle requests within the applicable statutory period, normally one month; legally permitted extensions, pauses or exceptions must be explained where applicable.",
        "Where a customer is the relevant controller, we may direct you to that customer and support the request as required by our agreement. This does not prevent you from asking AIO Fusion about information for which it is itself responsible.",
        "You can complain to the UK Information Commissioner's Office at ico.org.uk or another relevant supervisory authority. Contacting us first may help resolve concerns, but it is not a condition of exercising your right to complain.",
      ] },
      { title: "11. Marketing choices", paragraphs: [
        "If an insights or other marketing subscription is offered, its collection point should explain what is sent, who sends it and the basis used. Marketing emails should include an appropriate unsubscribe route. Necessary account, security and billing communications are separate from marketing.",
        "The insights subscription is not currently presented as a live service. The final policy and unsubscribe handling must be confirmed before launch. Contact info@aiofusion.ai about an unwanted communication; we should retain only proportionate suppression information needed to respect the choice.",
      ] },
      { title: "12. Cookies, external content and security", paragraphs: [
        "The Cookie Policy explains browser storage and the available controls. Optional Google Analytics is held back until accepted. External websites, sign-in providers and payment pages may apply their own notices when you choose to use them.",
        "The service uses measures such as HTTPS, authenticated access and workspace-scoped permissions. No system can be guaranteed completely secure. Our security descriptions should be checked against current operations and must not promise absolute protection or imply certification we do not hold.",
      ] },
      { title: "13. Changes and contact", paragraphs: [
        "An approved notice should show its effective date and material changes should be communicated appropriately. New purposes may require additional notice, a new assessment or consent before processing starts.",
        "This expanded draft is awaiting legal and factual approval. Questions, privacy requests or requests for more detailed provider information can be sent to info@aiofusion.ai or the registered address above.",
      ] },
    ],
  },
  "cookie-policy": {
    title: "Cookie Policy",
    introduction: "Prepared 6 October 2026. This review draft describes the cookie controls implemented with this update. The inventory is based on project code, not an exhaustive production browser scan.",
    sections: [
      { title: "1. What cookies and similar technologies do", paragraphs: [
        "Cookies are small records stored by a browser. Similar technologies include local storage and session storage, which can remember preferences or retain working application state. A technology's legal treatment depends on its purpose, not simply its name.",
        "AIO Fusion Ltd operates this website. Contact info@aiofusion.ai about browser storage or consult the Privacy Policy for wider information about personal data.",
      ] },
      { title: "2. Essential operation and user-requested features", paragraphs: [
        "Authentication and security cookies support sign-in, temporary verification and secure account functions. Relevant application storage can support requested features, saved working state and remembering your preference. This is not optional audience measurement.",
        "The Cookie preferences control does not switch off necessary authentication/security functionality. You can remove browser storage through browser settings, but doing so may sign you out, forget preferences or remove locally stored work. Server-stored data is not automatically deleted by clearing browser storage.",
        "Review note: assess each storage purpose against the applicable exception. Do not classify every application local-storage key or every third-party cookie as essential without checking its purpose.",
      ] },
      { title: "3. Optional Google Analytics", paragraphs: [
        "We offer Google Analytics to understand website use and improve the site. It may collect browser/device information, page activity, referral information and related technical information according to Google's service and our configuration.",
        "The Analytics loader is not added until you choose Allow analytics or enable Analytics and save your preferences. We do not use denied-consent analytics pings as an alternative before acceptance. Essential only and the close button both leave analytics off.",
        "Our configuration denies advertising storage, advertising user data and advertising personalisation. This code setting is not proof of all Google account-side settings; those settings and any linked products still require review.",
        "We have chosen an opt-in approach. We are not relying on the UK's limited statistical-purpose exception. That exception has conditions, including transparent information and a simple free objection route, and must not be assumed to cover every Google Analytics configuration or visitors in other jurisdictions.",
      ] },
      { title: "4. Your choices and changing them", paragraphs: [
        "Use Essential only to decline optional analytics. Use Allow analytics to permit it. Preferences lets you view the categories and choose whether Analytics is enabled. Essential operation remains available without analytics consent.",
        "You can reopen Cookie preferences from the website footer or the button on this page. Turning Analytics off disables further collection through our integration and attempts to clear accessible first-party Google Analytics cookies. It does not delete information Google previously received, and we cannot delete third-party cookies that the browser does not allow this site to access.",
        "Your preference is stored in local storage for up to 180 days, then a fresh choice is requested on a subsequent visit. Clearing storage also resets the choice. If browser storage is blocked, your choice applies within the current tab and may be requested again on a later visit.",
      ] },
      { title: "5. Code-based storage inventory", paragraphs: [
        "aio.cookiePreferences.v1 - first-party local storage; records analytics choice, version and time; expires for consent purposes after 180 days. Used only to remember this choice.",
        "aio_sid - first-party authentication cookie; up to 30 days. HttpOnly session access for the platform. aio_admin_sid - administrator impersonation restoration cookie; up to four hours, only when that feature is used.",
        "aio_delete_confirmation - first-party security confirmation cookie; up to ten minutes when the relevant sensitive-action confirmation is used. Sign-in flows may also use short-lived OAuth, MFA or other verification cookies; their exact names and lifetimes require inclusion in the final runtime inventory.",
        "_ga and _ga_* - optional first-party Google Analytics identifiers when analytics is allowed; configured with a one-year lifetime that may refresh during permitted use. Exact cookies should be checked against the live Google configuration and browser behaviour.",
        "The homepage demo preference and application working-state keys use browser storage. The demo preference remembers a user-requested dismissal; other keys depend on the feature and session. Their persistence and classification need a final purpose-by-purpose inventory. They are not all analytics cookies.",
        "Payment, external sign-in, embedded content and hosting/proxy services may introduce additional technologies when used. Review the public site and those journeys in the deployed environment before approving this inventory as complete.",
      ] },
      { title: "6. Browser settings and policy updates", paragraphs: [
        "Most browsers let you inspect, block or delete cookies and website storage. Browser controls may be more restrictive than this site's category controls. Clearing necessary storage can disrupt sign-in or unsaved work.",
        "We should review this policy when providers, features or configurations change. The legal adviser should verify the classification and completeness of the final inventory and the behaviour of consent and withdrawal on the published site.",
      ] },
    ],
  },
  "legal-review": {
    title: "Legal Review Pack",
    introduction: "Comparison and proposed protections for Patch, Natalie and the legal adviser. Prepared 6 October 2026. This page is a review document, not a legal opinion or an automatically adopted platform amendment.",
    sections: [
      { title: "1. What existed before this update", paragraphs: [
        "The Terms & Conditions page combined the website and platform. It already covered accounts, acceptable use, human use, fair usage, AI accuracy, customer content, fees, availability, termination, liability and governing law. It excluded some indirect losses but did not set a financial liability cap or explicitly list the commercial outcomes that are not guaranteed.",
        "The Privacy Policy covered accounts, project information, usage, enquiries, AI providers, transfers, retention, rights, security and cookies. It did not adequately distinguish website subscribers, AIO Fusion's own journalist database, customer-controlled information or paid disclosures of media contacts.",
        "A Journalist privacy rights page and request flow already existed. These provide useful rights-handling functionality but do not substitute for a complete privacy notice, lawful-basis assessments, source permissions or indirect-collection transparency.",
        "Cookies were mentioned briefly in the Privacy Policy. Google Analytics was loaded directly in the HTML before an app-level consent choice. There was no app-level category preference mechanism found during this review.",
      ] },
      { title: "2. What has been put together", paragraphs: [
        "Separate Website Terms of Use, an expanded Privacy Policy, a Cookie Policy and this comparison/review pack are available for review. The existing platform terms remain accessible separately; these review documents do not automatically substitute a new contract.",
        "The website draft expressly avoids guarantees of AI citation, rankings, coverage, journalist replies, traffic, leads, sales, revenue or return on investment. It distinguishes indicators and examples from promises of success.",
        "Cookie controls keep optional Google Analytics off before acceptance, offer an equally accessible essential-only choice, store the choice, allow changes from the footer, and avoid a full-screen consent overlay.",
        "The privacy draft distinguishes own-controller activity from customer-instructed processing, professional media sources and recipients, subscriber activity, rights and areas requiring factual confirmation. It removes unsupported blanket assurances rather than inventing provider contracts, transfer arrangements or deletion deadlines.",
      ] },
      { title: "3. Proposed platform no-results clause - legal approval required", paragraphs: [
        "Suggested wording: AIO Fusion will provide the contracted service with reasonable care and skill, subject to the applicable agreement. It does not guarantee any particular search ranking, inclusion or citation in an AI answer, media coverage, journalist response, publication, traffic, lead, sale, revenue, return on investment or other business outcome.",
        "Suggested wording: Audits, scores, recommendations, contact relevance and AI-generated material are indicative outputs based on the information and methodology available at the time. They are not certifications, guarantees or substitutes for professional judgement. AI outputs and source information may be inaccurate, incomplete or outdated. Customers must review and verify material before publication or outreach.",
        "Suggested wording: Results depend on factors outside AIO Fusion's control, including third-party models and services, search systems, editorial decisions, competitors and customer implementation. Nothing in this clause removes an express service commitment, agreed remedy or liability that cannot lawfully be excluded.",
        "Apply approved wording consistently to the platform agreement, order forms, sales materials, demos and any customer-facing claims. A disclaimer cannot cure a contradictory promise elsewhere.",
      ] },
      { title: "4. Proposed platform liability framework - not yet adopted", paragraphs: [
        "Preserve express carve-outs for death/personal injury caused by negligence, fraud/fraudulent misrepresentation and liabilities or statutory rights that cannot lawfully be excluded or capped. Privacy notices must not require individuals to waive data-protection rights.",
        "For business contracts, propose exclusions for indirect or consequential loss and carefully defined business losses, subject to applicable law and reasonableness. The adviser must assess losses that might be direct, insurance, standard-term incorporation and whether an exclusion would defeat the service's core obligation.",
        "Discussion proposal only: an aggregate general cap linked to fees paid or payable for the affected services during the preceding 12 months, with a separately agreed minimum for free/beta or low-fee services. No amount or multiplier has been approved. The cap should be a clearly defined aggregate over an agreed period, not an unlimited reset per claim.",
        "Consider whether confidentiality, data-protection/security or intellectual-property liabilities require a separate higher cap, an indemnity or a different treatment. Do not assume those liabilities can all be put under a very low general cap. Regulatory fines and third-party statutory rights need specific advice.",
        "Any indemnity for customer-uploaded unlawful material or misuse should be proportionate, tied to customer responsibility and subject to reasonable claims-handling, mitigation and allocation of responsibility. Do not add an unlimited blanket indemnity without advice.",
        "Fair usage, automatic suspension, refunds, termination and data return/deletion provisions also need review. Customer negligence or poor implementation should not become a blanket excuse for AIO Fusion's own breach. Consumer rights cannot simply be removed by calling everyone a business user.",
      ] },
      { title: "5. Priority legal and business sign-offs", paragraphs: [
        "Confirm corporate details, target jurisdictions, whether customers are exclusively businesses, contractual acceptance and the hierarchy between website terms, platform terms, order forms and a data-processing agreement.",
        "Complete legitimate-interests assessments for the journalist database, source/licensing checks, the indirect-collection notification approach and any documented exemption; assess whether a DPIA is appropriate. Review profiling and customer access/outreach terms.",
        "Confirm actual suppliers and subprocessors, AI retention/training terms, payment-provider roles, hosting locations, transfer mechanisms and supporting contracts. The code alone cannot establish these.",
        "Approve retention and deletion schedules and check that rights-request, correction, suppression and backup procedures can meet them. Confirm ICO registration/fee obligations, privacy responsibility and whether any representative or DPO requirement applies.",
        "Review marketing opt-in and unsubscribe handling before launching insights subscriptions; distinguish corporate contacts, sole traders and individual subscribers where relevant.",
        "Check the deployed cookie inventory, consent expiry, rejection and withdrawal, linked Google account settings, third-party embeds, proxy/hosting technologies and any region-specific requirements.",
        "Approve the no-results wording, exclusions, cap structure and insurance alignment. Obtain legal sign-off before converting review drafts into adopted agreements; plan customer notice or renewed acceptance for material changes.",
      ] },
      { title: "6. Review limits and source basis", paragraphs: [
        "This comparison was based on the project implementation and current public policy components, not a complete production cookie scan, supplier-contract audit, independent security audit or legal opinion. Drafting alone does not make a business compliant.",
        "The preparation consulted current ICO guidance on the right to be informed, legitimate interests and storage/access exceptions, plus sections 2 and 11 of the Unfair Contract Terms Act 1977. The updated ICO guidance recognises a conditional statistical-purpose exception; the proposed implementation uses opt-in instead of assuming that exception applies.",
        "No review email has been sent, no final liability cap has been agreed, and a review badge does not by itself determine whether a publicly displayed term would have legal effect. A qualified adviser should approve both wording and publication/acceptance arrangements.",
      ] },
    ],
  },
};
