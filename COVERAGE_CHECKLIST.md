# AIO Fusion — Build Coverage Checklist

Status of every item in the wireframe/scoring/objective feedback as it stands today.

Legend: ✅ done · ⚠️ partial · ⏳ flagged for next phase

## P1 — Global renames & quick wins
- ✅ "LLM Visibility" → "Earned Visibility" everywhere
- ✅ "For B2B" → "For In-house" everywhere
- ✅ Contact CTA wired to `mailto:info@aiofusion.ai`
- ✅ Landing nav reordered: Features · For In-house · For Agencies · Insights · About · Contact · Platform Login
- ✅ Hero headline: "Business visibility for the AI Age" + new supporting copy
- ✅ Centred logo enlarged on hero

## P2 — Landing page restructure
- ✅ Inline B2B / Agency sections deleted (now standalone pages)
- ✅ Agency logo strip removed
- ✅ "How it works" 6-step section added
- ✅ Features mirror the 8-tab dashboard structure with new copy

## P3 — New + rewritten pages
- ✅ For In-house ("Control and scale your PR and AI Visibility")
- ✅ For Agencies ("Integrate AI optimisation into your client service")
- ✅ Insights replaces Guide (B2B Marketer's Fast Guide + room for more articles)
- ✅ About (Designed by PR consultants, built with deep tech expertise)
- ✅ Contact (info@aiofusion.ai, LinkedIn placeholder, Substack placeholder)

## P4 — Sidebar / Dashboard restructure (3 sections)
- ✅ AIO Audit: AIO Diagnostic, Earned Visibility
- ✅ Website AI Optimisation: Client Intake (Tech), SEO Assessment, GEO Content Optimisation
- ✅ Content & Release: Content Optimiser, Authority Planner, Release Gateway, Archive, Measure & Report
- ✅ Empty-state on dashboard with "Create client programme" CTA
- ✅ Sidebar groups items under section headings

## P5 — Client Intake split + media dropdowns
- ✅ Tech Intake / Content Intake tab toggle
- ✅ Tech sections: 1, 2, 3, 7, 8 · Content sections: 4, 5, 6
- ✅ 4.8 — structured spokesperson list (name / title / expertise) with add/remove
- ✅ 4.9 — categorised media URL lists (Priority, National, Specialist A–D)
- ✅ Persisted to `localStorage` (`aio.intake.v1`)

## P6 — Content Optimiser overhaul
- ✅ Project Title field
- ✅ Content type dropdown (10 options: Press release, Article, Case study, Whitepaper, Blog post, Social post, Event copy, Speaker submission, Award submission, Directory entry)
- ✅ Target Media picker (driven from intake 4.9)
- ✅ Spokesperson picker (driven from intake 4.8)
- ✅ Rich-ish editor — Bold / Italic / Link / Image toolbar over a `contentEditable` body (focus-safe via `onMouseDown` so selection is preserved cross-browser)
- ✅ Action buttons: Optimise, Archive draft, Retrieve draft, Share draft (mailto), Approve & archive, Push to Planner, Download
- ✅ Dual URL/paste toggle removed
- ✅ Pushing to Planner creates a scored project entry
- ✅ Standalone Press Release editor removed from navigation (file `PressReleasePage.tsx` is no longer referenced)

## P7 — Authority Planner: weekly grid + scoring engine
- ✅ Table view — rows = ISO weeks, project cards inside each week with all spreadsheet columns
- ✅ Scoring engine: 50 visibility + 50 authority, weighted by content type, channel/status multipliers
- ✅ Status colour pills: Planned / Drafting / Review / Approved
- ✅ Multi-select channels, spokesperson dropdown
- ✅ Header card: projected total + Visibility / Authority breakdown
- ✅ Edit modal with live "Projected score" panel

## P8 — Release Gateway
- ✅ Unlocked nav item
- ✅ Manual download, LinkedIn share, 7 wire connector buttons

## P9 — Archive
- ✅ Unlocked nav item
- ✅ Storage of optimised drafts/finals with tags (`aio.archive.v1`)
- ✅ Search/filter by project type, message, title, spokesperson

## P10 — Measure & Report restructure
- ✅ Tabs: Action Plan · Executive Summary · Detailed Audit · Released Content
- ✅ Released Content metrics: audience reach, pieces released, visibility / piece, ideas → outcomes
- ✅ Coverage per key message bars
- ✅ Volume by content type, volume by media tier, social impact, volume by spokesperson

## P11 — Test + checklist
- ✅ Cross-browser end-to-end test passed in **Chromium, Firefox and WebKit (Safari engine)** — full flow: landing → login → client → sidebar groups → Authority Planner + New project modal → Client Intake Tech/Content tabs → spokesperson list + categorised media → Content Optimiser action buttons → Release Gateway → Archive → Measure & Report (all four tabs incl. Released Content)
- ✅ Code review pass (final fix applied: toolbar uses `onMouseDown` + `preventDefault` so selection isn't lost when clicking Bold/Italic/Link/Image)
- ✅ This coverage checklist

## Outstanding / for your decision
- ⏳ **Bluhalo references** — the demo data still uses Bluhalo as the seed client and there are a couple of legacy mentions (`agencyBrands` array, an "About" line, the unused `PressReleasePage.tsx` sample). I held off stripping these because you may want Bluhalo kept as the visible demo. Tell me which of these to remove and I'll do it.
- ⏳ Owned-channel deep technical tools (schema markup audit, robots.txt, H1–H3 audit, FAQ schema) — explicitly out of Phase 1 in our workflow doc, flagged for V2.
