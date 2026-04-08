# Meeting Notes: Patrick (Simpatico PR) & Spencer (Bluhalo)
**Date:** 27 March 2026

---

## Key Decisions

1. **Build AIO Fusion within Simpatico first** — test on clients before attempting to sell externally. Avoid the common trap of raising money, building a product, and finding no buyers.

2. **Phase 1: Managed Service** — Simpatico uses the platform internally on behalf of clients, rather than giving them direct access. This lets the team test, refine, and own the process before productising.

3. **Phase 2: Client-Facing Product** — Once proven, transition to a subscription or chargeable product within Simpatico's offering.

4. **Platform stays internal initially** — AIO Fusion will be referenced on the new Simpatico website (what it does, the value proposition), but the actual platform won't be visible to the public. It's a back-office tool for the team to use with clients.

5. **Branding handled separately** — Patrick will arrange branding/logo design independently. Domain names for AIO Fusion are already registered.

---

## Build Plan

| Item | Detail |
|------|--------|
| **Build time** | ~5 days |
| **Build cost** | ~£2,500 (Spencer's time) |
| **Platform credits** | ~£500–600 |
| **Total estimate** | ~£3,000 |
| **Branding/logo** | Not included — Patrick to arrange (People Per Hour or similar, ~£90 as precedent) |
| **Running cost per user** | ~$50/month in usage charges |

### Build Process
1. Spencer sends a cost breakdown and proposal
2. Book a half-day session together to finalise the wireframe — get every box, label, and flow exactly right
3. Spencer builds the platform over 2–3 days
4. Two half-day testing sessions together to identify and fix issues
5. Expect a bug-fixing period in the early weeks (normal for any new software)
6. Patrick gets full platform access once the build is stable

---

## Platform Architecture (Discussed)

### Core Modules (V1)
- **GEO Diagnostic** — Analyse content for AI visibility across signal categories, scored report with actions
- **Content Optimiser** — Transform PR content for LLM citation; before/after scoring, tracked changes, semantic phrase guidance
- **Authority Planner** — Score the forward PR plan by activity type; gap analysis and priority recommendations

### V2 Modules (Future)
- **Content Archive** — Upload, store, tag and manage all PR content with version history and approval workflow
- **Release Gateway** — Route approved content to wire services, social channels, and client websites
- **Measure & Report** — Track AI citation performance across LLMs with automated reporting

### Content Management Workflow (Patrick's Vision)
1. Receive client brief
2. Write the press release
3. Run it through AIO Fusion for AI optimisation
4. Finesse and re-edit
5. Tag with message, spokesperson, and purpose
6. Client signs off
7. Optionally send to PR agent for outreach, or pitch manually
8. Publish to wire services and client channels

---

## PR Agent Discussion

### Concept
A dedicated AI agent for media outreach that can:
- Identify and compile journalist contact lists from major publications (AdAge, The Drum, etc.)
- Draft and send personalised email pitches (with human sign-off on the press release)
- Handle inbound journalist replies — flag them back to the team or draft suggested responses
- Monitor for tactical opportunities (e.g. Response Source feeds — filter the 10% that are worthwhile from the 90% noise)

### Value Proposition for Clients
"Not only am I working on it, but I've also got a way to augment — I can offer you high-quality press releases AND high-quality quantity outreach. Before it was about quality outreach; now it's quality AND quantity."

### Architecture
- **Orchestrator agent** (boss) manages the overall workflow
- **Sub-agents** created per client with specific guardrails, approved content, and rules of engagement
- Security guardrails essential — competitor policies, approved messaging, spokesperson rules
- Agents don't reply autonomously to journalists initially; they flag responses to the human team

### Case Study Plan
- Build and test the PR agent on Bluhalo first as a case study
- Spencer is comfortable taking the risk on his own business
- Patrick/Simpatico can then use the case study when selling the service to clients

---

## Grant Funding

- Patrick believes it's worth pursuing EU and UK tech grants once the platform is built
- **Innovate UK** — Spencer has a contact via a client (Rise & Amplify) who are applying there; can potentially network Patrick in
- **Bidx** — grant application service Patrick has found; charges £7,500–12,000 upfront (£12K gets unlimited applications) plus 2.5% of any grant awarded
- Caution: some grant programmes require ~£5,000 application fees with no guarantee of funding

---

## Agency Agentic Collective (Spencer's Idea)

Spencer pitched a larger concept: a social network/networking platform for agency AI agents.

### Concept
- Inspired by the social media site created for agents when OpenAI launched — agents joined, talked to each other, and shared information
- Agencies would send their AI agents to the network to discover, match, and share intelligence with peer agencies
- Humans can log in too — it augments traditional agency networking events

### PR Angle
"The world's first social network for agency AI" — a strong PR-able story that Spencer wants to test with a press release via the PR agent.

---

## Hosting & Infrastructure

| Component | Purpose |
|-----------|---------|
| **Replit** | Build and host the AIO Fusion platform |
| **OpenAI/Claude** | Power the AI agents (content analysis, optimisation, outreach) |
| **OpenClaw (hosted)** | Host the PR agent and sub-agents (~$50/month) |
| **GitHub** | Central code repository; eventually agents can maintain the platform via GitHub |

---

## Content Publishing (Agent-Ready)

Discussion about making approved press releases available for AI agent consumption:
- Platform would host approved client content
- Front-end could display press releases publicly (like a publisher)
- An "For Agents" button lets AI agents download/access structured content
- Back-office keeps unapproved/draft content private
- Clients may also want content on their own website, with AIO Fusion mirroring it for agent access

---

## Event

- Originally planned for 13 May — now pushed back ~1 month
- Want to launch AIO Fusion at the event
- Patrick has found a venue for ~£1,000
- Will finalise timing once the platform build is further along

---

## Next Steps

| # | Action | Owner |
|---|--------|-------|
| 1 | Send cost breakdown and proposal (build + credits + OpenClaw hosting) | Spencer |
| 2 | Arrange branding/logo for AIO Fusion | Patrick |
| 3 | Book half-day wireframe session | Both |
| 4 | Finalise wireframes — all screens, labels, flows | Both |
| 5 | Build the platform (~2–3 days) | Spencer |
| 6 | Set up hosted OpenClaw account for PR agent | Spencer |
| 7 | Design PR agent rules of engagement and guardrails | Both |
| 8 | Build and test PR agent on Bluhalo as case study | Spencer |
| 9 | Two half-day testing/bug-fixing sessions | Both |
| 10 | Explore Innovate UK grant — connect Patrick with Rise & Amplify contact | Spencer |
| 11 | Revisit event date — push back from May to ~June | Patrick |
