# AIO Fusion — Visual Style Guide & Brief
## Login / Platform Home / Project Hub / Dashboard

This document captures the visual design system currently implemented across the AIO Fusion platform, based on client-approved styling. It is intended as a reference for keeping remaining pages consistent.

---

## 1. Core Principle

**Light, white-card design system.** The client has approved:
- White/light page backgrounds as the default surface for content pages (Login/Platform Home, Project Hub).
- **One deliberate exception**: the in-project **Dashboard** page uses a solid teal background (`#1A647B`) as its page backdrop, with white content cards floating on top for contrast.
- White cards throughout, with a **hover-lift + highlight** animation, so interactive elements read clearly as "clickable."

---

## 2. Colour Palette

### Brand / accent
| Token | Hex | Usage |
|---|---|---|
| Navy (ink) | `#0a1628` / `#102B36` | Primary headings, dark UI surfaces (top account bar, Marketing Loop panel) |
| Pink/coral accent | `#C8497A` | Primary CTA buttons, active states, key numbers, pill badges |
| Pink soft wash | `#FBE3ED` | Badge backgrounds (e.g. "Authority Dashboard" pill) |
| Card wash (orange-pink) | `#FBF1F0` (solid) / hover `#F3D7D5` | Secondary dashboard card backgrounds |
| Teal (dashboard backdrop only) | `#1A647B` | Dashboard page background |
| Teal (icon accent, unrelated) | `#4f8fff` | Icon tint color, "teal" token name in code but renders blue |

### Neutrals
| Token | Hex | Usage |
|---|---|---|
| g50 | `#FAFAFA` | Rare, lightest tint |
| g100 | `#F1F5F9` | Subtle chip backgrounds |
| g200 | `#E2E8F0` | Borders, dividers |
| g300 | `#CBD5E1` | Disabled/muted dots |
| g400 | `#64748B` | Secondary text, muted labels |
| g500 | `#475569` | Body copy, card sub-text |
| g600 | `#334155` | Slightly darker body text |
| cream (page bg default) | `#f8fafc` | Default light page background (all pages except Dashboard) |

### Status colours
| Token | Hex | Usage |
|---|---|---|
| Green | `#22c55e` | Success / completed state |
| Amber | `#f59e0b` | Warning / in-progress |
| Red | `#ef4444` | Error / overdue |

### Sidebar section colours (solid, not translucent)
| Section | Hex |
|---|---|
| Dashboard (top item) | Navy `#0a1628` |
| Project Set-Up | `#DE7A38` |
| Visibility Audits | `#A4CCD4` |
| Content Management | `#D4922A` |
| Media Management | `#84AB7D` |
| Marketing Intelligence | `#736EAE` |
| Reporting | `#A0A095` |

All sidebar section text/icons render in solid black (`#000000`) for contrast against these mid-tone solid backgrounds; active items get a white-tinted overlay (`rgba(255,255,255,0.16)` bg + `rgba(255,255,255,0.35)` border). Section heading labels (e.g. "PROJECT SET-UP", "VISIBILITY AUDITS") are uppercase, bold, letter-spacing ~0.14em, at 13px (increased from 11px for legibility).

Within the Visibility Audits section, saved audit report rows (date + score, shown under "Earned Media Visibility Audit" and "Website Visibility Audit") use a darker grey (`#4B5563`) for both the date/time text and the score, rather than the lighter `g500`, so recent reports stand out more clearly.

---

## 3. Page Backgrounds (by page)

| Page | Background |
|---|---|
| Login / Platform Home | `#f8fafc` (light) |
| Project Hub | `#f8fafc` (light), with cards floating on it — **note**: current screenshot shows a teal backdrop around the white Project Hub card; confirm with client whether Project Hub should also sit on light `#f8fafc` or intentionally keep a teal frame like Dashboard. *(Flagged for decision — see Section 7.)* |
| Dashboard (in-project) | `#1A647B` solid teal — **intentional, client-approved exception** |
| Project Set-Up | `#1A647B` solid teal — matches Dashboard's teal backdrop; all internal cards (AI-assist panel, track switcher, sections nav, Project Data Actions, section body) remain white/pink-wash so they float on the teal, same pattern as Dashboard's metric cards. Header text sitting directly on the teal (page title, intro copy, "Save for later" button) switches to white/`rgba(255,255,255,0.85)`, matching how the Dashboard's heading/subtitle render on its teal background (see Section 4). |
| Sidebar | White (`#ffffff`), always, regardless of main content background |

---

## 4. Typography

- **Headings** (page titles like "Welcome to AIO Fusion", "Master Project Hub", client name on Dashboard): serif display font — `'Alice', Georgia, serif` — set in navy `#102B36`/`#0a1628` on light backgrounds, white `#ffffff` on the teal Dashboard background.
- **Body copy / subtitles**: sans-serif, `g500`/`g600` on light backgrounds; `rgba(255,255,255,0.85)` on the teal Dashboard background.
- **Eyebrow labels / section labels** (e.g. "AUTHORITY DASHBOARD", "GUIDANCE"): uppercase, bold, letter-spacing ~0.18–0.22em, small size (10–11px), accent pink or navy depending on context.
- **Card titles**: bold, 14–15px, navy.
- **Card sub-text**: 11–13px, g400/g500, regular/light weight.

---

## 5. Card System

