import { useState, useEffect, useCallback } from "react";
import {
  ChevronDown, Plus, Pencil, ToggleLeft, ToggleRight, Loader2,
  CheckCircle2, AlertCircle, Search, Filter, X, Save, ArrowLeft,
  MessageSquare, Ticket, BookOpen, Clock, RefreshCw, Tag,
  ChevronUp, GripVertical,
} from "lucide-react";
import { vars } from "../marketing/vars";
import { apiBase } from "../lib/contentAi";

type FaqEntry = {
  id: number;
  category: string;
  question: string;
  answer: string;
  keywords: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type Ticket = {
  id: number;
  accountUsername: string;
  userRole: string;
  projectId: string | null;
  category: string;
  subject: string;
  description: string;
  attachmentUrl: string | null;
  status: string;
  adminNotes: string | null;
  hasAdminReply: boolean;
  createdAt: string;
  updatedAt: string;
};

type TicketMessage = {
  id: number;
  ticketId: number;
  authorType: string;
  authorUsername: string;
  body: string;
  createdAt: string;
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open: { bg: "#fef3c7", text: "#92400e" },
  in_progress: { bg: "#dbeafe", text: "#1e40af" },
  resolved: { bg: "#dcfce7", text: "#166534" },
  closed: { bg: "#f3f4f6", text: "#6b7280" },
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

const CATEGORIES = [
  "General",
  "Getting Started",
  "Project Set-Up",
  "LLM Check / Earned Media Audit",
  "Technical GEO / Website Audit",
  "Content Creator",
  "Content Optimiser",
  "Comms Planner",
  "Media Research & Media Database",
  "Archive & Reports",
  "Account & Access Management",
  "Bug / Technical Issue",
];

export function SupportAdminPage({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<"tickets" | "faq">("tickets");
  const navy = vars.navy;
  const accent = vars.accent ?? "#C8497A";
  const teal = vars.teal ?? "#1F748F";

  return (
    <div className="min-h-screen" style={{ background: "#f8fafc" }}>
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-white px-6 py-4 flex items-center gap-4" style={{ borderColor: vars.g200 }}>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] font-medium hover:opacity-70 transition-opacity"
          style={{ color: vars.g500 }}
        >
          <ArrowLeft size={15} /> Back
        </button>
        <div className="h-5 w-px" style={{ background: vars.g200 }} />
        <h1 className="text-[18px] font-bold" style={{ color: navy }}>Support Management</h1>
        <div className="ml-auto flex gap-1 rounded-xl p-1" style={{ background: vars.g100 }}>
          {([["tickets", "Ticket Queue", Ticket], ["faq", "FAQ Library", BookOpen]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
              style={
                tab === id
                  ? { background: "white", color: navy, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }
                  : { color: vars.g500 }
              }
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {tab === "tickets" ? (
          <TicketQueue navy={navy} accent={accent} teal={teal} />
        ) : (
          <FaqManager navy={navy} accent={accent} teal={teal} />
        )}
      </div>
    </div>
  );
}

// ── Ticket Queue ─────────────────────────────────────────────────────────────

function TicketQueue({ navy, accent, teal }: { navy: string; accent: string; teal: string }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [adminNotes, setAdminNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [saveFaqMode, setSaveFaqMode] = useState(false);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      const r = await fetch(
        `${apiBase()}/api/support/tickets${params.toString() ? `?${params}` : ""}`,
        { credentials: "include" },
      );
      const data = (await r.json()) as { tickets: Ticket[]; error?: string };
      if (!r.ok) { setError(data.error ?? "Failed to load tickets"); return; }
      setTickets(data.tickets ?? []);
    } catch {
      setError("Failed to load tickets. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter]);

  useEffect(() => { void loadTickets(); }, [loadTickets]);

  const openTicket = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setAdminNotes(ticket.adminNotes ?? "");
    setReplyText("");
    setSaveFaqMode(false);
    try {
      const r = await fetch(`${apiBase()}/api/support/tickets/${ticket.id}/messages`, { credentials: "include" });
      const data = (await r.json()) as { messages: TicketMessage[] };
      setMessages(data.messages ?? []);
    } catch {
      setMessages([]);
    }
  };

  const updateStatus = async (status: string) => {
    if (!selectedTicket) return;
    setUpdatingStatus(true);
    try {
      const r = await fetch(`${apiBase()}/api/support/tickets/${selectedTicket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      const data = (await r.json()) as { ticket: Ticket };
      setSelectedTicket(data.ticket);
      setTickets((prev) => prev.map((t) => t.id === data.ticket.id ? data.ticket : t));
    } catch { /* ignore */ } finally {
      setUpdatingStatus(false);
    }
  };

  const saveNotes = async () => {
    if (!selectedTicket) return;
    setSavingNotes(true);
    try {
      const r = await fetch(`${apiBase()}/api/support/tickets/${selectedTicket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ adminNotes }),
      });
      const data = (await r.json()) as { ticket: Ticket };
      setSelectedTicket(data.ticket);
      setTickets((prev) => prev.map((t) => t.id === data.ticket.id ? data.ticket : t));
    } catch { /* ignore */ } finally {
      setSavingNotes(false);
    }
  };

  const sendReply = async () => {
    if (!selectedTicket || !replyText.trim()) return;
    setSendingReply(true);
    try {
      const r = await fetch(`${apiBase()}/api/support/tickets/${selectedTicket.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body: replyText.trim() }),
      });
      const data = (await r.json()) as { message: TicketMessage };
      setMessages((prev) => [...prev, data.message]);
      setReplyText("");
      // Reload ticket to get updated status
      void loadTickets();
    } catch { /* ignore */ } finally {
      setSendingReply(false);
    }
  };

  if (selectedTicket) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setSelectedTicket(null); void loadTickets(); }}
            className="flex items-center gap-1.5 text-[13px] font-medium hover:opacity-70"
            style={{ color: vars.g500 }}
          >
            <ArrowLeft size={14} /> All Tickets
          </button>
          <h2 className="text-[16px] font-semibold" style={{ color: navy }}>
            Ticket #{selectedTicket.id} — {selectedTicket.subject}
          </h2>
          <StatusBadge status={selectedTicket.status} />
        </div>

        <div className="grid grid-cols-3 gap-5">
          {/* Main */}
          <div className="col-span-2 flex flex-col gap-4">
            {/* User info card */}
            <div className="rounded-xl border p-4" style={{ borderColor: vars.g200, background: "white" }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: vars.g400 }}>Submitted by</p>
              <div className="flex flex-wrap gap-4 text-[13px]">
                <span><strong>Account:</strong> {selectedTicket.accountUsername}</span>
                <span><strong>Role:</strong> {selectedTicket.userRole}</span>
                {selectedTicket.projectId && <span><strong>Project:</strong> {selectedTicket.projectId}</span>}
                <span><strong>Category:</strong> {selectedTicket.category}</span>
                <span><strong>Opened:</strong> {new Date(selectedTicket.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
              </div>
            </div>

            {/* Description */}
            <div className="rounded-xl border p-4" style={{ borderColor: vars.g200, background: "white" }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: vars.g400 }}>Description</p>
              <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: navy }}>{selectedTicket.description}</p>
              {selectedTicket.attachmentUrl && (
                <a href={selectedTicket.attachmentUrl} target="_blank" rel="noopener" className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium" style={{ color: teal }}>
                  View attachment ↗
                </a>
              )}
            </div>

            {/* Thread */}
            {messages.length > 0 && (
              <div className="rounded-xl border p-4 flex flex-col gap-3" style={{ borderColor: vars.g200, background: "white" }}>
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: vars.g400 }}>Message thread</p>
                {messages.map((m) => (
                  <div key={m.id} className={`p-3 rounded-xl text-[13px] ${m.authorType === "admin" ? "ml-4" : "mr-4"}`}
                    style={{ background: m.authorType === "admin" ? "#f0f9fb" : "#fef9fb", border: `1px solid ${m.authorType === "admin" ? "#d0edf3" : `${accent}30`}` }}>
                    <p className="text-[11px] font-semibold mb-1" style={{ color: vars.g400 }}>
                      {m.authorType === "admin" ? "Support team" : m.authorUsername} · {new Date(m.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <p className="whitespace-pre-wrap" style={{ color: navy }}>{m.body}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Reply */}
            <div className="rounded-xl border p-4 flex flex-col gap-3" style={{ borderColor: vars.g200, background: "white" }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: vars.g400 }}>Reply to user</p>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type your reply…"
                rows={4}
                className="text-[13px] px-3 py-2 rounded-lg border outline-none resize-none"
                style={{ borderColor: vars.g200, color: navy }}
              />
              <div className="flex gap-2 items-center">
                <button
                  onClick={sendReply}
                  disabled={sendingReply || !replyText.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold text-white disabled:opacity-40 hover:brightness-110"
                  style={{ background: teal }}
                >
                  {sendingReply && <Loader2 size={12} className="animate-spin" />}
                  Send reply
                </button>
                {selectedTicket.status === "resolved" && (
                  <button
                    onClick={() => setSaveFaqMode(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold border hover:bg-gray-50"
                    style={{ borderColor: vars.g200, color: navy }}
                  >
                    <BookOpen size={13} /> Save to FAQ
                  </button>
                )}
              </div>
            </div>

            {/* Save to FAQ quick-form */}
            {saveFaqMode && (
              <SaveToFaqInline
                ticket={selectedTicket}
                messages={messages}
                onDone={() => setSaveFaqMode(false)}
                navy={navy}
                accent={accent}
                teal={teal}
              />
            )}
          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-4">
            {/* Status */}
            <div className="rounded-xl border p-4" style={{ borderColor: vars.g200, background: "white" }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: vars.g400 }}>Status</p>
              <div className="relative">
                <select
                  value={selectedTicket.status}
                  onChange={(e) => void updateStatus(e.target.value)}
                  disabled={updatingStatus}
                  className="w-full text-[13px] px-3 py-2 rounded-lg border appearance-none"
                  style={{ borderColor: vars.g200, color: navy }}
                >
                  {Object.entries(STATUS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: vars.g400 }} />
              </div>
              {!saveFaqMode && selectedTicket.status === "resolved" && (
                <button
                  onClick={() => setSaveFaqMode(true)}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold border hover:bg-gray-50 transition-colors"
                  style={{ borderColor: vars.g200, color: navy }}
                >
                  <BookOpen size={13} /> Save to FAQ
                </button>
              )}
            </div>

            {/* Admin notes */}
            <div className="rounded-xl border p-4" style={{ borderColor: vars.g200, background: "white" }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: vars.g400 }}>Admin notes (internal)</p>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Internal notes, not visible to user…"
                rows={4}
                className="text-[13px] px-3 py-2 rounded-lg border outline-none resize-none w-full mb-2"
                style={{ borderColor: vars.g200, color: navy }}
              />
              <button
                onClick={saveNotes}
                disabled={savingNotes}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white disabled:opacity-40 hover:brightness-110"
                style={{ background: accent }}
              >
                {savingNotes && <Loader2 size={12} className="animate-spin" />}
                <Save size={12} /> Save notes
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-[12px] px-3 py-2 pr-7 rounded-lg border appearance-none"
            style={{ borderColor: vars.g200, color: navy }}
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: vars.g400 }} />
        </div>
        <div className="relative">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-[12px] px-3 py-2 pr-7 rounded-lg border appearance-none"
            style={{ borderColor: vars.g200, color: navy }}
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: vars.g400 }} />
        </div>
        <button
          onClick={() => void loadTickets()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium border hover:bg-gray-50"
          style={{ borderColor: vars.g200, color: vars.g500 }}
        >
          <RefreshCw size={12} /> Refresh
        </button>
        <span className="text-[12px] ml-auto" style={{ color: vars.g400 }}>
          {tickets.length} ticket{tickets.length !== 1 ? "s" : ""}
        </span>
      </div>

      {error && (
        <div className="rounded-xl p-4 text-[13px]" style={{ background: "#fef2f2", color: "#dc2626" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin" style={{ color: teal }} />
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16" style={{ color: vars.g400 }}>
          <Ticket size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-[14px]">No tickets found</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: vars.g200 }}>
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ background: vars.g100, borderBottom: `1px solid ${vars.g200}` }}>
                {["#", "Subject", "Account", "Category", "Status", "Opened", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: vars.g400 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket, i) => (
                <tr
                  key={ticket.id}
                  style={{ borderBottom: i < tickets.length - 1 ? `1px solid ${vars.g200}` : "none", background: "white" }}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-[12px]" style={{ color: vars.g400 }}>#{ticket.id}</td>
                  <td className="px-4 py-3 font-medium max-w-[200px] truncate" style={{ color: navy }}>{ticket.subject}</td>
                  <td className="px-4 py-3" style={{ color: vars.g500 }}>{ticket.accountUsername}</td>
                  <td className="px-4 py-3" style={{ color: vars.g500 }}>{ticket.category}</td>
                  <td className="px-4 py-3"><StatusBadge status={ticket.status} /></td>
                  <td className="px-4 py-3" style={{ color: vars.g500 }}>
                    {new Date(ticket.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => void openTicket(ticket)}
                      className="text-[12px] font-semibold hover:underline"
                      style={{ color: teal }}
                    >
                      View →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] ?? { bg: "#f3f4f6", text: "#6b7280" };
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: colors.bg, color: colors.text }}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function SaveToFaqInline({
  ticket, messages, onDone, navy, accent, teal,
}: { ticket: Ticket; messages?: TicketMessage[]; onDone: () => void; navy: string; accent: string; teal: string }) {
  const [category, setCategory] = useState(ticket.category === "General" ? "Getting Started" : ticket.category);
  const [question, setQuestion] = useState(ticket.subject);
  const lastAdminReply = messages?.slice().reverse().find((m) => m.authorType === "admin")?.body ?? "";
  const [answer, setAnswer] = useState(lastAdminReply);
  const [keywords, setKeywords] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!question.trim() || !answer.trim()) { setErr("Question and answer are required."); return; }
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch(`${apiBase()}/api/support/faq`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ category, question: question.trim(), answer: answer.trim(), keywords: keywords.trim() }),
      });
      if (!r.ok) { const d = (await r.json()) as { error: string }; setErr(d.error); return; }
      setDone(true);
      setTimeout(() => onDone(), 1200);
    } catch { setErr("Failed to save."); } finally { setSaving(false); }
  };

  if (done) return (
    <div className="rounded-xl border p-4 flex items-center gap-2" style={{ borderColor: vars.g200, background: "#dcfce7" }}>
      <CheckCircle2 size={16} style={{ color: "#16a34a" }} />
      <p className="text-[13px] font-semibold" style={{ color: "#16a34a" }}>Saved to FAQ library!</p>
    </div>
  );

  return (
    <div className="rounded-xl border p-4 flex flex-col gap-3" style={{ borderColor: `${accent}50`, background: "#fef9fb" }}>
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold flex items-center gap-1.5" style={{ color: navy }}>
          <BookOpen size={14} style={{ color: accent }} /> Save to FAQ Library
        </p>
        <button onClick={onDone} className="p-1 hover:opacity-70" style={{ color: vars.g400 }}><X size={14} /></button>
      </div>
      <div className="relative">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full text-[12px] px-3 py-2 rounded-lg border appearance-none" style={{ borderColor: vars.g200, color: navy }}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: vars.g400 }} />
      </div>
      <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Question *" className="text-[12px] px-3 py-2 rounded-lg border outline-none" style={{ borderColor: vars.g200, color: navy }} />
      <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Answer *" rows={4} className="text-[12px] px-3 py-2 rounded-lg border outline-none resize-none" style={{ borderColor: vars.g200, color: navy }} />
      <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="Keywords (comma-separated, optional)" className="text-[12px] px-3 py-2 rounded-lg border outline-none" style={{ borderColor: vars.g200, color: navy }} />
      {err && <p className="text-[12px]" style={{ color: "#dc2626" }}>{err}</p>}
      <button onClick={save} disabled={saving || !question.trim() || !answer.trim()} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold text-white disabled:opacity-40 hover:brightness-110 self-start" style={{ background: accent }}>
        {saving && <Loader2 size={12} className="animate-spin" />}
        <BookOpen size={12} /> Save to FAQ
      </button>
    </div>
  );
}

// ── FAQ Manager ───────────────────────────────────────────────────────────────

function FaqManager({ navy, accent, teal }: { navy: string; accent: string; teal: string }) {
  const [faq, setFaq] = useState<FaqEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editingEntry, setEditingEntry] = useState<Partial<FaqEntry> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<number | null>(null);
  const [reordering, setReordering] = useState<number | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const loadFaq = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase()}/api/support/faq?admin=1`, { credentials: "include" });
      const data = (await r.json()) as { faq: FaqEntry[]; error?: string };
      if (!r.ok) { setError(data.error ?? "Failed"); return; }
      setFaq(data.faq ?? []);
    } catch {
      setError("Failed to load FAQ. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadFaq(); }, [loadFaq]);

  const filtered = faq.filter((e) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return e.question.toLowerCase().includes(s) || e.answer.toLowerCase().includes(s) || e.keywords.toLowerCase().includes(s);
  });

  const byCategory = filtered.reduce<Record<string, FaqEntry[]>>((acc, e) => {
    if (!acc[e.category]) acc[e.category] = [];
    acc[e.category].push(e);
    return acc;
  }, {});

  const openNew = () => {
    setEditingEntry({ category: "Getting Started", question: "", answer: "", keywords: "", displayOrder: 0, isActive: true });
    setSaveError(null);
  };

  const saveEntry = async () => {
    if (!editingEntry) return;
    if (!editingEntry.category || !editingEntry.question?.trim() || !editingEntry.answer?.trim()) {
      setSaveError("Category, question, and answer are required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const isNew = !editingEntry.id;
      const url = isNew ? `${apiBase()}/api/support/faq` : `${apiBase()}/api/support/faq/${editingEntry.id}`;
      const r = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(editingEntry),
      });
      const data = (await r.json()) as { faq?: FaqEntry; error?: string };
      if (!r.ok) { setSaveError(data.error ?? "Failed to save"); return; }
      setEditingEntry(null);
      void loadFaq();
    } catch {
      setSaveError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (entry: FaqEntry) => {
    setToggling(entry.id);
    try {
      await fetch(`${apiBase()}/api/support/faq/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive: !entry.isActive }),
      });
      setFaq((prev) => prev.map((e) => e.id === entry.id ? { ...e, isActive: !e.isActive } : e));
    } catch { /* ignore */ } finally {
      setToggling(null);
    }
  };

  const moveEntry = async (entry: FaqEntry, direction: "up" | "down") => {
    // Find all entries in the same category, sorted by displayOrder
    const siblings = faq
      .filter((e) => e.category === entry.category)
      .sort((a, b) => a.displayOrder - b.displayOrder);
    const idx = siblings.findIndex((e) => e.id === entry.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;
    const swap = siblings[swapIdx];
    setReordering(entry.id);
    try {
      // Swap displayOrder values
      const [aOrder, bOrder] = [entry.displayOrder, swap.displayOrder];
      await fetch(`${apiBase()}/api/support/faq/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          items: [
            { id: entry.id, displayOrder: bOrder },
            { id: swap.id, displayOrder: aOrder },
          ],
        }),
      });
      setFaq((prev) =>
        prev.map((e) => {
          if (e.id === entry.id) return { ...e, displayOrder: bOrder };
          if (e.id === swap.id) return { ...e, displayOrder: aOrder };
          return e;
        }),
      );
    } catch { /* ignore */ } finally {
      setReordering(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: vars.g400 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search FAQ…"
            className="w-full pl-8 pr-3 py-2 text-[13px] rounded-lg border outline-none"
            style={{ borderColor: vars.g200, color: navy }}
          />
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white hover:brightness-110"
          style={{ background: accent }}
        >
          <Plus size={14} /> Add FAQ entry
        </button>
        <span className="text-[12px] ml-auto" style={{ color: vars.g400 }}>
          {faq.length} entries
        </span>
      </div>

      {/* Edit modal */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-xl flex flex-col gap-4" style={{ border: `1px solid ${vars.g200}` }}>
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-bold" style={{ color: navy }}>
                {editingEntry.id ? "Edit FAQ entry" : "New FAQ entry"}
              </h3>
              <button onClick={() => setEditingEntry(null)} className="p-1.5 hover:opacity-70" style={{ color: vars.g400 }}>
                <X size={16} />
              </button>
            </div>
            <div className="relative">
              <select
                value={editingEntry.category ?? "Getting Started"}
                onChange={(e) => setEditingEntry((p) => ({ ...p!, category: e.target.value }))}
                className="w-full text-[13px] px-3 py-2 rounded-lg border appearance-none"
                style={{ borderColor: vars.g200, color: navy }}
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: vars.g400 }} />
            </div>
            <input
              value={editingEntry.question ?? ""}
              onChange={(e) => setEditingEntry((p) => ({ ...p!, question: e.target.value }))}
              placeholder="Question *"
              className="text-[13px] px-3 py-2 rounded-lg border outline-none"
              style={{ borderColor: vars.g200, color: navy }}
            />
            <textarea
              value={editingEntry.answer ?? ""}
              onChange={(e) => setEditingEntry((p) => ({ ...p!, answer: e.target.value }))}
              placeholder="Answer *"
              rows={6}
              className="text-[13px] px-3 py-2 rounded-lg border outline-none resize-none"
              style={{ borderColor: vars.g200, color: navy }}
            />
            <input
              value={editingEntry.keywords ?? ""}
              onChange={(e) => setEditingEntry((p) => ({ ...p!, keywords: e.target.value }))}
              placeholder="Keywords — comma separated, help George find this entry"
              className="text-[13px] px-3 py-2 rounded-lg border outline-none"
              style={{ borderColor: vars.g200, color: navy }}
            />
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={editingEntry.displayOrder ?? 0}
                onChange={(e) => setEditingEntry((p) => ({ ...p!, displayOrder: Number(e.target.value) }))}
                className="w-20 text-[13px] px-3 py-2 rounded-lg border outline-none"
                style={{ borderColor: vars.g200, color: navy }}
              />
              <span className="text-[12px]" style={{ color: vars.g400 }}>Display order (lower = first)</span>
              <label className="ml-auto flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingEntry.isActive !== false}
                  onChange={(e) => setEditingEntry((p) => ({ ...p!, isActive: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-[12px]" style={{ color: navy }}>Active</span>
              </label>
            </div>
            {saveError && <p className="text-[12px]" style={{ color: "#dc2626" }}>{saveError}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditingEntry(null)} className="px-4 py-2 rounded-lg text-[13px] border hover:bg-gray-50" style={{ borderColor: vars.g200, color: navy }}>
                Cancel
              </button>
              <button onClick={saveEntry} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white disabled:opacity-40 hover:brightness-110" style={{ background: accent }}>
                {saving && <Loader2 size={13} className="animate-spin" />}
                <Save size={13} /> Save
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="rounded-xl p-4 text-[13px]" style={{ background: "#fef2f2", color: "#dc2626" }}>{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin" style={{ color: teal }} />
        </div>
      ) : Object.keys(byCategory).length === 0 ? (
        <div className="text-center py-16" style={{ color: vars.g400 }}>
          <BookOpen size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-[14px]">No FAQ entries found</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {Object.entries(byCategory).map(([cat, entries]) => {
            const collapsed = collapsedCategories.has(cat);
            return (
              <div key={cat} className="rounded-xl border overflow-hidden" style={{ borderColor: vars.g200 }}>
                <button
                  onClick={() => setCollapsedCategories((prev) => {
                    const next = new Set(prev);
                    if (next.has(cat)) next.delete(cat); else next.add(cat);
                    return next;
                  })}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  style={{ background: vars.g100, borderBottom: collapsed ? "none" : `1px solid ${vars.g200}` }}
                >
                  {collapsed ? <ChevronDown size={14} style={{ color: vars.g400 }} /> : <ChevronUp size={14} style={{ color: vars.g400 }} />}
                  <span className="text-[13px] font-semibold" style={{ color: navy }}>{cat}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full ml-1" style={{ background: vars.g200, color: vars.g500 }}>
                    {entries.length}
                  </span>
                  <span className="text-[11px] ml-auto" style={{ color: vars.g400 }}>
                    {entries.filter((e) => e.isActive).length} active
                  </span>
                </button>
                {!collapsed && (
                  <div className="divide-y" style={{ divideColor: vars.g200 } as React.CSSProperties}>
                    {entries
                      .slice()
                      .sort((a, b) => a.displayOrder - b.displayOrder)
                      .map((entry, idx, arr) => (
                      <div key={entry.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors" style={{ background: "white" }}>
                        {/* Reorder arrows */}
                        <div className="flex flex-col gap-0.5 flex-shrink-0 pt-0.5">
                          <button
                            onClick={() => void moveEntry(entry, "up")}
                            disabled={idx === 0 || reordering === entry.id}
                            className="p-0.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-20"
                            title="Move up"
                            style={{ color: vars.g400 }}
                          >
                            <ChevronUp size={12} />
                          </button>
                          <button
                            onClick={() => void moveEntry(entry, "down")}
                            disabled={idx === arr.length - 1 || reordering === entry.id}
                            className="p-0.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-20"
                            title="Move down"
                            style={{ color: vars.g400 }}
                          >
                            <ChevronDown size={12} />
                          </button>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium truncate" style={{ color: entry.isActive ? navy : vars.g400 }}>
                            {entry.question}
                          </p>
                          <p className="text-[12px] truncate mt-0.5" style={{ color: vars.g400 }}>
                            {entry.answer.slice(0, 100)}{entry.answer.length > 100 ? "…" : ""}
                          </p>
                          {entry.keywords && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {entry.keywords.split(",").slice(0, 4).map((kw) => kw.trim()).filter(Boolean).map((kw) => (
                                <span key={kw} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: vars.g100, color: vars.g500 }}>{kw}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: entry.isActive ? "#dcfce7" : "#f3f4f6", color: entry.isActive ? "#16a34a" : "#6b7280" }}>
                            {entry.isActive ? "Active" : "Inactive"}
                          </span>
                          <button
                            onClick={() => void toggleActive(entry)}
                            disabled={toggling === entry.id}
                            className="text-[12px] px-2 py-1 rounded-lg border hover:bg-gray-50 transition-colors disabled:opacity-40"
                            style={{ borderColor: vars.g200, color: vars.g500 }}
                            title={entry.isActive ? "Deactivate" : "Activate"}
                          >
                            {toggling === entry.id ? <Loader2 size={12} className="animate-spin" /> : entry.isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                          </button>
                          <button
                            onClick={() => { setEditingEntry({ ...entry }); setSaveError(null); }}
                            className="flex items-center gap-1 text-[12px] px-2 py-1 rounded-lg border hover:bg-gray-50 transition-colors"
                            style={{ borderColor: vars.g200, color: navy }}
                          >
                            <Pencil size={12} /> Edit
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
