import { useState, useEffect, useMemo, useRef } from "react";
import {
  ChevronRight, ChevronLeft, Lock, Search, FileEdit, BarChart3, Archive, Send, LineChart, ArrowRight, Sparkles, Loader2,
  TrendingUp, FileText, FileCheck2, Target, Code2, HelpCircle, MessageSquareQuote, Bot, ShieldCheck,
  MessagesSquare, Download, AlertTriangle, CheckCircle2, XCircle, Info, Globe, Tag, User, ChevronDown,
  Plus, Minus, MessageSquare, BookOpen, Scroll, Award, Radio, Mic2, PenLine, ClipboardList,
  Lightbulb, ClipboardPaste, Upload, Calendar, CalendarDays, Check, Save, Circle, Zap, Mail, Shield, Eye, Building2,
  ArrowLeft, LogOut, Trash2, KeyRound, Users, Activity, Play, ChevronUp, Menu, X, LogIn,
  Link as LinkIcon, Image as ImageIcon, Repeat, TrendingDown, FolderOpen, List as ListIcon, Clock,
  Undo2, ArchiveRestore, RefreshCw, MonitorSmartphone,
} from "lucide-react";
import { vars } from "../marketing/vars";
import { loadPlannerProjects, savePlannerProjects, useContentStore, getContentStoreState, initContentStore, loadArchive, saveArchive, archiveItemForPlanner, plannerProjectForArchive, getISOWeek, weekDateLabel, DEFAULT_SCORING, STATUS_COLOURS, scoreProject, aggregatePlanScore, loadScoringConfig, saveScoringConfig, type PlannerProject, type PlannerStatus, type ScoringConfig } from "../lib/contentStore";
import { getKeyMessages, getSpokespeople, getActiveProjectId, loadIntakeData } from "../IntakeForm";
import { getExactTargetPhrases as getCanonicalExactTargetPhrases } from "../lib/exactTargetPhrases";
import { CONTENT_TYPES } from "./shared";
import InfoTip from "../InfoTip";

type PlannerDialogProps = {
  titleId: string;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
};

/**
 * The planner predates the shared dialog components. Keep its dialogs local,
 * but give all of them the same keyboard and focus behaviour.
 */
function PlannerDialog({ titleId, initialFocusRef, onClose, children, className = "" }: PlannerDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const getFocusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => !element.hasAttribute("aria-hidden"));
    const focusTarget = initialFocusRef?.current || getFocusable()[0] || dialog;
    requestAnimationFrame(() => focusTarget.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocus?.isConnected) requestAnimationFrame(() => previousFocus.focus());
    };
  }, [initialFocusRef]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close dialog"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative z-10 ${className}`}
      >
        {children}
      </div>
    </div>
  );
}