### Primary/hero card (e.g. Authority Score, "Start a New Piece of Work")
- Solid accent background (`vars.accent` pink `#C8497A`), white text/icons.
- Rounded corners `rounded-2xl`.
- Hover: lift (`-translate-y-2`), stronger shadow, white ring highlight (`ring-white/60`).

### Secondary cards (all other dashboard tiles, Project Hub project tiles, Platform Home guidance cards)
- **White background** on light pages (Login, Project Hub, guidance cards).
- **Solid pale pink/cream wash** (`#FBF1F0`, hover `#F3D7D5`) for Dashboard's secondary metric cards specifically — this keeps them visually distinct even against the teal page background (do not use translucent/rgba washes here, as they blend unpredictably with whatever the page background is).
- Border: `1px solid #E2E8F0` (g200) on white cards.
- Rounded corners: `rounded-2xl`.
- **Hover animation** (the "highlight as you go" the client likes):
  - Lift: `hover:-translate-y-1` to `-translate-y-2`
  - Shadow: `hover:shadow-lg` / `hover:shadow-xl`
  - Ring highlight: `hover:ring-[3px] hover:ring-[#C8497A]` (pink ring) or `hover:ring-white/60` on dark/accent cards
  - Icon scale: icon chip scales up slightly on hover (`group-hover:scale-110`)
  - Background shift on wash cards: deepens to the hover wash colour on hover

### Icon chips (inside cards)
- Small rounded-square or circle, soft tint background (e.g. `rgba(79,143,255,0.1)` blue-tint, or `g100`), icon in navy or accent colour.
- Scale up on hover to reinforce interactivity.

---

## 6. Buttons

### Primary CTA (pink pill)
- Background: `#C8497A`
- Text: white, bold, uppercase, letter-spacing wide (tracking-wider)
- Shape: fully rounded (`rounded-full`)
- Example: "Project Home", "Platform Home", "Create Content", "Repeat" (Marketing Loop)
- Hover: `brightness-110` or slight lift

### Secondary/outline buttons
- Transparent or white background, `1px` border in navy/g200, navy or white text depending on backdrop
- Used for: "Manage Accounts", "Token Usage", "Sign Out", "Archive/Delete/Enter" row actions on Project Hub cards

### Small inline text links (e.g. "Open Comms Planner →", "View Project Set-Up →")
- Accent pink `#C8497A`, bold, with trailing arrow icon that nudges right on hover.

---

## 7. Sidebar (reference, already implemented)

- White background throughout.
- Logo centered at top, sized ~20% larger than original (h-24).
- No subtitle tagline below logo (removed per client request).
- Client logo box below the main logo: centered, enlarged (14×14), with a darker navy 2px border for prominence. No back-arrow or "Switch project" label here — that action is now covered entirely by the "Project Hub" button directly below.
- **"Project Hub"** pink pill button below the client logo (returns to Project Hub; relabelled from "Project Home").
- **Dashboard** nav item: solid navy background, white text, white icon chip.
- Six colour-coded sections below (see palette table above), each a solid rounded block containing nav items; black text/icons for contrast; active item gets white overlay highlight; section heading labels at 13px uppercase (see palette table above for full detail).
- Item icons/Dashboard icon have a subtle hover scale to signal interactivity (locked/V2 items excluded).
- Admin/account footer at the bottom (dark chip, avatar, tier label).

---

## 8. Animation & Interaction Language

The signature "feel" the client likes:
1. **Lift on hover** — cards and buttons rise slightly (`translate-y`) rather than just changing colour.
2. **Ring highlight on hover** — a colored ring/border appears around the card, drawing the eye without being jarring.
3. **Icon micro-interaction** — icon chips scale up slightly on hover, reinforcing that the tile is a live control, not just a static tile.
4. **Shadow deepens on hover** — from subtle to a more pronounced elevation shadow.
5. Transitions should be smooth (`transition-all duration-300`), never instant/jarring.

---

## 9. Page-by-Page Summary (from attached screenshots)

### Login / Platform Home
- White background.
- Serif "Welcome to AIO Fusion" heading with pink accent word.
- Dark navy "signed in as" account panel with pink "Project Hub →" CTA.
- Dark navy "AIO Marketing Loop" panel with 8 white step tiles + 1 pink "Repeat" tile — same hover-lift language applies to the step tiles.
- "How AIO Fusion works" guidance cards: white background, outlined border, icon chip top-left, "ARTICLE"/"VIDEO" tag top-right.

### Project Hub
- White "Master Project Hub" card containing 3 pink-wash action tiles (Create Project / Archived Projects / Guidance).
- Below it, a grid of white project tiles: logo/initials avatar, project name, "Earned Media Audit Score" stat, and 3 small action buttons (Archive/Delete/Enter) in pink-tinted pill style.
- Page backdrop currently teal in the screenshot — **flagged in Section 3 for client confirmation**, since the Hub card itself and its children are all white/light, consistent with the "white background" preference described.

### Dashboard (in-project)
- Teal page background (approved exception).
- White/pink-wash metric cards as described in Section 5.
- White "Activity Pipeline" panel and bottom quick-link tiles.
- Sidebar remains white regardless.

---

## 10. Open Question for Client Sign-off

The current build has the **Dashboard** page background as teal, while **Login/Platform Home and Project Hub** are light. Please confirm this split is intentional — i.e., that teal is reserved specifically for the in-project Dashboard as a "focus" backdrop, while every other page (Login, Project Hub) stays on the light `#f8fafc` background with white cards. This document assumes that is the agreed direction based on recent feedback.
