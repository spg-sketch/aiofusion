# AIO Fusion - Product Specification & Investor Brief

**The AI Authority Platform for PR and Marketing Professionals**

*Prepared for investment discussion. This document describes the platform as built to date and the roadmap for the next phase of development.*

---

## 1. Executive summary

AIO Fusion is a Generative Engine Optimisation (GEO) platform. It helps brands measure, manage and grow how they are seen, referenced and recommended by AI answer engines such as ChatGPT, Gemini, Claude, Perplexity and Copilot.

Search is moving from a list of blue links to a single AI-generated answer. When a buyer, journalist or partner asks an AI a question, the brands that get named in the answer win, and the rest become invisible. Traditional SEO does not optimise for this new surface. AIO Fusion does.

The platform combines live AI-visibility diagnostics with an end-to-end PR and marketing workflow, so a team can go from "how visible are we to AI today?" to planning, creating, optimising and publishing the earned media and website content that improves that visibility, and then measure the result.

The product is built and demonstrable today, with three live analysis engines making real calls to large language models and performing real website crawls. The next phase introduces autonomous agentic agents that move the platform from assisted workflow to self-driving AI authority management.

---

## 2. The problem and the market

**The move to answer engines.** A growing share of discovery now happens inside AI assistants that answer directly rather than linking out. In this world, the question that matters is no longer "where do we rank?" but "are we the brand the AI names, and is what it says about us accurate?"

**Traditional SEO does not solve this.** Keyword ranking and backlinks were built for a links-based web. They do not measure or influence whether an LLM names you, what it says, or which competitors it mentions instead of you.

**Earned media is the strongest AI signal, and it is hard to manage.** Authority that AI engines trust comes disproportionately from credible third-party coverage and well-structured, quotable content. PR and marketing teams produce exactly this, but they lack tools to connect their day-to-day work to measurable AI visibility outcomes.

**The opportunity.** AIO Fusion sits at the intersection of two large, established budgets, PR and SEO/content marketing, and reframes them around the fastest-growing discovery surface. It serves both in-house teams and the agencies that serve them.

---

## 3. The solution

AIO Fusion is a single platform that closes the loop on AI authority:

1. **Diagnose** - measure current AI visibility and website reference-readiness with live data.
2. **Set up** - capture the brand's profile, message hierarchy and audience so every downstream tool works from one source of truth.
3. **Plan** - build and score a PR and marketing schedule against its likely AI-authority impact.
4. **Create and optimise** - generate and refine pitches, articles and releases tuned for AI extraction and referencing.
5. **Target** - identify the right journalists, publications, events and awards.
6. **Release** - route content through approval before publication.
7. **Measure** - track AI authority, earned media and website GEO scores over time.

The same workflow runs for a single brand (in-house) or across a portfolio of clients (agency), with a dedicated experience designed for AI agents themselves.

---

## 4. Architecture and technology

**Frontend.** React with Vite, Tailwind CSS, Radix UI / shadcn component primitives, Framer Motion for interaction, and the Lucide icon set. A single, responsive application that serves both the public marketing site and the authenticated platform.

**Backend.** A Node.js / Express API server written in TypeScript, with hardened production patterns: authentication middleware, per-endpoint rate limiting, and concurrency guards to protect the expensive AI and crawl operations.

**AI integration.** The analysis engines integrate directly with both the OpenAI and Anthropic SDKs, giving the platform a dual-engine approach that probes more than one model family rather than relying on a single provider.

**Data.** Server-side persistence for user accounts and authentication via a Postgres database (Drizzle ORM). Project working data in the current build is held client-side for fast, self-contained demonstration.

**Authentication.** Secure login with user roles (including an administrator role and user management), plus a mobile authentication path.

**AI discoverability of our own site.** The platform's own marketing site ships with `robots.txt` tuned to welcome AI crawlers, an `llms.txt` structured summary for AI agents, and a sitemap, so the product practises the discipline it sells.

---

## 5. Platform capabilities

The platform is organised into modules. Below, each is described with its purpose, inputs and outputs.

### Diagnosis and set-up

**Project Set-Up.** A guided, multi-section intake that captures the brand's profile and messaging: boilerplate and spokespeople, FAQ, audience mapping, business fundamentals, GEO vs AEO priorities, schema and technical preferences, and consistency rules. It includes an "optimise messages" step that rewrites raw inputs into AI-ready copy, and supports document export. This becomes the single source of truth that every other tool draws from.

**Earned Media Visibility Audit (live engine).** Probes large language models in real time to see whether and how a brand is mentioned for industry-relevant questions. Inputs are company name, sector and optional keywords. Outputs include an **AI Visibility Score (0-100%)**, model-by-model mention rates (for example ChatGPT vs Claude), competitor mentions surfaced alongside the brand, and detailed probe results showing the exact context of each mention.

**Website Visibility Audit / Technical GEO (live engine).** Crawls a target URL and scores its readiness to be referenced by AI. Produces an **overall score (0-100)** across categories including metadata, heading structure, schema (JSON-LD), links, images, AI-readiness, performance and sources. It explicitly checks whether AI crawlers (such as GPTBot, ClaudeBot and PerplexityBot) are permitted, and returns prioritised recommendations graded Critical / High / Medium / Low.

