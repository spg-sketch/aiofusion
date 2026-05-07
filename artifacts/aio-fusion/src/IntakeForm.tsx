import { useState, useEffect, useMemo } from "react";
import {
  ChevronRight,
  ChevronDown,
  Check,
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
  Pencil,
  Plus,
  X,
  Linkedin,
} from "lucide-react";
import { TRADE_MEDIA_CATEGORIES } from "./tradeMediaCategories";

const vars = {
  navy: "#165265",
  accent: "#1f748f",
  teal: "#2896b9",
  green: "#3D9B6B",
  amber: "#D4922A",
  coral: "#E07856",
  cream: "#F8F2E8",
  gold: "#C9A04E",
  g50: "#FAFAFA",
  g100: "#F3F3F3",
  g200: "#E5E5E5",
  g300: "#D4D4D4",
  g400: "#9CA3AF",
  g500: "#6B7280",
  g600: "#374151",
};

type Track = "pr" | "web";

type Spokesperson = { name: string; title: string; expertise: string; linkedin: string };

type FieldDef = {
  id: string;
  label: string;
  hint?: string;
  type: "text" | "textarea" | "checkbox" | "heading" | "dual" | "dual-list";
  options?: string[];
  shortPlaceholder?: string;
  longPlaceholder?: string;
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

type DualValue = { short: string; long: string };
type DualListValue = DualValue[];

const INTAKE_KEY = "aio.intake.v1";

// PR Set-Up sections (Business Messaging) — PR comes first per Patrick.
// Field IDs preserve their original numbering (4.x, 6.x) so they remain stable
// references for Optimiser, Comms Planner, Media Research and Marketing Intel.
const sections: SectionDef[] = [
  {
    id: "earned-media",
    track: "pr",
    number: 1,
    title: "Earned Media: Message Framework",
    subtitle: "Boilerplate, message hierarchy, spokespeople and trade media categories",
    icon: Mic2,
    intro:
      "Earned media is one of the highest-authority signals for GEO. AI models are trained on the open web: a well-placed article in a credible outlet is more powerful than any on-site SEO tactic. The fields below feed every other module — Optimiser, Comms Planner, Content Creator, Media Research and Marketing Intelligence.",
    fields: [
      { id: "h-bp", label: "Core Boilerplate", type: "heading" },
      {
        id: "4.1",
        label: "100-word company descriptor",
        hint: "Enter or draft the raw ingredients for a new 100-word company descriptor for press use.",
        type: "textarea",
      },
      { id: "h-mh", label: "Message Hierarchy", type: "heading" },
      {
        id: "4.2",
        label: "Primary Message",
        hint: "Enter a Primary Message providing a short summary (no more than six words). And a longer version of no more than 25 words.",
        type: "dual",
        shortPlaceholder: "≤6 words — e.g. AI authority for PR",
        longPlaceholder: "≤25 words — the longer version that adds proof and context",
      },
      {
        id: "4.3",
        label: "Additional Messages",
        hint: "For each additional message provide a short summary (no more than six words). And a longer version of no more than 25 words.",
        type: "dual-list",
        shortPlaceholder: "≤6 words",
        longPlaceholder: "≤25 words",
      },
      { id: "h-ev", label: "Evidence", type: "heading" },
      {
        id: "4.4",
        label: "Online evidence",
        hint: "Cut and paste links to online evidence. Statistics, case studies, awards, certifications, third-party validation.",
        type: "textarea",
      },
      {
        id: "4.5",
        label: "What to avoid",
        hint: "Messages, terminology, clients, industry issues, links to media articles, research, data or other information you do not wish to be associated with or wish to avoid.",
        type: "textarea",
      },
      { id: "h-sp", label: "Semantic Phrase Guide & Topics", type: "heading" },
      {
        id: "4.6",
        label: "Preferred terms, phrases and category descriptors",
        hint: "Enter a list of short phrases or sentences. Include category labels, technology descriptors, industry terms.",
        type: "textarea",
      },
      {
        id: "4.7",
        label: "Topics and themes for spokespeople and contributed content",
        hint: "Note, this should mirror your messaging. These become your GEO content pillars.",
        type: "textarea",
      },
      {
        id: "4.8",
        label: "Spokespeople (used by Optimiser, Creator and Media Research)",
        hint: "Add each media spokesperson with name, title, area of expertise, and LinkedIn URL.",
        type: "textarea",
      },
      {
        id: "4.9",
        label: "Trade media categories",
        hint: "Multi-select from the alphabetical Trade Media Categories list. These feed the Optimiser, Planner and Media Research dropdowns.",
        type: "textarea",
      },
    ],
  },
  {
    id: "faq",
    track: "pr",
    number: 2,
    title: "FAQ Page: Facts, Policies & Common Questions",
    subtitle: "AEO-ready answers to what your audience actually asks",
    icon: HelpCircle,
    intro:
      "FAQ pages with FAQ Schema markup are one of the most reliable AEO tactics. Google's AI Overviews and voice search assistants regularly pull directly from FAQ content.",
    fields: [
      {
        id: "6.1",
        label: "Top 10–15 questions customers ask before buying or signing up",
        hint: "Write each question exactly as a customer would ask it, and provide the ideal answer in 2–4 sentences.",
        type: "textarea",
      },
      {
        id: "6.2",
        label: "Questions customers ask after they become clients",
        hint: "Support, operations, technical. These often reveal unmet informational needs.",
        type: "textarea",
      },
      {
        id: "6.3",
        label: "Misconceptions or objections prospects commonly have",
        hint: "Misconception-busting content scores highly in AI answers.",
        type: "textarea",
      },
      {
        id: "6.4",
        label: "Industry or category questions your business is uniquely qualified to answer",
        hint: "These are GEO gold: becoming the go-to source for category questions builds AI-model authority over time.",
        type: "textarea",
      },
    ],
  },
  // Website Set-Up sections (Business Profile) — renumbered 1–6 per Patrick.
  {
    id: "fundamentals",
    track: "web",
    number: 1,
    title: "Business & Brand Fundamentals",
    subtitle: "Core identity: who you are and what you do",
    icon: Building2,
    intro:
      "These answers underpin every piece of optimised content. Be as precise as possible: vague inputs produce vague outputs.",
    fields: [
      { id: "1.1", label: "Full legal name of the business or brand", type: "text" },
      { id: "1.2", label: "Trading names, product names or sub-brands", type: "textarea" },
      {
        id: "1.3",
        label: "In one sentence, what does the business do and for whom?",
        hint: "Think: \"We help [audience] do [outcome] by [method].\" This becomes your AI-readable boilerplate.",
        type: "textarea",
      },
      {
        id: "1.4",
        label: "Sector or industry",
        hint: "Include sub-sectors if relevant. This shapes schema markup and entity classification.",
        type: "text",
      },
      {
        id: "1.5",
        label: "Geographies of operation",
        hint: "List all countries, regions or cities. Local entity signals are critical for GEO.",
        type: "textarea",
      },
      {
        id: "1.6",
        label: "Years of operation and key trust signals",
        hint: "e.g. founding year, accreditations, awards, notable clients, media coverage, certifications",
        type: "textarea",
      },
      {
        id: "1.7",
        label: "Primary competitors",
        hint: "Helps calibrate entity differentiation in AI model training contexts.",
        type: "textarea",
      },
    ],
  },
  {
    id: "priority",
    track: "web",
    number: 2,
    title: "GEO vs AEO Priority Assessment",
    subtitle: "Determine which optimisation approach should lead",
    icon: Target,
    intro:
      "GEO (Generative Engine Optimisation) focuses on being cited by AI systems like ChatGPT, Claude and Gemini. AEO (Answer Engine Optimisation) focuses on appearing in direct-answer features.",
    fields: [
      { id: "h-biz", label: "Business Model Signals", type: "heading" },
      {
        id: "2.1",
        label: "Primary sales or conversion path",
        type: "checkbox",
        options: [
          "People find us via search, read our website, and contact us or buy directly",
          "People discover us through press, podcasts, social or word of mouth, then research us",
          "We rely heavily on being recommended by AI tools or voice assistants",
          "We are a local / regional business where map and local search is critical",
          "A mix (describe below)",
        ],
      },
      { id: "2.1b", label: "If a mix, describe:", type: "textarea" },
      {
        id: "2.2",
        label: "How best customers typically find you for the first time",
        hint: "Rank the top 3 channels if you know them.",
        type: "textarea",
      },
      {
        id: "2.3",
        label: "Decision speed",
        type: "checkbox",
        options: [
          "Quick / transactional (minutes to hours)",
          "Considered (days to weeks, research-heavy)",
          "Complex / enterprise (months, multiple stakeholders)",
        ],
      },
      { id: "h-vis", label: "Content & Visibility Signals", type: "heading" },
      {
        id: "2.4",
        label: "Do you produce thought leadership, guides, reports or commentary that others cite?",
        type: "checkbox",
        options: [
          "Yes, regularly and it performs well",
          "Yes, but inconsistently",
          "No: this is new territory for us",
        ],
      },
      {
        id: "2.5",
        label: "Has your brand been mentioned in AI-generated answers?",
        hint: "If yes: what context? Which tools? What is said?",
        type: "textarea",
      },
      {
        id: "2.6",
        label: "Top customer questions before buying (up to 10)",
        hint: "These become the backbone of your AEO FAQ and answer-first content strategy.",
        type: "textarea",
      },
      {
        id: "2.7",
        label: "Industry questions or topics where you have unique expertise or data",
        type: "textarea",
      },
    ],
  },
  {
    id: "audience",
    track: "web",
    number: 3,
    title: "Audience & Intent Mapping",
    subtitle: "Who you're talking to and what they need to hear",
    icon: Users,
    intro:
      "AI engines retrieve content that best matches user intent, not just keywords. Defining your audiences and the language they use is essential for both GEO and AEO.",
    fields: [
      {
        id: "3.1",
        label: "Primary audience(s)",
        hint: "Include job title, seniority, sector or life stage. List multiple audiences separately.",
        type: "textarea",
      },
      {
        id: "3.2",
        label: "Language each audience uses when searching",
        hint: "Include informal, colloquial and category-level terms, not just preferred terminology.",
        type: "textarea",
      },
      {
        id: "3.3",
        label: "Pain points, frustrations or unmet needs",
        type: "textarea",
      },
      {
        id: "3.4",
        label: "Outcomes the audience most wants to achieve",
        type: "textarea",
      },
    ],
  },
  {
    id: "schema",
    track: "web",
    number: 4,
    title: "Schema Markup & Technical Signals",
    subtitle: "Organization schema, robots.txt, AI crawlers and structured data",
    icon: ShieldCheck,
    intro:
      "Schema markup translates your content into machine-readable data that AI systems process directly. Without it, AI models infer — which means inconsistency, omission and sometimes error.",
    fields: [
      { id: "h-os", label: "Organization Schema", type: "heading" },
      {
        id: "7.1",
        label: "Registered business name, company number and registered address",
        hint: "Required for Organization schema. Must match Companies House or equivalent registry.",
        type: "textarea",
      },
      { id: "7.2", label: "Website URL, primary phone and email", type: "textarea" },
      {
        id: "7.3",
        label: "Social media profile URLs (all active channels)",
        type: "textarea",
      },
      {
        id: "7.4",
        label: "Wikidata, Wikipedia or Crunchbase profile?",
        type: "checkbox",
        options: ["Yes (provide URLs below)", "No", "Not sure"],
      },
      { id: "7.4b", label: "If yes, provide URLs:", type: "textarea" },
      { id: "h-ac", label: "AI Crawler Access", type: "heading" },
      {
        id: "7.5",
        label: "AI crawler access via robots.txt",
        hint: "Key AI crawlers: GPTBot, ClaudeBot, Google-Extended, PerplexityBot, CCBot.",
        type: "checkbox",
        options: [
          "Yes, all are allowed",
          "Yes, some are blocked (specify below)",
          "No, we have not checked",
          "We want to selectively control access",
        ],
      },
      { id: "7.5b", label: "If some are blocked, specify:", type: "textarea" },
      {
        id: "7.6",
        label: "Areas of the website you would not want AI crawlers to access",
        hint: "e.g. client portals, pricing pages, staging environments.",
        type: "textarea",
      },
      { id: "h-pt", label: "Page Tag Audit", type: "heading" },
      {
        id: "7.7",
        label: "Most important website pages and their current H1 tags",
        hint: "H1–H3 tags are primary signals for AI content parsing.",
        type: "textarea",
      },
    ],
  },
  {
    id: "website",
    track: "web",
    number: 5,
    title: "Website Content Architecture",
    subtitle: "Answer-first copy, key takeaways and FAQ structure",
    icon: Globe,
    intro:
      "AEO-optimised web pages lead with the answer, not the build-up. AI systems scan pages for direct, structured responses: pages that bury the answer in paragraph four are invisible to AI Overviews and voice search.",
    fields: [
      { id: "h-wd", label: "Core Website Description", type: "heading" },
      {
        id: "5.1",
        label: "Homepage descriptor or proposed positioning copy",
        hint: "Enter your current homepage descriptor or your proposed positioning copy – no more than 50 words.",
        type: "textarea",
      },
      {
        id: "5.2",
        label: "Each core product or service",
        hint: "For each: name, one-sentence description, primary audience.",
        type: "textarea",
      },
      { id: "h-ws", label: "Semantic Phrase Guide: Website", type: "heading" },
      {
        id: "5.3",
        label: "Search phrases and questions for each product or service area",
        hint: "Think in questions as well as keywords.",
        type: "textarea",
      },
      { id: "h-af", label: "Answer-First Page Copy", type: "heading" },
      {
        id: "5.4",
        label: "Single question each key page must answer",
        type: "textarea",
      },
      { id: "h-kt", label: "Key Takeaways", type: "heading" },
      {
        id: "5.6",
        label: "5–8 most important facts every visitor should leave knowing",
        hint: "These become structured key takeaways, summary boxes and schema-ready content.",
        type: "textarea",
      },
    ],
  },
  {
    id: "consistency",
    track: "web",
    number: 6,
    title: "Consistency Check",
    subtitle: "Cross-source consistency check across all existing content & citations",
    icon: Eye,
    intro:
      "AI models build their understanding of your brand from multiple sources: your website, press coverage, directory listings, social profiles and third-party reviews. Inconsistency confuses AI entity recognition and dilutes your authority.",
    fields: [
      {
        id: "8.1",
        label: "Is your business name, address and phone (NAP) consistent across all channels?",
        type: "checkbox",
        options: [
          "Yes, fully consistent",
          "Mostly: some older listings may be outdated",
          "No, there are known inconsistencies",
          "We do not know",
        ],
      },
      {
        id: "8.2",
        label: "Has the business changed name, address, products or core description in the last 3 years?",
        hint: "If yes, list what changed and when.",
        type: "textarea",
      },
      {
        id: "8.3",
        label: "URLs for most important third-party profiles and citations",
        hint: "e.g. Google Business Profile, Trustpilot, industry directories, Crunchbase, LinkedIn company page.",
        type: "textarea",
      },
      {
        id: "8.4",
        label: "Outdated press releases, articles or web pages that describe your business inaccurately",
        type: "textarea",
      },
      {
        id: "8.5",
        label: "Anything else we should know about your brand, content or competitive landscape?",
        type: "textarea",
      },
    ],
  },
];

type IntakeStatus = "Draft" | "Optimised" | "Accepted";

export default function IntakePage() {
  const [track, setTrack] = useState<Track>("pr");
  const visibleSections = useMemo(() => sections.filter((s) => s.track === track), [track]);
  const [activeSection, setActiveSection] = useState(0);
  const [formData, setFormData] = useState<Record<string, string | string[]>>(() => {
    try { const raw = localStorage.getItem(INTAKE_KEY); if (raw) return JSON.parse(raw).formData || {}; } catch { /* noop */ }
    return {};
  });
  const [duals, setDuals] = useState<Record<string, DualValue>>(() => {
    try { const raw = localStorage.getItem(INTAKE_KEY); if (raw) return JSON.parse(raw).duals || {}; } catch { /* noop */ }
    return {};
  });
  const [dualLists, setDualLists] = useState<Record<string, DualListValue>>(() => {
    try { const raw = localStorage.getItem(INTAKE_KEY); if (raw) return JSON.parse(raw).dualLists || {}; } catch { /* noop */ }
    return {};
  });
  const [spokespeople, setSpokespeople] = useState<Spokesperson[]>(() => {
    try {
      const raw = localStorage.getItem(INTAKE_KEY);
      if (raw) {
        const arr = JSON.parse(raw).spokespeople || [];
        // Backwards-compatible: ensure linkedin field exists
        return arr.map((s: Partial<Spokesperson>) => ({
          name: s.name || "",
          title: s.title || "",
          expertise: s.expertise || "",
          linkedin: s.linkedin || "",
        }));
      }
    } catch { /* noop */ }
    return [];
  });
  const [mediaCategories, setMediaCategories] = useState<string[]>(() => {
    try { const raw = localStorage.getItem(INTAKE_KEY); if (raw) return JSON.parse(raw).mediaCategories || []; } catch { /* noop */ }
    return [];
  });
  const [intakeStatus, setIntakeStatus] = useState<IntakeStatus>(() => {
    try { const raw = localStorage.getItem(INTAKE_KEY); if (raw) return (JSON.parse(raw).intakeStatus as IntakeStatus) || "Draft"; } catch { /* noop */ }
    return "Draft";
  });
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [showOptimiseModal, setShowOptimiseModal] = useState(false);
  const [acceptedAt, setAcceptedAt] = useState<string | null>(() => {
    try { const raw = localStorage.getItem(INTAKE_KEY); if (raw) return JSON.parse(raw).acceptedAt || null; } catch { /* noop */ }
    return null;
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        INTAKE_KEY,
        JSON.stringify({ formData, duals, dualLists, spokespeople, mediaCategories, intakeStatus, acceptedAt }),
      );
    } catch { /* noop */ }
  }, [formData, duals, dualLists, spokespeople, mediaCategories, intakeStatus, acceptedAt]);

  useEffect(() => { setActiveSection(0); }, [track]);

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
  const addDualListItem = (fieldId: string) => {
    setDualLists((prev) => ({ ...prev, [fieldId]: [...(prev[fieldId] || []), { short: "", long: "" }] }));
  };
  const removeDualListItem = (fieldId: string, idx: number) => {
    setDualLists((prev) => ({ ...prev, [fieldId]: (prev[fieldId] || []).filter((_, i) => i !== idx) }));
  };

  const markComplete = (idx: number) => setCompleted((prev) => new Set(prev).add(idx));

  const sectionHasData = (idx: number): boolean => {
    return visibleSections[idx].fields.some((f) => {
      if (f.type === "heading") return false;
      if (f.id === "4.8") return spokespeople.length > 0;
      if (f.id === "4.9") return mediaCategories.length > 0;
      if (f.type === "dual") {
        const v = duals[f.id]; return !!(v && (v.short || v.long));
      }
      if (f.type === "dual-list") {
        const v = dualLists[f.id]; return !!(v && v.length && v.some((it) => it.short || it.long));
      }
      const val = formData[f.id];
      return Array.isArray(val) ? val.length > 0 : !!(val && val.trim().length > 0);
    });
  };

  const totalFields = visibleSections.reduce(
    (s, sec) => s + sec.fields.filter((f) => f.type !== "heading").length,
    0,
  );
  const filledFields = visibleSections.reduce((sum, sec) => {
    return sum + sec.fields.filter((f) => f.type !== "heading").reduce((s, f) => {
      if (f.id === "4.8") return s + (spokespeople.length > 0 ? 1 : 0);
      if (f.id === "4.9") return s + (mediaCategories.length > 0 ? 1 : 0);
      if (f.type === "dual") {
        const v = duals[f.id]; return s + (v && (v.short || v.long) ? 1 : 0);
      }
      if (f.type === "dual-list") {
        const v = dualLists[f.id]; return s + (v && v.length && v.some((it) => it.short || it.long) ? 1 : 0);
      }
      const val = formData[f.id];
      return s + ((Array.isArray(val) ? val.length > 0 : !!(val && val.trim().length > 0)) ? 1 : 0);
    }, 0);
  }, 0);
  const progressPct = totalFields ? Math.round((filledFields / totalFields) * 100) : 0;

  const filteredCategories = TRADE_MEDIA_CATEGORIES.filter((c) =>
    !categorySearch || c.toLowerCase().includes(categorySearch.toLowerCase()),
  );

  const section = visibleSections[activeSection] || visibleSections[0];

  const statusBadge = (() => {
    if (intakeStatus === "Accepted") return { bg: "rgba(61,155,107,0.12)", color: vars.green, label: "Accepted" };
    if (intakeStatus === "Optimised") return { bg: "rgba(40,150,185,0.12)", color: vars.teal, label: "Optimised" };
    return { bg: "rgba(212,146,42,0.14)", color: vars.amber, label: "Draft" };
  })();

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-2">
          <h1 className="text-3xl sm:text-4xl tracking-tight" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
            Project Set-Up
          </h1>
          <span
            className="text-[11px] font-bold uppercase tracking-[0.16em] px-3 py-1.5 rounded-full"
            style={{ background: statusBadge.bg, color: statusBadge.color }}
          >
            {statusBadge.label} — Project Data
          </span>
        </div>
        <p className="text-[13px] sm:text-[14px] font-light mb-5" style={{ color: vars.g500 }}>
          Capture the business information, messaging and content that will inform your PR, content marketing and AI Authority strategy for this project. This information will become your core Project Data that will help optimise future PR and marketing output as well as your owned website. Please complete both the PR set-up and Website set-up sections to create your Project Data.
        </p>

        {/* Top action buttons — Variant C ink/paper/raspberry */}
        <div className="rounded-2xl p-4 sm:p-5 mb-6" style={{ background: "#102B36", boxShadow: "0 8px 24px -12px rgba(16,43,54,0.25)" }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#C8497A" }} />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "rgba(251,246,236,0.7)" }}>Project Data Actions</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setIntakeStatus("Draft"); setAcceptedAt(null); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full text-[12px] font-bold uppercase tracking-[0.12em] transition-all"
              style={{ background: "#FBF6EC", color: "#102B36" }}
              title="Reset and draft a fresh Project Data report"
            >
              <Plus size={14} /> Create Project Data
            </button>
            <button
              onClick={() => { setShowOptimiseModal(true); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full text-[12px] font-bold uppercase tracking-[0.12em] text-white transition-all"
              style={{ background: "#C8497A" }}
              title="Send Parts 4.1–4.5 to the LLM optimiser"
            >
              <Sparkles size={14} /> Optimise Project Data
            </button>
            <button
              onClick={() => {
                setIntakeStatus("Accepted");
                setAcceptedAt(new Date().toISOString());
                alert("Project Data accepted. The signed-off brief is now available to every other module.");
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full text-[12px] font-bold uppercase tracking-[0.12em] text-white transition-all"
              style={{ background: vars.green }}
            >
              <FileCheck2 size={14} /> Accept Project Data
            </button>
            <button
              onClick={() => { setIntakeStatus("Draft"); setAcceptedAt(null); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full text-[12px] font-bold uppercase tracking-[0.12em] text-white transition-all"
              style={{ background: "#C94A3E" }}
              title="Re-open the Project Data for editing"
            >
              <Pencil size={14} /> Edit Project Data
            </button>
          </div>
        </div>

        {/* Track switch + progress — Variant C panel */}
        <div className="rounded-2xl border-2 p-4 sm:p-5 mb-2" style={{ background: "white", borderColor: "#102B36" }}>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex flex-col sm:flex-row gap-2">
              {([
                { key: "pr" as Track, primary: "PR Set-Up", subtitle: "Business Messaging" },
                { key: "web" as Track, primary: "Website Set-Up", subtitle: "Business Profile" },
              ]).map((t) => {
                const isActive = track === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTrack(t.key)}
                    className="px-5 py-3 rounded-xl text-left transition-all border-2"
                    style={{
                      background: isActive ? "#102B36" : "#FBF6EC",
                      borderColor: isActive ? "#102B36" : "rgba(16,43,54,0.15)",
                      color: isActive ? "#FBF6EC" : "#102B36",
                    }}
                  >
                    <div className="text-[14px] font-bold" style={{ fontFamily: "'Alice', Georgia, serif" }}>{t.primary}</div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.14em] mt-0.5 opacity-80">{t.subtitle}</div>
                  </button>
                );
              })}
            </div>
            <div className="flex-1 lg:max-w-md lg:ml-6">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "#102B36" }}>Set-Up Progress</span>
                <span className="text-[14px] font-bold" style={{ color: "#C8497A", fontFamily: "'Alice', Georgia, serif" }}>{progressPct}%</span>
              </div>
              <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: "rgba(16,43,54,0.08)" }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progressPct}%`, background: "linear-gradient(90deg, #C8497A 0%, #E07856 100%)" }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        {/* Sidebar */}
        <div className="w-full lg:w-72 lg:flex-shrink-0">
          <div className="rounded-2xl border-2 overflow-hidden" style={{ background: "white", borderColor: "rgba(16,43,54,0.12)" }}>
            <div className="px-4 py-3 border-b-2" style={{ background: "#102B36", borderColor: "#102B36" }}>
              <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "#FBF6EC" }}>Sections</span>
            </div>
            {visibleSections.map((sec, idx) => {
              const isActive = idx === activeSection;
              const isDone = completed.has(idx);
              const hasData = sectionHasData(idx);
              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveSection(idx)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors border-b last:border-b-0"
                  style={{
                    borderColor: vars.g100,
                    background: isActive ? "#FBE3ED" : "transparent",
                    borderLeft: `3px solid ${isActive ? "#C8497A" : "transparent"}`,
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                    style={{
                      background: isDone ? vars.green : isActive ? "#C8497A" : vars.g200,
                      color: isDone || isActive ? "white" : vars.g500,
                    }}
                  >
                    {isDone ? <Check size={14} /> : sec.number}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold truncate" style={{ color: isActive ? "#102B36" : vars.g600 }}>{sec.title}</p>
                  </div>
                  {!isDone && hasData && (
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: vars.amber }} title="In progress" />
                  )}
                </button>
              );
            })}
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
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] mb-0.5" style={{ color: "#C8497A" }}>
                    Section {section.number}
                  </div>
                  <h2 className="text-xl font-semibold leading-tight" style={{ color: "#FBF6EC", fontFamily: "'Alice', Georgia, serif" }}>
                    {section.title}
                  </h2>
                  <p className="text-xs font-light mt-0.5" style={{ color: "rgba(251,246,236,0.7)" }}>{section.subtitle}</p>
                </div>
              </div>
            </div>

            <div className="px-8 py-6" style={{ background: "#FBF6EC" }}>
              <div className="rounded-xl p-4 mb-8" style={{ background: "white", border: "1px solid rgba(200,73,122,0.2)", borderLeft: "3px solid #C8497A" }}>
                <p className="text-[13px] font-light leading-relaxed" style={{ color: "#102B36" }}>{section.intro}</p>
              </div>

              <div className="space-y-6">
                {section.fields.map((field) => {
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

                  if (field.id === "4.8") {
                    return (
                      <div key={field.id}>
                        <FieldLabel id={displayId} label={field.label} hint={field.hint} />
                        <div className="space-y-3 mb-2">
                          {spokespeople.map((sp, i) => (
                            <div key={i} className="rounded-xl border p-3" style={{ borderColor: "rgba(16,43,54,0.15)", background: "white", borderLeft: "3px solid #C8497A" }}>
                              <div className="grid grid-cols-12 gap-2 mb-2">
                                <input value={sp.name} onChange={(e) => setSpokespeople(spokespeople.map((s, j) => j === i ? { ...s, name: e.target.value } : s))} placeholder="Name" className="col-span-3 px-3 py-2 rounded-lg border text-[13px] bg-white" style={{ borderColor: vars.g200 }} />
                                <input value={sp.title} onChange={(e) => setSpokespeople(spokespeople.map((s, j) => j === i ? { ...s, title: e.target.value } : s))} placeholder="Title" className="col-span-4 px-3 py-2 rounded-lg border text-[13px] bg-white" style={{ borderColor: vars.g200 }} />
                                <input value={sp.expertise} onChange={(e) => setSpokespeople(spokespeople.map((s, j) => j === i ? { ...s, expertise: e.target.value } : s))} placeholder="Expertise" className="col-span-4 px-3 py-2 rounded-lg border text-[13px] bg-white" style={{ borderColor: vars.g200 }} />
                                <button onClick={() => setSpokespeople(spokespeople.filter((_, j) => j !== i))} className="col-span-1 text-[11px] font-medium" style={{ color: vars.g400 }} title="Remove spokesperson"><X size={14} className="mx-auto" /></button>
                              </div>
                              <div className="flex items-center gap-2">
                                <Linkedin size={14} style={{ color: "#0A66C2", flexShrink: 0 }} />
                                <input
                                  value={sp.linkedin}
                                  onChange={(e) => setSpokespeople(spokespeople.map((s, j) => j === i ? { ...s, linkedin: e.target.value } : s))}
                                  placeholder="LinkedIn URL — e.g. https://www.linkedin.com/in/yourname"
                                  className="flex-1 px-3 py-2 rounded-lg border text-[12px] font-light bg-white"
                                  style={{ borderColor: vars.g200 }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => setSpokespeople([...spokespeople, { name: "", title: "", expertise: "", linkedin: "" }])}
                          className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border"
                          style={{ borderColor: vars.g200, color: vars.accent }}
                        >
                          + Add spokesperson
                        </button>
                      </div>
                    );
                  }

                  if (field.id === "4.9") {
                    return (
                      <div key={field.id}>
                        <FieldLabel id={displayId} label={field.label} hint={field.hint} />
                        <div className="rounded-xl border p-3 mb-2" style={{ borderColor: vars.g200, background: "white" }}>
                          {mediaCategories.length === 0 ? (
                            <p className="text-[12px] font-light italic" style={{ color: vars.g400 }}>
                              No categories selected yet. Click the button below to choose from the alphabetical list of {TRADE_MEDIA_CATEGORIES.length} trade media categories.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {mediaCategories.map((cat) => (
                                <span key={cat} className="text-[11px] font-medium px-2.5 py-1 rounded-full inline-flex items-center gap-1.5" style={{ background: "rgba(31,116,143,0.08)", color: vars.accent }}>
                                  {cat}
                                  <button onClick={() => setMediaCategories(mediaCategories.filter((c) => c !== cat))} className="hover:text-red-500" title="Remove">
                                    <X size={11} />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => setShowCategoryPicker(true)}
                            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border"
                            style={{ borderColor: vars.g200, color: vars.accent }}
                          >
                            + Choose from {TRADE_MEDIA_CATEGORIES.length} trade categories
                          </button>
                          {mediaCategories.length > 0 && (
                            <span className="text-[11px] font-medium" style={{ color: vars.g500 }}>
                              {mediaCategories.length} selected
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }

                  if (field.type === "dual") {
                    const v = duals[field.id] || { short: "", long: "" };
                    return (
                      <div key={field.id}>
                        <FieldLabel id={displayId} label={field.label} hint={field.hint} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1.5" style={{ color: "#C8497A" }}>(a) ≤6-word summary</p>
                            <input
                              value={v.short}
                              onChange={(e) => setDual(field.id, "short", e.target.value)}
                              placeholder={field.shortPlaceholder}
                              className="w-full px-4 py-3 rounded-xl border-2 text-[14px] font-light outline-none focus:border-[#C8497A] transition-colors"
                              style={{ borderColor: "rgba(16,43,54,0.15)", background: "white", color: "#102B36" }}
                            />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1.5" style={{ color: "#C8497A" }}>(b) ≤25-word longer version</p>
                            <textarea
                              value={v.long}
                              onChange={(e) => setDual(field.id, "long", e.target.value)}
                              placeholder={field.longPlaceholder}
                              rows={2}
                              className="w-full px-4 py-3 rounded-xl border-2 text-[14px] font-light outline-none focus:border-[#C8497A] transition-colors"
                              style={{ borderColor: "rgba(16,43,54,0.15)", background: "white", color: "#102B36" }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (field.type === "dual-list") {
                    const list = dualLists[field.id] || [];
                    return (
                      <div key={field.id}>
                        <FieldLabel id={displayId} label={field.label} hint={field.hint} />
                        <div className="space-y-3 mb-2">
                          {list.length === 0 && (
                            <p className="text-[12px] font-light italic" style={{ color: vars.g400 }}>No additional messages yet.</p>
                          )}
                          {list.map((item, i) => (
                            <div key={i} className="rounded-xl border p-3" style={{ borderColor: "rgba(16,43,54,0.15)", background: "white", borderLeft: "3px solid #C8497A" }}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "#C8497A" }}>Message {i + 1}</span>
                                <button onClick={() => removeDualListItem(field.id, i)} title="Remove" className="text-[11px]" style={{ color: vars.g400 }}><X size={14} /></button>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <input
                                  value={item.short}
                                  onChange={(e) => updateDualListItem(field.id, i, "short", e.target.value)}
                                  placeholder={field.shortPlaceholder || "≤6 words"}
                                  className="w-full px-3 py-2 rounded-lg border text-[13px] bg-white"
                                  style={{ borderColor: vars.g200 }}
                                />
                                <textarea
                                  value={item.long}
                                  onChange={(e) => updateDualListItem(field.id, i, "long", e.target.value)}
                                  placeholder={field.longPlaceholder || "≤25 words"}
                                  rows={2}
                                  className="w-full px-3 py-2 rounded-lg border text-[13px] bg-white"
                                  style={{ borderColor: vars.g200 }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                        <button onClick={() => addDualListItem(field.id)} className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border" style={{ borderColor: vars.g200, color: vars.accent }}>+ Add message</button>
                      </div>
                    );
                  }

                  if (field.type === "checkbox" && field.options) {
                    const selected = (formData[field.id] as string[]) || [];
                    return (
                      <div key={field.id}>
                        <FieldLabel id={displayId} label={field.label} hint={field.hint} />
                        <div className="space-y-2 rounded-xl border-2 p-4" style={{ borderColor: "rgba(16,43,54,0.15)", background: "white" }}>
                          {field.options.map((opt) => {
                            const isOn = selected.includes(opt);
                            return (
                              <label key={opt} className="flex items-start gap-3 cursor-pointer group p-2 rounded-lg transition-colors hover:bg-[#FBF6EC]">
                                <div
                                  className="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors"
                                  style={{
                                    borderColor: isOn ? "#C8497A" : "rgba(16,43,54,0.25)",
                                    background: isOn ? "#C8497A" : "transparent",
                                  }}
                                  onClick={() => toggleCheckbox(field.id, opt)}
                                >
                                  {isOn && <Check size={12} color="white" />}
                                </div>
                                <span className="text-[13px] leading-relaxed" style={{ color: isOn ? "#102B36" : "#374151", fontWeight: isOn ? 600 : 400 }} onClick={() => toggleCheckbox(field.id, opt)}>
                                  {opt}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={field.id}>
                      <FieldLabel id={displayId} label={field.label} hint={field.hint} />
                      {field.type === "textarea" ? (
                        <textarea
                          value={(formData[field.id] as string) || ""}
                          onChange={(e) => updateField(field.id, e.target.value)}
                          rows={4}
                          className="w-full px-4 py-3 rounded-xl border-2 text-[14px] font-light outline-none transition-colors focus:border-[#C8497A] resize-y"
                          style={{ borderColor: "rgba(16,43,54,0.15)", background: "white", color: "#102B36" }}
                          placeholder="Type your answer here..."
                        />
                      ) : (
                        <input
                          type="text"
                          value={(formData[field.id] as string) || ""}
                          onChange={(e) => updateField(field.id, e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border-2 text-[14px] font-light outline-none transition-colors focus:border-[#C8497A]"
                          style={{ borderColor: "rgba(16,43,54,0.15)", background: "white", color: "#102B36" }}
                          placeholder="Type your answer here..."
                        />
                      )}
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
              <div className="flex items-center gap-3 justify-end">
                <button
                  onClick={() => {
                    if (completed.has(activeSection)) {
                      setCompleted((prev) => { const next = new Set(prev); next.delete(activeSection); return next; });
                    } else {
                      markComplete(activeSection);
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
      {showCategoryPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setShowCategoryPicker(false)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: vars.g200 }}>
              <h2 className="text-[16px] font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Trade media categories (alpha)</h2>
              <button onClick={() => setShowCategoryPicker(false)} className="text-[20px] leading-none px-2" style={{ color: vars.g400 }}>&times;</button>
            </div>
            <div className="px-6 py-3 border-b" style={{ borderColor: vars.g100 }}>
              <input
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                placeholder="Filter categories..."
                className="w-full px-3 py-2 rounded-lg border text-[13px]"
                style={{ borderColor: vars.g200 }}
              />
              <p className="text-[11px] font-medium mt-2" style={{ color: vars.g500 }}>
                {mediaCategories.length} of {TRADE_MEDIA_CATEGORIES.length} selected
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {filteredCategories.map((cat) => {
                  const on = mediaCategories.includes(cat);
                  return (
                    <button
                      key={cat}
                      onClick={() => setMediaCategories(on ? mediaCategories.filter((c) => c !== cat) : [...mediaCategories, cat])}
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
              <button onClick={() => setMediaCategories([])} className="text-[12px] font-semibold px-3 py-2 rounded-lg" style={{ color: vars.g500 }}>Clear all</button>
              <button onClick={() => setShowCategoryPicker(false)} className="text-[13px] font-semibold px-4 py-2 rounded-lg text-white" style={{ background: vars.accent }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Optimise modal */}
      {showOptimiseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setShowOptimiseModal(false)}>
          <div className="bg-white rounded-2xl max-w-xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: vars.g200 }}>
              <h2 className="text-[16px] font-semibold flex items-center gap-2" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
                <Sparkles size={16} color={vars.teal} /> Optimise Project Data
              </h2>
              <button onClick={() => setShowOptimiseModal(false)} className="text-[20px] leading-none px-2" style={{ color: vars.g400 }}>&times;</button>
            </div>
            <div className="p-6">
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] mb-2" style={{ color: vars.g500 }}>LLM brief</p>
              <div className="rounded-xl p-4 mb-4 text-[13px] leading-relaxed font-light" style={{ background: "rgba(40,150,185,0.05)", border: `1px solid rgba(40,150,185,0.15)`, color: vars.g600 }}>
                Using all the information about this company contained in this report, optimise the content in Parts 4.1 – 4.5 for authority in earned media and align recommendations for 4.1–4.5 with website content included in 5.1 – 5.6 to achieve maximum visibility with LLM agents.
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowOptimiseModal(false)} className="text-[13px] font-semibold px-4 py-2 rounded-lg border" style={{ borderColor: vars.g200, color: vars.g500 }}>Cancel</button>
                <button
                  onClick={() => {
                    setIntakeStatus("Optimised");
                    setShowOptimiseModal(false);
                    alert("Project Data optimised. Review the suggested edits, then click 'Accept Project Data' to sign off.");
                  }}
                  className="text-[13px] font-semibold px-4 py-2 rounded-lg text-white"
                  style={{ background: vars.teal }}
                >
                  Run optimisation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {acceptedAt && intakeStatus === "Accepted" && (
        <div className="mt-6 rounded-xl border p-4 flex items-start gap-3" style={{ background: "rgba(61,155,107,0.06)", borderColor: "rgba(61,155,107,0.25)" }}>
          <CheckCircle2 size={18} color={vars.green} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-[13px] font-semibold" style={{ color: vars.navy }}>Project Data signed off on {new Date(acceptedAt).toLocaleDateString()}.</p>
            <p className="text-[12px] font-light mt-0.5" style={{ color: vars.g500 }}>Stored in Archive as the authority brief used by Optimiser, Creator, Media Research and Marketing Intelligence.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldLabel({ id, label, hint }: { id: string; label: string; hint?: string }) {
  return (
    <div className="mb-2.5">
      <label className="flex items-baseline gap-2.5 text-[15px] font-bold leading-snug" style={{ color: "#102B36", fontFamily: "'Alice', Georgia, serif" }}>
        {id.match(/^\d/) && (
          <span className="inline-flex items-center justify-center text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-0.5 rounded-md flex-shrink-0" style={{ background: "#FBE3ED", color: "#C8497A", fontFamily: "Inter, sans-serif" }}>{id}</span>
        )}
        <span>{label}</span>
      </label>
      {hint && <p className="text-[12px] font-light leading-relaxed mt-1.5 pl-0.5" style={{ color: "#374151" }}>{hint}</p>}
    </div>
  );
}

// Cross-module helpers — consumed by Optimiser, Creator, Media Research, Comms Planner, Marketing Intelligence.
export type IntakeData = {
  formData: Record<string, string | string[]>;
  duals: Record<string, DualValue>;
  dualLists: Record<string, DualListValue>;
  spokespeople: Spokesperson[];
  mediaCategories: string[];
  intakeStatus: IntakeStatus;
  acceptedAt: string | null;
};

export function loadIntakeData(): IntakeData | null {
  try {
    const raw = localStorage.getItem(INTAKE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      formData: parsed.formData || {},
      duals: parsed.duals || {},
      dualLists: parsed.dualLists || {},
      spokespeople: (parsed.spokespeople || []).map((s: Partial<Spokesperson>) => ({
        name: s.name || "",
        title: s.title || "",
        expertise: s.expertise || "",
        linkedin: s.linkedin || "",
      })),
      mediaCategories: parsed.mediaCategories || [],
      intakeStatus: parsed.intakeStatus || "Draft",
      acceptedAt: parsed.acceptedAt || null,
    };
  } catch { return null; }
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
  const primary = data.duals["4.2"];
  if (primary && (primary.short || primary.long)) {
    out.push({ short: primary.short, long: primary.long, tag: "Primary" });
  }
  const additional = data.dualLists["4.3"] || [];
  additional.forEach((m, i) => {
    if (m.short || m.long) out.push({ short: m.short, long: m.long, tag: `Secondary ${i + 1}` });
  });
  return out.length > 0 ? out : [{ short: "Primary message not yet set", long: "Add your primary message in Project Set-Up section 4.2.", tag: "Primary" }];
}

export function getSpokespeople(): Spokesperson[] {
  const data = loadIntakeData();
  return data?.spokespeople || [];
}

export function getProjectMediaCategories(): string[] {
  const data = loadIntakeData();
  return data?.mediaCategories || [];
}
