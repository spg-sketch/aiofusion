import { useState, useRef, useCallback, useEffect } from "react";
import {
  ChevronRight, Lock, BarChart3, ArrowLeft, Upload, Clock, Menu, X,
  FileEdit, Search, Globe, CalendarDays, PenTool, Wand2, Archive as ArchiveIcon,
  Users, Database, TrendingUp, PieChart,
} from "lucide-react";
import { vars } from "../marketing/vars";
import { loadSavedAudits } from "../LlmCheckPage";
import { loadSavedDiagnostics, loadSavedScored, contentGeoKey, techGeoKey } from "../lib/diagnosticStore";
import type { Client, NavItem, NavSection } from "../types";

export const navSections: NavSection[] = [
  {
    section: "Project Set-Up",
    color: "#DE7A38",
    items: [
      { label: "Project Set-Up", id: "intake", sub: "Capture business profile and messaging" },
    ],
  },
  {
    section: "Visibility Audits",
    color: "#DCA1A1",
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
    color: "#84AB7D",
    items: [
      { label: "Media Research", id: "media-research", sub: "Recommend journalists and publications" },
      { label: "Media Database", id: "media-database", sub: "Publications, journalists and custom categories" },
    ],
  },
  {
    section: "Marketing Intelligence",
    color: "#736EAE",
    items: [
      { label: "Marketing Intelligence", id: "marketing-intel", sub: "Recommend events and awards" },
    ],
  },
  {
    section: "Reporting",
    color: "#A0A095",
    items: [
      { label: "Measure & Report", id: "measure", sub: "Track AI authority and PR impact" },
    ],
  },
];

// A slightly stronger tint used for the card border and dividers, layered
// over the very pale card background, so each section reads as its own
// soft, grouped block rather than a plain list.
const DASHBOARD_COLOR = vars.navy;

export const navItems: NavItem[] = navSections.flatMap((s) => s.items);

