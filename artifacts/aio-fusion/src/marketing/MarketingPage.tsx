import { User, LogIn } from "lucide-react";

export default function MarketingPage({ title, eyebrow, children, onLogin, onBack, onNavigate, isAuthed }: { title: string; eyebrow?: any; children: any; onLogin: () => void; onBack: () => void; onNavigate: (v: string) => void; dark?: boolean; isAuthed?: boolean }) {
  const cream = "#FBF6EC";
  const ink = "#102B36";
  const raspberry = "#C8497A";
  const accentSoft = "#FBE3ED";
  return (
    <div className="font-['Inter',sans-serif] min-h-screen" style={{ background: cream, color: ink }}>
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md" style={{ background: "rgba(251,246,236,0.92)", borderBottom: `1px solid rgba(16,43,54,0.08)` }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-[72px] sm:h-[96px] flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}images/logo-color.png`} alt="AIO Fusion" className="h-14 sm:h-20" />
          </button>
          <div className="hidden md:flex items-center gap-8">
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
              <button
                key={it.l}
                onClick={() => onNavigate(it.v)}
                className="marketing-nav-link text-[13px] font-semibold uppercase tracking-[0.14em] transition-colors"
              >
                {it.l}
              </button>
            ))}
            <button onClick={onLogin} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold text-white transition-all hover:brightness-110" style={{ background: ink }}>
              {isAuthed ? <><User size={14} /> My Account</> : <><LogIn size={14} /> Platform Login</>}
            </button>
          </div>
        </div>
      </nav>
      <section className="pt-[120px] sm:pt-[160px] pb-0 px-4 sm:px-8" style={{ background: cream }}>
        <div className="max-w-4xl mx-auto">
          {eyebrow && (
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.2em] mb-5" style={{ background: accentSoft, color: raspberry }}>
              {eyebrow}
            </div>
          )}
          <h1 className="text-4xl md:text-5xl mb-0 leading-[1.1]" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>{title}</h1>
        </div>
      </section>
      <section className="pt-6 sm:pt-8 pb-12 sm:pb-16 px-4 sm:px-8" style={{ background: cream }}>
        <div className="max-w-4xl mx-auto">{children}</div>
      </section>
      <footer className="py-10 border-t" style={{ background: cream, borderColor: "rgba(16,43,54,0.1)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-[12px] font-light" style={{ color: "rgba(16,43,54,0.5)" }}>&copy; AIO Fusion. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <button onClick={() => onNavigate("trust-security")} className="text-[12px] font-light hover:underline" style={{ color: "rgba(16,43,54,0.7)" }}>Trust &amp; Security</button>
            <button onClick={() => onNavigate("privacy-policy")} className="text-[12px] font-light hover:underline" style={{ color: "rgba(16,43,54,0.7)" }}>Privacy Policy</button>
            <button onClick={() => onNavigate("terms-conditions")} className="text-[12px] font-light hover:underline" style={{ color: "rgba(16,43,54,0.7)" }}>Terms &amp; Conditions</button>
            <a href="mailto:info@aiofusion.ai" className="text-[12px] font-light hover:underline" style={{ color: "rgba(16,43,54,0.7)" }}>info@aiofusion.ai</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
