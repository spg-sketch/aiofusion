import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export async function seedSupportFaq(): Promise<void> {
  const { supportFaqTable } = await import("@workspace/db");

  // Check if table already has enough entries — re-seeds if below target
  const existing = await db.execute(sql`SELECT COUNT(*) AS cnt FROM support_faq`);
  const cnt = Number((existing.rows[0] as { cnt: string | number })?.cnt ?? 0);
  if (cnt >= 60) {
    logger.info({ cnt }, "seedSupportFaq: FAQ entries already seeded, skipping");
    return;
  }
  // If fewer than 60, truncate and re-seed with the full set
  if (cnt > 0) {
    await db.execute(sql`TRUNCATE TABLE support_faq RESTART IDENTITY CASCADE`);
    logger.info({ cnt }, "seedSupportFaq: Truncating to re-seed with full 60+ entry set");
  }

  const entries = [
    // ── Getting Started ──────────────────────────────────────────────────────
    {
      category: "Getting Started",
      question: "What is AIO Fusion and who is it for?",
      answer: "AIO Fusion is a Generative Engine Optimisation (GEO) platform built for PR and marketing professionals. It helps brands measure, plan, and improve how often they appear in AI-generated answers — from tools like ChatGPT and Claude. It's designed for agencies managing multiple clients, and for brands managing their own visibility in-house.",
      keywords: "what is aio fusion, overview, intro, who is it for, purpose, generative engine optimisation, geo platform",
      displayOrder: 10,
    },
    {
      category: "Getting Started",
      question: "How do I log in?",
      answer: "Go to the platform login page and enter either your username or your registered email address, plus your password. If your agency uses Google sign-in, click the Google button instead. If you've forgotten your password, contact your agency admin or platform support.",
      keywords: "login, sign in, password, username, email, google, access, forgot password",
      displayOrder: 20,
    },
    {
      category: "Getting Started",
      question: "What's the difference between an Agency account and a Client account?",
      answer: "An Agency account can create and manage multiple Client workspaces under it — think of it as the parent. A Client account is a single brand workspace. Agencies see all their clients' projects; clients only see their own. If you're an in-house team with a single brand, you'll typically be set up as a Client.",
      keywords: "agency, client, account type, difference, roles, hierarchy, workspace, sub-account",
      displayOrder: 30,
    },
    {
      category: "Getting Started",
      question: "How do I create a new project?",
      answer: "From the Project Hub, click \"New Project.\" Give it a name and your brand's website URL. Once created, start with the Project Set-Up (Intake Form) to give the platform the brand context it needs to run audits and generate content accurately.",
      keywords: "new project, create project, project hub, add project, start",
      displayOrder: 40,
    },
    {
      category: "Getting Started",
      question: "Can I have more than one project?",
      answer: "Yes. Agency accounts can manage up to 3 projects by default, with higher limits available on request. Admin accounts have no limit. Each project is a separate brand workspace with its own audits, content, and settings.",
      keywords: "multiple projects, project limit, how many projects, agency projects",
      displayOrder: 50,
    },
    {
      category: "Getting Started",
      question: "What is GEO (Generative Engine Optimisation)?",
      answer: "GEO is the practice of improving how often and how accurately a brand appears in AI-generated answers — from tools like ChatGPT and Claude. Unlike traditional SEO (which targets search result rankings), GEO targets the training signals and citation patterns that AI models use to select which brands and sources to reference.",
      keywords: "geo, generative engine optimisation, what is geo, ai visibility, ai mentions, seo vs geo",
      displayOrder: 60,
    },
    // ── Project Set-Up ──────────────────────────────────────────────────────
    {
      category: "Project Set-Up",
      question: "What is the Intake Form and why do I need to fill it in?",
      answer: "The Intake Form (also called Project Set-Up) is where you tell AIO Fusion everything it needs to know about a brand: its sector, products, target audience, spokespeople, competitors, and more. This context is used by every audit, content tool, and planner in the platform. The more accurately you complete it, the better every output will be.",
      keywords: "intake form, project setup, brand context, why fill in, set up, required, form",
      displayOrder: 10,
    },
    {
      category: "Project Set-Up",
      question: "How long does the Intake Form take to complete?",
      answer: "A basic set-up takes 10-15 minutes. A thorough one — with full competitor details, buyer personas, key messages and spokesperson bios — takes 30-45 minutes. We recommend completing as much as possible before running your first audit, as richer context leads to significantly better results.",
      keywords: "intake form, how long, time, complete, fill in, setup time",
      displayOrder: 20,
    },
    {
      category: "Project Set-Up",
      question: "Can I edit the Intake Form after the first save?",
      answer: "Yes, you can update the Intake Form at any time. Go to \"Project Set-Up\" in the sidebar. Changes take effect immediately for any new audits or content you run — they don't retroactively change previously completed audits.",
      keywords: "edit intake form, update setup, change brand info, re-save, update project",
      displayOrder: 30,
    },
    {
      category: "Project Set-Up",
      question: "Do I need to fill in every section of the Intake Form?",
      answer: "No — you can save at any point and return later. However, the platform's completeness score will indicate which sections are missing. Some tools (like the LLM Check audit) require at minimum the company name, sector, and website URL. We recommend working towards 80%+ completeness for best results.",
      keywords: "intake form, required fields, mandatory, completeness, skip, optional",
      displayOrder: 40,
    },
    {
      category: "Project Set-Up",
      question: "What should I put in the 'Key Messages' section?",
      answer: "Key messages are the 3-5 core things you want AI models — and your target audience — to know and remember about the brand. They should be factual, differentiated claims, not taglines. For example: 'First UK firm to achieve ISO 42001 AI governance certification' rather than 'We're the best AI firm around.'",
      keywords: "key messages, what to write, messaging, core messages, brand messages, examples",
      displayOrder: 50,
    },
    // ── LLM Check / Earned Media Audit ───────────────────────────────────────
    {
      category: "LLM Check / Earned Media Audit",
      question: "What does the Earned Media Visibility Audit measure?",
      answer: "The Earned Media Visibility Audit (LLM Check) queries ChatGPT and Claude with brand-relevant questions — discovery queries, shortlist queries, and comparison queries — then measures whether and how the brand is mentioned in their answers. It produces an Authority Index score, citation rate, sentiment, and share of voice vs. competitors.",
      keywords: "llm check, earned media audit, what does it measure, authority index, citation rate, share of voice, brand mentions",
      displayOrder: 10,
    },
    {
      category: "LLM Check / Earned Media Audit",
      question: "How long does the Earned Media Audit take to run?",
      answer: "The audit typically takes 3-8 minutes to complete. It's running live queries across ChatGPT and Claude in parallel and processing the responses in real time. You'll see results stream in as they complete.",
      keywords: "how long, audit time, duration, wait, running, llm check time",
      displayOrder: 20,
    },
    {
      category: "LLM Check / Earned Media Audit",
      question: "What is the Authority Index score?",
      answer: "The Authority Index is a 0-100 score that summarises how consistently a brand appears in AI-generated answers across its key topics. It combines citation rate (how often the brand is mentioned), sentiment (positive vs. neutral vs. negative framing), and prominence (whether the brand leads the answer or is buried). Higher is better.",
      keywords: "authority index, score, what is it, 0-100, how is it calculated, meaning",
      displayOrder: 30,
    },
    {
      category: "LLM Check / Earned Media Audit",
      question: "Why can't I run the audit more than once every 21 days?",
      answer: "The 21-day lock prevents over-querying the LLMs and keeps your results meaningful. AI model responses don't change significantly day-to-day. Running too frequently adds cost and noise without adding insight. The lock resets exactly 21 days after your last run.",
      keywords: "21 day lock, audit limit, how often, frequency, why can't I run, locked, wait",
      displayOrder: 40,
    },
    {
      category: "LLM Check / Earned Media Audit",
      question: "My brand scored 0% in the audit — what does that mean?",
      answer: "A 0% score means the brand was not mentioned in any of the AI model responses for the queries tested. This is actually a common starting point for newer or smaller brands. It tells you there is significant work to do on your earned media visibility — the platform's content and comms tools can help you build from here.",
      keywords: "zero score, 0%, not mentioned, brand not found, no citations, starting point",
      displayOrder: 50,
    },
    {
      category: "LLM Check / Earned Media Audit",
      question: "What is 'Share of Voice' in the audit results?",
      answer: "Share of Voice measures what percentage of all brand mentions across the tested queries belong to your brand versus your competitors. If 10 brands were mentioned across all probes and yours appeared 4 times, your share of voice is 40%. It contextualises your score relative to the competitive landscape.",
      keywords: "share of voice, sov, competitors, comparison, what is share of voice, relative score",
      displayOrder: 60,
    },
    // ── Technical GEO / Website Audit ─────────────────────────────────────────
    {
      category: "Technical GEO / Website Audit",
      question: "What does the Website Visibility Audit check?",
      answer: "The Website Visibility Audit (Technical GEO / Diagnostic) checks your website against the technical and structural signals that influence AI model citations — including structured data, crawlability, page authority signals, content depth, E-E-A-T signals, and more. It produces an overall readiness score and detailed recommendations by category.",
      keywords: "website audit, technical geo, diagnostic, what does it check, website visibility, seo, structured data",
      displayOrder: 10,
    },
    {
      category: "Technical GEO / Website Audit",
      question: "Do I need to give access to my website for the Technical GEO audit?",
      answer: "No. The audit works from the website URL you provide — it analyses the publicly accessible version of your site. You don't need to install any tracking code or provide admin access. Just ensure the URL in your Project Set-Up is correct.",
      keywords: "website access, give access, install code, tracking, how does it work, website url",
      displayOrder: 20,
    },
    {
      category: "Technical GEO / Website Audit",
      question: "What is an E-E-A-T signal and why does it matter for GEO?",
      answer: "E-E-A-T stands for Experience, Expertise, Authoritativeness, and Trustworthiness — Google's quality framework, which AI models also use as a proxy for citation-worthiness. Websites that clearly demonstrate expert authorship, cite credible sources, and maintain factual accuracy are more likely to be referenced in AI answers.",
      keywords: "eeat, e-e-a-t, experience, expertise, authority, trust, what is it, why does it matter, google, signals",
      displayOrder: 30,
    },
    // ── Content Creator ───────────────────────────────────────────────────────
    {
      category: "Content Creator",
      question: "What types of content can the Content Creator generate?",
      answer: "The Content Creator can generate press releases, news articles, thought leadership pieces, social media posts, and award submissions. All output is grounded in your brand's Intake Form data — so the content uses the correct tone, key messages, spokespeople, and sector context automatically.",
      keywords: "content creator, what can it create, press release, article, social post, types of content",
      displayOrder: 10,
    },
    {
      category: "Content Creator",
      question: "Can I edit content after the Creator generates it?",
      answer: "Yes. All generated content is fully editable in the Content Creator editor after generation. You can adjust the copy, add or remove sections, then use the Content Optimiser to check whether your edits maintain or improve the GEO signals.",
      keywords: "edit content, modify, change, after generation, editable, content creator edit",
      displayOrder: 20,
    },
    {
      category: "Content Creator",
      question: "How do I export or download generated content?",
      answer: "Use the Export button in the Content Creator to download the content as a formatted document. Content is also saved to your Content Library (Archive) automatically, so you can retrieve it later from the Archive section in the sidebar.",
      keywords: "export, download, save content, copy, how to export, content library, archive",
      displayOrder: 30,
    },
    {
      category: "Content Creator",
      question: "Why does the Content Creator say I've reached my usage limit?",
      answer: "Content generation is subject to a fair usage limit of 50 actions per project per month. This covers content creation and optimisation runs. If you hit the limit, it resets at the start of the next calendar month. For higher limits, contact info@aiofusions.ai.",
      keywords: "usage limit, fair usage, 50 actions, limit reached, quota, monthly limit, content limit",
      displayOrder: 40,
    },
    // ── Content Optimiser ─────────────────────────────────────────────────────
    {
      category: "Content Optimiser",
      question: "What does the Content Optimiser do?",
      answer: "The Content Optimiser analyses a piece of text and rewrites or annotates it to improve its GEO signals — increasing the likelihood that AI models will cite or reference it. It adds structured claims, improves E-E-A-T markers, strengthens source citations, and ensures key messages are prominent. Every change is annotated with a reasoning note.",
      keywords: "content optimiser, what does it do, how does it work, improve content, geo signals, rewrite",
      displayOrder: 10,
    },
    {
      category: "Content Optimiser",
      question: "What is the 'GEO score' shown by the Content Optimiser?",
      answer: "The GEO score is a 0-100 rating of how well a piece of content is optimised for AI citation. It measures factors like the presence of structured factual claims, E-E-A-T signals, source citations, entity clarity, and semantic relevance to the brand's key topics. The optimiser shows you the score before and after each optimisation.",
      keywords: "geo score, content score, what is it, before after, optimiser score, rating",
      displayOrder: 20,
    },
    {
      category: "Content Optimiser",
      question: "How long does the Content Optimiser take to run?",
      answer: "Optimisation typically takes 30-90 seconds depending on the length of the content. You'll see the optimised version and annotations stream in as they're generated.",
      keywords: "optimiser time, how long, duration, wait, processing",
      displayOrder: 30,
    },
    // ── Comms Planner ─────────────────────────────────────────────────────────
    {
      category: "Comms Planner",
      question: "What is the Comms Planner?",
      answer: "The Comms Planner is a forward-looking planning tool that lets you map out PR and marketing activities over a period — press releases, events, campaigns, awards — and scores each activity for its predicted GEO impact. It helps you prioritise activities that will most improve AI visibility.",
      keywords: "comms planner, what is it, planning tool, pr planning, forward-looking, activities, schedule",
      displayOrder: 10,
    },
    {
      category: "Comms Planner",
      question: "How does the Comms Planner score activities?",
      answer: "Each planned activity is scored against the brand's current GEO positioning and key messages. The planner assesses factors like topical relevance, likely media coverage, and how well the activity reinforces the signals AI models use to build brand associations. Higher-scoring activities should be prioritised.",
      keywords: "comms planner, how does it score, scoring, activity score, priority, ranking",
      displayOrder: 20,
    },
    {
      category: "Comms Planner",
      question: "Can I export the Comms Planner as a calendar or document?",
      answer: "Yes, you can export the Comms Planner as a PDF or CSV. Use the Export button in the planner view. The export includes all planned activities, their scores, and any notes or content you've attached to them.",
      keywords: "export planner, download, calendar, pdf, csv, comms planner export",
      displayOrder: 30,
    },
    // ── Media Research & Media Database ───────────────────────────────────────
    {
      category: "Media Research & Media Database",
      question: "What is the Media Research tool?",
      answer: "Media Research recommends relevant journalists, publications, and media outlets based on the brand's sector, topics, and target audience. It helps communications teams build and maintain the media relationships that underpin earned media visibility.",
      keywords: "media research, what is it, journalists, publications, media database, contacts",
      displayOrder: 10,
    },
    {
      category: "Media Research & Media Database",
      question: "Is the Media Database live or static?",
      answer: "The Media Database is regularly updated but reflects a point-in-time snapshot of journalist coverage and beats. Always verify contact details and beat relevance before outreach — journalists move between publications frequently. Use the tool to identify who to prioritise, then confirm details via the publication's website.",
      keywords: "media database, live, static, up to date, accurate, verify, contacts",
      displayOrder: 20,
    },
    {
      category: "Media Research & Media Database",
      question: "How do I add a journalist or outlet to my media list?",
      answer: "From any Media Research result, click 'Save to Media List.' Saved contacts appear in your Media Database. You can tag contacts, add notes, and filter by beat, publication, or tier.",
      keywords: "save journalist, media list, add contact, how to save, media database",
      displayOrder: 30,
    },
    // ── Archive & Reports ────────────────────────────────────────────────────
    {
      category: "Archive & Reports",
      question: "What is saved in the Archive?",
      answer: "The Archive stores all content you've created or optimised in the platform — press releases, articles, social posts, and more. It also stores completed audits and planner exports. Content is organised by project and date, and is searchable.",
      keywords: "archive, what is saved, content library, history, previous work, stored",
      displayOrder: 10,
    },
    {
      category: "Archive & Reports",
      question: "Where can I find my previous audit results?",
      answer: "Previous audit results are accessible in two places: (1) in the sidebar under the relevant audit section (LLM Check or Technical GEO), where the 3 most recent runs are shown; and (2) in the Archive section, where all saved audits are listed with their scores and dates.",
      keywords: "previous audits, find old results, audit history, past results, saved audits",
      displayOrder: 20,
    },
    {
      category: "Archive & Reports",
      question: "Can I compare results across multiple audits?",
      answer: "Yes. The Report / Measure section provides trend charts and comparisons across saved audits, so you can track your Authority Index, citation rate, and content GEO scores over time. You need at least two saved audits to see trend data.",
      keywords: "compare audits, trend, over time, measure, report, multiple audits, track progress",
      displayOrder: 30,
    },
    {
      category: "Archive & Reports",
      question: "How do I export a report to share with a client?",
      answer: "From the Report / Measure page, click 'Export Report.' This generates a PDF or HTML report containing your key metrics, trend charts, and recommendations. Reports are branded with the AIO Fusion logo and can be customised with your agency branding on request.",
      keywords: "export report, pdf, share, client report, download, white label, branded report",
      displayOrder: 40,
    },
    // ── Account & Access Management ──────────────────────────────────────────
    {
      category: "Account & Access Management",
      question: "How do I add a new team member to my agency?",
      answer: "Admin and agency accounts can add team members from the User Management page. Go to the platform home, click your profile, then 'Manage Users.' Click 'Add User,' enter their email and set their role. They'll receive an invitation email with a temporary password.",
      keywords: "add user, new team member, invite, user management, add account, sub-account",
      displayOrder: 10,
    },
    {
      category: "Account & Access Management",
      question: "How do I reset a user's password?",
      answer: "Admin accounts can reset any user's password from the User Management page. Click the three-dot menu next to the user, select 'Change Password,' and set a new temporary password. The user will be prompted to change it on next login.",
      keywords: "reset password, change password, forgot password, admin, user management",
      displayOrder: 20,
    },
    {
      category: "Account & Access Management",
      question: "Can I give a client read-only access to their results?",
      answer: "Yes. Client accounts have access to their own project's audit results, reports, and content — but cannot manage users or access other projects. To set up a client with view-only access, create a Client role account and assign it to the relevant project.",
      keywords: "client access, read only, view only, share results, client login, restrict access",
      displayOrder: 30,
    },
    {
      category: "Account & Access Management",
      question: "How do I delete a user or project?",
      answer: "User accounts can be archived (not permanently deleted) from the User Management page by an Admin. Archived users lose access but their data is retained. Projects can be deleted from the Project Hub — this is permanent and cannot be undone.",
      keywords: "delete user, archive user, remove user, delete project, deactivate",
      displayOrder: 40,
    },
    {
      category: "Account & Access Management",
      question: "What is the 'Impersonation' feature?",
      answer: "'View Account' (impersonation) allows an admin to log in as another account to diagnose issues or verify what a user sees. It's available from the User Management page. All actions taken while impersonating are logged against the original admin account for audit trail purposes.",
      keywords: "impersonation, view account, log in as, admin feature, audit trail, user view",
      displayOrder: 50,
    },
    {
      category: "Account & Access Management",
      question: "How do I change the account email address?",
      answer: "Email address changes are handled by the platform admin. Contact info@aiofusions.ai with your account username and the new email address you'd like to use. For security, we'll confirm the change with both the old and new email addresses.",
      keywords: "change email, update email, email address, account email, username",
      displayOrder: 60,
    },
    // ── Billing & Payments ────────────────────────────────────────────────────
    {
      category: "Billing & Payments",
      question: "How is AIO Fusion priced?",
      answer: "AIO Fusion is available on a monthly subscription basis, with pricing based on the number of projects and user accounts. Agency plans cover multiple client projects; in-house plans are single-brand. For current pricing, visit aiofusions.ai/pricing or contact info@aiofusions.ai.",
      keywords: "pricing, cost, how much, subscription, plans, billing, monthly fee",
      displayOrder: 10,
    },
    {
      category: "Billing & Payments",
      question: "What counts as an 'action' for fair usage?",
      answer: "An 'action' is any content generation or optimisation run — creating a press release, optimising an article, running the Content Creator, etc. Audit runs (LLM Check, Technical GEO) and LLM query generation have their own separate 21-day limits and don't count towards the 50-action monthly fair usage total.",
      keywords: "action, fair usage, what counts, 50 actions, usage, monthly limit, content actions",
      displayOrder: 20,
    },
    {
      category: "Billing & Payments",
      question: "How do I upgrade or change my plan?",
      answer: "Contact info@aiofusions.ai to discuss plan changes. We'll review your usage and recommend the right plan. Changes are applied at the start of the next billing period.",
      keywords: "upgrade, change plan, billing, subscription change, more projects, higher limit",
      displayOrder: 30,
    },
    // ── Bug / Technical Issue ─────────────────────────────────────────────────
    {
      category: "Bug / Technical Issue",
      question: "The page is loading slowly or not loading at all — what should I do?",
      answer: "First, try a hard refresh (Ctrl+Shift+R on Windows, Cmd+Shift+R on Mac). If the issue persists, check your internet connection. If you're still having trouble, try clearing your browser cache. If none of these work, contact support and include your browser type and version.",
      keywords: "slow, not loading, blank page, refresh, cache, browser issue, loading",
      displayOrder: 10,
    },
    {
      category: "Bug / Technical Issue",
      question: "I'm getting an error when I try to run an audit — what's wrong?",
      answer: "Audit errors are usually caused by one of three things: (1) an incomplete Intake Form — ensure the company name, sector, and website URL are filled in; (2) a temporary AI API outage — try again in a few minutes; (3) a session timeout — try logging out and back in. If the problem persists, contact support with a screenshot of the error.",
      keywords: "audit error, error running audit, something went wrong, api error, try again, fix",
      displayOrder: 20,
    },
    {
      category: "Bug / Technical Issue",
      question: "The content generator produced garbled or cut-off output — is this a bug?",
      answer: "Occasionally AI model responses can be incomplete or garbled, especially for very long documents. Try re-running the generation — results will differ slightly each time. If cut-off output happens consistently, reduce the length of the input and try again. If the problem persists, contact support.",
      keywords: "garbled output, cut off, incomplete content, generation error, ai response, weird output",
      displayOrder: 30,
    },
    {
      category: "Bug / Technical Issue",
      question: "I can't log in — I'm sure my password is correct. What do I do?",
      answer: "First, check Caps Lock is off. Try resetting your password using the 'Forgot password' link. If you don't receive a reset email within 5 minutes, check your spam folder. If you still can't log in, contact your agency admin or email info@aiofusions.ai with your username.",
      keywords: "can't login, wrong password, locked out, forgot password, access, reset",
      displayOrder: 40,
    },
    {
      category: "Bug / Technical Issue",
      question: "My saved work has disappeared — can it be recovered?",
      answer: "Saved audits, content, and planner data are stored server-side and are not lost on browser refresh. If data appears missing, try logging out and back in to force a full re-sync. If data is genuinely missing, contact support immediately — we maintain database backups and can usually recover recent work.",
      keywords: "data lost, disappeared, missing data, recovery, restore, saved work gone",
      displayOrder: 50,
    },
    // ── Getting Started (additional) ─────────────────────────────────────────
    {
      category: "Getting Started",
      question: "How do I navigate between different tools in AIO Fusion?",
      answer: "All tools are accessible from the left-hand sidebar. The sidebar is organised by function: Project Set-Up at the top, then audit tools (LLM Check, Technical GEO), content tools (Creator, Optimiser, Comms Planner, Media Research), and Archive / Reports at the bottom. Click any item to go directly to that tool.",
      keywords: "navigation, sidebar, how to use, find tools, where is, menu",
      displayOrder: 70,
    },
    {
      category: "Getting Started",
      question: "Does AIO Fusion work on mobile devices?",
      answer: "AIO Fusion is a web platform designed primarily for desktop use. It is accessible on tablets and mobile devices via a browser, but some features — particularly the audit results tables and the Comms Planner — are best experienced on a larger screen. We recommend using a desktop or laptop for detailed work.",
      keywords: "mobile, tablet, phone, browser, responsive, desktop, works on mobile",
      displayOrder: 80,
    },
    // ── Project Set-Up (additional) ──────────────────────────────────────────
    {
      category: "Project Set-Up",
      question: "How do I add competitors to my project?",
      answer: "In the Intake Form, scroll to the Competitor section. Add up to 10 competitors by entering their brand name and website URL. The LLM Check audit will then measure their AI visibility alongside yours, giving you share-of-voice comparisons. Update competitors any time to keep results relevant.",
      keywords: "competitors, add competitor, competitor list, rival, share of voice, intake form competitors",
      displayOrder: 60,
    },
    {
      category: "Project Set-Up",
      question: "What are LLM Queries and how are they generated?",
      answer: "LLM Queries (section 1.6 of the Intake Form) are the actual questions the platform sends to ChatGPT and Claude during the LLM Check audit. They are AI-generated from your brand context and categorised into Discovery, Shortlist, and Comparison queries. You can regenerate them once every 21 days from the Project Set-Up page.",
      keywords: "llm queries, what are they, how generated, 1.6, discovery shortlist comparison, regenerate, 21 day lock",
      displayOrder: 70,
    },
    // ── Content Optimiser (additional) ────────────────────────────────────────
    {
      category: "Content Optimiser",
      question: "Can I paste in content from any source to optimise it?",
      answer: "Yes. The Content Optimiser accepts any text you paste in — press releases, web copy, blog posts, articles, or social posts. You don't need to have created the content in AIO Fusion. Simply paste the text, set the content type and target audience, then run the optimisation.",
      keywords: "paste content, any source, existing content, external content, copy paste, optimise external",
      displayOrder: 40,
    },
    // ── Comms Planner (additional) ────────────────────────────────────────────
    {
      category: "Comms Planner",
      question: "How many activities can I add to the Comms Planner?",
      answer: "There is no hard limit on the number of activities you can add to the Comms Planner. However, we recommend focusing on the next 3-6 months and limiting to 15-20 key activities for the scoring and prioritisation to be most useful. A very large plan with many low-priority items can obscure the signal.",
      keywords: "comms planner, how many, activities, limit, number, how much can I add",
      displayOrder: 40,
    },
    // ── Archive & Reports (additional) ────────────────────────────────────────
    {
      category: "Archive & Reports",
      question: "How long is data retained in the Archive?",
      answer: "All saved content, audits, and reports are retained for the lifetime of your account. There is no automatic expiry. If you close or pause your account, we retain your data for 90 days before permanent deletion — giving you time to export anything important.",
      keywords: "data retention, how long, archive, storage, delete, expiry, account closed",
      displayOrder: 50,
    },
    // ── LLM Check / Earned Media Audit (additional) ───────────────────────────
    {
      category: "LLM Check / Earned Media Audit",
      question: "Which AI models does the LLM Check audit query?",
      answer: "The LLM Check audit runs queries against ChatGPT (OpenAI) and Claude (Anthropic). These are the two dominant AI assistants used by consumers and businesses for information discovery and shortlisting. Perplexity and other AI search tools are not currently included in the audit scope.",
      keywords: "which models, chatgpt, claude, openai, anthropic, ai models tested, perplexity, not included",
      displayOrder: 70,
    },
    // ── Technical GEO / Website Audit (additional) ────────────────────────────
    {
      category: "Technical GEO / Website Audit",
      question: "How often should I run the Technical GEO audit?",
      answer: "We recommend running the Technical GEO audit after any major website update, and at minimum once per quarter. The audit measures your site's structural GEO readiness, which changes when you update your site architecture, add or remove pages, or change your content structure. Unlike the LLM Check, there is no enforced waiting period between Technical GEO runs.",
      keywords: "how often, technical geo, audit frequency, quarterly, run again, website audit frequency",
      displayOrder: 40,
    },
  ];

  await db.insert(supportFaqTable).values(entries);
  logger.info({ count: entries.length }, "seedSupportFaq: FAQ library seeded successfully");
}
