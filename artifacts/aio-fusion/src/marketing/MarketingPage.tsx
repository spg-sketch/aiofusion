import MarketingNav from "./MarketingNav";

export default function MarketingPage({
  title,
  eyebrow,
  children,
  onLogin,
  onBack,
  onNavigate,
  isAuthed,
  showTitle = true,
}: {
  title: string;
  eyebrow?: React.ReactNode;
  children: React.ReactNode;
  onLogin: () => void;
  onBack: () => void;
  onNavigate: (v: string) => void;
  dark?: boolean;
  isAuthed?: boolean;
  showTitle?: boolean;
}) {
  const cream = "#F5F8F8";
  const ink = "#102B36";
  const raspberry = "#C8497A";
  const accentSoft = "#FBE3ED";
  const base = import.meta.env.BASE_URL;

  return (
    <div className="font-['Inter',sans-serif] min-h-screen" style={{ background: cream, color: ink }}>
      <MarketingNav onNavigate={onNavigate} onLogin={onLogin} isAuthed={isAuthed} />

      <section className="pt-[120px] sm:pt-[144px] pb-0 px-4 sm:px-8" style={{ background: cream }}>
        <div className="max-w-4xl mx-auto">
          {eyebrow && (
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.2em] mb-5"
              style={{ background: accentSoft, color: raspberry }}
            >
              {eyebrow}
            </div>
          )}
          {showTitle && (
            <h1
              className="text-4xl md:text-5xl mb-0 leading-[1.1]"
              style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}
            >
              {title}
            </h1>
          )}
        </div>
      </section>

      <section className="pt-6 sm:pt-8 pb-12 sm:pb-16 px-4 sm:px-8" style={{ background: cream }}>
        <div className="max-w-4xl mx-auto">{children}</div>
      </section>

      <footer style={{ background: cream, borderTop: "1px solid rgba(16,43,54,0.1)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-[12px] font-normal" style={{ color: "#334155" }}>
            &copy; AIO Fusion. All rights reserved.
          </p>
          <nav aria-label="Footer navigation" className="flex items-center gap-5 flex-wrap justify-center">
            <a
              href={`${base}trust-security`}
              onClick={(e) => { e.preventDefault(); onNavigate("trust-security"); }}
              className="text-[12px] font-normal hover:underline"
              style={{ color: "#334155" }}
            >
              Trust &amp; Security
            </a>
            <a
              href={`${base}journalist-privacy`}
              onClick={(e) => { e.preventDefault(); onNavigate("journalist-privacy"); }}
              className="text-[12px] font-normal hover:underline"
              style={{ color: "#334155" }}
            >
              Journalist privacy
            </a>
            <a
              href={`${base}privacy-policy`}
              onClick={(e) => { e.preventDefault(); onNavigate("privacy-policy"); }}
              className="text-[12px] font-normal hover:underline"
              style={{ color: "#334155" }}
            >
              Privacy Policy
            </a>
            <a
              href={`${base}terms-conditions`}
              onClick={(e) => { e.preventDefault(); onNavigate("terms-conditions"); }}
              className="text-[12px] font-normal hover:underline"
              style={{ color: "#334155" }}
            >
              Terms &amp; Conditions
            </a>
            <a
              href="mailto:info@aiofusion.ai"
              className="text-[12px] font-normal hover:underline"
              style={{ color: "#334155" }}
            >
              info@aiofusion.ai
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

// React is needed for JSX
import React from "react";
