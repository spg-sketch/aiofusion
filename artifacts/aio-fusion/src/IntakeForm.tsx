import { useState, useEffect, useMemo, useRef } from "react";
import {
  ChevronRight,
  ChevronDown,
  Check,
  Copy,
  Building2,
  Target,
  Users,
  Mic2,
  Globe,
  HelpCircle,
  ShieldCheck,
  Eye,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  Sparkles,
  Plus,
  X,
  Linkedin,
  Download,
  FileText,
  Info,
  Save,
  Undo2,
  Loader2,
  Wand2,
} from "lucide-react";
import { TRADE_MEDIA_CATEGORIES } from "./tradeMediaCategories";
import { markIntakeSaved, ensureDefaultIntakeMigrated, assertActiveProjectConsistencyFromCache } from "./lib/projectSync";
import { stripEmDashes, normaliseAddedData } from "./lib/utils";
import CountdownBanner from "./components/CountdownBanner";
import { recordAuditDuration, getAuditDurationSeconds, getAuditSampleCount, getTypicalDurationHint } from "./lib/auditTiming";

const vars = {
  navy: "#0a1628",
  accent: "#C8497A",
  teal: "#4f8fff",
  green: "#22c55e",
  amber: "#f59e0b",
  coral: "#C8497A",
  cream: "#f8fafc",
  gold: "#C9A04E",
  g50: "#FAFAFA",
  g100: "#F1F5F9",
  g200: "#E2E8F0",
  g300: "#CBD5E1",
  g400: "#64748B",
  g500: "#475569",
  g600: "#334155",
};

type Track = "pr" | "web";

type Spokesperson = { name: string; title: string; expertise: string[]; linkedin: string };

// Expertise began life as a single free-text string and is now a repeatable
// list of areas. Only fall back to wrapping the legacy string when it is NOT
// already an array, so saved multi-area data is never flattened.
function normaliseExpertise(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === "string");
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

type Product = { name: string; description: string; audience: string };

type ProductQuery = { area: string; phrases: string };

type LlmQueries = { v: 1; discovery: string[]; shortlist: string[]; comparison: string[] };

type FieldDef = {
  id: string;
  label: string;
  hint?: string;
  type: "text" | "textarea" | "checkbox" | "heading" | "dual" | "dual-list" | "llm-queries" | "string-list";
  options?: string[];
  single?: boolean;
  shortPlaceholder?: string;
  longPlaceholder?: string;
  wordLimit?: number;
  // dual-list copy overrides (default wording is "message"). itemLabel is the
  // singular noun used in the entry header and Remove button; addLabel is the
  // full Add-button text. singleField renders only the long box (one box per
  // entry) instead of the short + long pair.
  itemLabel?: string;
  addLabel?: string;
  singleField?: boolean;
  // Optional field: shown and usable, but excluded from completion percentage
  // and the "fully complete" gate so it never blocks downstream actions.
  optional?: boolean;
  // Conditional field: only applies (counts toward completion + is shown) when
  // the parent field's selected value includes one of these options.
  dependsOn?: { field: string; includes: string[] };
};

// A conditional follow-up field only "applies" when its parent answer matches.
// Non-applicable fields are hidden and excluded from the completion count.
const fieldApplies = (f: FieldDef, formData: Record<string, string | string[]>): boolean => {
  if (!f.dependsOn) return true;
  const parent = formData[f.dependsOn.field];
  const arr = Array.isArray(parent) ? parent : [];
  return f.dependsOn.includes.some((opt) => arr.includes(opt));
};

type SectionDef = {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  icon: typeof Building2;
  intro: string;
  fields: FieldDef[];
  track: Track;
};

