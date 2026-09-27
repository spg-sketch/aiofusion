import { useState } from "react";
import { User, LogIn, X, Menu } from "lucide-react";

const links = [
  ["Home", "landing"], ["Features", "landing#features"],
  ["For In-house", "for-inhouse"], ["For PR Agencies", "for-agencies"],
  ["Pricing", "pricing"], ["Insights", "insights"],
  ["Contact", "contact"], ["About", "about"],
];

export default function MarketingNav({ onNavigate, onLogin, isAuthed, offset = 0 }: {
  onNavigate: (view: string) => void; onLogin: () => void; isAuthed?: boolean; offset?: number;
}) {
  const [open, setOpen] = useState(false);
  const base = import.meta.env.BASE_URL;
  return (
    <nav aria-label="Main navigation" className="fixed left-0 right-0 z-50 shadow-sm" style={{ top: offset, background: "#1A647B" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-8 h-[72px] sm:h-[88px] flex items-center justify-between gap-4">
        <a href={base} onClick={(e) => { e.preventDefault(); onNavigate("landing"); }} aria-label="AIO Fusion home">
          <img src={`${base}images/logo-white-notagline.png`} alt="AIO Fusion" className="h-14 sm:h-[72px] w-auto object-contain" />
        </a>
        <div className="hidden xl:flex items-center gap-5">
          {links.map(([label, view]) => (
            <a key={view} href={view === "landing" ? base : view === "landing#features" ? `${base}#features` : `${base}${view}`}
              onClick={(e) => { e.preventDefault(); onNavigate(view); }}
              className="marketing-nav-link text-[11px] font-bold uppercase tracking-[0.1em] transition-colors">{label}</a>
          ))}
          <button type="button" onClick={onLogin} className="aio-button aio-button--primary !rounded-lg text-[11px] uppercase tracking-[0.1em] whitespace-nowrap">
            {isAuthed ? <><User size={14} /> My Account</> : <><LogIn size={14} /> Platform Login</>}
          </button>
        </div>
        <button type="button" className="xl:hidden text-white p-2" onClick={() => setOpen(!open)}
          aria-expanded={open} aria-controls="marketing-mobile-menu" aria-label={open ? "Close menu" : "Open menu"}>
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>
      {open && <div id="marketing-mobile-menu" className="xl:hidden px-4 sm:px-8 pb-5 flex flex-col max-h-[calc(100vh-110px)] overflow-y-auto border-t border-white/20">
        {links.map(([label, view]) => <a key={view} href={view === "landing" ? base : view === "landing#features" ? `${base}#features` : `${base}${view}`}
          onClick={(e) => { e.preventDefault(); setOpen(false); onNavigate(view); }}
          className="marketing-nav-link py-2 text-[12px] font-bold uppercase tracking-wide">{label}</a>)}
        <button type="button" onClick={() => { setOpen(false); onLogin(); }} className="aio-button aio-button--primary self-start uppercase tracking-wide">
          {isAuthed ? "My Account" : "Platform Login"}
        </button>
      </div>}
    </nav>
  );
}