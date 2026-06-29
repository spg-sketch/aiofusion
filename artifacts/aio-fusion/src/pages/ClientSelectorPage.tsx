import { useState } from "react";
import {
  ArrowLeft, Building2, Plus, Archive, BookOpen, ArrowRight,
  Trash2, TrendingUp, Activity, Zap, Upload,
} from "lucide-react";
import { vars } from "../marketing/vars";
import { useContentStore, loadArchive, loadPlannerProjects } from "../lib/contentStore";
import { loadCycle } from "../lib/cycles";
import { getProjectSectorLabel } from "../lib/projects";
import type { Client } from "../types";
import { MiniDonut } from "../components/MiniDonut";

export default function ClientSelectorPage({
  projects,
  onSelectClient,
  clientLogos,
  onLogoUpdate,
  onBackToPlatformHome,
  onCreateProject,
  onArchivedProjects,
  onGuidance,
  onDeleteProject,
  session,
  onGenerateFromUrl,
}: {
  projects: Client[];
  onSelectClient: (client: Client) => void;
  clientLogos: Record<string, string>;
  onLogoUpdate: (clientId: string, logoDataUrl: string) => void;
  onBackToPlatformHome: () => void;
  onCreateProject: () => void;
  onArchivedProjects: () => void;
  onGuidance: () => void;
  onDeleteProject: (id: string) => void;
  session?: { username: string; role: string } | null;
  onGenerateFromUrl?: () => void;
}) {
  useContentStore();
  const displayClients = projects;
  const isAdmin = session?.role === "admin";
  const isClient = session?.role === "client";

  const paper = "#FBF6EC";
  const ink = "#102B36";
  const accent = "#C8497A";
  const accentSoft = "#FBE3ED";

  return (
    <div className="min-h-screen font-['Inter',sans-serif]" style={{ background: paper, color: ink }}>
      <header
        className="px-4 sm:px-10 py-4 sm:py-6 flex items-center justify-between"
        style={{ background: paper, borderBottom: `1px solid ${vars.g200}` }}
      >
        <button onClick={onBackToPlatformHome} className="flex items-center gap-3.5">
          <img src={`${import.meta.env.BASE_URL}images/logo-color.png`} alt="AIO Fusion" className="h-16 sm:h-24" />
        </button>
        <div className="flex items-center gap-4">
          <button onClick={onBackToPlatformHome} className="text-[12px] font-medium flex items-center gap-1.5 hover:underline" style={{ color: vars.g500 }}>
            <ArrowLeft size={14} /> Platform home
          </button>
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ background: accent }}
          >
            SP
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] font-medium" style={{ color: ink }}>
              Admin
            </span>
            <span className="text-[11px] font-light" style={{ color: vars.g500 }}>
              Intelligence Tier
            </span>
          </div>
        </div>
      </header>
      <div className="px-4 sm:px-10 py-6 sm:py-10 max-w-6xl mx-auto">
        <div className="mb-6 sm:mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.22em]"
                style={{ background: accentSoft, border: `1px solid ${accent}40`, color: accent }}
              >
                <Building2 size={12} /> Project Hub
              </div>
            </div>
            <h1
              className="text-3xl sm:text-4xl lg:text-5xl leading-[1.05] tracking-tight"
              style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}
            >
              {isAdmin ? "Master" : isClient ? null : "Agency"}{isAdmin || !isClient ? " " : null}
              <span style={{ color: accent }}>Project Hub</span>
            </h1>
            <p className="text-[15px] sm:text-[16px] font-light mt-3 max-w-2xl leading-[1.7]" style={{ color: vars.g600 }}>
              {displayClients.length === 0
                ? "Set up your first project to start optimising your PR and marketing output for AI discoverability - or jump into archived work or platform guidance."
                : "Select a project to manage AI optimisation, on-going PR and marketing output."}
            </p>
            {!isAdmin && (
            <p className="text-[12px] mt-2" style={{ color: vars.g500 }}>
              {isClient ? "Client accounts have" : "Agency accounts can have"} up to 3 projects{isClient ? "" : " for your clients or yourself"} by default. For additional projects please contact{" "}
              <a href="mailto:info@aiofusions.ai" style={{ color: vars.g500, textDecoration: "underline" }}>info@aiofusions.ai</a>
            </p>
            )}
          </div>
        </div>

        <div className={`grid grid-cols-1 gap-3 sm:gap-4 mb-8 sm:mb-10 ${isClient ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
          {!isClient && (
          <button
            onClick={onCreateProject}
            className="group flex items-center gap-4 rounded-2xl p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg"
            style={{ background: accent, color: "white" }}
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.2)" }}>
              <Plus size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">Start a new piece of work</p>
              <p className="text-[16px] font-semibold mt-0.5" style={{ fontFamily: "'Alice', Georgia, serif" }}>Create Project</p>
              <p className="text-[12px] font-light mt-0.5 opacity-85">Walk through Project Set-Up.</p>
            </div>
            <ArrowRight size={16} className="opacity-70 group-hover:translate-x-1 transition-transform" />
          </button>
          )}
          <button
            onClick={onArchivedProjects}
            className="group flex items-center gap-4 rounded-2xl p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
            style={{ background: "white", border: `1px solid ${vars.g200}`, color: ink }}
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: accentSoft, color: accent }}>
              <Archive size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: vars.g500 }}>Past work</p>
              <p className="text-[16px] font-semibold mt-0.5" style={{ fontFamily: "'Alice', Georgia, serif" }}>Archived Projects</p>
              <p className="text-[12px] font-light mt-0.5" style={{ color: vars.g500 }}>Searchable history of completed work.</p>
            </div>
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" style={{ color: vars.g400 }} />
          </button>
          <button
            onClick={onGuidance}
            className="group flex items-center gap-4 rounded-2xl p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
            style={{ background: "white", border: `1px solid ${vars.g200}`, color: ink }}
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: accentSoft, color: accent }}>
              <BookOpen size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: vars.g500 }}>How-to library</p>
              <p className="text-[16px] font-semibold mt-0.5" style={{ fontFamily: "'Alice', Georgia, serif" }}>Guidance</p>
              <p className="text-[12px] font-light mt-0.5" style={{ color: vars.g500 }}>Articles &amp; videos on using the platform.</p>
            </div>
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" style={{ color: vars.g400 }} />
          </button>
        </div>

        {isClient && (
          <p className="text-[13px] font-light mb-6" style={{ color: vars.g500 }}>
            If you would like to run multiple projects, you will need to upgrade to an Agency account. Please contact us to discuss.
          </p>
        )}

        {displayClients.length === 0 ? (
          <div
            className="rounded-2xl border-2 border-dashed p-10 sm:p-14 text-center"
            style={{ background: "white", borderColor: `${accent}55` }}
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{ background: accentSoft, color: accent }}
            >
              <Building2 size={28} />
            </div>
            <h2 className="text-xl mb-2" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>
              No projects yet
            </h2>
            <p className="text-[14px] font-light max-w-md mx-auto mb-6" style={{ color: vars.g500 }}>
              A project is a single brand, product or campaign you want to optimise.
              You'll set up its messaging, audience and content plan once - then everything you publish flows through it.
            </p>
            {!isClient && (
            <button
              onClick={onCreateProject}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[12px] font-bold uppercase tracking-[0.15em] text-white transition-all hover:brightness-110"
              style={{ background: accent }}
            >
              <Plus size={14} /> Create your first project
            </button>
            )}
            <p className="text-[11px] font-light mt-5" style={{ color: vars.g400 }}>
              Typical setup takes 10–15 minutes. You can save and return at any time.
            </p>
          </div>
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-7">
          {displayClients.map((client) => {
            const cyc = loadCycle(client.id);
            const liveScore = cyc.history.length ? cyc.history[cyc.history.length - 1].score : 0;
            const liveTrend = cyc.history.length > 1 ? liveScore - cyc.history[cyc.history.length - 2].score : 0;
            const livePlans = loadPlannerProjects(client.id).length;
            const liveContent = loadArchive(client.id).length;
            const geoSnapshotScore = (client as any).geoSnapshot?.score as number | undefined;
            const geoScoreColor = geoSnapshotScore !== undefined
              ? geoSnapshotScore >= 70 ? "#3D9B6B" : geoSnapshotScore >= 50 ? "#D4922A" : "#C94A3E"
              : undefined;
            const logoUrl = clientLogos[client.id];
            const handleLogoUpload = (e: React.MouseEvent) => {
              e.stopPropagation();
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "image/png,image/jpeg,image/svg+xml,image/webp";
              input.onchange = (ev) => {
                const file = (ev.target as HTMLInputElement).files?.[0];
                if (!file) return;
                if (file.size > 1024 * 1024) {
                  window.alert("That image is too large. Please choose a logo under 1MB.");
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  if (typeof reader.result === "string") {
                    onLogoUpdate(client.id, reader.result);
                  }
                };
                reader.readAsDataURL(file);
              };
              input.click();
            };
            return (
              <div
                key={client.id}
                onClick={() => onSelectClient(client)}
                className="rounded-2xl border-2 overflow-hidden cursor-pointer transition-all hover:shadow-xl hover:-translate-y-1 hover:ring-2 hover:ring-offset-2 group"
                style={{ background: "white", borderColor: vars.g200, ["--tw-ring-color" as any]: client.color }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = client.color; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = vars.g200; }}
              >
                <div className="h-1" style={{ background: `linear-gradient(90deg, ${client.color}, ${client.color}66)` }} />
                <div className="p-7">
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className="relative group/logo flex-shrink-0">
                        {logoUrl ? (
                          <div className="w-12 h-12 rounded-xl overflow-hidden border flex items-center justify-center" style={{ borderColor: vars.g200, background: "white" }}>
                            <img src={logoUrl} alt={`${client.name} logo`} className="w-full h-full object-contain p-1" />
                          </div>
                        ) : (
                          <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center text-[13px] font-bold text-white"
                            style={{ background: client.color }}
                          >
                            {client.initials}
                          </div>
                        )}
                        <button
                          onClick={handleLogoUpload}
                          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center opacity-100 transition-opacity"
                          style={{ background: vars.accent }}
                          title={logoUrl ? "Change logo" : "Add logo"}
                        >
                          <Upload size={9} className="text-white" />
                        </button>
                      </div>
                      <div>
                        <h3 className="text-[15px] font-semibold" style={{ color: vars.navy }}>
                          {client.name}
                        </h3>
                        <span
                          className="text-[11px] font-medium px-2 py-0.5 rounded mt-1 inline-block"
                          style={{ background: `${client.color}08`, color: client.color }}
                        >
                          {getProjectSectorLabel(client.id)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Remove "${client.name}"? This deletes the project and cannot be undone.`)) {
                            onDeleteProject(client.id);
                          }
                        }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                        style={{ color: vars.red, background: "rgba(201,74,62,0.08)" }}
                        title="Remove project"
                      >
                        <Trash2 size={13} />
                      </button>
                      <ArrowRight
                        size={14}
                        className="transition-transform group-hover:translate-x-1"
                        style={{ color: vars.g300 }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-5 mb-5">
                    <MiniDonut score={liveScore} color={client.color} size={56} />
                    <div className="flex-1 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-light" style={{ color: vars.g400 }}>Authority Score</span>
                        {liveTrend !== 0 && (
                          <span
                            className="flex items-center gap-0.5 text-[11px] font-semibold"
                            style={{ color: liveTrend > 0 ? "#1f748f" : "#C94A3E" }}
                          >
                            <TrendingUp size={10} style={{ transform: liveTrend < 0 ? "rotate(180deg)" : "none" }} />
                            {liveTrend > 0 ? "+" : ""}{liveTrend}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div
                          className="rounded-lg px-3 py-2.5 text-center"
                          style={{ background: vars.g50 }}
                        >
                          <p className="text-[15px] font-bold" style={{ color: vars.navy }}>
                            {liveContent}
                          </p>
                          <p className="text-[9px] uppercase tracking-[0.15em] font-medium mt-0.5" style={{ color: vars.g400 }}>
                            Content
                          </p>
                        </div>
                        <div
                          className="rounded-lg px-3 py-2.5 text-center"
                          style={{ background: vars.g50 }}
                        >
                          <p className="text-[15px] font-bold" style={{ color: vars.navy }}>
                            {livePlans}
                          </p>
                          <p className="text-[9px] uppercase tracking-[0.15em] font-medium mt-0.5" style={{ color: vars.g400 }}>
                            Plans
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  {geoSnapshotScore !== undefined && (
                    <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl" style={{ background: `${geoScoreColor}12`, border: `1px solid ${geoScoreColor}30` }}>
                      <Zap size={11} style={{ color: geoScoreColor, flexShrink: 0 }} />
                      <span className="text-[11px] font-semibold" style={{ color: geoScoreColor }}>
                        GEO Score: {geoSnapshotScore}
                      </span>
                      <span className="text-[10px] font-light ml-auto" style={{ color: vars.g400 }}>
                        initial scan
                      </span>
                    </div>
                  )}
                  <div
                    className="flex items-center justify-between pt-4 border-t"
                    style={{ borderColor: vars.g100 }}
                  >
                    <div className="flex items-center gap-2">
                      <Activity size={12} style={{ color: vars.g400 }} />
                      <span className="text-[12px] font-light" style={{ color: vars.g500 }}>
                        {client.recentActivity}
                      </span>
                    </div>
                    <span className="text-[11px] font-light" style={{ color: vars.g400 }}>
                      {client.lastActive}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
}
