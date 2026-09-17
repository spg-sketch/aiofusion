import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, Plus } from "lucide-react";
import { apiBase } from "../lib/contentAi";
import type { ExactTargetPhrase } from "../lib/exactTargetPhrases";
import { vars } from "../marketing/vars";
import type { Contact } from "./JournalistComponents";

type Status = "planned" | "pitched" | "responded" | "accepted" | "declined" | "placed";
type Placement = { id: number; canonicalUrl: string; publicationDate: string; headline: string; supportingEvidence: string; verification: "user_claimed" | "page_verified" };
type LegacyTrackerRow = { id: string; date: string; title: string; publication: string; link: string };
type Outreach = {
  id: number; contactId: number | null; status: Status; pitchDate: string | null; responseDate: string | null;
  notes: string; responsibleTeamMember: string; contactSnapshot: { name: string; role: string; email: string };
  outletSnapshot: { name: string; website: string }; targetPhrases: ExactTargetPhrase[]; placements: Placement[];
};

const statuses: Status[] = ["planned", "pitched", "responded", "accepted", "declined", "placed"];
const transitions: Record<Status, Status[]> = { planned: ["pitched", "declined"], pitched: ["responded", "accepted", "declined"], responded: ["accepted", "declined"], accepted: ["declined"], declined: ["planned"], placed: [] };
const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]";