### Strategy, planning and creation

**Comms Planner.** Plan and score the PR and marketing schedule, with the plan tied to predicted AI-authority impact.

**Content Creator.** Generates pitches, articles and releases built from the brand's approved "gold" messaging captured in Set-Up.

**Content Optimiser and Editor.** Scores and edits drafts against the brand's semantic phrase guide, restructuring copy so it is easier for AI to extract and reference.

### Media intelligence

**Media Research.** Recommends relevant journalists and publications, with a confidence system that flags contacts as Verified, Potential or Unverified.

**Marketing Intelligence.** Recommends relevant events and awards, each with an authority score (0-100) to prioritise effort.

### Governance, measurement and library

**Release Gateway.** An approval and release checkpoint so content is signed off before it goes live. (Flagged in-product as a next-phase module.)

**Measure and Report.** A dashboard that combines earned media tracking with website GEO progress. Headline metrics include an AI Authority Score, an Earned Authority Score and a Website GEO Score, broken down across six core GEO signal categories: schema, content architecture, source authority, earned media signals, earned visibility and technical accessibility.

**Archive.** A searchable library of all generated and approved content.

### Multi-tenant and administration

**Project Hub.** The home for selecting and managing projects, with a guided "Create Project" entry point.

**Users Admin and Guidance.** Administrative user management plus in-product guidance and how-to content.

---

## 6. Scoring methodology (the intellectual property)

AIO Fusion's edge lies in translating fuzzy "AI visibility" into consistent, trackable scores:

- **AI Visibility Score (0-100%)** - share of AI responses, across multiple model families, that mention the brand for its target questions.
- **Website GEO / reference-readiness score (0-100)** - a weighted composite across the technical and content signals that influence AI referencing.
- **Six GEO signal categories** - schema, content architecture, source authority, earned media signals, earned visibility and technical accessibility, each weighted to roll up into the authority score.
- **Confidence flags** - Verified / Potential / Unverified for media contacts, and authority scores for events and awards.

Because every project shares one underlying data model, scores are comparable across time, across competitors and across an agency's whole client portfolio.

---

## 7. Go-to-market

The product is purpose-built for three audiences, each with a dedicated experience:

**In-house PR and marketing teams.** Run professional, measurable AI-authority programmes at scale and prove the impact of PR and content investment.

**PR and marketing agencies.** Manage AI visibility across many clients from one platform, with the consistency and reporting needed to package GEO as a service.

**AI agents.** A dedicated surface, paired with the site's machine-readable `llms.txt`, that presents the brand cleanly to AI systems arriving directly, leading by example on the exact practice the platform sells.

The public site articulates the core thesis: the primacy of PR and earned media in the AI age, and the move from SEO to GEO and AEO.

---

## 8. Build status (for diligence)

We are deliberately clear about what is live versus demonstrated, so technical diligence is straightforward.

**Live, production-grade engines (real external calls):**
- Earned Media Visibility Audit - real, dual-engine LLM probing (OpenAI and Anthropic).
- Website Visibility Audit and Technical GEO - real website crawling and analysis.
- These run behind authentication, rate limiting and concurrency protection.

**Built and fully interactive on demonstration data:**
- The end-to-end workflow modules (Set-Up, Planner, Creator, Optimiser, Media Research, Marketing Intelligence, Measure and Report, Archive) are complete as working software with real interaction logic, currently driven by self-contained project data for a clean, reliable demo.

**Marked as next phase:**
- Release Gateway approval flow and the deeper agentic capabilities described below.

This staging means the hardest, most differentiated parts, the live AI measurement engines, already exist, while the surrounding workflow is proven in the UI and ready to be connected to persistent multi-tenant data and live model calls.

---

## 9. Roadmap: autonomous agents (Phase 2)

*Important: this section and Section 10 describe Phase 2, the planned next phase of development. They are not part of the platform as built today (see Section 8: Build status).*

The current platform assists a human operator through each step. Phase 2 introduces autonomous agentic agents that carry out the work continuously and proactively. This is the core of the raise.

**Always-on visibility agents.** Continuously re-run AI-visibility and competitor probes on a schedule, detect drops or competitor gains, and alert the team, turning a one-off audit into live monitoring.

**Website GEO remediation agents.** Watch a site for reference-readiness regressions and propose, or apply, fixes to schema, structure and metadata as content changes.

**Content agents.** Draft pitches, articles and releases end-to-end from the brand's gold messaging and the live media landscape, then self-score and revise against GEO and AEO criteria before a human ever sees them.

**Outreach and media agents.** Continuously refresh and verify the journalist, publication, event and award landscape, and prepare targeted outreach.

**Planning agents.** Maintain and re-optimise the comms calendar automatically as results come in, reallocating effort toward the activities producing the most AI-authority lift.

