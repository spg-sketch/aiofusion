import { useState } from "react";
import {
  ChevronRight, ChevronLeft, Lock, BarChart3, ArrowLeft, Upload, Clock, Menu, X, ChevronsRight,
} from "lucide-react";
import { vars } from "../marketing/vars";
import { loadSavedAudits } from "../LlmCheckPage";
import { loadSavedDiagnostics, loadSavedScored, contentGeoKey, techGeoKey } from "../lib/diagnosticStore";
import type { Client, NavItem, NavSection } from "../types";

export const navSections: NavSection[] = [
  {
    section: "Project Set-Up",
    color: "#4f8fff",
    items: [
      { label: "Project Set-Up", id: "intake", sub: "Capture business profile and messaging" },
    ],
  },
  {
    section: "Visibility Audits",
    color: "#4f8fff",
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
  wide,
  onToggleWide,
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
  wide?: boolean;
  onToggleWide?: () => void;
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
      <div className="flex flex-col gap-1 px-6 py-6 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <img src={`${import.meta.env.BASE_URL}images/logo-white.png`} alt="AIO Fusion" className="h-20 object-contain self-start" />
        <span className="text-[13px] font-semibold tracking-wide mt-1" style={{ color: "#94a3b8" }}>The AI Authority Platform</span>
      </div>
      <div className="flex items-stretch border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <button
          onClick={onBackToClients}
          className="flex items-center gap-4 px-5 py-5 text-left transition-colors hover:bg-white/5 flex-1 min-w-0"
        >
          <ArrowLeft size={16} style={{ color: "#94a3b8" }} />
          <div className="relative group/sblogo flex-shrink-0">
            {activeClient.logo ? (
              <div className="w-10 h-10 rounded-lg overflow-hidden border flex items-center justify-center" style={{ borderColor: "rgba(255,255,255,0.1)", background: "white" }}>
                <img src={activeClient.logo} alt={activeClient.name} className="w-full h-full object-contain p-0.5" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-[12px] font-bold text-white shadow-sm" style={{ background: activeClient.color }}>
                {activeClient.initials}
              </div>
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[15px] font-semibold truncate text-white">{activeClient.name}</span>
            <span className="text-[12px] font-medium truncate" style={{ color: "#94a3b8" }}>Switch project</span>
          </div>
        </button>
        {onLogoUpdate && (
          <button
            onClick={handleLogoUpload}
            className="px-4 border-l flex items-center justify-center transition-colors hover:bg-white/5"
            style={{ borderColor: "rgba(255,255,255,0.08)", color: vars.teal }}
            title={activeClient.logo ? "Replace client logo" : "Upload client logo"}
          >
            <Upload size={16} />
          </button>
        )}
      </div>
      <nav className="flex-1 py-4 px-3 space-y-5 overflow-y-auto">
        <button
          onClick={() => { onNavigate("dashboard"); onItemClick?.(); }}
          className="flex items-center gap-3 w-full rounded-xl px-4 py-3.5 text-[14px] font-bold transition-all hover:bg-white/5"
          style={{
            background: currentPage === "dashboard" ? "rgba(79,143,255,0.15)" : "transparent",
            color: currentPage === "dashboard" ? vars.teal : "white",
            border: `1px solid ${currentPage === "dashboard" ? "rgba(79,143,255,0.3)" : "transparent"}`,
          }}
        >
          <BarChart3 size={18} />
          <span className="flex-1 text-left">Dashboard</span>
          {currentPage === "dashboard" && <ChevronRight size={16} />}
        </button>
        {navSections.map((section) => (
          <div key={section.section}>
            <div className="px-3 pb-3 flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: section.color }} />
              <span className="text-[12px] font-bold uppercase tracking-[0.14em]" style={{ color: section.color }}>
                {section.section}
              </span>
            </div>
            <div className="space-y-1">
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
                    className="flex items-start gap-3 w-full rounded-xl px-3 py-2.5 text-left transition-all hover:bg-white/5"
                    style={{
                      background: isActive ? "rgba(79,143,255,0.15)" : "transparent",
                      borderLeft: `3px solid ${isActive ? vars.teal : "transparent"}`,
                      color: isActive ? vars.teal : isLocked ? "#64748b" : "#e2e8f0",
                      cursor: isLocked ? "not-allowed" : "pointer",
                      opacity: isLocked ? 0.6 : 1,
                    }}
                  >
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold truncate">{item.label}</span>
                        {isLocked && (
                          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/10 text-white/50">
                            <Lock size={10} /> V2
                          </span>
                        )}
                      </div>
                      {item.sub && (
                        <div className="text-[12px] font-medium leading-snug mt-1" style={{ color: isActive ? "rgba(79,143,255,0.8)" : "#94a3b8" }}>
                          {item.sub}
                        </div>
                      )}
                    </div>
                    {isActive && <ChevronRight size={16} className="mt-1 flex-shrink-0" />}
                  </button>
                  {item.id === "llm-check" && recentAudits.length > 0 && (
                    <div className="mt-1 mb-2 ml-4 pl-3 border-l space-y-1" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
                      {recentAudits.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => { onOpenSavedAudit?.(a.id); onItemClick?.(); }}
                          className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/10"
                          title={`Open saved audit (${a.result.visibilityScore}% visibility)`}
                        >
                          <Clock size={12} style={{ color: "#94a3b8" }} className="flex-shrink-0" />
                          <span className="text-[11px] font-medium truncate flex-1" style={{ color: "#cbd5e1" }}>
                            {new Date(a.savedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, {new Date(a.savedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="text-[11px] font-bold flex-shrink-0" style={{ color: vars.teal }}>
                            {a.result.visibilityScore}%
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {item.id === "diagnostic" && recentDiagnostics.length > 0 && (
                    <div className="mt-1 mb-2 ml-4 pl-3 border-l space-y-1" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
                      {recentDiagnostics.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => { onOpenSavedDiagnostic?.(d.id); onItemClick?.(); }}
                          className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/10"
                          title={`Open saved audit (${d.result.overallScore}% readiness)`}
                        >
                          <Clock size={12} style={{ color: "#94a3b8" }} className="flex-shrink-0" />
                          <span className="text-[11px] font-medium truncate flex-1" style={{ color: "#cbd5e1" }}>
                            {new Date(d.savedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, {new Date(d.savedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="text-[11px] font-bold flex-shrink-0" style={{ color: vars.teal }}>
                            {d.result.overallScore}%
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {item.id === "geo-content" && recentContentGeo.length > 0 && (
                    <div className="mt-1 mb-2 ml-4 pl-3 border-l space-y-1" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
                      {recentContentGeo.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => { onOpenSavedContentGeo?.(s.id); onItemClick?.(); }}
                          className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/10"
                          title={`Open saved audit (${s.score}% readiness)`}
                        >
                          <Clock size={12} style={{ color: "#94a3b8" }} className="flex-shrink-0" />
                          <span className="text-[11px] font-medium truncate flex-1" style={{ color: "#cbd5e1" }}>
                            {new Date(s.savedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, {new Date(s.savedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="text-[11px] font-bold flex-shrink-0" style={{ color: vars.teal }}>
                            {s.score}%
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {item.id === "seo-audit" && recentTechGeo.length > 0 && (
                    <div className="mt-1 mb-2 ml-4 pl-3 border-l space-y-1" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
                      {recentTechGeo.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => { onOpenSavedTechGeo?.(s.id); onItemClick?.(); }}
                          className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/10"
                          title={`Open saved audit (${s.score}% readiness)`}
                        >
                          <Clock size={12} style={{ color: "#94a3b8" }} className="flex-shrink-0" />
                          <span className="text-[11px] font-medium truncate flex-1" style={{ color: "#cbd5e1" }}>
                            {new Date(s.savedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, {new Date(s.savedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="text-[11px] font-bold flex-shrink-0" style={{ color: vars.teal }}>
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
      <div className="px-4 py-5 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: "linear-gradient(135deg, #4f8fff, #7c5cff)" }}>
              SP
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-white">Admin</span>
              <span className="text-[12px] font-medium" style={{ color: "#94a3b8" }}>Intelligence Tier</span>
            </div>
          </div>
          {onToggleWide && (
            <button
              onClick={onToggleWide}
              title={wide ? "Collapse sidebar" : "Expand sidebar"}
              className="p-2 rounded-lg transition-colors hover:bg-white/10 flex-shrink-0"
              style={{ color: "#64748b" }}
            >
              {wide ? <ChevronLeft size={16} /> : <ChevronsRight size={16} />}
            </button>
          )}
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
  const [wide, setWide] = useState(false);

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
          <div className="relative w-[280px] h-full flex flex-col" style={{ background: vars.navy }} onClick={(e) => e.stopPropagation()}>
            <SidebarContent currentPage={currentPage} onNavigate={onNavigate} activeClient={activeClient} onBackToClients={onBackToClients} onItemClick={() => setMobileOpen(false)} onLogoUpdate={onLogoUpdate} onOpenSavedAudit={onOpenSavedAudit} onOpenSavedDiagnostic={onOpenSavedDiagnostic} onOpenSavedContentGeo={onOpenSavedContentGeo} onOpenSavedTechGeo={onOpenSavedTechGeo} />
          </div>
        </div>
      )}

      <aside
        className="hidden md:flex flex-col border-r flex-shrink-0 h-screen sticky top-0 transition-all duration-300"
        style={{ width: wide ? "340px" : "260px", borderColor: "rgba(255,255,255,0.08)", background: vars.navy }}
      >
        <SidebarContent currentPage={currentPage} onNavigate={onNavigate} activeClient={activeClient} onBackToClients={onBackToClients} onLogoUpdate={onLogoUpdate} onOpenSavedAudit={onOpenSavedAudit} onOpenSavedDiagnostic={onOpenSavedDiagnostic} onOpenSavedContentGeo={onOpenSavedContentGeo} onOpenSavedTechGeo={onOpenSavedTechGeo} wide={wide} onToggleWide={() => setWide((w) => !w)} />
      </aside>
    </>
  );
}
