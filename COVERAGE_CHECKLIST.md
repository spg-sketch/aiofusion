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

## Scoring engine — how it works & how to manage it

Every project on the Authority Planner gets a **Visibility score (out of 50)** + an **Authority score (out of 50)** = **Total out of 100**. The Planner header sums these across all projects to give the projected programme score and breaks it down by content type.

### The three inputs

**1. Content-type weights** (visibility weight / authority weight, each out of 10):

| Content type | Visibility | Authority |
|---|---|---|
| Press release | 8 | 7 |
| Article | 7 | 8 |
| Case study | 6 | 9 |
| Whitepaper | 5 | 10 |
| Blog post | 6 | 5 |
| Social post | 8 | 3 |
| Event copy | 5 | 6 |
| Speaker submission | 4 | 8 |
| Award submission | 4 | 9 |
| Directory entry | 3 | 4 |

**2. Channel multiplier** (Visibility only) — `0.5 + (channels × 0.25)`, capped at 1.5×. So 1 channel = 0.75×, 4+ channels = 1.5×. Reaching more outlets boosts visibility but doesn't change authority.

**3. Status multiplier** (both scores) — discounts work-in-progress so the projected total reflects delivery confidence:
- Approved → 1.0×
- Review → 0.85×
- Drafting → 0.7×
- Planned → 0.5×

### The formulas

- **Visibility** = content-type vis weight × channel multiplier × status multiplier (scaled to /50)
- **Authority** = content-type auth weight × status multiplier (scaled to /50)
- **Total** = Visibility + Authority (/100)

Worked example — a Press release in Review status going to 4 channels:
- Channels: 0.5 + 4×0.25 = 1.5×
- Status: 0.85×
- Visibility ≈ 8 × 1.5 × 0.85 → ~26/50
- Authority ≈ 7 × 0.85 → ~17/50
- **Total ≈ 43/100**

Move the same project to Approved → ~30 visibility + ~20 authority = ~50/100.

### How to manage / tune the scoring (no code required)

The scoring engine is now fully tunable from the UI via the **"Scoring settings"** button in the Authority Planner header. All changes are persisted per-browser to `localStorage` (`aio.scoring.v1`).

Inside the panel:
- **Content type weights** — table of all content types with editable Visibility (0–10) and Authority (0–10) weights. Add new types or remove existing ones.
- **Channel multiplier** — edit the Base, Step, and Cap numbers that control how much extra Visibility each channel adds. Add or remove channels in the channel list (these populate the multi-select pills in the project edit modal).
- **Status multipliers** — set the discount for each status (Planned / Drafting / Review / Approved).
- **Reset to defaults** restores the original config; **Save settings** applies and recalculates every projected score live.

Live preview: every change shows immediately — open any project on the Planner and the **"Projected score"** panel at the bottom of the edit modal recalculates as you change content type / channels / status, and the header card updates the programme total in real time.

#### Safety behaviour when settings change
To prevent stale data from quietly inflating scores after you remove a channel or content type:
- On Save, all existing projects are **normalised**: any channel that no longer exists in the config is stripped from the project, and any project whose content type was removed is remapped to the first available type.
- The scoring engine itself only counts channels still present in the active config when computing the channel multiplier — so a removed channel never contributes to Visibility, even if it survives in legacy data.
- New projects created via "+ New project" are seeded from the first available content type and channel in the current config (no hardcoded fallbacks).

Developer notes (only relevant if extending core types): adding a new **status** still requires a code change — extend the `PlannerStatus` union and the `STATUS_COLOURS` map in `App.tsx`. Everything else is data-driven from the settings panel.

## Outstanding / for your decision
- ⏳ **Bluhalo references** — the demo data still uses Bluhalo as the seed client and there are a couple of legacy mentions (`agencyBrands` array, an "About" line, the unused `PressReleasePage.tsx` sample). I held off stripping these because you may want Bluhalo kept as the visible demo. Tell me which of these to remove and I'll do it.
- ⏳ Owned-channel deep technical tools (schema markup audit, robots.txt, H1–H3 audit, FAQ schema) — explicitly out of Phase 1 in our workflow doc, flagged for V2.