function PlannerPage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const contentVersion = useContentStore();
  const [projects, setProjects] = useState<PlannerProject[]>(() => loadPlannerProjects());
  useEffect(() => { setProjects(loadPlannerProjects()); }, [contentVersion]);
  const [editing, setEditing] = useState<PlannerProject | null>(null);
  const plannerKeyMessages = useMemo(() => getKeyMessages(), [editing?.id]);
  const projectPhrases = useMemo(() => {
    const data = loadIntakeData();
    return getCanonicalExactTargetPhrases(data?.llmQueries as { v?: 1; discovery?: string[]; shortlist?: string[]; comparison?: string[] } | undefined);
  }, [contentVersion, editing?.id]);
  const [showArchivePicker, setShowArchivePicker] = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);
  const methodologyTriggerRef = useRef<HTMLButtonElement>(null);
  const archivePickerTriggerRef = useRef<HTMLButtonElement>(null);
  const methodologyCloseRef = useRef<HTMLButtonElement>(null);
  const archivePickerCloseRef = useRef<HTMLButtonElement>(null);
  const editTitleRef = useRef<HTMLInputElement>(null);
  const archive = useMemo(() => loadArchive(), [showArchivePicker, contentVersion]);

  const sendToOptimiser = (item?: PlannerProject | string) => {
    const preloadId = typeof item === "string" ? item : item?.sourceArchiveId || item?.id;
    if (preloadId) {
      try { localStorage.setItem("aio.optimiser.preload", preloadId); } catch { /* noop */ }
    }
    onNavigate("optimiser");
  };
  const sendToMediaResearch = async (item: PlannerProject) => {
    // Planner IDs are not archive IDs. Legacy/direct planner items receive a
    // canonical archive record first; the snapshot is retained exactly as-is,
    // including an intentionally empty body.
    let archiveId = item.sourceArchiveId;
    if (!archiveId) {
      const createdAt = new Date().toISOString();
      // Deterministic per planner row: if archive persistence succeeded but
      // linking the planner row failed, retrying cannot create a duplicate.
      archiveId = `arch-from-planner-${item.id}`;
      const archiveItem = archiveItemForPlanner(item, archiveId, createdAt);
      try {
        await saveArchive([archiveItem, ...loadArchive().filter((existing) => existing.id !== archiveItem.id)]);
        const linked = { ...item, ...plannerProjectForArchive(archiveItem, item, {
          keyMessage: item.keyMessage,
          audience: item.audience,
          channels: item.channels,
          week: item.week,
          status: item.status,
          releaseDate: item.releaseDate,
          notes: item.notes,
        }) };
        if (!await update(projects.map((project) => project.id === item.id ? linked : project))) {
          setSaveError("The article was saved to Content Library, but its planner link was not saved. Retry Media Research to finish linking it.");
          return;
        }
      } catch {
        setSaveError("The article could not be saved before Media Research. Check your connection and retry.");
        return;
      }
    }
    try { localStorage.setItem("aio.research.preload", archiveId); } catch { /* noop */ }
    onNavigate("media-research");
  };
  const RESEARCH_TYPES = ["Press release", "Article", "Case study", "Whitepaper", "Blog post"];
  const [cfg, setCfg] = useState<ScoringConfig>(() => loadScoringConfig());
  useEffect(() => { setCfg(loadScoringConfig()); }, [contentVersion]);
  const [showSettings, setShowSettings] = useState(false);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState<"cards" | "spreadsheet">("spreadsheet");
  const storeState = getContentStoreState();
  const [saveError, setSaveError] = useState("");
  const update = async (next: PlannerProject[]) => {
    setSaveError("");
    try { await savePlannerProjects(next); return true; }
    catch { setSaveError(getContentStoreState().mutationError === "authentication" ? "Your session expired. Sign in again before retrying." : "Your change was not saved. Check your connection and retry."); return false; }
  };
  const updateCfg = async (next: ScoringConfig) => {
    setSaveError("");
    try { await saveScoringConfig(next); }
    catch { setSaveError(getContentStoreState().mutationError === "authentication" ? "Your session expired. Sign in again before retrying." : "Your scoring settings were not saved. Check your connection and retry."); return false; }
    const types = Object.keys(next.typeWeights);
    const fallbackType = types[0] || "Press release";
    const normalised = projects.map((p) => ({
      ...p,
      channels: p.channels.filter((c) => next.channels.includes(c)),
      contentType: next.typeWeights[p.contentType] ? p.contentType : fallbackType,
    }));
    if (!await update(normalised)) return false;
    return true;
  };
  const addProject = () => {
    const w = getISOWeek(new Date());
    const defaultType = Object.keys(cfg.typeWeights)[0] || "Press release";
    const defaultChannel = cfg.channels[0];
    const np: PlannerProject = {
      id: `proj-${Date.now()}`,
      title: "New project",
      contentType: defaultType,
      spokesperson: "",
      keyMessage: "",
      audience: "",
      channels: defaultChannel ? [defaultChannel] : [],
      week: w,
      status: "Planned",
      releaseDate: "",
      notes: "",
    };
    void update([np, ...projects]).then((saved) => { setEditing(np); if (!saved) setSaveError("The new project was not saved. Its draft is still open so you can retry."); });
  };
  const addProjectFromArchive = (item: (typeof archive)[number]) => {
    const w = getISOWeek(new Date());
    const defaultType = Object.keys(cfg.typeWeights)[0] || item.contentType || "Press release";
    const existing = projects.find((project) => project.sourceArchiveId === item.id);
    const np: PlannerProject = plannerProjectForArchive(item, existing, {
      keyMessage: item.selectedMessages?.[0] || "",
      audience: item.mediaCats?.[0] || "",
      channels: cfg.channels[0] ? [cfg.channels[0]] : [],
      week: w,
      status: "Planned",
      releaseDate: "",
      notes: "",
    });
    void update([np, ...projects.filter((project) => project.id !== np.id)]).then((saved) => {
      setEditing(np);
      setShowArchivePicker(false);
      if (!saved) setSaveError("The archived content was not added. Its draft is still open so you can retry.");
    });
  };
  const saveEdit = async () => {
    if (!editing) return;
    const exists = projects.some((p) => p.id === editing.id);
    const next = exists ? projects.map((p) => (p.id === editing.id ? editing : p)) : [editing, ...projects];
    if (await update(next)) setEditing(null);
  };
  const deleteProject = (id: string) => {
    if (!confirm("Delete this project?")) return;
    void update(projects.filter((p) => p.id !== id));
  };

  const startWeek = getISOWeek(new Date());
  const weeks = Array.from({ length: 8 }, (_, i) => startWeek + i);

  // --- Date range for calendar view ---
  const _getRangeKey = () => {
    try {
      const pid = getActiveProjectId();
      const id = pid && pid !== "default" ? pid : "default";
      return id === "default" ? "aio.planner.range.v1" : `aio.planner.range.v1::${id}`;
    } catch { return "aio.planner.range.v1"; }
  };
  const _defaultRangeStart = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const _defaultRangeEnd = () => {
    const d = new Date();
    d.setDate(d.getDate() + 49);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const [rangeStart, setRangeStart] = useState<string>(() => {
    try { const s = localStorage.getItem(_getRangeKey()); if (s) { const p = JSON.parse(s); if (p.start) return p.start; } } catch { /* noop */ }
    return _defaultRangeStart();
  });
  const [rangeEnd, setRangeEnd] = useState<string>(() => {
    try { const s = localStorage.getItem(_getRangeKey()); if (s) { const p = JSON.parse(s); if (p.end) return p.end; } } catch { /* noop */ }
    return _defaultRangeEnd();
  });
  useEffect(() => {
    try { localStorage.setItem(_getRangeKey(), JSON.stringify({ start: rangeStart, end: rangeEnd })); } catch { /* noop */ }
  }, [rangeStart, rangeEnd]);
  const resetRange = () => {
    try { localStorage.removeItem(_getRangeKey()); } catch { /* noop */ }
    setRangeStart(_defaultRangeStart());
    setRangeEnd(_defaultRangeEnd());
  };
  const calendarWeeks = useMemo(() => {
    const start = rangeStart ? new Date(rangeStart + "T00:00:00") : new Date();
    const end = rangeEnd ? new Date(rangeEnd + "T00:00:00") : new Date();
    // Normalize each date to the Monday of its ISO week so week boundaries
    // are respected regardless of which day of the week the user picks.
    const mondayOf = (d: Date): Date => {
      const day = d.getDay() || 7;
      const mon = new Date(d);
      mon.setDate(d.getDate() - (day - 1));
      return mon;
    };
    const startMon = mondayOf(start);
    const endMon = mondayOf(end);
    if (endMon < startMon) return [getISOWeek(startMon)];
    const result: number[] = [];
    const cur = new Date(startMon);
    while (cur <= endMon && result.length < 52) {
      result.push(getISOWeek(cur));
      cur.setDate(cur.getDate() + 7);
    }
    return result;
  }, [rangeStart, rangeEnd]);

  const calendarScrollRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const [calendarScrollState, setCalendarScrollState] = useState({ canLeft: false, canRight: false });
  const [calendarScrollWidth, setCalendarScrollWidth] = useState(0);
  useEffect(() => {
    const el = calendarScrollRef.current;
    const topEl = topScrollRef.current;
    if (!el || view !== "spreadsheet") {
      setCalendarScrollState({ canLeft: false, canRight: false });
      return;
    }
    let syncing = false;
    const update = () => {
      setCalendarScrollState({
        canLeft: el.scrollLeft > 4,
        canRight: el.scrollLeft < el.scrollWidth - el.clientWidth - 4,
      });
      setCalendarScrollWidth(el.scrollWidth);
      if (topEl && !syncing) {
        syncing = true;
        topEl.scrollLeft = el.scrollLeft;
        syncing = false;
      }
    };
    const onTopScroll = () => {
      if (!syncing) {
        syncing = true;
        el.scrollLeft = topEl!.scrollLeft;
        syncing = false;
      }
    };
    // Use rAF so layout is fully computed before we measure scrollWidth
    const raf = requestAnimationFrame(update);
    el.addEventListener("scroll", update, { passive: true });
    topEl?.addEventListener("scroll", onTopScroll, { passive: true });
    window.addEventListener("resize", update);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", update);
      topEl?.removeEventListener("scroll", onTopScroll);
      window.removeEventListener("resize", update);
      ro.disconnect();
    };
  }, [view, projects, cfg]);

  const byType = projects.reduce((acc, p) => {
    const s = scoreProject(p, cfg);
    acc[p.contentType] = (acc[p.contentType] || 0) + s.visibility + s.authority;
    return acc;
  }, {} as Record<string, number>);
  const planScore = aggregatePlanScore(projects, cfg);
  const totals = { visibility: planScore.visibility, authority: planScore.authority, byType };
  const projectedTotal = planScore.total;
  const visPct = Math.round((planScore.visibility / 50) * 100);
  const authPct = Math.round((planScore.authority / 50) * 100);

  const ink = "#102B36";
  const paper = "#FBF6EC";
  const accentPink = "#C8497A";
  const accentSoft = "#FBE3ED";

  useEffect(() => {
    let el: HTMLElement | null = topScrollRef.current;
    while (el) {
      const oy = window.getComputedStyle(el).overflowY;
      if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) {
        el.scrollTo({ top: 0 });
        return;
      }
      el = el.parentElement;
    }
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <div ref={topScrollRef} className="p-6 sm:p-8 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <CalendarDays size={26} color="#ffffff" />
          <h1 className="aio-type-page-title mb-2" style={{ color: "#ffffff" }}>Comms Planner</h1>
        </div>
        <p className="aio-type-body max-w-5xl" style={{ color: "rgba(255,255,255,0.85)" }}>Plan your PR and marketing schedule in one place and see a configurable estimate of its visibility and authority potential. The score responds to content type, selected release channels and workflow status. Click any content item to open and edit it in the Content Optimiser.</p>
      </div>

      {storeState.status === "loading" && (
        <div className="rounded-xl px-4 py-3 mb-4 text-[13px] font-light flex items-center gap-2" style={{ background: accentSoft, color: ink, border: `1px solid ${accentPink}30` }}>
          <span className="inline-block w-3 h-3 rounded-full animate-pulse" style={{ background: accentPink }} />
          Loading your planner content from the server…
        </div>
      )}
      {(storeState.status === "network-error" || storeState.status === "authentication-error" || saveError || storeState.mutationPending) && (
        <div className="rounded-xl px-4 py-3 mb-4 text-[13px] flex items-center justify-between gap-3" style={{ background: "white", color: ink, border: `1px solid ${storeState.mutationPending ? accentPink : "#C94A3E"}` }}>
          <span>{storeState.mutationPending ? "Saving changes…" : saveError || (storeState.status === "authentication-error" ? "Your session expired. Sign in again to load the planner." : "We could not load your planner. Saved content has not been replaced.")}</span>
          {storeState.status === "network-error" && <button onClick={() => void initContentStore()} className="aio-button aio-button--primary aio-button--compact focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500" style={{ background: accentPink }}><RefreshCw />Retry</button>}
        </div>
      )}

      {/* Action toolbar - Variant C ink panel */}
      <div className="rounded-2xl p-4 sm:p-5 mb-6" style={{ background: ink, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.25)" }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded-full p-1" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }} role="group" aria-label="Planner view">
              <button aria-label="Calendar View" onClick={() => setView("spreadsheet")} aria-pressed={view === "spreadsheet"} className="aio-button aio-button--compact focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white w-[120px] rounded-full uppercase tracking-[0.12em] transition-colors" style={{ background: view === "spreadsheet" ? accentPink : "transparent", color: view === "spreadsheet" ? "white" : "rgba(251,246,236,0.7)" }}>
                <Calendar size={12} /> Calendar View
              </button>
              <button aria-label="List View" onClick={() => setView("cards")} aria-pressed={view === "cards"} className="aio-button aio-button--compact focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white w-[120px] rounded-full uppercase tracking-[0.12em] transition-colors" style={{ background: view === "cards" ? accentPink : "transparent", color: view === "cards" ? "white" : "rgba(251,246,236,0.7)" }}>
                <ListIcon size={12} /> List View
              </button>
            </div>
            <button ref={methodologyTriggerRef} aria-label="Open scoring methodology" onClick={() => setShowMethodology(true)} aria-haspopup="dialog" className="aio-button aio-button--compact focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-full uppercase tracking-[0.12em] transition-colors" style={{ background: "rgba(255,255,255,0.08)", color: paper, border: "1px solid rgba(255,255,255,0.18)" }} title="Scoring methodology">
              <HelpCircle size={13} /> Methodology
            </button>
            <button ref={settingsTriggerRef} aria-label="Open score settings" onClick={() => setShowSettings(true)} aria-haspopup="dialog" className="aio-button aio-button--compact focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-full uppercase tracking-[0.12em] transition-colors" style={{ background: "rgba(255,255,255,0.08)", color: paper, border: "1px solid rgba(255,255,255,0.18)" }} title="Score settings">
              <Shield size={13} /> Score Settings
            </button>
            <button ref={archivePickerTriggerRef} aria-label="Add from archive" onClick={() => setShowArchivePicker(true)} aria-haspopup="dialog" className="aio-button aio-button--compact focus-visible:outline-none focus:ring-white rounded-full uppercase tracking-[0.12em] transition-colors" style={{ background: "rgba(255,255,255,0.08)", color: paper, border: "1px solid rgba(255,255,255,0.18)" }} title="Add from archive">
              <Archive size={13} /> Add from Archive
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="rounded-2xl p-5" style={{ background: ink, color: paper, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.25)" }}>
          <p className="text-[13px] font-bold uppercase tracking-[0.2em]" style={{ color: "rgba(251,246,236,0.7)" }}>Projected total score</p>
          <p className="text-4xl font-bold mt-2" style={{ color: paper, fontFamily: "'Alice', Georgia, serif" }}>{projectedTotal}<span className="text-[14px] font-light" style={{ color: "rgba(251,246,236,0.5)" }}> / 100</span></p>
          <p className="text-[12px] font-light mt-1" style={{ color: "rgba(251,246,236,0.7)" }}>{projects.length} project{projects.length === 1 ? "" : "s"} in plan</p>
        </div>
        <div className="rounded-2xl p-5 border-2" style={{ background: "white", borderColor: `${accentPink}30` }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[13px] font-bold uppercase tracking-[0.2em]" style={{ color: ink }}>Visibility</p>
            <p className="text-[16px] font-bold" style={{ color: accentPink, fontFamily: "'Alice', Georgia, serif" }}>{Math.round(totals.visibility)}<span className="text-[12px] font-light" style={{ color: vars.g400 }}>/50</span></p>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ background: accentSoft }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${visPct}%`, background: accentPink }} />
          </div>
        </div>
        <div className="rounded-2xl p-5 border-2" style={{ background: "white", borderColor: `${vars.teal}30` }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[13px] font-bold uppercase tracking-[0.2em]" style={{ color: ink }}>Authority</p>
            <p className="text-[16px] font-bold" style={{ color: vars.teal, fontFamily: "'Alice', Georgia, serif" }}>{Math.round(totals.authority)}<span className="text-[12px] font-light" style={{ color: vars.g400 }}>/50</span></p>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ background: "rgba(40,150,185,0.15)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${authPct}%`, background: vars.teal }} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border-2 overflow-hidden mb-6" style={{ background: "white", borderColor: "rgba(16,43,54,0.12)" }}>
        <div className="px-5 py-4 flex items-center gap-3" style={{ background: ink }}>
          <span className="w-1.5 h-6 rounded-full" style={{ background: accentPink }} />
          <p className="text-[13px] font-bold uppercase tracking-[0.2em]" style={{ color: paper }}>Raw Item Points by Content Type</p>
          <span className="text-[12px] font-light ml-auto" style={{ color: "rgba(251,246,236,0.55)" }}>All {Object.keys(cfg.typeWeights).length} configured types</span>
        </div>
        <div className="p-6 flex flex-wrap gap-3">
          {Object.keys(cfg.typeWeights).sort((a, b) => (totals.byType[b] || 0) - (totals.byType[a] || 0)).map((t, i) => {
            const s = totals.byType[t] || 0;
            const hasScore = s > 0;
            return (
              <div
                key={t}
                className="aio-pop-in flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all duration-200 hover:-translate-y-1 hover:scale-105 hover:shadow-lg"
                style={{ background: "rgba(201,160,78,0.18)", borderColor: vars.gold, boxShadow: "0 3px 10px rgba(201,160,78,0.28)", opacity: hasScore ? 1 : 0.8, animationDelay: `${i * 60}ms` }}
              >
                <span className="text-[14px] font-bold" style={{ color: "#7A5E25" }}>{t}</span>
                <span
                  className="flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold shrink-0"
                  style={{ background: vars.gold, color: "white" }}
                >
                   {Math.round(s)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {view === "spreadsheet" && (() => {
        const SLOTS_PER_WEEK = 6;
        const TEAL = vars.navy;
        const TEAL_DARK = vars.navy;
        const SLOT_BG_A = "#F2F8F9";
        const SLOT_BG_B = "#E6F0F2";
        const HEADER_BG = vars.navy;
        const COLS = ["Week of", "Content Type", "Content Title", "Status", "Key Message", "Spokesperson", "Release Date", "Score", "Action Notes"];
        return (
          <div>
            {/* Date range selector */}
            <div className="flex flex-wrap items-center gap-2 mb-3 px-1">
              <span className="text-[12px] font-bold uppercase tracking-[0.18em]" style={{ color: "#ffffff", background: ink, padding: "4px 10px", borderRadius: 9999 }}>Date range:</span>
              <label className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: vars.g500 }}>From</span>
                <input
                  type="date"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                  className="text-[13px] rounded-lg border px-2 py-1 outline-none focus:ring-2"
                  style={{ borderColor: vars.g200, color: ink, background: paper, fontFamily: "inherit", focusRingColor: accentPink } as React.CSSProperties}
                />
              </label>
              <label className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: vars.g500 }}>To</span>
                <input
                  type="date"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  className="text-[13px] rounded-lg border px-2 py-1 outline-none focus:ring-2"
                  style={{ borderColor: vars.g200, color: ink, background: paper, fontFamily: "inherit" }}
                />
              </label>
              <button
                aria-label="Reset date range to default"
                onClick={resetRange}
                className="aio-button aio-button--text aio-button--compact focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 rounded-full uppercase tracking-[0.12em] transition-opacity hover:opacity-70"
                style={{ color: accentPink, background: accentSoft, border: `1px solid ${accentPink}40` }}
              >
                Reset to default
              </button>
              <span className="text-[12px] font-light" style={{ color: vars.g500 }}>{calendarWeeks.length} week{calendarWeeks.length === 1 ? "" : "s"}</span>
            </div>
            {/* Status key - horizontal strip ABOVE the calendar so it never obscures entries */}
            <div className="flex flex-wrap items-center gap-2 mb-3 px-1">
              <span className="text-[12px] font-bold uppercase tracking-[0.18em]" style={{ color: "#ffffff", background: vars.navy, padding: "4px 10px", borderRadius: 9999 }}>Status key:</span>
              {(["Planned", "Drafting", "Review", "Approved"] as PlannerStatus[]).map((st) => {
                const cs = STATUS_COLOURS[st];
                return (
                  <span key={st} className="text-[13px] font-semibold px-3 py-1.5 rounded-full" style={{ background: cs.fg, color: "#ffffff" }}>{st}</span>
                );
              })}
            </div>
            <div className="bg-white border rounded-2xl overflow-hidden" style={{ borderColor: vars.g200 }}>
              <div className="px-5 py-3 border-b flex items-center justify-between flex-wrap gap-2" style={{ borderColor: vars.g200 }}>
                <h3 className="aio-type-section-title" style={{ color: vars.navy }}>Content Marketing Calendar</h3>
                <span className="text-[13px] font-light" style={{ color: vars.g500 }}>Click any row to open in the Content Optimiser</span>
              </div>
              <div className="hidden sm:flex items-center gap-2 px-5 py-2 border-b" style={{ borderColor: vars.g200, background: vars.g50 }}>
                <button
                  onClick={() => calendarScrollRef.current?.scrollBy({ left: -360, behavior: "smooth" })}
                  disabled={!calendarScrollState.canLeft}
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full transition-all disabled:opacity-30 disabled:cursor-default hover:scale-110"
                  style={{ background: vars.navy, color: "white" }}
                  aria-label="Scroll calendar left"
                  title="Scroll left"
                >
                  <ChevronLeft size={16} />
                </button>
                <div
                  ref={topScrollRef}
                  className="calendar-top-scroll overflow-x-auto flex-1"
                  style={{ height: 20 }}
                >
                  <div style={{ width: calendarScrollWidth || "100%", height: 1 }} />
                </div>
                <button
                  onClick={() => calendarScrollRef.current?.scrollBy({ left: 360, behavior: "smooth" })}
                  disabled={!calendarScrollState.canRight}
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full transition-all disabled:opacity-30 disabled:cursor-default hover:scale-110"
                  style={{ background: vars.navy, color: "white" }}
                  aria-label="Scroll calendar right"
                  title="Scroll right"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="relative">
                {calendarScrollState.canLeft && (
                  <div className="hidden sm:flex absolute inset-y-0 left-0 items-start pointer-events-none" style={{ zIndex: 20 }}>
                    <button
                      onClick={() => calendarScrollRef.current?.scrollBy({ left: -360, behavior: "smooth" })}
                       className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white pointer-events-auto flex items-center justify-center w-10 h-10 rounded-full shadow-lg transition-transform hover:scale-110"
                      style={{ position: "sticky", top: 160, marginLeft: 8, background: "rgba(10,22,40,0.9)", color: "white" }}
                      aria-label="Scroll calendar left"
                      title="Scroll left"
                    >
                      <ChevronLeft size={20} />
                    </button>
                  </div>
                )}
                {calendarScrollState.canRight && (
                  <div className="hidden sm:flex absolute inset-y-0 right-0 items-start pointer-events-none" style={{ zIndex: 20 }}>
                    <button
                      onClick={() => calendarScrollRef.current?.scrollBy({ left: 360, behavior: "smooth" })}
                       className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white pointer-events-auto flex items-center justify-center w-10 h-10 rounded-full shadow-lg transition-transform hover:scale-110"
                      style={{ position: "sticky", top: 160, marginRight: 8, background: "rgba(10,22,40,0.9)", color: "white" }}
                      aria-label="Scroll calendar right"
                      title="Scroll right"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                )}
                <div ref={calendarScrollRef} className="overflow-x-auto">
                <table className="text-[11px] border-collapse" style={{ minWidth: 900 }}>
                  <thead>
                    <tr>
                      {COLS.map((h) => (
                        <th key={h} className="px-2 py-2 text-left font-semibold border" style={{ color: "white", borderColor: vars.navy, background: HEADER_BG, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {calendarWeeks.map((w) => {
                      const wkProjects = projects.filter((p) => p.week === w);
                      const rowCount = Math.max(SLOTS_PER_WEEK, wkProjects.length);
                      const label = weekDateLabel(w);
                      return Array.from({ length: rowCount }).map((_, i) => {
                        const p = wkProjects[i];
                        const s = p ? scoreProject(p, cfg) : null;
                        const cs = p ? STATUS_COLOURS[p.status] : null;
                        const ch = p ? p.channels : [];
                        const slotBg = i % 2 === 0 ? SLOT_BG_A : SLOT_BG_B;
                        return (
                          <tr key={`${w}-${i}`}>
                            {i === 0 && (
                              <td rowSpan={rowCount} className="text-center font-semibold align-middle border" style={{ background: TEAL, color: "white", borderColor: vars.navy, borderRightColor: TEAL_DARK, minWidth: 70, fontSize: 12 }}>
                                {label}
                              </td>
                            )}
                            {p ? (
                              <>
                                <td className="px-3 py-2 border hover:bg-slate-100 transition-colors" style={{ background: slotBg, borderColor: vars.navy, color: vars.g600, whiteSpace: "nowrap" }}>
                                  <button aria-label={`Open ${p.title} content type in Content Optimiser`} onClick={() => sendToOptimiser(p)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pink-500 text-left w-full">{p.contentType || ""}</button>
                                </td>
                                <td className="px-3 py-2 border hover:bg-slate-100 transition-colors" style={{ background: slotBg, borderColor: vars.navy }}>
                                  <div className="flex items-center gap-1">
                                    <button aria-label={`Open ${p.title} in Content Optimiser`} onClick={() => sendToOptimiser(p)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pink-500 text-left hover:underline flex-1 min-w-0 truncate text-[12px]" style={{ color: vars.navy, fontWeight: 600 }} title="Open in Content Optimiser">
                                      {p.title}
                                      {p.targetPhrases?.length ? <span className="ml-1 text-[10px] font-normal" style={{ color: vars.accent }} title={p.targetPhrases.map((phrase) => phrase.text).join(", ")}>· {p.targetPhrases.length} target{p.targetPhrases.length === 1 ? "" : "s"}</span> : null}
                                    </button>
                                    <button aria-label={`Delete ${p.title} from Comms Planner`} onClick={() => { if (window.confirm(`Delete "${p.title}" from the Comms Planner?`)) deleteProject(p.id); }} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-[12px] font-bold opacity-40 hover:opacity-100 transition-opacity hover:bg-red-50" style={{ color: vars.red }} title="Delete from Comms Planner">✕</button>
                                  </div>
                                </td>
                                <td className="px-3 py-2 border text-center hover:brightness-95 transition-all" style={{ background: cs!.bg, borderColor: vars.navy, color: cs!.fg, fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                  <button onClick={() => setEditing(p)} aria-label={`Change status for ${p.title}; currently ${p.status}`} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-pink-500 w-full" title="Change status">{p.status}</button>
                                </td>
                                <td className="px-3 py-2 border hover:bg-slate-100 transition-colors" style={{ background: slotBg, borderColor: vars.navy, color: vars.g600, maxWidth: 220 }}>
                                  <button aria-label={`Open ${p.title} key message in Content Optimiser`} onClick={() => sendToOptimiser(p)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pink-500 text-left w-full">{p.keyMessage || ""}</button>
                                </td>
                                <td className="px-3 py-2 border hover:bg-slate-100 transition-colors" style={{ background: slotBg, borderColor: vars.navy, color: vars.g600 }}>
                                  <button aria-label={`Open ${p.title} spokesperson in Content Optimiser`} onClick={() => sendToOptimiser(p)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pink-500 text-left w-full">{p.spokesperson || ""}</button>
                                </td>
                                <td className="px-3 py-2 border hover:bg-slate-100 transition-colors" style={{ background: slotBg, borderColor: vars.navy, color: vars.g600, whiteSpace: "nowrap" }}>
                                  <button aria-label={`Open ${p.title} release date in Content Optimiser`} onClick={() => sendToOptimiser(p)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pink-500 text-left w-full">{p.releaseDate || ""}</button>
                                </td>
                                <td className="px-3 py-2 border text-right font-bold hover:bg-slate-100 transition-colors text-[12px]" style={{ background: slotBg, borderColor: vars.navy, color: vars.teal }}>
                                  <button aria-label={`Open ${p.title} score in Content Optimiser`} onClick={() => sendToOptimiser(p)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pink-500 text-right w-full">{Math.round(s!.visibility + s!.authority)}<span style={{ color: vars.g500, fontWeight: 400 }}> pts</span></button>
                                </td>
                                <td className="px-3 py-2 border hover:bg-slate-100 transition-colors" style={{ background: slotBg, borderColor: vars.navy, color: vars.g600, maxWidth: 240 }}>
                                  <button aria-label={`Open ${p.title} action notes in Content Optimiser`} onClick={() => sendToOptimiser(p)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pink-500 text-left w-full">{p.notes || ""}</button>
                                </td>
                              </>
                            ) : (
                              Array.from({ length: 8 }).map((__, c) => (
                                <td
                                  key={c}
                                   className={`px-3 py-2 border ${c === 0 ? "hover:bg-slate-100 transition-colors" : ""}`}
                                  style={{ background: slotBg, borderColor: vars.navy, color: vars.g300, minHeight: 28 }}
                                  title={c === 0 ? `Add project to ${label}` : undefined}
                                >
                                   {c === 0 && i === wkProjects.length ? <button onClick={() => { addProject(); setTimeout(() => { const last = loadPlannerProjects()[0]; if (last) setEditing({ ...last, week: w }); }, 0); }} aria-label={`Add project to ${label}`} className="aio-button aio-button--outline aio-button--compact focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600" style={{ color: vars.teal, background: "rgba(79,143,255,0.12)", border: `1.5px solid rgba(79,143,255,0.35)` }}>+ Add project</button> : ""}
                                </td>
                              ))
                            )}
                          </tr>
                        );
                      });
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {view === "cards" && (
      <div>
        {/* Date range selector */}
        <div className="flex flex-wrap items-center gap-2 mb-3 px-1">
          <span className="text-[12px] font-bold uppercase tracking-[0.18em]" style={{ color: "#ffffff", background: ink, padding: "4px 10px", borderRadius: 9999 }}>Date range:</span>
          <label className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: vars.g500 }}>From</span>
            <input
              type="date"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
              className="text-[13px] rounded-lg border px-2 py-1 outline-none focus:ring-2"
              style={{ borderColor: vars.g200, color: ink, background: paper, fontFamily: "inherit" }}
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: vars.g500 }}>To</span>
            <input
              type="date"
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
              className="text-[13px] rounded-lg border px-2 py-1 outline-none focus:ring-2"
              style={{ borderColor: vars.g200, color: ink, background: paper, fontFamily: "inherit" }}
            />
          </label>
          <button
            onClick={resetRange}
            className="aio-button aio-button--text aio-button--compact rounded-full uppercase tracking-[0.12em] transition-opacity hover:opacity-70"
            style={{ color: accentPink, background: accentSoft, border: `1px solid ${accentPink}40` }}
          >
            Reset to default
          </button>
          <span className="text-[12px] font-light" style={{ color: vars.g500 }}>{calendarWeeks.length} week{calendarWeeks.length === 1 ? "" : "s"}</span>
        </div>
        <div className="bg-white border rounded-2xl overflow-hidden" style={{ borderColor: vars.g200 }}>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead style={{ background: vars.g50 }}>
              <tr>
                <th className="px-3 py-3 text-left font-semibold sticky left-0 z-10" style={{ color: vars.g500, background: vars.g50, minWidth: 100 }}>w/c date</th>
                <th className="px-3 py-3 text-left font-semibold" style={{ color: vars.g500 }}>Content</th>
              </tr>
            </thead>
            <tbody>
              {calendarWeeks.map((w) => {
                const wkProjects = projects.filter((p) => p.week === w);
                const wkScore = wkProjects.reduce((s, p) => { const sc = scoreProject(p, cfg); return s + sc.authority; }, 0);
                const wcLabel = weekDateLabel(w);
                return (
                  <tr key={w} className="border-t" style={{ borderColor: vars.g100 }}>
                    <td className="px-3 py-3 align-top sticky left-0 z-10 bg-white" style={{ minWidth: 100 }}>
                      <div className="text-[13px] font-semibold" style={{ color: vars.navy }}>w/c {wcLabel}</div>
                      <div className="text-[10px] font-light mt-0.5" style={{ color: vars.g400 }}>Week {w}</div>
                      {wkScore > 0 && <div className="text-[10px] font-semibold mt-1 px-1.5 py-0.5 rounded inline-block" style={{ background: "rgba(31,116,143,0.08)", color: vars.accent }}>{Math.round(wkScore)} auth</div>}
                    </td>
                    <td className="px-3 py-3">
                      {wkProjects.length === 0 ? (
                         <button aria-label={`Add content for week commencing ${wcLabel}`} onClick={() => sendToOptimiser()} className="aio-button aio-button--outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600" style={{ color: vars.teal, borderColor: "rgba(79,143,255,0.4)", background: "rgba(79,143,255,0.06)" }}>+ Add to w/c {wcLabel}</button>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {wkProjects.map((p) => {
                            const s = scoreProject(p, cfg);
                            const cs = STATUS_COLOURS[p.status];
                            const canResearch = RESEARCH_TYPES.includes(p.contentType);
                            return (
                              <div key={p.id} className="rounded-lg border p-3 transition-all min-w-[240px] max-w-[300px] bg-white" style={{ borderColor: vars.g200 }}>
                                 <button onClick={() => sendToOptimiser(p)} aria-label={`Open ${p.title} in Content Optimiser`} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 text-left w-full">
                                  <div className="flex items-start justify-between gap-2 mb-1">
                                    <p className="text-[13px] font-semibold leading-tight" style={{ color: vars.navy }}>{p.title}</p>
                                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: cs.bg, color: cs.fg }}>{p.status}</span>
                                  </div>
                                  <p className="text-[11px] font-light mb-2" style={{ color: vars.g500 }}>{p.contentType}{p.spokesperson ? ` · ${p.spokesperson}` : ""}</p>
                                  {p.targetPhrases?.length ? <p className="text-[10px] truncate mb-2" style={{ color: vars.accent }} title={p.targetPhrases.map((phrase) => phrase.text).join(", ")}>Targets: {p.targetPhrases.map((phrase) => phrase.text).join(" · ")}</p> : null}
                                  <div className="flex items-center justify-between text-[11px] mb-2">
                                    <span style={{ color: vars.g400 }}>{p.channels.length} channel{p.channels.length === 1 ? "" : "s"}</span>
                                    <span className="font-bold" style={{ color: vars.accent }}>{Math.round(s.authority)} auth</span>
                                  </div>
                                </button>
                                <div className="flex items-center gap-1 pt-2 border-t" style={{ borderColor: vars.g100 }}>
                                   <button aria-label={`Edit ${p.title}`} onClick={() => setEditing(p)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 text-[10px] font-semibold px-2 py-1 rounded" style={{ background: vars.g100, color: vars.g500 }} title="Quick edit">Edit</button>
                                  {canResearch && (
                                     <button aria-label={`Send ${p.title} to Media Research`} onClick={() => void sendToMediaResearch(p)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-700 text-[10px] font-semibold px-2 py-1 rounded ml-auto" style={{ background: "rgba(201,160,78,0.15)", color: "#7A5E25" }} title="Send to Media Research">
                                      <Target size={10} className="inline mr-1" /> Media Research
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      </div>
      )}

      {/* View switcher footer - duplicated below the table for ease of use on long calendars */}
      <div className="flex items-center justify-between flex-wrap gap-3 rounded-2xl p-3 sm:p-4 mt-6" style={{ background: ink, boxShadow: "0 4px 16px -10px rgba(16,43,54,0.25)" }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] mr-1" style={{ color: "rgba(251,246,236,0.6)" }}>View</span>
          <div className="inline-flex rounded-full p-1" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }} role="group" aria-label="Planner view (footer)">
            <button aria-label="Calendar View" onClick={() => setView("spreadsheet")} aria-pressed={view === "spreadsheet"} className="aio-button aio-button--compact focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white w-[120px] rounded-full uppercase tracking-[0.12em] transition-colors" style={{ background: view === "spreadsheet" ? accentPink : "transparent", color: view === "spreadsheet" ? "white" : "rgba(251,246,236,0.7)" }}>
              <Calendar size={12} /> Calendar View
            </button>
            <button aria-label="List View" onClick={() => setView("cards")} aria-pressed={view === "cards"} className="aio-button aio-button--compact focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white w-[120px] rounded-full uppercase tracking-[0.12em] transition-colors" style={{ background: view === "cards" ? accentPink : "transparent", color: view === "cards" ? "white" : "rgba(251,246,236,0.7)" }}>
              <ListIcon size={12} /> List View
            </button>
          </div>
        </div>
      </div>

      {/* Methodology modal */}
      {showMethodology && (
        <PlannerDialog titleId="planner-methodology-title" initialFocusRef={methodologyCloseRef} onClose={() => { setShowMethodology(false); methodologyTriggerRef.current?.focus(); }} className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto">
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: vars.g200 }}>
              <h2 id="planner-methodology-title" className="aio-type-card-title flex items-center gap-2" style={{ color: vars.navy }}>
                <HelpCircle size={16} color={vars.accent} /> Comms Planner methodology
              </h2>
              <button ref={methodologyCloseRef} aria-label="Close methodology dialog" onClick={() => { setShowMethodology(false); methodologyTriggerRef.current?.focus(); }} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 text-[20px] leading-none px-2" style={{ color: vars.g400 }}>&times;</button>
            </div>
            <div className="p-6 text-[13px] font-light leading-relaxed space-y-4" style={{ color: vars.g600 }}>
              <p>The Comms Planner ranks your communications schedule. Each item is scored on two dimensions based <strong style={{ color: vars.navy }}>only on content type, configured channel count, and workflow status</strong>:</p>
              <ul className="space-y-2 pl-4 list-disc">
                <li><strong style={{ color: vars.navy }}>Authority</strong> - how strongly the content contributes to LLM citation footprint.</li>
                <li><strong style={{ color: vars.navy }}>Visibility</strong> - scaled by how many configured channels you target.</li>
              </ul>
              <div className="rounded-lg p-3 border" style={{ background: "rgba(200,73,122,0.05)", borderColor: "rgba(200,73,122,0.2)" }}>
                <p className="font-semibold text-[12px] mb-1" style={{ color: vars.navy }}>Score Formula</p>
                <ul className="text-[12px] space-y-1.5 mb-2 pl-4 list-disc" style={{ color: vars.g600 }}>
                  <li><strong>Item Visibility</strong> = 5 &times; round-to-0.1(Base visibility weight &times; 0.625 &times; Channel Multiplier &times; Status Multiplier), capped at 50.</li>
                  <li><strong>Item Authority</strong> = 5 &times; round-to-0.1(Base authority weight &times; 0.5 &times; Status Multiplier), capped at 50.</li>
                </ul>
                <p className="font-semibold text-[12px] mb-1 mt-3" style={{ color: vars.navy }}>Total Plan Score</p>
                <p>Raw item points are summed separately for Visibility and Authority. Each dimension is calculated internally as <strong>round-to-0.1(50 &times; (1 - e<sup>-raw/50</sup>))</strong>. Cards, badges and item score labels round their underlying values to whole numbers for display. The final score is the whole-number rounded sum of the two internal dimensions. This creates diminishing returns and caps each dimension at 50.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-lg border p-3" style={{ borderColor: vars.g200 }}>
                  <p className="font-semibold text-[12px] mb-1" style={{ color: vars.navy }}>Channel Multiplier</p>
                  <p className="text-[11px] mb-2">Base ({cfg.channelBase}) + (Channels &times; Step {cfg.channelStep}), capped at {cfg.channelCap}. Configured channels:</p>
                  <ul className="text-[11px] space-y-0.5 pl-4 list-disc">
                    {cfg.channels.map(c => <li key={c}>{c}</li>)}
                  </ul>
                </div>
                <div className="rounded-lg border p-3" style={{ borderColor: vars.g200 }}>
                  <p className="font-semibold text-[12px] mb-1" style={{ color: vars.navy }}>Status Multiplier</p>
                  <ul className="text-[11px] space-y-1">
                    <li className="flex justify-between"><span>Approved</span> <span>{cfg.statusMultipliers.Approved}x</span></li>
                    <li className="flex justify-between"><span>Review</span> <span>{cfg.statusMultipliers.Review}x</span></li>
                    <li className="flex justify-between"><span>Drafting</span> <span>{cfg.statusMultipliers.Drafting}x</span></li>
                    <li className="flex justify-between"><span>Planned</span> <span>{cfg.statusMultipliers.Planned}x</span></li>
                  </ul>
                </div>
              </div>

              <div className="rounded-lg border overflow-hidden mt-4" style={{ borderColor: vars.g200 }}>
                <table className="w-full text-[12px]">
                  <thead style={{ background: vars.g50 }}>
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold" style={{ color: vars.g500 }}>Content type</th>
                      <th className="px-3 py-2 text-right font-semibold" style={{ color: vars.g500 }}>Base Authority</th>
                      <th className="px-3 py-2 text-right font-semibold" style={{ color: vars.g500 }}>Base Visibility</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(cfg.typeWeights).sort((a, b) => (b[1].vis + b[1].auth) - (a[1].vis + a[1].auth)).map(([t, w]) => (
                      <tr key={t} className="border-t" style={{ borderColor: vars.g100 }}>
                        <td className="px-3 py-2" style={{ color: vars.navy }}>{t}</td>
                        <td className="px-3 py-2 text-right font-semibold" style={{ color: vars.teal }}>{w.auth}</td>
                        <td className="px-3 py-2 text-right font-semibold" style={{ color: vars.accent }}>{w.vis}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="px-6 py-3 border-t flex justify-end" style={{ borderColor: vars.g200 }}>
               <button onClick={() => { setShowMethodology(false); methodologyTriggerRef.current?.focus(); }} className="aio-button aio-button--primary aio-button--compact focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500" style={{ background: vars.accent }}>Got it</button>
            </div>
        </PlannerDialog>
      )}

      {/* Archive picker */}
      {showArchivePicker && (
        <PlannerDialog titleId="planner-archive-picker-title" initialFocusRef={archivePickerCloseRef} onClose={() => { setShowArchivePicker(false); archivePickerTriggerRef.current?.focus(); }} className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: vars.g200 }}>
              <h2 id="planner-archive-picker-title" className="aio-type-card-title flex items-center gap-2" style={{ color: vars.navy }}>
                <Archive size={16} color={vars.accent} /> Select archived content
              </h2>
              <button ref={archivePickerCloseRef} aria-label="Close archived content dialog" onClick={() => { setShowArchivePicker(false); archivePickerTriggerRef.current?.focus(); }} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 text-[20px] leading-none px-2" style={{ color: vars.g400 }}>&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {archive.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-[13px] font-light" style={{ color: vars.g500 }}>{!contentVersion ? "Loading content…" : "The content library is empty. Save a piece from the Optimiser or Creator first."}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {archive.map((a) => (
                      <button key={a.id} onClick={() => addProjectFromArchive(a)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 w-full text-left rounded-lg border p-3 hover:shadow-sm transition-all" style={{ borderColor: vars.g200 }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold" style={{ color: vars.navy }}>{a.title}</p>
                          <p className="text-[11px] font-light mt-0.5" style={{ color: vars.g500 }}>{a.contentType}{a.spokesperson ? ` · ${a.spokesperson}` : ""}</p>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded flex-shrink-0" style={{ background: a.status === "Final" ? "rgba(61,155,107,0.12)" : "rgba(212,146,42,0.12)", color: a.status === "Final" ? vars.green : vars.amber }}>{a.status}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
        </PlannerDialog>
      )}

      {editing && (
        <PlannerDialog titleId="planner-edit-title" initialFocusRef={editTitleRef} onClose={() => { setEditing(null); }} className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: vars.g200 }}>
              <h2 id="planner-edit-title" className="aio-type-card-title" style={{ color: vars.navy }}>Edit project</h2>
              <button aria-label="Close edit project dialog" onClick={() => setEditing(null)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 text-[20px] leading-none px-2" style={{ color: vars.g400 }}>&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: vars.g500 }}>Project title</label>
                 <input ref={editTitleRef} aria-label="Project title" type="text" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 w-full px-3 py-2 rounded-lg border text-[13px]" style={{ borderColor: vars.g200 }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: vars.g500 }}>Content type</label>
                  <select aria-label="Content type" value={editing.contentType} onChange={(e) => setEditing({ ...editing, contentType: e.target.value })} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 w-full px-3 py-2 rounded-lg border text-[13px] bg-white" style={{ borderColor: vars.g200 }}>
                    {Object.keys(cfg.typeWeights).map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: vars.g500 }}>Status</label>
                  <select aria-label="Status" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as PlannerStatus })} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 w-full px-3 py-2 rounded-lg border text-[13px] bg-white" style={{ borderColor: vars.g200 }}>
                    {(["Planned", "Drafting", "Review", "Approved"] as PlannerStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: vars.g500 }}>Spokesperson</label>
                  <input aria-label="Spokesperson" type="text" value={editing.spokesperson} onChange={(e) => setEditing({ ...editing, spokesperson: e.target.value })} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 w-full px-3 py-2 rounded-lg border text-[13px]" style={{ borderColor: vars.g200 }} />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: vars.g500 }}>Audience</label>
                  <input aria-label="Audience" type="text" value={editing.audience} onChange={(e) => setEditing({ ...editing, audience: e.target.value })} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 w-full px-3 py-2 rounded-lg border text-[13px]" style={{ borderColor: vars.g200 }} />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: vars.g500 }}>Key message</label>
                {plannerKeyMessages.length === 0 ? (
                  <div className="rounded-lg border p-2.5 text-[12px] font-light italic" style={{ borderColor: vars.g200, color: vars.g400, background: "white" }}>
                    No key messages set. Add them in <button type="button" onClick={() => onNavigate("intake")} className="underline" style={{ color: "#C8497A" }}>Project Set-Up</button> (sections 1.2 & 1.3).
                  </div>
                ) : (
                  <select
                    value={editing.keyMessage}
                    onChange={(e) => setEditing({ ...editing, keyMessage: e.target.value })}
                    aria-label="Key message"
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 w-full px-3 py-2 rounded-lg border text-[13px] bg-white"
                    style={{ borderColor: vars.g200, color: vars.navy }}
                  >
                    <option value="">- Choose a key message from Project Data -</option>
                    {plannerKeyMessages.map((m) => {
                      const label = m.short || m.long;
                      const display = label.length > 90 ? `${label.slice(0, 90)}…` : label;
                      return <option key={`${m.tag}-${label}`} value={label}>[{m.tag}] {display}</option>;
                    })}
                    {editing.keyMessage && !plannerKeyMessages.some((m) => (m.short || m.long) === editing.keyMessage) && (
                      <option value={editing.keyMessage}>{editing.keyMessage} (custom)</option>
                    )}
                  </select>
                )}
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: vars.g500 }}>Exact target phrases</label>
                {projectPhrases.length === 0 ? (
                  <p className="rounded-lg border p-2.5 text-[12px] font-light italic" style={{ borderColor: vars.g200, color: vars.g400, background: "white" }}>
                    No exact target phrases generated in Project Set-Up yet.
                  </p>
                ) : (
                  <div className="rounded-lg border p-2.5 space-y-1.5" style={{ borderColor: vars.g200, background: "white" }}>
                    {projectPhrases.map((phrase) => {
                      const selectedPhraseIds = new Set(editing.targetPhraseIds || editing.targetPhrases?.map((item) => item.id) || []);
                      return (
                        <label key={phrase.id} className="flex items-start gap-2 text-[12px]" style={{ color: vars.g600 }}>
                          <input
                            type="checkbox"
                            aria-label={`Target phrase ${phrase.text}`}
                            checked={selectedPhraseIds.has(phrase.id)}
                            onChange={(event) => {
                              const nextPhrases = event.target.checked
                                ? [...(editing.targetPhrases || []).filter((item) => item.id !== phrase.id), phrase]
                                : (editing.targetPhrases || []).filter((item) => item.id !== phrase.id);
                              setEditing({
                                ...editing,
                                targetPhrases: nextPhrases,
                                targetPhraseIds: nextPhrases.map((item) => item.id),
                              });
                            }}
                            className="mt-0.5"
                          />
                          <span className="leading-snug">{phrase.text}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {(editing.targetPhrases?.length || editing.targetPhraseIds?.length) ? (
                  <p className="mt-1 text-[11px] font-light" style={{ color: vars.g500 }}>
                    {editing.targetPhrases?.length || editing.targetPhraseIds?.length} phrase{(editing.targetPhrases?.length || editing.targetPhraseIds?.length) === 1 ? "" : "s"} selected
                  </p>
                ) : null}
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: vars.g500 }}>Release channels (multi-select)</label>
                <div className="flex flex-wrap gap-1.5">
                  {cfg.channels.map((c) => {
                    const on = editing.channels.includes(c);
                    return (
                      <button
                        key={c}
                        onClick={() => setEditing({ ...editing, channels: on ? editing.channels.filter((x) => x !== c) : [...editing.channels, c] })}
                        aria-pressed={on}
                        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all"
                        style={{ borderColor: on ? vars.accent : vars.g200, background: on ? "rgba(31,116,143,0.1)" : "white", color: on ? vars.accent : vars.g500 }}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: vars.g500 }}>Week (ISO)</label>
                  <input aria-label="ISO week" type="number" value={editing.week} onChange={(e) => setEditing({ ...editing, week: parseInt(e.target.value, 10) || 1 })} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 w-full px-3 py-2 rounded-lg border text-[13px]" style={{ borderColor: vars.g200 }} />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: vars.g500 }}>Release date</label>
                  <input aria-label="Release date" type="date" value={editing.releaseDate} onChange={(e) => setEditing({ ...editing, releaseDate: e.target.value })} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 w-full px-3 py-2 rounded-lg border text-[13px]" style={{ borderColor: vars.g200 }} />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: vars.g500 }}>Notes</label>
                <textarea aria-label="Notes" value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} rows={3} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 w-full px-3 py-2 rounded-lg border text-[13px]" style={{ borderColor: vars.g200 }} />
              </div>

              <div className="p-4 rounded-xl" style={{ background: vars.g50 }}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] mb-2" style={{ color: vars.g400 }}>Projected score</p>
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-[11px]" style={{ color: vars.g500 }}>Visibility</span>
                    <p className="text-[18px] font-bold" style={{ color: vars.accent }}>{Math.round(scoreProject(editing, cfg).visibility)}/50</p>
                  </div>
                  <div>
                    <span className="text-[11px]" style={{ color: vars.g500 }}>Authority</span>
                    <p className="text-[18px] font-bold" style={{ color: vars.teal }}>{Math.round(scoreProject(editing, cfg).authority)}/50</p>
                  </div>
                  <div className="ml-auto">
                    <span className="text-[11px]" style={{ color: vars.g500 }}>Total</span>
                    <p className="text-[24px] font-bold" style={{ color: vars.navy }}>{Math.round(scoreProject(editing, cfg).visibility + scoreProject(editing, cfg).authority)}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t flex items-center justify-between" style={{ borderColor: vars.g200 }}>
               <button aria-label={`Delete ${editing.title}`} onClick={() => deleteProject(editing.id)} className="aio-button aio-button--destructive aio-button--compact focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500" style={{ color: vars.red, background: "rgba(201,74,62,0.06)" }}>Delete</button>
              <div className="flex gap-2">
                <button onClick={() => setEditing(null)} className="aio-button aio-button--outline aio-button--compact focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500" style={{ borderColor: vars.g200, color: vars.g500 }}>Cancel</button>
                <button onClick={saveEdit} className="aio-button aio-button--primary aio-button--compact focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500" style={{ background: vars.accent }}>Save</button>
              </div>
            </div>
          </PlannerDialog>
      )}

      {showSettings && (
        <ScoringSettingsModal cfg={cfg} onSave={(c) => { void updateCfg(c).then((saved) => { if (saved) { setShowSettings(false); settingsTriggerRef.current?.focus(); } }); }} onClose={() => { setShowSettings(false); settingsTriggerRef.current?.focus(); }} />
      )}
    </div>
  );
}

function ScoringSettingsModal({ cfg, onSave, onClose }: { cfg: ScoringConfig; onSave: (c: ScoringConfig) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<ScoringConfig>(JSON.parse(JSON.stringify(cfg)));
  const [newType, setNewType] = useState("");
  const [newChannel, setNewChannel] = useState("");
  const firstWeightRef = useRef<HTMLInputElement>(null);
  const updateWeight = (t: string, k: "vis" | "auth", v: number) => {
    setDraft({ ...draft, typeWeights: { ...draft.typeWeights, [t]: { ...draft.typeWeights[t], [k]: v } } });
  };
  const removeType = (t: string) => {
    const tw = { ...draft.typeWeights }; delete tw[t]; setDraft({ ...draft, typeWeights: tw });
  };
  const addType = () => {
    const name = newType.trim(); if (!name || draft.typeWeights[name]) return;
    setDraft({ ...draft, typeWeights: { ...draft.typeWeights, [name]: { vis: 5, auth: 5 } } });
    setNewType("");
  };
  const removeChannel = (c: string) => setDraft({ ...draft, channels: draft.channels.filter((x) => x !== c) });
  const addChannel = () => {
    const name = newChannel.trim(); if (!name || draft.channels.includes(name)) return;
    setDraft({ ...draft, channels: [...draft.channels, name] }); setNewChannel("");
  };
  const updateStatus = (s: PlannerStatus, v: number) => setDraft({ ...draft, statusMultipliers: { ...draft.statusMultipliers, [s]: v } });

  return (
    <PlannerDialog titleId="planner-scoring-settings-title" initialFocusRef={firstWeightRef} onClose={onClose} className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: vars.g200 }}>
          <div>
            <h2 id="planner-scoring-settings-title" className="aio-type-card-title" style={{ color: vars.navy }}>Scoring settings</h2>
            <p className="text-[11px]" style={{ color: vars.g500 }}>Tune how Visibility and Authority scores are calculated. Saved per browser.</p>
          </div>
          <button aria-label="Close scoring settings dialog" onClick={onClose} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 text-[20px] leading-none px-2" style={{ color: vars.g400 }}>&times;</button>
        </div>
        <div className="p-6 space-y-6">

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="aio-type-card-title" style={{ color: vars.navy }}>Content type weights</h3>
              <span className="text-[11px]" style={{ color: vars.g500 }}>Each weight 0–10</span>
            </div>
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: vars.g200 }}>
              <table className="w-full text-[12px]">
                <thead style={{ background: vars.g50 }}>
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold" style={{ color: vars.g500 }}>Type</th>
                    <th className="px-3 py-2 text-left font-semibold w-24" style={{ color: vars.g500 }}>Visibility</th>
                    <th className="px-3 py-2 text-left font-semibold w-24" style={{ color: vars.g500 }}>Authority</th>
                    <th className="px-3 py-2 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(draft.typeWeights).map(([t, w]) => (
                    <tr key={t} className="border-t" style={{ borderColor: vars.g100 }}>
                      <td className="px-3 py-2" style={{ color: vars.navy }}>{t}</td>
                      <td className="px-3 py-2"><input ref={firstWeightRef} aria-label={`${t} visibility weight`} type="number" min={0} max={10} step={0.5} value={w.vis} onChange={(e) => updateWeight(t, "vis", parseFloat(e.target.value) || 0)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 w-20 px-2 py-1 rounded border text-[12px]" style={{ borderColor: vars.g200 }} /></td>
                      <td className="px-3 py-2"><input aria-label={`${t} authority weight`} type="number" min={0} max={10} step={0.5} value={w.auth} onChange={(e) => updateWeight(t, "auth", parseFloat(e.target.value) || 0)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 w-20 px-2 py-1 rounded border text-[12px]" style={{ borderColor: vars.g200 }} /></td>
                      <td className="px-3 py-2 text-right"><button aria-label={`Remove ${t} content type`} onClick={() => removeType(t)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 text-[11px]" style={{ color: vars.red }} title="Remove">×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2 mt-2">
              <input aria-label="New content type" type="text" value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="Add new content type…" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 flex-1 px-3 py-2 rounded-lg border text-[12px]" style={{ borderColor: vars.g200 }} />
               <button onClick={addType} className="aio-button aio-button--primary aio-button--compact focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500" style={{ background: vars.accent }}>Add type</button>
            </div>
          </section>

          <section>
            <h3 className="aio-type-card-title mb-2" style={{ color: vars.navy }}>Channel multiplier (Visibility only)</h3>
            <p className="text-[11px] mb-3" style={{ color: vars.g500 }}>Visibility multiplier = base + (channels × step), capped at max.</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: vars.g500 }}>Base</label>
                <input aria-label="Channel multiplier base" type="number" step={0.05} value={draft.channelBase} onChange={(e) => setDraft({ ...draft, channelBase: parseFloat(e.target.value) || 0 })} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 w-full px-3 py-2 rounded-lg border text-[12px]" style={{ borderColor: vars.g200 }} />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: vars.g500 }}>Step (per channel)</label>
                <input aria-label="Channel multiplier step" type="number" step={0.05} value={draft.channelStep} onChange={(e) => setDraft({ ...draft, channelStep: parseFloat(e.target.value) || 0 })} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 w-full px-3 py-2 rounded-lg border text-[12px]" style={{ borderColor: vars.g200 }} />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: vars.g500 }}>Max (cap)</label>
                <input aria-label="Channel multiplier maximum" type="number" step={0.05} value={draft.channelCap} onChange={(e) => setDraft({ ...draft, channelCap: parseFloat(e.target.value) || 0 })} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 w-full px-3 py-2 rounded-lg border text-[12px]" style={{ borderColor: vars.g200 }} />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: vars.g500 }}>Channels</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {draft.channels.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border" style={{ borderColor: vars.g200, color: vars.navy }}>
                    {c}
                    <button aria-label={`Remove ${c} channel`} onClick={() => removeChannel(c)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500" style={{ color: vars.red }}>×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input aria-label="New release channel" type="text" value={newChannel} onChange={(e) => setNewChannel(e.target.value)} placeholder="Add new channel…" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 flex-1 px-3 py-2 rounded-lg border text-[12px]" style={{ borderColor: vars.g200 }} />
                <button onClick={addChannel} className="aio-button aio-button--primary aio-button--compact focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500" style={{ background: vars.accent }}>Add channel</button>
              </div>
            </div>
          </section>

          <section>
            <h3 className="aio-type-card-title mb-2" style={{ color: vars.navy }}>Status multipliers</h3>
            <p className="text-[11px] mb-3" style={{ color: vars.g500 }}>Discounts both Visibility and Authority by delivery confidence.</p>
            <div className="grid grid-cols-4 gap-3">
              {(Object.keys(draft.statusMultipliers) as PlannerStatus[]).map((s) => (
                <div key={s}>
                  <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: vars.g500 }}>{s}</label>
                  <input aria-label={`${s} status multiplier`} type="number" min={0} max={1} step={0.05} value={draft.statusMultipliers[s]} onChange={(e) => updateStatus(s, parseFloat(e.target.value) || 0)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 w-full px-3 py-2 rounded-lg border text-[12px]" style={{ borderColor: vars.g200 }} />
                </div>
              ))}
            </div>
          </section>
        </div>
        <div className="px-6 py-4 border-t flex items-center justify-between" style={{ borderColor: vars.g200 }}>
           <button onClick={() => setDraft(JSON.parse(JSON.stringify(DEFAULT_SCORING)))} className="aio-button aio-button--text aio-button--compact focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500" style={{ color: vars.g500, background: vars.g50 }}>Reset to defaults</button>
          <div className="flex gap-2">
             <button onClick={onClose} className="aio-button aio-button--outline aio-button--compact focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500" style={{ borderColor: vars.g200, color: vars.g500 }}>Cancel</button>
             <button onClick={() => onSave(draft)} className="aio-button aio-button--primary aio-button--compact focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500" style={{ background: vars.accent }}>Save settings</button>
          </div>
        </div>
    </PlannerDialog>
  );
}

export { PlannerPage, ScoringSettingsModal };
