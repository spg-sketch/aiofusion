import { useState, useEffect } from "react";
import { Archive, Search } from "lucide-react";
import { vars } from "../marketing/vars";
import {
  useContentStore, loadArchive, saveArchive, loadPlannerProjects,
  savePlannerProjects, getISOWeek, weekDateLabel, _contentStoreReady,
} from "../lib/contentStore";
import { loadIntakeData, getKeyMessages, getSpokespeople } from "../IntakeForm";
import InfoTip from "../InfoTip";
import { CONTENT_TYPES } from "../lib/appHelpers";
import type { ArchiveItem, PlannerProject } from "../types";

export default function ArchivePage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const contentVersion = useContentStore();
  const intake = loadIntakeData();
  const projectName = (intake?.formData["4.1"] as string) || "your project";
  const keyMessages = getKeyMessages();
  const intakeSpeakers = getSpokespeople();

  const [archive, setArchive] = useState<ArchiveItem[]>(() => loadArchive());
  useEffect(() => { setArchive(loadArchive()); }, [contentVersion]);
  const [query, setQuery] = useState("");
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

  const handleDelete = (id: string) => {
    if (!confirm("Delete this archive item?")) return;
    const updated = archive.filter((a) => a.id !== id);
    setArchive(updated);
    saveArchive(updated);
  };

  const sendToTool = (id: string) => {
    const item = archive.find((a) => a.id === id);
    const dest = item?.source === "creator" ? "creator" : "optimiser";
    const key = dest === "creator" ? "aio.creator.preload" : "aio.optimiser.preload";
    try { localStorage.setItem(key, id); } catch { /* noop */ }
    onNavigate(dest);
  };

  const pushArchiveToPlanner = (item: ArchiveItem) => {
    const projects = loadPlannerProjects();
    const releaseDate = (item.releasedAt || item.createdAt || "").slice(0, 10);
    const currentWeek = getISOWeek(new Date());
    const rawWeek = getISOWeek(new Date(releaseDate || Date.now()));
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
      notes: `Pushed from Archive · ${item.status} · ${new Date(item.createdAt).toLocaleDateString()}`,
    };
    savePlannerProjects([proj, ...projects]);
    alert(`"${proj.title}" added to the Comms Planner (w/c ${weekDateLabel(wk)}).`);
    onNavigate("planner");
  };

  const clearFilters = () => {
    setQuery(""); setPeriodFilter(""); setTypeFilter(""); setMessageFilter([]); setSpokespersonFilter("");
  };

  return (
    <div className="p-6 sm:p-10 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl mb-1.5 flex items-center gap-2" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
          <Archive size={22} color={vars.accent} /> Archive - {projectName}
        </h1>
        <p className="text-[14px] font-light" style={{ color: vars.g500 }}>
          Your full, searchable library of every accepted, drafted and reviewed piece for this project, filtered by message, spokesperson, content type and time period. A well kept archive lets you reuse proven content and keep messaging consistent, which compounds your authority with AI over time. Click any card to send it back to the Content Optimiser.
        </p>
      </div>

      <div className="bg-white border rounded-2xl p-5 mb-6" style={{ borderColor: vars.g200 }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14px] font-semibold flex items-center gap-1.5" style={{ color: vars.navy }}>
            <Search size={14} color={vars.accent} /> Search panel
            <InfoTip text="Filter the archive by free-text keyword, time period, content type, project message and spokesperson. All filters combine." />
          </h2>
          {(query || periodFilter || typeFilter || messageFilter.length > 0 || spokespersonFilter) && (
            <button onClick={clearFilters} className="text-[11px] font-medium hover:underline" style={{ color: vars.accent }}>Clear filters</button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-2">
            <label className="text-[11px] font-semibold mb-1 block" style={{ color: vars.g500 }}>Enter key word</label>
            <input type="text" placeholder="e.g. agentic, benchmarking, launch…" value={query} onChange={(e) => setQuery(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-[13px]" style={{ borderColor: vars.g200 }} />
          </div>
          <div>
            <label className="text-[11px] font-semibold mb-1 block" style={{ color: vars.g500 }}>Time Period</label>
            <select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-[13px] bg-white" style={{ borderColor: vars.g200 }}>
              <option value="">All time</option>
              <option value="month">This month</option>
              <option value="quarter">This quarter</option>
              <option value="year">This year</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold mb-1 block" style={{ color: vars.g500 }}>Content Type</label>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-[13px] bg-white" style={{ borderColor: vars.g200 }}>
              <option value="">All types</option>
              {CONTENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold mb-1 block" style={{ color: vars.g500 }}>Spokesperson</label>
            <select value={spokespersonFilter} onChange={(e) => setSpokespersonFilter(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-[13px] bg-white" style={{ borderColor: vars.g200 }}>
              <option value="">All spokespeople</option>
              {allSpeakers.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="lg:col-span-3">
            <label className="text-[11px] font-semibold mb-1 block" style={{ color: vars.g500 }}>
              Project Message <span className="font-light">(multi-select from 1.2 & 1.3)</span>
            </label>
            <div className="rounded-lg border p-2 min-h-[42px] flex flex-wrap gap-1.5" style={{ borderColor: vars.g200, background: "white" }}>
              {keyMessages.length === 0 && (
                <span className="text-[11px] font-light italic self-center" style={{ color: vars.g400 }}>No messages - set in Project Set-Up</span>
              )}
              {keyMessages.map((m) => {
                const label = m.short || m.long;
                const on = messageFilter.includes(label);
                return (
                  <button key={`${m.tag}-${label}`} onClick={() => setMessageFilter(on ? messageFilter.filter((x) => x !== label) : [...messageFilter, label])}
                    className="text-[10px] font-semibold px-2 py-1 rounded-full border"
                    style={{ borderColor: on ? vars.accent : vars.g200, background: on ? "rgba(31,116,143,0.1)" : "white", color: on ? vars.accent : vars.g500 }}
                    title={m.long}>
                    [{m.tag}] {label.length > 50 ? `${label.slice(0, 50)}…` : label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-3 text-[11px] font-light" style={{ color: vars.g500 }}>
          Showing <strong style={{ color: vars.navy }}>{filtered.length}</strong> of {archive.length} archived items.
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border rounded-2xl p-10 text-center" style={{ borderColor: vars.g200 }}>
          <Archive size={28} color={vars.g400} className="mx-auto mb-3" />
          <p className="text-[14px] font-medium" style={{ color: vars.navy }}>{!_contentStoreReady ? "Loading your content…" : archive.length === 0 ? "Archive is empty" : "No matching items"}</p>
          <p className="text-[13px] font-light mt-1" style={{ color: vars.g500 }}>{!_contentStoreReady ? "Fetching your saved pieces from the server." : archive.length === 0 ? "Save a draft or final piece from the Content Optimiser, Content Creator or Comms Planner to start building your library." : "Try clearing your filters."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div key={item.id} className="bg-white border rounded-xl p-5 transition-all hover:shadow-sm cursor-pointer" style={{ borderColor: vars.g200 }} onClick={() => sendToTool(item.id)}>
              <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="text-[15px] font-semibold" style={{ color: vars.navy }}>{item.title}</h3>
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded" style={{ background: item.status === "Final" ? "rgba(61,155,107,0.15)" : "rgba(212,146,42,0.15)", color: item.status === "Final" ? vars.green : vars.amber }}>{item.status}</span>
                  </div>
                  <p className="text-[12px] font-light" style={{ color: vars.g500 }}>
                    {item.contentType}{item.spokesperson ? ` · ${item.spokesperson}` : ""} · {new Date(item.createdAt).toLocaleDateString()}
                  </p>
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {item.tags.map((t) => (
                        <span key={t} className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: "rgba(31,116,143,0.06)", color: vars.accent }}>#{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); sendToTool(item.id); }} className="text-[12px] font-medium px-3 py-1.5 rounded-lg" style={{ background: "rgba(31,116,143,0.08)", color: vars.accent }}>
                    {item.source === "creator" ? "Open in Creator" : "Open in Optimiser"}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); pushArchiveToPlanner(item); }} className="text-[12px] font-medium px-3 py-1.5 rounded-lg" style={{ background: "rgba(91,168,181,0.12)", color: vars.teal }} title="Add a planner row populated from this archive item">
                    Push to Comms Planner
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }} className="text-[12px] font-medium px-3 py-1.5 rounded-lg" style={{ color: vars.red, background: "rgba(201,74,62,0.06)" }}>Delete</button>
                </div>
              </div>
              <p className="text-[12px] font-light leading-relaxed line-clamp-3" style={{ color: vars.g500 }}>
                {item.body.slice(0, 240)}{item.body.length > 240 ? "..." : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
