import { useState, useEffect, useMemo, useRef } from "react";
import {
  ChevronRight, ChevronLeft, Lock, Search, FileEdit, BarChart3, Archive, Send, LineChart, ArrowRight, Sparkles, Loader2,
  TrendingUp, FileText, FileCheck2, Target, Code2, HelpCircle, MessageSquareQuote, Bot, ShieldCheck,
  MessagesSquare, Download, AlertTriangle, CheckCircle2, XCircle, Info, Globe, Tag, User, ChevronDown,
  Plus, Minus, MessageSquare, BookOpen, Scroll, Award, Radio, Mic2, PenLine, ClipboardList, ArrowUpRight,
  Lightbulb, ClipboardPaste, Upload, Calendar, CalendarDays, Check, Save, Circle, Zap, Mail, Shield, Eye, Building2,
  ArrowLeft, LogOut, Trash2, KeyRound, Users, Activity, Play, ChevronUp, Menu, X, LogIn,
  Link as LinkIcon, Image as ImageIcon, Repeat, TrendingDown, FolderOpen, List as ListIcon, Clock,
  Undo2, ArchiveRestore, RefreshCw, MonitorSmartphone,
} from "lucide-react";
import { vars } from "../marketing/vars";
import { loadPlannerProjects, savePlannerProjects, useContentStore, loadArchive, getISOWeek, weekDateLabel, DEFAULT_SCORING, STATUS_COLOURS, scoreProject, loadScoringConfig, saveScoringConfig, type PlannerProject, type PlannerStatus, type ScoringConfig } from "../lib/contentStore";
import { getKeyMessages, getSpokespeople } from "../IntakeForm";
import { CONTENT_TYPES } from "./shared";
import InfoTip from "../InfoTip";
function PlannerPage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const contentVersion = useContentStore();
  const [projects, setProjects] = useState<PlannerProject[]>(() => loadPlannerProjects());
  useEffect(() => { setProjects(loadPlannerProjects()); }, [contentVersion]);
  const [editing, setEditing] = useState<PlannerProject | null>(null);
  const plannerKeyMessages = useMemo(() => getKeyMessages(), [editing?.id]);
  const [showArchivePicker, setShowArchivePicker] = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);
  const archive = useMemo(() => loadArchive(), [showArchivePicker, contentVersion]);

  const sendToOptimiser = (archiveId?: string) => {
    if (archiveId) {
      try { localStorage.setItem("aio.optimiser.preload", archiveId); } catch { /* noop */ }
    }
    onNavigate("optimiser");
  };
  const sendToMediaResearch = (archiveId: string) => {
    try { localStorage.setItem("aio.research.preload", archiveId); } catch { /* noop */ }
    onNavigate("media-research");
  };
  const RESEARCH_TYPES = ["Press release", "Article", "Case study", "Whitepaper", "Blog post"];
  const [cfg, setCfg] = useState<ScoringConfig>(() => loadScoringConfig());
  useEffect(() => { setCfg(loadScoringConfig()); }, [contentVersion]);
  const [showSettings, setShowSettings] = useState(false);
  const [view, setView] = useState<"cards" | "spreadsheet">("spreadsheet");
  const update = (next: PlannerProject[]) => { setProjects(next); savePlannerProjects(next); };
  const updateCfg = (next: ScoringConfig) => {
    setCfg(next); saveScoringConfig(next);
    const types = Object.keys(next.typeWeights);
    const fallbackType = types[0] || "Press release";
    const normalised = projects.map((p) => ({
      ...p,
      channels: p.channels.filter((c) => next.channels.includes(c)),
      contentType: next.typeWeights[p.contentType] ? p.contentType : fallbackType,
    }));
    update(normalised);
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
    update([np, ...projects]);
    setEditing(np);
  };
  const saveEdit = () => {
    if (!editing) return;
    update(projects.map((p) => (p.id === editing.id ? editing : p)));
    setEditing(null);
  };
  const deleteProject = (id: string) => {
    if (!confirm("Delete this project?")) return;
    update(projects.filter((p) => p.id !== id));
  };

  const startWeek = getISOWeek(new Date());
  const weeks = Array.from({ length: 8 }, (_, i) => startWeek + i);

  const calendarScrollRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const [calendarScrollState, setCalendarScrollState] = useState({ canLeft: false, canRight: false });
  const [calendarScrollWidth, setCalendarScrollWidth] = useState(0);
  useEffect(() => {
    const el = calendarScrollRef.current;
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
      if (topScrollRef.current && !syncing) {
        syncing = true;
        topScrollRef.current.scrollLeft = el.scrollLeft;
        syncing = false;
      }
    };
    const onTopScroll = () => {
      if (topScrollRef.current && !syncing) {
        syncing = true;
        el.scrollLeft = topScrollRef.current.scrollLeft;
        syncing = false;
      }
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    topScrollRef.current?.addEventListener("scroll", onTopScroll, { passive: true });
    window.addEventListener("resize", update);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      topScrollRef.current?.removeEventListener("scroll", onTopScroll);
      window.removeEventListener("resize", update);
      ro.disconnect();
    };
  }, [view, projects, cfg]);

  const totals = projects.reduce(
    (acc, p) => {
      const s = scoreProject(p, cfg);
      acc.visibility += s.visibility;
      acc.authority += s.authority;
      acc.byType[p.contentType] = (acc.byType[p.contentType] || 0) + s.visibility + s.authority;
      return acc;
    },
    { visibility: 0, authority: 0, byType: {} as Record<string, number> },
  );
  const projectedTotal = Math.round(totals.visibility + totals.authority);
  const visPct = Math.min(100, Math.round((totals.visibility / 50) * 100));
  const authPct = Math.min(100, Math.round((totals.authority / 50) * 100));

  const ink = "#102B36";
  const paper = "#FBF6EC";
  const accentPink = "#C8497A";
  const accentSoft = "#FBE3ED";
  return (
    <div className="p-6 sm:p-8 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <CalendarDays size={26} color="#ffffff" />
          <h1 className="text-3xl sm:text-4xl mb-2 leading-[1.1]" style={{ color: "#ffffff", fontFamily: "'Alice', Georgia, serif" }}>Comms Planner</h1>
        </div>
        <p className="text-[15px] font-light max-w-5xl" style={{ color: "rgba(255,255,255,0.85)" }}>Plan your whole PR and marketing schedule in one place and see a live score for the AI authority each activity will earn. A joined-up plan means every release, article and event builds your visibility in AI answers instead of working in isolation. Click any content item to open and edit it in the Content Optimiser.</p>
      </div>

      {!contentVersion && (
        <div className="rounded-xl px-4 py-3 mb-4 text-[13px] font-light flex items-center gap-2" style={{ background: accentSoft, color: ink, border: `1px solid ${accentPink}30` }}>
          <span className="inline-block w-3 h-3 rounded-full animate-pulse" style={{ background: accentPink }} />
          Loading your planner content from the server…
        </div>
      )}

      {/* Action toolbar - Variant C ink panel */}
      <div className="rounded-2xl p-4 sm:p-5 mb-6" style={{ background: ink, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.25)" }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded-full p-1" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }} role="group" aria-label="Planner view">
              <button onClick={() => setView("spreadsheet")} className="flex items-center justify-center gap-1.5 w-[120px] px-3 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.12em] transition-colors" style={{ background: view === "spreadsheet" ? accentPink : "transparent", color: view === "spreadsheet" ? "white" : "rgba(251,246,236,0.7)" }}>
                <Calendar size={12} /> Calendar View
              </button>
              <button onClick={() => setView("cards")} className="flex items-center justify-center gap-1.5 w-[120px] px-3 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.12em] transition-colors" style={{ background: view === "cards" ? accentPink : "transparent", color: view === "cards" ? "white" : "rgba(251,246,236,0.7)" }}>
                <ListIcon size={12} /> List View
              </button>
            </div>
            <button onClick={() => setShowMethodology(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.12em] transition-colors" style={{ background: "rgba(255,255,255,0.08)", color: paper, border: "1px solid rgba(255,255,255,0.18)" }} title="Scoring methodology">
              <HelpCircle size={13} /> Methodology
            </button>
            <button onClick={() => setShowSettings(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.12em] transition-colors" style={{ background: "rgba(255,255,255,0.08)", color: paper, border: "1px solid rgba(255,255,255,0.18)" }} title="Score settings">
              <Shield size={13} /> Score Settings
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
          <p className="text-[13px] font-bold uppercase tracking-[0.2em]" style={{ color: paper }}>Score Breakdown by Content Type</p>
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
        const COLS = ["Week of", "Content Type", "Content Title", "Status", "Key Message", "Spokesperson", "Release Date", "Authority Score", "Action Notes"];
        return (
          <div>
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
                <h3 className="text-[19px] font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Content Marketing Calendar</h3>
                <span className="text-[13px] font-light" style={{ color: vars.g500 }}>Click any row to open in the Content Optimiser</span>
              </div>
              <div className="hidden sm:flex items-center gap-2 px-5 py-2 border-b" style={{ borderColor: vars.g200, background: vars.g50 }}>
                <button
                  onClick={() => calendarScrollRef.current?.scrollBy({ left: -360, behavior: "smooth" })}
                  disabled={!calendarScrollState.canLeft}
                  className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full transition-all disabled:opacity-30 disabled:cursor-default hover:scale-110"
                  style={{ background: vars.navy, color: "white" }}
                  aria-label="Scroll calendar left"
                  title="Scroll left"
                >
                  <ChevronLeft size={16} />
                </button>
                <div
                  ref={topScrollRef}
                  className="overflow-x-auto flex-1"
                  style={{ height: 16 }}
                >
                  <div style={{ width: calendarScrollWidth || "100%", height: 1 }} />
                </div>
                <button
                  onClick={() => calendarScrollRef.current?.scrollBy({ left: 360, behavior: "smooth" })}
                  disabled={!calendarScrollState.canRight}
                  className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full transition-all disabled:opacity-30 disabled:cursor-default hover:scale-110"
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
                      className="pointer-events-auto flex items-center justify-center w-10 h-10 rounded-full shadow-lg transition-transform hover:scale-110"
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
                      className="pointer-events-auto flex items-center justify-center w-10 h-10 rounded-full shadow-lg transition-transform hover:scale-110"
                      style={{ position: "sticky", top: 160, marginRight: 8, background: "rgba(10,22,40,0.9)", color: "white" }}
                      aria-label="Scroll calendar right"
                      title="Scroll right"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                )}
                <div ref={calendarScrollRef} className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr>
                      {COLS.map((h) => (
                        <th key={h} className="px-2 py-2 text-left font-semibold border" style={{ color: "white", borderColor: vars.navy, background: HEADER_BG, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {weeks.map((w) => {
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
                                <td onClick={() => sendToOptimiser(p.id)} className="px-3 py-2 border cursor-pointer hover:bg-slate-100 transition-colors" style={{ background: slotBg, borderColor: vars.navy, color: vars.g600, whiteSpace: "nowrap" }}>{p.contentType || ""}</td>
                                <td className="px-3 py-2 border hover:bg-slate-100 transition-colors" style={{ background: slotBg, borderColor: vars.navy }}>
                                  <div className="flex items-center gap-1">
                                    <span onClick={() => sendToOptimiser(p.id)} className="cursor-pointer hover:underline flex-1 min-w-0 truncate text-[12px]" style={{ color: vars.navy, fontWeight: 600 }} title="Open in Content Optimiser">{p.title}</span>
                                    <button onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete "${p.title}" from the Comms Planner?`)) deleteProject(p.id); }} className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-[12px] font-bold opacity-40 hover:opacity-100 transition-opacity hover:bg-red-50" style={{ color: vars.red }} title="Delete from Comms Planner">✕</button>
                                  </div>
                                </td>
                                <td onClick={(e) => { e.stopPropagation(); setEditing(p); }} className="px-3 py-2 border cursor-pointer text-center hover:brightness-95 transition-all" style={{ background: cs!.bg, borderColor: vars.navy, color: cs!.fg, fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }} title="Click to change status">{p.status}</td>
                                <td onClick={() => sendToOptimiser(p.id)} className="px-3 py-2 border cursor-pointer hover:bg-slate-100 transition-colors" style={{ background: slotBg, borderColor: vars.navy, color: vars.g600, maxWidth: 220 }}>{p.keyMessage || ""}</td>
                                <td onClick={() => sendToOptimiser(p.id)} className="px-3 py-2 border cursor-pointer hover:bg-slate-100 transition-colors" style={{ background: slotBg, borderColor: vars.navy, color: vars.g600 }}>{p.spokesperson || ""}</td>
                                <td onClick={() => sendToOptimiser(p.id)} className="px-3 py-2 border cursor-pointer hover:bg-slate-100 transition-colors" style={{ background: slotBg, borderColor: vars.navy, color: vars.g600, whiteSpace: "nowrap" }}>{p.releaseDate || ""}</td>
                                <td onClick={() => sendToOptimiser(p.id)} className="px-3 py-2 border cursor-pointer text-right font-bold hover:bg-slate-100 transition-colors text-[12px]" style={{ background: slotBg, borderColor: vars.navy, color: vars.teal }}>{Math.round(s!.authority)}<span style={{ color: vars.g500, fontWeight: 400 }}>/50</span></td>
                                <td onClick={() => sendToOptimiser(p.id)} className="px-3 py-2 border cursor-pointer hover:bg-slate-100 transition-colors" style={{ background: slotBg, borderColor: vars.navy, color: vars.g600, maxWidth: 240 }}>{p.notes || ""}</td>
                              </>
                            ) : (
                              Array.from({ length: 8 }).map((__, c) => (
                                <td
                                  key={c}
                                  onClick={c === 0 ? () => { addProject(); setTimeout(() => { const last = loadPlannerProjects()[0]; if (last) setEditing({ ...last, week: w }); }, 0); } : undefined}
                                  className={`px-3 py-2 border ${c === 0 ? "cursor-pointer hover:bg-slate-100 transition-colors" : ""}`}
                                  style={{ background: slotBg, borderColor: vars.navy, color: vars.g300, minHeight: 28 }}
                                  title={c === 0 ? `Add project to ${label}` : undefined}
                                >
                                  {c === 0 && i === wkProjects.length ? <button className="text-[13px] font-bold px-3 py-1.5 rounded-lg" style={{ color: vars.teal, background: "rgba(79,143,255,0.12)", border: `1.5px solid rgba(79,143,255,0.35)` }}>+ Add project</button> : ""}
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
      <div className="bg-white border rounded-2xl overflow-hidden" style={{ borderColor: vars.g200 }}>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead style={{ background: vars.g50 }}>
              <tr>
                <th className="px-3 py-3 text-left font-semibold sticky left-0 z-10" style={{ color: vars.g500, background: vars.g50, minWidth: 100 }}>WC date</th>
                <th className="px-3 py-3 text-left font-semibold" style={{ color: vars.g500 }}>Content</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => {
                const wkProjects = projects.filter((p) => p.week === w);
                const wkScore = wkProjects.reduce((s, p) => { const sc = scoreProject(p, cfg); return s + sc.visibility + sc.authority; }, 0);
                const wcLabel = weekDateLabel(w);
                return (
                  <tr key={w} className="border-t" style={{ borderColor: vars.g100 }}>
                    <td className="px-3 py-3 align-top sticky left-0 z-10 bg-white" style={{ minWidth: 100 }}>
                      <div className="text-[13px] font-semibold" style={{ color: vars.navy }}>w/c {wcLabel}</div>
                      <div className="text-[10px] font-light mt-0.5" style={{ color: vars.g400 }}>Week {w}</div>
                      {wkScore > 0 && <div className="text-[10px] font-semibold mt-1 px-1.5 py-0.5 rounded inline-block" style={{ background: "rgba(31,116,143,0.08)", color: vars.accent }}>{Math.round(wkScore)} pts</div>}
                    </td>
                    <td className="px-3 py-3">
                      {wkProjects.length === 0 ? (
                        <button onClick={() => sendToOptimiser()} className="text-[13px] font-bold px-4 py-2 rounded-lg border-2" style={{ color: vars.teal, borderColor: "rgba(79,143,255,0.4)", background: "rgba(79,143,255,0.06)" }}>+ Add to w/c {wcLabel}</button>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {wkProjects.map((p) => {
                            const s = scoreProject(p, cfg);
                            const cs = STATUS_COLOURS[p.status];
                            const canResearch = RESEARCH_TYPES.includes(p.contentType);
                            return (
                              <div key={p.id} className="rounded-lg border p-3 transition-all min-w-[240px] max-w-[300px] bg-white" style={{ borderColor: vars.g200 }}>
                                <button onClick={() => sendToOptimiser(p.id)} className="text-left w-full">
                                  <div className="flex items-start justify-between gap-2 mb-1">
                                    <p className="text-[13px] font-semibold leading-tight" style={{ color: vars.navy }}>{p.title}</p>
                                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: cs.bg, color: cs.fg }}>{p.status}</span>
                                  </div>
                                  <p className="text-[11px] font-light mb-2" style={{ color: vars.g500 }}>{p.contentType}{p.spokesperson ? ` · ${p.spokesperson}` : ""}</p>
                                  <div className="flex items-center justify-between text-[11px] mb-2">
                                    <span style={{ color: vars.g400 }}>{p.channels.length} channel{p.channels.length === 1 ? "" : "s"}</span>
                                    <span className="font-bold" style={{ color: vars.accent }}>{Math.round(s.visibility + s.authority)} pts</span>
                                  </div>
                                </button>
                                <div className="flex items-center gap-1 pt-2 border-t" style={{ borderColor: vars.g100 }}>
                                  <button onClick={() => setEditing(p)} className="text-[10px] font-semibold px-2 py-1 rounded" style={{ background: vars.g100, color: vars.g500 }} title="Quick edit">Edit</button>
                                  {canResearch && (
                                    <button onClick={() => sendToMediaResearch(p.id)} className="text-[10px] font-semibold px-2 py-1 rounded ml-auto" style={{ background: "rgba(201,160,78,0.15)", color: "#7A5E25" }} title="Send to Media Research">
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
      )}

      {/* View switcher footer - duplicated below the table for ease of use on long calendars */}
      <div className="flex items-center justify-between flex-wrap gap-3 rounded-2xl p-3 sm:p-4 mt-6" style={{ background: ink, boxShadow: "0 4px 16px -10px rgba(16,43,54,0.25)" }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] mr-1" style={{ color: "rgba(251,246,236,0.6)" }}>View</span>
          <div className="inline-flex rounded-full p-1" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }} role="group" aria-label="Planner view (footer)">
            <button onClick={() => setView("spreadsheet")} className="flex items-center justify-center gap-1.5 w-[120px] px-3 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.12em] transition-colors" style={{ background: view === "spreadsheet" ? accentPink : "transparent", color: view === "spreadsheet" ? "white" : "rgba(251,246,236,0.7)" }}>
              <Calendar size={12} /> Calendar View
            </button>
            <button onClick={() => setView("cards")} className="flex items-center justify-center gap-1.5 w-[120px] px-3 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.12em] transition-colors" style={{ background: view === "cards" ? accentPink : "transparent", color: view === "cards" ? "white" : "rgba(251,246,236,0.7)" }}>
              <ListIcon size={12} /> List View
            </button>
          </div>
        </div>
        <button
          onClick={() => { if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.12em] transition-colors"
          style={{ background: "rgba(255,255,255,0.08)", color: paper, border: "1px solid rgba(255,255,255,0.18)" }}
          title="Back to top"
        >
          <ArrowUpRight size={12} /> Back to top
        </button>
      </div>

      {/* Methodology modal */}
      {showMethodology && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setShowMethodology(false)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: vars.g200 }}>
              <h2 className="text-[16px] font-semibold flex items-center gap-2" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
                <HelpCircle size={16} color={vars.accent} /> Comms Planner methodology
              </h2>
              <button onClick={() => setShowMethodology(false)} className="text-[20px] leading-none px-2" style={{ color: vars.g400 }}>&times;</button>
            </div>
            <div className="p-6 text-[13px] font-light leading-relaxed space-y-4" style={{ color: vars.g600 }}>
              <p>The Comms Planner ranks and combines a 12-week schedule of communications activity across <strong style={{ color: vars.navy }}>three categories of GEO content</strong>. Each item is scored on two dimensions, each out of 10:</p>
              <ul className="space-y-2 pl-4 list-disc">
                <li><strong style={{ color: vars.navy }}>Authority</strong> - how strongly the content type contributes to LLM citation. Trade publication articles score highest (9/10).</li>
                <li><strong style={{ color: vars.navy }}>Visibility</strong> - how many channels and audiences see it. Press releases and social posts score high here.</li>
              </ul>
              <p>Both dimensions feed a <strong style={{ color: vars.navy }}>Combined</strong> score (the average of the two). The default weighting table is shown below - change any value in <em>Score settings</em>.</p>
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: vars.g200 }}>
                <table className="w-full text-[12px]">
                  <thead style={{ background: vars.g50 }}>
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold" style={{ color: vars.g500 }}>Content type</th>
                      <th className="px-3 py-2 text-right font-semibold" style={{ color: vars.g500 }}>Authority</th>
                      <th className="px-3 py-2 text-right font-semibold" style={{ color: vars.g500 }}>Visibility</th>
                      <th className="px-3 py-2 text-right font-semibold" style={{ color: vars.g500 }}>Combined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(DEFAULT_SCORING.typeWeights).map(([t, w]) => (
                      <tr key={t} className="border-t" style={{ borderColor: vars.g100 }}>
                        <td className="px-3 py-2" style={{ color: vars.navy }}>{t}</td>
                        <td className="px-3 py-2 text-right font-semibold" style={{ color: vars.teal }}>{w.auth}</td>
                        <td className="px-3 py-2 text-right font-semibold" style={{ color: vars.accent }}>{w.vis}</td>
                        <td className="px-3 py-2 text-right font-bold" style={{ color: vars.navy }}>{((w.auth + w.vis) / 2).toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[12px] italic" style={{ color: vars.g500 }}>Status (Approved / Review / Drafting / Planned) and the number of release channels also factor in as multipliers. Items still in Planned earn 50% of their potential score.</p>
            </div>
            <div className="px-6 py-3 border-t flex justify-end" style={{ borderColor: vars.g200 }}>
              <button onClick={() => setShowMethodology(false)} className="text-[13px] font-semibold px-4 py-2 rounded-lg text-white" style={{ background: vars.accent }}>Got it</button>
            </div>
          </div>
        </div>
      )}

      {/* Archive picker */}
      {showArchivePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setShowArchivePicker(false)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: vars.g200 }}>
              <h2 className="text-[16px] font-semibold flex items-center gap-2" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
                <Archive size={16} color={vars.accent} /> Select archived content
              </h2>
              <button onClick={() => setShowArchivePicker(false)} className="text-[20px] leading-none px-2" style={{ color: vars.g400 }}>&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {archive.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-[13px] font-light" style={{ color: vars.g500 }}>{!contentVersion ? "Loading content…" : "The Archive is empty. Save a piece from the Optimiser or Creator first."}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {archive.map((a) => (
                    <button key={a.id} onClick={() => { sendToOptimiser(a.id); setShowArchivePicker(false); }} className="w-full text-left rounded-lg border p-3 hover:shadow-sm transition-all" style={{ borderColor: vars.g200 }}>
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
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: vars.g200 }}>
              <h2 className="text-[16px] font-semibold" style={{ color: vars.navy }}>Edit project</h2>
              <button onClick={() => setEditing(null)} className="text-[20px] leading-none px-2" style={{ color: vars.g400 }}>&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: vars.g500 }}>Project title</label>
                <input type="text" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-[13px]" style={{ borderColor: vars.g200 }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: vars.g500 }}>Content type</label>
                  <select value={editing.contentType} onChange={(e) => setEditing({ ...editing, contentType: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-[13px] bg-white" style={{ borderColor: vars.g200 }}>
                    {Object.keys(cfg.typeWeights).map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: vars.g500 }}>Status</label>
                  <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as PlannerStatus })} className="w-full px-3 py-2 rounded-lg border text-[13px] bg-white" style={{ borderColor: vars.g200 }}>
                    {(["Planned", "Drafting", "Review", "Approved"] as PlannerStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: vars.g500 }}>Spokesperson</label>
                  <input type="text" value={editing.spokesperson} onChange={(e) => setEditing({ ...editing, spokesperson: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-[13px]" style={{ borderColor: vars.g200 }} />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: vars.g500 }}>Audience</label>
                  <input type="text" value={editing.audience} onChange={(e) => setEditing({ ...editing, audience: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-[13px]" style={{ borderColor: vars.g200 }} />
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
                    className="w-full px-3 py-2 rounded-lg border text-[13px] bg-white"
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
                <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: vars.g500 }}>Release channels (multi-select)</label>
                <div className="flex flex-wrap gap-1.5">
                  {cfg.channels.map((c) => {
                    const on = editing.channels.includes(c);
                    return (
                      <button
                        key={c}
                        onClick={() => setEditing({ ...editing, channels: on ? editing.channels.filter((x) => x !== c) : [...editing.channels, c] })}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all"
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
                  <input type="number" value={editing.week} onChange={(e) => setEditing({ ...editing, week: parseInt(e.target.value, 10) || 1 })} className="w-full px-3 py-2 rounded-lg border text-[13px]" style={{ borderColor: vars.g200 }} />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: vars.g500 }}>Release date</label>
                  <input type="date" value={editing.releaseDate} onChange={(e) => setEditing({ ...editing, releaseDate: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-[13px]" style={{ borderColor: vars.g200 }} />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: vars.g500 }}>Notes</label>
                <textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg border text-[13px]" style={{ borderColor: vars.g200 }} />
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
              <button onClick={() => deleteProject(editing.id)} className="text-[12px] font-semibold px-3 py-2 rounded-lg" style={{ color: vars.red, background: "rgba(201,74,62,0.06)" }}>Delete</button>
              <div className="flex gap-2">
                <button onClick={() => setEditing(null)} className="text-[13px] font-semibold px-4 py-2 rounded-lg border" style={{ borderColor: vars.g200, color: vars.g500 }}>Cancel</button>
                <button onClick={saveEdit} className="text-[13px] font-semibold px-4 py-2 rounded-lg text-white" style={{ background: vars.accent }}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <ScoringSettingsModal cfg={cfg} onSave={(c) => { updateCfg(c); setShowSettings(false); }} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

function ScoringSettingsModal({ cfg, onSave, onClose }: { cfg: ScoringConfig; onSave: (c: ScoringConfig) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<ScoringConfig>(JSON.parse(JSON.stringify(cfg)));
  const [newType, setNewType] = useState("");
  const [newChannel, setNewChannel] = useState("");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: vars.g200 }}>
          <div>
            <h2 className="text-[16px] font-semibold" style={{ color: vars.navy }}>Scoring settings</h2>
            <p className="text-[11px]" style={{ color: vars.g500 }}>Tune how Visibility and Authority scores are calculated. Saved per browser.</p>
          </div>
          <button onClick={onClose} className="text-[20px] leading-none px-2" style={{ color: vars.g400 }}>&times;</button>
        </div>
        <div className="p-6 space-y-6">

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[13px] font-semibold" style={{ color: vars.navy }}>Content type weights</h3>
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
                      <td className="px-3 py-2"><input type="number" min={0} max={10} step={0.5} value={w.vis} onChange={(e) => updateWeight(t, "vis", parseFloat(e.target.value) || 0)} className="w-20 px-2 py-1 rounded border text-[12px]" style={{ borderColor: vars.g200 }} /></td>
                      <td className="px-3 py-2"><input type="number" min={0} max={10} step={0.5} value={w.auth} onChange={(e) => updateWeight(t, "auth", parseFloat(e.target.value) || 0)} className="w-20 px-2 py-1 rounded border text-[12px]" style={{ borderColor: vars.g200 }} /></td>
                      <td className="px-3 py-2 text-right"><button onClick={() => removeType(t)} className="text-[11px]" style={{ color: vars.red }} title="Remove">×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2 mt-2">
              <input type="text" value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="Add new content type…" className="flex-1 px-3 py-2 rounded-lg border text-[12px]" style={{ borderColor: vars.g200 }} />
              <button onClick={addType} className="px-3 py-2 rounded-lg text-[12px] font-semibold text-white" style={{ background: vars.accent }}>Add type</button>
            </div>
          </section>

          <section>
            <h3 className="text-[13px] font-semibold mb-2" style={{ color: vars.navy }}>Channel multiplier (Visibility only)</h3>
            <p className="text-[11px] mb-3" style={{ color: vars.g500 }}>Visibility multiplier = base + (channels × step), capped at max.</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: vars.g500 }}>Base</label>
                <input type="number" step={0.05} value={draft.channelBase} onChange={(e) => setDraft({ ...draft, channelBase: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 rounded-lg border text-[12px]" style={{ borderColor: vars.g200 }} />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: vars.g500 }}>Step (per channel)</label>
                <input type="number" step={0.05} value={draft.channelStep} onChange={(e) => setDraft({ ...draft, channelStep: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 rounded-lg border text-[12px]" style={{ borderColor: vars.g200 }} />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: vars.g500 }}>Max (cap)</label>
                <input type="number" step={0.05} value={draft.channelCap} onChange={(e) => setDraft({ ...draft, channelCap: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 rounded-lg border text-[12px]" style={{ borderColor: vars.g200 }} />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: vars.g500 }}>Channels</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {draft.channels.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border" style={{ borderColor: vars.g200, color: vars.navy }}>
                    {c}
                    <button onClick={() => removeChannel(c)} style={{ color: vars.red }}>×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={newChannel} onChange={(e) => setNewChannel(e.target.value)} placeholder="Add new channel…" className="flex-1 px-3 py-2 rounded-lg border text-[12px]" style={{ borderColor: vars.g200 }} />
                <button onClick={addChannel} className="px-3 py-2 rounded-lg text-[12px] font-semibold text-white" style={{ background: vars.accent }}>Add channel</button>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-[13px] font-semibold mb-2" style={{ color: vars.navy }}>Status multipliers</h3>
            <p className="text-[11px] mb-3" style={{ color: vars.g500 }}>Discounts both Visibility and Authority by delivery confidence.</p>
            <div className="grid grid-cols-4 gap-3">
              {(Object.keys(draft.statusMultipliers) as PlannerStatus[]).map((s) => (
                <div key={s}>
                  <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: vars.g500 }}>{s}</label>
                  <input type="number" min={0} max={1} step={0.05} value={draft.statusMultipliers[s]} onChange={(e) => updateStatus(s, parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 rounded-lg border text-[12px]" style={{ borderColor: vars.g200 }} />
                </div>
              ))}
            </div>
          </section>
        </div>
        <div className="px-6 py-4 border-t flex items-center justify-between" style={{ borderColor: vars.g200 }}>
          <button onClick={() => setDraft(JSON.parse(JSON.stringify(DEFAULT_SCORING)))} className="text-[12px] font-semibold px-3 py-2 rounded-lg" style={{ color: vars.g500, background: vars.g50 }}>Reset to defaults</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-[13px] font-semibold px-4 py-2 rounded-lg border" style={{ borderColor: vars.g200, color: vars.g500 }}>Cancel</button>
            <button onClick={() => onSave(draft)} className="text-[13px] font-semibold px-4 py-2 rounded-lg text-white" style={{ background: vars.accent }}>Save settings</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { PlannerPage, ScoringSettingsModal };