// Escape user/content text for safe insertion into a print document.
function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Wrap a body of HTML in the shared branded print template (logos, fonts,
// print CSS, and the image-wait-then-print script). Title and subtitle must
// already be escaped by the caller. Used for the project-data export, the
// per-section question sheets and the how-to guide so they all look the same.
function buildPrintHtml(opts: { title: string; subtitle: string; bodyHtml: string; aioLogo: string; clientLogoBlock: string }): string {
  const { title, subtitle, bodyHtml, aioLogo, clientLogoBlock } = opts;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  @page { margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1C1C1C; margin: 0; }
  .header { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 2px solid #C8497A; padding-bottom: 14px; margin-bottom: 18px; }
  .aio-logo { height: 40px; width: auto; }
  .client-logo { height: 46px; max-width: 160px; object-fit: contain; }
  h1 { font-family: Georgia, "Times New Roman", serif; font-size: 22px; color: #102B36; margin: 0 0 4px; }
  .status { font-size: 11px; color: #6B7280; margin: 0 0 22px; }
  .sec { margin-bottom: 22px; break-inside: avoid; }
  h2 { font-family: Georgia, "Times New Roman", serif; font-size: 15px; color: #102B36; margin: 0 0 8px; border-bottom: 1px solid #E5E7EB; padding-bottom: 4px; }
  h3 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #C8497A; margin: 14px 0 6px; }
  .secintro { font-size: 12px; color: #4B5563; line-height: 1.5; margin: 0 0 14px; }
  .f, .q { margin-bottom: 10px; break-inside: avoid; }
  .q { margin-bottom: 16px; }
  .fl { font-size: 12px; font-weight: 700; color: #102B36; margin-bottom: 2px; }
  .hint { font-size: 11px; color: #6B7280; font-style: italic; margin-bottom: 6px; }
  .ans { border-bottom: 1px solid #D1D5DB; min-height: 26px; margin-top: 4px; }
  .v { font-size: 12px; line-height: 1.5; color: #1C1C1C; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; }
  .v ul { padding-left: 16px; margin: 0; }
  .v li { margin-bottom: 3px; }
  .guide { font-size: 12.5px; line-height: 1.6; color: #1C1C1C; }
  .guide p { margin: 0 0 10px; }
  .guide ol, .guide ul { padding-left: 18px; margin: 0 0 12px; }
  .guide li { margin-bottom: 6px; }
  .np { color: #9CA3AF; font-style: italic; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head>
<body>
  <div class="header">
    <img src="${aioLogo}" alt="AIO Fusion" class="aio-logo" />
    ${clientLogoBlock}
  </div>
  <h1>${title}</h1>
  <p class="status">${subtitle}</p>
  ${bodyHtml}
  <script>
    (function () {
      var fired = false;
      function go() { if (fired) return; fired = true; try { window.focus(); window.print(); } catch (e) {} }
      var imgs = Array.prototype.slice.call(document.images);
      var pending = imgs.length;
      if (pending === 0) { go(); return; }
      function one() { if (--pending <= 0) go(); }
      imgs.forEach(function (img) {
        if (img.complete) { one(); }
        else { img.addEventListener("load", one); img.addEventListener("error", one); }
      });
      setTimeout(go, 2500);
    })();
  </script>
</body></html>`;
}

type DualValue = { short: string; long: string };
type DualListValue = DualValue[];

// Fields that began as a single free-text answer but are now repeatable dual-list
// entries. Their old answer is migrated into one entry, but only when the field
// has no dual-list data yet, so clearing all entries cannot bring the legacy
// text back.
const LEGACY_DUAL_LIST_IDS = ["3.1", "3.2", "3.5", "3.6"];
function migrateLegacyDualLists(
  dualLists: Record<string, DualListValue>,
  formData: Record<string, unknown>,
): Record<string, DualListValue> {
  const next = { ...dualLists };
  for (const id of LEGACY_DUAL_LIST_IDS) {
    if (next[id] === undefined) {
      const legacy = formData?.[id];
      if (typeof legacy === "string" && legacy.trim()) {
        next[id] = [{ short: "", long: legacy }];
      }
    }
  }
  return next;
}

const ACTIVE_PROJECT_KEY = "aio.activeProjectId";

// Resolve the localStorage key for the currently active project's intake data.
// Every project, including the legacy "default" one, now uses its own namespaced
// key so two projects can never collide on the bare key across devices.
function currentIntakeKey(): string {
  try {
    const id = localStorage.getItem(ACTIVE_PROJECT_KEY);
    if (id) {
      // The legacy "default" project moved off the bare key onto its own
      // namespaced key. Migrate (copy) it across before resolving the key so the
      // form always reads the answers, never an empty namespaced slot.
      if (id === "default") ensureDefaultIntakeMigrated();
      return `aio.intake.v2::${id}`;
    }
  } catch { /* noop */ }
  return "aio.intake.v2";
}

// Set which project's intake data is active. Call this before navigating into
// the intake form or dashboard so reads and writes target the right project.
// After writing the value, a lightweight consistency check verifies the new ID
// is in the user's known project list (populated by setKnownProjectIds on each
// sync). If it is not, the stale value is cleared and a warning is emitted.
export function setActiveProjectId(id: string | null): void {
  try {
    if (id == null) {
      localStorage.removeItem(ACTIVE_PROJECT_KEY);
    } else {
      localStorage.setItem(ACTIVE_PROJECT_KEY, id);
    }
  } catch { /* noop */ }
  assertActiveProjectConsistencyFromCache();
}

// Read which project is currently active, so other stores (planner, archive)
// can scope their data per project in the same way the intake data does.
export function getActiveProjectId(): string | null {
  try { return localStorage.getItem(ACTIVE_PROJECT_KEY); } catch { return null; }
}

const PROJECT_DATA_ARCHIVE_KEY = "aio.projectData.archive.v1";

// Per-question Optimise rewrites the user's OWN answer via the AI backend
// (POST /api/ai-assist/optimise-field). The control is offered on every
// free-text answer (textarea, dual and dual-list), except 1.4, 1.5, 1.7, 2.6, 2.7, 3.1,
// 3.2, 3.5, 3.6 and the structured fields below (products, search phrases, personas,
// ICPs, pain points, outcomes, spokespeople and the two media-category pickers).
// Keep the excluded ids and the optimisable types in sync with the backend.
const OPTIMISE_EXCLUDED_IDS = new Set(["1.4", "1.5", "1.7", "2.6", "2.7", "3.1", "3.2", "3.5", "3.6", "1.8", "1.9", "1.10", "4.7", "4.8", "5.2", "5.5", "6.1", "6.2", "6.3", "6.6", "6.7", "7.3"]);
const OPTIMISABLE_FIELD_TYPES = new Set(["textarea", "dual", "dual-list"]);
const isOptimisableField = (f: FieldDef): boolean =>
  OPTIMISABLE_FIELD_TYPES.has(f.type) && !OPTIMISE_EXCLUDED_IDS.has(f.id);

const wordCount = (s: string) => (s.trim() === "" ? 0 : s.trim().split(/\s+/).length);

// PR Set-Up sections 1–3 + AIO Set-Up sections 4–7. Field IDs are renumbered
// to match the user-visible section numbers so LLMs can reference them
// unambiguously (e.g. "Part 1.2" = section 1, field 2).
const sections: SectionDef[] = [
  // ── PR Set-Up: Section 1 ────────────────────────────────────────────
  {
    id: "earned-media",
    track: "pr",
    number: 1,
    title: "Earned Media: Message Framework",
    subtitle: "Boilerplate, message hierarchy, spokespeople and trade media categories",
    icon: Mic2,
    intro:
      "Earned media is one of the highest-authority signals for GEO. AI models are trained on the open web: a well-placed article in a credible outlet is more powerful than any on-site SEO tactic. The fields below feed every other module - Optimiser, Comms Planner, Content Creator, Media Research and Marketing Intelligence.",
    fields: [
      { id: "h-bp", label: "Core Boilerplate", type: "heading" },
      {
        id: "1.1",
        label: "250-word company descriptor",
        hint: "Enter or draft the raw ingredients for a new 250-word company descriptor for press use.",
        type: "textarea",
        wordLimit: 250,
      },
      { id: "h-mh", label: "Message Hierarchy", type: "heading" },
      {
        id: "1.2",
        label: "Primary Message",
        hint: "Enter a Primary Message providing a short summary (no more than 10 words). And a longer version of no more than 25 words.",
        type: "dual",
        shortPlaceholder: "≤10 words - e.g. AI authority for PR",
        longPlaceholder: "≤25 words - the longer version that adds proof and context",
      },
      {
        id: "1.3",
        label: "Additional Messages",
        hint: "For each additional message provide a short summary (no more than six words). And a longer version of no more than 25 words.",
        type: "dual-list",
        shortPlaceholder: "≤6 words",
        longPlaceholder: "≤25 words",
      },
      { id: "h-ev", label: "Evidence", type: "heading" },
      {
        id: "1.4",
        label: "Online evidence",
        hint: "Cut and paste links to web pages evidencing company statistics, case studies, awards, certificates, third-party validation.",
        type: "textarea",
      },
      {
        id: "1.5",
        label: "What to avoid",
        hint: "Messages, terminology, clients, key competitors, industry issues, links to media articles, research, data or other information you do not wish to be associated with or wish to avoid.",
        type: "textarea",
      },
      { id: "h-sp", label: "Semantic Phrase Guide & Topics", type: "heading" },
      {
        id: "1.6",
        label: "LLM search queries — how prospective clients find you",
        hint: "Generate your top 12 queries or type your own. Three groups reflect the B2B buying journey: Discovery (researching the problem), Shortlist (looking for a provider), and Comparison and trust (evaluating you against others). These queries are fired verbatim at AI models in your Earned Media Visibility Audit. Comparison queries include your website domain in brackets (e.g. SMG (smg.com)) so AI engines evaluate the right company — essential when your name is an acronym or short phrase that other organisations share.",
        type: "llm-queries",
      },
      {
        id: "1.7",
        label: "Topics and themes for spokespeople and contributed content",
        hint: "Note, this should mirror your messaging. These become your GEO content pillars.",
        type: "textarea",
      },
      {
        id: "1.8",
        label: "Spokespeople (used by Optimiser, Creator and Media Research)",
        hint: "Add each media spokesperson with name, title, area of expertise, and LinkedIn URL.",
        type: "textarea",
      },
      {
        id: "1.9",
        label: "Media categories your business operates in",
        hint: "Multi-select the categories that describe your own sector and the trade press you appear in. These feed the Optimiser, Planner and Media Research dropdowns.",
        type: "textarea",
      },
      {
        id: "1.10",
        label: "Media categories where your customers are found",
        hint: "Multi-select the categories your target customers read and trust. This helps target coverage where your audience actually is.",
        type: "textarea",
      },
    ],
  },
  // ── PR Set-Up: Section 2 (FAQ + 3 items moved from old Web Section 5) ──
  {
    id: "faq",
    track: "pr",
    number: 2,
    title: "FAQ & Customer Questions",
    subtitle: "AI-ready answers to what your audience actually asks, plus core product / service framing",
    icon: HelpCircle,
    intro:
      "FAQ pages with FAQ Schema markup are one of the most reliable AEO tactics. Google's AI Overviews and voice search assistants regularly pull directly from FAQ content. The product / service framing in 2.5–2.7 keeps your earned media and website language aligned.",
    fields: [
      {
        id: "2.1",
        label: "Top 10–15 questions customers ask before buying or signing up",
        hint: "Write each question exactly as a customer would ask it, and provide the ideal answer in 2–4 sentences.",
        type: "textarea",
      },
      {
        id: "2.2",
        label: "Questions customers ask after they become clients",
        hint: "Support, operations, technical. These often reveal unmet informational needs.",
        type: "textarea",
      },
      {
        id: "2.3",
        label: "Misconceptions or objections prospects commonly have",
        hint: "Misconception-busting content scores highly in AI answers.",
        type: "textarea",
      },
      {
        id: "2.4",
        label: "Industry or category questions your business is uniquely qualified to answer",
        hint: "These are GEO gold: becoming the go-to source for category questions builds AI-model authority over time.",
        type: "textarea",
      },
      { id: "h-pcs", label: "Core Positioning, Products & Phrases", type: "heading" },
      {
        id: "2.5",
        label: "Homepage descriptor or proposed positioning copy",
        hint: "Enter your current homepage descriptor or your proposed positioning copy - no more than 50 words.",
        type: "textarea",
        wordLimit: 50,
      },
      {
        id: "2.6",
        label: "Each core product or service",
        hint: "Add each product or service in its own entry: the name, a one-sentence description and its primary audience. Use Add product / service for as many as you need.",
        type: "textarea",
      },
      {
        id: "2.7",
        label: "Search phrases and questions for each product or service area",
        hint: "Add each product or service area in its own entry, then list its search phrases and questions. Think in questions as well as keywords. Use Add product / service area for as many as you need.",
        type: "textarea",
      },
    ],
  },
  // ── PR Set-Up: Section 3 (moved from Web, with Patrick's copy edits) ──
  {
    id: "audience",
    track: "pr",
    number: 3,
    title: "Audience & Intent Mapping",
    subtitle: "Who you're talking to and what they need to hear",
    icon: Users,
    intro:
      "AI engines retrieve content that best matches user intent, not just keywords. Defining your audiences and the language they use is essential for both GEO and AEO.",
    fields: [
      {
        id: "3.1",
        label: "Who is the ideal target client or customer?",
        hint: "List the different job titles and a brief description of their function. Add a persona for each one - the first persona is your primary customer, the second your secondary, and so on. Include seniority, function, sector or life stage where it helps.",
        type: "dual-list",
        itemLabel: "persona",
        addLabel: "+ Add persona",
        shortPlaceholder: "Job title - e.g. Head of Marketing",
        longPlaceholder: "Brief description of their function and seniority",
      },
      {
        id: "3.2",
        label: "What is the ideal target client profile?",
        hint: "Describe the size and type of organisation you serve so the Visibility Audit looks for the right kind of provider, not just the household-name firms. Add a separate profile for each ideal client type, including employee bands or revenue ranges and whether they are boutique, mid-market or enterprise. Example one: small to mid-sized marketing and creative agencies, 10 to 150 staff, under 20m revenue, not the large global consultancies. Example two: medium to enterprise-level financial services companies specialising in retail banking services, with 5,000 plus staff and revenue of more than 50m. Example three: SMEs in multiple sectors seeking to transform and enhance their CRM and retention operations, with 100 to 5,000 staff and revenues between 5 and 100m.",
        type: "dual-list",
        itemLabel: "ICP",
        addLabel: "+ Add multiple ICPs",
        singleField: true,
        longPlaceholder: "Describe one ideal client profile - size, sector and type",
        optional: true,
      },
      {
        id: "3.3",
        label: "Locations where you work with clients - cities, countries and regions",
        hint: "List the cities, countries and regions where your clients are based. AI searches are often localised, so this helps the Visibility Audit check how you show up in the places that matter to you. Example: London and the South East, UK-wide, Ireland, and EMEA.",
        type: "string-list",
        optional: true,
      },
      {
        id: "3.5",
        label: "What are the most common pain points, frustrations, or unmet needs your potential clients / customers have before finding you?",
        hint: "Add each pain point in its own box so they stay distinct. Use Add problem for as many as you need.",
        type: "dual-list",
        itemLabel: "problem",
        addLabel: "+ Add problem",
        singleField: true,
        longPlaceholder: "Describe one pain point, frustration or unmet need",
      },
      {
        id: "3.5b",
        label: "What challenges do you solve for them?",
        hint: "Describe the challenges you solve in as much detail as possible. Link to case studies or evidence where you can.",
        type: "textarea",
      },
      {
        id: "3.6",
        label: "What outcome do clients / customers most want to achieve by working with you? Please provide examples and links to case studies or evidence.",
        hint: "Add each example or case study in its own box. Include links to evidence where you can. Use Add example for as many as you need.",
        type: "dual-list",
        itemLabel: "example",
        addLabel: "+ Add example",
        singleField: true,
        longPlaceholder: "Describe one outcome, with a case study or evidence link",
      },
    ],
  },
  // ── AIO Set-Up: Section 4 (Business & Brand Fundamentals) ────────────
  {
    id: "fundamentals",
    track: "web",
    number: 4,
    title: "Business & Brand Fundamentals",
    subtitle: "Core identity: who you are and what you do",
    icon: Building2,
    intro:
      "These answers underpin every piece of optimised content. Be as precise as possible: vague inputs produce vague outputs.",
    fields: [
      { id: "4.1", label: "Full legal name of the business or brand", type: "text" },
      { id: "4.2", label: "Trading names, product names or sub-brands", type: "textarea" },
      {
        id: "4.3",
        label: "Create or adapt a short, one sentence LLM-readable boilerplate for your business or brand.",
        hint: "For example: \"We help [audience] do [outcome] by [method].\" This becomes your AI-readable boilerplate.",
        type: "textarea",
      },
      {
        id: "4.4",
        label: "Sector or industry",
        hint: "Define your sector or industry. Add the main industry or sector your business operates in. Include sub-sectors if relevant (but do not add a full SEO term list). This shapes schema markup and entity classification.",
        type: "text",
      },
      {
        id: "4.5",
        label: "Geographies of operation",
        hint: "List all countries, regions or cities. Local entity signals are critical for GEO.",
        type: "textarea",
      },
      {
        id: "4.6",
        label: "Founding year",
        hint: "The year the business was founded, e.g. 2014.",
        type: "text",
      },
      {
        id: "4.7",
        label: "Key trust signals - submit links to key media coverage over the last 12 months",
        hint: "Add links to your most important media coverage from the last 12 months. Include the outlet name alongside each link where you can.",
        type: "textarea",
      },
      {
        id: "4.8",
        label: "Primary competitors",
        hint: "Helps calibrate entity differentiation in AI model training contexts.",
        type: "string-list",
      },
      {
        id: "4.9",
        label: "Other companies with a similar name that we are NOT",
        hint: "Optional — only fill this in if AI engines are confusing you with another organisation that shares your name. Add one per line, e.g. \"BlueHalo LLC (US defence contractor)\". These will be used to anchor the identity probe so engines answer about the right company.",
        type: "string-list",
        optional: true,
      },
    ],
  },
  // ── AIO Set-Up: Section 5 (GEO vs AEO Priority Assessment) ───────────
  {
    id: "priority",
    track: "web",
    number: 5,
    title: "GEO vs AEO Priority Assessment",
    subtitle: "Determine which optimisation approach should lead",
    icon: Target,
    intro:
      "GEO (Generative Engine Optimisation) focuses on being cited by AI systems like ChatGPT, Claude and Gemini. AEO (Answer Engine Optimisation) focuses on appearing in direct-answer features.",
    fields: [
      { id: "h-biz", label: "Business Model Signals", type: "heading" },
      {
        id: "5.1",
        label: "How do most customers first find and decide on you?",
        hint: "Select all the paths that apply to your customers. If it is genuinely split, you can tick more than one, and use \"A mix\" to explain below.",
        type: "checkbox",
        optional: true,
        options: [
          "Search-led: they search, read our website, then contact us or buy",
          "Referral-led: they hear of us via press, podcasts, social or word of mouth, then look us up",
          "AI-led: they increasingly find or vet us through AI tools or voice assistants",
          "Local-led: maps and local search in our area are how they find us",
          "Direct marketing",
          "Direct email prospecting",
          "A mix: describe below",
        ],
      },
      { id: "5.1b", label: "If a mix, describe:", type: "textarea", dependsOn: { field: "5.1", includes: ["A mix: describe below"] } },
      {
        id: "5.2",
        label: "How do your best customers typically find you?",
        hint: "Rank the top 3 channels if you know them.",
        type: "textarea",
      },
      {
        id: "5.3",
        label: "Decision speed",
        type: "checkbox",
        optional: true,
        options: [
          "Quick / transactional (minutes to hours)",
          "Considered (days to weeks, research-heavy)",
          "Complex / enterprise (months, multiple stakeholders)",
        ],
      },
      { id: "h-vis", label: "Content & Visibility Signals", type: "heading" },
      {
        id: "5.4",
        label: "Do you produce thought leadership, guides, reports or commentary that others cite?",
        type: "checkbox",
        optional: true,
        options: [
          "Yes, regularly",
          "Infrequently",
          "No",
        ],
      },
      { id: "5.4b", label: "If yes, roughly how many per year?", type: "text", dependsOn: { field: "5.4", includes: ["Yes, regularly", "Infrequently"] } },
      {
        id: "5.5",
        label: "Has your brand been mentioned in AI-generated answers?",
        hint: "If yes: what context? Which tools? What is said? Please note you will be able to run a full test for your business after this form is completed.",
        type: "textarea",
      },
      {
        id: "5.6",
        label: "Top customer questions before buying (up to 10)",
        hint: "These become the backbone of your AEO FAQ and answer-first content strategy.",
        type: "textarea",
      },
      {
        id: "5.7",
        label: "List industry trends, issues or topics where you have unique or specialist expertise or data",
        type: "textarea",
      },
    ],
  },
  // ── AIO Set-Up: Section 6 (Schema Markup & Technical Signals) ────────
  {
    id: "schema",
    track: "web",
    number: 6,
    title: "Schema Markup & Technical Signals",
    subtitle: "Organization schema, robots.txt, AI crawlers and structured data",
    icon: ShieldCheck,
    intro:
      "Schema markup translates your content into machine-readable data that AI systems process directly. Without it, AI models infer - which means inconsistency, omission and sometimes error.",
    fields: [
      { id: "h-os", label: "Organization Schema", type: "heading" },
      {
        id: "6.1",
        label: "Registered business name, company number and registered address",
        hint: "Required for Organization schema. Must match Companies House or equivalent registry.",
        type: "textarea",
      },
      { id: "6.2", label: "Website URL, primary phone and email", type: "textarea" },
      {
        id: "6.3",
        label: "Social media profile URLs (all active channels)",
        type: "textarea",
      },
      {
        id: "6.4",
        label: "Wikidata, Wikipedia or Crunchbase profile?",
        type: "checkbox",
        options: ["Yes (provide URLs below)", "No", "Not sure"],
      },
      { id: "6.4b", label: "If yes, provide URLs:", type: "textarea", dependsOn: { field: "6.4", includes: ["Yes (provide URLs below)"] } },
      { id: "h-ac", label: "AI Crawler Access", type: "heading" },
      {
        id: "6.5",
        label: "AI crawler access via robots.txt",
        hint: "Key AI crawlers: GPTBot, ClaudeBot, Google-Extended, PerplexityBot, CCBot. Please ask your website developer for more guidance.",
        type: "checkbox",
        options: [
          "Yes, all are allowed",
          "Yes, some are blocked (specify below)",
          "No, we have not checked",
          "We want to selectively control access",
        ],
      },
      { id: "6.5b", label: "If some are blocked, specify:", type: "textarea", dependsOn: { field: "6.5", includes: ["Yes, some are blocked (specify below)"] } },
      {
        id: "6.6",
        label: "Areas of the website you would not want AI crawlers to access",
        hint: "e.g. client portals, pricing pages, staging environments. Please ask your website developer for more guidance.",
        type: "textarea",
      },
      { id: "h-pt", label: "Page Tag Audit", type: "heading" },
      {
        id: "6.7",
        label: "Most important website pages and their current H1 tags",
        hint: "H1–H3 tags are primary signals for AI content parsing.",
        type: "textarea",
      },
    ],
  },
  // ── AIO Set-Up: Section 7 (Consistency Check) ────────────────────────
  {
    id: "consistency",
    track: "web",
    number: 7,
    title: "Consistency Check",
    subtitle: "Cross-source consistency check across all existing content & citations",
    icon: Eye,
    intro:
      "AI models build their understanding of your brand from multiple sources: your website, press coverage, directory listings, social profiles and third-party reviews. Inconsistency confuses AI entity recognition and dilutes your authority.",
    fields: [
      {
        id: "7.1",
        label: "Is your business name, address and phone (NAP) consistent across all channels?",
        type: "checkbox",
        single: true,
        options: [
          "Yes, fully consistent",
          "Mostly: some older listings may be outdated",
          "No, there are known inconsistencies",
          "We do not know",
        ],
      },
      {
        id: "7.2",
        label: "Has the business changed name, address, products or core description in the last 3 years?",
        type: "checkbox",
        single: true,
        options: ["Yes", "No"],
      },
      { id: "7.2b", label: "If yes, what changed and when?", type: "textarea", dependsOn: { field: "7.2", includes: ["Yes"] } },
      {
        id: "7.3",
        label: "URLs for most important third-party profiles and citations",
        hint: "e.g. Google Business Profile, Trustpilot, industry directories, Crunchbase, LinkedIn company page.",
        type: "textarea",
      },
    ],
  },
];

// Questions that expose the Optimise control, derived from the form config.
export const OPTIMISED_FIELD_IDS: readonly string[] = sections
  .flatMap((s) => s.fields)
  .filter(isOptimisableField)
  .map((f) => f.id);

type IntakeStatus = "Draft" | "Optimised" | "Accepted";

export default function IntakePage() {
  const [track, setTrack] = useState<Track>("pr");
  const visibleSections = useMemo(() => sections.filter((s) => s.track === track), [track]);
  const [activeSection, setActiveSection] = useState(0);
  const [formData, setFormData] = useState<Record<string, string | string[]>>(() => {
    try {
      const raw = localStorage.getItem(currentIntakeKey());
      if (raw) {
        const fd = JSON.parse(raw).formData || {};
        // One-time migration: field 4.6 was split into 4.6 (Founding year) +
        // 4.7 (Key trust signals), and the old 4.7 (Primary competitors) moved
        // to 4.8. Move legacy competitor data to its new id so it is not shown
        // under the wrong label.
        if (fd["4.7"] !== undefined && (fd["4.8"] === undefined || fd["4.8"] === "")) {
          fd["4.8"] = fd["4.7"];
          delete fd["4.7"];
        }
        // Strip any em dashes left in previously optimised answers so saved intake content is clean.
        for (const k of Object.keys(fd)) {
          const v = fd[k];
          if (typeof v === "string") fd[k] = normaliseAddedData(stripEmDashes(v));
          else if (Array.isArray(v)) fd[k] = v.map((x) => (typeof x === "string" ? normaliseAddedData(stripEmDashes(x)) : x));
        }
        return fd;
      }
    } catch { /* noop */ }
    return {};
  });
  const [duals, setDuals] = useState<Record<string, DualValue>>(() => {
    try { const raw = localStorage.getItem(currentIntakeKey()); if (raw) return JSON.parse(raw).duals || {}; } catch { /* noop */ }
    return {};
  });
  const [dualLists, setDualLists] = useState<Record<string, DualListValue>>(() => {
    try {
      const raw = localStorage.getItem(currentIntakeKey());
      if (raw) {
        const parsed = JSON.parse(raw);
        return migrateLegacyDualLists(parsed.dualLists || {}, parsed.formData || {});
      }
    } catch { /* noop */ }
    return {};
  });
  const [spokespeople, setSpokespeople] = useState<Spokesperson[]>(() => {
    try {
      const raw = localStorage.getItem(currentIntakeKey());
      if (raw) {
        const arr = JSON.parse(raw).spokespeople || [];
        // Backwards-compatible: ensure linkedin field exists
        return arr.map((s: Partial<Spokesperson>) => ({
          name: s.name || "",
          title: s.title || "",
          expertise: normaliseExpertise(s.expertise),
          linkedin: s.linkedin || "",
        }));
      }
    } catch { /* noop */ }
    return [];
  });
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const raw = localStorage.getItem(currentIntakeKey());
      if (raw) {
        const parsed = JSON.parse(raw);
        const arr = parsed.products;
        // Once products has been saved (even as an empty list) it is the source
        // of truth. Only fall back to the legacy free-text 2.6 answer when
        // products was never set, so clearing all entries cannot resurrect it.
        if (Array.isArray(arr)) {
          return arr.map((p: Partial<Product>) => ({
            name: p.name || "",
            description: p.description || "",
            audience: p.audience || "",
          }));
        }
        const legacy = parsed.formData?.["2.6"];
        if (typeof legacy === "string" && legacy.trim()) {
          return [{ name: "", description: legacy, audience: "" }];
        }
      }
    } catch { /* noop */ }
    return [];
  });
  const [productQueries, setProductQueries] = useState<ProductQuery[]>(() => {
    try {
      const raw = localStorage.getItem(currentIntakeKey());
      if (raw) {
        const parsed = JSON.parse(raw);
        const arr = parsed.productQueries;
        // Once productQueries has been saved (even as an empty list) it is the
        // source of truth. Only fall back to the legacy free-text 2.7 answer
        // when it was never set, so clearing all entries cannot resurrect it.
        if (Array.isArray(arr)) {
          return arr.map((q: Partial<ProductQuery>) => ({
            area: q.area || "",
            phrases: q.phrases || "",
          }));
        }
        const legacy = parsed.formData?.["2.7"];
        if (typeof legacy === "string" && legacy.trim()) {
          return [{ area: "", phrases: legacy }];
        }
      }
    } catch { /* noop */ }
    return [];
  });
  const [stringLists, setStringLists] = useState<Record<string, string[]>>(() => {
    try {
      const raw = localStorage.getItem(currentIntakeKey());
      if (raw) {
        const parsed = JSON.parse(raw);
        // If stringLists was already saved, use it directly.
        if (parsed.stringLists && typeof parsed.stringLists === "object") {
          return parsed.stringLists as Record<string, string[]>;
        }
        // One-time migration: split legacy textarea strings into individual rows.
        const migrated: Record<string, string[]> = {};
        const fd = parsed.formData || {};
        for (const id of ["3.3", "4.8"]) {
          const legacy = fd[id];
          if (typeof legacy === "string" && legacy.trim()) {
            migrated[id] = legacy.split(/[\n,]+/).map((s: string) => s.trim()).filter(Boolean);
          }
        }
        return migrated;
      }
    } catch { /* noop */ }
    return {};
  });
  const [llmQueries, setLlmQueries] = useState<LlmQueries>(() => {
    try {
      const raw = localStorage.getItem(currentIntakeKey());
      if (raw) {
        const q = JSON.parse(raw).llmQueries;
        if (q && q.v === 1 && Array.isArray(q.discovery)) {
          return { v: 1, discovery: q.discovery as string[], shortlist: (q.shortlist as string[]) || [], comparison: (q.comparison as string[]) || [] };
        }
      }
    } catch { /* noop */ }
    return { v: 1, discovery: [], shortlist: [], comparison: [] };
  });
  const [llmQueriesGenerating, setLlmQueriesGenerating] = useState(false);
  const [llmQueriesError, setLlmQueriesError] = useState("");
  const [businessCategories, setBusinessCategories] = useState<string[]>(() => {
    try { const raw = localStorage.getItem(currentIntakeKey()); if (raw) { const p = JSON.parse(raw); return p.businessCategories || p.mediaCategories || []; } } catch { /* noop */ }
    return [];
  });
  const [audienceCategories, setAudienceCategories] = useState<string[]>(() => {
    try { const raw = localStorage.getItem(currentIntakeKey()); if (raw) return JSON.parse(raw).audienceCategories || []; } catch { /* noop */ }
    return [];
  });
  const [intakeStatus, setIntakeStatus] = useState<IntakeStatus>(() => {
    try { const raw = localStorage.getItem(currentIntakeKey()); if (raw) return (JSON.parse(raw).intakeStatus as IntakeStatus) || "Draft"; } catch { /* noop */ }
    return "Draft";
  });
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [aiWebsite, setAiWebsite] = useState<string>(() => {
    try { const raw = localStorage.getItem(currentIntakeKey()); if (raw) return JSON.parse(raw).aiWebsite || ""; } catch { /* noop */ }
    return "";
  });
  // The entity the user confirmed is theirs in the Earned Media entity-clarity
  // step. Set from the LLM Check page, not edited here; round-tripped through
  // state so saving Set-Up never wipes the user's confirmed identity.
  const [confirmedEntity] = useState<ConfirmedEntity>(() => {
    try { const raw = localStorage.getItem(currentIntakeKey()); if (raw) return normaliseConfirmedEntity(JSON.parse(raw).confirmedEntity); } catch { /* noop */ }
    return null;
  });
  const [aiLoadingField, setAiLoadingField] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string>("");
  const [aiNotice, setAiNotice] = useState<string>("");
  const [autoFillLoading, setAutoFillLoading] = useState(false);
  const [autoFillError, setAutoFillError] = useState("");
  const [autoFillNotice, setAutoFillNotice] = useState("");
  const [pickerTarget, setPickerTarget] = useState<null | "business" | "audience">(null);
  const [categorySearch, setCategorySearch] = useState("");
  const [acceptedAt, setAcceptedAt] = useState<string | null>(() => {
    try { const raw = localStorage.getItem(currentIntakeKey()); if (raw) return JSON.parse(raw).acceptedAt || null; } catch { /* noop */ }
    return null;
  });

  // ── Optimise / Reject / Accept / Edit / Download flow ──────────────
  const [preOptimiseSnapshot, setPreOptimiseSnapshot] = useState<{
    formData: Record<string, string | string[]>;
    duals: Record<string, DualValue>;
    dualLists: Record<string, DualListValue>;
  } | null>(() => {
    try { const raw = localStorage.getItem(currentIntakeKey()); if (raw) return JSON.parse(raw).preOptimiseSnapshot || null; } catch { /* noop */ }
    return null;
  });
  const [optimisedFields, setOptimisedFields] = useState<Set<string>>(() => {
    try { const raw = localStorage.getItem(currentIntakeKey()); if (raw) { const arr = JSON.parse(raw).optimisedFields; if (Array.isArray(arr)) return new Set<string>(arr); } } catch { /* noop */ }
    return new Set<string>();
  });
  const [optimisingField, setOptimisingField] = useState<string | null>(null);
  const [optimiseError, setOptimiseError] = useState<string>("");

  useEffect(() => {
    try {
      localStorage.setItem(
        currentIntakeKey(),
        JSON.stringify({ formData, duals, dualLists, spokespeople, products, productQueries, llmQueries, stringLists, businessCategories, audienceCategories, mediaCategories: Array.from(new Set([...businessCategories, ...audienceCategories])), intakeStatus, acceptedAt, preOptimiseSnapshot, optimisedFields: Array.from(optimisedFields), aiWebsite, confirmedEntity }),
      );
    } catch { /* noop */ }
  }, [formData, duals, dualLists, spokespeople, products, productQueries, llmQueries, stringLists, businessCategories, audienceCategories, intakeStatus, acceptedAt, preOptimiseSnapshot, optimisedFields, aiWebsite, confirmedEntity]);

  useEffect(() => { setActiveSection(0); }, [track]);

  // Jump back to the top of the form whenever the user moves to a different
  // section (Next/Previous, sidebar click or track switch). Without this the
  // page stays scrolled at the bottom where the last buttons were.
  const topRef = useRef<HTMLDivElement>(null);
  const scrollToTop = () => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const didMountSection = useRef(false);
  useEffect(() => {
    if (!didMountSection.current) { didMountSection.current = true; return; }
    scrollToTop();
  }, [activeSection]);

  const updateField = (fieldId: string, value: string) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
  };
  const toggleCheckbox = (fieldId: string, option: string) => {
    setFormData((prev) => {
      const current = (prev[fieldId] as string[]) || [];
      const next = current.includes(option) ? current.filter((o) => o !== option) : [...current, option];
      return { ...prev, [fieldId]: next };
    });
  };
  const selectSingle = (fieldId: string, option: string) => {
    // Radio-style single choice: selecting an option replaces any previous one.
    setFormData((prev) => ({ ...prev, [fieldId]: [option] }));
  };
  const setDual = (fieldId: string, key: keyof DualValue, value: string) => {
    setDuals((prev) => ({ ...prev, [fieldId]: { short: prev[fieldId]?.short || "", long: prev[fieldId]?.long || "", [key]: value } }));
  };
  const updateDualListItem = (fieldId: string, idx: number, key: keyof DualValue, value: string) => {
    setDualLists((prev) => {
      const list = prev[fieldId] || [];
      const next = list.map((item, i) => (i === idx ? { ...item, [key]: value } : item));
      return { ...prev, [fieldId]: next };
    });
  };
  const MAX_ADDITIONAL_MESSAGES = 10;
  const MAX_PRODUCTS = 5;
  const MAX_SPOKESPEOPLE = 10;
  // 1.3 (additional messages) caps at 6; the other dual lists keep the default.
  const maxForDualList = (fieldId: string) => (fieldId === "1.3" ? 6 : MAX_ADDITIONAL_MESSAGES);
  const addDualListItem = (fieldId: string) => {
    setDualLists((prev) => {
      const current = prev[fieldId] || [];
      if (current.length >= maxForDualList(fieldId)) return prev;
      return { ...prev, [fieldId]: [...current, { short: "", long: "" }] };
    });
  };
  const removeDualListItem = (fieldId: string, idx: number) => {
    setDualLists((prev) => ({ ...prev, [fieldId]: (prev[fieldId] || []).filter((_, i) => i !== idx) }));
  };

  const askAiForField = async (fieldId: string) => {
    setAiError("");
    setAiNotice("");
    const url = aiWebsite.trim();
    if (!url) {
      setAiError("Add your company website above first, then I can draft this for you.");
      return;
    }
    const _aiDraftStart = Date.now();
    setAiLoadingField(fieldId);
    try {
      const apiBase = import.meta.env.DEV ? `https://${window.location.host}` : "";
      const resp = await fetch(`${apiBase}/api/ai-assist/draft-field`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url, fieldId }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: "Could not draft this answer." }));
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      if (data.notFound) {
        setAiNotice("I could not find enough on your website to answer this one confidently. Worth filling it in yourself.");
        return;
      }
      if (fieldId === "1.1" && typeof data.draft === "string") {
        updateField("1.1", data.draft);
        setAiNotice("Drafted from your website. Please review and edit before saving.");
      } else if (fieldId === "1.2" && data.draft) {
        setDual("1.2", "short", data.draft.short || "");
        setDual("1.2", "long", data.draft.long || "");
        setAiNotice("Drafted from your website. Please review and edit before saving.");
      }
      recordAuditDuration("draft", Date.now() - _aiDraftStart, getAuditDurationSeconds("draft") * 1000);
    } catch (err: any) {
      setAiError(err.message || "Could not draft this answer. Please try again.");
    } finally {
      setAiLoadingField(null);
    }
  };

  const handleAutoFill = async () => {
    const url = aiWebsite.trim();
    if (!url) return;
    setAutoFillError("");
    setAutoFillNotice("");
    setAutoFillLoading(true);
    try {
      const apiBase = import.meta.env.DEV ? `https://${window.location.host}` : "";
      const companyName = (formData["4.1"] as string) || "";
      const resp = await fetch(`${apiBase}/api/ai-assist/generate-intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url, companyName: companyName || undefined }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: "Could not auto-fill. Please try again." }));
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      if (data.formData && typeof data.formData === "object") {
        setFormData((prev) => {
          const next = { ...prev };
          for (const [k, v] of Object.entries(data.formData as Record<string, unknown>)) {
            if (typeof v === "string" && v.trim()) next[k] = v;
            else if (Array.isArray(v) && v.length > 0) next[k] = v as string[];
          }
          return next;
        });
      }
      if (data.duals && typeof data.duals === "object") {
        setDuals((prev) => {
          const next = { ...prev };
          for (const [k, v] of Object.entries(data.duals as Record<string, { short?: string; long?: string }>)) {
            if (v && (v.short || v.long)) next[k] = { short: v.short || "", long: v.long || "" };
          }
          return next;
        });
      }
      if (data.dualLists && typeof data.dualLists === "object") {
        setDualLists((prev) => {
          const next = { ...prev };
          for (const [k, v] of Object.entries(data.dualLists as Record<string, unknown[]>)) {
            if (Array.isArray(v) && v.length > 0) next[k] = v as DualListValue;
          }
          return next;
        });
      }
      if (data.stringLists && typeof data.stringLists === "object") {
        setStringLists((prev) => {
          const next = { ...prev };
          for (const [k, v] of Object.entries(data.stringLists as Record<string, string[]>)) {
            if (Array.isArray(v) && v.length > 0) next[k] = v;
          }
          return next;
        });
      }
      if (Array.isArray(data.businessCategories) && data.businessCategories.length > 0) {
        setBusinessCategories(data.businessCategories as string[]);
      }
      if (Array.isArray(data.audienceCategories) && data.audienceCategories.length > 0) {
        setAudienceCategories(data.audienceCategories as string[]);
      }
      if (data.llmQueries && typeof data.llmQueries === "object") {
        const q = data.llmQueries as { v?: unknown; discovery?: string[]; shortlist?: string[]; comparison?: string[] };
        setLlmQueries({
          v: 1,
          discovery: Array.isArray(q.discovery) ? q.discovery : [],
          shortlist: Array.isArray(q.shortlist) ? q.shortlist : [],
          comparison: Array.isArray(q.comparison) ? q.comparison : [],
        });
      }
      if (Array.isArray(data.spokespeople) && data.spokespeople.length > 0) {
        setSpokespeople(data.spokespeople as Spokesperson[]);
      }
      if (Array.isArray(data.products) && data.products.length > 0) {
        setProducts(data.products as Product[]);
      }
      if (Array.isArray(data.productQueries) && data.productQueries.length > 0) {
        setProductQueries(data.productQueries as ProductQuery[]);
      }
      setAutoFillNotice("All fields filled from your website. Please review each answer before saving.");
    } catch (err: unknown) {
      setAutoFillError((err instanceof Error ? err.message : null) || "Could not auto-fill. Please try again.");
    } finally {
      setAutoFillLoading(false);
    }
  };

  const AiAssistButton = ({ fieldId }: { fieldId: string }) => {
    const hint = aiLoadingField === null ? getTypicalDurationHint("draft") : null;
    return (
      <span className="inline-flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => askAiForField(fieldId)}
          disabled={aiLoadingField !== null}
          className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-colors"
          style={{
            borderColor: "rgba(200,73,122,0.4)",
            color: "#C8497A",
            background: "#FBE3ED",
            opacity: aiLoadingField !== null && aiLoadingField !== fieldId ? 0.5 : 1,
            cursor: aiLoadingField !== null ? "default" : "pointer",
          }}
        >
          <Sparkles size={13} className={aiLoadingField === fieldId ? "animate-pulse" : ""} />
          {aiLoadingField === fieldId ? "Drafting from your website..." : "Ask AI to complete this"}
        </button>
        {hint && (
          <span className="mt-2 text-[11px]" style={{ color: vars.g400 }}>
            {hint}
          </span>
        )}
      </span>
    );
  };

  const markComplete = (idx: number, scroll = true) => { setCompleted((prev) => new Set(prev).add(idx)); if (scroll) scrollToTop(); };

  const sectionHasData = (idx: number): boolean => {
    return visibleSections[idx].fields.some((f) => {
      if (f.type === "heading") return false;
      if (!fieldApplies(f, formData)) return false;
      if (f.id === "1.8") return spokespeople.length > 0;
      if (f.id === "2.6") return products.length > 0;
      if (f.id === "2.7") return productQueries.length > 0;
      if (f.id === "1.9") return businessCategories.length > 0;
      if (f.id === "1.10") return audienceCategories.length > 0;
      if (f.type === "dual") {
        const v = duals[f.id]; return !!(v && (v.short || v.long));
      }
      if (f.type === "dual-list") {
        const v = dualLists[f.id]; return !!(v && v.length && v.some((it) => it.short || it.long));
      }
      if (f.type === "string-list") {
        const v = stringLists[f.id]; return !!(v && v.length > 0 && v.some((s) => s.trim()));
      }
      const val = formData[f.id];
      return Array.isArray(val) ? val.length > 0 : !!(val && val.trim().length > 0);
    });
  };

  // Progress per track (PR sections 1-3 and AIO sections 4-7), shown as two
  // separate bars so each set-up has its own completion meter regardless of
  // which one is currently open.
  const trackProgress = useMemo(() => {
    const calc = (trk: Track) => {
      let total = 0; let filled = 0;
      sections.filter((s) => s.track === trk).forEach((sec) => {
        sec.fields.forEach((f) => {
          if (f.type === "heading") return;
          if (f.optional) return;
          if (!fieldApplies(f, formData)) return;
          total += 1;
          if (f.id === "1.8") { if (spokespeople.length > 0) filled += 1; return; }
          if (f.id === "2.6") { if (products.length > 0) filled += 1; return; }
          if (f.id === "1.6") { if (llmQueries.discovery.length > 0 || llmQueries.shortlist.length > 0 || llmQueries.comparison.length > 0) filled += 1; return; }
          if (f.id === "2.7") { if (productQueries.length > 0) filled += 1; return; }
          if (f.id === "1.9") { if (businessCategories.length > 0) filled += 1; return; }
          if (f.id === "1.10") { if (audienceCategories.length > 0) filled += 1; return; }
          if (f.type === "dual") {
            const v = duals[f.id]; if (v && (v.short || v.long)) filled += 1; return;
          }
          if (f.type === "dual-list") {
            const v = dualLists[f.id]; if (v && v.length > 0 && v.some((m) => m.short || m.long)) filled += 1; return;
          }
          if (f.type === "string-list") {
            const v = stringLists[f.id]; if (v && v.length > 0 && v.some((s) => s.trim())) filled += 1; return;
          }
          if (f.type === "checkbox") {
            const v = formData[f.id]; if (Array.isArray(v) && v.length > 0) filled += 1; return;
          }
          const v = formData[f.id];
          if (typeof v === "string" && v.trim().length > 0) filled += 1;
        });
      });
      return total ? Math.round((filled / total) * 100) : 0;
    };
    return { pr: calc("pr"), web: calc("web") };
  }, [formData, duals, dualLists, spokespeople, products, productQueries, llmQueries, stringLists, businessCategories, audienceCategories]);

  // Full-form completion across BOTH PR and AIO tracks (independent of which
  // track is currently visible). Used to gate "Optimise Project Messages".
  const allTrackProgress = useMemo(() => {
    let total = 0; let filled = 0;
    sections.forEach((sec) => {
      sec.fields.forEach((f) => {
        if (f.type === "heading") return;
        if (f.optional) return;
        if (!fieldApplies(f, formData)) return;
        total += 1;
        if (f.id === "1.6") { if (llmQueries.discovery.length > 0 || llmQueries.shortlist.length > 0 || llmQueries.comparison.length > 0) filled += 1; return; }
        if (f.id === "1.8") { if (spokespeople.length > 0) filled += 1; return; }
        if (f.id === "2.6") { if (products.length > 0) filled += 1; return; }
        if (f.id === "2.7") { if (productQueries.length > 0) filled += 1; return; }
        if (f.id === "1.9") { if (businessCategories.length > 0) filled += 1; return; }
        if (f.id === "1.10") { if (audienceCategories.length > 0) filled += 1; return; }
        if (f.type === "dual") {
          const v = duals[f.id]; if (v && (v.short || v.long)) filled += 1; return;
        }
        if (f.type === "dual-list") {
          const v = dualLists[f.id]; if (v && v.length > 0 && v.some((m) => m.short || m.long)) filled += 1; return;
        }
        if (f.type === "string-list") {
          const v = stringLists[f.id]; if (v && v.length > 0 && v.some((s) => s.trim())) filled += 1; return;
        }
        if (f.type === "checkbox") {
          const v = formData[f.id]; if (Array.isArray(v) && v.length > 0) filled += 1; return;
        }
        const v = formData[f.id];
        if (typeof v === "string" && v.trim().length > 0) filled += 1;
      });
    });
    return { total, filled, pct: total ? Math.round((filled / total) * 100) : 0 };
  }, [formData, duals, dualLists, spokespeople, products, productQueries, llmQueries, stringLists, businessCategories, audienceCategories]);

  const filteredCategories = TRADE_MEDIA_CATEGORIES.filter((c) =>
    !categorySearch || c.toLowerCase().includes(categorySearch.toLowerCase()),
  );

  const section = visibleSections[activeSection] || visibleSections[0];

  const statusBadge = (() => {
    if (intakeStatus === "Accepted") return { bg: "rgba(61,155,107,0.12)", color: vars.green, label: "Accepted" };
    if (intakeStatus === "Optimised") return { bg: "rgba(40,150,185,0.12)", color: vars.teal, label: "Optimised" };
    return { bg: "rgba(212,146,42,0.14)", color: vars.amber, label: "Draft" };
  })();

  const isOptimisedField = (id: string) => optimisedFields.has(id);

  const fieldHasContent = (id: string) => {
    const fv = formData[id];
    if (Array.isArray(fv) ? fv.length > 0 : fv != null && String(fv).trim() !== "") return true;
    const dv = duals[id];
    if (dv && ((dv.short || "").trim() !== "" || (dv.long || "").trim() !== "")) return true;
    const dl = dualLists[id];
    if (dl && dl.some((it) => (it.short || "").trim() !== "" || (it.long || "").trim() !== "")) return true;
    const sl = stringLists[id];
    if (sl && sl.some((s) => s.trim() !== "")) return true;
    return false;
  };

  // Per-question optimise: sends the user's OWN answer to the AI backend, which
  // rewrites it to be stronger while keeping their facts. The original is
  // snapshotted so Reject can restore it, and the field is flagged so the
  // optimised answer shows in red.
  const optimiseField = async (id: string) => {
    if (!(OPTIMISED_FIELD_IDS as readonly string[]).includes(id) || optimisedFields.has(id) || optimisingField) return;
    setOptimiseError("");
    if (!fieldHasContent(id)) {
      setOptimiseError("Write your own answer first, then Optimise will improve it.");
      return;
    }
    const isDual = id === "1.2";
    const isDualList = id === "1.3";
    let value: unknown;
    if (isDual) value = { short: duals[id]?.short || "", long: duals[id]?.long || "" };
    else if (isDualList) value = (dualLists[id] || []).map((it) => ({ short: it.short || "", long: it.long || "" }));
    else value = (formData[id] as string) || "";

    // Capture the user's original answer now so we can restore it on Reject.
    const origForm = formData[id];
    const origDual = duals[id];
    const origDualList = dualLists[id];

    setOptimisingField(id);
    try {
      const apiBase = import.meta.env.DEV ? `https://${window.location.host}` : "";
      const resp = await fetch(`${apiBase}/api/ai-assist/optimise-field`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fieldId: id, value, companyName: (formData["4.1"] as string) || "", url: aiWebsite.trim() }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: "Could not optimise this answer." }));
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();

      setPreOptimiseSnapshot((prev) => {
        const snap = prev || { formData: {}, duals: {}, dualLists: {} };
        const next = { formData: { ...snap.formData }, duals: { ...snap.duals }, dualLists: { ...snap.dualLists } };
        if (origForm !== undefined) next.formData[id] = origForm;
        if (origDual !== undefined) next.duals[id] = origDual;
        if (origDualList !== undefined) next.dualLists[id] = origDualList;
        return next;
      });

      if (isDual) {
        setDuals((prev) => ({ ...prev, [id]: { short: data.short || "", long: data.long || "" } }));
      } else if (isDualList) {
        const items: DualListValue = Array.isArray(data.items)
          ? data.items.map((it: { short?: string; long?: string }) => ({ short: it.short || "", long: it.long || "" }))
          : (origDualList || []);
        setDualLists((prev) => ({ ...prev, [id]: items }));
      } else {
        setFormData((prev) => ({ ...prev, [id]: typeof data.optimised === "string" ? data.optimised : ((origForm as string) || "") }));
      }
      setOptimisedFields((prev) => new Set(prev).add(id));
      if (intakeStatus !== "Accepted") setIntakeStatus("Optimised");
    } catch (err: any) {
      setOptimiseError(err.message || "Could not optimise this answer. Please try again.");
    } finally {
      setOptimisingField(null);
    }
  };

  // Per-question reject: restores that field to what the user had before optimising.
  const rejectField = (id: string) => {
    setFormData((prev) => {
      const next = { ...prev };
      if (preOptimiseSnapshot?.formData[id] !== undefined) next[id] = preOptimiseSnapshot.formData[id];
      return next;
    });
    setDuals((prev) => {
      const next = { ...prev };
      if (preOptimiseSnapshot?.duals[id] !== undefined) next[id] = preOptimiseSnapshot.duals[id];
      return next;
    });
    setDualLists((prev) => {
      const next = { ...prev };
      if (preOptimiseSnapshot?.dualLists[id] !== undefined) next[id] = preOptimiseSnapshot.dualLists[id];
      return next;
    });
    setPreOptimiseSnapshot((prev) => {
      if (!prev) return prev;
      const next = { formData: { ...prev.formData }, duals: { ...prev.duals }, dualLists: { ...prev.dualLists } };
      delete next.formData[id]; delete next.duals[id]; delete next.dualLists[id];
      return next;
    });
    setOptimisedFields((prev) => { const next = new Set(prev); next.delete(id); return next; });
    if (optimisedFields.size <= 1 && intakeStatus === "Optimised") setIntakeStatus("Draft");
  };

  const generateLlmQueries = async (isAuto = false) => {
    setLlmQueriesError("");
    setLlmQueriesGenerating(true);
    try {
      const apiBase = import.meta.env.DEV ? `https://${window.location.host}` : "";
      const icpText = (dualLists["3.2"] || []).map((it) => [it.short, it.long].filter(Boolean).join(": ")).filter(Boolean).join("; ");
      const resp = await fetch(`${apiBase}/api/content/llm-queries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          companyName: (formData["4.1"] as string) || confirmedEntity?.name || "",
          descriptor: (formData["1.1"] as string) || "",
          primaryMessage: `${duals["1.2"]?.short || ""} ${duals["1.2"]?.long || ""}`.trim(),
          services: products.map((p) => p.name || p.description).filter(Boolean).join(", "),
          targetClients: icpText,
          geography: (stringLists["3.3"] || []).filter(Boolean).join(", ") || (formData["3.3"] as string) || "",
          mediaCategories: businessCategories.slice(0, 5).join(", "),
          competitors: getCompetitors().slice(0, 10).join(", "),
          websiteUrl: aiWebsite.trim(),
        }),
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({ error: "Could not generate queries." }));
        throw new Error(d.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setLlmQueries({
        v: 1,
        discovery: Array.isArray(data.discovery) ? (data.discovery as string[]) : [],
        shortlist: Array.isArray(data.shortlist) ? (data.shortlist as string[]) : [],
        comparison: Array.isArray(data.comparison) ? (data.comparison as string[]) : [],
      });
    } catch (err: unknown) {
      if (!isAuto) {
        setLlmQueriesError((err instanceof Error ? err.message : null) || "Could not generate queries. Please try again.");
      }
    } finally {
      setLlmQueriesGenerating(false);
    }
  };

  const acceptProjectData = () => {
    const stamp = new Date().toISOString();
    setIntakeStatus("Accepted");
    setAcceptedAt(stamp);
    setPreOptimiseSnapshot(null);
    setOptimisedFields(new Set<string>());
    try {
      const raw = localStorage.getItem(PROJECT_DATA_ARCHIVE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      arr.unshift({
        id: `pd-${Date.now()}`,
        acceptedAt: stamp,
        projectName: (formData["4.1"] as string) || "(unnamed project)",
        formData,
        duals,
        dualLists,
        spokespeople,
        products,
        productQueries,
        businessCategories,
        audienceCategories,
        mediaCategories: Array.from(new Set([...businessCategories, ...audienceCategories])),
      });
      localStorage.setItem(PROJECT_DATA_ARCHIVE_KEY, JSON.stringify(arr.slice(0, 50)));
    } catch { /* noop */ }
    alert("Project Data accepted and saved to the dedicated Project Data archive. The signed-off brief is now available to Comms Planner, Content Optimiser, Content Creator, Media Research, Marketing Intelligence, Website GEO Content and Website Technical GEO.");
  };

  // Open a branded print/"Save as PDF" window with the given body HTML. Title
  // and subtitle must already be escaped. Shared by the project-data export,
  // the per-section question sheets and the how-to guide.
  const openPrintWindow = (title: string, subtitle: string, bodyHtml: string) => {
    let clientLogo: string | null = null;
    try {
      const pid = getActiveProjectId();
      if (pid) {
        const map = JSON.parse(localStorage.getItem("aio.clientLogos.v1") || "{}");
        const raw = typeof map[pid] === "string" ? map[pid] : null;
        clientLogo = raw && /^(data:image\/|https:\/\/)/i.test(raw) ? raw : null;
      }
    } catch {
      /* noop */
    }
    const aioLogo = `${window.location.origin}${import.meta.env.BASE_URL}images/logo-color.png`;
    const clientLogoBlock = clientLogo
      ? `<img src="${escapeHtml(clientLogo)}" alt="Client logo" class="client-logo" />`
      : "";
    const w = window.open("", "_blank");
    if (!w) {
      alert("Pop-up blocked - allow pop-ups for this site to download the PDF.");
      return;
    }
    w.document.write(buildPrintHtml({ title, subtitle, bodyHtml, aioLogo, clientLogoBlock }));
    w.document.close();
  };

  const downloadProjectData = () => {
    // Build a self-contained, branded document and trigger the browser's print /
    // "Save as PDF" dialog on it, carrying the AIO Fusion and client logos.
    const esc = escapeHtml;

    const NP = `<span class="np">Not provided</span>`;

    const valueHtml = (field: FieldDef): string => {
      if (field.id === "1.8") {
        if (!spokespeople.length) return NP;
        return `<ul>${spokespeople
          .map(
            (s) =>
              `<li>${esc([s.name, s.title, s.expertise.filter(Boolean).join(" / ")].filter(Boolean).join(", "))}${s.linkedin ? ` (${esc(s.linkedin)})` : ""}</li>`,
          )
          .join("")}</ul>`;
      }
      if (field.id === "2.6") {
        if (!products.length) return NP;
        return `<ul>${products
          .map(
            (p) =>
              `<li>${esc([p.name, p.description, p.audience ? `Primary audience: ${p.audience}` : ""].filter(Boolean).join(" - "))}</li>`,
          )
          .join("")}</ul>`;
      }
      if (field.id === "2.7") {
        if (!productQueries.length) return NP;
        return `<ul>${productQueries
          .map(
            (q) =>
              `<li>${esc([q.area, q.phrases].filter(Boolean).join(" - "))}</li>`,
          )
          .join("")}</ul>`;
      }
      if (field.id === "1.9") return businessCategories.length ? esc(businessCategories.join(", ")) : NP;
      if (field.id === "1.10") return audienceCategories.length ? esc(audienceCategories.join(", ")) : NP;
      if (field.type === "dual") {
        const v = duals[field.id];
        return v && (v.short || v.long)
          ? `<div><strong>Short:</strong> ${esc(v.short || "-")}</div><div><strong>Long:</strong> ${esc(v.long || "-")}</div>`
          : NP;
      }
      if (field.type === "dual-list") {
        const items = (dualLists[field.id] || []).filter((it) => it.short || it.long);
        return items.length
          ? `<ul>${items
              .map((it) => `<li><strong>${esc(it.short || "-")}</strong>${it.long ? ` - ${esc(it.long)}` : ""}</li>`)
              .join("")}</ul>`
          : NP;
      }
      if (field.type === "checkbox") {
        const v = formData[field.id];
        return Array.isArray(v) && v.length ? esc(v.join("; ")) : NP;
      }
      const v = formData[field.id];
      return typeof v === "string" && v.trim() ? esc(v) : NP;
    };

    const fieldHtml = (field: FieldDef): string => {
      if (!fieldApplies(field, formData)) return "";
      if (field.type === "heading") return `<h3>${esc(field.label)}</h3>`;
      const idPrefix = /^\d/.test(field.id) ? `${esc(field.id)}&nbsp;&nbsp;` : "";
      return `<div class="f"><div class="fl">${idPrefix}${esc(field.label)}</div><div class="v">${valueHtml(field)}</div></div>`;
    };

    const sectionsHtml = sections
      .map((sec) => {
        const inner = sec.fields.map(fieldHtml).join("");
        return `<div class="sec"><h2>Section ${esc(sec.number)}: ${esc(sec.title)}</h2>${inner}</div>`;
      })
      .join("");

    const title = (formData["4.1"] as string)?.trim() || "Project Data";
    const statusLine = `Status: ${esc(intakeStatus)}${
      acceptedAt && intakeStatus === "Accepted"
        ? ` (accepted ${esc(new Date(acceptedAt).toLocaleDateString("en-GB"))})`
        : ""
    }`;

    openPrintWindow(esc(title), `AIO Fusion Project Data &middot; ${statusLine}`, sectionsHtml);
  };

  // Build a printable worksheet of the questions for one or more sections, each
  // with its hint and a blank line to write the answer. Lets people gather
  // answers offline and type them in later.
  const buildQuestionsBody = (secs: SectionDef[]): string =>
    secs
      .map((sec) => {
        const inner = sec.fields
          .map((f) => {
            if (f.type === "heading") return `<h3>${escapeHtml(f.label)}</h3>`;
            const idPrefix = /^\d/.test(f.id) ? `${escapeHtml(f.id)}&nbsp;&nbsp;` : "";
            const hint = f.hint ? `<div class="hint">${escapeHtml(f.hint)}</div>` : "";
            return `<div class="q"><div class="fl">${idPrefix}${escapeHtml(f.label)}</div>${hint}<div class="ans"></div></div>`;
          })
          .join("");
        return `<div class="sec"><h2>Section ${escapeHtml(String(sec.number))}: ${escapeHtml(sec.title)}</h2><p class="secintro">${escapeHtml(sec.intro)}</p>${inner}</div>`;
      })
      .join("");

  const downloadSectionQuestions = (sec: SectionDef) => {
    openPrintWindow(
      `${escapeHtml(sec.title)} - Questions`,
      `AIO Fusion Set-Up &middot; Section ${escapeHtml(String(sec.number))} questions`,
      buildQuestionsBody([sec]),
    );
  };

  const downloadHowToGuide = () => {
    const body = `<div class="guide">
      <div class="sec">
        <h2>What this Set-Up is for</h2>
        <p>The Set-Up captures everything AIO Fusion needs to represent your business accurately to AI answer engines such as ChatGPT, Claude, Gemini and Google's AI Overviews. These engines build their picture of your business from your website, your press coverage and other public sources. This form is how you tell us what that picture should be.</p>
        <p>The more complete and precise your answers, the better every tool performs, because they all draw on what you enter here. Treat it like briefing a new team member who will speak on your behalf: the clearer the brief, the better they represent you.</p>
        <p>You do not need to complete everything in one sitting, and you do not need to answer every question. Start with what you know, save as you go, and come back to fill the gaps. Even a partly completed Set-Up improves your results.</p>
      </div>
      <div class="sec">
        <h2>How it is organised</h2>
        <p>The Set-Up is split into two tracks, each with its own progress bar so you can see how far along you are:</p>
        <ul>
          <li><strong>PR Set-Up (Sections 1 to 3)</strong> covers your business messaging: your boilerplate, message hierarchy, supporting evidence, spokespeople, the questions your customers ask, and who your audiences are.</li>
          <li><strong>AIO Set-Up (Sections 4 to 7)</strong> covers your business profile and technical signals: core identity, products and services, optimisation priorities, structured data and cross-channel consistency.</li>
        </ul>
        <p>Use the buttons at the top to switch between tracks, and the section list on the left to jump around. You do not have to work in order. Each section opens with a short note explaining why it matters.</p>
      </div>
      <div class="sec">
        <h2>What each section covers</h2>
        <h3>PR Set-Up</h3>
        <ul>
          <li><strong>Section 1 - Earned Media: Message Framework.</strong> Your standard company description (boilerplate), your core and supporting messages, proof points, spokespeople and the trade media categories you operate in. Earned media is one of the strongest signals AI models trust, so this section feeds almost every other tool.</li>
          <li><strong>Section 2 - FAQ &amp; Customer Questions.</strong> The real questions people ask before they buy, answered in a clear, AI-ready way, plus a short framing of your core products and services so your messaging and website stay aligned.</li>
          <li><strong>Section 3 - Audience &amp; Intent Mapping.</strong> Who you are talking to, the language they use, the problems they are trying to solve and the outcomes they want. AI engines match content to intent, not just keywords, so this matters.</li>
        </ul>
        <h3>AIO Set-Up</h3>
        <ul>
          <li><strong>Section 4 - Business &amp; Brand Fundamentals.</strong> Your core identity: legal name, trading names, sub-brands and what you do. These details underpin every piece of optimised content.</li>
          <li><strong>Section 5 - GEO vs AEO Priority Assessment.</strong> A few signals about your business model that help decide whether to lead with being cited by AI systems (GEO) or appearing in direct-answer features (AEO).</li>
          <li><strong>Section 6 - Schema Markup &amp; Technical Signals.</strong> The structured data and technical settings that let AI read your site accurately, including organisation details, robots.txt and AI crawler access.</li>
          <li><strong>Section 7 - Consistency Check.</strong> A check that your name, address, phone number and core descriptions match everywhere they appear. Inconsistency confuses AI and weakens your authority.</li>
        </ul>
      </div>
      <div class="sec">
        <h2>How your answers are used</h2>
        <p>Nothing here is published automatically. Your answers become the shared source of truth that the platform's tools draw on:</p>
        <ul>
          <li><strong>Optimiser</strong> rewrites and sharpens your content using your approved messaging and audience language.</li>
          <li><strong>Content Creator</strong> drafts new content that stays on-message because it is built from these inputs.</li>
          <li><strong>Media Research</strong> targets the right outlets using your spokespeople and media categories.</li>
          <li><strong>Visibility Audit</strong> checks how often AI engines surface your business on real, non-branded category questions, and who they recommend instead.</li>
        </ul>
        <p>This is why precision pays off: a vague answer here produces vague output everywhere it is used.</p>
      </div>
      <div class="sec">
        <h2>Filling it in</h2>
        <ol>
          <li>Work through each section, answering in plain language. The hint under each question explains what a good answer looks like, with examples.</li>
          <li>For repeatable items, use the "Add" buttons to create as many entries as you need. Some lists have a sensible cap: spokespeople up to 10, additional messages up to 6, and products or services and product or service areas up to 5 each. When you reach a limit the "Add" button greys out, but you can always remove an entry to make room.</li>
          <li>Where you see "Ask AI to complete this", add your company website at the top of the form first, then let the tool draft an answer from your site for you to review and edit. The website is used only as a reference, so the draft reflects your real business rather than generic text. Always read and adjust the draft before relying on it.</li>
          <li>Use "Mark section complete" when you are happy with a section. This updates your progress bar. You can re-open and edit a completed section at any time.</li>
          <li>Use "Save for later" at any point. Your answers are stored against this project, so you can close the form and carry on later, including from another device when you are signed in.</li>
        </ol>
      </div>
      <div class="sec">
        <h2>Gathering answers offline</h2>
        <p>Each section has a "Download these questions" button. This gives you a printable sheet of that section's questions, each with its hint and space to write. It is handy for collecting input from colleagues, your leadership team or subject experts before typing the final answers into the platform. You can also download a full copy of your completed project data at any time for your own records or sign-off.</p>
      </div>
      <div class="sec">
        <h2>Tips for strong answers</h2>
        <ul>
          <li>Be specific. Name real products, audiences, sectors and the exact phrases your customers use, not generic industry terms.</li>
          <li>Reuse your agreed FAQs, approved boilerplate and signed-off messaging so everything stays consistent across your website, your earned media and these answers. Consistency is what builds authority with AI models.</li>
          <li>Write for an interested outsider. Avoid internal jargon, acronyms and shorthand that only colleagues would understand.</li>
          <li>Lead with the most important point. AI tends to weight what comes first, so put your strongest message at the start of an answer.</li>
          <li>Use evidence where you can. Concrete proof points, numbers and named examples carry more weight than claims.</li>
          <li>If a question does not apply, leave it blank rather than forcing an answer. A blank is better than something inaccurate.</li>
          <li>Revisit periodically. As your business, messaging or coverage changes, update the Set-Up so the tools stay accurate.</li>
        </ul>
      </div>
      <div class="sec">
        <h2>A few key terms</h2>
        <ul>
          <li><strong>GEO (Generative Engine Optimisation)</strong> - being cited and recommended by AI systems such as ChatGPT, Claude and Gemini.</li>
          <li><strong>AEO (Answer Engine Optimisation)</strong> - appearing in direct-answer features such as Google's AI Overviews and voice assistants.</li>
          <li><strong>Earned media</strong> - independent coverage you earn rather than pay for, such as articles and mentions in credible outlets. It is one of the highest-authority signals for AI.</li>
          <li><strong>Boilerplate</strong> - your standard, approved "about the company" paragraph used in press and across the web.</li>
          <li><strong>Schema markup</strong> - machine-readable tags that tell AI exactly what your content means, reducing guesswork and error.</li>
          <li><strong>NAP</strong> - Name, Address and Phone, kept identical across every channel so AI recognises you as one consistent entity.</li>
        </ul>
      </div>
    </div>`;
    openPrintWindow("AIO Fusion Set-Up - How-to Guide", "A short guide to completing your Set-Up", body);
  };

  const [justSaved, setJustSaved] = useState(false);
  const saveDraft = () => {
    const blob = { formData, duals, dualLists, spokespeople, products, productQueries, llmQueries, stringLists, businessCategories, audienceCategories, mediaCategories: Array.from(new Set([...businessCategories, ...audienceCategories])), intakeStatus, acceptedAt, preOptimiseSnapshot, optimisedFields: Array.from(optimisedFields), aiWebsite, confirmedEntity };
    try {
      localStorage.setItem(currentIntakeKey(), JSON.stringify(blob));
    } catch { /* noop */ }
    // Mirror the save to the shared server store so it is visible on other
    // devices and to colleagues on the same login.
    try {
      const id = getActiveProjectId() || "default";
      const name = typeof formData["4.1"] === "string" ? (formData["4.1"] as string) : "";
      markIntakeSaved(id, blob, name);
    } catch { /* noop */ }
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2500);
  };


  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-6xl mx-auto">
      <div ref={topRef} aria-hidden="true" />
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-2">
          <h1 className="text-3xl sm:text-4xl tracking-tight" style={{ color: "#ffffff", fontFamily: "'Alice', Georgia, serif" }}>
            Project Set-Up
          </h1>
          <div className="flex items-center gap-2.5">
            <button
              onClick={saveDraft}
              title="Save your progress so you can finish later"
              className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] px-3.5 py-1.5 rounded-full border-2 transition-colors"
              style={{
                borderColor: justSaved ? vars.green : "rgba(255,255,255,0.7)",
                color: justSaved ? vars.green : "#ffffff",
                background: justSaved ? "rgba(61,155,107,0.15)" : "transparent",
              }}
            >
              {justSaved ? <><Check size={13} /> Saved</> : <><Save size={13} /> Save for later</>}
            </button>
            <span
              className="text-[11px] font-bold uppercase tracking-[0.16em] px-3 py-1.5 rounded-full"
              style={{ background: statusBadge.bg, color: statusBadge.color }}
            >
              {statusBadge.label} - Project Data
            </span>
          </div>
        </div>
        <p className="text-[13px] sm:text-[14px] font-light mt-3 mb-6" style={{ color: "rgba(255,255,255,0.85)" }}>
          This is where you capture the business information, messaging and content that will inform your PR, content marketing and AI authority strategy. It becomes your core Project Data, used to improve your PR and marketing output as well as your own website. Complete both the PR set-up and Website set-up sections to build it.
        </p>

        {/* AI assist (test) - website-powered drafting for the first two questions */}
        <div className="rounded-2xl border-2 p-4 sm:p-5 mb-2" style={{ background: "#FBE3ED", borderColor: "rgba(200,73,122,0.45)" }}>
          <div className="flex items-start gap-2.5">
            <Sparkles size={18} style={{ color: "#C8497A", marginTop: 2, flexShrink: 0 }} />
            <div className="flex-1">
              <p className="text-[13px] font-bold" style={{ color: "#102B36", fontFamily: "'Alice', Georgia, serif" }}>
                Let AI draft from your website (Beta)
              </p>
              <p className="text-[12px] font-light mt-0.5 mb-2" style={{ color: "#102B36" }}>
                Add your company website and use the "Ask AI to complete this" button under a question to draft an answer quicker. This is an early test, so it is switched on for the first two questions (1.1 and 1.2) only. Please always review and check what it writes.
              </p>
              <p className="text-[12px] font-light mt-0.5 mb-3" style={{ color: "#374151" }}>
                <span className="font-semibold" style={{ color: "#102B36" }}>Why the website?</span> The AI reads your site and uses it as the source for the draft, so the answer reflects your real products, language and positioning rather than generic filler. The more your website says, the better the starting point. It is only used as a reference; nothing is published or changed.
              </p>
              {(() => {
                const websiteValid = /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(aiWebsite.trim());
                return (
                  <>
                    <div className="relative w-full sm:max-w-md">
                      <input
                        value={aiWebsite}
                        onChange={(e) => setAiWebsite(e.target.value)}
                        onBlur={() => {
                          const hasQueries = llmQueries.discovery.length > 0 || llmQueries.shortlist.length > 0 || llmQueries.comparison.length > 0;
                          if (websiteValid && !hasQueries && !llmQueriesGenerating) {
                            generateLlmQueries(true);
                          }
                        }}
                        placeholder="yourcompany.com"
                        className="w-full pl-4 pr-11 py-2.5 rounded-xl border-2 text-[14px] font-light outline-none focus:border-[#C8497A] transition-colors"
                        style={{ borderColor: websiteValid ? "#15803D" : "rgba(16,43,54,0.15)", background: "white", color: "#102B36" }}
                      />
                      {websiteValid && (
                        <span
                          className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full"
                          style={{ width: 22, height: 22, background: "#15803D" }}
                          aria-hidden="true"
                        >
                          <Check size={14} color="white" strokeWidth={3} />
                        </span>
                      )}
                    </div>
                    {websiteValid && (
                      <>
                        <p className="text-[12px] font-medium mt-2 flex items-center gap-1.5" style={{ color: "#15803D" }}>
                          <Check size={13} strokeWidth={3} /> Website saved. Use "Ask AI to complete this" under a question.
                        </p>
                        <button
                          type="button"
                          onClick={() => { void handleAutoFill(); }}
                          disabled={autoFillLoading || aiLoadingField !== null}
                          className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-bold uppercase tracking-[0.12em] border-2 transition-all"
                          style={{
                            background: autoFillLoading ? "rgba(200,73,122,0.08)" : "#C8497A",
                            borderColor: "#C8497A",
                            color: autoFillLoading ? "#C8497A" : "white",
                            opacity: aiLoadingField !== null ? 0.5 : 1,
                            cursor: autoFillLoading || aiLoadingField !== null ? "default" : "pointer",
                          }}
                        >
                          <Sparkles size={14} className={autoFillLoading ? "animate-pulse" : ""} />
                          {autoFillLoading ? "Filling all fields from your website…" : "Auto-fill all fields from my website"}
                        </button>
                      </>
                    )}
                  </>
                );
              })()}
              {autoFillError && <p className="text-[12px] font-medium mt-2" style={{ color: "#DC2626" }}>{autoFillError}</p>}
              {autoFillNotice && <p className="text-[12px] font-medium mt-2" style={{ color: "#15803D" }}>{autoFillNotice}</p>}
              {aiError && <p className="text-[12px] font-medium mt-2" style={{ color: "#DC2626" }}>{aiError}</p>}
              {aiNotice && <p className="text-[12px] font-medium mt-2" style={{ color: "#1F748F" }}>{aiNotice}</p>}
              <div className="mt-3">
                <CountdownBanner
                  active={autoFillLoading}
                  durationSeconds={90}
                  label="Filling all fields from your website"
                />
              </div>
              <div className="mt-2">
                <CountdownBanner
                  active={aiLoadingField !== null}
                  durationSeconds={getAuditDurationSeconds("draft")}
                  label="Drafting from your website"
                  sampleCount={getAuditSampleCount("draft")}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Track switch + progress - Variant C panel */}
        <div className="rounded-2xl border-2 p-4 sm:p-5 mb-2" style={{ background: "white", borderColor: "#102B36" }}>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex flex-col sm:flex-row gap-2">
              {([
                { key: "pr" as Track, primary: "PR Set-Up", subtitle: "Business Messaging (Sections 1–3)" },
                { key: "web" as Track, primary: "AIO Set-Up", subtitle: "Business Profile (Sections 4–7)" },
              ]).map((t) => {
                const isActive = track === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTrack(t.key)}
                    className={`px-5 py-3 rounded-xl text-left transition-all duration-300 border-2 ${isActive ? "" : "hover:-translate-y-1 hover:shadow-lg hover:ring-2 hover:ring-[#C8497A]"}`}
                    style={{
                      background: isActive ? "#102B36" : "#FBF1F0",
                      borderColor: isActive ? "#102B36" : "rgba(16,43,54,0.12)",
                      color: isActive ? "#ffffff" : "#102B36",
                    }}
                  >
                    <div className="text-[14px] font-bold" style={{ fontFamily: "'Alice', Georgia, serif" }}>{t.primary}</div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.14em] mt-0.5 opacity-80">{t.subtitle}</div>
                  </button>
                );
              })}
            </div>
            <div className="flex-1 lg:max-w-md lg:ml-6 flex flex-col gap-3">
              {([
                { key: "pr", label: "PR Set-Up Progress", pct: trackProgress.pr },
                { key: "web", label: "AIO Set-Up Progress", pct: trackProgress.web },
              ]).map((p) => (
                <div key={p.key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "#102B36" }}>{p.label}</span>
                    <span className="text-[14px] font-bold" style={{ color: "#C8497A", fontFamily: "'Alice', Georgia, serif" }}>{p.pct}%</span>
                  </div>
                  <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: "rgba(16,43,54,0.08)" }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${p.pct}%`, background: "linear-gradient(90deg, #C8497A 0%, #E07856 100%)" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* Sections nav — horizontal strip above the form */}
        <div className="w-full">
          <div className="rounded-2xl border-2 overflow-hidden" style={{ background: "white", borderColor: "rgba(16,43,54,0.12)" }}>
            <div className="px-4 py-3 border-b-2 flex items-center gap-2" style={{ background: "#0a1628", borderColor: "#0a1628" }}>
              <span className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "rgba(255,255,255,0.7)" }}>Sections</span>
            </div>
            <div className="flex flex-wrap gap-2 p-3">
            {visibleSections.map((sec, idx) => {
              const isActive = idx === activeSection;
              const isDone = completed.has(idx);
              const hasData = sectionHasData(idx);
              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveSection(idx)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all duration-300 border ${isActive ? "" : "hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-[#C8497A]/50"}`}
                  style={{
                    borderColor: isActive ? "#C8497A" : vars.g200,
                    background: isActive ? "#FBE3ED" : "#FBF1F0",
                  }}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                    style={{
                      background: isDone ? vars.green : isActive ? "#C8497A" : vars.g200,
                      color: isDone || isActive ? "white" : vars.g500,
                    }}
                  >
                    {isDone ? <Check size={12} /> : sec.number}
                  </div>
                  <p className="text-[12px] font-semibold whitespace-nowrap" style={{ color: isActive ? "#102B36" : vars.g600 }}>{sec.title}</p>
                  {!isDone && hasData && (
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: vars.amber }} title="In progress" />
                  )}
                </button>
              );
            })}
            </div>
          </div>

          {/* Project Data Actions - horizontal strip */}
          <div className="mt-4 rounded-2xl border-2 overflow-hidden no-print" style={{ background: "white", borderColor: "rgba(16,43,54,0.12)" }}>
            <div className="px-4 py-3 border-b-2 flex items-center gap-2" style={{ background: "#0a1628", borderColor: "#0a1628" }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#C8497A" }} />
              <span className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "rgba(255,255,255,0.7)" }}>Project Data Actions</span>
            </div>
            <div className="px-4 py-3 flex flex-wrap items-center gap-3">
            {optimiseError && (
              <div className="flex items-start gap-2 text-[11px] font-medium px-3 py-2 rounded-xl w-full" style={{ background: "rgba(201,74,62,0.1)", color: "#C94A3E" }}>
                <Info size={12} className="flex-shrink-0 mt-0.5" />
                <span>{optimiseError}</span>
              </div>
            )}
              <button
                onClick={saveDraft}
                title="Save your progress so you can finish later"
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.1em] transition-all duration-300 whitespace-nowrap border-2 hover:-translate-y-0.5 hover:shadow-md"
                style={{
                  borderColor: justSaved ? vars.green : "#0a1628",
                  color: justSaved ? vars.green : "#0a1628",
                  background: justSaved ? "rgba(61,155,107,0.1)" : "transparent",
                }}
              >
                {justSaved ? <><Check size={13} /> Saved</> : <><Save size={13} /> Save for later</>}
              </button>
              <button
                onClick={acceptProjectData}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.1em] text-white transition-all duration-300 whitespace-nowrap hover:-translate-y-0.5 hover:shadow-md hover:brightness-110"
                style={{ background: vars.green }}
                title="Sign off the Project Data and save it to the Project Data archive"
              >
                <FileCheck2 size={13} /> Accept &amp; Sign Off
              </button>
              <button
                onClick={downloadProjectData}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.1em] transition-all duration-300 whitespace-nowrap border hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-[#C8497A]/40"
                style={{ background: "white", color: "#0a1628", borderColor: "rgba(16,43,54,0.2)" }}
                title="Open the print dialog so you can save the full Project Data as a PDF"
              >
                <Download size={13} /> Download PDF
              </button>
              <button
                onClick={() => {
                  if (window.confirm("Create a new project? You will lose all the data you have entered here and start again from scratch. This cannot be undone.")) {
                    setFormData({}); setDuals({}); setDualLists({}); setSpokespeople([]); setProducts([]); setProductQueries([]); setBusinessCategories([]); setAudienceCategories([]);
                    setIntakeStatus("Draft"); setAcceptedAt(null); setPreOptimiseSnapshot(null); setOptimisedFields(new Set<string>());
                    setCompleted(new Set()); setActiveSection(0); setTrack("pr");
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.1em] transition-all duration-300 whitespace-nowrap border hover:-translate-y-0.5 hover:shadow-md hover:bg-[#FBF1F0]"
                style={{ background: "transparent", color: "#C8497A", borderColor: "rgba(200,73,122,0.6)" }}
                title="Clear everything and start a new project"
              >
                <Plus size={13} /> New Project
              </button>
            </div>
          </div>
        </div>

        {/* Section body */}
        <div className="flex-1 min-w-0">
          <div className="rounded-2xl border-2 overflow-hidden" style={{ background: "white", borderColor: "rgba(16,43,54,0.12)" }}>
            <div className="px-8 py-6" style={{ background: "#102B36" }}>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "#FBE3ED" }}>
                  <section.icon size={20} color="#C8497A" />
                </div>
                <div>
                  <div className="text-[13px] font-bold uppercase tracking-[0.18em] mb-0.5" style={{ color: "#C8497A" }}>
                    Section {section.number}
                  </div>
                  <h2 className="text-xl font-semibold leading-tight" style={{ color: "#ffffff", fontFamily: "'Alice', Georgia, serif" }}>
                    {section.title}
                  </h2>
                  <p className="text-xs font-light mt-0.5" style={{ color: "rgba(251,246,236,0.7)" }}>{section.subtitle}</p>
                </div>
              </div>
            </div>

            <div className="px-8 py-6" style={{ background: "#ffffff" }}>
              <div className="rounded-xl p-4 mb-8" style={{ background: "white", border: "1px solid rgba(200,73,122,0.2)", borderLeft: "3px solid #C8497A" }}>
                <p className="text-[13px] font-light leading-relaxed" style={{ color: "#102B36" }}>{section.intro}</p>
              </div>

              {section.track === "pr" && (
                <div className="rounded-xl p-4 mb-8 flex items-start gap-2.5" style={{ background: "rgba(40,150,185,0.07)", border: "1px solid rgba(40,150,185,0.25)" }}>
                  <Info size={16} color="#2896b9" className="mt-0.5 flex-shrink-0" />
                  <p className="text-[12.5px] font-light leading-relaxed" style={{ color: "#102B36" }}>
                    <span className="font-semibold">Use your agreed FAQs and approved company messaging.</span> Where you already have signed-off boilerplate, key messages or a published FAQ, reuse that exact wording here rather than writing something new. Keeping your earned media, your website and these answers consistent is what builds authority with AI models, so pull from your existing approved sources wherever you can.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 -mt-4 mb-8">
                <button
                  type="button"
                  onClick={() => downloadSectionQuestions(section)}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-colors"
                  style={{ borderColor: "rgba(16,43,54,0.18)", color: "#C8497A", background: "white" }}
                >
                  <Download size={13} /> Download these questions
                </button>
                <button
                  type="button"
                  onClick={downloadHowToGuide}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-colors"
                  style={{ borderColor: "rgba(16,43,54,0.18)", color: "#102B36", background: "white" }}
                >
                  <FileText size={13} /> How-to guide
                </button>
              </div>

              <div className="space-y-6">
                {section.fields.map((field) => {
                  if (!fieldApplies(field, formData)) return null;
                  const displayId = /^\d+\.\d+$/.test(field.id)
                    ? `${section.number}.${field.id.split(".")[1]}`
                    : field.id;
                  if (field.type === "heading") {
                    return (
                      <div key={field.id} className="pt-6 pb-1 first:pt-0">
                        <div className="flex items-center gap-3">
                          <span className="w-1 h-6 rounded-full flex-shrink-0" style={{ background: "#C8497A" }} />
                          <h3 className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: "#102B36" }}>
                            {field.label}
                          </h3>
                          <span className="flex-1 h-px" style={{ background: "rgba(16,43,54,0.12)" }} />
                        </div>
                      </div>
                    );
                  }

                  if (field.id === "1.8") {
                    return (
                      <div key={field.id}>
                        <FieldLabel id={displayId} label={field.label} hint={field.hint} website={aiWebsite} companyName={(formData["4.1"] as string) || ""} optimisable={(OPTIMISED_FIELD_IDS as readonly string[]).includes(field.id)} hasContent={fieldHasContent(field.id)} optimised={isOptimisedField(field.id)} optimising={optimisingField === field.id} onOptimise={() => optimiseField(field.id)} onReject={() => rejectField(field.id)} />
                        <div className="space-y-3 mb-2">
                          {spokespeople.map((sp, i) => (
                            <div key={i} className="rounded-xl border p-4" style={{ borderColor: "rgba(16,43,54,0.15)", background: "white", borderLeft: "3px solid #C8497A" }}>
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "#C8497A" }}>Spokesperson {i + 1}</span>
                                <button onClick={() => setSpokespeople(spokespeople.filter((_, j) => j !== i))} className="text-[11px]" style={{ color: vars.g400 }} title="Remove spokesperson"><X size={14} /></button>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                <div>
                                  <label className="block text-[11px] font-semibold mb-1" style={{ color: vars.g500 }}>Name</label>
                                  <input value={sp.name} onChange={(e) => setSpokespeople(spokespeople.map((s, j) => j === i ? { ...s, name: e.target.value } : s))} placeholder="e.g. Jane Smith" className="w-full px-3 py-2.5 rounded-lg border text-[14px] bg-white" style={{ borderColor: vars.g200 }} />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-semibold mb-1" style={{ color: vars.g500 }}>Title</label>
                                  <input value={sp.title} onChange={(e) => setSpokespeople(spokespeople.map((s, j) => j === i ? { ...s, title: e.target.value } : s))} placeholder="e.g. Chief Executive" className="w-full px-3 py-2.5 rounded-lg border text-[14px] bg-white" style={{ borderColor: vars.g200 }} />
                                </div>
                              </div>
                              <div className="mb-3">
                                <label className="block text-[11px] font-semibold mb-1" style={{ color: vars.g500 }}>Areas of expertise</label>
                                <div className="space-y-2">
                                  {sp.expertise.length === 0 && (
                                    <p className="text-[12px] font-light italic" style={{ color: vars.g400 }}>No areas yet. Add one below.</p>
                                  )}
                                  {sp.expertise.map((area, k) => (
                                    <div key={k} className="flex items-center gap-2">
                                      <input
                                        value={area}
                                        onChange={(e) => setSpokespeople(spokespeople.map((s, j) => j === i ? { ...s, expertise: s.expertise.map((a, m) => m === k ? e.target.value : a) } : s))}
                                        placeholder="e.g. B2B marketing strategy"
                                        className="flex-1 px-3 py-2.5 rounded-lg border text-[14px] bg-white"
                                        style={{ borderColor: vars.g200 }}
                                      />
                                      <button onClick={() => setSpokespeople(spokespeople.map((s, j) => j === i ? { ...s, expertise: s.expertise.filter((_, m) => m !== k) } : s))} className="text-[11px]" style={{ color: vars.g400 }} title="Remove area"><X size={14} /></button>
                                    </div>
                                  ))}
                                </div>
                                <button
                                  onClick={() => setSpokespeople(spokespeople.map((s, j) => j === i ? { ...s, expertise: [...s.expertise, ""] } : s))}
                                  className="mt-2 text-[12px] font-semibold px-3 py-1.5 rounded-lg border"
                                  style={{ borderColor: vars.g200, color: vars.accent }}
                                >+ Add area</button>
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold mb-1" style={{ color: vars.g500 }}>LinkedIn</label>
                                <div className="flex items-center gap-2">
                                  <Linkedin size={14} style={{ color: "#0A66C2", flexShrink: 0 }} />
                                  <input
                                    value={sp.linkedin}
                                    onChange={(e) => setSpokespeople(spokespeople.map((s, j) => j === i ? { ...s, linkedin: e.target.value } : s))}
                                    placeholder="LinkedIn URL - e.g. https://www.linkedin.com/in/yourname"
                                    className="flex-1 px-3 py-2.5 rounded-lg border text-[13px] font-light bg-white"
                                    style={{ borderColor: vars.g200 }}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => setSpokespeople([...spokespeople, { name: "", title: "", expertise: [], linkedin: "" }])}
                            disabled={spokespeople.length >= MAX_SPOKESPEOPLE}
                            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ borderColor: vars.g200, color: vars.accent }}
                          >
                            + Add spokesperson
                          </button>
                          {spokespeople.length > 0 && (
                            <button onClick={() => setSpokespeople(spokespeople.slice(0, -1))} className="flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-lg border" style={{ borderColor: vars.g200, color: vars.g500 }}><X size={13} /> Remove spokesperson</button>
                          )}
                          {spokespeople.length >= MAX_SPOKESPEOPLE && (
                            <span className="text-[11px] font-medium" style={{ color: vars.g500 }}>Maximum of {MAX_SPOKESPEOPLE} spokespeople reached.</span>
                          )}
                        </div>
                      </div>
                    );
                  }

                  if (field.id === "1.9" || field.id === "1.10") {
                    const isAudience = field.id === "1.10";
                    const selected = isAudience ? audienceCategories : businessCategories;
                    const setSelected = isAudience ? setAudienceCategories : setBusinessCategories;
                    const target: "business" | "audience" = isAudience ? "audience" : "business";
                    const openPicker = () => { setCategorySearch(""); setPickerTarget(target); };
                    return (
                      <div key={field.id}>
                        <FieldLabel id={displayId} label={field.label} hint={field.hint} website={aiWebsite} companyName={(formData["4.1"] as string) || ""} optimisable={(OPTIMISED_FIELD_IDS as readonly string[]).includes(field.id)} hasContent={fieldHasContent(field.id)} optimised={isOptimisedField(field.id)} optimising={optimisingField === field.id} onOptimise={() => optimiseField(field.id)} onReject={() => rejectField(field.id)} />
                        <div className="rounded-xl border p-3 mb-2" style={{ borderColor: vars.g200, background: "white" }}>
                          {selected.length === 0 ? (
                            <p className="text-[12px] font-light italic" style={{ color: vars.g400 }}>
                              No categories selected yet. Choose from the alphabetical list of {TRADE_MEDIA_CATEGORIES.length} media categories, or add your own if yours is not listed.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {selected.map((cat) => (
                                <span key={cat} className="text-[11px] font-medium px-2.5 py-1 rounded-full inline-flex items-center gap-1.5" style={{ background: "rgba(31,116,143,0.08)", color: vars.accent }}>
                                  {cat}
                                  <button onClick={() => setSelected(selected.filter((c) => c !== cat))} className="hover:text-red-500" title="Remove">
                                    <X size={11} />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={openPicker}
                            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border"
                            style={{ borderColor: vars.g200, color: vars.accent }}
                          >
                            + Choose from {TRADE_MEDIA_CATEGORIES.length} categories
                          </button>
                          <button
                            onClick={openPicker}
                            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-dashed inline-flex items-center gap-1.5"
                            style={{ borderColor: vars.accent, color: vars.accent, background: "rgba(200,73,122,0.06)" }}
                            title="Open the list, then type your own sector to add it"
                          >
                            <Plus size={13} /> Add your own sector
                          </button>
                          {selected.length > 0 && (
                            <span className="text-[11px] font-medium" style={{ color: vars.g500 }}>
                              {selected.length} selected
                            </span>
                          )}
                          <p className="w-full text-[11px] font-light mt-0.5" style={{ color: vars.g500 }}>
                            Can't find your sector? Open the list and type it in to add a custom one.
                          </p>
                        </div>
                      </div>
                    );
                  }

                  if (field.type === "dual") {
                    const v = duals[field.id] || { short: "", long: "" };
                    const dualColor = isOptimisedField(field.id) ? "#DC2626" : "#102B36";
                    return (
                      <div key={field.id}>
                        <FieldLabel id={displayId} label={field.label} hint={field.hint} website={aiWebsite} companyName={(formData["4.1"] as string) || ""} optimisable={(OPTIMISED_FIELD_IDS as readonly string[]).includes(field.id)} hasContent={fieldHasContent(field.id)} optimised={isOptimisedField(field.id)} optimising={optimisingField === field.id} onOptimise={() => optimiseField(field.id)} onReject={() => rejectField(field.id)} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1.5" style={{ color: "#C8497A" }}>(a) ≤6-word summary</p>
                            <input
                              value={v.short}
                              onChange={(e) => setDual(field.id, "short", e.target.value)}
                              placeholder={field.shortPlaceholder}
                              className="w-full px-4 py-3 rounded-xl border-2 text-[14px] font-light outline-none focus:border-[#C8497A] transition-colors"
                              style={{ borderColor: wordCount(v.short) > 6 ? "#DC2626" : "rgba(16,43,54,0.15)", background: "white", color: dualColor }}
                            />
                            <p className="mt-1 text-right text-[10px] font-semibold tracking-[0.04em]" style={{ color: wordCount(v.short) > 6 ? "#DC2626" : "rgba(16,43,54,0.4)" }}>
                              {wordCount(v.short) > 6 ? `${wordCount(v.short) - 6} over limit` : `${6 - wordCount(v.short)} of 6 words left`}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1.5" style={{ color: "#C8497A" }}>(b) ≤25-word longer version</p>
                            <textarea
                              value={v.long}
                              onChange={(e) => setDual(field.id, "long", e.target.value)}
                              placeholder={field.longPlaceholder}
                              rows={2}
                              className="w-full px-4 py-3 rounded-xl border-2 text-[14px] font-light outline-none focus:border-[#C8497A] transition-colors"
                              style={{ borderColor: wordCount(v.long) > 25 ? "#DC2626" : "rgba(16,43,54,0.15)", background: "white", color: dualColor }}
                            />
                            <p className="mt-1 text-right text-[10px] font-semibold tracking-[0.04em]" style={{ color: wordCount(v.long) > 25 ? "#DC2626" : "rgba(16,43,54,0.4)" }}>
                              {wordCount(v.long) > 25 ? `${wordCount(v.long) - 25} over limit` : `${25 - wordCount(v.long)} of 25 words left`}
                            </p>
                          </div>
                        </div>
                        {field.id === "1.2" && <AiAssistButton fieldId="1.2" />}
                      </div>
                    );
                  }

                  if (field.type === "dual-list") {
                    const list = dualLists[field.id] || [];
                    const listColor = isOptimisedField(field.id) ? "#DC2626" : "#102B36";
                    const noun = field.itemLabel || "message";
                    const nounCap = noun.charAt(0).toUpperCase() + noun.slice(1);
                    const nounPlural = `${noun}s`;
                    const emptyText = field.itemLabel ? `No ${nounPlural} yet.` : "No additional messages yet.";
                    return (
                      <div key={field.id}>
                        <FieldLabel id={displayId} label={field.label} hint={field.hint} website={aiWebsite} companyName={(formData["4.1"] as string) || ""} optimisable={(OPTIMISED_FIELD_IDS as readonly string[]).includes(field.id)} hasContent={fieldHasContent(field.id)} optimised={isOptimisedField(field.id)} optimising={optimisingField === field.id} onOptimise={() => optimiseField(field.id)} onReject={() => rejectField(field.id)} />
                        <div className="space-y-3 mb-2">
                          {list.length === 0 && (
                            <p className="text-[12px] font-light italic" style={{ color: vars.g400 }}>{emptyText}</p>
                          )}
                          {list.map((item, i) => (
                            <div key={i} className="rounded-xl border p-3" style={{ borderColor: "rgba(16,43,54,0.15)", background: "white", borderLeft: "3px solid #C8497A" }}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "#C8497A" }}>{nounCap} {i + 1}</span>
                                <button onClick={() => removeDualListItem(field.id, i)} title="Remove" className="text-[11px]" style={{ color: vars.g400 }}><X size={14} /></button>
                              </div>
                              <div className={field.singleField ? "" : "grid grid-cols-1 md:grid-cols-2 gap-2"}>
                                {!field.singleField && (
                                  <input
                                    value={item.short}
                                    onChange={(e) => updateDualListItem(field.id, i, "short", e.target.value)}
                                    placeholder={field.shortPlaceholder || "≤6 words"}
                                    className="w-full px-3 py-2 rounded-lg border text-[13px] bg-white"
                                    style={{ borderColor: vars.g200, color: listColor }}
                                  />
                                )}
                                <textarea
                                  value={item.long}
                                  onChange={(e) => updateDualListItem(field.id, i, "long", e.target.value)}
                                  placeholder={field.longPlaceholder || "≤25 words"}
                                  rows={field.singleField ? 3 : 2}
                                  className="w-full px-3 py-2 rounded-lg border text-[13px] bg-white"
                                  style={{ borderColor: vars.g200, color: listColor }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => addDualListItem(field.id)}
                            disabled={list.length >= maxForDualList(field.id)}
                            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ borderColor: vars.g200, color: vars.accent }}
                          >{field.addLabel || "+ Add message"}</button>
                          {list.length > 0 && (
                            <button onClick={() => removeDualListItem(field.id, list.length - 1)} className="flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-lg border" style={{ borderColor: vars.g200, color: vars.g500 }}><X size={13} /> Remove {noun}</button>
                          )}
                          {list.length >= maxForDualList(field.id) && (
                            <span className="text-[11px] font-medium" style={{ color: vars.g500 }}>Maximum of {maxForDualList(field.id)} {nounPlural} reached.</span>
                          )}
                        </div>
                      </div>
                    );
                  }

                  if (field.type === "string-list") {
                    const list = stringLists[field.id] || [];
                    const MAX_STRING_LIST = 20;
                    const updateItem = (i: number, val: string) =>
                      setStringLists((prev) => ({ ...prev, [field.id]: (prev[field.id] || []).map((s, j) => j === i ? val : s) }));
                    const removeItem = (i: number) =>
                      setStringLists((prev) => ({ ...prev, [field.id]: (prev[field.id] || []).filter((_, j) => j !== i) }));
                    const addItem = () =>
                      setStringLists((prev) => ({ ...prev, [field.id]: [...(prev[field.id] || []), ""] }));
                    return (
                      <div key={field.id}>
                        <FieldLabel id={displayId} label={field.label} hint={field.hint} website={aiWebsite} companyName={(formData["4.1"] as string) || ""} optimisable={false} hasContent={fieldHasContent(field.id)} optimised={false} optimising={false} onOptimise={() => {}} onReject={() => {}} />
                        <div className="space-y-2 mb-2">
                          {list.length === 0 && (
                            <p className="text-[12px] font-light italic" style={{ color: vars.g400 }}>No entries yet. Add one below.</p>
                          )}
                          {list.map((val, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <input
                                value={val}
                                onChange={(e) => updateItem(i, e.target.value)}
                                className="flex-1 px-3 py-2.5 rounded-lg border text-[14px] bg-white"
                                style={{ borderColor: vars.g200, color: vars.navy }}
                              />
                              <button onClick={() => removeItem(i)} title="Remove" style={{ color: vars.g400 }}><X size={14} /></button>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={addItem}
                            disabled={list.length >= MAX_STRING_LIST}
                            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ borderColor: vars.g200, color: vars.accent }}
                          >+ Add entry</button>
                          {list.length > 0 && (
                            <button onClick={() => removeItem(list.length - 1)} className="flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-lg border" style={{ borderColor: vars.g200, color: vars.g500 }}><X size={13} /> Remove last</button>
                          )}
                        </div>
                      </div>
                    );
                  }

                  if (field.id === "2.6") {
                    return (
                      <div key={field.id}>
                        <FieldLabel id={displayId} label={field.label} hint={field.hint} website={aiWebsite} companyName={(formData["4.1"] as string) || ""} optimisable={(OPTIMISED_FIELD_IDS as readonly string[]).includes(field.id)} hasContent={fieldHasContent(field.id)} optimised={isOptimisedField(field.id)} optimising={optimisingField === field.id} onOptimise={() => optimiseField(field.id)} onReject={() => rejectField(field.id)} />
                        <div className="space-y-3 mb-2">
                          {products.length === 0 && (
                            <p className="text-[12px] font-light italic" style={{ color: vars.g400 }}>No products or services yet.</p>
                          )}
                          {products.map((p, i) => (
                            <div key={i} className="rounded-xl border p-3" style={{ borderColor: "rgba(16,43,54,0.15)", background: "white", borderLeft: "3px solid #C8497A" }}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "#C8497A" }}>Product / service {i + 1}</span>
                                <button onClick={() => setProducts(products.filter((_, j) => j !== i))} title="Remove" className="text-[11px]" style={{ color: vars.g400 }}><X size={14} /></button>
                              </div>
                              <div className="space-y-2">
                                <input
                                  value={p.name}
                                  onChange={(e) => setProducts(products.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                                  placeholder="Core product or service"
                                  className="w-full px-3 py-2 rounded-lg border text-[13px] bg-white"
                                  style={{ borderColor: vars.g200 }}
                                />
                                <textarea
                                  value={p.description}
                                  onChange={(e) => setProducts(products.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                                  placeholder="One-sentence description"
                                  rows={2}
                                  className="w-full px-3 py-2 rounded-lg border text-[13px] bg-white"
                                  style={{ borderColor: vars.g200 }}
                                />
                                <input
                                  value={p.audience}
                                  onChange={(e) => setProducts(products.map((x, j) => j === i ? { ...x, audience: e.target.value } : x))}
                                  placeholder="Primary audience"
                                  className="w-full px-3 py-2 rounded-lg border text-[13px] bg-white"
                                  style={{ borderColor: vars.g200 }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => setProducts([...products, { name: "", description: "", audience: "" }])}
                            disabled={products.length >= MAX_PRODUCTS}
                            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ borderColor: vars.g200, color: vars.accent }}
                          >+ Add product / service</button>
                          {products.length > 0 && (
                            <button onClick={() => setProducts(products.slice(0, -1))} className="flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-lg border" style={{ borderColor: vars.g200, color: vars.g500 }}><X size={13} /> Remove product / service</button>
                          )}
                          {products.length >= MAX_PRODUCTS && (
                            <span className="text-[11px] font-medium" style={{ color: vars.g500 }}>Maximum of {MAX_PRODUCTS} products or services reached.</span>
                          )}
                        </div>
                      </div>
                    );
                  }

                  if (field.id === "2.7") {
                    return (
                      <div key={field.id}>
                        <FieldLabel id={displayId} label={field.label} hint={field.hint} website={aiWebsite} companyName={(formData["4.1"] as string) || ""} optimisable={(OPTIMISED_FIELD_IDS as readonly string[]).includes(field.id)} hasContent={fieldHasContent(field.id)} optimised={isOptimisedField(field.id)} optimising={optimisingField === field.id} onOptimise={() => optimiseField(field.id)} onReject={() => rejectField(field.id)} />
                        <div className="space-y-3 mb-2">
                          {productQueries.length === 0 && (
                            <p className="text-[12px] font-light italic" style={{ color: vars.g400 }}>No product or service areas yet.</p>
                          )}
                          {productQueries.map((q, i) => (
                            <div key={i} className="rounded-xl border p-3" style={{ borderColor: "rgba(16,43,54,0.15)", background: "white", borderLeft: "3px solid #C8497A" }}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "#C8497A" }}>Product / service area {i + 1}</span>
                                <button onClick={() => setProductQueries(productQueries.filter((_, j) => j !== i))} title="Remove" className="text-[11px]" style={{ color: vars.g400 }}><X size={14} /></button>
                              </div>
                              <div className="space-y-2">
                                <input
                                  value={q.area}
                                  onChange={(e) => setProductQueries(productQueries.map((x, j) => j === i ? { ...x, area: e.target.value } : x))}
                                  placeholder="Product or service area"
                                  className="w-full px-3 py-2 rounded-lg border text-[13px] bg-white"
                                  style={{ borderColor: vars.g200 }}
                                />
                                <textarea
                                  value={q.phrases}
                                  onChange={(e) => setProductQueries(productQueries.map((x, j) => j === i ? { ...x, phrases: e.target.value } : x))}
                                  placeholder="Search phrases and questions (think in questions as well as keywords)"
                                  rows={3}
                                  className="w-full px-3 py-2 rounded-lg border text-[13px] bg-white"
                                  style={{ borderColor: vars.g200 }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => setProductQueries([...productQueries, { area: "", phrases: "" }])}
                            disabled={productQueries.length >= MAX_PRODUCTS}
                            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ borderColor: vars.g200, color: vars.accent }}
                          >+ Add product / service area</button>
                          {productQueries.length > 0 && (
                            <button onClick={() => setProductQueries(productQueries.slice(0, -1))} className="flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-lg border" style={{ borderColor: vars.g200, color: vars.g500 }}><X size={13} /> Remove product / service area</button>
                          )}
                          {productQueries.length >= MAX_PRODUCTS && (
                            <span className="text-[11px] font-medium" style={{ color: vars.g500 }}>Maximum of {MAX_PRODUCTS} product or service areas reached.</span>
                          )}
                        </div>
                      </div>
                    );
                  }

                  if (field.type === "llm-queries") {
                    type QueryCategory = "discovery" | "shortlist" | "comparison";
                    const groups: { key: QueryCategory; label: string; sublabel: string }[] = [
                      { key: "discovery", label: "Discovery", sublabel: "They are researching the problem space" },
                      { key: "shortlist", label: "Shortlist", sublabel: "They are looking for a provider" },
                      { key: "comparison", label: "Comparison and trust", sublabel: "They are evaluating you against alternatives" },
                    ];
                    const hasQueries = llmQueries.discovery.length > 0 || llmQueries.shortlist.length > 0 || llmQueries.comparison.length > 0;
                    const legacyText = typeof formData[field.id] === "string" ? (formData[field.id] as string).trim() : "";
                    return (
                      <div key={field.id}>
                        <FieldLabel id={displayId} label={field.label} hint={field.hint} website={aiWebsite} companyName={(formData["4.1"] as string) || ""} optimisable={false} hasContent={hasQueries} optimised={false} optimising={false} onOptimise={() => {}} onReject={() => {}} />

                        <div className="mb-4 flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => void generateLlmQueries()}
                            disabled={llmQueriesGenerating}
                            className="self-start flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
                            style={{ background: vars.accent }}
                          >
                            {llmQueriesGenerating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                            {llmQueriesGenerating ? "Generating..." : hasQueries ? "Regenerate queries" : "Generate top 12 queries"}
                          </button>
                          {llmQueriesError && (
                            <p className="text-[12px]" style={{ color: "#DC2626" }}>{llmQueriesError}</p>
                          )}
                          {!hasQueries && !llmQueriesGenerating && (
                            <p className="text-[12px] font-light" style={{ color: vars.g500 }}>
                              Or type your own queries in the groups below. Fill in Company Set-Up (section 4) and your primary message first for the best results.
                            </p>
                          )}
                          {legacyText && !hasQueries && (
                            <div className="rounded-lg border p-3" style={{ borderColor: vars.g200, background: vars.cream }}>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-1" style={{ color: vars.g400 }}>Legacy SEO terms (replaced)</p>
                              <p className="text-[12px] font-light italic" style={{ color: vars.g500 }}>{legacyText}</p>
                            </div>
                          )}
                        </div>

                        <div className="space-y-5">
                          {groups.map(({ key, label, sublabel }) => {
                            const items = llmQueries[key];
                            return (
                              <div key={key} className="rounded-xl border-2 p-4" style={{ borderColor: "rgba(16,43,54,0.12)", background: "white" }}>
                                <div className="flex items-baseline gap-2 mb-3">
                                  <span className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: vars.accent }}>{label}</span>
                                  <span className="text-[11px] font-light" style={{ color: vars.g400 }}>{sublabel}</span>
                                </div>
                                <div className="space-y-2 mb-2">
                                  {items.length === 0 && (
                                    <p className="text-[12px] font-light italic" style={{ color: vars.g400 }}>No queries yet.</p>
                                  )}
                                  {items.map((q, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                      <input
                                        value={q}
                                        onChange={(e) => {
                                          const next = items.map((x, j) => (j === i ? e.target.value : x));
                                          setLlmQueries((prev) => ({ ...prev, [key]: next }));
                                        }}
                                        className="flex-1 px-3 py-2 rounded-lg border text-[13px] font-light outline-none focus:border-[#C8497A] transition-colors"
                                        style={{ borderColor: "rgba(16,43,54,0.15)", color: "#102B36" }}
                                        placeholder="Type a query, e.g. How do I find the best..."
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const next = items.filter((_, j) => j !== i);
                                          setLlmQueries((prev) => ({ ...prev, [key]: next }));
                                        }}
                                        className="flex-shrink-0 p-1 rounded transition-opacity hover:opacity-70"
                                        style={{ color: vars.g400 }}
                                        title="Remove query"
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setLlmQueries((prev) => ({ ...prev, [key]: [...prev[key], ""] }))}
                                  className="text-[12px] font-semibold flex items-center gap-1 mt-1 transition-opacity hover:opacity-70"
                                  style={{ color: vars.accent }}
                                >
                                  <Plus size={12} /> Add query
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  if (field.type === "checkbox" && field.options) {
                    const selected = (formData[field.id] as string[]) || [];
                    return (
                      <div key={field.id}>
                        <FieldLabel id={displayId} label={field.label} hint={field.hint} website={aiWebsite} companyName={(formData["4.1"] as string) || ""} optimisable={(OPTIMISED_FIELD_IDS as readonly string[]).includes(field.id)} hasContent={fieldHasContent(field.id)} optimised={isOptimisedField(field.id)} optimising={optimisingField === field.id} onOptimise={() => optimiseField(field.id)} onReject={() => rejectField(field.id)} />
                        <div className="space-y-2 rounded-xl border-2 p-4" style={{ borderColor: "rgba(16,43,54,0.15)", background: "white" }}>
                          {field.options.map((opt) => {
                            const isOn = selected.includes(opt);
                            const onPick = () => (field.single ? selectSingle(field.id, opt) : toggleCheckbox(field.id, opt));
                            return (
                              <label key={opt} className="flex items-start gap-3 cursor-pointer group p-2 rounded-lg transition-colors hover:bg-[#FBF1F0]">
                                <div
                                  className={`w-5 h-5 border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${field.single ? "rounded-full" : "rounded"}`}
                                  style={{
                                    borderColor: isOn ? "#C8497A" : "rgba(16,43,54,0.25)",
                                    background: isOn && !field.single ? "#C8497A" : "transparent",
                                  }}
                                  onClick={onPick}
                                >
                                  {isOn && (field.single
                                    ? <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#C8497A" }} />
                                    : <Check size={12} color="white" />)}
                                </div>
                                <span className="text-[13px] leading-relaxed" style={{ color: isOn ? "#102B36" : "#374151", fontWeight: isOn ? 600 : 400 }} onClick={onPick}>
                                  {opt}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  const baseColor = isOptimisedField(field.id) ? "#DC2626" : "#102B36";
                  return (
                    <div key={field.id}>
                      <FieldLabel id={displayId} label={field.label} hint={field.hint} website={aiWebsite} companyName={(formData["4.1"] as string) || ""} optimisable={(OPTIMISED_FIELD_IDS as readonly string[]).includes(field.id)} hasContent={fieldHasContent(field.id)} optimised={isOptimisedField(field.id)} optimising={optimisingField === field.id} onOptimise={() => optimiseField(field.id)} onReject={() => rejectField(field.id)} />
                      {field.type === "textarea" ? (
                        <>
                          <textarea
                            value={(formData[field.id] as string) || ""}
                            onChange={(e) => updateField(field.id, e.target.value)}
                            rows={4}
                            className="w-full px-4 py-3 rounded-xl border-2 text-[14px] font-light outline-none transition-colors focus:border-[#C8497A] resize-y"
                            style={{ borderColor: field.wordLimit && wordCount((formData[field.id] as string) || "") > field.wordLimit ? "#DC2626" : "rgba(16,43,54,0.15)", background: "white", color: baseColor }}
                            placeholder="Type your answer here..."
                          />
                          {field.wordLimit && (() => {
                            const wc = wordCount((formData[field.id] as string) || "");
                            const over = wc > field.wordLimit;
                            return (
                              <p className="mt-1 text-right text-[10px] font-semibold tracking-[0.04em]" style={{ color: over ? "#DC2626" : "rgba(16,43,54,0.4)" }}>
                                {over ? `${wc - field.wordLimit} over limit` : `${field.wordLimit - wc} of ${field.wordLimit} words left`}
                              </p>
                            );
                          })()}
                        </>
                      ) : (
                        <input
                          type="text"
                          value={(formData[field.id] as string) || ""}
                          onChange={(e) => updateField(field.id, e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border-2 text-[14px] font-light outline-none transition-colors focus:border-[#C8497A]"
                          style={{ borderColor: "rgba(16,43,54,0.15)", background: "white", color: baseColor }}
                          placeholder="Type your answer here..."
                        />
                      )}
                      {field.id === "1.1" && <AiAssistButton fieldId="1.1" />}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="px-4 sm:px-8 py-5 border-t flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3" style={{ borderColor: vars.g100 }}>
              <button
                onClick={() => activeSection > 0 && setActiveSection(activeSection - 1)}
                disabled={activeSection === 0}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-30"
                style={{ borderColor: vars.g200, color: vars.g500 }}
              >
                <ArrowLeft size={14} /> Previous
              </button>
              <div className="flex items-center gap-3 justify-end flex-wrap">
                <button
                  onClick={saveDraft}
                  title="Save your progress so you can finish later"
                  className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] px-4 py-2.5 rounded-full border-2 transition-colors"
                  style={{
                    borderColor: justSaved ? vars.green : "#102B36",
                    color: justSaved ? vars.green : "#102B36",
                    background: justSaved ? "rgba(61,155,107,0.1)" : "transparent",
                  }}
                >
                  {justSaved ? <><Check size={13} /> Saved</> : <><Save size={13} /> Save for later</>}
                </button>
                <button
                  onClick={() => {
                    if (completed.has(activeSection)) {
                      setCompleted((prev) => { const next = new Set(prev); next.delete(activeSection); return next; });
                    } else {
                      markComplete(activeSection, !(track === "pr" && activeSection === visibleSections.length - 1));
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    background: completed.has(activeSection) ? "rgba(61,155,107,0.08)" : "rgba(31,116,143,0.06)",
                    color: completed.has(activeSection) ? vars.green : vars.accent,
                  }}
                >
                  {completed.has(activeSection) ? (<><CheckCircle2 size={14} /> Completed</>) : (<><Check size={14} /> Mark Complete</>)}
                </button>
                {activeSection < visibleSections.length - 1 ? (
                  <button
                    onClick={() => setActiveSection(activeSection + 1)}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:brightness-110"
                    style={{ background: vars.accent }}
                  >
                    Next <ArrowRight size={14} />
                  </button>
                ) : track === "pr" ? (
                  completed.has(activeSection) ? (
                    <button
                      onClick={() => setTrack("web")}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:brightness-110"
                      style={{ background: vars.accent }}
                    >
                      Continue to AIO Set-Up <ArrowRight size={14} />
                    </button>
                  ) : (
                    <button
                      onClick={() => { markComplete(activeSection, false); }}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:brightness-110"
                      style={{ background: vars.green }}
                    >
                      <CheckCircle2 size={14} /> Mark section complete
                    </button>
                  )
                ) : (
                  <button
                    onClick={() => { markComplete(activeSection); }}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:brightness-110"
                    style={{ background: vars.green }}
                  >
                    <CheckCircle2 size={14} /> Mark section complete
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Trade Media Categories picker */}
      {pickerTarget !== null && (() => {
        const pickerSelected = pickerTarget === "audience" ? audienceCategories : businessCategories;
        const pickerSet = pickerTarget === "audience" ? setAudienceCategories : setBusinessCategories;
        const pickerTitle = pickerTarget === "audience" ? "Where your customers are found" : "Your business categories";
        const customLabel = categorySearch.trim();
        const lowerSearch = customLabel.toLowerCase();
        const alreadyExists =
          TRADE_MEDIA_CATEGORIES.some((c) => c.toLowerCase() === lowerSearch) ||
          pickerSelected.some((c) => c.toLowerCase() === lowerSearch);
        const canAddCustom = customLabel.length > 0 && !alreadyExists;
        const customSelected = pickerSelected.filter((c) => !TRADE_MEDIA_CATEGORIES.includes(c));
        const customMatches = customSelected.filter(
          (c) => !categorySearch || c.toLowerCase().includes(lowerSearch),
        );
        const displayCategories = [...customMatches, ...filteredCategories];
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setPickerTarget(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: vars.g200 }}>
              <h2 className="text-[16px] font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>{pickerTitle} - trade media (alpha)</h2>
              <button onClick={() => setPickerTarget(null)} className="text-[20px] leading-none px-2" style={{ color: vars.g400 }}>&times;</button>
            </div>
            <div className="px-6 py-3 border-b" style={{ borderColor: vars.g100 }}>
              <input
                autoFocus
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canAddCustom) {
                    e.preventDefault();
                    pickerSet([...pickerSelected, customLabel]);
                    setCategorySearch("");
                  }
                }}
                placeholder="Filter or type a sector to add..."
                className="w-full px-3 py-2 rounded-lg border text-[13px]"
                style={{ borderColor: vars.g200 }}
              />
              {canAddCustom && (
                <button
                  onClick={() => { pickerSet([...pickerSelected, customLabel]); setCategorySearch(""); }}
                  className="mt-2 w-full text-left text-[12px] font-semibold px-3 py-2 rounded-lg border border-dashed flex items-center gap-2"
                  style={{ borderColor: vars.accent, color: vars.accent, background: "rgba(200,73,122,0.06)" }}
                >
                  <Plus size={13} /> Add "{customLabel}" as a custom sector
                </button>
              )}
              <p className="text-[11px] font-medium mt-2" style={{ color: vars.g500 }}>
                {pickerSelected.length} selected (can't find yours? type it above and add it)
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {displayCategories.map((cat) => {
                  const on = pickerSelected.includes(cat);
                  return (
                    <button
                      key={cat}
                      onClick={() => pickerSet(on ? pickerSelected.filter((c) => c !== cat) : [...pickerSelected, cat])}
                      className="text-left px-3 py-2 rounded-lg flex items-center gap-2 transition-colors"
                      style={{ background: on ? "rgba(31,116,143,0.08)" : "transparent" }}
                    >
                      <div
                        className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0"
                        style={{ borderColor: on ? vars.accent : vars.g300, background: on ? vars.accent : "transparent" }}
                      >
                        {on && <Check size={11} color="white" />}
                      </div>
                      <span className="text-[12px]" style={{ color: vars.navy }}>{cat}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="px-6 py-3 border-t flex justify-end gap-2" style={{ borderColor: vars.g200 }}>
              <button onClick={() => pickerSet([])} className="text-[12px] font-semibold px-3 py-2 rounded-lg" style={{ color: vars.g500 }}>Clear all</button>
              <button onClick={() => setPickerTarget(null)} className="text-[13px] font-semibold px-4 py-2 rounded-lg text-white" style={{ background: vars.accent }}>Done</button>
            </div>
          </div>
        </div>
        );
      })()}

      {acceptedAt && intakeStatus === "Accepted" && (
        <div className="mt-6 rounded-xl border p-4 flex items-start gap-3" style={{ background: "rgba(61,155,107,0.06)", borderColor: "rgba(61,155,107,0.25)" }}>
          <CheckCircle2 size={18} color={vars.green} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-[13px] font-semibold" style={{ color: vars.navy }}>Project Data signed off on {new Date(acceptedAt).toLocaleDateString()}.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldLabel({ id, label, hint, website = "", companyName = "", optimisable = false, hasContent = false, optimised = false, optimising = false, onOptimise, onReject }: { id: string; label: string; hint?: string; website?: string; companyName?: string; optimisable?: boolean; hasContent?: boolean; optimised?: boolean; optimising?: boolean; onOptimise?: () => void; onReject?: () => void }) {
  const [copied, setCopied] = useState(false);
  // Build a ready-to-paste prompt for an external AI assistant, with the
  // company name and website built in so the draft reflects the real business.
  const buildPrompt = (): string => {
    const site = (website || "").trim();
    const company = (companyName || "").trim();
    const lines: string[] = [];
    lines.push(
      `I am completing a business profile${company ? ` for ${company}` : ""}${site ? ` (website: ${site})` : ""}. I need help drafting one answer.`,
    );
    lines.push("");
    lines.push(
      site
        ? "Use the website above as your primary source. Write in British English and keep the answer concise, specific and factual to this business. Do not invent details that are not supported by the website."
        : "Write in British English and keep the answer concise, specific and factual to this business. Do not invent details.",
    );
    lines.push("");
    lines.push(`Question: ${label}`);
    if (hint) lines.push(`Guidance: ${hint}`);
    lines.push("");
    lines.push("Please draft a suggested answer for me to review and edit.");
    return lines.join("\n");
  };
  const copyQuestion = () => {
    const text = buildPrompt();
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1800); };
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => done());
      } else {
        const ta = document.createElement("textarea");
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); document.body.removeChild(ta); done();
      }
    } catch { done(); }
  };
  return (
    <div className="mb-2.5">
      <label className="flex items-baseline gap-2.5 text-[15px] font-bold leading-snug" style={{ color: "#102B36", fontFamily: "'Alice', Georgia, serif" }}>
        {id.match(/^\d/) && (
          <span className="inline-flex items-center justify-center text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-0.5 rounded-md flex-shrink-0" style={{ background: "#FBE3ED", color: "#C8497A", fontFamily: "Inter, sans-serif" }}>{id}</span>
        )}
        <span>{label}</span>
        <button
          type="button"
          onClick={copyQuestion}
          title="Copy a ready-to-paste prompt (with your company website built in) for your own AI assistant to draft this answer"
          className="inline-flex items-center gap-1 text-[10px] font-semibold flex-shrink-0 px-1.5 py-0.5 rounded-md transition-colors self-center"
          style={{ color: copied ? "#3D9B6B" : "#C8497A", fontFamily: "Inter, sans-serif", background: copied ? "rgba(61,155,107,0.1)" : "transparent" }}
        >
          {copied ? <><Check size={12} /> Copied</> : <Copy size={12} />}
        </button>
        {optimisable && optimised && (
          <button
            type="button"
            onClick={onReject}
            title="Reject the AI version and restore what you had"
            className="inline-flex items-center gap-1 text-[10px] font-semibold flex-shrink-0 px-1.5 py-0.5 rounded-md transition-colors self-center"
            style={{ color: "#C94A3E", fontFamily: "Inter, sans-serif", background: "rgba(201,74,62,0.08)" }}
          >
            <Undo2 size={12} /> Reject
          </button>
        )}
        {optimisable && hasContent && !optimised && (
          <button
            type="button"
            onClick={onOptimise}
            disabled={optimising}
            title="Optimise this copy: AI rewrites the answer you have written to be stronger and easier for AI models to cite, keeping your own facts. You can Reject to restore your original."
            className="inline-flex items-center gap-1 text-[10px] font-semibold flex-shrink-0 px-1.5 py-0.5 rounded-md transition-colors self-center"
            style={{ color: "#2896b9", fontFamily: "Inter, sans-serif", background: "rgba(40,150,185,0.08)", cursor: optimising ? "default" : "pointer", opacity: optimising ? 0.7 : 1 }}
          >
            <Sparkles size={12} className={optimising ? "animate-pulse" : ""} /> {optimising ? "Optimising this copy..." : "Optimise this copy"}
          </button>
        )}
      </label>
      {hint && <p className="text-[12px] font-light leading-relaxed mt-1.5 pl-0.5" style={{ color: "#374151" }}>{hint}</p>}
    </div>
  );
}

// Cross-module helpers - consumed by Optimiser, Creator, Media Research, Comms Planner, Marketing Intelligence.
export type IntakeData = {
  formData: Record<string, string | string[]>;
  duals: Record<string, DualValue>;
  dualLists: Record<string, DualListValue>;
  stringLists: Record<string, string[]>;
  spokespeople: Spokesperson[];
  products: Product[];
  productQueries: ProductQuery[];
  businessCategories: string[];
  audienceCategories: string[];
  mediaCategories: string[];
  intakeStatus: IntakeStatus;
  acceptedAt: string | null;
  aiWebsite: string;
  confirmedEntity: ConfirmedEntity;
  llmQueries?: LlmQueries;
};

// The company the user confirmed is theirs when the brand name is shared with
// other organisations (the Earned Media entity-clarity step). Null when the user
// has made no choice, which keeps the audit's deterministic resolution.
export type ConfirmedEntity = { name: string; description: string } | null;

export function normaliseConfirmedEntity(raw: unknown): ConfirmedEntity {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim().slice(0, 200) : "";
  if (!name) return null;
  const description = typeof r.description === "string" ? r.description.trim().slice(0, 300) : "";
  return { name, description };
}

export function loadIntakeData(): IntakeData | null {
  try {
    const raw = localStorage.getItem(currentIntakeKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      formData: parsed.formData || {},
      duals: parsed.duals || {},
      dualLists: migrateLegacyDualLists(parsed.dualLists || {}, parsed.formData || {}),
      stringLists: (() => {
        if (parsed.stringLists && typeof parsed.stringLists === "object") {
          return parsed.stringLists as Record<string, string[]>;
        }
        const migrated: Record<string, string[]> = {};
        const fd = parsed.formData || {};
        for (const id of ["3.3", "4.8"]) {
          const legacy = fd[id];
          if (typeof legacy === "string" && legacy.trim()) {
            migrated[id] = legacy.split(/[\n,]+/).map((s: string) => s.trim()).filter(Boolean);
          }
        }
        return migrated;
      })(),
      spokespeople: (parsed.spokespeople || []).map((s: Partial<Spokesperson>) => ({
        name: s.name || "",
        title: s.title || "",
        expertise: normaliseExpertise(s.expertise),
        linkedin: s.linkedin || "",
      })),
      products: (() => {
        const arr = parsed.products;
        if (Array.isArray(arr)) {
          return arr.map((p: Partial<Product>) => ({
            name: p.name || "",
            description: p.description || "",
            audience: p.audience || "",
          }));
        }
        const legacy = parsed.formData?.["2.6"];
        if (typeof legacy === "string" && legacy.trim()) {
          return [{ name: "", description: legacy, audience: "" }];
        }
        return [];
      })(),
      productQueries: (() => {
        const arr = parsed.productQueries;
        if (Array.isArray(arr)) {
          return arr.map((q: Partial<ProductQuery>) => ({
            area: q.area || "",
            phrases: q.phrases || "",
          }));
        }
        const legacy = parsed.formData?.["2.7"];
        if (typeof legacy === "string" && legacy.trim()) {
          return [{ area: "", phrases: legacy }];
        }
        return [];
      })(),
      llmQueries: (() => {
        const q = parsed.llmQueries;
        if (q && q.v === 1 && Array.isArray(q.discovery)) {
          return { v: 1 as const, discovery: q.discovery as string[], shortlist: (q.shortlist as string[]) || [], comparison: (q.comparison as string[]) || [] };
        }
        return undefined;
      })(),
      businessCategories: parsed.businessCategories || parsed.mediaCategories || [],
      audienceCategories: parsed.audienceCategories || [],
      mediaCategories: Array.from(new Set([...(parsed.businessCategories || parsed.mediaCategories || []), ...(parsed.audienceCategories || [])])),
      intakeStatus: parsed.intakeStatus || "Draft",
      acceptedAt: parsed.acceptedAt || null,
      aiWebsite: typeof parsed.aiWebsite === "string" ? parsed.aiWebsite : "",
      confirmedEntity: normaliseConfirmedEntity(parsed.confirmedEntity),
    };
  } catch { return null; }
}

// The entity the user confirmed is theirs from the entity-clarity step, or null.
export function getConfirmedEntity(): ConfirmedEntity {
  return loadIntakeData()?.confirmedEntity || null;
}

// Persist (or clear, with null) the user's confirmed identity into the active
// project's intake blob, merging so no other field is touched. Used by the LLM
// Check page; the next audit reads it via getProjectAuthorityData.
//
// The confirmed identity travels inside the intake blob, so as well as writing
// localStorage we mirror the updated blob to the shared server store. Without
// this the choice only existed in the browser that made it: another device, or
// a teammate on the same account, would never see it and the audit could pick
// the wrong namesake again. markIntakeSaved keeps the existing intake guards
// (it skips a blank Set-Up so we never wipe a populated server copy).
export function setConfirmedEntity(entity: ConfirmedEntity): void {
  try {
    const key = currentIntakeKey();
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    const normalised = normaliseConfirmedEntity(entity);
    if (normalised) parsed.confirmedEntity = normalised;
    else delete parsed.confirmedEntity;
    localStorage.setItem(key, JSON.stringify(parsed));
    try {
      const id = getActiveProjectId() || "default";
      const name = typeof parsed?.formData?.["4.1"] === "string" ? parsed.formData["4.1"] : "";
      markIntakeSaved(id, parsed, name);
    } catch { /* noop */ }
  } catch { /* noop */ }
}

export function getKeyMessages(): { short: string; long: string; tag: string }[] {
  const data = loadIntakeData();
  const out: { short: string; long: string; tag: string }[] = [];
  if (!data) {
    return [
      { short: "AI authority for PR", long: "AIO Fusion is the AI authority platform for PR and marketing professionals.", tag: "Primary" },
      { short: "Earned + owned in one", long: "Plan, optimise, score and measure both earned and owned media from a single workflow.", tag: "Secondary 1" },
      { short: "Predict, don't guess", long: "Predict the AI authority score of every campaign before you commit budget.", tag: "Secondary 2" },
    ];
  }
  const primary = data.duals["1.2"];
  if (primary && (primary.short || primary.long)) {
    out.push({ short: primary.short, long: primary.long, tag: "Primary" });
  }
  const additional = data.dualLists["1.3"] || [];
  additional.forEach((m, i) => {
    if (m.short || m.long) out.push({ short: m.short, long: m.long, tag: `Secondary ${i + 1}` });
  });
  return out.length > 0 ? out : [{ short: "Primary message not yet set", long: "Add your primary message in Project Set-Up section 1.2.", tag: "Primary" }];
}

export type ProjectDataMessage = { label: string; value: string; section: "1" | "2" | "3"; fieldId: string; fieldLabel: string };

export function getProjectDataMessages(): ProjectDataMessage[] {
  const data = loadIntakeData();
  const out: ProjectDataMessage[] = [];
  if (!data) return out;

  const pushLines = (raw: unknown, section: "1" | "2" | "3", fieldId: string, fieldLabel: string) => {
    if (typeof raw !== "string" || !raw.trim()) return;
    raw.split(/\n+/).map((s) => s.trim()).filter(Boolean).forEach((line) => {
      out.push({ label: line.length > 90 ? `${line.slice(0, 90)}…` : line, value: line, section, fieldId, fieldLabel });
    });
  };

  // Section 1
  const primary = data.duals["1.2"];
  if (primary && (primary.short || primary.long)) {
    const label = primary.short || primary.long;
    out.push({ label, value: primary.long || primary.short, section: "1", fieldId: "1.2", fieldLabel: "Primary Message" });
  }
  (data.dualLists["1.3"] || []).forEach((m, i) => {
    if (m.short || m.long) {
      const label = m.short || m.long;
      out.push({ label, value: m.long || m.short, section: "1", fieldId: "1.3", fieldLabel: `Additional Message ${i + 1}` });
    }
  });
  pushLines(data.formData["1.4"], "1", "1.4", "Online evidence");
  // 1.6 is now structured LLM search queries
  if (data.llmQueries?.v === 1) {
    const llmGroups: { label: string; items: string[] }[] = [
      { label: "Discovery query", items: data.llmQueries.discovery },
      { label: "Shortlist query", items: data.llmQueries.shortlist },
      { label: "Comparison query", items: data.llmQueries.comparison },
    ];
    for (const group of llmGroups) {
      group.items.forEach((q) => {
        if (!q.trim()) return;
        out.push({ label: q.length > 90 ? `${q.slice(0, 90)}\u2026` : q, value: q, section: "1", fieldId: "1.6", fieldLabel: group.label });
      });
    }
  } else {
    pushLines(data.formData["1.6"], "1", "1.6", "LLM search query");
  }
  pushLines(data.formData["1.7"], "1", "1.7", "Topics & themes");

  // Section 2
  pushLines(data.formData["2.1"], "2", "2.1", "Pre-purchase questions");
  pushLines(data.formData["2.2"], "2", "2.2", "Post-purchase questions");
  pushLines(data.formData["2.3"], "2", "2.3", "Misconceptions / objections");
  pushLines(data.formData["2.4"], "2", "2.4", "Category questions");
  pushLines(data.formData["2.5"], "2", "2.5", "Positioning copy");
  (data.products || []).forEach((p, i) => {
    const parts = [p.name, p.description, p.audience ? `Primary audience: ${p.audience}` : ""].filter(Boolean);
    if (parts.length === 0) return;
    const value = parts.join(" - ");
    const label = p.name || (value.length > 90 ? `${value.slice(0, 90)}…` : value);
    out.push({ label, value, section: "2", fieldId: "2.6", fieldLabel: `Core product / service ${i + 1}` });
  });
  (data.productQueries || []).forEach((q, i) => {
    const parts = [q.area, q.phrases].filter(Boolean);
    if (parts.length === 0) return;
    const value = parts.join(" - ");
    const label = q.area || (value.length > 90 ? `${value.slice(0, 90)}…` : value);
    out.push({ label, value, section: "2", fieldId: "2.7", fieldLabel: `Search phrases - area ${i + 1}` });
  });

  // Section 3
  (data.dualLists["3.1"] || []).forEach((p, i) => {
    if (!(p.short || p.long)) return;
    const value = [p.short, p.long].filter(Boolean).join(" - ");
    const label = p.short || (value.length > 90 ? `${value.slice(0, 90)}…` : value);
    out.push({ label, value, section: "3", fieldId: "3.1", fieldLabel: `Ideal client persona ${i + 1}` });
  });
  (data.dualLists["3.2"] || []).forEach((p, i) => {
    if (!(p.short || p.long)) return;
    const value = [p.short, p.long].filter(Boolean).join(" - ");
    const label = value.length > 90 ? `${value.slice(0, 90)}…` : value;
    out.push({ label, value, section: "3", fieldId: "3.2", fieldLabel: `Ideal client profile ${i + 1}` });
  });
  (data.stringLists?.["3.3"] || (typeof data.formData["3.3"] === "string" ? data.formData["3.3"]!.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean) : [])).forEach((loc, i) => {
    if (!loc.trim()) return;
    out.push({ label: loc.trim(), value: loc.trim(), section: "3", fieldId: "3.3", fieldLabel: `Client location ${i + 1}` });
  });
  (data.dualLists["3.5"] || []).forEach((p, i) => {
    if (!(p.short || p.long)) return;
    const value = [p.short, p.long].filter(Boolean).join(" - ");
    const label = value.length > 90 ? `${value.slice(0, 90)}…` : value;
    out.push({ label, value, section: "3", fieldId: "3.5", fieldLabel: `Pain point ${i + 1}` });
  });
  pushLines(data.formData["3.5b"], "3", "3.5b", "Challenges solved");
  (data.dualLists["3.6"] || []).forEach((p, i) => {
    if (!(p.short || p.long)) return;
    const value = [p.short, p.long].filter(Boolean).join(" - ");
    const label = value.length > 90 ? `${value.slice(0, 90)}…` : value;
    out.push({ label, value, section: "3", fieldId: "3.6", fieldLabel: `Desired outcome ${i + 1}` });
  });

  return out;
}

export function getSpokespeople(): Spokesperson[] {
  const data = loadIntakeData();
  return data?.spokespeople || [];
}

export function getProjectMediaCategories(): string[] {
  const data = loadIntakeData();
  return data?.mediaCategories || [];
}

export function getBusinessSectors(): string[] {
  const data = loadIntakeData();
  return data?.businessCategories || [];
}

export function getTargetSectors(): string[] {
  const data = loadIntakeData();
  return data?.audienceCategories || [];
}

function joinDualList(items: DualListValue | undefined): string {
  return (items || [])
    .map((it) => [it.short, it.long].filter(Boolean).join(" - "))
    .filter(Boolean)
    .join("\n");
}

export function getIcpProfile(): string {
  const data = loadIntakeData();
  // loadIntakeData migrates legacy free text into dualLists, so once the key
  // exists it is the source of truth. Only fall back to the legacy free-text
  // answer when the key is absent, so clearing all entries (saved as []) cannot
  // resurrect the old text here.
  const items = data?.dualLists?.["3.2"];
  if (items !== undefined) return joinDualList(items);
  const raw = data?.formData?.["3.2"];
  return typeof raw === "string" ? raw.trim() : "";
}

export function getClientPersona(): string {
  const data = loadIntakeData();
  const items = data?.dualLists?.["3.1"];
  if (items !== undefined) return joinDualList(items);
  const raw = data?.formData?.["3.1"];
  return typeof raw === "string" ? raw.trim() : "";
}

export function getClientLocations(): string {
  const data = loadIntakeData();
  const sl = data?.stringLists?.["3.3"];
  if (Array.isArray(sl) && sl.length > 0) return sl.filter(Boolean).join(", ");
  const raw = data?.formData?.["3.3"];
  return typeof raw === "string" ? raw.trim() : "";
}

export function getPreferredKeywords(): string[] {
  const data = loadIntakeData();
  // 1.6 is now a structured LLM queries field. Return all queries flat so any
  // downstream consumer that was using keyword hints still gets useful strings.
  // When structured queries exist, they take priority over any legacy plain text.
  const q = data?.llmQueries;
  if (q && q.v === 1 && (q.discovery.length > 0 || q.shortlist.length > 0 || q.comparison.length > 0)) {
    return Array.from(new Set([...q.discovery, ...q.shortlist, ...q.comparison].filter(Boolean)));
  }
  // Legacy: if still a plain string (pre-migration), return lines for backward compat.
  const raw = data?.formData?.["1.6"];
  if (typeof raw !== "string" || !raw.trim()) return [];
  return Array.from(
    new Set(
      raw
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
}

function fieldText(fieldId: string): string {
  const data = loadIntakeData();
  const raw = data?.formData?.[fieldId];
  return typeof raw === "string" ? raw.trim() : "";
}

function fieldLines(fieldIds: string[], splitCommas = false): string[] {
  const data = loadIntakeData();
  if (!data) return [];
  const out: string[] = [];
  const splitter = splitCommas ? /[\n,]+/ : /\n+/;
  for (const id of fieldIds) {
    const raw = data.formData?.[id];
    if (typeof raw !== "string") continue;
    raw
      .split(splitter)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((line) => out.push(line));
  }
  return Array.from(new Set(out));
}

// Company descriptor (1.1), legal name (4.1) and one-sentence boilerplate (4.3).
export function getCompanyDescriptor(): string {
  return fieldText("1.1");
}

export function getLegalName(): string {
  return fieldText("4.1");
}

export function getBoilerplate(): string {
  return fieldText("4.3");
}

// Primary competitors (4.8) - individual rows stored in stringLists, with
// fallback to the legacy comma/newline-separated formData string.
export function getCompetitors(): string[] {
  const data = loadIntakeData();
  const sl = data?.stringLists?.["4.8"];
  if (Array.isArray(sl) && sl.length > 0) return sl.map((s) => s.trim()).filter(Boolean);
  return fieldLines(["4.8"], true);
}

// Evidence, coverage and citation URLs: online evidence (1.4),
// key media coverage links (4.7) and third-party profiles / citations (7.3).
export function getEvidenceUrls(): string[] {
  return fieldLines(["1.4", "4.7", "7.3"]);
}

// Verbatim buyer questions (5.6) - real questions to seed the blind probes.
export function getBuyerQuestions(): string[] {
  return fieldLines(["5.6"]);
}

// Structured LLM search queries from 1.6 — the primary probes for the Earned
// Media Visibility Audit. Returns an empty set when no queries have been generated.
export function getLlmSearchQueries(): LlmQueries {
  const data = loadIntakeData();
  const q = data?.llmQueries;
  if (q && q.v === 1 && Array.isArray(q.discovery)) {
    return { v: 1, discovery: q.discovery, shortlist: q.shortlist || [], comparison: q.comparison || [] };
  }
  return { v: 1, discovery: [], shortlist: [], comparison: [] };
}

// Topics where the brand has specialist expertise or data (5.7) - scoring context.
export function getExpertiseTopics(): string[] {
  return fieldLines(["5.7"]);
}

// The company website. Stored top-level as aiWebsite (the website used for
// AI-assisted drafting). Falls back to the first URL in the homepage descriptor
// (6.2) so the audit can anchor identity even before the AI-assist field is set.
export function getWebsite(): string {
  const data = loadIntakeData();
  const direct = (data?.aiWebsite || "").trim();
  if (direct) return direct;
  const homepage = data?.formData?.["6.2"];
  if (typeof homepage === "string") {
    const m = homepage.match(/https?:\/\/[^\s)]+|(?:[\w-]+\.)+[a-z]{2,}(?:\/\S*)?/i);
    if (m) return m[0].trim();
  }
  return "";
}

export type ProjectAuthorityData = {
  descriptor: string;
  legalName: string;
  website: string;
  boilerplate: string;
  competitors: string[];
  evidenceUrls: string[];
  buyerQuestions: string[];
  expertiseTopics: string[];
  spokespeople: Spokesperson[];
  confirmedEntity: ConfirmedEntity;
  knownNamesakes: string[];
};

function getKnownNamesakes(): string[] {
  return fieldLines(["4.9"], true);
}

// Bundle of the intake data the Earned Media authority report scores against.
export function getProjectAuthorityData(): ProjectAuthorityData {
  return {
    descriptor: getCompanyDescriptor(),
    legalName: getLegalName(),
    website: getWebsite(),
    boilerplate: getBoilerplate(),
    competitors: getCompetitors(),
    evidenceUrls: getEvidenceUrls(),
    buyerQuestions: getBuyerQuestions(),
    expertiseTopics: getExpertiseTopics(),
    spokespeople: getSpokespeople(),
    confirmedEntity: getConfirmedEntity(),
    knownNamesakes: getKnownNamesakes(),
  };
}
