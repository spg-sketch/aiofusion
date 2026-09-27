import { Sparkles, Check } from "lucide-react";
import { vars } from "./vars";
import { PageHead } from "./PageHead";
import { PAGE_META } from "./pageMeta";
import MarketingNav from "./MarketingNav";

export default function PricingPage({
  onLogin,
  onNavigate,
  isAuthed,
}: {
  onLogin: () => void;
  onNavigate: (v: string) => void;
  isAuthed?: boolean;
}) {
  const paper = "#F5F8F8";
  const ink = "#102B36";
  const accent = "#C8497A";
  const accentSoft = "#FBE3ED";
  const teal = vars.teal;
  const agenticGold = "#7C6A3A";
  const base = import.meta.env.BASE_URL;

  type PlanFeature = { label: string; inhouse: string | boolean; agency: string | boolean; agentic: string | boolean; section?: boolean };

  const STANDARD_PLANS = [
    {
      key: "inhouse",
      name: "Standard",
      sub: "In-House",
      tagline: "For in-house teams building AI authority for a single brand",
      annualTotal: 4000,
      monthly: 333,
      quarterly: 4600,
      quarterlyMonthly: 383,
      color: teal,
      highlight: false,
      cta: "Book a Demo",
      projects: "1 Premium project",
      includes: [
        "Full standard platform (all 10 modules)",
        "AI Visibility Audit + GEO strategy builder",
        "Comms Planner (plan, score and manage schedules)",
        "Content Optimiser and Editor",
        "Content Creator (articles, pitches and ideation)",
        "Media Research (AI-recommended journalists)",
        "Marketing Intelligence (awards and conferences)",
        "Website Content GEO and Technical GEO",
        "Measure and Report (PR impact and AI authority)",
        "Content Library (long-term content curation)",
        "Email support",
      ],
    },
    {
      key: "agency",
      name: "Standard",
      sub: "Agency",
      tagline: "For PR and digital marketing agencies running AI visibility programmes for multiple clients.",
      annualTotal: 5000,
      monthly: 417,
      quarterly: 5750,
      quarterlyMonthly: 479,
      color: accent,
      highlight: true,
      cta: "Book a Demo",
      projects: "3 Premium projects included",
      includes: [
        "Full standard platform (all 10 modules)",
        "AI Visibility Audit + GEO strategy builder",
        "Comms Planner (plan, score and manage schedules)",
        "Content Optimiser and Editor",
        "Content Creator (articles, pitches and ideation)",
        "Media Research (AI-recommended journalists)",
        "Marketing Intelligence (awards and conferences)",
        "Website Content GEO and Technical GEO",
        "Measure and Report (PR impact and AI authority)",
        "Content Library (long-term content curation)",
        "Multi-client architecture and agency dashboard",
        "3 Premium projects included (each a full brand workspace)",
        "Client sub-accounts and reporting",
        "Priority email and chat support",
      ],
    },
  ];

  const TABLE_ROWS: PlanFeature[] = [
    { label: "Brands / projects", inhouse: "1 Premium brand/project", agency: "3 Premium projects included", agentic: "3 Premium projects included" },
    { label: "AI Visibility Audit + GEO strategy", inhouse: true, agency: true, agentic: true },
    { label: "Comms Planner", inhouse: true, agency: true, agentic: true },
    { label: "Content Optimiser and Editor", inhouse: true, agency: true, agentic: true },
    { label: "Content Creator", inhouse: true, agency: true, agentic: true },
    { label: "Media Research", inhouse: true, agency: true, agentic: true },
    { label: "Marketing Intelligence", inhouse: true, agency: true, agentic: true },
    { label: "Website Content GEO", inhouse: true, agency: true, agentic: true },
    { label: "Website Technical GEO", inhouse: true, agency: true, agentic: true },
    { label: "Measure and Report", inhouse: true, agency: true, agentic: true },
    { label: "Content Library", inhouse: true, agency: true, agentic: true },
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

  const ADDITIONAL_PROJECT_TIERS = [
    { name: "Standard", price: 500, actions: 50, color: teal },
    { name: "Premium", price: 650, actions: 75, color: accent },
    { name: "Max", price: 800, actions: 150, color: agenticGold },
  ];

  function Cell({ v, agentic }: { v: string | boolean; agentic?: boolean }) {
    const color = agentic ? agenticGold : teal;
    if (v === true) return <span className="flex justify-center"><span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: color }}><Check size={12} color="white" strokeWidth={3} /></span></span>;
    if (v === false) return <span className="flex justify-center text-[18px] font-light" style={{ color: vars.g300 }}>-</span>;
    return <span className="text-[12px] font-medium text-center block" style={{ color: ink }}>{v}</span>;
  }

  return (
    <div className="font-['Inter',sans-serif]" style={{ background: paper, color: ink }}>
      <PageHead meta={PAGE_META.pricing} />

      <MarketingNav onNavigate={onNavigate} onLogin={onLogin} isAuthed={isAuthed} />

      {/* Hero */}
      <section className="pt-[115px] sm:pt-[130px] pb-8 sm:pb-10 px-4 sm:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5" style={{ background: accentSoft, border: `1px solid ${accent}40` }}>
            <Sparkles size={11} color={accent} />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>Transparent Pricing</span>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-[3.25rem] leading-[1.1] mb-3 max-w-none lg:whitespace-nowrap" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>
            Plans built for PR and marketing teams
          </h1>
          <p className="text-[15px] font-normal max-w-xl mb-3 leading-relaxed" style={{ color: vars.g600 }}>
            Compare GEO software plans for in-house PR teams and multi-client agencies. Annual subscriptions, clear project capacity and no hidden costs. All prices exclude VAT.
          </p>
          <p className="text-[13px] font-light max-w-2xl leading-relaxed" style={{ color: vars.g500 }}>
            Choosing for a team? See how AIO Fusion supports{" "}
            <a href={`${base}for-inhouse`} className="font-semibold underline underline-offset-4" style={{ color: accent }}>in-house PR and marketing</a>
            {" "}or{" "}
            <a href={`${base}for-agencies`} className="font-semibold underline underline-offset-4" style={{ color: accent }}>PR agencies managing multiple clients</a>.
          </p>
        </div>
      </section>

      {/* Pricing cards */}
      <section className="pb-8 px-4 sm:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="grid sm:grid-cols-2 gap-5 mb-6">
            {STANDARD_PLANS.map((plan) => (
              <div key={plan.key} className="rounded-2xl overflow-hidden flex flex-col" style={{ border: plan.key === "agency" ? `2px solid ${accent}` : `2px solid ${ink}`, background: "white", boxShadow: plan.key === "agency" ? `0 20px 48px -12px ${accent}30` : "0 20px 48px -12px rgba(16,43,54,0.15)" }}>
                <div className="p-7 flex flex-col flex-1">
                  <div className="mb-1">
                    <h2 className="text-[26px] mt-0.5" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>{plan.sub}</h2>
                  </div>
                  <p className="text-[13px] font-light leading-relaxed mb-6 min-h-[40px]" style={{ color: vars.g500 }}>{plan.tagline}</p>
                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-[13px] font-semibold" style={{ color: vars.g500 }}>£</span>
                      <span className="text-[48px] font-bold leading-none" style={{ color: ink }}>{plan.monthly}</span>
                       <span className="text-[13px]" style={{ color: vars.g600 }}>/mo</span>
                    </div>
                     <p className="text-[11px] mt-1" style={{ color: vars.g600 }}>£{plan.annualTotal.toLocaleString()}/yr billed annually · {plan.projects}</p>
                     <p className="text-[11px] mt-2 pt-2" style={{ color: vars.g600, borderTop: `1px solid ${vars.g100}` }}>
                      Or <span className="font-semibold" style={{ color: ink }}>£{plan.quarterlyMonthly}/month · £{plan.quarterly.toLocaleString()}/yr</span> billed quarterly
                    </p>
                  </div>
                  <a
                    href={`${base}contact`}
                    onClick={(e) => { e.preventDefault(); onNavigate("contact"); }}
                    className="w-full py-3 rounded-xl text-[13px] font-bold uppercase tracking-[0.12em] transition-all hover:opacity-90 mb-6 text-center text-white"
                    style={{ background: plan.highlight ? accent : ink, display: "block" }}
                  >
                    {plan.cta}
                  </a>
                  <ul className="space-y-3 flex-1">
                    {plan.includes.map((item, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-[13px]">
                        {i === 0 && item.includes("Everything") ? (
                           <span className="text-[12px] font-semibold italic" style={{ color: vars.g600 }}>{item}</span>
                        ) : (
                          <>
                            <Check size={14} color={plan.color} strokeWidth={2.5} className="flex-shrink-0 mt-0.5" />
                            <span className="font-light leading-snug" style={{ color: ink }}>{item}</span>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Additional Project Workspaces */}
      <section className="pt-8 pb-6 sm:pt-10 sm:pb-6 px-4 sm:px-8" style={{ background: "white" }}>
        <div className="max-w-5xl mx-auto rounded-2xl p-5 sm:p-8" style={{ border: `4px double ${ink}`, background: "white" }}>
          <h2 className="text-3xl md:text-4xl mb-6" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Additional Project Pricing</h2>
          <div className="grid md:grid-cols-[0.9fr_1.1fr] gap-6 md:gap-8 items-start">
            <div>
              <p className="text-[15px] font-normal leading-[1.7] mb-4" style={{ color: vars.g600 }}>
                Need another brand, client, or programme? Add an independent project workspace, each with its own setup data, audits, content and communications plan.
              </p>
              <p className="text-[14px] font-normal leading-[1.7] mb-4" style={{ color: vars.g600 }}>
                Every pack includes a monthly activity allowance. An action is a piece of content created or optimised, or a marketing and media intelligence search.
              </p>
              <p className="text-[13px] font-medium leading-[1.6]" style={{ color: ink }}>
                Choose the activity level to suit each brand or client. Packs add workspaces, not runtime capacity or parallel environments within an existing project.
              </p>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              {ADDITIONAL_PROJECT_TIERS.map((tier) => (
                <div key={tier.name} className="rounded-xl p-4 flex flex-col justify-between min-h-[150px]" style={{ border: `1.5px solid ${ink}`, background: `${tier.color}0D` }}>
                  <span className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: tier.color }}>{tier.name}</span>
                  <div className="mt-4">
                    <div className="flex items-baseline gap-1">
                      <span className="text-[12px] font-semibold" style={{ color: vars.g600 }}>£</span>
                      <span className="text-[30px] font-bold leading-none" style={{ color: ink }}>{tier.price}</span>
                    </div>
                    <p className="text-[11px] mt-1" style={{ color: vars.g500 }}>per year / project</p>
                  </div>
                  <p className="text-[13px] font-bold mt-4" style={{ color: tier.color }}>×{tier.actions} <span className="text-[11px] font-medium" style={{ color: vars.g600 }}>actions / month</span></p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Feature comparison table */}
      <section className="pt-4 pb-10 sm:pt-5 sm:pb-12 px-4 sm:px-8" style={{ background: "white" }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-[10px] font-bold uppercase tracking-[0.28em]" style={{ color: accent }}>Full Comparison</span>
            <h2 className="text-3xl md:text-4xl mt-3" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Everything included, at a glance</h2>
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ border: `3px double ${ink}` }}>
            <div className="grid grid-cols-3" style={{ background: vars.g50, borderBottom: `1px solid ${vars.g200}` }}>
              <div className="p-4" />
              <div className="p-4 text-center">
                <p className="text-[12px] font-semibold" style={{ color: ink }}>In-House</p>
              </div>
              <div className="p-4 text-center">
                <p className="text-[12px] font-semibold" style={{ color: ink }}>Agency</p>
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

      {/* CTA */}
      <section className="py-16 px-4 sm:px-8 text-center" style={{ background: ink }}>
        <h2 className="text-3xl md:text-4xl mb-4" style={{ color: "#FBF6EC", fontFamily: "'Alice', Georgia, serif" }}>Ready to build AI authority?</h2>
        <p className="text-[14px] font-normal mb-8 max-w-md mx-auto text-white">Book a platform demo and see how AIO Fusion measures and improves your AI visibility.</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            href={`${base}contact`}
            onClick={(e) => { e.preventDefault(); onNavigate("contact"); }}
            className="px-8 py-3.5 rounded-full text-[13px] font-bold uppercase tracking-[0.12em] transition-all hover:opacity-90 text-white"
            style={{ background: accent, display: "inline-block" }}
          >
            Book a Demo
          </a>
        </div>
      </section>

      <footer className="py-10 border-t" style={{ background: paper, borderColor: "rgba(16,43,54,0.1)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-[12px] font-normal" style={{ color: vars.g600 }}>&copy; AIO Fusion. All rights reserved.</p>
          <nav aria-label="Footer navigation" className="flex items-center gap-6 flex-wrap justify-center">
            {[{ l: "About", v: "about" }, { l: "Contact", v: "contact" }, { l: "Insights", v: "insights" }].map((it) => (
              <a
                key={it.l}
                href={`${base}${it.v}`}
                onClick={(e) => { e.preventDefault(); onNavigate(it.v); }}
                className="text-[12px] font-normal hover:underline"
                style={{ color: vars.g600 }}
              >
                {it.l}
              </a>
            ))}
            <a href="mailto:info@aiofusion.ai" className="text-[12px] font-normal hover:underline" style={{ color: vars.g600 }}>info@aiofusion.ai</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
