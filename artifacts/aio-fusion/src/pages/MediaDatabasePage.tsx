import { useState, useEffect, useRef, useCallback } from "react";
import {
  ChevronRight, Lock, Search, FileEdit, BarChart3, Archive, Send, LineChart, ArrowRight, Sparkles, Loader2,
  TrendingUp, FileText, FileCheck2, Target, Code2, HelpCircle, MessageSquareQuote, Bot, ShieldCheck,
  MessagesSquare, Download, AlertTriangle, CheckCircle2, XCircle, Info, Globe, Tag, User, ChevronDown,
  Plus, Minus, MessageSquare, BookOpen, Scroll, Award, Radio, Mic2, PenLine, ClipboardList, ArrowUpRight,
  Lightbulb, ClipboardPaste, Upload, Calendar, Check, Save, Circle, Zap, Mail, Shield, Eye, Building2,
  ArrowLeft, LogOut, Trash2, KeyRound, Users, Activity, Play, ChevronUp, Menu, X, LogIn,
  Link as LinkIcon, Image as ImageIcon, Repeat, TrendingDown, FolderOpen, List as ListIcon, Clock,
  Undo2, ArchiveRestore, RefreshCw, MonitorSmartphone, Database,
} from "lucide-react";
import { vars } from "../marketing/vars";
import { apiBase } from "../lib/contentAi";
import { getSession as getLocalSession } from "../lib/auth";
import { CategoryPickerModal } from "./shared";
import { TRADE_MEDIA_CATEGORIES } from "../tradeMediaCategories";
import { getProjectMediaCategories } from "../IntakeForm";
import { escapeHtml } from "../lib/contentAi";
// ---------------------------------------------------------------------------
// Searchable outlet combobox for the contact modal
// ---------------------------------------------------------------------------
export function SearchableOutletPicker({
  outlets, value, onChange,
}: {
  outlets: { id: number; name: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = outlets.find((o) => String(o.id) === value);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = outlets.filter((o) => !search || o.name.toLowerCase().includes(search.toLowerCase())).slice(0, 50);

  return (
    <div ref={ref} className="relative">
      <div
        className="flex items-center w-full px-3 py-2 rounded-lg border text-[13px] cursor-pointer gap-2"
        style={{ borderColor: open ? vars.accent : vars.g200 }}
        onClick={() => { setOpen(!open); setSearch(""); }}
      >
        <span style={{ color: selected ? vars.navy : vars.g400 }} className="flex-1 truncate">
          {selected ? selected.name : "No outlet linked"}
        </span>
        {selected && (
          <button className="text-[16px] leading-none" style={{ color: vars.g400 }} onClick={(e) => { e.stopPropagation(); onChange(""); setOpen(false); }}>&times;</button>
        )}
        <ChevronRight size={13} color={vars.g400} className={`transition-transform ${open ? "rotate-90" : ""}`} />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border bg-white shadow-lg" style={{ borderColor: vars.g200 }}>
          <div className="p-2 border-b" style={{ borderColor: vars.g100 }}>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search outlets..."
              className="w-full px-2 py-1.5 rounded-lg border text-[12px]"
              style={{ borderColor: vars.g200 }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            <button
              className="w-full text-left px-3 py-2 rounded-lg text-[12px] hover:bg-gray-50"
              style={{ color: vars.g500 }}
              onClick={() => { onChange(""); setOpen(false); }}
            >
              No outlet linked
            </button>
            {filtered.map((o) => (
              <button
                key={o.id}
                className="w-full text-left px-3 py-2 rounded-lg text-[12px] hover:bg-gray-50"
                style={{ color: vars.navy, background: String(o.id) === value ? "rgba(31,116,143,0.08)" : undefined }}
                onClick={() => { onChange(String(o.id)); setOpen(false); setSearch(""); }}
              >
                {o.name}
              </button>
            ))}
            {filtered.length === 0 && <p className="text-[12px] px-3 py-2" style={{ color: vars.g400 }}>No outlets match</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Media Database page - outlets, contacts and custom categories
// ---------------------------------------------------------------------------
type Outlet = { id: number; name: string; category: string; website: string; description: string; country: string; reachBand: string; accountId: string | null };
type Contact = { id: number; outletId: number | null; firstName: string; lastName: string; role: string; email: string; phone: string; notes: string; accountId: string; outletName?: string; outletCategory?: string };

function MediaDatabasePage() {
  const [activeTab, setActiveTab] = useState<"outlets" | "contacts">("outlets");
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [outletSearch, setOutletSearch] = useState("");
  const [outletCatFilter, setOutletCatFilter] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [contactOutletFilter, setContactOutletFilter] = useState("");

  const [showOutletModal, setShowOutletModal] = useState(false);
  const [editingOutlet, setEditingOutlet] = useState<Outlet | null>(null);
  const [outletForm, setOutletForm] = useState({ name: "", category: "", website: "", description: "", country: "", reachBand: "" });
  const [outletSaving, setOutletSaving] = useState(false);
  const [deletingOutletId, setDeletingOutletId] = useState<number | null>(null);

  const [showContactModal, setShowContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [contactForm, setContactForm] = useState({ outletId: "", firstName: "", lastName: "", role: "", email: "", phone: "", notes: "" });
  const [contactSaving, setContactSaving] = useState(false);
  const [deletingContactId, setDeletingContactId] = useState<number | null>(null);

  const [showCatPicker, setShowCatPicker] = useState(false);
  const projectCategories = getProjectMediaCategories();

  const loadData = async () => {
    setLoading(true);
    try {
      const [outR, conR, catR] = await Promise.all([
        fetch(`${apiBase()}/api/store/media-db/outlets`, { credentials: "include" }),
        fetch(`${apiBase()}/api/store/media-db/contacts`, { credentials: "include" }),
        fetch(`${apiBase()}/api/store/media-categories`, { credentials: "include" }),
      ]);
      if (outR.ok) { const d = await outR.json(); setOutlets(d.outlets ?? []); }
      if (conR.ok) { const d = await conR.json(); setContacts(d.contacts ?? []); }
      if (catR.ok) {
        const d = await catR.json();
        const custom: string[] = (d.custom ?? []).map((c: { name: string }) => c.name);
        const merged = Array.from(new Set([...(d.standard ?? TRADE_MEDIA_CATEGORIES), ...custom])).sort((a, b) => a.localeCompare(b));
        setAllCategories(merged);
      } else {
        setAllCategories([...TRADE_MEDIA_CATEGORIES]);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { void loadData(); }, []);

  // Outlets
  const filteredOutlets = outlets.filter((o) => {
    if (outletCatFilter && o.category !== outletCatFilter) return false;
    if (outletSearch && !o.name.toLowerCase().includes(outletSearch.toLowerCase()) && !o.category.toLowerCase().includes(outletSearch.toLowerCase())) return false;
    return true;
  });

  const openAddOutlet = () => {
    setEditingOutlet(null);
    setOutletForm({ name: "", category: "", website: "", description: "", country: "", reachBand: "" });
    setShowOutletModal(true);
  };
  const openEditOutlet = (o: Outlet) => {
    setEditingOutlet(o);
    setOutletForm({ name: o.name, category: o.category, website: o.website, description: o.description, country: o.country, reachBand: o.reachBand });
    setShowOutletModal(true);
  };
  const saveOutlet = async () => {
    if (!outletForm.name.trim() || outletSaving) return;
    setOutletSaving(true);
    try {
      const resp = editingOutlet
        ? await fetch(`${apiBase()}/api/store/media-db/outlets/${editingOutlet.id}`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(outletForm) })
        : await fetch(`${apiBase()}/api/store/media-db/outlets`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(outletForm) });
      if (resp.ok) { setShowOutletModal(false); await loadData(); }
    } catch {}
    setOutletSaving(false);
  };
  const deleteOutlet = async (id: number) => {
    setDeletingOutletId(id);
    try {
      await fetch(`${apiBase()}/api/store/media-db/outlets/${id}`, { method: "DELETE", credentials: "include" });
      await loadData();
    } catch {}
    setDeletingOutletId(null);
  };

  // Contacts
  const filteredContacts = contacts.filter((c) => {
    if (contactOutletFilter && String(c.outletId) !== contactOutletFilter) return false;
    const q = contactSearch.toLowerCase();
    if (q && !`${c.firstName} ${c.lastName}`.toLowerCase().includes(q) && !(c.role || "").toLowerCase().includes(q) && !(c.outletName || "").toLowerCase().includes(q)) return false;
    return true;
  });

  const openAddContact = () => {
    setEditingContact(null);
    setContactForm({ outletId: "", firstName: "", lastName: "", role: "", email: "", phone: "", notes: "" });
    setShowContactModal(true);
  };
  const openEditContact = (c: Contact) => {
    setEditingContact(c);
    setContactForm({ outletId: c.outletId ? String(c.outletId) : "", firstName: c.firstName, lastName: c.lastName, role: c.role, email: c.email, phone: c.phone, notes: c.notes });
    setShowContactModal(true);
  };
  const saveContact = async () => {
    if ((!contactForm.firstName.trim() && !contactForm.lastName.trim()) || contactSaving) return;
    setContactSaving(true);
    try {
      const resp = editingContact
        ? await fetch(`${apiBase()}/api/store/media-db/contacts/${editingContact.id}`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(contactForm) })
        : await fetch(`${apiBase()}/api/store/media-db/contacts`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(contactForm) });
      if (resp.ok) { setShowContactModal(false); await loadData(); }
    } catch {}
    setContactSaving(false);
  };
  const deleteContact = async (id: number) => {
    setDeletingContactId(id);
    try {
      await fetch(`${apiBase()}/api/store/media-db/contacts/${id}`, { method: "DELETE", credentials: "include" });
      await loadData();
    } catch {}
    setDeletingContactId(null);
  };

  // Export contacts
  const exportContacts = async (format: "xlsx" | "word") => {
    const rows = filteredContacts;
    if (format === "xlsx") {
      const headers = ["First Name", "Last Name", "Role", "Email", "Phone", "Outlet", "Category", "Notes"];
      const dataRows = rows.map((c) => [c.firstName, c.lastName, c.role, c.email, c.phone, c.outletName ?? "", c.outletCategory ?? "", c.notes]);
      const csvContent = [headers, ...dataRows].map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "Media Contacts.csv"; a.click(); URL.revokeObjectURL(url);
    } else {
      const rows2 = rows.map((c) => `<tr><td>${escapeHtml(`${c.firstName} ${c.lastName}`.trim())}</td><td>${escapeHtml(c.role)}</td><td>${escapeHtml(c.email)}</td><td>${escapeHtml(c.phone)}</td><td>${escapeHtml(c.outletName ?? "")}</td><td>${escapeHtml(c.outletCategory ?? "")}</td></tr>`).join("");
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Media Contacts</title><style>body{font-family:Arial,sans-serif;font-size:12px;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #ddd;padding:6px 10px;text-align:left;}th{background:#102B36;color:#fff;}</style></head><body><h2 style="font-family:Georgia,serif;color:#102B36;">Media Contacts</h2><table><tr><th>Name</th><th>Role</th><th>Email</th><th>Phone</th><th>Outlet</th><th>Category</th></tr>${rows2}</table></body></html>`;
      const blob = new Blob([html], { type: "application/msword" });
      const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "Media Contacts.doc"; a.click(); URL.revokeObjectURL(url);
    }
  };

  const catOptions = Array.from(new Set(outlets.map((o) => o.category).filter(Boolean))).sort();
  const outletOptions = outlets.map((o) => ({ id: o.id, name: o.name })).sort((a, b) => a.name.localeCompare(b.name));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: vars.g50 }}>
        <Loader2 size={28} className="animate-spin" color={vars.accent} />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 max-w-6xl mx-auto" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2.5">
          <Database size={24} color="#ffffff" />
          <h1 className="text-[28px] font-semibold mb-1" style={{ color: "#ffffff", fontFamily: "'Alice', Georgia, serif" }}>Media Database</h1>
        </div>
        <p className="text-[14px] font-light" style={{ color: "rgba(255,255,255,0.85)" }}>Publications, journalists and custom trade media categories for your account.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl inline-flex" style={{ background: vars.g100 }}>
        {(["outlets", "contacts"] as const).map((t) => (
          <button key={t} onClick={() => setActiveTab(t)} className="px-5 py-2 rounded-lg text-[13px] font-bold transition-all capitalize" style={{ background: activeTab === t ? "rgba(201,160,78,0.18)" : "transparent", color: activeTab === t ? "#7A5E25" : vars.g500, boxShadow: activeTab === t ? "0 1px 3px rgba(0,0,0,0.1)" : "none", border: activeTab === t ? `1px solid ${vars.gold}` : "1px solid transparent" }}>
            {t === "outlets" ? `Outlets (${outlets.length})` : `Contacts (${contacts.length})`}
          </button>
        ))}
      </div>

      {/* Outlets tab */}
      {activeTab === "outlets" && (
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <input value={outletSearch} onChange={(e) => setOutletSearch(e.target.value)} placeholder="Search outlets..." className="px-3 py-2 rounded-lg border text-[13px] flex-1 min-w-[180px] placeholder-white" style={{ borderColor: vars.g200 }} />
            <select value={outletCatFilter} onChange={(e) => setOutletCatFilter(e.target.value)} className="px-3 py-2 rounded-lg border text-[13px]" style={{ borderColor: vars.g200, color: outletCatFilter ? vars.navy : "#ffffff" }}>
              <option value="" style={{ color: "#ffffff", background: vars.navy }}>All categories</option>
              {catOptions.map((c) => <option key={c} value={c} style={{ color: vars.navy, background: "#ffffff" }}>{c}</option>)}
            </select>
            <button onClick={openAddOutlet} className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: vars.accent }}>
              <Plus size={14} /> Add outlet
            </button>
          </div>

          {filteredOutlets.length === 0 ? (
            <div className="text-center py-16 rounded-2xl border" style={{ borderColor: vars.g200, background: "white" }}>
              <Building2 size={32} className="mx-auto mb-3" color={vars.g300} />
              <p className="text-[15px] font-semibold mb-1" style={{ color: vars.navy }}>No outlets yet</p>
              <p className="text-[13px] font-light mb-4" style={{ color: vars.g400 }}>Add publications to build your media database.</p>
              <button onClick={openAddOutlet} className="px-5 py-2.5 rounded-lg text-[13px] font-semibold text-white" style={{ background: vars.accent }}>Add your first outlet</button>
            </div>
          ) : (
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: vars.g200, background: "white" }}>
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ background: vars.g50 }}>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: vars.navy }}>Publication</th>
                    <th className="text-left px-4 py-3 font-semibold hidden sm:table-cell" style={{ color: vars.navy }}>Category</th>
                    <th className="text-left px-4 py-3 font-semibold hidden md:table-cell" style={{ color: vars.navy }}>Country</th>
                    <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell" style={{ color: vars.navy }}>Reach</th>
                    <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell" style={{ color: vars.navy }}>Website</th>
                    <th className="px-4 py-3" style={{ color: vars.navy }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOutlets.map((o) => (
                    <tr key={o.id} style={{ borderTop: `1px solid ${vars.g100}` }}>
                      <td className="px-4 py-3">
                        <p className="font-semibold" style={{ color: vars.navy }}>{o.name}</p>
                        {o.description && <p className="text-[11px] font-light mt-0.5" style={{ color: vars.g500 }}>{o.description.slice(0, 80)}{o.description.length > 80 ? "…" : ""}</p>}
                        {o.accountId === null && <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: "rgba(31,116,143,0.1)", color: vars.accent }}>Global</span>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell" style={{ color: vars.g600 }}>{o.category}</td>
                      <td className="px-4 py-3 hidden md:table-cell" style={{ color: vars.g600 }}>{o.country}</td>
                      <td className="px-4 py-3 hidden lg:table-cell" style={{ color: vars.g600 }}>{o.reachBand}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {o.website && <a href={o.website.startsWith("http") ? o.website : `https://${o.website}`} target="_blank" rel="noopener noreferrer" className="text-[11px] underline" style={{ color: vars.accent }}>{o.website.replace(/^https?:\/\//, "").slice(0, 30)}</a>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => openEditOutlet(o)} className="p-1.5 rounded-lg hover:bg-gray-50" title="Edit"><PenLine size={13} color={vars.g400} /></button>
                          <button onClick={() => { if (window.confirm(`Delete "${o.name}"?`)) void deleteOutlet(o.id); }} disabled={deletingOutletId === o.id} className="p-1.5 rounded-lg hover:bg-red-50" title="Delete"><Trash2 size={13} color={deletingOutletId === o.id ? vars.g300 : vars.red} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Contacts tab */}
      {activeTab === "contacts" && (
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <input value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} placeholder="Search contacts..." className="px-3 py-2 rounded-lg border text-[13px] flex-1 min-w-[180px] placeholder-white text-white" style={{ borderColor: vars.g200 }} />
            <select value={contactOutletFilter} onChange={(e) => setContactOutletFilter(e.target.value)} className="px-3 py-2 rounded-lg border text-[13px]" style={{ borderColor: vars.g200, color: contactOutletFilter ? vars.navy : "#ffffff" }}>
              <option value="">All outlets</option>
              {outletOptions.map((o) => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
            </select>
            <button onClick={openAddContact} className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: vars.accent }}>
              <Plus size={14} /> Add contact
            </button>
            {filteredContacts.length > 0 && (
              <div className="flex items-center gap-1">
                <button onClick={() => void exportContacts("xlsx")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold border" style={{ borderColor: vars.g200, color: vars.navy }}><Download size={13} /> Excel</button>
                <button onClick={() => void exportContacts("word")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold border" style={{ borderColor: vars.g200, color: vars.navy }}><FileText size={13} /> Word</button>
              </div>
            )}
          </div>

          {filteredContacts.length === 0 ? (
            <div className="text-center py-16 rounded-2xl border" style={{ borderColor: vars.g200, background: "white" }}>
              <Users size={32} className="mx-auto mb-3" color={vars.g300} />
              <p className="text-[15px] font-semibold mb-1" style={{ color: vars.navy }}>No contacts yet</p>
              <p className="text-[13px] font-light mb-4" style={{ color: vars.g400 }}>Add journalists and PR contacts to your database.</p>
              <button onClick={openAddContact} className="px-5 py-2.5 rounded-lg text-[13px] font-semibold text-white" style={{ background: vars.accent }}>Add your first contact</button>
            </div>
          ) : (
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: vars.g200, background: "white" }}>
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ background: vars.g50 }}>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: vars.navy }}>Name</th>
                    <th className="text-left px-4 py-3 font-semibold hidden sm:table-cell" style={{ color: vars.navy }}>Role</th>
                    <th className="text-left px-4 py-3 font-semibold hidden md:table-cell" style={{ color: vars.navy }}>Outlet</th>
                    <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell" style={{ color: vars.navy }}>Email</th>
                    <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell" style={{ color: vars.navy }}>Phone</th>
                    <th className="text-left px-4 py-3 font-semibold hidden xl:table-cell" style={{ color: vars.navy }}>Notes</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.map((c) => (
                    <tr key={c.id} style={{ borderTop: `1px solid ${vars.g100}` }}>
                      <td className="px-4 py-3">
                        <p className="font-semibold" style={{ color: vars.navy }}>{`${c.firstName} ${c.lastName}`.trim()}</p>
                        {c.outletCategory && <p className="text-[11px] font-light" style={{ color: vars.g500 }}>{c.outletCategory}</p>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell" style={{ color: vars.g600 }}>{c.role}</td>
                      <td className="px-4 py-3 hidden md:table-cell" style={{ color: vars.g600 }}>{c.outletName}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {c.email && <a href={`mailto:${c.email}`} className="underline" style={{ color: vars.accent }}>{c.email}</a>}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell" style={{ color: vars.g600 }}>{c.phone}</td>
                      <td className="px-4 py-3 hidden xl:table-cell max-w-[180px]">
                        {c.notes && <p className="text-[11px] font-light truncate" style={{ color: vars.g500 }} title={c.notes}>{c.notes}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => openEditContact(c)} className="p-1.5 rounded-lg hover:bg-gray-50" title="Edit"><PenLine size={13} color={vars.g400} /></button>
                          <button onClick={() => { if (window.confirm(`Delete ${c.firstName} ${c.lastName}?`)) void deleteContact(c.id); }} disabled={deletingContactId === c.id} className="p-1.5 rounded-lg hover:bg-red-50" title="Delete"><Trash2 size={13} color={deletingContactId === c.id ? vars.g300 : vars.red} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Outlet modal */}
      {showOutletModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setShowOutletModal(false)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: vars.g200 }}>
              <h2 className="text-[16px] font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>{editingOutlet ? "Edit outlet" : "Add outlet"}</h2>
              <button onClick={() => setShowOutletModal(false)} className="text-[20px] leading-none px-2" style={{ color: vars.g400 }}>&times;</button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              {[
                { label: "Publication name *", key: "name", placeholder: "e.g. PR Week" },
                { label: "Website", key: "website", placeholder: "e.g. prweek.com" },
                { label: "Country", key: "country", placeholder: "e.g. United Kingdom" },
                { label: "Reach / audience size", key: "reachBand", placeholder: "e.g. 50k–100k, National, Niche" },
                { label: "Description", key: "description", placeholder: "Brief description of the publication" },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>{label}</label>
                  {key === "description" ? (
                    <textarea rows={2} value={outletForm[key as keyof typeof outletForm]} onChange={(e) => setOutletForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} className="w-full px-3 py-2 rounded-lg border text-[13px] resize-none" style={{ borderColor: vars.g200 }} />
                  ) : (
                    <input value={outletForm[key as keyof typeof outletForm]} onChange={(e) => setOutletForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} className="w-full px-3 py-2 rounded-lg border text-[13px]" style={{ borderColor: vars.g200 }} />
                  )}
                </div>
              ))}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>Category</label>
                <div className="flex gap-2">
                  <select value={outletForm.category} onChange={(e) => setOutletForm((f) => ({ ...f, category: e.target.value }))} className="flex-1 px-3 py-2 rounded-lg border text-[13px]" style={{ borderColor: vars.g200 }}>
                    <option value="">Choose a category...</option>
                    {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2" style={{ borderColor: vars.g200 }}>
              <button onClick={() => setShowOutletModal(false)} className="px-4 py-2 rounded-lg text-[13px] font-semibold border" style={{ borderColor: vars.g200, color: vars.g500 }}>Cancel</button>
              <button onClick={() => void saveOutlet()} disabled={!outletForm.name.trim() || outletSaving} className="px-5 py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: vars.accent, opacity: !outletForm.name.trim() || outletSaving ? 0.5 : 1 }}>
                {outletSaving ? "Saving..." : editingOutlet ? "Save changes" : "Add outlet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contact modal */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setShowContactModal(false)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: vars.g200 }}>
              <h2 className="text-[16px] font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>{editingContact ? "Edit contact" : "Add contact"}</h2>
              <button onClick={() => setShowContactModal(false)} className="text-[20px] leading-none px-2" style={{ color: vars.g400 }}>&times;</button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "First name", key: "firstName", placeholder: "Jane" },
                  { label: "Last name", key: "lastName", placeholder: "Smith" },
                ].map(({ label, key, placeholder }) => (
                  <div key={key}>
                    <label className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>{label}</label>
                    <input value={contactForm[key as keyof typeof contactForm]} onChange={(e) => setContactForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} className="w-full px-3 py-2 rounded-lg border text-[13px]" style={{ borderColor: vars.g200 }} />
                  </div>
                ))}
              </div>
              {[
                { label: "Role / title", key: "role", placeholder: "e.g. Senior Reporter" },
                { label: "Email", key: "email", placeholder: "jane@publication.com" },
                { label: "Phone", key: "phone", placeholder: "+44 7700 000000" },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>{label}</label>
                  <input value={contactForm[key as keyof typeof contactForm]} onChange={(e) => setContactForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} className="w-full px-3 py-2 rounded-lg border text-[13px]" style={{ borderColor: vars.g200 }} />
                </div>
              ))}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>Publication / outlet</label>
                <SearchableOutletPicker
                  outlets={outletOptions}
                  value={contactForm.outletId}
                  onChange={(id) => setContactForm((f) => ({ ...f, outletId: id }))}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>Notes</label>
                <textarea rows={2} value={contactForm.notes} onChange={(e) => setContactForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Beat, preferences, any useful context..." className="w-full px-3 py-2 rounded-lg border text-[13px] resize-none" style={{ borderColor: vars.g200 }} />
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2" style={{ borderColor: vars.g200 }}>
              <button onClick={() => setShowContactModal(false)} className="px-4 py-2 rounded-lg text-[13px] font-semibold border" style={{ borderColor: vars.g200, color: vars.g500 }}>Cancel</button>
              <button onClick={() => void saveContact()} disabled={(!contactForm.firstName.trim() && !contactForm.lastName.trim()) || contactSaving} className="px-5 py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: vars.accent, opacity: (!contactForm.firstName.trim() && !contactForm.lastName.trim()) || contactSaving ? 0.5 : 1 }}>
                {contactSaving ? "Saving..." : editingContact ? "Save changes" : "Add contact"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category picker for outlet form */}
      {showCatPicker && (
        <CategoryPickerModal
          all={TRADE_MEDIA_CATEGORIES}
          selected={outletForm.category ? [outletForm.category] : []}
          projectSet={projectCategories}
          onClose={() => setShowCatPicker(false)}
          onSave={(next) => { setOutletForm((f) => ({ ...f, category: next[next.length - 1] ?? "" })); setShowCatPicker(false); }}
        />
      )}
    </div>
  );
}

export { MediaDatabasePage };
export type { Outlet, Contact };