**Orchestration.** A coordinating layer that lets these agents work together across the diagnose-plan-create-release-measure loop, with human approval gates (via the Release Gateway) where it matters.

The strategic change: from a tool a team uses, to an autonomous system that manages a brand's AI authority on the team's behalf. The live measurement engines already built are the feedback signal these agents will optimise against, which is precisely why they were built first. The detailed agent organisation and rollout follow in Section 10.

---

## 10. Agent strategy (Phase 2)

*This section is Phase 2 and is not yet built. It sets out how the autonomous agents in Section 9 would be organised and rolled out, kept separate from the platform as built today.*

Each user account runs its own pod of agents: a single coordinating agent at the top and a set of specialists beneath it, isolated per account so one client's data and agents never touch another's.

**Account Strategist (orchestrator).** Owns the account's goals, brand voice and priorities. It reads the latest scores from the live engines, decides what matters most, assigns work to the specialist leads, reviews what they produce, resolves conflicts (for example, when SEO and PR both want to change the same page), and reports back to the user in plain language. It knows when to stop and request human sign-off.

Beneath the orchestrator sit four leads, each managing narrow worker agents:

**Earned Media Lead.**
- Visibility Monitor - re-runs the Earned Media Visibility Audit on a schedule and flags drops or competitor gains.
- Opportunity Scout - watches for relevant journalist requests, trends and stories the brand's spokespeople could comment on.
- Pitch Drafter - writes tailored pitch ideas and outreach notes for named contacts and trade media, ready for a human to approve or override before anything is sent.
- Placement Agent - once a piece is approved, posts it to the brand's owned channels and major media platforms, and arranges paid advertorials and sponsored content, always behind human sign-off.
- Coverage Tracker - detects new mentions and references, and notes which ones AI engines are picking up.

**GEO / SEO Lead.**
- Technical GEO Agent - runs the Website Visibility Audit, finds issues such as missing Person or Organization schema, and prepares the fixes.
- Content GEO Agent - checks whether pages actually answer the questions people ask AI tools, and flags gaps to fill.
- Reference Builder - works to get the brand and its named experts quoted and referenced so AI answers name them.
- Question Watcher - tracks the questions and terms the audience is asking AI and search.

**Content Lead.**
- Drafting Agent - turns approved pitch ideas and content gaps into headlines, standfirsts, articles and transcripts from the brand's gold messaging, produced as drafts for a human to approve.
- Optimisation Agent - applies per-field optimisation to sharpen each piece against the semantic phrase guide.
- Repurposing Agent - spins one strong asset into social posts, Q and A snippets and FAQ entries built for AI extraction.

**Measure and Report Lead.**
- Scorekeeper - tracks how every score moves over time across all audits.
- Impact Analyst - links activity to results, for example "adding Person schema lifted the visibility score".
- Reporter - writes the client-ready summary in plain language.

**From draft to publication.** These roles form a clear chain with a person in control at each gate: the Drafting Agent creates content for approval, the Pitch Drafter pitches approved stories to editors with a human override before anything is sent, and the Placement Agent posts the finished piece to major media platforms or arranges paid advertorials and sponsored content. People approve, agents do the legwork.

**How they work together.** The Monitor and Scorekeeper agents surface a problem or an opportunity to the orchestrator. The orchestrator sets priority and assigns it to the right lead, which breaks it into tasks for its workers. Workers return drafts or fixes, the orchestrator bundles them, and the user approves before anything goes live. The Measure team then checks whether the score actually moved, closing the loop.

**Guardrails (built in from day one).**
- Human in the loop for anything public. Agents draft, people approve, via the Release Gateway.
- Per-account isolation of data and agents.
- A clear activity log of what each agent did and why.
- Spend and rate limits so no agent can run away with API or outreach costs.
- A confidence threshold: low-confidence actions queue for a human, while routine high-confidence ones (such as re-running an audit) run on their own.

**Phased rollout.**
1. Monitors and Scorekeeper only - watch and alert, no actions. Low risk, immediate value.
2. Add draft-only agents - pitches, content and prepared GEO fixes, none applied automatically.
3. Add the orchestrator - prioritise and bundle work into a weekly plan.
4. Allow approved, low-risk actions to run automatically, with everything logged.

---

## 11. Why this is hard to copy

- **Proprietary scoring** across multiple model families and a unified six-category GEO framework, comparable over time and across portfolios.
- **Dual-engine architecture** that is not dependent on any single AI provider.
- **The full loop in one platform** - measurement, workflow and (next) autonomous execution, rather than a point tool.
- **Right place in the budget** - sits across both PR and SEO/content spend and reframes them for the AI era.
- **A data flywheel** - every probe, audit and project enriches the benchmark of what drives AI referencing, which in turn sharpens scoring and agent behaviour.

---

## 12. Summary

AIO Fusion already does the hard part: it measures, with live data, whether AI engines see and recommend a brand, and it wraps that measurement in a complete PR and marketing workflow. The investment unlocks the next phase, a layer of autonomous agentic agents that turn that workflow into a self-driving system for growing AI authority, at the exact moment the market is moving from search to answers.
