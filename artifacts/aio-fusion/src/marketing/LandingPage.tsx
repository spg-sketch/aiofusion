import { useState } from "react";
import {
  Sparkles,
  LogIn,
  ArrowRight,
  Search,
  FileEdit,
  Bot,
  Calendar,
  Lightbulb,
  LineChart,
  User,
  Archive,
  Globe,
  Code2,
  TrendingUp,
  ShieldCheck,
  X,
  Menu,
  Mail,
} from "lucide-react";
import { vars } from "./vars";
import step1Img from "../assets/photos/photo-diagnose.jpg";
import step2Img from "../assets/photos/photo-strategy.jpg";
import step3Img from "../assets/photos/photo-plan.jpg";
import step4Img from "../assets/photos/photo-optimise.jpg";
import step5Img from "../assets/photos/photo-measure.jpg";
import blogTile1 from "../assets/blog-tile-1.png";
import blogTile2 from "../assets/blog-tile-2.png";
import blogTile3 from "../assets/blog-tile-3.png";
import heroBgImg from "../assets/hero-bg.png";

const llmEngines = ["ChatGPT", "Claude"];

export default function LandingPageC({ onLogin, onNavigate, isAuthed }: { onLogin: () => void; onNavigate: (v: string) => void; isAuthed?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const paper = "#FBF6EC";
  const ink = "#102B36";
  const accent = "#C8497A";
  const accentDark = "#A33860";
  const accentTint = "#F4B4CD";
  const accentSoft = "#FBE3ED";
  return (
    <div className="font-['Inter',sans-serif]" style={{ background: paper, color: ink }}>
      <nav className="fixed top-0 left-0 right-0 z-50" style={{ background: paper, borderBottom: `1px solid ${vars.g200}` }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-[64px] sm:h-[80px] flex items-center justify-between">
          <button onClick={() => onNavigate("landing")} className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}images/logo-color.png`} alt="AIO Fusion" className="h-10 sm:h-14" />
          </button>
          <div className="hidden lg:flex items-center gap-7">
            {[
              { l: "Home", v: "landing" },
              { l: "Features", v: "landing#features" },
              { l: "For In-house", v: "for-inhouse" },
              { l: "For PR Agencies", v: "for-agencies" },
              { l: "Pricing", v: "pricing" },
              { l: "Insights", v: "insights" },
              { l: "Contact", v: "contact" },
              { l: "About", v: "about" },
            ].map((it) => (
              <button key={it.l} onClick={() => onNavigate(it.v)} className="text-[12px] font-semibold uppercase tracking-[0.14em] hover:opacity-60 transition-opacity" style={{ color: ink }}>{it.l}</button>
            ))}
            <button onClick={onLogin} className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-bold uppercase tracking-[0.14em] transition-all hover:opacity-80" style={{ background: ink, color: paper }}>
              {isAuthed ? <><User size={14} /> My Account</> : <><LogIn size={14} /> Platform Login</>}
            </button>
          </div>
          <button className="lg:hidden" style={{ color: ink }} onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
        {menuOpen && (
          <div className="lg:hidden px-4 sm:px-8 pb-5 flex flex-col gap-4" style={{ background: paper, borderTop: `1px solid ${vars.g200}` }}>
            {[
              { l: "Home", v: "landing" },
              { l: "Features", v: "landing#features" },
              { l: "For In-house", v: "for-inhouse" },
              { l: "For PR Agencies", v: "for-agencies" },
              { l: "Pricing", v: "pricing" },
              { l: "Insights", v: "insights" },
              { l: "Contact", v: "contact" },
              { l: "About", v: "about" },
            ].map((it) => (
              <button key={it.l} onClick={() => { setMenuOpen(false); onNavigate(it.v); }} className="text-[12px] font-semibold uppercase tracking-[0.14em] py-2 text-left" style={{ color: ink }}>{it.l}</button>
            ))}
            <button onClick={() => { setMenuOpen(false); onLogin(); }} className="px-4 py-2 rounded-lg text-[12px] font-bold uppercase tracking-[0.14em] flex items-center gap-2" style={{ background: ink, color: paper }}>{isAuthed ? <><User size={14} /> My Account</> : <><LogIn size={14} /> Platform Login</>}</button>
          </div>
        )}
      </nav>

      {/* HERO - image-led with warm overlay */}
      <section className="relative pt-[100px] sm:pt-[120px] pb-12 sm:pb-16 overflow-hidden">
        <div className="absolute inset-0" aria-hidden="true">
          <img src={heroBgImg} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: `linear-gradient(120deg, ${paper} 0%, ${paper}EE 38%, ${paper}A8 62%, transparent 100%)` }} />
          <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 0%, ${paper}66 80%, ${paper} 100%)` }} />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-8">
          <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5" style={{ background: accentSoft, border: `1px solid ${accent}40` }}>
                <Sparkles size={12} color={accent} />
                <span className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>Generative Engine Optimisation</span>
              </div>
              <h1 className="text-5xl md:text-6xl lg:text-[4.5rem] leading-[1.04] mb-8" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>
                The AI Authority Platform<br />for <span style={{ color: accent }}>PR and Marketing Professionals</span>
              </h1>
              <p className="text-[15px] md:text-base max-w-xl leading-[1.7] font-light mb-8" style={{ color: vars.g600 }}>
                With AI now playing a key role in business visibility and purchase vetting, AIO Fusion helps you harness the power of Answer Engines.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <a href="#features" className="flex items-center gap-2 px-7 py-3.5 rounded-full text-[13px] font-bold uppercase tracking-[0.12em] transition-all hover:bg-black/5" style={{ color: ink, border: `1.5px solid ${ink}30` }}>
                  Explore Features <ArrowRight size={14} />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURE PANELS - three full-colour blocks (teal, raspberry, gold) */}
      <section className="pb-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 mb-10">
          <div className="max-w-3xl">
            <span className="text-[10px] font-bold uppercase tracking-[0.28em]" style={{ color: accent }}>The Platform</span>
            <h2 className="text-4xl md:text-5xl mt-3 mb-4" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Everything you need to win AI visibility.</h2>
            <p className="text-lg font-light leading-relaxed" style={{ color: vars.g600 }}>From diagnosis through to delivery - the full GEO, PR and marketing content workflow in one platform.</p>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { title: "AI Visibility Diagnostic", copy: "Audit the performance of your earned media and website in the eyes of LLMs like Claude and ChatGPT. See exactly where you're strong and what needs work.", icon: Search, bg: vars.teal, tint: "#9DD6E8" },
              { title: "Optimise PR and Marketing", copy: "Maximise the impact your PR and marketing has on humans and AI, with easy-to-use content optimisation tools that will give you consistent authority from press releases to award entries.", icon: FileEdit, bg: accent, tint: accentTint },
              { title: "Automate your Communications", copy: "AIO Fusion enables in-house marketers and communications professionals to rapidly research, plan, scale and predict the impact of content and marketing activity.", icon: Bot, bg: vars.gold, tint: "#EFD49B" },
            ].map((box) => (
              <div key={box.title} className="relative p-7 sm:p-8 rounded-2xl overflow-hidden" style={{ background: box.bg, color: "white" }}>
                <div className="absolute -bottom-12 -right-12 w-44 h-44 rounded-full opacity-25" style={{ background: box.tint }} />
                <div className="relative">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5" style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)" }}>
                    <box.icon size={22} color="white" />
                  </div>
                  <h3 className="text-[24px] mb-3 leading-tight" style={{ fontFamily: "'Alice', Georgia, serif" }}>{box.title}</h3>
                  <p className="text-[14px] font-light leading-[1.7] text-white/90">{box.copy}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="grid md:grid-cols-3 gap-5 mt-5">
            {[
              { icon: Calendar, title: "Comms Planner", copy: "Plan and score your PR and marketing schedule for predicted AI authority impact.", accent: vars.teal },
              { icon: Lightbulb, title: "Media & Marketing Intelligence", copy: "Research media contacts and assess future marketing activity based on AI Authority impact.", accent: accent },
              { icon: LineChart, title: "Measure & Report", copy: "Measure and report your PR and marketing impact and business AI authority growth.", accent: vars.gold },
            ].map((b) => (
              <div key={b.title} className="p-7 sm:p-8 rounded-2xl bg-white transition-all hover:-translate-y-1" style={{ border: `2px solid ${b.accent}`, boxShadow: `0 14px 32px -12px ${b.accent}55` }}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: b.accent }}>
                    <b.icon size={22} color="white" />
                  </div>
                  <h3 className="text-[20px] font-bold leading-tight" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>{b.title}</h3>
                </div>
                <p className="text-[14px] font-light leading-[1.7]" style={{ color: vars.g600 }}>{b.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS - colourful image grid (3x2 cards) */}
      <section className="py-20 mt-12" style={{ background: "white" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
          <div className="max-w-3xl mb-12">
            <span className="text-[10px] font-bold uppercase tracking-[0.28em]" style={{ color: vars.teal }}>How it works</span>
            <h2 className="text-4xl md:text-5xl mt-3 mb-4" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>The cost-effective B2B PR technology for the age of AI.</h2>
            <p className="text-[15px] font-light leading-[1.85]" style={{ color: vars.g600 }}>Feed your business messaging, PR content and marketing plans into AIO Fusion and receive visibility diagnostics, planning advice, optimised content creation and measurement across it all.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { n: "01", img: step1Img, title: "Diagnose your AI visibility", body: "AIO Fusion diagnoses your business or brand visibility with AI models such as ChatGPT and Claude.", accent: vars.teal },
              { n: "02", img: step2Img, title: "Build a GEO strategy", body: "Create a GEO strategy combining optimised content and technical AIO steps for your website and all your future PR and marketing output.", accent: accent },
              { n: "03", img: step3Img, title: "Plan and predict impact", body: "Optimise and predict the impact of your forward marketing and PR plan for AI authority and search.", accent: vars.gold },
              { n: "04", img: step4Img, title: "Optimise content output", body: "Optimise your on-going PR and marketing content output using a tailored AI authority editor.", accent: vars.green },
              { n: "05", img: step5Img, title: "Measure, report and predict", body: "Measure, report and predict marketing performance and AI visibility, tracking business messages, spokespeople and earned media.", accent: vars.accent },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl overflow-hidden bg-white flex flex-col transition-transform hover:-translate-y-1" style={{ border: `1px solid ${vars.g200}`, boxShadow: "0 4px 14px -6px rgba(0,0,0,0.08)" }}>
                <div className="aspect-[16/10] overflow-hidden relative" style={{ background: s.accent }}>
                  <img src={s.img} alt="" aria-hidden="true" className="w-full h-full object-cover" />
                  <div className="absolute top-3 left-3 w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold" style={{ background: "white", color: s.accent }}>{s.n}</div>
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <h3 className="text-[19px] mb-2 leading-tight" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>{s.title}</h3>
                  <p className="text-[13.5px] font-light leading-[1.7]" style={{ color: vars.g600 }}>{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* KEY FEATURES - compact pill tags grouped by accent */}
      <section id="features" className="py-20" style={{ background: vars.creamDeep }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
          <div className="max-w-3xl mb-12">
            <span className="text-[10px] font-bold uppercase tracking-[0.28em]" style={{ color: accent }}>Key features</span>
            <h2 className="text-4xl md:text-5xl mt-3 mb-4" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>AIO for business PR and marketing.</h2>
            <p className="text-[15px] font-light leading-relaxed" style={{ color: vars.g600 }}>Designed to AI Optimise PR and marketing at scale.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: ShieldCheck, title: "Strategy & Audit", desc: "Build the foundations of your strategy and audit AI authority across earned and owned media.", accent: vars.teal },
              { icon: Calendar, title: "Comms Planner", desc: "Plan and score your PR and marketing schedule for predicted AI authority impact.", accent: accent },
              { icon: FileEdit, title: "Content Optimiser & Editor", desc: "Create, optimise and edit press releases, articles, events and awards content.", accent: vars.gold },
              { icon: Sparkles, title: "Content Creator", desc: "Create optimised content from raw information for PR and marketing.", accent: vars.green },
              { icon: Search, title: "Media Research", desc: "Fuel media relations with AI recommended journalist contacts.", accent: vars.accent },
              { icon: Lightbulb, title: "Marketing Intelligence", desc: "Research and score potential marketing activities such as conferences and awards.", accent: accent },
              { icon: LineChart, title: "Measure & Report", desc: "Measure and report your PR and marketing impact and business AI authority growth.", accent: vars.teal },
              { icon: Archive, title: "Content Library", desc: "Store and curate all your PR and marketing content over time.", accent: vars.gold },
              { icon: Globe, title: "Website Content GEO", desc: "Enhance your website content visibility for AI uplift.", accent: vars.green },
              { icon: Code2, title: "Website Technical GEO", desc: "Back-end instructions to maximise the AI effectiveness of your website.", accent: vars.accent },
              { icon: TrendingUp, title: "SEO Integration", desc: "Integrate SEO with AI optimisation for earned and owned media.", accent: accent, soon: true },
            ].map((tool) => (
              <div key={tool.title} className="p-5 rounded-xl bg-white transition-shadow hover:shadow-md" style={{ border: `1px solid ${tool.accent}25` }}>
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${tool.accent}18` }}>
                    <tool.icon size={14} color={tool.accent} />
                  </div>
                  <h4 className="text-[13px] font-bold uppercase tracking-[0.08em]" style={{ color: ink }}>{tool.title}</h4>
                  {tool.soon && (<span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: `${tool.accent}18`, color: tool.accent }}>Soon</span>)}
                </div>
                <p className="text-[13px] leading-[1.7] font-light" style={{ color: vars.g600 }}>{tool.desc}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 pt-10 mt-10 border-t" style={{ borderColor: `${vars.g300}` }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: vars.g500 }}>Optimised for</p>
            {llmEngines.map((name) => (
              <span key={name} className="px-3 py-1 rounded-full text-[12px] font-semibold border" style={{ color: ink, borderColor: vars.g300, background: "white" }}>{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* INSIGHTS - image-led blog tiles */}
      <section className="py-20" style={{ background: paper }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
          <div className="flex items-end justify-between flex-wrap gap-4 mb-10">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.28em]" style={{ color: vars.gold }}>Insights</span>
              <h2 className="text-4xl md:text-5xl mt-3" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Practical thinking on AI visibility.</h2>
            </div>
            <button onClick={() => onNavigate("insights")} className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] hover:opacity-70" style={{ color: accent }}>
              All articles <ArrowRight size={14} />
            </button>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { img: blogTile1, tag: "Guide", title: "The B2B Marketer's Fast Guide to Winning AI Authority in 2026", excerpt: "What is AIO? And is PR really the new SEO?", url: "https://simpaticopraiauthorityguide.carrd.co/", external: true, accent: vars.teal },
              { img: blogTile2, tag: "Article", title: "Why earned media beats paid in the AI era", excerpt: "How AI engines weigh third-party validation.", url: "#", external: false, accent: accent },
              { img: blogTile3, tag: "Playbook", title: "From SEO to AIO: a transition playbook", excerpt: "How to evolve your existing SEO programme.", url: "#", external: false, accent: vars.gold },
            ].map((a) => (
              <a key={a.title} href={a.url} {...(a.external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="group block bg-white rounded-2xl overflow-hidden transition-transform hover:-translate-y-1" style={{ border: `1px solid ${vars.g200}`, boxShadow: "0 4px 14px -6px rgba(0,0,0,0.08)" }}>
                <div className="aspect-[16/10] overflow-hidden" style={{ background: a.accent }}>
                  <img src={a.img} alt="" aria-hidden="true" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="p-5">
                  <span className="inline-block text-[10px] font-bold uppercase tracking-[0.16em] mb-2 px-2 py-1 rounded" style={{ background: `${a.accent}18`, color: a.accent }}>{a.tag}</span>
                  <h3 className="text-[18px] mb-2 leading-snug" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>{a.title}</h3>
                  <p className="text-[13px] font-light leading-[1.7]" style={{ color: vars.g600 }}>{a.excerpt}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* MADE BY COMMS - warm colour-blocked panel */}
      <section className="py-20" style={{ background: accentSoft }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-8">
          <div className="grid md:grid-cols-12 gap-10 items-center">
            <div className="md:col-span-5">
              <div className="aspect-square rounded-2xl overflow-hidden relative" style={{ background: `linear-gradient(135deg, ${accent} 0%, ${accentDark} 100%)`, boxShadow: "0 30px 60px -20px rgba(200,73,122,0.4)" }}>
                <div className="absolute -top-8 -right-8 w-44 h-44 rounded-full" style={{ background: vars.gold, opacity: 0.4 }} />
                <div className="absolute -bottom-10 -left-10 w-52 h-52 rounded-full" style={{ background: vars.teal, opacity: 0.3 }} />
                <div className="absolute inset-0 flex items-center justify-center p-12">
                  <img src={`${import.meta.env.BASE_URL}images/logo-white-notagline.png`} alt="AIO Fusion" className="w-full max-w-[200px]" />
                </div>
              </div>
            </div>
            <div className="md:col-span-7">
              <span className="text-[10px] font-bold uppercase tracking-[0.28em]" style={{ color: accent }}>Made by Comms Experts</span>
              <p className="text-2xl md:text-3xl mt-3 mb-5 leading-[1.3]" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>
                "An AIO platform built by comms professionals. We believe it will transform PR and marketing for good."
              </p>
              <div className="space-y-3 text-[14.5px] font-light leading-[1.75]" style={{ color: vars.g600 }}>
                <p>AIO Fusion was created by experts from the PR, business marketing and tech development worlds.</p>
                <p>We've worked in agencies and we understand the pressures in-house PR and marketing professionals face every day - designed to help you maximise the potential of your expertise and deliver measurable results.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA - raspberry → gold gradient (not navy) */}
      <section className="py-20 sm:py-24 relative overflow-hidden" style={{ background: `linear-gradient(120deg, ${accent} 0%, ${accentDark} 60%, ${vars.gold} 130%)`, color: "white" }}>
        <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full opacity-20" style={{ background: vars.cream }} />
        <div className="absolute -bottom-32 -left-20 w-96 h-96 rounded-full opacity-15" style={{ background: vars.teal }} />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-8">
          <div className="grid md:grid-cols-12 gap-8 items-center">
            <div className="md:col-span-7">
              <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/80">Get started</span>
              <h2 className="text-4xl md:text-6xl mt-3 mb-5" style={{ fontFamily: "'Alice', Georgia, serif" }}>Ready to win AI authority?</h2>
              <p className="text-[15px] leading-relaxed font-light text-white/85 max-w-md">Get in touch to book a platform demo and find out about pricing.</p>
            </div>
            <div className="md:col-span-5 flex flex-col gap-3">
              <a href="mailto:info@aiofusion.ai?subject=Book%20a%20Demo%20-%20AIO%20Fusion" className="flex items-center justify-between gap-2.5 px-6 py-4 rounded-full text-[13px] font-bold uppercase tracking-[0.14em] transition-all hover:opacity-90" style={{ background: "white", color: accent }}>
                <span className="flex items-center gap-2"><Calendar size={16} /> Book a Demo</span> <ArrowRight size={14} />
              </a>
              <a href="mailto:info@aiofusion.ai" className="flex items-center justify-between gap-2.5 px-6 py-4 rounded-full text-[13px] font-bold uppercase tracking-[0.14em] transition-all hover:bg-white/10 text-white" style={{ border: "1.5px solid rgba(255,255,255,0.55)" }}>
                <span className="flex items-center gap-2"><Mail size={16} /> Talk to Us</span> <ArrowRight size={14} />
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="py-10" style={{ background: paper, borderTop: `1px solid ${vars.g200}` }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-5">
            <img src={`${import.meta.env.BASE_URL}images/logo-color.png`} alt="AIO Fusion" className="h-14" />
            <div className="flex items-center gap-6 text-[12px] font-semibold uppercase tracking-[0.12em] flex-wrap justify-center" style={{ color: vars.g500 }}>
              <a href="#features" className="hover:opacity-60">Features</a>
              <button onClick={() => onNavigate("for-inhouse")} className="hover:opacity-60">For In-house</button>
              <button onClick={() => onNavigate("for-agencies")} className="hover:opacity-60">For PR Agencies</button>
              <button onClick={() => onNavigate("insights")} className="hover:opacity-60">Insights</button>
              <button onClick={() => onNavigate("contact")} className="hover:opacity-60">Contact</button>
              <button onClick={() => onNavigate("about")} className="hover:opacity-60">About</button>
              <button onClick={() => onNavigate("trust-security")} className="hover:opacity-60">Trust &amp; Security</button>
              <button onClick={() => onNavigate("privacy-policy")} className="hover:opacity-60">Privacy Policy</button>
              <button onClick={() => onNavigate("terms-conditions")} className="hover:opacity-60">Terms &amp; Conditions</button>
            </div>
            <p className="text-[11px] font-light" style={{ color: vars.g400 }}>&copy; AIO Fusion 2026</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
