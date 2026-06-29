import { useState } from "react";
import {
  ChevronRight, Lock, BarChart3, ArrowLeft, Upload, Clock, Menu, X,
} from "lucide-react";
import { vars } from "../marketing/vars";
import { loadSavedAudits } from "../LlmCheckPage";
import { loadSavedDiagnostics, loadSavedScored, contentGeoKey, techGeoKey } from "../lib/diagnosticStore";
import type { Client, NavItem, NavSection } from "../types";

export const navSections: NavSection[] = [
  {
    section: "Project Set-Up",
    color: "#1f748f",
    items: [
      { label: "Project Set-Up", id: "intake", sub: "Capture business profile and messaging" },
    ],
  },
  {
    section: "Visibility Audits",
    color: "#1f748f",
    items: [
      { label: "Earned Media Visibility Audit", id: "llm-check", sub: "Score AI brand mentions" },
      { label: "Website Visibility Audit", id: "diagnostic", sub: "Score your site for AI citation" },
    ],
  },
  {
    section: "Content Management",
    color: "#D4922A",
    items: [
      { label: "Comms Planner", id: "planner", sub: "Plan and score the PR / marketing schedule" },
      { label: "Content Creator", id: "creator", sub: "Generate pitches and articles" },
      { label: "Content Optimiser & Editor", id: "optimiser", sub: "Optimise and edit drafts" },
      { label: "Archive", id: "archive", sub: "Searchable content library" },
    ],
  },
  {
    section: "Media Management",
    color: "#4A72AF",
    items: [
      { label: "Media Research", id: "media-research", sub: "Recommend journalists and publications" },
      { label: "Media Database", id: "media-database", sub: "Publications, journalists and custom categories" },
    ],
  },
  {
    section: "Marketing Intelligence",
    color: "#C9A04E",
    items: [
      { label: "Marketing Intelligence", id: "marketing-intel", sub: "Recommend events and awards" },
    ],
  },
  {
    section: "Reporting",
    color: "#3D9B6B",
    items: [
      { label: "Measure & Report", id: "measure", sub: "Track AI authority and PR impact" },
    ],
  },
];

export const navItems: NavItem[] = navSections.flatMap((s) => s.items);

