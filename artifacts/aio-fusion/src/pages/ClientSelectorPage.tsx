import { useState } from "react";
import {
  ArrowLeft, Building2, Plus, Archive, BookOpen, ArrowRight,
  Trash2, TrendingUp, Activity, Zap, Upload, LogIn,
} from "lucide-react";
import { vars } from "../marketing/vars";
import { useContentStore, loadArchive, loadPlannerProjects } from "../lib/contentStore";
import { loadCycle } from "../lib/cycles";
import type { Client } from "../types";

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
        style={{ background: teal, borderBottom: "1px solid rgba(255,255,255,0.15)" }}
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
          </div>
        </div>
      </header>

      <div className="px-4 sm:px-10 py-8 sm:py-12 max-w-6xl mx-auto">
        <div className="mb-10 sm:mb-12 rounded-2xl p-6 sm:p-10" style={{ background: "white", boxShadow: "0 4px 24px rgba(0,0,0,0.12)" }}>
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
          <p className="text-[15px] sm:text-[16px] font-light mt-3 mb-8 max-w-2xl leading-[1.7]" style={{ color: ink }}>
            {displayClients.length === 0
              ? "Set up your first project to start optimising your PR and marketing output for AI discoverability."
              : "Select a project to manage AI optimisation, on-going PR and marketing output."}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
            {(!isClient || displayClients.length < 3) && (
              <button
                onClick={onCreateProject}
                className="group flex items-center gap-4 rounded-2xl p-5 text-left transition-all duration-300 hover:-translate-y-2 hover:shadow-xl bg-[#f8fafc] border border-[#e2e8f0] hover:border-[#C8497A]"
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300 bg-[#FBE3ED] text-[#C8497A] ring-2 ring-transparent group-hover:ring-[#C8497A]">
                  <Plus size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6b7280]">Start a new piece of work</p>
                  <p className="text-[16px] font-semibold mt-0.5 text-[#0a1628]" style={{ fontFamily: "'Alice', Georgia, serif" }}>Create Project</p>
                  <p className="text-[12px] font-light mt-0.5 text-[#6b7280]">Walk through Project Set-Up.</p>
                </div>
                <ArrowRight size={16} className="transition-all duration-300 group-hover:translate-x-1 text-[#9ca3af] group-hover:text-[#C8497A]" />
              </button>
            )}
            <button
              onClick={onArchivedProjects}
              className="group flex items-center gap-4 rounded-2xl p-5 text-left transition-all duration-300 hover:-translate-y-2 hover:shadow-xl bg-[#f8fafc] border border-[#e2e8f0] hover:border-[#C8497A]"
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300 bg-[#FBE3ED] text-[#C8497A] ring-2 ring-transparent group-hover:ring-[#C8497A]">
                <Archive size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6b7280]">Past work</p>
                <p className="text-[16px] font-semibold mt-0.5 text-[#0a1628]" style={{ fontFamily: "'Alice', Georgia, serif" }}>Archived Projects</p>
                <p className="text-[12px] font-light mt-0.5 text-[#6b7280]">Searchable history of completed work.</p>
              </div>
              <ArrowRight size={16} className="transition-all duration-300 group-hover:translate-x-1 text-[#9ca3af] group-hover:text-[#C8497A]" />
            </button>
            <button
              onClick={onGuidance}
              className="group flex items-center gap-4 rounded-2xl p-5 text-left transition-all duration-300 hover:-translate-y-2 hover:shadow-xl bg-[#f8fafc] border border-[#e2e8f0] hover:border-[#C8497A]"
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300 bg-[#FBE3ED] text-[#C8497A] ring-2 ring-transparent group-hover:ring-[#C8497A]">
                <BookOpen size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6b7280]">How-to library</p>
                <p className="text-[16px] font-semibold mt-0.5 text-[#0a1628]" style={{ fontFamily: "'Alice', Georgia, serif" }}>Guidance</p>
                <p className="text-[12px] font-light mt-0.5 text-[#6b7280]">Articles &amp; videos on using the platform.</p>
              </div>
              <ArrowRight size={16} className="transition-all duration-300 group-hover:translate-x-1 text-[#9ca3af] group-hover:text-[#C8497A]" />
            </button>
          </div>
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
                  className="group/card rounded-2xl overflow-hidden flex flex-col transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:ring-4 hover:ring-[#C8497A] cursor-pointer"
                  style={{ background: "white", boxShadow: "0 4px 24px rgba(0,0,0,0.18)" }}
                >
                  <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${client.color}, ${client.color}88)` }} />
                  <div className="p-6 flex-1 flex flex-col">
                    <div className="flex flex-col items-center text-center mb-5">
                      <div className="relative flex-shrink-0 mb-3">
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
                      <h3 className="text-[17px] font-bold" style={{ color: ink }}>
                        {client.name}
                      </h3>
                    </div>

                    <div className="flex flex-col items-center justify-center mb-5 px-4 py-5 rounded-xl" style={{ background: vars.g50 }}>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: vars.g400 }}>Authority Score</span>
                      <p className="text-[48px] font-bold leading-tight mt-1" style={{ color: ink }}>{liveScore}</p>
                      {liveTrend !== 0 && (
                        <span className="flex items-center justify-center gap-0.5 text-[12px] font-semibold mt-0.5" style={{ color: liveTrend > 0 ? "#1f748f" : "#C94A3E" }}>
                          <TrendingUp size={11} style={{ transform: liveTrend < 0 ? "rotate(180deg)" : "none" }} />
                          {liveTrend > 0 ? "+" : ""}{liveTrend}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-auto pt-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Archive "${client.name}"? The project will be moved to Archived Projects.`)) {
                            onArchivedProjects();
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-[#C8497A]"
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
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-[#C8497A]"
                        style={{ background: "rgba(201,74,62,0.08)", color: vars.red }}
                        title="Delete project"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                      <button
                        onClick={() => onSelectClient(client)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-[0.1em] text-white transition-all duration-200 hover:brightness-110 hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-[#C8497A]"
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
