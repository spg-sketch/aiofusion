import { useState } from "react";
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
} from "lucide-react";

const vars = {
  navy: "#165265",
  accent: "#1f748f",
  teal: "#2896b9",
  green: "#3D9B6B",
  amber: "#D4922A",
  g50: "#FAFAFA",
  g100: "#F3F3F3",
  g200: "#E5E5E5",
  g300: "#D4D4D4",
  g400: "#9CA3AF",
  g500: "#6B7280",
  g600: "#374151",
};

type SectionDef = {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  icon: typeof Building2;
  intro: string;
  fields: FieldDef[];
};

type FieldDef = {
  id: string;
  label: string;
  hint?: string;
  type: "text" | "textarea" | "checkbox" | "heading";
  options?: string[];
};

const sections: SectionDef[] = [
  {
    id: "fundamentals",
    number: 1,
    title: "Business & Brand Fundamentals",
    subtitle: "Core identity: who you are and what you do",
    icon: Building2,
    intro: "These answers underpin every piece of optimised content. Be as precise as possible: vague inputs produce vague outputs.",
    fields: [
      { id: "1.1", label: "What is the full legal name of the business or brand?", type: "text" },
      { id: "1.2", label: "What trading names, product names, or sub-brands should also be recognised?", type: "textarea" },
      { id: "1.3", label: "In one sentence, what does the business do and for whom?", hint: "Think: \"We help [audience] do [outcome] by [method].\" This becomes your AI-readable boilerplate.", type: "textarea" },
      { id: "1.4", label: "What sector or industry do you operate in?", hint: "Include sub-sectors if relevant. This shapes schema markup and entity classification.", type: "text" },
      { id: "1.5", label: "Where does the business operate? (geography)", hint: "List all countries, regions, or cities. Local entity signals are critical for GEO.", type: "textarea" },
      { id: "1.6", label: "How long has the business been operating, and what are its key trust signals?", hint: "e.g. founding year, accreditations, awards, notable clients, media coverage, certifications", type: "textarea" },
      { id: "1.7", label: "Who are your primary competitors? (optional but valuable)", hint: "Helps calibrate entity differentiation in AI model training contexts.", type: "textarea" },
    ],
  },
  {
    id: "priority",
    number: 2,
    title: "GEO vs AEO Priority Assessment",
    subtitle: "Determine which optimisation approach should lead",
    icon: Target,
    intro: "GEO (Generative Engine Optimisation) focuses on being cited by AI systems like ChatGPT, Claude, and Gemini. AEO (Answer Engine Optimisation) focuses on appearing in direct-answer features: AI Overviews, featured snippets, voice search.",
    fields: [
      { id: "h-biz", label: "Business Model Signals", type: "heading" },
      { id: "2.1", label: "What is your primary sales or conversion path?", type: "checkbox", options: [
        "People find us via search, read our website, and contact us or buy directly",
        "People discover us through press, podcasts, social, or word of mouth, then research us",
        "We rely heavily on being recommended by AI tools (e.g. ChatGPT, Perplexity) or voice assistants",
        "We are a local / regional business where map and local search is critical",
        "A mix (describe below)",
      ] },
      { id: "2.1b", label: "If a mix, describe:", type: "textarea" },
      { id: "2.2", label: "How do your best customers typically find you for the first time?", hint: "Rank the top 3 channels if you know them.", type: "textarea" },
      { id: "2.3", label: "Are your customers making quick transactional decisions or longer considered purchases?", type: "checkbox", options: [
        "Quick / transactional (minutes to hours)",
        "Considered (days to weeks, research-heavy)",
        "Complex / enterprise (months, multiple stakeholders)",
      ] },
      { id: "h-vis", label: "Content & Visibility Signals", type: "heading" },
      { id: "2.4", label: "Do you currently produce thought leadership, guides, reports, or commentary that others cite or link to?", type: "checkbox", options: [
        "Yes, regularly and it performs well",
        "Yes, but inconsistently",
        "No: this is new territory for us",
      ] },
      { id: "2.5", label: "Have you noticed your brand mentioned in AI-generated answers?", hint: "If yes: what context? Which tools? What is said?", type: "textarea" },
      { id: "2.6", label: "What questions do your customers most commonly ask before buying? List up to 10.", hint: "These become the backbone of your AEO FAQ and answer-first content strategy.", type: "textarea" },
      { id: "2.7", label: "Are there industry questions or topics where you have unique expertise or data?", hint: "GEO depends on your being the authoritative source AI models draw from.", type: "textarea" },
    ],
  },
  {
    id: "audience",
    number: 3,
    title: "Audience & Intent Mapping",
    subtitle: "Who you're talking to and what they need to hear",
    icon: Users,
    intro: "AI engines retrieve content that best matches user intent, not just keywords. Defining your audiences and the language they use is essential for both GEO and AEO.",
    fields: [
      { id: "3.1", label: "Describe your primary audience(s). Who are they and what is their role or context?", hint: "Include job title, seniority, sector, or life stage as relevant. List multiple audiences separately.", type: "textarea" },
      { id: "3.2", label: "What language does each audience use when searching for your solutions?", hint: "Include informal, colloquial, and category-level terms, not just your preferred terminology.", type: "textarea" },
      { id: "3.3", label: "What are the most common pain points, frustrations, or unmet needs your audience has before finding you?", type: "textarea" },
      { id: "3.4", label: "What outcome does your audience most want to achieve by using your product or service?", type: "textarea" },
    ],
  },
  {
    id: "earned-media",
    number: 4,
    title: "Earned Media: Message Framework",
    subtitle: "Boilerplate, message hierarchy & semantic phrase guide",
    icon: Mic2,
    intro: "Earned media is one of the highest-authority signals for GEO. AI models are trained on the open web: a well-placed article in a credible outlet is more powerful than any on-site SEO tactic.",
    fields: [
      { id: "h-bp", label: "Core Boilerplate", type: "heading" },
      { id: "4.1", label: "Write (or draft the raw ingredients for) a 50-word company description for press use.", hint: "Needs to include: what you do, who for, where, and what makes you distinctive.", type: "textarea" },
      { id: "4.2", label: "What is the single most important thing you want journalists, editors, or AI systems to associate with your brand?", hint: "This is your primary message: the one truth you would fight to keep in every piece of coverage.", type: "textarea" },
      { id: "h-mh", label: "Message Hierarchy", type: "heading" },
      { id: "4.3", label: "List your secondary messages: the 3-5 supporting proof points that back up your primary message.", hint: "Each should be a factual, concrete claim. Avoid superlatives. AI systems prefer verifiable statements.", type: "textarea" },
      { id: "4.4", label: "What proof, data, or evidence supports these messages?", hint: "Statistics, case studies, awards, certifications, third-party validation.", type: "textarea" },
      { id: "4.5", label: "Are there messages or framings you actively want to avoid or move away from?", type: "textarea" },
      { id: "h-sp", label: "Semantic Phrase Guide: Earned Media", type: "heading" },
      { id: "4.6", label: "What are the preferred terms, phrases, and category descriptors you want associated with your brand in media coverage?", hint: "Include category labels, technology descriptors, industry terms.", type: "textarea" },
      { id: "4.7", label: "What topics or themes should your spokespeople and contributed content regularly address?", hint: "These become your GEO content pillars.", type: "textarea" },
      { id: "4.8", label: "Who are your spokespeople for media? List name, title, and area of expertise.", type: "textarea" },
      { id: "4.9", label: "What media outlets, publications, or platforms most influence your target audience?", hint: "These are your priority earned media targets. Coverage here carries the most GEO weight.", type: "textarea" },
    ],
  },
  {
    id: "website",
    number: 5,
    title: "Website Content Architecture",
    subtitle: "Answer-first copy, key takeaways & FAQ structure",
    icon: Globe,
    intro: "AEO-optimised web pages lead with the answer, not the build-up. AI systems scan pages for direct, structured responses: pages that bury the answer in paragraph four are invisible to AI Overviews and voice search.",
    fields: [
      { id: "h-wd", label: "Core Website Description", type: "heading" },
      { id: "5.1", label: "Write a 25-word homepage descriptor: the clearest possible statement of what you offer and who it's for.", hint: "This anchors your H1 and meta description strategy. Prioritise clarity over creativity.", type: "textarea" },
      { id: "5.2", label: "List each core product or service. For each: name, one-sentence description, and primary audience.", type: "textarea" },
      { id: "h-ws", label: "Semantic Phrase Guide: Website", type: "heading" },
      { id: "5.3", label: "For each product or service area, list the search phrases and questions your audience uses to find solutions like yours.", hint: "Think in questions as well as keywords.", type: "textarea" },
      { id: "h-af", label: "Answer-First Page Copy", type: "heading" },
      { id: "5.4", label: "For your homepage and each key landing page, what is the single question that page must answer?", type: "textarea" },
      { id: "5.5", label: "What is the one fact, outcome, or claim each page must communicate in its first 100 words?", hint: "AEO depends on the answer appearing near the top of the page.", type: "textarea" },
      { id: "h-kt", label: "Key Takeaways", type: "heading" },
      { id: "5.6", label: "List the 5-8 most important facts about your business that every page visitor should leave knowing.", hint: "These become structured key takeaways, summary boxes, and schema-ready content.", type: "textarea" },
    ],
  },
  {
    id: "faq",
    number: 6,
    title: "FAQ Page: Facts, Policies & Common Questions",
    subtitle: "AEO-ready answers to what your audience actually asks",
    icon: HelpCircle,
    intro: "FAQ pages with FAQ Schema markup are one of the most reliable AEO tactics. Google's AI Overviews and voice search assistants regularly pull directly from FAQ content.",
    fields: [
      { id: "6.1", label: "What are the top 10-15 questions customers ask before buying or signing up?", hint: "Write each question exactly as a customer would ask it, and provide the ideal answer in 2-4 sentences.", type: "textarea" },
      { id: "6.2", label: "What questions do customers ask after they become clients?", hint: "Support, operations, technical. These often reveal unmet informational needs.", type: "textarea" },
      { id: "6.3", label: "What misconceptions or objections do prospects commonly have about your product, service, or category?", hint: "Misconception-busting content scores highly in AI answers.", type: "textarea" },
      { id: "6.4", label: "List any industry or category questions your business is uniquely qualified to answer.", hint: "These are GEO gold: becoming the go-to source for category questions builds AI-model authority over time.", type: "textarea" },
    ],
  },
  {
    id: "schema",
    number: 7,
    title: "Schema Markup & Technical Signals",
    subtitle: "Organization schema, robots.txt, AI crawlers & structured data",
    icon: ShieldCheck,
    intro: "Schema markup translates your content into machine-readable data that AI systems process directly. Without it, AI models have to infer, which means inconsistency, omission, and sometimes error.",
    fields: [
      { id: "h-os", label: "Organization Schema", type: "heading" },
      { id: "7.1", label: "Registered business name, company number, and registered address", hint: "Required for Organization schema. Must match Companies House or equivalent registry.", type: "textarea" },
      { id: "7.2", label: "Website URL, primary phone number, and primary email address", type: "textarea" },
      { id: "7.3", label: "Social media profile URLs (all active channels)", hint: "These link your schema entity to verified external profiles.", type: "textarea" },
      { id: "7.4", label: "Do you have a Wikidata entry, Wikipedia page, or Crunchbase profile?", type: "checkbox", options: [
        "Yes (provide URLs below)",
        "No",
        "Not sure",
      ] },
      { id: "7.4b", label: "If yes, provide URLs:", type: "textarea" },
      { id: "h-ac", label: "AI Crawler Access", type: "heading" },
      { id: "7.5", label: "Do you know which AI crawlers currently have access to your website via robots.txt?", hint: "Key AI crawlers: GPTBot (OpenAI), ClaudeBot (Anthropic), Google-Extended, PerplexityBot, CCBot.", type: "checkbox", options: [
        "Yes, all are allowed",
        "Yes, some are blocked (specify below)",
        "No, we have not checked",
        "We want to selectively control access",
      ] },
      { id: "7.5b", label: "If some are blocked, specify:", type: "textarea" },
      { id: "7.6", label: "Are there areas of your website you would not want AI crawlers to access?", hint: "e.g. client portals, pricing pages, staging environments.", type: "textarea" },
      { id: "h-pt", label: "Page Tag Audit", type: "heading" },
      { id: "7.7", label: "List your most important website pages and their current H1 tags (if known).", hint: "H1-H3 tags are primary signals for AI content parsing. We will audit and rewrite these.", type: "textarea" },
    ],
  },
  {
    id: "source-truth",
    number: 8,
    title: "Source Truth Audit",
    subtitle: "Consistency check across all existing content & citations",
    icon: Eye,
    intro: "AI models build their understanding of your brand from multiple sources: your website, press coverage, directory listings, social profiles, and third-party reviews. Inconsistency confuses AI entity recognition and dilutes your authority.",
    fields: [
      { id: "8.1", label: "Is your business name, address, and phone number (NAP) consistent across all online directories, Google Business Profile, and your website?", type: "checkbox", options: [
        "Yes, fully consistent",
        "Mostly: some older listings may be outdated",
        "No, there are known inconsistencies",
        "We do not know",
      ] },
      { id: "8.2", label: "Has the business changed its name, address, product names, or core description in the last 3 years?", hint: "If yes, list what changed and when.", type: "textarea" },
      { id: "8.3", label: "List URLs for your most important third-party profiles and citations.", hint: "e.g. Google Business Profile, Trustpilot, industry directories, Crunchbase, LinkedIn company page.", type: "textarea" },
      { id: "8.4", label: "Are there outdated press releases, articles, or web pages that describe your business inaccurately?", hint: "These fragment your entity authority. If known, list them.", type: "textarea" },
      { id: "8.5", label: "Is there anything else we should know about your brand, content, or competitive landscape?", type: "textarea" },
    ],
  },
];

