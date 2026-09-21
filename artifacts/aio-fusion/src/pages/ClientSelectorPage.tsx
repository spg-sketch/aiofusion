import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Building2, Plus, Archive, BookOpen, ArrowRight,
  Trash2, Activity, Zap, Upload, LogIn,
} from "lucide-react";
import { vars } from "../marketing/vars";
import { useContentStore, loadArchive, loadPlannerProjects } from "../lib/contentStore";
import { authorityIndexFor } from "../LlmCheckPage";
import { loadServerAuditsForProject } from "../lib/auditSync";
import { fetchProjectAllowance, type ProjectAllowance } from "../lib/billingAllowance";
import type { Client } from "../types";

const teal = "#1A647B";
const ink = "#0a1628";
const accent = "#C8497A";
const accentSoft = "#FBE3ED";
type AuditScoreState =
  | { status: "loading" }
  | { status: "ready"; score: number | null }
  | { status: "error" };

function ClientLogoBox({ logoUrl, alt }: { logoUrl: string; alt: string }) {
  const [wide, setWide] = useState(false);
  return (
    <div
      className="h-[140px] rounded-xl overflow-hidden border flex items-center justify-center"
      style={{ borderColor: vars.g200, background: "white", width: wide ? 175 : 140 }}
    >
      <img
        src={logoUrl}
        alt={alt}
        className="w-full h-full object-contain p-1"
        onLoad={(e) => {
          const img = e.currentTarget;
          setWide(img.naturalWidth > img.naturalHeight * 1.15);
        }}
      />
    </div>
  );
}

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
  workspaceSwitcher,
  projectSyncStatus = "ready",
  syncError,
  onRetrySync,
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
  session?: {
    username: string;
    role: string;
    membershipRole?: string | null;
    agencyManagedClient?: boolean;
  } | null;
  onGenerateFromUrl?: () => void;
  /** Rendered inside the header right section - workspace switcher when the user belongs to >1 workspace. */
  workspaceSwitcher?: React.ReactNode;
  projectSyncStatus?: "loading" | "ready" | "error";
  syncError?: string | null;
  onRetrySync?: () => void;
}) {
  useContentStore();
  const displayClients = useMemo(
    () => [...projects].sort((a, b) => {
      const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      return byName || a.id.localeCompare(b.id);
    }),
    [projects],
  );
  const [auditScores, setAuditScores] = useState<Record<string, AuditScoreState>>({});
  const [allowanceState, setAllowanceState] = useState<
    { status: "idle" | "loading" | "error" } | { status: "ready"; value: ProjectAllowance }
  >({ status: "idle" });
  const projectIdsKey = displayClients.map((client) => client.id).join("\u0000");

  useEffect(() => {
    let cancelled = false;
    const projectIds = displayClients.map((client) => client.id);
    if (projectIds.length === 0) return;
    setAuditScores(Object.fromEntries(projectIds.map((id) => [id, { status: "loading" }])));

    void Promise.all(
      projectIds.map(async (projectId) => {
        const audits = await loadServerAuditsForProject(projectId);
        return {
          projectId,
          state: audits === null
            ? { status: "error" } as const
            : {
                status: "ready",
                score: audits[0] ? authorityIndexFor(audits[0].result) : null,
              } as const,
        };
      }),
    ).then((results) => {
      if (cancelled) return;
      setAuditScores(Object.fromEntries(results.map(({ projectId, state }) => [projectId, state])));
    });

    return () => {
      cancelled = true;
    };
  }, [projectIdsKey]);

  const isAdmin = session?.role === "admin";
  const isClient = session?.role === "client";
  const isManagedClient = !!session?.agencyManagedClient;
  const isDirectClient = isClient && !isManagedClient;
  const managedClientCanCreate =
    !isManagedClient || displayClients.length === 0;
  const projectListReady = projectSyncStatus === "ready";
  // The capacity endpoint is available to project-capable owner, admin and
  // content members without exposing subscription or payment details.
  const clientCanReadAllowance = session?.membershipRole == null
    || ["owner", "admin", "content"].includes(session.membershipRole);
  const shouldCheckAllowance = isDirectClient && clientCanReadAllowance;

  useEffect(() => {
    if (!shouldCheckAllowance) {
      setAllowanceState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setAllowanceState({ status: "loading" });
    void fetchProjectAllowance().then((allowance) => {
      if (cancelled) return;
      setAllowanceState(allowance ? { status: "ready", value: allowance } : { status: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [shouldCheckAllowance, session?.username, projectIdsKey]);

  const clientAtLimit = shouldCheckAllowance
    && allowanceState.status === "ready"
    && allowanceState.value.atLimit;
  const createUnavailable = shouldCheckAllowance
    && allowanceState.status !== "ready";
  const createDisabled = clientAtLimit || createUnavailable;
  const limitMessage = shouldCheckAllowance
    ? allowanceState.status === "ready" && allowanceState.value.atLimit
      ? allowanceState.value.packageCapacity?.access === "beta"
        || allowanceState.value.trial?.status === "active"
        ? "Your beta trial includes 1 project. Upgrade your plan to add another."
        : "Your project allowance has been reached. Upgrade your plan or add a project slot to continue."
      : allowanceState.status === "loading" || allowanceState.status === "idle"
        ? "Checking your project allowance..."
        : allowanceState.status === "error"
          ? "Project allowance is unavailable. Refresh and try again."
          : null
    : null;

  const createProjectAction = (
    <button
      onClick={onCreateProject}
      disabled={createDisabled}
      aria-disabled={createDisabled}
      className="aio-button aio-button--primary group flex items-center gap-4 rounded-2xl p-5 text-left transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:ring-[3px] hover:ring-white/60 bg-[#C8497A] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:shadow-none"
    >
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/20 text-white">
        <Plus size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="aio-type-eyebrow text-white/75">Start a new piece of work</p>
        <p className="aio-type-card-title mt-0.5 text-white">{clientAtLimit ? "Project limit reached" : "Create Project"}</p>
        <p className="aio-type-supporting mt-0.5 text-white/75">
          {limitMessage ?? "Walk through Project Set-Up."}
        </p>
      </div>
      {!createDisabled && <ArrowRight size={16} className="transition-all duration-300 group-hover:translate-x-1 text-white/70" />}
    </button>
  );

  return (
    <div className="min-h-screen font-['Inter',sans-serif]" style={{ background: teal }}>
      <header
        className="px-4 sm:px-10 py-4 sm:py-6 flex items-center justify-between"
        style={{ background: teal, borderBottom: "1px solid rgba(255,255,255,0.15)" }}
      >
        <button onClick={onBackToPlatformHome} className="flex items-center gap-3.5">
          <img src={`${import.meta.env.BASE_URL}images/logo-white-notagline.png`} alt="AIO Fusion" className="h-20 sm:h-30" />
        </button>
        <div className="flex items-center gap-4">
          {workspaceSwitcher && (
            <div className="bg-white/10 rounded-xl px-3 py-2">
              {workspaceSwitcher}
            </div>
          )}
          <button onClick={onBackToPlatformHome} className="aio-button aio-button--primary sm:px-7 uppercase tracking-[0.14em] transition-all hover:brightness-110" style={{ background: accent, color: "white" }}>
            <ArrowLeft size={16} /> Platform home
          </button>
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: accent, color: "white" }}
          >
            {session?.username?.slice(0, 2).toUpperCase() ?? "SP"}
          </div>
          <div className="flex flex-col">
            <span className="aio-type-label text-white">
              {isAdmin ? "Admin" : isClient ? "Client" : "Agency"}
            </span>
          </div>
        </div>
      </header>

      <div className="px-4 sm:px-10 py-8 sm:py-12 max-w-6xl mx-auto">
        <div className="mb-10 sm:mb-12 rounded-2xl p-6 sm:p-10" style={{ background: "white", boxShadow: "0 4px 24px rgba(0,0,0,0.12)" }}>
          <div className="flex items-center gap-2 mb-4">
            <div
              className="aio-type-eyebrow inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ background: accentSoft, border: `1px solid ${accent}40`, color: accent }}
            >
              <Building2 size={12} /> Project Hub
            </div>
          </div>
          <h1 className="aio-type-page-title">
            {isAdmin ? "Master" : isClient ? null : "Agency"}{isAdmin || !isClient ? " " : null}
            <span style={{ color: accent }}>Project Hub</span>
          </h1>
          <p className="aio-type-body mt-3 mb-8 max-w-4xl lg:whitespace-nowrap" style={{ color: ink }}>
            {displayClients.length === 0 && projectSyncStatus === "loading"
              ? "Checking the projects available in this workspace."
              : displayClients.length === 0 && projectSyncStatus === "error"
                ? "We could not confirm this workspace's projects. Retry before creating or changing projects."
                : displayClients.length === 0
              ? "Set up your first project to start optimising your PR and marketing output for AI discoverability."
              : "Select a project to manage AI optimisation, ongoing PR and marketing output."}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
            {managedClientCanCreate && (displayClients.length > 0 || projectListReady) && createProjectAction}
            <button
              onClick={onArchivedProjects}
              className="aio-button aio-button--outline group flex items-center gap-4 rounded-2xl p-5 text-left transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:ring-[3px] hover:ring-[#C8497A] border border-[#e2e8f0]"
              style={{ background: "rgba(201,74,62,0.08)" }}
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300 group-hover:ring-2 group-hover:ring-[#C8497A]" style={{ background: "#FBE3ED", color: "#C8497A" }}>
                <Archive size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="aio-type-eyebrow text-[#6b7280]">Past work</p>
                <p className="aio-type-card-title mt-0.5 text-[#0a1628]">Archived Projects</p>
                <p className="aio-type-supporting mt-0.5 text-[#6b7280]">Searchable history of completed work.</p>
              </div>
              <ArrowRight size={16} className="transition-all duration-300 group-hover:translate-x-1 text-[#9ca3af] group-hover:text-[#C8497A]" />
            </button>
            <button
              onClick={onGuidance}
              className="aio-button aio-button--outline group flex items-center gap-4 rounded-2xl p-5 text-left transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:ring-[3px] hover:ring-[#C8497A] border border-[#e2e8f0]"
              style={{ background: "rgba(201,74,62,0.08)" }}
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300 group-hover:ring-2 group-hover:ring-[#C8497A]" style={{ background: "#FBE3ED", color: "#C8497A" }}>
                <BookOpen size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="aio-type-eyebrow text-[#6b7280]">How-to library</p>
                <p className="aio-type-card-title mt-0.5 text-[#0a1628]">Guidance</p>
                <p className="aio-type-supporting mt-0.5 text-[#6b7280]">Articles &amp; videos on using the platform.</p>
              </div>
              <ArrowRight size={16} className="transition-all duration-300 group-hover:translate-x-1 text-[#9ca3af] group-hover:text-[#C8497A]" />
            </button>
          </div>
        </div>

        {syncError && (
          <div
            role="alert"
            className="mb-5 flex flex-col gap-3 rounded-xl border px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between"
            style={{ background: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.3)", color: "white" }}
          >
            <span className="aio-type-supporting">{syncError}</span>
            {onRetrySync && (
              <button type="button" onClick={onRetrySync} className="shrink-0 rounded-full border border-white/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-white/10">
                Retry
              </button>
            )}
          </div>
        )}

        {displayClients.length === 0 && projectSyncStatus === "loading" ? (
          <div
            aria-live="polite"
            className="rounded-2xl border-2 border-dashed p-10 text-center sm:p-14"
            style={{ background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.25)" }}
          >
            <h2 className="aio-type-card-title mb-2 text-white">Loading projects...</h2>
            <p className="aio-type-body mx-auto max-w-md" style={{ color: "rgba(255,255,255,0.7)" }}>
              Checking the projects available in this workspace.
            </p>
          </div>
        ) : displayClients.length === 0 && projectSyncStatus === "error" ? (
          <div
            className="rounded-2xl border-2 border-dashed p-10 text-center sm:p-14"
            style={{ background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.25)" }}
          >
            <h2 className="aio-type-card-title mb-2 text-white">Projects unavailable</h2>
            <p className="aio-type-body mx-auto mb-6 max-w-md" style={{ color: "rgba(255,255,255,0.7)" }}>
              The workspace project list could not be confirmed. No projects have been removed.
            </p>
            {onRetrySync && (
              <button type="button" onClick={onRetrySync} className="rounded-full border border-white/40 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-white/10">
                Retry project load
              </button>
            )}
          </div>
        ) : displayClients.length === 0 ? (
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
            <h2 className="aio-type-card-title mb-2 text-white">
              No projects yet
            </h2>
            <p className="aio-type-body max-w-md mx-auto mb-6" style={{ color: "rgba(255,255,255,0.7)" }}>
              A project is a single brand, product or campaign you want to optimise.
            </p>
            {managedClientCanCreate && (
              <button
                onClick={onCreateProject}
                disabled={createDisabled}
                aria-disabled={createDisabled}
                className="aio-button aio-button--primary rounded-full uppercase tracking-[0.15em] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
                style={{ background: accent }}
              >
                <Plus size={14} /> {clientAtLimit ? "Project limit reached" : createUnavailable ? "Checking project allowance..." : "Create your first project"}
              </button>
            )}
            {displayClients.length === 0 && limitMessage && (
              <p className="aio-type-supporting mt-3" style={{ color: "rgba(255,255,255,0.7)" }}>
                {limitMessage}
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {displayClients.map((client) => {
              const auditScore = auditScores[client.id] ?? { status: "loading" };
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
                  onClick={() => onSelectClient(client)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectClient(client);
                    }
                  }}
                  className="group/card rounded-2xl flex flex-col transition-all duration-300 hover:-translate-y-2 cursor-pointer border-[4px] border-transparent hover:border-[#C8497A]"
                  style={{ background: "white", boxShadow: "0 4px 24px rgba(0,0,0,0.18)" }}
                >
                  <div className="p-6 flex-1 flex flex-col">
                    <div className="flex flex-col items-center text-center mb-5">
                      <div className="relative flex-shrink-0 mb-3">
                        {logoUrl ? (
                          <ClientLogoBox logoUrl={logoUrl} alt={`${client.name} logo`} />
                        ) : (
                          <div
                            className="w-[140px] h-[140px] rounded-xl flex items-center justify-center text-[27px] font-bold text-white"
                            style={{ background: client.color }}
                          >
                            {client.initials}
                          </div>
                        )}
                        <button
                          onClick={handleLogoUpload}
                          className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center"
                          style={{ background: vars.accent }}
                          title={logoUrl ? "Change logo" : "Add logo"}
                        >
                          <Upload size={11} className="text-white" />
                        </button>
                      </div>
                      <h3 className="aio-type-card-title" style={{ color: ink }}>
                        {client.name}
                      </h3>
                    </div>

                    <div className="flex flex-col items-center justify-center mb-5 px-4 py-5 rounded-xl" style={{ background: vars.g50 }}>
                       <span className="aio-type-eyebrow" style={{ color: vars.g400 }}>Earned Media Audit Score</span>
                      {auditScore.status === "loading" ? (
                         <p className="aio-type-supporting font-medium mt-1.5" style={{ color: vars.g400 }}>Loading score...</p>
                      ) : auditScore.status === "error" ? (
                         <p className="aio-type-supporting font-medium mt-1.5" style={{ color: vars.g400 }}>Score unavailable</p>
                      ) : auditScore.score === null ? (
                         <p className="aio-type-supporting font-medium mt-1.5" style={{ color: vars.g400 }}>No audit yet</p>
                      ) : (
                        <p className="text-[38px] font-bold leading-tight mt-1" style={{ color: ink }}>{auditScore.score}</p>
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
                         className="aio-button aio-button--outline aio-button--compact transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md hover:bg-[#C8497A] hover:text-white hover:ring-[3px] hover:ring-[#C8497A]"
                        style={{ background: "#FBE3ED", color: "#C8497A" }}
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
                         className="aio-button aio-button--destructive aio-button--compact transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-[#C8497A]"
                        style={{ background: "rgba(201,74,62,0.08)", color: vars.red }}
                        title="Delete project"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                      <button
                        onClick={() => onSelectClient(client)}
                         className="aio-button aio-button--primary aio-button--compact flex-1 uppercase tracking-[0.1em] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-[#C8497A]"
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
