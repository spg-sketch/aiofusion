import { useEffect, useState } from "react";
import { Check, Database, Download, ExternalLink, Loader2, Search, Target, ThumbsDown, Users } from "lucide-react";
import { vars } from "../marketing/vars";
import { escapeHtml, apiBase } from "../lib/contentAi";
import { loadArchive, useContentStore } from "../lib/contentStore";
import { getActiveProjectId, getKeyMessages, getProjectMediaCategories } from "../IntakeForm";
import { SummaryRow } from "./shared";

type DbContact = {
  id: number; firstName: string; lastName: string; role: string; email: string; phone: string; notes: string;
  outletName?: string | null; outletCategory?: string | null; beats?: string[]; sectors?: string[];
  geography?: string; language?: string; seniority?: string; editorialStatus?: string; lastVerifiedAt?: string | null; reach?: string; authority?: number; confidence?: string;
};
type Recommendation = { rank: number; contact: DbContact; score: number; reasons: string[] };
type Decision = { contactId: number; decision: "shortlisted" | "rejected" | "contacted"; note: string };
type LiveDiscovery = {
  candidateKey: string; firstName: string; lastName: string; role: string; email: string;
  outletName: string; outletWebsite: string; sourceUrl: string; evidence: string;
  beats: string[]; confidence: "High" | "Medium" | "Low"; verifiedAt: string;
};

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
        contact: (item.contact || item) as DbContact,
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
  const accepted = Object.values(decisions).filter((d) => d.decision === "shortlisted").map((d) => items.find((i) => i.contact.id === d.contactId)?.contact).filter(Boolean) as DbContact[];
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
    const c = item.contact; const current = decisions[c.id];
    return <div key={c.id} className="p-4 border-b last:border-b-0" style={{ borderColor: vars.g100 }}>
      <div className="flex flex-wrap justify-between gap-3"><div><p className="font-semibold" style={{ color: vars.navy }}>{c.firstName} {c.lastName}</p><p className="text-[12px]" style={{ color: vars.g600 }}>{c.role || "No role recorded"}{c.outletName ? `, ${c.outletName}` : ""}</p></div><span className="text-[11px] font-bold px-2 py-1 rounded h-fit" style={{ color: vars.accent, background: "rgba(31,116,143,.1)" }}>Score {item.score}</span></div>
      <div className="text-[12px] mt-2 flex flex-wrap gap-x-4 gap-y-1" style={{ color: vars.g600 }}><span>{c.email || "No email recorded"}</span>{c.phone && <span>{c.phone}</span>}{c.outletCategory && <span>{c.outletCategory}</span>}{c.beats?.length ? <span>Beats: {c.beats.join(", ")}</span> : null}{c.lastVerifiedAt && <span>Verified {new Date(c.lastVerifiedAt).toLocaleDateString()}</span>}</div>
      <p className="text-[11px] mt-2" style={{ color: vars.g500 }}>Why matched: {item.reasons.length ? item.reasons.join(" · ") : "Has a usable contact record"}</p>
      {!shortlist && <div className="flex flex-wrap gap-2 mt-3"><button data-testid={`button-accept-${c.id}`} onClick={() => void saveDecision(c.id, "shortlisted", current?.note || "")} className="px-3 py-1.5 rounded text-[12px] font-semibold text-white" style={{ background: "#3D9B6B" }}><Check size={13} className="inline mr-1" />Accept</button><button data-testid={`button-decline-${c.id}`} onClick={() => { setNoteFor(c.id); setNote(current?.note || ""); }} className="px-3 py-1.5 rounded text-[12px] font-semibold border" style={{ borderColor: vars.g200, color: vars.g600 }}><ThumbsDown size={13} className="inline mr-1" />Decline</button></div>}
      {noteFor === c.id && <div className="mt-2 flex gap-2"><input data-testid={`input-decline-reason-${c.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional reason" className="flex-1 px-2 py-1.5 border rounded text-[12px]" /><button onClick={() => void saveDecision(c.id, "rejected", note)} className="px-3 rounded text-[12px] text-white" style={{ background: vars.coral }}>Save</button></div>}
    </div>;
  };
  return <div className="p-6 sm:p-8 max-w-6xl mx-auto"><div className="mb-6"><div className="flex gap-3 items-center"><Users color="#fff" /><h1 className="text-3xl" style={{ color: "#fff", fontFamily: "'Alice', Georgia, serif" }}>Media Research</h1></div><p className="text-[14px]" style={{ color: "rgba(255,255,255,.85)" }}>Match trusted contacts already in your database or discover current journalists from public web sources. Every live result includes evidence and a source.</p></div>
    <section className="bg-white rounded-2xl border p-5 mb-5" style={{ borderColor: vars.g200 }}><label className="block text-[12px] font-bold mb-2" style={{ color: vars.navy }}>Saved article</label><select data-testid="select-research-article" value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setItems([]); setLiveItems([]); setDiscoveryToken(""); setError(""); }} className="w-full border rounded-lg p-2 text-[13px]"><option value="">Choose a saved article</option>{archive.map((a) => <option key={a.id} value={a.id}>{a.title} ({a.contentType})</option>)}</select>{selected && <div className="grid sm:grid-cols-2 gap-2 mt-4"><SummaryRow label="Article" value={selected.title} /><SummaryRow label="Categories" value={categories.join(", ") || "No categories selected"} /></div>}<div className="mt-4 flex flex-wrap gap-2"><button data-testid="button-recommend-contacts" disabled={loading || liveLoading || !selected} onClick={() => void recommend()} className="px-4 py-2 rounded-lg text-white text-[13px] font-semibold disabled:opacity-50" style={{ background: vars.coral }}>{loading ? <Loader2 className="inline animate-spin mr-1" size={14} /> : <Target className="inline mr-1" size={14} />}Match database contacts</button><button data-testid="button-discover-live" disabled={loading || liveLoading || !selected} onClick={() => void discoverLive()} className="px-4 py-2 rounded-lg text-white text-[13px] font-semibold disabled:opacity-50" style={{ background: vars.navy }}>{liveLoading ? <Loader2 className="inline animate-spin mr-1" size={14} /> : <Search className="inline mr-1" size={14} />}Search the public web</button></div><p className="mt-3 text-[11px]" style={{ color: vars.g500 }}>Live research sends the selected article excerpt, media categories and key messages to OpenAI to search public web pages. Email addresses are included only when explicitly published in a cited source.</p></section>
    {error && <p data-testid="status-research-error" className="p-3 rounded bg-white text-[12px] mb-5" style={{ color: vars.red }}>{error}</p>}
    {items.length > 0 && <section className="bg-white rounded-2xl border overflow-hidden mb-5" style={{ borderColor: vars.g200 }}><div className="p-4" style={{ background: vars.g50 }}><h2 className="font-semibold" style={{ color: vars.navy }}>Database recommendations</h2><p className="text-[12px]" style={{ color: vars.g500 }}>{items.length} contacts ranked only from saved database fields. Scores include matching beats, sectors, notes, email availability and verification.</p></div>{items.map((item) => contactCard(item))}</section>}
    {liveItems.length > 0 && <section className="bg-white rounded-2xl border overflow-hidden mb-5" style={{ borderColor: vars.g200 }}><div className="p-4" style={{ background: vars.g50 }}><h2 className="font-semibold" style={{ color: vars.navy }}>Live public web discoveries</h2><p className="text-[12px]" style={{ color: vars.g500 }}>{liveItems.length} current candidates grounded in public author pages, profiles or article bylines. Review the evidence before saving.</p></div>{liveItems.map((candidate) => <div key={candidate.candidateKey} className="p-4 border-b last:border-b-0" style={{ borderColor: vars.g100 }}><div className="flex flex-wrap justify-between gap-3"><div><p className="font-semibold" style={{ color: vars.navy }}>{candidate.firstName} {candidate.lastName}</p><p className="text-[12px]" style={{ color: vars.g600 }}>{candidate.role || "Editorial contact"}, {candidate.outletName}</p></div><span className="text-[11px] font-bold px-2 py-1 rounded h-fit" style={{ color: candidate.confidence === "High" ? "#27734D" : vars.accent, background: candidate.confidence === "High" ? "#E5F5EC" : "rgba(31,116,143,.1)" }}>{candidate.confidence} confidence</span></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]" style={{ color: vars.g600 }}>{candidate.email && <span>{candidate.email}</span>}{candidate.beats.length > 0 && <span>Beats: {candidate.beats.join(", ")}</span>}<span>Checked {new Date(candidate.verifiedAt).toLocaleDateString()}</span></div><p className="mt-2 text-[12px]" style={{ color: vars.g600 }}>{candidate.evidence}</p><div className="mt-3 flex flex-wrap gap-2"><a href={candidate.sourceUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded border text-[12px] font-semibold" style={{ borderColor: vars.g200, color: vars.navy }}><ExternalLink size={13} className="inline mr-1" />View source</a><button onClick={() => void saveDiscovery(candidate)} disabled={savedDiscoveries[candidate.candidateKey] != null} className="px-3 py-1.5 rounded text-[12px] font-semibold text-white disabled:opacity-70" style={{ background: "#3D9B6B" }}>{savedDiscoveries[candidate.candidateKey] === "saving" ? <Loader2 size={13} className="inline animate-spin mr-1" /> : savedDiscoveries[candidate.candidateKey] === "saved" ? <Check size={13} className="inline mr-1" /> : <Database size={13} className="inline mr-1" />}{savedDiscoveries[candidate.candidateKey] === "saving" ? "Saving" : savedDiscoveries[candidate.candidateKey] === "saved" ? "Saved to Media Database" : "Save to Media Database"}</button></div></div>)}</section>}
    {!liveLoading && liveItems.length === 0 && selected && <section className="bg-white rounded-2xl border p-4 mb-5" style={{ borderColor: vars.g200 }}><h2 className="font-semibold" style={{ color: vars.navy }}>Live public web discovery</h2><p className="text-[12px] mt-1" style={{ color: vars.g500 }}>Search for current journalists and editors whose public work directly matches this article.</p></section>}
    <section className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: vars.g200 }}><div className="p-4 flex flex-wrap justify-between gap-2" style={{ background: vars.g50 }}><div><h2 className="font-semibold" style={{ color: vars.navy }}>Accepted shortlist</h2><p className="text-[12px]" style={{ color: vars.g500 }}>Persists for this article and project.</p></div>{accepted.length > 0 && <div className="flex gap-2"><button onClick={() => exportAccepted("xls")} className="text-[12px] px-3 border rounded"><Download size={12} className="inline" /> Excel</button><button onClick={() => exportAccepted("doc")} className="text-[12px] px-3 border rounded"><Download size={12} className="inline" /> Word</button></div>}</div>{accepted.length ? accepted.map((c) => contactCard({ rank: 0, contact: c, score: items.find((i) => i.contact.id === c.id)?.score || 0, reasons: items.find((i) => i.contact.id === c.id)?.reasons || [] }, true)) : <p className="p-5 text-[13px]" style={{ color: vars.g500 }}>Accept contacts from your recommendations to build the shortlist.</p>}</section>
  </div>;
}
export { MediaResearchPage };