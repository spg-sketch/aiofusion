import { useState, useEffect, useMemo } from "react";
import {
  ChevronRight, Lock, Search, FileEdit, BarChart3, Archive, Send, LineChart, ArrowRight, Sparkles, Loader2,
  TrendingUp, FileText, FileCheck2, Target, Code2, HelpCircle, MessageSquareQuote, Bot, ShieldCheck,
  MessagesSquare, Download, AlertTriangle, CheckCircle2, XCircle, Info, Globe, Tag, User, ChevronDown,
  Plus, Minus, MessageSquare, BookOpen, Scroll, Award, Radio, Mic2, PenLine, ClipboardList, ArrowUpRight,
  Lightbulb, ClipboardPaste, Upload, Calendar, Check, Save, Circle, Zap, Mail, Shield, Eye, Building2,
  ArrowLeft, LogOut, Trash2, KeyRound, Users, Activity, Play, ChevronUp, Menu, X, LogIn,
  Link as LinkIcon, Image as ImageIcon, Repeat, TrendingDown, FolderOpen, List as ListIcon, Clock,
  Undo2, ArchiveRestore, RefreshCw, MonitorSmartphone, FileCheck, FolderCheck,
} from "lucide-react";
import { vars } from "../marketing/vars";
import { loadSavedAudits, authorityIndexFor } from "../LlmCheckPage";
import { loadSavedDiagnostics } from "../lib/diagnosticStore";
import { loadArchive, loadPlannerProjects, useContentStore } from "../lib/contentStore";
import { loadIntakeData } from "../IntakeForm";
import { loadCycle } from "../lib/cycleHistory";
import type { Client } from "../lib/projectTypes";
import InfoTip from "../InfoTip";
function AuthorityDonut({ score, size = 160, light = false }: { score: number; size?: number; light?: boolean }) {
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const pct = score / 100;
  const scoreColor = light ? "#FFFFFF" : (score >= 70 ? vars.green : score >= 40 ? vars.amber : vars.g400);
  const trackColor = light ? "rgba(255,255,255,0.18)" : vars.g200;
  const numColor = light ? "#FFFFFF" : vars.navy;
  const subColor = light ? "rgba(255,255,255,0.7)" : vars.g500;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={trackColor} strokeWidth={10} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={scoreColor} strokeWidth={10}
          strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`} className="transition-all duration-700" />
      </svg>
      <div className="text-center z-10">
        <span className="text-5xl font-bold tracking-tight" style={{ color: numColor }}>{score}</span>
        <span className="text-base font-medium ml-1" style={{ color: subColor }}>/100</span>
      </div>
    </div>
  );
}

function DashboardPage({
  onNavigate,
  activeClient,
}: {
  onNavigate: (p: string) => void;
  activeClient: Client;
}) {
  useContentStore();

  // ── Audit-lock state (fetched from server) ────────────────────────────────
  type AuditLockInfo = { locked: boolean; lastRunAt?: string; nextAvailableAt?: string; daysRemaining?: number };
  const [earnedAuditLock, setEarnedAuditLock] = useState<AuditLockInfo>({ locked: false });
  const [websiteAuditLock, setWebsiteAuditLock] = useState<AuditLockInfo>({ locked: false });

  useEffect(() => {
    if (!activeClient.id) return;
    const base = import.meta.env.DEV ? `https://${window.location.host}` : "";
    fetch(`${base}/api/audit-lock?projectId=${encodeURIComponent(activeClient.id)}&auditType=visibility`, { credentials: "include" })
      .then((r) => r.json())
      .then((d: AuditLockInfo) => setEarnedAuditLock(d))
      .catch(() => {});
    fetch(`${base}/api/audit-lock?projectId=${encodeURIComponent(activeClient.id)}&auditType=website`, { credentials: "include" })
      .then((r) => r.json())
      .then((d: AuditLockInfo) => setWebsiteAuditLock(d))
      .catch(() => {});
  }, [activeClient.id]);

  // ── Live audit data ───────────────────────────────────────────────────────
  const savedAudits = loadSavedAudits(activeClient.id);
  const latestAudit = savedAudits.length > 0 ? savedAudits[0] : null;

  const savedDiagnostics = loadSavedDiagnostics(activeClient.id);
  const latestDiagnostic = savedDiagnostics.length > 0 ? savedDiagnostics[0] : null;

  // ── Live archive + planner ─────────────────────────────────────────────
  const allArchiveItems = loadArchive(activeClient.id).filter((a) => !a.id.startsWith("seed-"));
  const archiveDraft = allArchiveItems.filter((a) => a.status === "Draft").length;
  const archiveFinal = allArchiveItems.filter((a) => a.status === "Final").length;

  const livePlannerProjects = loadPlannerProjects(activeClient.id);

  // ── Intake completion ─────────────────────────────────────────────────
  const intakeData = loadIntakeData();
  const fd = intakeData?.formData ?? {};
  const duals = intakeData?.duals ?? {};
  const intakeSections: [string, boolean][] = [
    ["Business Fundamentals", !!(fd["1.1"] || duals["1.2"]?.short)],
    ["GEO Priority", !!(fd["2.1"] || fd["2.6"] || fd["2.7"] || (intakeData?.products?.length ?? 0) > 0)],
    ["Spokespersons", (intakeData?.spokespeople?.length ?? 0) > 0],
    ["AI Presence", !!(fd["3.1"] || fd["4.1"])],
    ["Content Audit", !!(fd["4.8"] || fd["5.1"] || fd["5.2"])],
    ["Goals & Strategy", !!(fd["6.1"] || fd["6.2"] || Object.keys(fd).some((k) => k.startsWith("6.")))],
  ];
  const intakeCompleted = intakeSections.filter(([, done]) => done).length;
  const intakePct = Math.round((intakeCompleted / intakeSections.length) * 100);

  // ── Scores ────────────────────────────────────────────────────────────
  const earnedScore: number | null = latestAudit ? authorityIndexFor(latestAudit.result) : null;
  const websiteScore: number | null = latestDiagnostic?.result.overallScore ?? null;

  // ── LLM model data from latest audit ─────────────────────────────────
  const llmModels = latestAudit
    ? [
        { name: "ChatGPT", mentioned: latestAudit.result.byModel.chatgpt.mentions > 0 },
        { name: "Claude", mentioned: latestAudit.result.byModel.claude.mentions > 0 },
      ]
    : [];
  const topCompetitors = latestAudit?.result.topCompetitors?.slice(0, 3).map((c) => c.name) ?? [];
  const auditDate = latestAudit
    ? new Date(latestAudit.savedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;
  const diagnosticDate = latestDiagnostic
    ? new Date(latestDiagnostic.savedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;

  const earnedLockDate = earnedAuditLock.lastRunAt
    ? new Date(earnedAuditLock.lastRunAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;
  const websiteLockDate = websiteAuditLock.lastRunAt
    ? new Date(websiteAuditLock.lastRunAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;

  // ── Website top categories ────────────────────────────────────────────
  const topDiagCategories = latestDiagnostic
    ? [...latestDiagnostic.result.categories]
        .map((c) => ({ name: c.name, pct: c.max > 0 ? c.score / c.max : 0 }))
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 3)
    : [];

  const ink = "#102B36";
  const accentPink = "#C8497A";
  const accentSoft = "#FBE3ED";

  return (
    <div className="px-4 sm:px-8 py-8 sm:py-10 max-w-6xl mx-auto">
      <div className="mb-7 sm:mb-9">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-3" style={{ background: accentSoft, border: `1px solid ${accentPink}40` }}>
          <Sparkles size={12} color={accentPink} />
          <span className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: accentPink }}>Authority Dashboard</span>
        </div>
        <h1 className="text-3xl sm:text-4xl tracking-tight leading-[1.1]" style={{ color: "#ffffff", fontFamily: "'Alice', Georgia, serif" }}>
          {activeClient.name}
        </h1>
        <p className="text-[15px] font-light mt-2" style={{ color: "rgba(255,255,255,0.85)" }}>
          Your AI authority performance at a glance.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-6">
        <div className="group flex flex-col min-h-[220px] rounded-2xl border p-4 sm:p-6 transition-all duration-300 bg-[#FBF1F0] hover:-translate-y-2 hover:shadow-xl hover:ring-[3px] hover:ring-[#C8497A] hover:bg-[#F3D7D5]" style={{ borderColor: "#e2e8f0" }}>
          <h3 className="text-[13px] font-bold uppercase tracking-[0.15em] mb-4 flex items-center" style={{ color: vars.navy }}>
            Project Set-Up
            <InfoTip text="The onboarding questionnaire that captures the business profile, messaging, spokespeople and target media. Once accepted it becomes the signed-off Project Data brief used to optimise every piece of content." />
          </h3>
          <div className="flex items-center gap-3 mb-3">
            <div className="relative w-14 h-14 flex-shrink-0">
              <svg width={56} height={56} viewBox="0 0 56 56">
                <circle cx={28} cy={28} r={22} fill="none" stroke={vars.g200} strokeWidth={5} />
                <circle cx={28} cy={28} r={22} fill="none" stroke={intakePct >= 80 ? vars.green : intakePct >= 40 ? vars.amber : vars.red}
                  strokeWidth={5} strokeDasharray={`${(intakePct / 100) * 138} 138`} strokeLinecap="round" transform="rotate(-90 28 28)" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color: vars.navy }}>{intakePct}%</span>
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: vars.navy }}>{intakeCompleted} of {intakeSections.length}</p>
              <p className="text-xs font-light" style={{ color: vars.g500 }}>sections complete</p>
            </div>
          </div>
          <div className="space-y-1.5">
            {intakeSections.map(([label, done]) => (
              <div key={label} className="flex items-center gap-2">
                {done ? <CheckCircle2 size={13} color={vars.green} /> : <Circle size={13} color={vars.g300} />}
                <span className="text-[12px]" style={{ color: done ? vars.navy : vars.g400 }}>{label}</span>
              </div>
            ))}
          </div>
          <button onClick={() => onNavigate("intake")} className="mt-4 text-xs font-medium flex items-center gap-1 hover:underline" style={{ color: vars.accent }}>
            {intakePct < 100 ? "Continue Project Set-Up" : "View Project Set-Up"} <ArrowRight size={12} />
          </button>
        </div>

        <div className="group flex flex-col min-h-[220px] rounded-2xl border p-4 sm:p-6 transition-all duration-300 bg-[#FBF1F0] hover:-translate-y-2 hover:shadow-xl hover:ring-[3px] hover:ring-[#C8497A] hover:bg-[#F3D7D5]" style={{ borderColor: "#e2e8f0" }}>
          <h3 className="text-[13px] font-bold uppercase tracking-[0.15em] mb-4 flex items-center" style={{ color: vars.navy }}>
            Earned Media Visibility Audit
            <InfoTip text="Shows whether AI models mention your brand when asked about your sector. We sample real questions across ChatGPT, Claude, Perplexity, Gemini and CoPilot." />
          </h3>
          {earnedScore === null ? (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <Eye size={28} color={vars.g300} className="mb-2" />
              <p className="text-[13px] font-medium mb-1" style={{ color: vars.g500 }}>No audit run yet</p>
              <p className="text-[12px] font-light mb-3" style={{ color: vars.g400 }}>Run the Earned Media Visibility Audit to see your AI mention score.</p>
              {earnedLockDate
                ? <p className="text-[11px]" style={{ color: vars.g400 }}>Last run: {earnedLockDate}</p>
                : <p className="text-[11px]" style={{ color: vars.g300 }}>Never run</p>}
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center text-center mb-4">
                <div className="relative w-24 h-24 flex-shrink-0 mb-3">
                  <svg width={96} height={96} viewBox="0 0 96 96">
                    <circle cx={48} cy={48} r={40} fill="none" stroke={vars.g200} strokeWidth={7} />
                    <circle cx={48} cy={48} r={40} fill="none"
                      stroke={earnedScore >= 60 ? vars.green : earnedScore >= 30 ? vars.amber : vars.red}
                      strokeWidth={7} strokeDasharray={`${(earnedScore / 100) * 251} 251`} strokeLinecap="round" transform="rotate(-90 48 48)" />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold" style={{ color: vars.navy }}>{earnedScore}</span>
                </div>
                <div className="w-full space-y-1.5">
                  {llmModels.map((m) => (
                    <div key={m.name} className="flex items-center justify-center gap-2">
                      {m.mentioned ? <CheckCircle2 size={14} color={vars.green} /> : <XCircle size={14} color={vars.red} />}
                      <span className="text-[13px]" style={{ color: vars.navy }}>{m.name}</span>
                    </div>
                  ))}
                  {(earnedLockDate || auditDate) && <p className="text-[11px] mt-1" style={{ color: vars.g400 }}>Last run {earnedLockDate ?? auditDate}</p>}
                </div>
              </div>
              {topCompetitors.length > 0 && (
                <div className="mb-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-1.5" style={{ color: vars.g400 }}>Top competitors cited instead</p>
                  <div className="flex flex-wrap gap-1.5">
                    {topCompetitors.map((c) => (
                      <span key={c} className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: "rgba(176,61,51,0.06)", color: vars.red }}>
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          <button onClick={() => onNavigate("llm-check")} className="mt-auto text-xs font-medium flex items-center gap-1 hover:underline" style={{ color: vars.accent }}>
            {earnedAuditLock.locked
              ? <><Lock size={11} />View Audit (locked)</>
              : earnedScore === null ? "Run Earned Media Visibility Audit" : "View / Re-run Audit"}
            <ArrowRight size={12} />
          </button>
        </div>

        <div className="group flex flex-col min-h-[220px] rounded-2xl border p-4 sm:p-6 transition-all duration-300 bg-[#FBF1F0] hover:-translate-y-2 hover:shadow-xl hover:ring-[3px] hover:ring-[#C8497A] hover:bg-[#F3D7D5]" style={{ borderColor: "#e2e8f0" }}>
          <h3 className="text-[13px] font-bold uppercase tracking-[0.15em] mb-4 flex items-center" style={{ color: vars.navy }}>
            Website Visibility Audit
            <InfoTip text="Score for how well your website is structured for AI citation - schema, crawlability, entity clarity, internal authority graph." />
          </h3>
          {websiteScore === null ? (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <Globe size={28} color={vars.g300} className="mb-2" />
              <p className="text-[13px] font-medium mb-1" style={{ color: vars.g500 }}>No audit run yet</p>
              <p className="text-[12px] font-light mb-3" style={{ color: vars.g400 }}>Run the Website Visibility Audit to score your site for AI citation readiness.</p>
              {websiteLockDate
                ? <p className="text-[11px]" style={{ color: vars.g400 }}>Last run: {websiteLockDate}</p>
                : <p className="text-[11px]" style={{ color: vars.g300 }}>Never run</p>}
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center text-center mb-4">
                <div className="relative w-24 h-24 flex-shrink-0 mb-3">
                  <svg width={96} height={96} viewBox="0 0 96 96">
                    <circle cx={48} cy={48} r={40} fill="none" stroke={vars.g200} strokeWidth={7} />
                    <circle cx={48} cy={48} r={40} fill="none"
                      stroke={websiteScore >= 70 ? vars.green : websiteScore >= 40 ? vars.amber : vars.red}
                      strokeWidth={7} strokeDasharray={`${(websiteScore / 100) * 251} 251`} strokeLinecap="round" transform="rotate(-90 48 48)" />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold" style={{ color: vars.navy }}>{websiteScore}</span>
                </div>
                <div className="w-full space-y-1.5">
                  {topDiagCategories.map((cat) => (
                    <div key={cat.name} className="flex items-center justify-center gap-2">
                      {cat.pct >= 0.7 ? <CheckCircle2 size={14} color={vars.green} /> : cat.pct >= 0.4 ? <AlertTriangle size={14} color={vars.amber} /> : <XCircle size={14} color={vars.red} />}
                      <span className="text-[13px] truncate" style={{ color: vars.navy }}>{cat.name}</span>
                    </div>
                  ))}
                  {(websiteLockDate || diagnosticDate) && <p className="text-[11px] mt-1" style={{ color: vars.g400 }}>Last run {websiteLockDate ?? diagnosticDate}</p>}
                </div>
              </div>
            </>
          )}
          <button onClick={() => onNavigate("diagnostic")} className="mt-auto text-xs font-medium flex items-center gap-1 hover:underline" style={{ color: vars.accent }}>
            {websiteAuditLock.locked
              ? <><Lock size={11} />View Audit (locked)</>
              : websiteScore === null ? "Run Website Visibility Audit" : "View / Re-run Audit"}
            <ArrowRight size={12} />
          </button>
        </div>
      </div>

      {/* Content Activity stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 mb-6">
        {[
          { label: "Total Articles", value: allArchiveItems.length, icon: FileText, color: vars.accent, tip: "All content items saved in the Archive for this project.", nav: "archive", cta: "Open Archive" },
          { label: "In Planner", value: livePlannerProjects.length, icon: Calendar, color: vars.teal, tip: "Items in the Comms Planner across all statuses.", nav: "planner", cta: "Open Comms Planner" },
          { label: "In Draft", value: archiveDraft, icon: FileEdit, color: vars.amber, tip: "Archive items currently in draft - not yet finalised.", nav: "archive", cta: "Open Archive" },
          { label: "Final / Ready", value: archiveFinal, icon: CheckCircle2, color: vars.green, tip: "Archive items marked Final - approved and ready to send.", nav: "archive", cta: "Open Archive" },
        ].map((s) => (
          <div key={s.label} className="group flex flex-col min-h-[220px] rounded-2xl border p-4 sm:p-6 transition-all duration-300 bg-[#FBF1F0] hover:-translate-y-2 hover:shadow-xl hover:ring-[3px] hover:ring-[#C8497A] hover:bg-[#F3D7D5]" style={{ borderColor: "#e2e8f0" }}>
            <h3 className="text-[13px] font-bold uppercase tracking-[0.15em] mb-4 flex items-center" style={{ color: vars.navy }}>
              {s.label}
              <InfoTip text={s.tip} />
            </h3>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${s.color}15` }}>
                <s.icon size={24} color={s.color} />
              </div>
              <p className="text-4xl font-bold leading-none tracking-tight" style={{ color: vars.navy }}>{s.value}</p>
            </div>
            <button onClick={() => onNavigate(s.nav)} className="mt-auto text-xs font-medium flex items-center gap-1 hover:underline" style={{ color: vars.accent }}>
              {s.cta} <ArrowRight size={12} />
            </button>
          </div>
        ))}
      </div>

    </div>
  );
}

type Rating = "green" | "amber" | "red";

export { AuthorityDonut, DashboardPage };