function SidebarContent({
  currentPage,
  onNavigate,
  activeClient,
  onBackToClients,
  onItemClick,
  onLogoUpdate,
  onOpenSavedAudit,
  onOpenSavedDiagnostic,
  onOpenSavedContentGeo,
  onOpenSavedTechGeo,
}: {
  currentPage: string;
  onNavigate: (p: string) => void;
  activeClient: Client;
  onBackToClients: () => void;
  onItemClick?: () => void;
  onLogoUpdate?: (clientId: string, dataUrl: string) => void;
  onOpenSavedAudit?: (id: string) => void;
  onOpenSavedDiagnostic?: (id: string) => void;
  onOpenSavedContentGeo?: (id: string) => void;
  onOpenSavedTechGeo?: (id: string) => void;
}) {
  const recentAudits = loadSavedAudits(activeClient.id).slice(0, 3);
  const recentDiagnostics = loadSavedDiagnostics(activeClient.id).slice(0, 3);
  const recentContentGeo = loadSavedScored(contentGeoKey(activeClient.id)).slice(0, 3);
  const recentTechGeo = loadSavedScored(techGeoKey(activeClient.id)).slice(0, 3);
  const handleLogoUpload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onLogoUpdate) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/svg+xml,image/webp";
    input.onchange = (ev) => {
      const file = (ev.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          onLogoUpdate(activeClient.id, reader.result);
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };
  return (
    <>
      <div className="flex items-center gap-3 px-6 py-6 border-b" style={{ borderColor: vars.g200 }}>
        <img src={`${import.meta.env.BASE_URL}images/logo-color.png`} alt="AIO Fusion" className="h-16 md:h-20" />
      </div>
      <div className="flex items-stretch border-b" style={{ borderColor: vars.g200 }}>
        <button
          onClick={onBackToClients}
          className="flex items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50 flex-1 min-w-0"
        >
          <ArrowLeft size={14} style={{ color: vars.g400 }} />
          <div className="relative group/sblogo flex-shrink-0">
            {activeClient.logo ? (
              <div className="w-8 h-8 rounded-lg overflow-hidden border flex items-center justify-center" style={{ borderColor: vars.g200, background: "white" }}>
                <img src={activeClient.logo} alt={activeClient.name} className="w-full h-full object-contain p-0.5" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-white" style={{ background: activeClient.color }}>
                {activeClient.initials}
              </div>
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[13px] font-medium truncate" style={{ color: vars.navy }}>{activeClient.name}</span>
            <span className="text-[11px] font-light truncate" style={{ color: vars.g400 }}>Switch project</span>
          </div>
        </button>
        {onLogoUpdate && (
          <button
            onClick={handleLogoUpload}
            className="px-3 border-l flex items-center justify-center transition-colors hover:bg-slate-50"
            style={{ borderColor: vars.g200, color: vars.accent }}
            title={activeClient.logo ? "Replace client logo" : "Upload client logo"}
          >
            <Upload size={14} />
          </button>
        )}
      </div>
      <nav className="flex-1 py-3 px-3 space-y-4 overflow-y-auto">
        <button
          onClick={() => { onNavigate("dashboard"); onItemClick?.(); }}
          className="flex items-center gap-2.5 w-full rounded-lg px-4 py-3 text-[14px] font-bold transition-colors"
          style={{
            background: currentPage === "dashboard" ? "rgba(31,116,143,0.08)" : "transparent",
            color: currentPage === "dashboard" ? vars.accent : vars.navy,
            border: `1px solid ${currentPage === "dashboard" ? vars.accent : vars.g200}`,
          }}
        >
          <BarChart3 size={16} />
          <span className="flex-1 text-left">Dashboard</span>
          {currentPage === "dashboard" && <ChevronRight size={14} />}
        </button>
        {navSections.map((section) => (
          <div key={section.section}>
            <div className="px-3 pb-2 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: section.color }} />
              <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: section.color }}>
                {section.section}
              </span>
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = currentPage === item.id;
                const isLocked = !!item.locked;
                return (
                  <div key={item.id}>
                  <button
                    onClick={() => { if (!isLocked) { onNavigate(item.id); onItemClick?.(); } }}
                    disabled={isLocked}
                    aria-disabled={isLocked}
                    title={isLocked ? `${item.label} is coming in V2` : undefined}
                    className="flex items-start gap-3 w-full rounded-lg px-3 py-2 text-left transition-colors"
                    style={{
                      background: isActive ? `${section.color}10` : "transparent",
                      borderLeft: `3px solid ${isActive ? section.color : "transparent"}`,
                      color: isActive ? section.color : isLocked ? vars.g400 : vars.g600,
                      cursor: isLocked ? "not-allowed" : "pointer",
                      opacity: isLocked ? 0.6 : 1,
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold truncate">{item.label}</span>
                        {isLocked && (
                          <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: vars.g100, color: vars.g500 }}>
                            <Lock size={9} /> V2
                          </span>
                        )}
                      </div>
                      {item.sub && (
                        <div className="text-[10.5px] font-light leading-snug mt-0.5" style={{ color: isActive ? section.color : vars.g400 }}>
                          {item.sub}
                        </div>
                      )}
                    </div>
                    {isActive && <ChevronRight size={14} className="mt-0.5 flex-shrink-0" />}
                  </button>
                  {item.id === "llm-check" && recentAudits.length > 0 && (
                    <div className="mt-0.5 mb-1 ml-4 pl-3 border-l space-y-0.5" style={{ borderColor: vars.g200 }}>
                      {recentAudits.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => { onOpenSavedAudit?.(a.id); onItemClick?.(); }}
                          className="flex items-center gap-1.5 w-full rounded-md px-2 py-1 text-left transition-colors hover:bg-slate-50"
                          title={`Open saved audit (${a.result.visibilityScore}% visibility)`}
                        >
                          <Clock size={10} style={{ color: vars.g400 }} className="flex-shrink-0" />
                          <span className="text-[10.5px] font-light truncate flex-1" style={{ color: vars.g500 }}>
                            {new Date(a.savedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, {new Date(a.savedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: vars.accent }}>
                            {a.result.visibilityScore}%
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {item.id === "diagnostic" && recentDiagnostics.length > 0 && (
                    <div className="mt-0.5 mb-1 ml-4 pl-3 border-l space-y-0.5" style={{ borderColor: vars.g200 }}>
                      {recentDiagnostics.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => { onOpenSavedDiagnostic?.(d.id); onItemClick?.(); }}
                          className="flex items-center gap-1.5 w-full rounded-md px-2 py-1 text-left transition-colors hover:bg-slate-50"
                          title={`Open saved audit (${d.result.overallScore}% readiness)`}
                        >
                          <Clock size={10} style={{ color: vars.g400 }} className="flex-shrink-0" />
                          <span className="text-[10.5px] font-light truncate flex-1" style={{ color: vars.g500 }}>
                            {new Date(d.savedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, {new Date(d.savedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: vars.accent }}>
                            {d.result.overallScore}%
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {item.id === "geo-content" && recentContentGeo.length > 0 && (
                    <div className="mt-0.5 mb-1 ml-4 pl-3 border-l space-y-0.5" style={{ borderColor: vars.g200 }}>
                      {recentContentGeo.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => { onOpenSavedContentGeo?.(s.id); onItemClick?.(); }}
                          className="flex items-center gap-1.5 w-full rounded-md px-2 py-1 text-left transition-colors hover:bg-slate-50"
                          title={`Open saved audit (${s.score}% readiness)`}
                        >
                          <Clock size={10} style={{ color: vars.g400 }} className="flex-shrink-0" />
                          <span className="text-[10.5px] font-light truncate flex-1" style={{ color: vars.g500 }}>
                            {new Date(s.savedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, {new Date(s.savedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: vars.accent }}>
                            {s.score}%
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {item.id === "seo-audit" && recentTechGeo.length > 0 && (
                    <div className="mt-0.5 mb-1 ml-4 pl-3 border-l space-y-0.5" style={{ borderColor: vars.g200 }}>
                      {recentTechGeo.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => { onOpenSavedTechGeo?.(s.id); onItemClick?.(); }}
                          className="flex items-center gap-1.5 w-full rounded-md px-2 py-1 text-left transition-colors hover:bg-slate-50"
                          title={`Open saved audit (${s.score}% readiness)`}
                        >
                          <Clock size={10} style={{ color: vars.g400 }} className="flex-shrink-0" />
                          <span className="text-[10.5px] font-light truncate flex-1" style={{ color: vars.g500 }}>
                            {new Date(s.savedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, {new Date(s.savedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: vars.accent }}>
                            {s.score}%
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="px-3 py-4 border-t" style={{ borderColor: vars.g200 }}>
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, #1f748f, #165265)" }}>
            SP
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium" style={{ color: vars.navy }}>Admin</span>
            <span className="text-[10px]" style={{ color: vars.g400 }}>Intelligence Tier</span>
          </div>
        </div>
      </div>
    </>
  );
}

export function Sidebar({
  currentPage,
  onNavigate,
  activeClient,
  onBackToClients,
  onLogoUpdate,
  onOpenSavedAudit,
  onOpenSavedDiagnostic,
  onOpenSavedContentGeo,
  onOpenSavedTechGeo,
}: {
  currentPage: string;
  onNavigate: (p: string) => void;
  activeClient: Client;
  onBackToClients: () => void;
  onLogoUpdate?: (clientId: string, dataUrl: string) => void;
  onOpenSavedAudit?: (id: string) => void;
  onOpenSavedDiagnostic?: (id: string) => void;
  onOpenSavedContentGeo?: (id: string) => void;
  onOpenSavedTechGeo?: (id: string) => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 border-b h-14" style={{ background: "white", borderColor: vars.g200 }}>
        <img src={`${import.meta.env.BASE_URL}images/logo-color.png`} alt="AIO Fusion" className="h-10" />
        <button onClick={() => setMobileOpen(!mobileOpen)} className="p-2 rounded-lg" style={{ color: vars.navy }}>
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 pt-14" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative w-[280px] h-full flex flex-col" style={{ background: "white" }} onClick={(e) => e.stopPropagation()}>
            <SidebarContent currentPage={currentPage} onNavigate={onNavigate} activeClient={activeClient} onBackToClients={onBackToClients} onItemClick={() => setMobileOpen(false)} onLogoUpdate={onLogoUpdate} onOpenSavedAudit={onOpenSavedAudit} onOpenSavedDiagnostic={onOpenSavedDiagnostic} onOpenSavedContentGeo={onOpenSavedContentGeo} onOpenSavedTechGeo={onOpenSavedTechGeo} />
          </div>
        </div>
      )}

      <aside className="hidden md:flex flex-col border-r w-[260px] flex-shrink-0 h-screen sticky top-0" style={{ borderColor: vars.g200, background: "white" }}>
        <SidebarContent currentPage={currentPage} onNavigate={onNavigate} activeClient={activeClient} onBackToClients={onBackToClients} onLogoUpdate={onLogoUpdate} onOpenSavedAudit={onOpenSavedAudit} onOpenSavedDiagnostic={onOpenSavedDiagnostic} onOpenSavedContentGeo={onOpenSavedContentGeo} onOpenSavedTechGeo={onOpenSavedTechGeo} />
      </aside>
    </>
  );
}
