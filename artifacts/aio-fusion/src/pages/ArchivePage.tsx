import { useState, useMemo, useEffect } from "react";
import {
  ChevronRight, Lock, Search, FileEdit, BarChart3, Archive, Send, LineChart, ArrowRight, Sparkles, Loader2,
  TrendingUp, FileText, FileCheck2, Target, Code2, HelpCircle, MessageSquareQuote, Bot, ShieldCheck,
  MessagesSquare, Download, AlertTriangle, CheckCircle2, XCircle, Info, Globe, Tag, User, ChevronDown,
  Plus, Minus, MessageSquare, BookOpen, Scroll, Award, Radio, Mic2, PenLine, ClipboardList, ArrowUpRight,
  Lightbulb, ClipboardPaste, Upload, Calendar, Check, Save, Circle, Zap, Mail, Shield, Eye, Building2,
  ArrowLeft, LogOut, Trash2, KeyRound, Users, Activity, Play, ChevronUp, Menu, X, LogIn,
  Link as LinkIcon, Image as ImageIcon, Repeat, TrendingDown, FolderOpen, List as ListIcon, Clock,
  Undo2, ArchiveRestore, RefreshCw, MonitorSmartphone,
} from "lucide-react";
import { vars } from "../marketing/vars";
import { loadArchive, saveArchive, useContentStore, getContentStoreState, initContentStore, type ArchiveItem, splitArchiveBody, loadPlannerProjects, savePlannerProjects, getISOWeek, weekDateLabel, type PlannerProject } from "../lib/contentStore";
import CountdownBanner from "../components/CountdownBanner";
import { loadIntakeData, getKeyMessages, getSpokespeople } from "../IntakeForm";
import { CONTENT_TYPES } from "./shared";
import InfoTip from "../InfoTip";
function ArchivePage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const contentVersion = useContentStore();
  const intake = loadIntakeData();
  const projectName = (intake?.formData["4.1"] as string) || "your project";
  const keyMessages = getKeyMessages();
  const intakeSpeakers = getSpokespeople();

  const [archive, setArchive] = useState<ArchiveItem[]>(() => loadArchive());
  useEffect(() => { setArchive(loadArchive()); }, [contentVersion]);
  const storeState = getContentStoreState();
  const [actionError, setActionError] = useState("");
  const [query, setQuery] = useState(() => {
    try {
      const id = localStorage.getItem("aio.archive.preload");
      localStorage.removeItem("aio.archive.preload");
      return archive.find((item) => item.id === id)?.title || "";
    } catch {
      return "";
    }
  });
  const [periodFilter, setPeriodFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [messageFilter, setMessageFilter] = useState<string[]>([]);
  const [spokespersonFilter, setSpokespersonFilter] = useState<string>("");

  const allSpeakers = Array.from(new Set([
    ...intakeSpeakers.map((s) => s.name),
    ...archive.map((a) => a.spokesperson).filter(Boolean) as string[],
  ]));

  const periodMatches = (createdAt: string): boolean => {
    if (!periodFilter) return true;
    const d = new Date(createdAt);
    const now = new Date();
    if (periodFilter === "month") {
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
    if (periodFilter === "quarter") {
      const q = Math.floor(now.getMonth() / 3);
      const dq = Math.floor(d.getMonth() / 3);
      return d.getFullYear() === now.getFullYear() && dq === q;
    }
    if (periodFilter === "year") {
      return d.getFullYear() === now.getFullYear();
    }
    return true;
  };

  const filtered = archive.filter((item) => {
    if (typeFilter && item.contentType !== typeFilter) return false;
    if (spokespersonFilter && item.spokesperson !== spokespersonFilter) return false;
    if (!periodMatches(item.createdAt)) return false;
    if (messageFilter.length > 0) {
      const hay = (item.title + " " + (item.body || "") + " " + (item.tags || []).join(" ")).toLowerCase();
      const anyHit = messageFilter.some((m) => hay.includes(m.toLowerCase().slice(0, 40)));
      if (!anyHit) return false;
    }
    if (query) {
      const q = query.toLowerCase();
      const hay = [item.title, item.body, ...(item.tags || []), item.spokesperson || ""].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this archive item?")) return;
    const updated = archive.filter((a) => a.id !== id);
    setActionError("");
    try { await saveArchive(updated); }
    catch { setActionError(getContentStoreState().mutationError === "authentication" ? "Your session expired. Sign in again before retrying." : "The item was not deleted. Check your connection and retry."); }
  };

  const sendToTool = (id: string) => {
    const item = archive.find((a) => a.id === id);
    const dest = item?.source === "creator" ? "creator" : "optimiser";
    const key = dest === "creator" ? "aio.creator.preload" : "aio.optimiser.preload";
    try { localStorage.setItem(key, id); } catch { /* noop */ }
    onNavigate(dest);
  };

  const pushArchiveToPlanner = async (item: ArchiveItem) => {
    const projects = loadPlannerProjects();
    const releaseDate = (item.releasedAt || item.createdAt || "").slice(0, 10);
    const currentWeek = getISOWeek(new Date());
    const rawWeek = getISOWeek(new Date(releaseDate || Date.now()));
    // Planner only renders a 12-week window starting from the current ISO week.
    // Archive items are usually dated in the past, so clamp older dates to the current week
    // (otherwise the row would save to localStorage but never appear in the visible calendar).
    const wk = rawWeek < currentWeek ? currentWeek : rawWeek;
    const km = keyMessages[0]?.short || keyMessages[0]?.long || "";
    const proj: PlannerProject = {
      id: `pp-${Date.now()}`,
      title: item.title || "Untitled archive item",
      contentType: item.contentType || "Article",
      spokesperson: item.spokesperson || "",
      keyMessage: km,
      audience: "",
      channels: item.releaseChannel ? [item.releaseChannel] : [],
      week: wk,
      status: item.status === "Final" ? "Approved" : "Review",
      releaseDate,
      notes: `Pushed from Content Library · ${item.status} · ${new Date(item.createdAt).toLocaleDateString()}`,
    };
    setActionError("");
    try {
      await savePlannerProjects([proj, ...projects]);
      alert(`"${proj.title}" added to the Comms Planner (w/c ${weekDateLabel(wk)}).`);
      onNavigate("planner");
    } catch {
      setActionError(getContentStoreState().mutationError === "authentication" ? "Your session expired. Sign in again before retrying." : "The planner item was not saved. Check your connection and retry.");
    }
  };

  const clearFilters = () => {
    setQuery(""); setPeriodFilter(""); setTypeFilter(""); setMessageFilter([]); setSpokespersonFilter("");
  };

  return (
    <div className="p-6 sm:p-10 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl mb-1.5 flex items-center gap-2" style={{ color: "#ffffff", fontFamily: "'Alice', Georgia, serif" }}>
          <Archive size={22} color="#ffffff" /> Content Library - {projectName}
        </h1>
        <p className="text-[14px] font-light" style={{ color: "rgba(255,255,255,0.85)" }}>
          Your full, searchable library of every accepted, drafted and reviewed piece for this project, filtered by message, spokesperson, content type and time period. A well kept library lets you reuse proven content and keep messaging consistent, which compounds your authority with AI over time.
        </p>
      </div>

      {(storeState.status === "network-error" || storeState.status === "authentication-error" || actionError || storeState.mutationPending) && (
        <div className="bg-white border rounded-xl px-4 py-3 mb-4 flex items-center justify-between gap-3" style={{ borderColor: storeState.mutationPending ? vars.g200 : vars.red }}>
          <p className="text-[13px]" style={{ color: vars.navy }}>
            {storeState.mutationPending ? "Saving changes…" : actionError || (storeState.status === "authentication-error" ? "Your session expired. Sign in again to load your Content Library." : "We could not load your Content Library. Your saved content has not been replaced.")}
          </p>
          {storeState.status === "network-error" && <button onClick={() => void initContentStore()} className="text-[12px] font-semibold px-3 py-1.5 rounded-lg" style={{ background: vars.accent, color: "white" }}><RefreshCw size={13} className="inline mr-1" />Retry</button>}
        </div>
      )}

      {/* Search panel */}
      <div className="bg-white border rounded-2xl p-5 mb-6" style={{ borderColor: vars.g200 }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14px] font-semibold flex items-center gap-1.5" style={{ color: vars.navy }}>
            <Search size={14} color={vars.accent} /> Search panel
            <InfoTip text="Filter the archive by free-text keyword, time period, content type, project message and spokesperson. All filters combine." />
          </h2>
          {(query || periodFilter || typeFilter || messageFilter.length > 0 || spokespersonFilter) && (
            <button onClick={clearFilters} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 text-[11px] font-medium hover:underline" style={{ color: vars.accent }}>Clear filters</button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-2">
            <label htmlFor="archive-keyword" className="text-[12px] font-semibold mb-1 block" style={{ color: vars.g500 }}>Enter keyword</label>
            <input id="archive-keyword" type="text" placeholder="e.g. agentic, benchmarking, launch…" value={query} onChange={(e) => setQuery(e.target.value)}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 w-full px-3 py-2 rounded-lg border text-[14px]" style={{ borderColor: vars.g200 }} />
          </div>
          <div>
            <label htmlFor="archive-period" className="text-[12px] font-semibold mb-1 block" style={{ color: vars.g500 }}>Time Period</label>
            <select id="archive-period" aria-label="Filter by time period" value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 w-full px-3 py-2 rounded-lg border text-[14px] bg-white hover:bg-slate-50 cursor-pointer" style={{ borderColor: vars.g200 }}>
              <option value="">All time</option>
              <option value="month">This month</option>
              <option value="quarter">This quarter</option>
              <option value="year">This year</option>
            </select>
          </div>
          <div>
            <label htmlFor="archive-type" className="text-[12px] font-semibold mb-1 block" style={{ color: vars.g500 }}>Content Type</label>
            <select id="archive-type" aria-label="Filter by content type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 w-full px-3 py-2 rounded-lg border text-[14px] bg-white hover:bg-slate-50 cursor-pointer" style={{ borderColor: vars.g200 }}>
              <option value="">All types</option>
              {CONTENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="archive-spokesperson" className="text-[12px] font-semibold mb-1 block" style={{ color: vars.g500 }}>Spokesperson</label>
            <select id="archive-spokesperson" aria-label="Filter by spokesperson" value={spokespersonFilter} onChange={(e) => setSpokespersonFilter(e.target.value)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 w-full px-3 py-2 rounded-lg border text-[14px] bg-white hover:bg-slate-50 cursor-pointer" style={{ borderColor: vars.g200 }}>
              <option value="">All spokespeople</option>
              {allSpeakers.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="lg:col-span-3">
            <label className="text-[12px] font-semibold mb-1 block" style={{ color: vars.g500 }}>
              Project Message <span className="font-light">(multi-select from 1.2 & 1.3)</span>
            </label>
            <div className="rounded-lg border p-2 min-h-[42px] flex flex-wrap gap-1.5" style={{ borderColor: vars.g200, background: "white" }}>
              {keyMessages.length === 0 && (
                <span className="text-[12px] font-light italic self-center" style={{ color: vars.g400 }}>No messages - set in Project Set-Up</span>
              )}
              {keyMessages.map((m) => {
                const label = m.short || m.long;
                const on = messageFilter.includes(label);
                return (
                  <button key={`${m.tag}-${label}`} type="button" aria-pressed={on} aria-label={`Filter by project message: ${label}`} onClick={() => setMessageFilter(on ? messageFilter.filter((x) => x !== label) : [...messageFilter, label])}
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 text-[12px] font-semibold px-2 py-1 rounded-full border hover:brightness-95 transition-all"
                    style={{ borderColor: on ? vars.accent : vars.g200, background: on ? "rgba(31,116,143,0.1)" : "white", color: on ? vars.accent : vars.g500 }}
                    title={m.long}>
                    [{m.tag}] {label.length > 50 ? `${label.slice(0, 50)}…` : label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-3 text-[12px] font-light" style={{ color: vars.g500 }}>
          Showing <strong style={{ color: vars.navy }}>{filtered.length}</strong> of {archive.length} archived items.
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border rounded-2xl p-10 text-center" style={{ borderColor: vars.g200 }}>
          <Archive size={36} color={vars.teal} className="mx-auto mb-4" />
          <p className="text-[16px] font-medium" style={{ color: vars.navy }}>
            {storeState.status === "loading" ? "Loading your content…" : storeState.status === "authentication-error" ? "Session expired" : storeState.status === "network-error" ? "Content unavailable" : archive.length === 0 ? "Library is empty" : "No matching items"}
          </p>
          <p className="text-[14px] font-light mt-2" style={{ color: vars.g500 }}>
            {storeState.status === "loading" ? "Fetching your saved pieces from the server." : storeState.status === "authentication-error" ? "Your session has expired. Please sign back in - your content is safe and will reappear." : storeState.status === "network-error" ? "Retry the load when your connection is restored." : archive.length === 0 ? "Save a draft or final piece from the Content Optimiser, Content Creator or Comms Planner to start building your library." : "Try clearing your filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <article key={item.id} className="bg-white border rounded-xl p-5 transition-all hover:shadow-md hover:bg-slate-50" style={{ borderColor: vars.g200 }}>
              <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
                <button type="button" onClick={() => sendToTool(item.id)} aria-label={`Open ${item.title} in ${item.source === "creator" ? "Creator" : "Optimiser"}`} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 flex-1 min-w-0 text-left rounded-lg">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span role="heading" aria-level={3} className="text-[16px] font-semibold" style={{ color: vars.navy }}>{item.title}</span>
                    <span className="text-[12px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded" style={{ background: item.status === "Final" ? "rgba(61,155,107,0.15)" : "rgba(212,146,42,0.15)", color: item.status === "Final" ? vars.green : vars.amber }}>{item.status}</span>
                  </div>
                  <p className="text-[13px] font-light" style={{ color: vars.g500 }}>
                    {item.contentType}{item.spokesperson ? ` · ${item.spokesperson}` : ""} · {new Date(item.createdAt).toLocaleDateString()}
                  </p>
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {item.tags.map((t) => (
                        <span key={t} className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: "rgba(31,116,143,0.06)", color: vars.teal }}>#{t}</span>
                      ))}
                    </div>
                  )}
                </button>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button type="button" onClick={() => sendToTool(item.id)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 text-[13px] font-medium px-3 py-1.5 rounded-lg hover:brightness-95 transition-all" style={{ background: "rgba(31,116,143,0.08)", color: vars.teal }}>
                    {item.source === "creator" ? "Open in Creator" : "Open in Optimiser"}
                  </button>
                  <button type="button" onClick={() => pushArchiveToPlanner(item)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 text-[13px] font-medium px-3 py-1.5 rounded-lg hover:brightness-95 transition-all" style={{ background: "rgba(91,168,181,0.12)", color: vars.teal }} title="Add a planner row populated from this content library item">
                    Push to Comms Planner
                  </button>
                  <button type="button" onClick={() => handleDelete(item.id)} aria-label={`Delete ${item.title}`} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 text-[13px] font-medium px-3 py-1.5 rounded-lg hover:brightness-95 transition-all" style={{ color: vars.red, background: "rgba(201,74,62,0.06)" }}>Delete</button>
                </div>
              </div>
              <button type="button" onClick={() => sendToTool(item.id)} aria-label={`Open ${item.title} content`} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 text-left w-full rounded-lg">
                <p className="text-[14px] font-light leading-relaxed line-clamp-3 mt-3" style={{ color: vars.g500 }}>
                  {item.body.slice(0, 240)}{item.body.length > 240 ? "..." : ""}
                </p>
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export { ArchivePage };