export default function IntakePage() {
  const [activeSection, setActiveSection] = useState(0);
  const [formData, setFormData] = useState<Record<string, string | string[]>>({});
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  const updateField = (fieldId: string, value: string) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
  };

  const toggleCheckbox = (fieldId: string, option: string) => {
    setFormData((prev) => {
      const current = (prev[fieldId] as string[]) || [];
      const next = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      return { ...prev, [fieldId]: next };
    });
  };

  const markComplete = (idx: number) => {
    setCompleted((prev) => new Set(prev).add(idx));
    if (idx < sections.length - 1) setActiveSection(idx + 1);
  };

  const totalFields = sections.reduce((s, sec) => s + sec.fields.filter((f) => f.type !== "heading").length, 0);
  const filledFields = Object.values(formData).filter((v) => (Array.isArray(v) ? v.length > 0 : v && v.trim().length > 0)).length;
  const progressPct = Math.round((filledFields / totalFields) * 100);

  if (submitted) {
    return (
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-4xl mx-auto">
        <div className="rounded-2xl border p-6 sm:p-16 text-center" style={{ background: "white", borderColor: vars.g200 }}>
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: "rgba(61,155,107,0.1)" }}>
            <CheckCircle2 size={40} color={vars.green} />
          </div>
          <h2 className="text-xl sm:text-2xl mb-3" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
            Intake complete
          </h2>
          <p className="text-[14px] sm:text-[15px] font-light mb-8" style={{ color: vars.g500 }}>
            All 8 sections have been submitted. The platform will use these inputs to generate your content and technical optimisation guides, inform the AIO Diagnostic scoring, and shape Content Optimiser recommendations.
          </p>
          <div className="grid grid-cols-2 gap-4 max-w-md mx-auto mb-8">
            <div className="rounded-xl border p-4" style={{ borderColor: vars.g200 }}>
              <p className="text-2xl font-bold" style={{ color: vars.accent }}>{filledFields}</p>
              <p className="text-xs" style={{ color: vars.g500 }}>Fields completed</p>
            </div>
            <div className="rounded-xl border p-4" style={{ borderColor: vars.g200 }}>
              <p className="text-2xl font-bold" style={{ color: vars.accent }}>8/8</p>
              <p className="text-xs" style={{ color: vars.g500 }}>Sections reviewed</p>
            </div>
          </div>
          <button
            onClick={() => setSubmitted(false)}
            className="px-8 py-3 rounded-lg text-sm font-semibold text-white transition-all hover:brightness-110"
            style={{ background: vars.accent }}
          >
            Review Answers
          </button>
        </div>
      </div>
    );
  }

  const section = sections[activeSection];

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl mx-auto">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl tracking-tight" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
          GEO & AEO Content Optimisation Intake
        </h1>
        <p className="text-[13px] sm:text-[14px] font-light mt-1" style={{ color: vars.g500 }}>
          Complete each section to enable AI-optimised copy, schema markup, semantic phrase guides, and content architecture.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        <div className="w-full lg:w-72 lg:flex-shrink-0">
          <div className="rounded-2xl border p-5 mb-4" style={{ background: "white", borderColor: vars.g200 }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: vars.g400 }}>Progress</span>
              <span className="text-xs font-bold" style={{ color: vars.accent }}>{progressPct}%</span>
            </div>
            <div className="w-full h-2 rounded-full" style={{ background: vars.g200 }}>
              <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${progressPct}%`, background: vars.accent }} />
            </div>
          </div>

          <div className="rounded-2xl border overflow-hidden" style={{ background: "white", borderColor: vars.g200 }}>
            {sections.map((sec, idx) => {
              const isActive = idx === activeSection;
              const isDone = completed.has(idx);
              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveSection(idx)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors border-b last:border-b-0"
                  style={{
                    borderColor: vars.g100,
                    background: isActive ? "rgba(31,116,143,0.04)" : "transparent",
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                    style={{
                      background: isDone ? vars.green : isActive ? vars.accent : vars.g200,
                      color: isDone || isActive ? "white" : vars.g500,
                    }}
                  >
                    {isDone ? <Check size={14} /> : sec.number}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium truncate" style={{ color: isActive ? vars.navy : vars.g500 }}>
                      {sec.title}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="rounded-2xl border" style={{ background: "white", borderColor: vars.g200 }}>
            <div className="px-8 py-6 border-b" style={{ borderColor: vars.g100 }}>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(31,116,143,0.06)" }}>
                  <section.icon size={18} color={vars.accent} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
                    Section {section.number}: {section.title}
                  </h2>
                  <p className="text-xs font-light" style={{ color: vars.g400 }}>{section.subtitle}</p>
                </div>
              </div>
            </div>

            <div className="px-8 py-6">
              <div className="rounded-xl p-4 mb-8" style={{ background: "rgba(31,116,143,0.03)", border: `1px solid rgba(31,116,143,0.08)` }}>
                <p className="text-[13px] font-light leading-relaxed" style={{ color: vars.g600 }}>
                  {section.intro}
                </p>
              </div>

              <div className="space-y-6">
                {section.fields.map((field) => {
                  if (field.type === "heading") {
                    return (
                      <h3 key={field.id} className="text-xs font-bold uppercase tracking-[0.15em] pt-4 pb-1" style={{ color: vars.accent }}>
                        {field.label}
                      </h3>
                    );
                  }

                  if (field.type === "checkbox" && field.options) {
                    const selected = (formData[field.id] as string[]) || [];
                    return (
                      <div key={field.id}>
                        <label className="block text-sm font-medium mb-2" style={{ color: vars.navy }}>
                          {field.id.match(/^\d/) && <span className="text-xs font-bold mr-2" style={{ color: vars.accent }}>{field.id}</span>}
                          {field.label}
                        </label>
                        {field.hint && <p className="text-xs font-light mb-3" style={{ color: vars.g400 }}>{field.hint}</p>}
                        <div className="space-y-2">
                          {field.options.map((opt) => (
                            <label key={opt} className="flex items-start gap-3 cursor-pointer group">
                              <div
                                className="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors"
                                style={{
                                  borderColor: selected.includes(opt) ? vars.accent : vars.g300,
                                  background: selected.includes(opt) ? vars.accent : "transparent",
                                }}
                                onClick={() => toggleCheckbox(field.id, opt)}
                              >
                                {selected.includes(opt) && <Check size={12} color="white" />}
                              </div>
                              <span
                                className="text-[13px] font-light leading-relaxed"
                                style={{ color: vars.g600 }}
                                onClick={() => toggleCheckbox(field.id, opt)}
                              >
                                {opt}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={field.id}>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: vars.navy }}>
                        {field.id.match(/^\d/) && <span className="text-xs font-bold mr-2" style={{ color: vars.accent }}>{field.id}</span>}
                        {field.label}
                      </label>
                      {field.hint && <p className="text-xs font-light mb-2" style={{ color: vars.g400 }}>{field.hint}</p>}
                      {field.type === "textarea" ? (
                        <textarea
                          value={(formData[field.id] as string) || ""}
                          onChange={(e) => updateField(field.id, e.target.value)}
                          rows={4}
                          className="w-full px-4 py-3 rounded-xl border text-[14px] font-light outline-none transition-colors focus:ring-2 resize-y"
                          style={{ borderColor: vars.g200, background: vars.g50, color: vars.navy }}
                          placeholder="Type your answer here..."
                        />
                      ) : (
                        <input
                          type="text"
                          value={(formData[field.id] as string) || ""}
                          onChange={(e) => updateField(field.id, e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border text-[14px] font-light outline-none transition-colors focus:ring-2"
                          style={{ borderColor: vars.g200, background: vars.g50, color: vars.navy }}
                          placeholder="Type your answer here..."
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="px-8 py-5 border-t flex items-center justify-between" style={{ borderColor: vars.g100 }}>
              <button
                onClick={() => activeSection > 0 && setActiveSection(activeSection - 1)}
                disabled={activeSection === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-30"
                style={{ color: vars.g500 }}
              >
                <ArrowLeft size={14} /> Previous
              </button>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => markComplete(activeSection)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  style={{ background: "rgba(31,116,143,0.06)", color: vars.accent }}
                >
                  <Check size={14} /> Mark Complete
                </button>

                {activeSection < sections.length - 1 ? (
                  <button
                    onClick={() => setActiveSection(activeSection + 1)}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:brightness-110"
                    style={{ background: vars.accent }}
                  >
                    Next Section <ArrowRight size={14} />
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      markComplete(activeSection);
                      setSubmitted(true);
                    }}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:brightness-110"
                    style={{ background: vars.green }}
                  >
                    <CheckCircle2 size={14} /> Submit Intake
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
