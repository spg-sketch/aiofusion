import { db, supportFaqTable } from "..";
import { sql } from "drizzle-orm";

const FAQ_ENTRIES = [
  // ── Getting Started ──────────────────────────────────────────────────────
  {
    category: "Getting Started",
    question: "What is AIO Fusion and who is it for?",
    answer:
      "AIO Fusion is a Generative Engine Optimisation (GEO) platform built for PR and marketing professionals. It helps brands measure, plan, and improve how often they appear in AI-generated answers — from tools like ChatGPT and Claude. It's designed for agencies managing multiple clients, and for brands managing their own visibility in-house.",
    keywords: "what is aio fusion, overview, intro, who is it for, purpose, generative engine optimisation, geo platform",
    displayOrder: 10,
  },
  {
    category: "Getting Started",
    question: "How do I log in?",
    answer:
      "Go to the platform login page and enter either your username or your registered email address, plus your password. If your agency uses Google sign-in, click the Google button instead. If you've forgotten your password, contact your agency admin or platform support.",
    keywords: "login, sign in, password, username, email, google, access, forgot password",
    displayOrder: 20,
  },
  {
    category: "Getting Started",
    question: "What's the difference between an Agency account and a Client account?",
    answer:
      "An Agency account can create and manage multiple Client workspaces under it — think of it as the parent. A Client account is a single brand workspace. Agencies see all their clients' projects; clients only see their own. If you're an in-house team with a single brand, you'll typically be set up as a Client.",
    keywords: "agency, client, account type, difference, roles, hierarchy, workspace, sub-account",
    displayOrder: 30,
  },
  {
    category: "Getting Started",
    question: "How do I create a new project?",
    answer:
      "From the Project Hub, click \"New Project.\" Give it a name and your brand's website URL. Once created, start with the Project Set-Up (Intake Form) to give the platform the brand context it needs to run audits and generate content accurately.",
    keywords: "new project, create project, project hub, add project, start",
    displayOrder: 40,
  },
  {
    category: "Getting Started",
    question: "Can I have more than one project?",
    answer:
      "Yes. Each project represents a separate brand or campaign. You can switch between projects using the project selector at the top of the platform. The number of projects available depends on your account plan.",
    keywords: "multiple projects, more than one, project limit, switch projects, plan",
    displayOrder: 50,
  },
  {
    category: "Getting Started",
    question: "How do I switch between clients or projects?",
    answer:
      "Agency users see a client/project selector when they log in. You can also switch at any time using the dropdown at the top of the screen. Each switch loads that client's workspace in full.",
    keywords: "switch client, switch project, change project, project selector, dropdown",
    displayOrder: 60,
  },

  // ── Project Set-Up ───────────────────────────────────────────────────────
  {
    category: "Project Set-Up",
    question: "What is the Intake Form and why do I need to fill it in?",
    answer:
      "The Intake Form is the foundation of everything in AIO Fusion. It captures your brand's messaging, audience, spokespeople, trust signals, and common questions. The more completely it's filled in, the more accurate and tailored your audits, content, and planner outputs will be. Think of it as the single source of truth for the brand.",
    keywords: "intake form, project set-up, setup, fill in, why, foundation, brand context",
    displayOrder: 10,
  },
  {
    category: "Project Set-Up",
    question: "How long does it take to fill in the Intake Form?",
    answer:
      "A thorough first pass takes roughly 30–60 minutes. You don't need to complete it all at once — your progress is saved automatically. We recommend filling in at least the Earned Media / Message Framework section before running your first audit.",
    keywords: "how long, intake form time, complete, save progress, autosave",
    displayOrder: 20,
  },
  {
    category: "Project Set-Up",
    question: "What is 'GEO gold' in the FAQ & Customer Questions section?",
    answer:
      "GEO gold refers to the high-value, specific, authoritative information that helps AI answer engines cite your brand. Examples include unique statistics your company owns, common misconceptions in your industry, or precise answers to questions your customers ask before buying. The more of this you add, the stronger your content and audit performance.",
    keywords: "geo gold, faq, customer questions, authoritative, statistics, citations, ai visibility",
    displayOrder: 30,
  },
  {
    category: "Project Set-Up",
    question: "What does the 'Optimise Messages' button do?",
    answer:
      "It sends your raw boilerplate or key messages to the AI engine, which rewrites them into a cleaner, more authoritative format suited for AI citation. Always review the output — it's a starting point, not a final draft.",
    keywords: "optimise messages, key messages, ai rewrite, boilerplate, message framework",
    displayOrder: 40,
  },
  {
    category: "Project Set-Up",
    question: "Can I update the Intake Form after running audits?",
    answer:
      "Yes, and we encourage it. Updating the form improves future audits and content. It won't retroactively change saved audit results.",
    keywords: "update intake, edit intake form, after audit, change answers",
    displayOrder: 50,
  },
  {
    category: "Project Set-Up",
    question: "What are spokespeople used for?",
    answer:
      "Spokespeople added in the Intake Form (with their LinkedIn profiles) are used by the Content Creator and Content Optimiser to attribute quotes accurately and build individual authority signals. AI engines are increasingly citing named experts, so this matters for visibility.",
    keywords: "spokespeople, spokesperson, linkedin, quotes, authority, experts, named individuals",
    displayOrder: 60,
  },

  // ── LLM Check / Earned Media Audit ──────────────────────────────────────
  {
    category: "LLM Check / Earned Media Audit",
    question: "What does the LLM Check audit actually do?",
    answer:
      "It sends a set of real-world industry queries to both ChatGPT (OpenAI) and Claude (Anthropic) and records whether your brand is mentioned in the answers. It captures mention rates, how prominently the brand appears, which competitors are also mentioned, and any narrative signals (how the AI characterises your brand).",
    keywords: "llm check, earned media audit, what does it do, chatgpt, claude, brand mentions, queries",
    displayOrder: 10,
  },
  {
    category: "LLM Check / Earned Media Audit",
    question: "How is the AI Visibility Score calculated?",
    answer:
      "It's the percentage of live AI probes (across both models) that returned a mention of your brand. A score of 100% means every query triggered a mention; 0% means none did. The score is a direct measure of current AI discoverability, not a prediction.",
    keywords: "ai visibility score, how calculated, percentage, probes, mention rate, score",
    displayOrder: 20,
  },
  {
    category: "LLM Check / Earned Media Audit",
    question: "How long does an LLM Check audit take?",
    answer:
      "Typically 3–8 minutes depending on the number of queries and current API response times. A progress bar and estimated countdown are shown throughout.",
    keywords: "how long, audit time, duration, progress bar, countdown, minutes",
    displayOrder: 30,
  },
  {
    category: "LLM Check / Earned Media Audit",
    question: "Why do my results change between runs?",
    answer:
      "AI models are probabilistic — the same question can produce slightly different answers each time. Minor fluctuations (±5%) between runs are normal. Significant changes usually indicate a real shift in how the AI is representing your brand or industry.",
    keywords: "results change, different results, fluctuation, probabilistic, variation, why different",
    displayOrder: 40,
  },
  {
    category: "LLM Check / Earned Media Audit",
    question: "Can I re-run an audit at any time?",
    answer:
      "Yes. Note that to protect against over-use and ensure data quality, audits have a 21-day lock per audit type per project. The lock countdown is shown on the audit page and the Project Hub.",
    keywords: "re-run, rerun, audit lock, 21 day, cooldown, run again, how often",
    displayOrder: 50,
  },
  {
    category: "LLM Check / Earned Media Audit",
    question: "What are 'Narrative Signals'?",
    answer:
      "These are the recurring phrases or framings the AI uses when mentioning your brand — for example, \"a leading provider of…\" or \"known for their work in…\". They show how AI engines are characterising you right now, which is useful for spotting positioning drift.",
    keywords: "narrative signals, positioning, phrases, characterisation, framing, brand narrative",
    displayOrder: 60,
  },
  {
    category: "LLM Check / Earned Media Audit",
    question: "What are competitor mentions in the audit?",
    answer:
      "When probes are run, the AI's responses often name other companies alongside (or instead of) your brand. The audit captures these, giving you a share-of-voice picture across all probes.",
    keywords: "competitor mentions, competitors, share of voice, other brands, probes, competition",
    displayOrder: 70,
  },
  {
    category: "LLM Check / Earned Media Audit",
    question: "What does 'anchored' mean next to an audit result?",
    answer:
      "Some probes include a brief brand-clarification step before the main question, to ensure the AI is answering about the right company (especially useful for brands with common or ambiguous names). 'Anchored' means that clarification was applied.",
    keywords: "anchored, anchor, brand clarification, ambiguous name, probe, clarification step",
    displayOrder: 80,
  },

  // ── Technical GEO / Website Audit ────────────────────────────────────────
  {
    category: "Technical GEO / Website Audit",
    question: "What is the Website Visibility Audit?",
    answer:
      "It crawls your website and assesses how well it's structured for AI citation. It checks for schema markup (structured data), content architecture (answer-first formatting), technical accessibility (page speed, crawler access), and source authority signals.",
    keywords: "website visibility audit, website audit, crawl, schema markup, technical geo, structured data",
    displayOrder: 10,
  },
  {
    category: "Technical GEO / Website Audit",
    question: "What is a Technical GEO Score?",
    answer:
      "A 0–100 score summarising how 'reference-ready' your site is for AI engines. It's broken down into categories — Schema, Content Architecture, Technical Accessibility, and Source Authority — each with prioritised recommendations.",
    keywords: "technical geo score, website score, reference-ready, schema, content architecture, source authority",
    displayOrder: 20,
  },
  {
    category: "Technical GEO / Website Audit",
    question: "What does 'AI crawler access' mean?",
    answer:
      "AI companies use web crawlers (like GPTBot and ClaudeBot) to index content for their models. If your robots.txt blocks these crawlers, your content may never be included in AI training data or live search. The audit flags this immediately.",
    keywords: "ai crawler, crawler access, robots.txt, gptbot, claudebot, blocked, crawling",
    displayOrder: 30,
  },
  {
    category: "Technical GEO / Website Audit",
    question: "What schema types does the audit look for?",
    answer:
      "Primarily Organization, FAQ, and Article schema. These are the structured data types most commonly used by AI engines to extract reliable facts. Missing or malformed schema is flagged as a Critical or High priority fix.",
    keywords: "schema types, organization schema, faq schema, article schema, structured data, schema markup",
    displayOrder: 40,
  },
  {
    category: "Technical GEO / Website Audit",
    question: "The audit couldn't find my About or Services page — why?",
    answer:
      "The crawler attempts to discover key pages via your sitemap and common URL patterns. If your site uses non-standard navigation or hides links behind JavaScript, some pages may be missed. You can manually add page URLs in the audit settings if needed.",
    keywords: "page not found, about page, services page, crawler, sitemap, javascript, navigation, missing pages",
    displayOrder: 50,
  },

  // ── Content Creator ──────────────────────────────────────────────────────
  {
    category: "Content Creator",
    question: "What can the Content Creator generate?",
    answer:
      "It generates full drafts of press releases, pitches, articles, thought leadership pieces, and more — all using your brand's messaging, spokespeople, and audience context from the Intake Form.",
    keywords: "content creator, generate, press release, pitch, article, thought leadership, drafts",
    displayOrder: 10,
  },
  {
    category: "Content Creator",
    question: "How does targeting a GEO query improve my content?",
    answer:
      "In section 1.6 of the Intake Form, you'll have a set of LLM discovery, shortlist, and comparison queries. When you target one of these in the Content Creator, the generated content is specifically structured to answer that query — increasing the chance that the AI cites your piece when that question is asked.",
    keywords: "geo query, target query, llm queries, discovery, shortlist, comparison, content targeting, section 1.6",
    displayOrder: 20,
  },
  {
    category: "Content Creator",
    question: "Can I edit the content after it's generated?",
    answer:
      "Yes. All generated content is editable in-platform before you save it to the Archive or export it. You can also send it to the Content Optimiser for a further GEO-readiness pass.",
    keywords: "edit content, edit after generate, archive, export, optimiser, editable",
    displayOrder: 30,
  },
  {
    category: "Content Creator",
    question: "What is the fair usage limit for content generation?",
    answer:
      "Content generation (Creator, Optimiser, Media Research) is limited to 50 actions per project per month. Your remaining allowance is shown on the relevant pages. Audits and LLM query generation have their own separate limits.",
    keywords: "fair usage, limit, 50 actions, per month, allowance, quota, usage limit",
    displayOrder: 40,
  },
  {
    category: "Content Creator",
    question: "Why does the content sometimes feel generic?",
    answer:
      "Content quality is directly tied to how thoroughly the Intake Form is filled in. If the brand's messaging, audience personas, or 'GEO gold' sections are sparse, the AI has less to work with. Fill in more of the Intake Form and regenerate.",
    keywords: "generic content, quality, intake form, sparse, improve, better content, geo gold",
    displayOrder: 50,
  },

  // ── Content Optimiser ────────────────────────────────────────────────────
  {
    category: "Content Optimiser",
    question: "What does the Content Optimiser do differently from the Creator?",
    answer:
      "The Optimiser takes an existing piece of content (yours or AI-generated) and rewrites or enhances it specifically for AI citation readiness. It restructures for answer-first formatting, weaves in key messages, adds authority signals, and provides a Change Log explaining every edit.",
    keywords: "content optimiser, difference, creator vs optimiser, rewrite, enhance, ai citation, change log",
    displayOrder: 10,
  },
  {
    category: "Content Optimiser",
    question: "What does the Change Log show?",
    answer:
      "Every structural or copy change the Optimiser makes is logged with a reason — for example, \"Key message embedded: [message text]\" or \"Answer-first structure applied to intro paragraph.\" This makes it easy to review and approve changes.",
    keywords: "change log, changes, what changed, reason, review, approve, optimiser log",
    displayOrder: 20,
  },
  {
    category: "Content Optimiser",
    question: "Can I run the Optimiser on content I've written myself?",
    answer:
      "Yes. Paste or type your content into the input field and run the optimisation. There's no requirement to use the Content Creator first.",
    keywords: "own content, paste content, my own writing, optimise existing, no creator needed",
    displayOrder: 30,
  },

  // ── Comms Planner ────────────────────────────────────────────────────────
  {
    category: "Comms Planner",
    question: "What is the Comms Planner?",
    answer:
      "A calendar-based planning tool where you schedule your PR and marketing activities — press releases, events, campaigns, awards entries, and so on. Each item is scored with a Predicted AI Authority Impact, helping you prioritise the activities most likely to improve your AI visibility.",
    keywords: "comms planner, planner, calendar, pr plan, marketing schedule, ai authority impact, schedule",
    displayOrder: 10,
  },
  {
    category: "Comms Planner",
    question: "What is the Predicted AI Authority Impact score?",
    answer:
      "It's an estimate of how much a given PR or marketing activity type is likely to improve your brand's AI authority score, based on the type of content and its distribution potential. Press releases and in-depth articles typically score higher than social posts.",
    keywords: "predicted ai authority impact, score, impact score, press release, articles, social posts",
    displayOrder: 20,
  },
  {
    category: "Comms Planner",
    question: "Can I export the Comms Planner?",
    answer:
      "Yes — the planner supports CSV and Word export. You can also filter by date range before exporting.",
    keywords: "export planner, csv export, word export, download, filter by date",
    displayOrder: 30,
  },

  // ── Media Research & Media Database ──────────────────────────────────────
  {
    category: "Media Research & Media Database",
    question: "What does Media Research do?",
    answer:
      "Based on content you've generated or optimised, it recommends relevant journalists and publications — with a relevance-weighted Authority Score for each. Contact details are flagged as Verified, Potential, or Unverified so you know how reliable they are.",
    keywords: "media research, journalists, publications, authority score, contacts, outreach, recommendations",
    displayOrder: 10,
  },
  {
    category: "Media Research & Media Database",
    question: "What's the difference between Media Research and the Media Database?",
    answer:
      "Media Research is a dynamic tool that suggests contacts based on a specific piece of content. The Media Database is your central contact list — a repository you build over time where you can save, tag, and manage outlets and journalists for ongoing outreach.",
    keywords: "media research vs media database, difference, contact list, repository, dynamic, central",
    displayOrder: 20,
  },
  {
    category: "Media Research & Media Database",
    question: "Can I import my existing contacts into the Media Database?",
    answer:
      "Yes — the platform supports CSV import in Patrick's spreadsheet format. Use the Import button in the Media Database section.",
    keywords: "import contacts, csv import, spreadsheet, media database, import, upload contacts",
    displayOrder: 30,
  },
  {
    category: "Media Research & Media Database",
    question: "How current is the media contact data?",
    answer:
      "The platform is pre-loaded with well-known UK and international trade publications. Contact details (especially email addresses) can change frequently; always verify before outreach. The confidence rating (Verified / Potential / Unverified) reflects data freshness.",
    keywords: "contact data, how current, freshness, verified, potential, unverified, email accuracy, media contacts",
    displayOrder: 40,
  },

  // ── Archive & Reports ────────────────────────────────────────────────────
  {
    category: "Archive & Reports",
    question: "What is the Content Archive?",
    answer:
      "The Archive is a searchable library of all content generated or optimised in the platform. You can filter by spokesperson, message, content type, or date. Items can be pushed back to the Optimiser for further editing or linked to a Comms Planner entry.",
    keywords: "content archive, archive, library, searchable, filter, spokesperson, content type, history",
    displayOrder: 10,
  },
  {
    category: "Archive & Reports",
    question: "What does the Report / Measure page show?",
    answer:
      "It aggregates your audit history into a performance dashboard — tracking your AI Authority Score, Earned Authority Score, and Website GEO Score over time across six dimensions: Schema, Content Architecture, Source Authority, Earned Media, Earned Visibility, and Technical Accessibility.",
    keywords: "report page, measure, dashboard, ai authority score, earned authority, website geo score, performance, history",
    displayOrder: 20,
  },
  {
    category: "Archive & Reports",
    question: "Why does my Report page show no data yet?",
    answer:
      "The Report page populates once you've completed and saved at least one LLM Check audit and one Website Audit. Run and save both to start tracking progress.",
    keywords: "no data, report page empty, no results, run audit first, start tracking, llm check, website audit",
    displayOrder: 30,
  },

  // ── Account & Access Management ──────────────────────────────────────────
  {
    category: "Account & Access Management",
    question: "How do I add a new user to my agency?",
    answer:
      "Go to the Sub-Accounts page and click \"Add Client.\" You can set a login name and password for them. The number of client seats available depends on your plan.",
    keywords: "add user, new user, sub-account, client account, add client, seats, team member",
    displayOrder: 10,
  },
  {
    category: "Account & Access Management",
    question: "What happens if I delete a client sub-account?",
    answer:
      "Their projects are reassigned to your agency account so no data is lost. The client can no longer log in. This action is irreversible — contact support if you need to restore access.",
    keywords: "delete account, client account, sub-account, data loss, reassigned, irreversible, restore",
    displayOrder: 20,
  },
  {
    category: "Account & Access Management",
    question: "I've been locked out — what do I do?",
    answer:
      "Submit a support ticket using the form at the bottom of this help panel. Include your email address and account name. The support team will verify your identity and restore access.",
    keywords: "locked out, account locked, lost access, reset, restore access, password reset, support",
    displayOrder: 30,
  },
  {
    category: "Account & Access Management",
    question: "Can two people log in to the same account at the same time?",
    answer:
      "Yes, sessions are independent. However, if two users edit the same project simultaneously, the last save will overwrite the first. Coordinate with your team to avoid conflicts.",
    keywords: "multiple users, concurrent login, same account, simultaneous, session, conflict, team",
    displayOrder: 40,
  },
  {
    category: "Account & Access Management",
    question: "How long do sessions last before I'm logged out?",
    answer:
      "Sessions last 30 days by default. You'll receive a warning before expiry so you can stay logged in.",
    keywords: "session length, logout, expiry, 30 days, auto logout, session timeout, stay logged in",
    displayOrder: 50,
  },
  // ── Getting Started (additional) ─────────────────────────────────────────
  {
    category: "Getting Started",
    question: "How do I navigate between different tools in AIO Fusion?",
    answer:
      "All tools are accessible from the left-hand sidebar. The sidebar is organised by function: Project Set-Up at the top, then audit tools (LLM Check, Technical GEO), content tools (Creator, Optimiser, Comms Planner, Media Research), and Archive / Reports at the bottom. Click any item to go directly to that tool.",
    keywords: "navigation, sidebar, how to use, find tools, where is, menu",
    displayOrder: 70,
  },
  {
    category: "Getting Started",
    question: "Does AIO Fusion work on mobile devices?",
    answer:
      "AIO Fusion is a web platform designed primarily for desktop use. It is accessible on tablets and mobile devices via a browser, but some features — particularly the audit results tables and the Comms Planner — are best experienced on a larger screen. We recommend using a desktop or laptop for detailed work.",
    keywords: "mobile, tablet, phone, browser, responsive, desktop, works on mobile",
    displayOrder: 80,
  },
  // ── Project Set-Up (additional) ──────────────────────────────────────────
  {
    category: "Project Set-Up",
    question: "How do I add competitors to my project?",
    answer:
      "In the Intake Form, scroll to the Competitor section. Add up to 10 competitors by entering their brand name and website URL. The LLM Check audit will then measure their AI visibility alongside yours, giving you share-of-voice comparisons. Update competitors any time to keep results relevant.",
    keywords: "competitors, add competitor, competitor list, rival, share of voice, intake form competitors",
    displayOrder: 60,
  },
  {
    category: "Project Set-Up",
    question: "What are LLM Queries and how are they generated?",
    answer:
      "LLM Queries (section 1.6 of the Intake Form) are the actual questions the platform sends to ChatGPT and Claude during the LLM Check audit. They are AI-generated from your brand context and categorised into Discovery, Shortlist, and Comparison queries. You can regenerate them once every 21 days from the Project Set-Up page.",
    keywords: "llm queries, what are they, how generated, 1.6, discovery shortlist comparison, regenerate, 21 day lock",
    displayOrder: 70,
  },
  // ── Content Optimiser (additional) ────────────────────────────────────────
  {
    category: "Content Optimiser",
    question: "Can I paste in content from any source to optimise it?",
    answer:
      "Yes. The Content Optimiser accepts any text you paste in — press releases, web copy, blog posts, articles, or social posts. You don't need to have created the content in AIO Fusion. Simply paste the text, set the content type and target audience, then run the optimisation.",
    keywords: "paste content, any source, existing content, external content, copy paste, optimise external",
    displayOrder: 40,
  },
  // ── Comms Planner (additional) ────────────────────────────────────────────
  {
    category: "Comms Planner",
    question: "How many activities can I add to the Comms Planner?",
    answer:
      "There is no hard limit on the number of activities you can add to the Comms Planner. However, we recommend focusing on the next 3–6 months and limiting to 15–20 key activities for the scoring and prioritisation to be most useful. A very large plan with many low-priority items can obscure the signal.",
    keywords: "comms planner, how many, activities, limit, number, how much can I add",
    displayOrder: 40,
  },
  // ── Archive & Reports (additional) ────────────────────────────────────────
  {
    category: "Archive & Reports",
    question: "How long is data retained in the Archive?",
    answer:
      "All saved content, audits, and reports are retained for the lifetime of your account. There is no automatic expiry. If you close or pause your account, we retain your data for 90 days before permanent deletion — giving you time to export anything important.",
    keywords: "data retention, how long, archive, storage, delete, expiry, account closed",
    displayOrder: 50,
  },
  // ── LLM Check / Earned Media Audit (additional) ───────────────────────────
  {
    category: "LLM Check / Earned Media Audit",
    question: "Which AI models does the LLM Check audit query?",
    answer:
      "The LLM Check audit runs queries against ChatGPT (OpenAI) and Claude (Anthropic). These are the two dominant AI assistants used by consumers and businesses for information discovery and shortlisting. Perplexity and other AI search tools are not currently included in the audit scope.",
    keywords: "which models, chatgpt, claude, openai, anthropic, ai models tested, perplexity, not included",
    displayOrder: 70,
  },
  // ── Technical GEO / Website Audit (additional) ────────────────────────────
  {
    category: "Technical GEO / Website Audit",
    question: "How often should I run the Technical GEO audit?",
    answer:
      "We recommend running the Technical GEO audit after any major website update, and at minimum once per quarter. The audit measures your site's structural GEO readiness, which changes when you update your site architecture, add or remove pages, or change your content structure. Unlike the LLM Check, there is no enforced waiting period between Technical GEO runs.",
    keywords: "how often, technical geo, audit frequency, quarterly, run again, website audit frequency",
    displayOrder: 40,
  },
  // ── Billing & Payments (additional) ──────────────────────────────────────
  {
    category: "Billing & Payments",
    question: "Is there a free trial available?",
    answer:
      "Contact info@aiofusions.ai to ask about trial access. We offer a structured onboarding process that includes a guided walkthrough of the platform with your own brand data. This allows you to see real results before committing to a plan.",
    keywords: "free trial, trial, demo, test, try before buy, onboarding, pilot",
    displayOrder: 40,
  },
  // ── Media Research (additional) ───────────────────────────────────────────
  {
    category: "Media Research & Media Database",
    question: "Can I export my media list to a spreadsheet?",
    answer:
      "Yes. From the Media Database, use the Export button to download your saved contacts as a CSV file. The export includes journalist name, publication, beat, tier, and any notes you've added. This can be imported into your existing CRM or media management tools.",
    keywords: "export media list, csv, download contacts, journalist list, spreadsheet, media database export",
    displayOrder: 40,
  },
  // ── Bug / Technical Issue (additional) ────────────────────────────────────
  {
    category: "Bug / Technical Issue",
    question: "The export is producing a blank or corrupted file — how do I fix this?",
    answer:
      "Try a different browser — Chrome or Edge typically produce the most reliable exports. Disable any ad-blockers or browser extensions, then try again. If the problem persists, take a screenshot of the issue and contact support via the George support panel.",
    keywords: "export error, blank export, corrupted file, download failed, pdf broken, browser extension",
    displayOrder: 60,
  },
];

export async function seedSupportFaq() {
  console.log("[seed] Checking support_faq table...");
  const existing = await db.select({ id: supportFaqTable.id }).from(supportFaqTable).limit(1);
  if (existing.length > 0) {
    console.log("[seed] support_faq already seeded — skipping.");
    return;
  }
  console.log(`[seed] Inserting ${FAQ_ENTRIES.length} FAQ entries...`);
  await db.insert(supportFaqTable).values(FAQ_ENTRIES);
  console.log("[seed] support_faq seeded successfully.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedSupportFaq()
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1); });
}
