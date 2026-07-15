import { useState } from "react";
import { Sparkles, User, LogIn, X, Menu, Check, ChevronDown } from "lucide-react";
import { vars } from "./vars";

export default function PricingPage({ onLogin, onNavigate, isAuthed }: { onLogin: () => void; onNavigate: (v: string) => void; isAuthed?: boolean }) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const paper = "#FBF6EC";
  const ink = "#102B36";
  const accent = "#C8497A";
  const accentSoft = "#FBE3ED";
  const teal = vars.teal;
  const agenticGold = "#7C6A3A";

  type PlanFeature = { label: string; inhouse: string | boolean; agency: string | boolean; agentic: string | boolean; section?: boolean };

  const STANDARD_PLANS = [
    {
      key: "inhouse",
      name: "Standard",
      sub: "In-House",
      tagline: "For B2B and B2C in-house teams building AI authority for a single brand.",
      annualTotal: 4000,
      monthly: 333,
      color: teal,
      highlight: false,
      cta: "Book a Demo",
      projects: "1 brand / project",
      competitorNote: "CisionOne AI from £15,000–£40,000+/yr. AIO Fusion pays for itself in one client engagement.",
      includes: [
        "Full Standard platform - all 10 modules",
        "AI Visibility Audit + GEO strategy builder",
        "Comms Planner - plan, score and manage schedules",
        "Content Optimiser and Editor",
        "Content Creator - articles, pitches and ideation",
        "Media Research - AI-recommended journalists",
        "Marketing Intelligence - awards and conferences",
        "Website Content GEO and Technical GEO",
        "Measure and Report - PR impact and AI authority",
        "Archive - long-term content curation",
        "Email support",
      ],
    },
    {
      key: "agency",
      name: "Standard",
      sub: "Agency",
      tagline: "For PR agencies running AI visibility programmes for multiple clients.",
      annualTotal: 5000,
      monthly: 417,
      color: accent,
      highlight: true,
      cta: "Book a Demo",
      projects: "3 projects included",
      competitorNote: "Typically recovered by billing a single client £500/month for AI visibility services.",
      includes: [
        "Everything in Standard In-House, plus:",
        "Multi-client architecture and agency dashboard",
        "3 projects included - each a full brand workspace",
        "Additional projects at £500/yr each (10 projects = £9,500/yr)",
        "Client sub-accounts and reporting",
        "Priority email and chat support",
      ],
    },
  ];

  /* ── WITH AGENTS / AGENTIC LAYER ── hidden for launch, restore when ready ──
  const AGENTIC_PLAN = {
    key: "agentic",
    name: "With Agents",
    sub: "Agentic Layer",
    tagline: "Autonomous PR and marketing programme management with trained specialist agents, governed by human approval gates.",
    annualFrom: 7000,
    color: agenticGold,
    highlight: false,
    cta: "Join the Waitlist",
    launch: "Q2 2027",
    upgradeOffer: "50% off the first 6 months for Standard clients upgrading to With Agents.",
    competitorNote: "Enterprise AI deployments cost £50,000–£150,000+/yr. No autonomous PR agent alternative exists at this price.",
    includes: [
      "Everything in Standard Agency, plus:",
      "20-agent autonomous team per project",
      "Always-on AI visibility monitoring",
      "AI-assisted draft content and GEO fixes",
      "Human approval gates throughout",
      "Journalist and Media AI Authority Score",
      "Full AI Media Database - multi-market",
      "Release Gateway and Wire API integrations",
      "Tactical Media Relations - live opportunity response",
      "Authority-building content engine",
    ],
  };
  ── end WITH AGENTS ── */

  const TABLE_ROWS: PlanFeature[] = [
    { label: "Brands / projects", inhouse: "1", agency: "3 included (+£500/yr each)", agentic: "3 included (+£500/yr each)" },
    { label: "AI Visibility Audit + GEO strategy", inhouse: true, agency: true, agentic: true },
    { label: "Comms Planner", inhouse: true, agency: true, agentic: true },
    { label: "Content Optimiser and Editor", inhouse: true, agency: true, agentic: true },
    { label: "Content Creator", inhouse: true, agency: true, agentic: true },
    { label: "Media Research", inhouse: true, agency: true, agentic: true },
    { label: "Marketing Intelligence", inhouse: true, agency: true, agentic: true },
    { label: "Website Content GEO", inhouse: true, agency: true, agentic: true },
    { label: "Website Technical GEO", inhouse: true, agency: true, agentic: true },
    { label: "Measure and Report", inhouse: true, agency: true, agentic: true },
    { label: "Archive", inhouse: true, agency: true, agentic: true },
    { label: "Multi-client architecture", inhouse: false, agency: true, agentic: true },
    { label: "Client sub-accounts", inhouse: false, agency: true, agentic: true },
    { label: "Autonomous agent orchestration", inhouse: false, agency: false, agentic: true },
    { label: "Always-on visibility monitoring", inhouse: false, agency: false, agentic: true },
    { label: "AI-assisted draft content + GEO fixes", inhouse: false, agency: false, agentic: true },
    { label: "Human approval gates", inhouse: false, agency: false, agentic: true },
    { label: "Journalist and Media AI Authority Score", inhouse: false, agency: false, agentic: true },
    { label: "Full AI Media Database", inhouse: false, agency: false, agentic: true },
    { label: "Release Gateway + Wire API integrations", inhouse: false, agency: false, agentic: true },
    { label: "Support", inhouse: "Email", agency: "Priority email and chat", agentic: "Priority email and chat" },
  ];

  const FAQS = [
    { q: "What is the Standard platform?", a: "Standard is the full AIO Fusion platform - all 10 modules including AI Visibility Audit, Comms Planner, Content Optimiser, Content Creator, Media Research, Marketing Intelligence, Website GEO tools, reporting and Archive. It is available as an In-House plan for a single brand or an Agency plan for multi-client work." },
    { q: "What counts as an LLM Visibility Check?", a: "Each AI Visibility Audit runs your brand through Claude and ChatGPT simultaneously, scoring how often and how accurately each engine cites your brand. The audit maps which AI queries your brand appears in, how it is described, and which competitors appear alongside it. Both Standard plans include full audit access with no artificial run caps." },
    { q: "Can I add more projects to the Agency plan?", a: "Yes. The Agency plan includes 3 projects. You can add further projects at £500/yr each. For example, 10 projects would total £9,500/yr." },
    { q: "Are prices per user or per account?", a: "Prices are per account, billed annually. Multiple team members can collaborate within the same account. Contact us if you need to discuss seat arrangements for larger teams." },
    { q: "Do you offer discounts for charities or non-profits?", a: "Yes, we offer a 30% discount for registered charities and non-profit organisations. Please contact us with your registration details." },
  ];

  function Cell({ v, agentic }: { v: string | boolean; agentic?: boolean }) {
    const color = agentic ? agenticGold : teal;
    if (v === true) return <span className="flex justify-center"><span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: `${color}22` }}><Check size={12} color={color} strokeWidth={2.5} /></span></span>;
    if (v === false) return <span className="flex justify-center text-[18px] font-light" style={{ color: vars.g300 }}>-</span>;
    return <span className="text-[12px] font-medium text-center block" style={{ color: ink }}>{v}</span>;
  }

  const navLinks = [
    { l: "Features", v: "landing#features" },
    { l: "For In-house", v: "for-inhouse" },
    { l: "For PR Agencies", v: "for-agencies" },
    { l: "Pricing", v: "pricing" },
    { l: "Insights", v: "insights" },
    { l: "Contact", v: "contact" },
  ];

  return (
    <div className="font-['Inter',sans-serif]" style={{ background: paper, color: ink }}>
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md" style={{ background: "rgba(251,246,236,0.95)", borderBottom: `1px solid rgba(16,43,54,0.08)` }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-[64px] sm:h-[80px] flex items-center justify-between">
          <button onClick={() => onNavigate("landing")} className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}images/logo-color.png`} alt="AIO Fusion" className="h-10 sm:h-14" />
          </button>
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((it) => (
              <button key={it.l} onClick={() => onNavigate(it.v)} className="text-[12px] font-semibold uppercase tracking-[0.14em] hover:opacity-60 transition-opacity" style={{ color: it.v === "pricing" ? accent : ink }}>{it.l}</button>
            ))}
            <button onClick={onLogin} className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-bold uppercase tracking-[0.14em] transition-all hover:opacity-80" style={{ background: ink, color: paper }}>
              {isAuthed ? <><User size={14} /> My Account</> : <><LogIn size={14} /> Platform Login</>}
            </button>
          </div>
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} style={{ color: ink }}>{menuOpen ? <X size={24} /> : <Menu size={24} />}</button>
        </div>
        {menuOpen && (
          <div className="md:hidden px-4 pb-5 flex flex-col gap-3 border-t" style={{ background: paper, borderColor: vars.g200 }}>
            {navLinks.map((it) => (
              <button key={it.l} onClick={() => { setMenuOpen(false); onNavigate(it.v); }} className="text-[12px] font-semibold uppercase tracking-[0.14em] py-2 text-left" style={{ color: ink }}>{it.l}</button>
            ))}
            <button onClick={() => { setMenuOpen(false); onLogin(); }} className="px-4 py-2 rounded-lg text-[12px] font-bold uppercase tracking-[0.14em] flex items-center gap-2" style={{ background: ink, color: paper }}>{isAuthed ? <><User size={14} /> My Account</> : <><LogIn size={14} /> Platform Login</>}</button>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="pt-[110px] sm:pt-[130px] pb-12 sm:pb-16 text-center px-4">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5" style={{ background: accentSoft, border: `1px solid ${accent}40` }}>
          <Sparkles size={11} color={accent} />
          <span className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>Transparent Pricing</span>
        </div>
        <h1 className="text-4xl md:text-5xl lg:text-[3.5rem] leading-[1.1] mb-4 max-w-3xl mx-auto" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>
          Plans built for PR and marketing teams
        </h1>
        <p className="text-[15px] font-light max-w-xl mx-auto mb-4 leading-relaxed" style={{ color: vars.g600 }}>
          Annual subscriptions. No hidden costs. All prices exclude VAT.
        </p>
      </section>

      {/* Pricing cards */}
      <section className="pb-16 px-4 sm:px-8">
        <div className="max-w-5xl mx-auto">

          {/* Standard plans group label */}
          <div className="flex items-center gap-3 mb-5">
            <div className="h-px flex-1" style={{ background: vars.g200 }} />
            <span className="text-[10px] font-bold uppercase tracking-[0.26em]" style={{ color: teal }}>Standard</span>
            <div className="h-px flex-1" style={{ background: vars.g200 }} />
          </div>

          <div className="grid sm:grid-cols-2 gap-5 mb-8">
            {STANDARD_PLANS.map((plan) => (
              <div key={plan.key} className="rounded-2xl overflow-hidden flex flex-col" style={{ border: plan.highlight ? `2px solid ${accent}` : `1px solid ${vars.g200}`, background: plan.highlight ? "white" : paper, boxShadow: plan.highlight ? `0 20px 48px -12px ${accent}30` : "none" }}>
                {plan.highlight && (
                  <div className="text-center py-2 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ background: accent, color: "white" }}>Most Popular</div>
                )}
                <div className="p-7 flex flex-col flex-1">
                  <div className="mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: plan.color }}>{plan.name}</span>
                    <h2 className="text-[26px] mt-0.5" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>{plan.sub}</h2>
                  </div>
                  <p className="text-[13px] font-light leading-relaxed mb-6" style={{ color: vars.g500 }}>{plan.tagline}</p>
                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-[13px] font-semibold" style={{ color: vars.g500 }}>£</span>
                      <span className="text-[48px] font-bold leading-none" style={{ color: ink }}>{plan.monthly}</span>
                      <span className="text-[13px]" style={{ color: vars.g400 }}>/mo</span>
                    </div>
                    <p className="text-[11px] mt-1" style={{ color: vars.g400 }}>£{plan.annualTotal.toLocaleString()}/yr billed annually · {plan.projects}</p>
                  </div>
                  <button onClick={() => onNavigate("contact")} className="w-full py-3 rounded-xl text-[13px] font-bold uppercase tracking-[0.12em] transition-all hover:opacity-90 mb-6" style={{ background: plan.highlight ? accent : ink, color: "white" }}>
                    {plan.cta}
                  </button>
                  <ul className="space-y-3 flex-1">
                    {plan.includes.map((item, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-[13px]">
                        {i === 0 && item.includes("Everything") ? (
                          <span className="text-[12px] font-semibold italic" style={{ color: vars.g400 }}>{item}</span>
                        ) : (
                          <>
                            <Check size={14} color={plan.color} strokeWidth={2.5} className="flex-shrink-0 mt-0.5" />
                            <span className="font-light leading-snug" style={{ color: ink }}>{item}</span>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] mt-6 pt-5 leading-relaxed" style={{ color: vars.g400, borderTop: `1px solid ${vars.g100}` }}>{plan.competitorNote}</p>
                </div>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* Feature comparison table */}
      <section className="py-16 px-4 sm:px-8" style={{ background: "white" }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-[10px] font-bold uppercase tracking-[0.28em]" style={{ color: accent }}>Full Comparison</span>
            <h2 className="text-3xl md:text-4xl mt-3" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Everything included, at a glance</h2>
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${vars.g200}` }}>
            <div className="grid grid-cols-3" style={{ background: vars.g50, borderBottom: `1px solid ${vars.g200}` }}>
              <div className="p-4" />
              <div className="p-4 text-center">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: teal }}>Standard</p>
                <p className="text-[12px] font-semibold mt-0.5" style={{ color: ink }}>In-House</p>
              </div>
              <div className="p-4 text-center">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: accent }}>Standard</p>
                <p className="text-[12px] font-semibold mt-0.5" style={{ color: ink }}>Agency</p>
              </div>
            </div>
            {TABLE_ROWS.filter(row => row.inhouse !== false || row.agency !== false).map((row, i) => (
              <div key={row.label} className="grid grid-cols-3 border-b last:border-b-0" style={{ borderColor: vars.g100, background: i % 2 === 0 ? "white" : vars.g50 }}>
                <div className="p-4 text-[13px] font-light" style={{ color: ink }}>{row.label}</div>
                <div className="p-4"><Cell v={row.inhouse} /></div>
                <div className="p-4"><Cell v={row.agency} /></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ — hidden for launch, restore when ready
      <section className="py-16 px-4 sm:px-8" style={{ background: paper }}>
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-[10px] font-bold uppercase tracking-[0.28em]" style={{ color: teal }}>FAQ</span>
            <h2 className="text-3xl md:text-4xl mt-3" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Questions and answers</h2>
          </div>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${vars.g200}` }}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full flex items-center justify-between gap-4 p-5 text-left" style={{ background: openFaq === i ? "white" : paper }}>
                  <span className="text-[14px] font-semibold" style={{ color: ink }}>{faq.q}</span>
                  <ChevronDown size={16} color={vars.g400} className="flex-shrink-0 transition-transform" style={{ transform: openFaq === i ? "rotate(180deg)" : "none" }} />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-5 bg-white">
                    <p className="text-[13px] font-light leading-relaxed" style={{ color: vars.g600 }}>{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
      end FAQ */}

      {/* CTA */}
      <section className="py-16 px-4 sm:px-8 text-center" style={{ background: ink }}>
        <h2 className="text-3xl md:text-4xl mb-4" style={{ color: "#FBF6EC", fontFamily: "'Alice', Georgia, serif" }}>Ready to build AI authority?</h2>
        <p className="text-[14px] font-light mb-8 max-w-md mx-auto" style={{ color: "rgba(251,246,236,0.7)" }}>Book a platform demo and see how AIO Fusion measures and improves your AI visibility.</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button onClick={() => onNavigate("contact")} className="px-8 py-3.5 rounded-full text-[13px] font-bold uppercase tracking-[0.12em] transition-all hover:opacity-90" style={{ background: accent, color: "white" }}>Book a Demo</button>
          <button onClick={onLogin} className="flex items-center gap-2 px-8 py-3.5 rounded-lg text-[13px] font-bold uppercase tracking-[0.12em] transition-all hover:opacity-80" style={{ background: ink, color: paper }}>{isAuthed ? <><User size={14} /> My Account</> : <><LogIn size={14} /> Platform Login</>}</button>
        </div>
      </section>

      <footer className="py-10 border-t" style={{ background: paper, borderColor: "rgba(16,43,54,0.1)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-[12px] font-light" style={{ color: "rgba(16,43,54,0.5)" }}>&copy; AIO Fusion. All rights reserved.</p>
          <div className="flex items-center gap-6">
            {[{ l: "About", v: "about" }, { l: "Contact", v: "contact" }, { l: "Insights", v: "insights" }].map((it) => (
              <button key={it.l} onClick={() => onNavigate(it.v)} className="text-[12px] font-light hover:underline" style={{ color: "rgba(16,43,54,0.7)" }}>{it.l}</button>
            ))}
            <a href="mailto:info@aiofusion.ai" className="text-[12px] font-light hover:underline" style={{ color: "rgba(16,43,54,0.7)" }}>info@aiofusion.ai</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
