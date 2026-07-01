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
import { loadSavedAudits } from "../LlmCheckPage";
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
  const latestAudit = savedAudits.length > 0 ? savedAudits[savedAudits.length - 1] : null;
  const prevAudit = savedAudits.length > 1 ? savedAudits[savedAudits.length - 2] : null;

  const savedDiagnostics = loadSavedDiagnostics(activeClient.id);
  const latestDiagnostic = savedDiagnostics.length > 0 ? savedDiagnostics[savedDiagnostics.length - 1] : null;
  const prevDiagnostic = savedDiagnostics.length > 1 ? savedDiagnostics[savedDiagnostics.length - 2] : null;

  // ── Live archive + planner ─────────────────────────────────────────────
  const allArchiveItems = loadArchive(activeClient.id).filter((a) => !a.id.startsWith("seed-"));
  const archiveDraft = allArchiveItems.filter((a) => a.status === "Draft").length;
  const archiveFinal = allArchiveItems.filter((a) => a.status === "Final").length;

  const livePlannerProjects = loadPlannerProjects(activeClient.id);
  const plannerApproved = livePlannerProjects.filter((p) => p.status === "Approved").length;
  const plannerDrafting = livePlannerProjects.filter((p) => p.status === "Drafting" || p.status === "Review").length;
  const plannerPlanned = livePlannerProjects.filter((p) => p.status === "Planned").length;

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
  const earnedScore: number | null = latestAudit?.result.visibilityScore ?? null;
  const websiteScore: number | null = latestDiagnostic?.result.overallScore ?? null;
  const authorityScore = activeClient.avgScore ||
    (earnedScore !== null && websiteScore !== null ? Math.round((earnedScore + websiteScore) / 2) :
     earnedScore ?? websiteScore ?? 0);

  const earnedTrendRaw: number | null = latestAudit && prevAudit
    ? latestAudit.result.visibilityScore - prevAudit.result.visibilityScore : null;
  const websiteTrendRaw: number | null = latestDiagnostic && prevDiagnostic
    ? latestDiagnostic.result.overallScore - prevDiagnostic.result.overallScore : null;
  const totalTrend = activeClient.scoreTrend;

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

  // ── Comms planner summary ─────────────────────────────────────────────
  const plannerBreakdown = {
    total: livePlannerProjects.length,
    optimised: plannerApproved,
    drafts: plannerDrafting,
    planned: plannerPlanned,
  };

  // ── Predicted authority ───────────────────────────────────────────────
  const authorityDelta = Math.min(40, livePlannerProjects.length * 3);
  const plannerByType = livePlannerProjects.reduce<Record<string, number>>((acc, p) => {
    const key = p.contentType || "Other";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const predictedAuthority = {
    next6m: Math.min(100, authorityScore + authorityDelta),
    pieces: livePlannerProjects.length,
    delta: authorityDelta,
    byType: Object.entries(plannerByType).slice(0, 4),
  };

  // ── Activity pipeline: real archive items ─────────────────────────────
  const fmtDate = (iso: string) => {
    if (!iso) return "";
    try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); }
    catch { return iso; }
  };
  const pipelineItems = [...allArchiveItems]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      title: a.title,
      type: a.contentType,
      status: a.status === "Final" ? ("approved" as const) : ("draft" as const),
      date: fmtDate(a.createdAt),
    }));

  const quickActions = [
    { icon: ClipboardPaste, label: "Project Set-Up", sub: "Capture business profile and messaging", action: "intake" },
    { icon: Eye, label: "Earned Media Visibility Audit", sub: "Score AI brand mentions", action: "llm-check" },
    { icon: Search, label: "Website Visibility Audit", sub: "Score your site for AI citation", action: "diagnostic" },
    { icon: Calendar, label: "Comms Planner", sub: "Plan and score the PR / marketing schedule", action: "planner" },
    { icon: FileEdit, label: "Content Optimiser & Editor", sub: "Optimise and edit drafts", action: "optimiser" },
    { icon: BarChart3, label: "Measure & Report", sub: "Track AI authority and PR impact", action: "measure" },
  ];

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
        <h1 className="text-3xl sm:text-4xl tracking-tight leading-[1.1]" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>
          {activeClient.name}
        </h1>
        <p className="text-[15px] font-light mt-2" style={{ color: vars.g600 }}>
          Your AI authority performance at a glance.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-6">
        <div className="group rounded-2xl border p-4 sm:p-6 flex flex-col items-center transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:ring-[3px] hover:ring-white/60" style={{ background: vars.accent, borderColor: vars.accent, color: "white" }}>
          <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] mb-4 flex items-center" style={{ color: "#ffffff" }}>
            Authority Score
            <InfoTip text="Total authority score combining earned and website authority and visibility. LLM brief: 'Score Project [name] [URL] for authority and visibility in its market [Project Data S1] including earned and owned media – provide a score out of 100.'" />
          </h3>
          <AuthorityDonut score={authorityScore} size={130} light />
          <p className="text-sm font-light mt-2" style={{ color: "#ffffff" }}>Earned + Website combined</p>
          <button onClick={() => onNavigate("measure")} className="mt-4 text-xs font-medium flex items-center gap-1 hover:underline transition-all duration-300 group-hover:translate-x-0.5" style={{ color: "white" }}>
            Open Authority Report <ArrowRight size={12} />
          </button>
        </div>

        <div className="group rounded-2xl border p-4 sm:p-6 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:ring-[3px] hover:ring-[#C8497A]" style={{ background: "rgba(201,74,62,0.08)", borderColor: "#e2e8f0" }}>
          <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] mb-4 flex items-center" style={{ color: vars.g400 }}>
            Earned Media Visibility Audit
            <InfoTip text="Shows whether AI models mention your brand when asked about your sector. We sample real questions across ChatGPT, Claude, Perplexity, Gemini and CoPilot." />
          </h3>
          {earnedScore === null ? (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <Eye size={28} color={vars.g300} className="mb-2" />
              <p className="text-[12px] font-medium mb-1" style={{ color: vars.g500 }}>No audit run yet</p>
              <p className="text-[11px] font-light mb-3" style={{ color: vars.g400 }}>Run the Earned Media Visibility Audit to see your AI mention score.</p>
              {earnedLockDate
                ? <p className="text-[10px]" style={{ color: vars.g400 }}>Last run: {earnedLockDate}</p>
                : <p className="text-[10px]" style={{ color: vars.g300 }}>Never run</p>}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4 mb-3">
                <div className="relative w-16 h-16 flex-shrink-0">
                  <svg width={64} height={64} viewBox="0 0 64 64">
                    <circle cx={32} cy={32} r={26} fill="none" stroke={vars.g200} strokeWidth={5} />
                    <circle cx={32} cy={32} r={26} fill="none"
                      stroke={earnedScore >= 60 ? vars.green : earnedScore >= 30 ? vars.amber : vars.red}
                      strokeWidth={5} strokeDasharray={`${(earnedScore / 100) * 163} 163`} strokeLinecap="round" transform="rotate(-90 32 32)" />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ color: vars.navy }}>{earnedScore}%</span>
                </div>
                <div className="flex-1 space-y-1.5">
                  {llmModels.map((m) => (
                    <div key={m.name} className="flex items-center gap-2">
                      {m.mentioned ? <CheckCircle2 size={13} color={vars.green} /> : <XCircle size={13} color={vars.red} />}
                      <span className="text-[12px]" style={{ color: vars.navy }}>{m.name}</span>
                    </div>
                  ))}
                  {(earnedLockDate || auditDate) && <p className="text-[10px]" style={{ color: vars.g400 }}>Last run {earnedLockDate ?? auditDate}</p>}
                </div>
              </div>
              {topCompetitors.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] mb-1.5" style={{ color: vars.g400 }}>Top competitors cited instead</p>
                  <div className="flex flex-wrap gap-1.5">
                    {topCompetitors.map((c) => (
                      <span key={c} className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: "rgba(176,61,51,0.06)", color: vars.red }}>
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          <button onClick={() => onNavigate("llm-check")} className="text-xs font-medium flex items-center gap-1 hover:underline" style={{ color: vars.accent }}>
            {earnedAuditLock.locked
              ? <><Lock size={11} />View Audit (locked)</>
              : earnedScore === null ? "Run Earned Media Visibility Audit" : "View / Re-run Audit"}
            <ArrowRight size={12} />
          </button>
        </div>

        <div className="group rounded-2xl border p-4 sm:p-6 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:ring-[3px] hover:ring-[#C8497A]" style={{ background: "rgba(201,74,62,0.08)", borderColor: "#e2e8f0" }}>
          <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] mb-4 flex items-center" style={{ color: vars.g400 }}>
            Website Visibility Audit
            <InfoTip text="Score for how well your website is structured for AI citation - schema, crawlability, entity clarity, internal authority graph." />
          </h3>
          {websiteScore === null ? (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <Globe size={28} color={vars.g300} className="mb-2" />
              <p className="text-[12px] font-medium mb-1" style={{ color: vars.g500 }}>No audit run yet</p>
              <p className="text-[11px] font-light mb-3" style={{ color: vars.g400 }}>Run the Website Visibility Audit to score your site for AI citation readiness.</p>
              {websiteLockDate
                ? <p className="text-[10px]" style={{ color: vars.g400 }}>Last run: {websiteLockDate}</p>
                : <p className="text-[10px]" style={{ color: vars.g300 }}>Never run</p>}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4 mb-3">
                <div className="relative w-16 h-16 flex-shrink-0">
                  <svg width={64} height={64} viewBox="0 0 64 64">
                    <circle cx={32} cy={32} r={26} fill="none" stroke={vars.g200} strokeWidth={5} />
                    <circle cx={32} cy={32} r={26} fill="none"
                      stroke={websiteScore >= 70 ? vars.green : websiteScore >= 40 ? vars.amber : vars.red}
                      strokeWidth={5} strokeDasharray={`${(websiteScore / 100) * 163} 163`} strokeLinecap="round" transform="rotate(-90 32 32)" />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ color: vars.navy }}>{websiteScore}</span>
                </div>
                <div className="flex-1 space-y-1.5">
                  {topDiagCategories.map((cat) => (
                    <div key={cat.name} className="flex items-center gap-2">
                      {cat.pct >= 0.7 ? <CheckCircle2 size={13} color={vars.green} /> : cat.pct >= 0.4 ? <AlertTriangle size={13} color={vars.amber} /> : <XCircle size={13} color={vars.red} />}
                      <span className="text-[12px] truncate" style={{ color: vars.navy }}>{cat.name}</span>
                    </div>
                  ))}
                  {(websiteLockDate || diagnosticDate) && <p className="text-[10px]" style={{ color: vars.g400 }}>Last run {websiteLockDate ?? diagnosticDate}</p>}
                </div>
              </div>
            </>
          )}
          <button onClick={() => onNavigate("diagnostic")} className="text-xs font-medium flex items-center gap-1 hover:underline" style={{ color: vars.accent }}>
            {websiteAuditLock.locked
              ? <><Lock size={11} />View Audit (locked)</>
              : websiteScore === null ? "Run Website Visibility Audit" : "View / Re-run Audit"}
            <ArrowRight size={12} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-6">
        <div className="group rounded-2xl border p-4 sm:p-6 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:ring-[3px] hover:ring-[#C8497A]" style={{ background: "rgba(201,74,62,0.08)", borderColor: "#e2e8f0" }}>
          <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] mb-4 flex items-center" style={{ color: vars.g400 }}>
            Comms Planner
            <InfoTip text="Your forward plan of PR and marketing activity. Each item is scored for predicted AI authority impact and tracked through draft, review and approved." />
          </h3>
          {plannerBreakdown.total === 0 ? (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <Calendar size={28} color={vars.g300} className="mb-2" />
              <p className="text-[12px] font-medium mb-1" style={{ color: vars.g500 }}>No items planned yet</p>
              <p className="text-[11px] font-light mb-3" style={{ color: vars.g400 }}>Add content to the Comms Planner to track your PR pipeline.</p>
            </div>
          ) : (
            <>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-3xl font-bold" style={{ color: vars.navy }}>{plannerBreakdown.total}</span>
                <span className="text-sm font-light" style={{ color: vars.g500 }}>content items</span>
              </div>
              <div className="space-y-2.5 mb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: vars.green }} />
                    <span className="text-xs" style={{ color: vars.g500 }}>Approved</span>
                  </div>
                  <span className="text-xs font-semibold" style={{ color: vars.navy }}>{plannerBreakdown.optimised}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: vars.amber }} />
                    <span className="text-xs" style={{ color: vars.g500 }}>In Draft / Review</span>
                  </div>
                  <span className="text-xs font-semibold" style={{ color: vars.navy }}>{plannerBreakdown.drafts}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: vars.g300 }} />
                    <span className="text-xs" style={{ color: vars.g500 }}>Planned</span>
                  </div>
                  <span className="text-xs font-semibold" style={{ color: vars.navy }}>{plannerBreakdown.planned}</span>
                </div>
              </div>
              <div className="w-full h-2 rounded-full flex overflow-hidden mb-3" style={{ background: vars.g200 }}>
                <div className="h-full" style={{ width: `${plannerBreakdown.total > 0 ? (plannerBreakdown.optimised / plannerBreakdown.total) * 100 : 0}%`, background: vars.green }} />
                <div className="h-full" style={{ width: `${plannerBreakdown.total > 0 ? (plannerBreakdown.drafts / plannerBreakdown.total) * 100 : 0}%`, background: vars.amber }} />
              </div>
            </>
          )}
          <button onClick={() => onNavigate("planner")} className="text-xs font-medium flex items-center gap-1 hover:underline" style={{ color: vars.accent }}>
            Open Comms Planner <ArrowRight size={12} />
          </button>
        </div>

        <div className="group rounded-2xl border p-4 sm:p-6 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:ring-[3px] hover:ring-[#C8497A]" style={{ background: "rgba(201,74,62,0.08)", borderColor: "#e2e8f0" }}>
          <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] mb-4 flex items-center" style={{ color: vars.g400 }}>
            Predicted Earned Authority
            <InfoTip text="Scoring likely earned media authority generated by planned activity in the Comms Planner over the next six months." />
          </h3>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-3xl font-bold" style={{ color: vars.accent }}>{predictedAuthority.next6m}</span>
            <span className="text-xs font-medium" style={{ color: vars.green }}>+{predictedAuthority.delta} forecast</span>
          </div>
          <p className="text-[12px] font-light mb-3" style={{ color: vars.g500 }}>
            {predictedAuthority.pieces === 0 ? "Add items to the Comms Planner to generate a forecast." : `From ${predictedAuthority.pieces} planned piece${predictedAuthority.pieces === 1 ? "" : "s"} over the next 6 months.`}
          </p>
          {predictedAuthority.byType.length > 0 ? (
            <div className="space-y-1.5">
              {predictedAuthority.byType.map(([label, n]) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[12px]" style={{ color: vars.g500 }}>{label}</span>
                  <span className="text-[12px] font-semibold" style={{ color: vars.navy }}>{n}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-3 text-center">
              <TrendingUp size={24} color={vars.g300} className="mb-1" />
              <p className="text-[11px] font-light" style={{ color: vars.g400 }}>Forecast appears once content is planned.</p>
            </div>
          )}
          <button onClick={() => onNavigate("measure")} className="mt-3 text-xs font-medium flex items-center gap-1 hover:underline" style={{ color: vars.accent }}>
            See projection in report <ArrowRight size={12} />
          </button>
        </div>

        <div className="group rounded-2xl border p-4 sm:p-6 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:ring-[3px] hover:ring-[#C8497A]" style={{ background: "rgba(201,74,62,0.08)", borderColor: "#e2e8f0" }}>
          <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] mb-4 flex items-center" style={{ color: vars.g400 }}>
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
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {[
          {
            label: "Score Trend",
            value: totalTrend !== null && totalTrend !== undefined ? (totalTrend > 0 ? `+${totalTrend}` : String(totalTrend)) : "--",
            icon: TrendingUp,
            positive: (totalTrend ?? 0) > 0,
            hasData: totalTrend !== null && totalTrend !== undefined,
            tip: "Combined authority score change since the last scoring cycle.",
          },
          {
            label: "Earned Trend",
            value: earnedTrendRaw !== null ? (earnedTrendRaw > 0 ? `+${earnedTrendRaw}` : String(earnedTrendRaw)) : "--",
            icon: Eye,
            positive: (earnedTrendRaw ?? 0) > 0,
            hasData: earnedTrendRaw !== null,
            tip: "Change in earned media visibility score between the last two audits.",
          },
          {
            label: "Website Trend",
            value: websiteTrendRaw !== null ? (websiteTrendRaw > 0 ? `+${websiteTrendRaw}` : String(websiteTrendRaw)) : "--",
            icon: Globe,
            positive: (websiteTrendRaw ?? 0) > 0,
            hasData: websiteTrendRaw !== null,
            tip: "Change in website visibility score between the last two audits.",
          },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border p-4 sm:p-5 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:ring-[3px] hover:ring-[#C8497A]" style={{ background: "rgba(201,74,62,0.08)", borderColor: "#e2e8f0" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] flex items-center" style={{ color: vars.g500 }}>
                {stat.label}
                <InfoTip text={stat.tip} />
              </span>
              <stat.icon size={16} color={stat.hasData ? (stat.positive ? vars.green : vars.amber) : vars.g300} />
            </div>
            <span className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: stat.hasData ? (stat.positive ? vars.green : vars.amber) : vars.g400 }}>
              {stat.value}
            </span>
            {!stat.hasData && <p className="text-[11px] mt-1 font-medium" style={{ color: vars.g500 }}>Run 2+ audits to see trend</p>}
          </div>
        ))}
      </div>

      {/* Content Activity stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Articles", value: allArchiveItems.length, icon: FileText, color: vars.accent, tip: "All content items saved in the Archive for this project." },
          { label: "In Draft", value: archiveDraft, icon: FileEdit, color: vars.amber, tip: "Archive items currently in draft — not yet finalised." },
          { label: "Final / Ready", value: archiveFinal, icon: CheckCircle2, color: vars.green, tip: "Archive items marked Final — approved and ready to send." },
          { label: "In Planner", value: livePlannerProjects.length, icon: Calendar, color: vars.teal, tip: "Items in the Comms Planner across all statuses." },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border p-4 sm:p-5 flex items-center gap-3.5 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:ring-[3px] hover:ring-[#C8497A]" style={{ background: "rgba(201,74,62,0.08)", borderColor: "#e2e8f0" }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${s.color}15` }}>
              <s.icon size={20} color={s.color} />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold leading-none mb-1 tracking-tight" style={{ color: vars.navy }}>{s.value}</p>
              <p className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: vars.g500 }}>
                {s.label}
                <InfoTip text={s.tip} />
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border p-5 sm:p-7 mb-6" style={{ background: "white", borderColor: vars.g200 }}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg sm:text-xl font-bold flex items-center gap-1.5" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
            Activity Pipeline
            <InfoTip text="Your most recent content items from the Archive, sorted by date created. Click any item to open it." />
          </h3>
          <button onClick={() => onNavigate("archive")} className="text-[13px] font-bold uppercase tracking-wider flex items-center gap-1 hover:underline" style={{ color: vars.teal }}>
            View all <ArrowRight size={14} />
          </button>
        </div>
        {pipelineItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center bg-slate-50 rounded-xl">
            <FileText size={40} color={vars.g300} className="mb-4" />
            <p className="text-base font-semibold mb-1" style={{ color: vars.navy }}>No content created yet</p>
            <p className="text-[14px] font-medium mb-5" style={{ color: vars.g500 }}>Content you create in the Optimiser or Creator will appear here.</p>
            <button onClick={() => onNavigate("optimiser")} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold uppercase tracking-wider text-white transition-all hover:shadow-md hover:-translate-y-0.5" style={{ background: vars.teal }}>
              <FileEdit size={14} /> Create content
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {pipelineItems.map((item) => {
              const statusStyles = {
                "draft": { bg: "rgba(245,158,11,0.1)", color: vars.amber, label: "Draft" },
                "approved": { bg: "rgba(34,197,94,0.1)", color: vars.green, label: "Final" },
              };
              const st = statusStyles[item.status];
              return (
                <button key={item.id} onClick={() => onNavigate("archive")} className="w-full flex items-center gap-4 p-4 rounded-xl border text-left hover:bg-slate-50 transition-all hover:shadow-sm" style={{ borderColor: vars.g200 }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: st.bg }}>
                    <FileText size={18} color={st.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold truncate" style={{ color: vars.navy }}>{item.title}</p>
                    <p className="text-[13px] font-medium mt-0.5" style={{ color: vars.g500 }}>{item.type}{item.date ? ` · ${item.date}` : ""}</p>
                  </div>
                  <span className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider flex-shrink-0" style={{ background: st.bg, color: st.color }}>
                    {st.label}
                  </span>
                  <ArrowRight size={16} className="ml-2" color={vars.g400} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-5">
        {quickActions.map((link) => (
          <div key={link.label} onClick={() => onNavigate(link.action)}
            className="rounded-2xl border p-5 sm:p-6 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 group"
            style={{ background: "white", borderColor: vars.g200 }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110" style={{ background: "rgba(79,143,255,0.1)" }}>
              <link.icon size={24} color={vars.teal} />
            </div>
            <p className="text-[15px] font-bold leading-tight" style={{ color: vars.navy }}>{link.label}</p>
            <p className="text-[12px] font-medium mt-1.5 leading-snug" style={{ color: vars.g500 }}>{link.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

type Rating = "green" | "amber" | "red";

export { AuthorityDonut, DashboardPage };