const ITEM_ICONS: Record<string, typeof BarChart3> = {
  intake: FileEdit,
  "llm-check": Search,
  diagnostic: Globe,
  planner: CalendarDays,
  creator: PenTool,
  optimiser: Wand2,
  archive: ArchiveIcon,
  "media-research": Users,
  "media-database": Database,
  "marketing-intel": TrendingUp,
  measure: PieChart,
};

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
      <div className="flex flex-col gap-1 px-6 py-6 border-b" style={{ borderColor: vars.g200 }}>
        <img src={`${import.meta.env.BASE_URL}images/logo-color.png`} alt="AIO Fusion" className="h-20 object-contain self-start" />
        <span className="text-[13px] font-semibold tracking-wide mt-1" style={{ color: vars.g400 }}>The AI Authority Platform</span>
      </div>
      <div className="flex items-stretch border-b" style={{ borderColor: vars.g200 }}>
        <button
          onClick={onBackToClients}
          className="flex items-center gap-4 px-5 py-5 text-left transition-colors hover:bg-black/5 flex-1 min-w-0"
        >
          <ArrowLeft size={16} style={{ color: vars.g400 }} />
          <div className="relative group/sblogo flex-shrink-0">
            {activeClient.logo ? (
              <div className="w-10 h-10 rounded-lg overflow-hidden border flex items-center justify-center" style={{ borderColor: vars.g200, background: "white" }}>
                <img src={activeClient.logo} alt={activeClient.name} className="w-full h-full object-contain p-0.5" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-[12px] font-bold text-white shadow-sm" style={{ background: activeClient.color }}>
                {activeClient.initials}
              </div>
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[15px] font-semibold truncate" style={{ color: vars.navy }}>{activeClient.name}</span>
            <span className="text-[12px] font-medium truncate" style={{ color: vars.g400 }}>Switch project</span>
          </div>
        </button>
        {onLogoUpdate && (
          <button
            onClick={handleLogoUpload}
            className="px-4 border-l flex items-center justify-center transition-colors hover:bg-black/5"
            style={{ borderColor: vars.g200, color: vars.teal }}
            title={activeClient.logo ? "Replace client logo" : "Upload client logo"}
          >
            <Upload size={16} />
          </button>
        )}
      </div>
      <nav className="flex-1 py-6 px-4 space-y-4 overflow-y-auto">
        <div
          className="rounded-[20px] p-2"
          style={{
            background: DASHBOARD_COLOR,
          }}
        >
          <button
            onClick={() => { onNavigate("dashboard"); onItemClick?.(); }}
            className="flex items-center gap-3 w-full rounded-2xl px-3 py-3 text-[14px] font-bold transition-all"
            style={{
              background: currentPage === "dashboard" ? "rgba(255,255,255,0.16)" : "transparent",
              color: "#ffffff",
              border: `1px solid ${currentPage === "dashboard" ? "rgba(255,255,255,0.35)" : "transparent"}`,
            }}
          >
            <span
              className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                background: "rgba(255,255,255,0.18)",
                color: "#ffffff",
              }}
            >
              <BarChart3 size={18} />
            </span>
            <span className="flex-1 text-left">Dashboard</span>
            {currentPage === "dashboard" && <ChevronRight size={16} />}
          </button>
        </div>
        {navSections.map((section) => (
          <div
            key={section.section}
            className="rounded-[20px] p-3.5"
            style={{
              background: `${section.color}0F`,
              border: `1px solid ${section.color}2E`,
            }}
          >
            <div className="px-1.5 pb-2.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: section.color }}>
                {section.section}
              </span>
            </div>
            <div>
              {section.items.map((item, idx) => {
                const isActive = currentPage === item.id;
                const isLocked = !!item.locked;
                return (
                  <div key={item.id}>
                  {idx > 0 && (
                    <div className="mx-1.5 h-px" style={{ background: `${section.color}22` }} />
                  )}
                  <button
                    onClick={() => { if (!isLocked) { onNavigate(item.id); onItemClick?.(); } }}
                    disabled={isLocked}
                    aria-disabled={isLocked}
                    title={isLocked ? `${item.label} is coming in V2` : undefined}
                    className="flex items-start gap-3 w-full rounded-2xl px-2.5 py-3 text-left transition-all"
                    style={{
                      background: isActive ? `${section.color}22` : "transparent",
                      border: `1px solid ${isActive ? `${section.color}40` : "transparent"}`,
                      color: isActive ? section.color : isLocked ? vars.g300 : vars.navy,
                      cursor: isLocked ? "not-allowed" : "pointer",
                      opacity: isLocked ? 0.6 : 1,
                    }}
                  >
                    {ITEM_ICONS[item.id] && (() => {
                      const Icon = ITEM_ICONS[item.id];
                      return (
                        <span
                          className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{
                            background: isActive ? `${section.color}30` : `${section.color}20`,
                            color: isLocked ? vars.g300 : section.color,
                          }}
                        >
                          <Icon size={18} />
                        </span>
                      );
                    })()}
                    <div className="flex-1 min-w-0 pt-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold truncate" style={{ color: isActive ? section.color : vars.navy }}>{item.label}</span>
                        {isLocked && (
                          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: vars.g100, color: vars.g400 }}>
                            <Lock size={10} /> V2
                          </span>
                        )}
                      </div>
                      {item.sub && (
                        <div className="text-[12px] font-medium leading-snug mt-1" style={{ color: vars.g500 }}>
                          {item.sub}
                        </div>
                      )}
                    </div>
                    {isActive && <ChevronRight size={16} className="mt-1.5 flex-shrink-0" style={{ color: section.color }} />}
                  </button>
                  {item.id === "llm-check" && recentAudits.length > 0 && (
                    <div className="mt-1 mb-2 ml-4 pl-3 border-l space-y-1" style={{ borderColor: vars.g200 }}>
                      {recentAudits.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => { onOpenSavedAudit?.(a.id); onItemClick?.(); }}
                          className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-black/5"
                          title={`Open saved audit (${a.result.visibilityScore}% visibility)`}
                        >
                          <Clock size={12} style={{ color: vars.g400 }} className="flex-shrink-0" />
                          <span className="text-[11px] font-medium truncate flex-1" style={{ color: vars.g500 }}>
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
                    <div className="mt-1 mb-2 ml-4 pl-3 border-l space-y-1" style={{ borderColor: vars.g200 }}>
                      {recentDiagnostics.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => { onOpenSavedDiagnostic?.(d.id); onItemClick?.(); }}
                          className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-black/5"
                          title={`Open saved audit (${d.result.overallScore}% readiness)`}
                        >
                          <Clock size={12} style={{ color: vars.g400 }} className="flex-shrink-0" />
                          <span className="text-[11px] font-medium truncate flex-1" style={{ color: vars.g500 }}>
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
                    <div className="mt-1 mb-2 ml-4 pl-3 border-l space-y-1" style={{ borderColor: vars.g200 }}>
                      {recentContentGeo.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => { onOpenSavedContentGeo?.(s.id); onItemClick?.(); }}
                          className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-black/5"
                          title={`Open saved audit (${s.score}% readiness)`}
                        >
                          <Clock size={12} style={{ color: vars.g400 }} className="flex-shrink-0" />
                          <span className="text-[11px] font-medium truncate flex-1" style={{ color: vars.g500 }}>
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
                    <div className="mt-1 mb-2 ml-4 pl-3 border-l space-y-1" style={{ borderColor: vars.g200 }}>
                      {recentTechGeo.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => { onOpenSavedTechGeo?.(s.id); onItemClick?.(); }}
                          className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-black/5"
                          title={`Open saved audit (${s.score}% readiness)`}
                        >
                          <Clock size={12} style={{ color: vars.g400 }} className="flex-shrink-0" />
                          <span className="text-[11px] font-medium truncate flex-1" style={{ color: vars.g500 }}>
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
      <div className="px-4 py-5 border-t" style={{ borderColor: vars.g200 }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: "linear-gradient(135deg, #4f8fff, #7c5cff)" }}>
              SP
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold" style={{ color: vars.navy }}>Admin</span>
              <span className="text-[12px] font-medium" style={{ color: vars.g400 }}>Intelligence Tier</span>
            </div>
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
  const [width, setWidth] = useState<number>(() => {
    const saved = localStorage.getItem("aio:sidebar-width");
    return saved ? Math.max(220, Math.min(520, Number(saved))) : 280;
  });
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return;
    const next = Math.max(220, Math.min(520, startWidth.current + (e.clientX - startX.current)));
    setWidth(next);
  }, []);

  const onMouseUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    localStorage.setItem("aio:sidebar-width", String(startWidth.current + 0));
    setWidth((w) => { localStorage.setItem("aio:sidebar-width", String(w)); return w; });
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  }, [onMouseMove]);

  const onDragHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [width, onMouseMove, onMouseUp]);

  useEffect(() => () => {
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  }, [onMouseMove, onMouseUp]);

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

      <aside
        className="hidden md:flex flex-col border-r flex-shrink-0 h-screen sticky top-0 relative"
        style={{ width: `${width}px`, borderColor: vars.g200, background: "white" }}
      >
        <SidebarContent currentPage={currentPage} onNavigate={onNavigate} activeClient={activeClient} onBackToClients={onBackToClients} onLogoUpdate={onLogoUpdate} onOpenSavedAudit={onOpenSavedAudit} onOpenSavedDiagnostic={onOpenSavedDiagnostic} onOpenSavedContentGeo={onOpenSavedContentGeo} onOpenSavedTechGeo={onOpenSavedTechGeo} />
        {/* Drag handle */}
        <div
          onMouseDown={onDragHandleMouseDown}
          className="absolute top-0 right-0 w-1.5 h-full z-10 cursor-col-resize group"
          title="Drag to resize"
        >
          <div className="absolute top-0 right-0 w-1 h-full opacity-0 group-hover:opacity-100 transition-opacity duration-150 rounded-full" style={{ background: "rgba(79,143,255,0.5)" }} />
        </div>
      </aside>
    </>
  );
}