export function MediaOutreachPanel({ projectId, storyKey, articleTitle, contacts, targetPhrases }: {
  projectId: string; storyKey: string; articleTitle: string; contacts: Contact[]; targetPhrases: ExactTargetPhrase[];
}) {
  const [rows, setRows] = useState<Outreach[]>([]);
  const [busy, setBusy] = useState<number | "load" | "create" | null>("load");
  const [error, setError] = useState("");
  const loadSequence = useRef(0);
  const scopeRef = useRef(`${projectId}\u0000${storyKey}`);
  const dateInputRefs = useRef<Record<number, { pitchDate: HTMLInputElement | null; responseDate: HTMLInputElement | null }>>({});
  const [placementFor, setPlacementFor] = useState<number | null>(null);
  const [placement, setPlacement] = useState({ canonicalUrl: "", publicationDate: "", headline: "", supportingEvidence: "", legacySourceRef: "" });
  const legacyRows = useMemo<LegacyTrackerRow[]>(() => {
    try {
      const key = projectId === "default" ? "aio.earnedTracker.v2" : `aio.earnedTracker.v2::${projectId}`;
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value.filter((row): row is LegacyTrackerRow => !!row && typeof row.id === "string" && typeof row.link === "string") : [];
    } catch { return []; }
  }, [projectId]);

  const load = async () => {
    const scope = `${projectId}\u0000${storyKey}`;
    if (scopeRef.current !== scope) return;
    const sequence = ++loadSequence.current;
    const isCurrent = () => sequence === loadSequence.current && scopeRef.current === scope;
    setBusy("load");
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/outreach?projectId=${encodeURIComponent(projectId)}&storyKey=${encodeURIComponent(storyKey)}`, { credentials: "include" });
      let data: Record<string, unknown> = {};
      try {
        data = await response.json() as Record<string, unknown>;
      } catch {
        if (!response.ok) throw new Error(`Could not load outreach (HTTP ${response.status}).`);
        throw new Error("Could not load outreach: the server returned invalid data.");
      }
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not load outreach.");
      if (!isCurrent()) return;
      const nextRows = Array.isArray(data.outreach) ? data.outreach as Outreach[] : [];
      setRows(nextRows);
      dateInputRefs.current = {};
    } catch (reason) {
      if (isCurrent()) setError(reason instanceof Error ? reason.message : "Could not load outreach.");
    } finally {
      if (isCurrent()) setBusy(null);
    }
  };
  useEffect(() => {
    scopeRef.current = `${projectId}\u0000${storyKey}`;
    setPlacementFor(null);
    setPlacement({ canonicalUrl: "", publicationDate: "", headline: "", supportingEvidence: "", legacySourceRef: "" });
    setRows([]);
    dateInputRefs.current = {};
    setError("");
    void load();
    return () => { loadSequence.current += 1; };
  }, [projectId, storyKey]);

  const create = async (contact: Contact) => {
    const scope = `${projectId}\u0000${storyKey}`;
    setBusy("create"); setError("");
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/outreach`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, storyKey, articleTitle, contactId: contact.id, targetPhrases }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not plan outreach.");
      if (scopeRef.current === scope) await load();
    } catch (reason) { if (scopeRef.current === scope) { setError(reason instanceof Error ? reason.message : "Could not plan outreach."); setBusy(null); } }
  };

  const update = async (row: Outreach, patch: Record<string, unknown>) => {
    const scope = `${projectId}\u0000${storyKey}`;
    setBusy(row.id); setError("");
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/outreach/${row.id}`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update outreach.");
      if (scopeRef.current === scope) await load();
    } catch (reason) { if (scopeRef.current === scope) { setError(reason instanceof Error ? reason.message : "Could not update outreach."); setBusy(null); } }
  };

  const changeStatus = (row: Outreach, nextStatus: Status) => {
    const dates = dateInputRefs.current[row.id];
    const pitchDate = dates?.pitchDate?.value || row.pitchDate || "";
    const responseDate = dates?.responseDate?.value || row.responseDate || "";
    if (nextStatus === "pitched" && !pitchDate) {
      setError("Add a pitch date before marking outreach as pitched.");
      return;
    }
    if (nextStatus === "responded" && !responseDate) {
      setError("Add a response date before recording a response.");
      return;
    }
    void update(row, { status: nextStatus, pitchDate, responseDate });
  };

  const placementComplete = placement.canonicalUrl.trim() && placement.publicationDate && placement.headline.trim() && placement.supportingEvidence.trim();

  const savePlacement = async (row: Outreach) => {
    const scope = `${projectId}\u0000${storyKey}`;
    setBusy(row.id); setError("");
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/outreach/${row.id}/placements`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(placement),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not record placement.");
      if (scopeRef.current === scope) {
        setPlacementFor(null); setPlacement({ canonicalUrl: "", publicationDate: "", headline: "", supportingEvidence: "", legacySourceRef: "" });
        await load();
      }
    } catch (reason) { if (scopeRef.current === scope) { setError(reason instanceof Error ? reason.message : "Could not record placement."); setBusy(null); } }
  };

  const verifyPlacement = async (id: number) => {
    const scope = `${projectId}\u0000${storyKey}`;
    setBusy(id); setError("");
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/placements/${id}/verification`, { method: "PUT", credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not verify the placement page.");
      if (scopeRef.current === scope) await load();
    } catch (reason) { if (scopeRef.current === scope) { setError(reason instanceof Error ? reason.message : "Could not verify the placement page."); setBusy(null); } }
  };

  const unplanned = contacts.filter((contact) => !rows.some((row) => row.contactId === contact.id));
  return <section className="bg-white rounded-2xl border overflow-hidden mt-5 shadow-sm" style={{ borderColor: vars.g200 }}>
    <div className="p-5 border-b" style={{ background: vars.g50, borderColor: vars.g200 }}>
      <h2 className="font-semibold text-lg" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Outreach and placements</h2>
      <p className="text-[13px] mt-1" style={{ color: vars.g500 }}>Record what happened and preserve the exact article, contact, publication and phrase evidence used at the time.</p>
    </div>
    {error && <p className="m-4 rounded-lg bg-rose-50 p-3 text-[12px] text-rose-700">{error}</p>}
    {unplanned.length > 0 && <div className="p-4 border-b flex flex-wrap gap-2" style={{ borderColor: vars.g100 }}>
      {unplanned.map((contact) => <button key={contact.id} disabled={busy !== null} onClick={() => void create(contact)} className="rounded-lg border px-3 py-2 text-[12px] font-semibold disabled:opacity-50"><Plus size={13} className="inline mr-1" />Plan outreach to {contact.firstName} {contact.lastName}</button>)}
    </div>}
    {busy === "load" ? <p className="p-8 text-center text-sm text-slate-500"><Loader2 className="inline animate-spin mr-2" size={16} />Loading outreach...</p> : rows.length === 0 ? <p className="p-8 text-center text-sm italic text-slate-500">Add a shortlisted contact, then plan outreach here.</p> :
      <div className="divide-y">{rows.map((row) => <div key={row.id} className="p-5">
        <div className="flex flex-wrap justify-between gap-3">
          <div><h3 className="font-semibold text-slate-900">{row.contactSnapshot.name || "Historical contact"}{row.outletSnapshot.name ? `, ${row.outletSnapshot.name}` : ""}</h3><p className="text-[12px] text-slate-500">{row.contactSnapshot.role} {row.contactSnapshot.email}</p></div>
           <select aria-label="Outreach status" value={row.status} disabled={busy === row.id || row.status === "placed"} onChange={(event) => changeStatus(row, event.target.value as Status)} className="rounded-lg border px-3 py-2 text-[12px] font-semibold capitalize">{statuses.filter((status) => status === row.status || transitions[row.status].includes(status)).map((status) => <option key={status} value={status}>{status}</option>)}</select>
        </div>
        <div className="grid md:grid-cols-2 gap-3 mt-4">
           <label className="text-[11px] font-semibold text-slate-600">Pitch date<input type="date" required={row.status === "pitched"} ref={(element) => { dateInputRefs.current[row.id] = { ...dateInputRefs.current[row.id], pitchDate: element, responseDate: dateInputRefs.current[row.id]?.responseDate || null }; }} defaultValue={row.pitchDate?.slice(0, 10) || ""} onBlur={(event) => void update(row, { pitchDate: event.target.value })} className={`${inputClass} mt-1`} aria-describedby={`outreach-date-help-${row.id}`} /></label>
           <label className="text-[11px] font-semibold text-slate-600">Response date<input type="date" required={row.status === "responded"} ref={(element) => { dateInputRefs.current[row.id] = { ...dateInputRefs.current[row.id], responseDate: element, pitchDate: dateInputRefs.current[row.id]?.pitchDate || null }; }} defaultValue={row.responseDate?.slice(0, 10) || ""} onBlur={(event) => void update(row, { responseDate: event.target.value })} className={`${inputClass} mt-1`} aria-describedby={`outreach-date-help-${row.id}`} /></label>
          <label className="text-[11px] font-semibold text-slate-600">Responsible team member<input defaultValue={row.responsibleTeamMember} onBlur={(event) => void update(row, { responsibleTeamMember: event.target.value })} className={`${inputClass} mt-1`} /></label>
          <label className="text-[11px] font-semibold text-slate-600">Notes<input defaultValue={row.notes} onBlur={(event) => void update(row, { notes: event.target.value })} className={`${inputClass} mt-1`} /></label>
        </div>
         <p id={`outreach-date-help-${row.id}`} className="mt-2 text-[11px] text-slate-500">Pitch date is required for “pitched”; response date is required for “responded”.</p>
        {row.targetPhrases.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{row.targetPhrases.map((phrase) => <span key={phrase.id} className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] text-indigo-800">“{phrase.text}”</span>)}</div>}
        <div className="mt-4 space-y-2">{row.placements.map((item) => <div key={item.id} className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-[12px]"><div className="flex flex-wrap justify-between gap-2"><a href={item.canonicalUrl} target="_blank" rel="noreferrer" className="font-semibold text-emerald-900 hover:underline">{item.headline} <ExternalLink size={12} className="inline" /></a><span className="whitespace-nowrap text-emerald-700">{item.verification === "page_verified" ? "Page verified" : "User-entered claim"}</span></div><p className="mt-1 text-emerald-800">{new Date(item.publicationDate).toLocaleDateString()} - {item.supportingEvidence}</p>{item.verification !== "page_verified" && <button disabled={busy !== null} onClick={() => void verifyPlacement(item.id)} className="mt-2 rounded-md border border-emerald-300 bg-white px-2.5 py-1 font-semibold text-emerald-800 disabled:opacity-50">Verify from public page</button>}</div>)}</div>
        {placementFor === row.id ? <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 grid md:grid-cols-2 gap-3">
          {legacyRows.length > 0 && <label className="md:col-span-2 text-[11px] font-semibold text-slate-600">Link an existing Earned Media Tracker entry (optional)
            <select value={placement.legacySourceRef} onChange={(event) => {
              const legacy = legacyRows.find((item) => item.id === event.target.value);
              setPlacement(legacy ? { canonicalUrl: legacy.link, publicationDate: legacy.date, headline: legacy.title, supportingEvidence: `Linked manually from the existing Earned Media Tracker entry for ${legacy.publication || "this publication"}.`, legacySourceRef: legacy.id } : { ...placement, legacySourceRef: "" });
            }} className={`${inputClass} mt-1`}><option value="">Choose an unambiguous entry</option>{legacyRows.map((item) => <option key={item.id} value={item.id}>{item.title} - {item.publication} ({item.date})</option>)}</select>
            <span className="block mt-1 font-normal text-slate-500">Nothing is migrated automatically. Select only the entry that represents this exact placement.</span>
          </label>}
           <input required type="url" aria-label="Canonical URL" placeholder="Canonical URL" value={placement.canonicalUrl} onChange={(e) => setPlacement({ ...placement, canonicalUrl: e.target.value })} className={inputClass} />
           <input required aria-label="Publication date" type="date" value={placement.publicationDate} onChange={(e) => setPlacement({ ...placement, publicationDate: e.target.value })} className={inputClass} />
           <input required aria-label="Placement headline" placeholder="Headline" value={placement.headline} onChange={(e) => setPlacement({ ...placement, headline: e.target.value })} className={inputClass} />
           <input required aria-label="Supporting evidence" placeholder="Supporting evidence" value={placement.supportingEvidence} onChange={(e) => setPlacement({ ...placement, supportingEvidence: e.target.value })} className={inputClass} />
           <div className="md:col-span-2 flex gap-2"><button disabled={busy === row.id || !placementComplete} onClick={() => void savePlacement(row)} className="rounded-lg bg-emerald-700 text-white px-4 py-2 text-[12px] font-semibold disabled:opacity-50">Save placement</button><button onClick={() => setPlacementFor(null)} className="rounded-lg border px-4 py-2 text-[12px]">Cancel</button></div>
        </div> : (row.status === "accepted" || row.status === "placed") && <button onClick={() => setPlacementFor(row.id)} className="mt-4 rounded-lg border border-emerald-200 px-3 py-2 text-[12px] font-semibold text-emerald-800"><CheckCircle2 size={14} className="inline mr-1" />Record placement</button>}
      </div>)}</div>}
  </section>;
}