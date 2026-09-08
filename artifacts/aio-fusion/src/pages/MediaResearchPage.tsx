import { useEffect, useState } from "react";
import { Check, Database, Download, ExternalLink, Loader2, Search, Target, ThumbsDown, Users } from "lucide-react";
import { vars } from "../marketing/vars";
import { escapeHtml, apiBase } from "../lib/contentAi";
import { loadArchive, useContentStore } from "../lib/contentStore";
import { getActiveProjectId, getKeyMessages, getProjectMediaCategories } from "../IntakeForm";
import { SummaryRow } from "./shared";
import { RecommendationCard, LiveDiscoveryCard, type Contact, type Recommendation, type Decision, type LiveDiscovery } from "./JournalistComponents";


function termsFor(selected: { title: string; headline?: string; standfirst?: string; bodyCopy?: string; body?: string }, categories: string[], messages: string[]) {
  const text = [selected.title, selected.headline, selected.standfirst, selected.bodyCopy || selected.body, ...categories, ...messages].join(" ").toLowerCase();
  const words: string[] = text.match(/[a-z][a-z0-9-]{2,}/g) || [];
  return Array.from(new Set(words.filter((term) => term.length > 3))).slice(0, 30);
}

function MediaResearchPage() {
  useContentStore();
  const archive = loadArchive().filter((a) => ["Press release", "Article", "Case study", "Whitepaper", "Blog post"].includes(a.contentType));
  const messages = getKeyMessages().map((m) => m.long || m.short).filter(Boolean);
  const categories = getProjectMediaCategories();
  const projectId = getActiveProjectId();
  const [selectedId, setSelectedId] = useState(() => { try { return localStorage.getItem("aio.research.preload") || ""; } catch { return ""; } });
  const [items, setItems] = useState<Recommendation[]>([]);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [liveItems, setLiveItems] = useState<LiveDiscovery[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [savedDiscoveries, setSavedDiscoveries] = useState<Record<string, "saving" | "saved">>({});
  const [discoveryToken, setDiscoveryToken] = useState("");
  const selected = archive.find((a) => a.id === selectedId);
  const storyKey = selected?.id || "";

  const [searchQuery, setSearchQuery] = useState("");
  const [regions, setRegions] = useState<string[]>(["UK"]);
  const [sectorTopic, setSectorTopic] = useState("");

  const toggleRegion = (reg: string) => {
    setRegions((prev) => {
      if (prev.includes(reg)) {
        if (prev.length === 1) return prev;
        return prev.filter((r) => r !== reg);
      }
      return [...prev, reg];
    });
  };

  const loadDecisions = async () => {
    if (!projectId || !storyKey) return;
    const response = await fetch(`${apiBase()}/api/store/media-db/recommendations/decisions?projectId=${encodeURIComponent(projectId)}&storyKey=${encodeURIComponent(storyKey)}`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    setDecisions(Object.fromEntries((data.decisions || []).map((d: Decision) => [d.contactId, d])));
    // The decisions endpoint includes persisted recommendation records so the
    // shortlist remains useful after a page reload, without regenerating it.
    if (Array.isArray(data.items)) {
      setItems(data.items.map((item: Record<string, unknown>, index: number) => ({
        rank: Number(item.rank) || index + 1,
        score: Number(item.score) || 0,
        reasons: Array.isArray(item.reasons) ? item.reasons.filter((reason): reason is string => typeof reason === "string") : [],
        contact: (item.contact || item) as Contact,
      })).filter((item: Recommendation) => Number(item.contact?.id) > 0));
    }
  };
  useEffect(() => { void loadDecisions(); }, [projectId, storyKey]);
  useEffect(() => { try { localStorage.removeItem("aio.research.preload"); } catch { /* noop */ } }, []);

  const recommend = async () => {
    if (!selected || !projectId) { setError("Choose a saved article and active project before matching contacts."); return; }
    setLoading(true); setError(""); setItems([]);
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/recommendations`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, storyKey, terms: termsFor(selected, categories, messages) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not match database contacts.");
      setItems(data.items || []);
      await loadDecisions();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not match database contacts."); }
    finally { setLoading(false); }
  };
  const discoverLive = async () => {
    if (!selected || !projectId) { setError("Choose a saved article and active project before searching the web."); return; }
    setLiveLoading(true); setError(""); setLiveItems([]);
    try {
      const response = await fetch(`${apiBase()}/api/content/media-discover`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          content: {
            title: selected.title,
            headline: selected.headline,
            standfirst: selected.standfirst,
            bodyCopy: selected.bodyCopy || selected.body,
          },
          mediaCategories: categories,
          keyMessages: messages,
          query: searchQuery,
          regions,
          sectorTopic,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not complete live media research.");
      setLiveItems(Array.isArray(data.items) ? data.items : []);
      setDiscoveryToken(typeof data.discoveryToken === "string" ? data.discoveryToken : "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not complete live media research.");
    } finally {
      setLiveLoading(false);
    }
  };
  const saveDiscovery = async (candidate: LiveDiscovery) => {
    setSavedDiscoveries((current) => ({ ...current, [candidate.candidateKey]: "saving" }));
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/discoveries`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateKey: candidate.candidateKey, discoveryToken }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save this discovery.");
      setSavedDiscoveries((current) => ({ ...current, [candidate.candidateKey]: "saved" }));
    } catch (reason) {
      setSavedDiscoveries((current) => {
        const next = { ...current };
        delete next[candidate.candidateKey];
        return next;
      });
      setError(reason instanceof Error ? reason.message : "Could not save this discovery.");
    }
  };
  const saveDecision = async (contactId: number, decision: Decision["decision"], nextNote = "") => {
    if (!projectId || !storyKey) return;
    const response = await fetch(`${apiBase()}/api/store/media-db/recommendations/decisions`, {
      method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, storyKey, contactId, decision, note: nextNote }),
    });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Could not save this decision."); return; }
    setDecisions((old) => ({ ...old, [contactId]: data.decision }));
    setNoteFor(null); setNote("");
  };
  const accepted = Object.values(decisions).filter((d) => d.decision === "shortlisted").map((d) => items.find((i) => i.contact.id === d.contactId)?.contact).filter(Boolean) as Contact[];
  const livePublicationCount = new Set(liveItems.map((item) => item.outletName.trim().toLowerCase()).filter(Boolean)).size;
  const liveGroups = [
    {
      label: "United Kingdom",
      items: liveItems.filter((item) => /\b(uk|united kingdom|england|scotland|wales|london)\b/i.test(item.geography || "")),
    },
    {
      label: "United States",
      items: liveItems.filter((item) => /\b(us|usa|united states|new york|washington|california)\b/i.test(item.geography || "")),
    },
  ];
  const groupedKeys = new Set(liveGroups.flatMap((group) => group.items.map((item) => item.candidateKey)));
  liveGroups.push({ label: "Other or global", items: liveItems.filter((item) => !groupedKeys.has(item.candidateKey)) });
  const exportAccepted = (format: "xls" | "doc") => {
    const rows = accepted.map((c) => [c.firstName, c.lastName, c.role, c.email, c.phone, c.outletName || "", c.outletCategory || "", (c.beats || []).join("; "), c.notes]);
    const title = "Accepted Media Contacts";
    const content = format === "xls"
      ? [["First name", "Last name", "Role", "Email", "Phone", "Outlet", "Category", "Beats", "Notes"], ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n")
      : `<!doctype html><html><body><h1>${title}</h1><table border="1"><tr><th>Name</th><th>Role</th><th>Email</th><th>Outlet</th><th>Category</th><th>Beats</th></tr>${accepted.map((c) => `<tr><td>${escapeHtml(`${c.firstName} ${c.lastName}`)}</td><td>${escapeHtml(c.role)}</td><td>${escapeHtml(c.email)}</td><td>${escapeHtml(c.outletName || "")}</td><td>${escapeHtml(c.outletCategory || "")}</td><td>${escapeHtml((c.beats || []).join(", "))}</td></tr>`).join("")}</table></body></html>`;
    const blob = new Blob([content], { type: format === "xls" ? "text/csv;charset=utf-8;" : "application/msword" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${title}.${format === "xls" ? "csv" : "doc"}`; link.click(); URL.revokeObjectURL(url);
  };
  const contactCard = (item: Recommendation, shortlist = false) => {
    return (
      <RecommendationCard
        key={item.contact.id}
        item={item}
        decision={decisions[item.contact.id]}
        onAccept={() => void saveDecision(item.contact.id, "shortlisted", decisions[item.contact.id]?.note || "")}
        onDecline={() => { setNoteFor(item.contact.id); setNote(decisions[item.contact.id]?.note || ""); }}
        onReject={(n) => void saveDecision(item.contact.id, "rejected", n)}
        noteFor={noteFor}
        setNoteFor={setNoteFor}
        note={note}
        setNote={setNote}
        isShortlist={shortlist}
      />
    );
  };
  return <div className="p-6 sm:p-8 max-w-6xl mx-auto"><div className="mb-6"><div className="flex gap-3 items-center"><Target color="#fff" size={28} /><h1 className="text-3xl sm:text-4xl" style={{ color: "#fff", fontFamily: "'Alice', Georgia, serif" }}>Media Research</h1></div><p className="text-[14px] mt-2" style={{ color: "rgba(255,255,255,.85)" }}>Match trusted contacts already in your database or discover current journalists from public web sources. Every live result includes evidence and a source.</p></div>
    <section className="bg-white rounded-2xl border p-5 mb-5 shadow-sm" style={{ borderColor: vars.g200 }}><label className="block text-[12px] font-bold mb-2" style={{ color: vars.navy }}>Saved article</label><select data-testid="select-research-article" value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setItems([]); setLiveItems([]); setDiscoveryToken(""); setError(""); }} className="w-full border rounded-lg p-2 text-[13px] outline-none focus:border-slate-400"><option value="">Choose a saved article</option>{archive.map((a) => <option key={a.id} value={a.id}>{a.title} ({a.contentType})</option>)}</select>{selected && <div className="grid sm:grid-cols-2 gap-2 mt-4"><SummaryRow label="Article" value={selected.title} /><SummaryRow label="Categories" value={categories.join(", ") || "No categories selected"} /></div>}
       <div className="mt-5 pt-5 border-t" style={{ borderColor: vars.g100 }}>
         <h3 className="text-[14px] font-semibold mb-3" style={{ color: vars.navy }}>Live Search Criteria</h3>
         <div className="grid md:grid-cols-2 gap-4">
           <div>
             <label className="block text-[12px] font-bold mb-1" style={{ color: vars.navy }}>Natural Language Query</label>
             <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="e.g. 'Tech reporters in London who cover AI'" className="w-full border rounded-lg p-2 text-[13px] outline-none focus:border-slate-400" />
             <p className="text-[11px] text-slate-500 mt-1">Examples: "US consumer tech editors", "Journalists writing about renewable energy"</p>
           </div>
           <div>
             <label className="block text-[12px] font-bold mb-1" style={{ color: vars.navy }}>Sector / Topic (optional)</label>
             <input value={sectorTopic} onChange={e => setSectorTopic(e.target.value)} placeholder="e.g. Cleantech, FinTech" className="w-full border rounded-lg p-2 text-[13px] outline-none focus:border-slate-400" />
           </div>
         </div>
         <div className="mt-4">
           <label className="block text-[12px] font-bold mb-1" style={{ color: vars.navy }}>Regions</label>
           <div className="flex gap-2">
             <button onClick={() => toggleRegion("UK")} className={`px-4 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors ${regions.includes("UK") ? "bg-slate-800 text-white border-slate-800 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>UK</button>
             <button onClick={() => toggleRegion("US")} className={`px-4 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors ${regions.includes("US") ? "bg-slate-800 text-white border-slate-800 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>US</button>
           </div>
         </div>
       </div>

    <div className="mt-5 pt-5 border-t flex flex-wrap gap-3" style={{ borderColor: vars.g100 }}><button data-testid="button-recommend-contacts" disabled={loading || liveLoading || !selected} onClick={() => void recommend()} className="px-5 py-2.5 rounded-lg text-white text-[13px] font-semibold disabled:opacity-50 transition-all shadow-sm" style={{ background: vars.coral }}>{loading ? <Loader2 className="inline animate-spin mr-1.5" size={16} /> : <Target className="inline mr-1.5" size={16} />}Match database contacts</button><button data-testid="button-discover-live" disabled={loading || liveLoading || !selected || !searchQuery.trim()} onClick={() => void discoverLive()} className="px-5 py-2.5 rounded-lg text-white text-[13px] font-semibold disabled:opacity-50 transition-all shadow-sm" style={{ background: vars.navy }}>{liveLoading ? <Loader2 className="inline animate-spin mr-1.5" size={16} /> : <Search className="inline mr-1.5" size={16} />}Search the public web</button></div><p className="mt-3 text-[11px]" style={{ color: vars.g500 }}>Live research sends the selected article excerpt, media categories and key messages to OpenAI to search public web pages. Email addresses are included only when explicitly published in a cited source.</p></section>
    {error && <p data-testid="status-research-error" className="p-3 rounded bg-white text-[12px] mb-5" style={{ color: vars.red }}>{error}</p>}
    {items.length > 0 && <section className="bg-white rounded-2xl border overflow-hidden mb-5 shadow-sm" style={{ borderColor: vars.g200 }}><div className="p-5 border-b" style={{ background: vars.g50, borderColor: vars.g200 }}><h2 className="font-semibold text-lg" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Database recommendations</h2><p className="text-[13px] mt-1" style={{ color: vars.g500 }}>{items.length} contacts ranked only from saved database fields. Scores include matching beats, sectors, notes, email availability and verification.</p></div>{items.map((item) => contactCard(item))}</section>}
    {liveItems.length > 0 && <section className="bg-white rounded-2xl border overflow-hidden mb-5 shadow-sm" style={{ borderColor: vars.g200 }}><div className="p-5 border-b" style={{ background: vars.g50, borderColor: vars.g200 }}><h2 className="font-semibold text-lg" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Live public web discoveries</h2><p className="text-[13px] mt-1" style={{ color: vars.g500 }}>{liveItems.length} current journalists across {livePublicationCount} publications, grounded in public author pages, profiles or article bylines. Review the evidence before saving.</p></div>
      {liveGroups.filter((group) => group.items.length > 0).map((group) => <div key={group.label}>
        <div className="px-5 py-2.5 border-b text-[12px] font-bold uppercase tracking-wide" style={{ color: vars.navy, background: "rgba(31,116,143,0.07)", borderColor: vars.g200 }}>{group.label} · {group.items.length}</div>
        {group.items.map((candidate) => (
          <LiveDiscoveryCard
            key={candidate.candidateKey}
            candidate={candidate}
            isSaving={savedDiscoveries[candidate.candidateKey] === "saving"}
            isSaved={savedDiscoveries[candidate.candidateKey] === "saved"}
            onSave={() => void saveDiscovery(candidate)}
          />
        ))}
      </div>)}
    </section>}
    {!liveLoading && liveItems.length === 0 && selected && <section className="bg-white rounded-2xl border p-4 mb-5" style={{ borderColor: vars.g200 }}><h2 className="font-semibold" style={{ color: vars.navy }}>Live public web discovery</h2><p className="text-[12px] mt-1" style={{ color: vars.g500 }}>Search for current journalists and editors whose public work directly matches this article.</p></section>}
    <section className="bg-white rounded-2xl border overflow-hidden shadow-sm" style={{ borderColor: vars.g200 }}><div className="p-5 flex flex-wrap justify-between gap-2 border-b" style={{ background: vars.g50, borderColor: vars.g200 }}><div><h2 className="font-semibold text-lg" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Accepted shortlist</h2><p className="text-[13px] mt-1" style={{ color: vars.g500 }}>Persists for this article and project.</p></div>{accepted.length > 0 && <div className="flex gap-2"><button onClick={() => exportAccepted("xls")} className="text-[12px] px-3 py-1.5 border rounded-lg bg-white hover:bg-slate-50 transition-colors shadow-sm" style={{ borderColor: vars.g200 }}><Download size={14} className="inline mr-1 text-slate-400" /> Excel</button><button onClick={() => exportAccepted("doc")} className="text-[12px] px-3 py-1.5 border rounded-lg bg-white hover:bg-slate-50 transition-colors shadow-sm" style={{ borderColor: vars.g200 }}><Download size={14} className="inline mr-1 text-slate-400" /> Word</button></div>}</div>{accepted.length ? accepted.map((c) => contactCard({ rank: 0, contact: c, score: items.find((i) => i.contact.id === c.id)?.score || 0, reasons: items.find((i) => i.contact.id === c.id)?.reasons || [] }, true)) : <p className="p-8 text-[14px] text-center italic" style={{ color: vars.g500 }}>Accept contacts from your recommendations to build the shortlist.</p>}</section>
  </div>;
}
export { MediaResearchPage };