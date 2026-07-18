import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, RefreshCw, Loader2, CheckCircle2, Clock, Mail,
  Building2, Calendar, Filter, X, ChevronDown, ChevronUp,
  BookOpen, MessageSquare, Users,
} from "lucide-react";
import { vars } from "../marketing/vars";
import { apiBase } from "../lib/contentAi";

type Submission = {
  id: number;
  type: "book-demo" | "enquiry";
  name: string;
  email: string;
  company: string;
  goal: string | null;
  subject: string | null;
  message: string | null;
  status: "pending" | "actioned";
  createdAt: string;
};

const TYPE_LABELS: Record<string, string> = {
  "book-demo": "Book a Demo",
  enquiry: "General Enquiry",
};

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "book-demo": { bg: "rgba(200,73,122,0.08)", text: vars.accent, border: "rgba(200,73,122,0.25)" },
  enquiry: { bg: "rgba(31,116,143,0.08)", text: "#1f748f", border: "rgba(31,116,143,0.25)" },
};

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  pending: { bg: "#fef3c7", text: "#92400e", border: "#fde68a" },
  actioned: { bg: "#dcfce7", text: "#166534", border: "#bbf7d0" },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function LeadsAdminPage({ onBack }: { onBack: () => void }) {
  const ink = vars.navy;
  const accent = vars.accent;
  const accentSoft = "#FBE3ED";

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [filterType, setFilterType] = useState<"all" | "book-demo" | "enquiry">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "actioned">("all");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void fetch(`${apiBase()}/api/admin/leads`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load leads");
        const data = await r.json() as { submissions: Submission[] };
        setSubmissions(data.submissions ?? []);
      })
      .catch(() => setError("Could not load submissions. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateStatus = (id: number, status: "pending" | "actioned") => {
    setUpdatingId(id);
    void fetch(`${apiBase()}/api/admin/leads/${id}/status`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("Update failed");
        setSubmissions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, status } : s))
        );
      })
      .catch(() => setError("Failed to update status. Please try again."))
      .finally(() => setUpdatingId(null));
  };

  const filtered = submissions.filter((s) => {
    if (filterType !== "all" && s.type !== filterType) return false;
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    return true;
  });

  const pendingCount = submissions.filter((s) => s.status === "pending").length;
  const demoCount = submissions.filter((s) => s.type === "book-demo").length;
  const enquiryCount = submissions.filter((s) => s.type === "enquiry").length;

  return (
    <div className="min-h-screen font-['Inter',sans-serif]" style={{ background: "#f8fafc", color: ink }}>
      <header
        className="px-4 sm:px-10 py-4 sm:py-6 flex items-center justify-between"
        style={{ background: "white", borderBottom: `1px solid ${vars.g200}` }}
      >
        <button onClick={onBack} className="flex items-center gap-3.5">
          <img
            src={`${import.meta.env.BASE_URL}images/logo-navy.png`}
            alt="AIO Fusion"
            className="h-16 sm:h-24"
            onError={(e) => { (e.target as HTMLImageElement).src = `${import.meta.env.BASE_URL}images/logo-white.png`; }}
          />
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.12em] rounded-xl border transition-all hover:brightness-95 disabled:opacity-50"
            style={{ borderColor: vars.g200, color: ink, background: "white" }}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-5 sm:px-7 py-3 sm:py-3.5 text-[12px] sm:text-[13px] font-bold uppercase tracking-[0.14em] rounded-xl transition-all hover:brightness-110"
            style={{ background: accent, color: "white" }}
          >
            <ArrowLeft size={16} /> Back to admin
          </button>
        </div>
      </header>

      <div className="px-4 sm:px-10 py-10 sm:py-14 max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4" style={{ background: accentSoft }}>
            <Users size={12} color={accent} />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>Admin · Leads & Enquiries</span>
          </div>
          <h1 className="text-3xl sm:text-4xl leading-[1.1]" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>
            Demo requests &amp; enquiries
          </h1>
          <p className="text-[14px] font-light mt-3 max-w-2xl leading-[1.7]" style={{ color: vars.g600 }}>
            All Book a Demo and General Enquiry submissions from the marketing site. Mark each one as actioned once it has been followed up.
          </p>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: "Total", value: submissions.length, icon: <Mail size={16} color={accent} /> },
            { label: "Book a Demo", value: demoCount, icon: <BookOpen size={16} color="#1f748f" /> },
            { label: "Pending follow-up", value: pendingCount, icon: <Clock size={16} color="#D97706" /> },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl p-5 flex items-center gap-4"
              style={{ background: "white", border: `1px solid ${vars.g200}` }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: vars.g100 }}>
                {stat.icon}
              </div>
              <div>
                <p className="text-2xl font-bold leading-none mb-0.5" style={{ color: ink }}>{stat.value}</p>
                <p className="text-[12px] font-medium" style={{ color: vars.g500 }}>{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: vars.g500 }}>
            <Filter size={13} /> Filter
          </div>
          <div className="flex gap-2">
            {(["all", "book-demo", "enquiry"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
                style={
                  filterType === t
                    ? { background: accent, color: "white" }
                    : { background: "white", color: vars.g600, border: `1px solid ${vars.g200}` }
                }
              >
                {t === "all" ? "All types" : TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <div className="w-px h-4 bg-gray-200" />
          <div className="flex gap-2">
            {(["all", "pending", "actioned"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
                style={
                  filterStatus === s
                    ? { background: ink, color: "white" }
                    : { background: "white", color: vars.g600, border: `1px solid ${vars.g200}` }
                }
              >
                {s === "all" ? "All statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          {(filterType !== "all" || filterStatus !== "all") && (
            <button
              onClick={() => { setFilterType("all"); setFilterStatus("all"); }}
              className="flex items-center gap-1 text-[12px] font-medium"
              style={{ color: vars.g400 }}
            >
              <X size={12} /> Clear
            </button>
          )}
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-xl text-[13px] font-medium" style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={28} className="animate-spin" style={{ color: accent }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-2xl" style={{ background: "white", border: `1px solid ${vars.g200}` }}>
            <Mail size={36} style={{ color: vars.g300 }} className="mb-4" />
            <p className="text-[15px] font-semibold mb-1" style={{ color: ink }}>No submissions yet</p>
            <p className="text-[13px] font-light" style={{ color: vars.g500 }}>
              {filterType !== "all" || filterStatus !== "all"
                ? "No submissions match the current filters."
                : "Submissions will appear here once someone fills in the contact forms."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((s) => {
              const typeStyle = TYPE_COLORS[s.type] ?? TYPE_COLORS["enquiry"];
              const statusStyle = STATUS_COLORS[s.status] ?? STATUS_COLORS["pending"];
              const isExpanded = expandedId === s.id;

              return (
                <div
                  key={s.id}
                  className="rounded-2xl overflow-hidden transition-all"
                  style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: isExpanded ? "0 8px 24px -12px rgba(0,0,0,0.12)" : undefined }}
                >
                  {/* Row summary */}
                  <div
                    className="px-5 py-4 flex items-center gap-4 cursor-pointer select-none"
                    onClick={() => setExpandedId(isExpanded ? null : s.id)}
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: typeStyle.bg, border: `1px solid ${typeStyle.border}` }}>
                      {s.type === "book-demo" ? <BookOpen size={15} color={typeStyle.text} /> : <MessageSquare size={15} color={typeStyle.text} />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-[13px] font-semibold" style={{ color: ink }}>{s.name}</span>
                        {s.company && (
                          <span className="flex items-center gap-1 text-[12px] font-medium" style={{ color: vars.g500 }}>
                            <Building2 size={11} /> {s.company}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[12px]" style={{ color: vars.g500 }}>{s.email}</span>
                        {s.subject && (
                          <span className="text-[12px] font-medium truncate max-w-xs" style={{ color: vars.g600 }}>· {s.subject}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span
                        className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.15em] px-2.5 py-1 rounded-full"
                        style={{ background: typeStyle.bg, color: typeStyle.text, border: `1px solid ${typeStyle.border}` }}
                      >
                        {TYPE_LABELS[s.type]}
                      </span>
                      <span
                        className="text-[10px] font-bold uppercase tracking-[0.15em] px-2.5 py-1 rounded-full"
                        style={{ background: statusStyle.bg, color: statusStyle.text, border: `1px solid ${statusStyle.border}` }}
                      >
                        {s.status}
                      </span>
                      <span className="hidden md:flex items-center gap-1 text-[11px]" style={{ color: vars.g400 }}>
                        <Calendar size={11} /> {formatDate(s.createdAt)}
                      </span>
                      <div style={{ color: vars.g400 }}>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-5 pb-5 border-t" style={{ borderColor: vars.g100 }}>
                      <div className="pt-4 grid sm:grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5" style={{ color: vars.g400 }}>Contact</p>
                          <p className="text-[13px] font-semibold mb-0.5" style={{ color: ink }}>{s.name}</p>
                          <a href={`mailto:${s.email}`} className="text-[13px] hover:underline" style={{ color: accent }}>{s.email}</a>
                          {s.company && <p className="text-[13px] mt-0.5" style={{ color: vars.g600 }}>{s.company}</p>}
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5" style={{ color: vars.g400 }}>Submitted</p>
                          <p className="text-[13px]" style={{ color: vars.g600 }}>{formatDate(s.createdAt)}</p>
                        </div>
                        {s.goal && (
                          <div className="sm:col-span-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5" style={{ color: vars.g400 }}>What they're hoping to achieve</p>
                            <p className="text-[13px] leading-[1.7] whitespace-pre-wrap" style={{ color: vars.g600 }}>{s.goal}</p>
                          </div>
                        )}
                        {s.subject && (
                          <div className="sm:col-span-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5" style={{ color: vars.g400 }}>Subject</p>
                            <p className="text-[13px] font-semibold" style={{ color: ink }}>{s.subject}</p>
                          </div>
                        )}
                        {s.message && (
                          <div className="sm:col-span-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5" style={{ color: vars.g400 }}>Message</p>
                            <p className="text-[13px] leading-[1.7] whitespace-pre-wrap" style={{ color: vars.g600 }}>{s.message}</p>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3 pt-2">
                        {s.status === "pending" ? (
                          <button
                            disabled={updatingId === s.id}
                            onClick={() => updateStatus(s.id, "actioned")}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-[0.12em] transition-all hover:brightness-110 disabled:opacity-50"
                            style={{ background: "#16a34a", color: "white" }}
                          >
                            {updatingId === s.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                            Mark as actioned
                          </button>
                        ) : (
                          <button
                            disabled={updatingId === s.id}
                            onClick={() => updateStatus(s.id, "pending")}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-[0.12em] transition-all hover:brightness-95 disabled:opacity-50"
                            style={{ background: "white", color: vars.g600, border: `1px solid ${vars.g200}` }}
                          >
                            {updatingId === s.id ? <Loader2 size={13} className="animate-spin" /> : <Clock size={13} />}
                            Mark as pending
                          </button>
                        )}
                        <a
                          href={`mailto:${s.email}`}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-[0.12em] transition-all hover:brightness-95"
                          style={{ background: "white", color: ink, border: `1px solid ${vars.g200}` }}
                        >
                          <Mail size={13} /> Email {s.name.split(" ")[0]}
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loading && filtered.length > 0 && filtered.length !== enquiryCount + demoCount && (
          <p className="text-center mt-6 text-[12px]" style={{ color: vars.g400 }}>
            Showing {filtered.length} of {submissions.length} submissions
          </p>
        )}
      </div>
    </div>
  );
}
