import { useState } from "react";
import {
  ArrowLeft, Building2, Plus, Archive, BookOpen, ArrowRight,
  Trash2, TrendingUp, Activity, Zap, Upload, LogIn,
} from "lucide-react";
import { vars } from "../marketing/vars";
import { useContentStore, loadArchive, loadPlannerProjects } from "../lib/contentStore";
import { loadCycle } from "../lib/cycles";
import { getProjectSectorLabel } from "../lib/projects";
import type { Client } from "../types";
import { MiniDonut } from "../components/MiniDonut";

const teal = "#1A647B";
const ink = "#0a1628";
const accent = "#C8497A";
const accentSoft = "#FBE3ED";

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

  return (
    <div className="min-h-screen font-['Inter',sans-serif]" style={{ background: teal }}>
      <header
        className="px-4 sm:px-10 py-4 sm:py-6 flex items-center justify-between"
        style={{ background: "rgba(0,0,0,0.12)", borderBottom: "1px solid rgba(255,255,255,0.15)" }}
      >
        <button onClick={onBackToPlatformHome} className="flex items-center gap-3.5">
          <img src={`${import.meta.env.BASE_URL}images/logo-white.png`} alt="AIO Fusion" className="h-14 sm:h-20" />
        </button>
        <div className="flex items-center gap-4">
          <button onClick={onBackToPlatformHome} className="text-[12px] font-medium flex items-center gap-1.5 hover:opacity-80 transition-opacity" style={{ color: "rgba(255,255,255,0.8)" }}>
            <ArrowLeft size={14} /> Platform home
          </button>
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: accent, color: "white" }}
          >
            {session?.username?.slice(0, 2).toUpperCase() ?? "SP"}
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] font-medium text-white">
              {isAdmin ? "Admin" : isClient ? "Client" : "Agency"}
            </span>
            <span className="text-[11px] font-light" style={{ color: "rgba(255,255,255,0.65)" }}>
              Intelligence Tier
            </span>
          </div>
        </div>
      </header>

      <div className="px-4 sm:px-10 py-8 sm:py-12 max-w-6xl mx-auto">
        <div className="mb-8 sm:mb-10 rounded-2xl p-6 sm:p-10" style={{ background: "white", boxShadow: "0 4px 24px rgba(0,0,0,0.12)" }}>
          <div className="flex items-center gap-2 mb-4">
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
              ? "Set up your first project to start optimising your PR and marketing output for AI discoverability."
              : "Select a project to manage AI optimisation, on-going PR and marketing output."}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mb-10 sm:mb-12">
          {(!isClient || displayClients.length < 3) && (
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
            style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: "white" }}
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.15)" }}>
              <Archive size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.6)" }}>Past work</p>
              <p className="text-[16px] font-semibold mt-0.5" style={{ fontFamily: "'Alice', Georgia, serif" }}>Archived Projects</p>
              <p className="text-[12px] font-light mt-0.5" style={{ color: "rgba(255,255,255,0.6)" }}>Searchable history of completed work.</p>
            </div>
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform text-white/60" />
          </button>
          <button
            onClick={onGuidance}
            className="group flex items-center gap-4 rounded-2xl p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
            style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: "white" }}
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.15)" }}>
              <BookOpen size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.6)" }}>How-to library</p>
              <p className="text-[16px] font-semibold mt-0.5" style={{ fontFamily: "'Alice', Georgia, serif" }}>Guidance</p>
              <p className="text-[12px] font-light mt-0.5" style={{ color: "rgba(255,255,255,0.6)" }}>Articles &amp; videos on using the platform.</p>
            </div>
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform text-white/60" />
          </button>
        </div>

        {displayClients.length === 0 ? (
          <div
            className="rounded-2xl border-2 border-dashed p-10 sm:p-14 text-center"
            style={{ background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.25)" }}
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{ background: "rgba(255,255,255,0.15)", color: "white" }}
            >
              <Building2 size={28} />
            </div>
            <h2 className="text-xl mb-2 text-white" style={{ fontFamily: "'Alice', Georgia, serif" }}>
              No projects yet
            </h2>
            <p className="text-[14px] font-light max-w-md mx-auto mb-6" style={{ color: "rgba(255,255,255,0.7)" }}>
              A project is a single brand, product or campaign you want to optimise.
            </p>
            {(!isClient || displayClients.length < 3) && (
              <button
                onClick={onCreateProject}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[12px] font-bold uppercase tracking-[0.15em] text-white transition-all hover:brightness-110"
                style={{ background: accent }}
              >
                <Plus size={14} /> Create your first project
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {displayClients.map((client) => {
              const cyc = loadCycle(client.id);
              const liveScore = cyc.history.length ? cyc.history[cyc.history.length - 1].score : 0;
              const liveTrend = cyc.history.length > 1 ? liveScore - cyc.history[cyc.history.length - 2].score : 0;
              const livePlans = loadPlannerProjects(client.id).length;
              const liveContent = loadArchive(client.id).length;
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
                  className="rounded-2xl overflow-hidden flex flex-col"
                  style={{ background: "white", boxShadow: "0 4px 24px rgba(0,0,0,0.18)" }}
                >
                  <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${client.color}, ${client.color}88)` }} />
                  <div className="p-6 flex-1 flex flex-col">
                    <div className="flex items-center gap-4 mb-5">
                      <div className="relative flex-shrink-0">
                        {logoUrl ? (
                          <div className="w-14 h-14 rounded-xl overflow-hidden border flex items-center justify-center" style={{ borderColor: vars.g200, background: "white" }}>
                            <img src={logoUrl} alt={`${client.name} logo`} className="w-full h-full object-contain p-1" />
                          </div>
                        ) : (
                          <div
                            className="w-14 h-14 rounded-xl flex items-center justify-center text-[14px] font-bold text-white"
                            style={{ background: client.color }}
                          >
                            {client.initials}
                          </div>
                        )}
                        <button
                          onClick={handleLogoUpload}
                          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center"
                          style={{ background: vars.accent }}
                          title={logoUrl ? "Change logo" : "Add logo"}
                        >
                          <Upload size={9} className="text-white" />
                        </button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-[16px] font-bold truncate" style={{ color: ink }}>
                          {client.name}
                        </h3>
                        <span
                          className="text-[11px] font-medium px-2 py-0.5 rounded mt-1 inline-block"
                          style={{ background: `${client.color}12`, color: client.color }}
                        >
                          {getProjectSectorLabel(client.id)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-5 mb-5 px-4 py-4 rounded-xl" style={{ background: vars.g50 }}>
                      <MiniDonut score={liveScore} color={client.color} size={52} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: vars.g400 }}>Authority Score</span>
                          {liveTrend !== 0 && (
                            <span className="flex items-center gap-0.5 text-[11px] font-semibold" style={{ color: liveTrend > 0 ? "#1f748f" : "#C94A3E" }}>
                              <TrendingUp size={10} style={{ transform: liveTrend < 0 ? "rotate(180deg)" : "none" }} />
                              {liveTrend > 0 ? "+" : ""}{liveTrend}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="text-center rounded-lg py-1.5" style={{ background: "white" }}>
                            <p className="text-[14px] font-bold" style={{ color: ink }}>{liveContent}</p>
                            <p className="text-[9px] uppercase tracking-[0.12em] font-medium" style={{ color: vars.g400 }}>Content</p>
                          </div>
                          <div className="text-center rounded-lg py-1.5" style={{ background: "white" }}>
                            <p className="text-[14px] font-bold" style={{ color: ink }}>{livePlans}</p>
                            <p className="text-[9px] uppercase tracking-[0.12em] font-medium" style={{ color: vars.g400 }}>Plans</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-auto pt-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Archive "${client.name}"? The project will be moved to Archived Projects.`)) {
                            onArchivedProjects();
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all hover:brightness-95"
                        style={{ background: vars.g100, color: vars.g500 }}
                        title="Archive project"
                      >
                        <Archive size={13} /> Archive
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Remove "${client.name}"? This deletes the project and cannot be undone.`)) {
                            onDeleteProject(client.id);
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all hover:brightness-95"
                        style={{ background: "rgba(201,74,62,0.08)", color: vars.red }}
                        title="Delete project"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                      <button
                        onClick={() => onSelectClient(client)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-[0.1em] text-white transition-all hover:brightness-110 hover:-translate-y-0.5"
                        style={{ background: accent }}
                      >
                        <LogIn size={13} /> Enter
                      </button>
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
