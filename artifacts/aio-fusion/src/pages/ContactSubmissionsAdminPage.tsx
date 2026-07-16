import { useState, useEffect } from "react";
import { ArrowLeft, RefreshCw, Inbox, Mail, AlertCircle, Building2, Calendar } from "lucide-react";
import { vars } from "../marketing/vars";
import { apiBase } from "../lib/contentAi";

type Submission = {
  id: number;
  type: string;
  name: string;
  email: string;
  company: string;
  subject: string;
  message: string;
  emailFailed: string;
  createdAt: string;
};

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function ContactSubmissionsAdminPage({ onBack }: { onBack: () => void }) {
  const ink = "#0a1628";
  const accent = "#C8497A";
  const accentSoft = "#FBE3ED";
  const paper = "#f8fafc";

  const [rows, setRows] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "book-demo" | "enquiry">("all");

  const load = () => {
    setLoading(true);
    setError(null);
    fetch(`${apiBase}/admin/contact-submissions`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: { rows?: Submission[]; error?: string }) => {
        if (data.error) { setError(data.error); return; }
        setRows(data.rows ?? []);
      })
      .catch(() => setError("Could not load contact submissions."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const visible = rows.filter((r) => filter === "all" || r.type === filter);
  const emailFailedCount = rows.filter((r) => r.emailFailed === "true").length;

  return (
    <div className="min-h-screen font-['Inter',sans-serif]" style={{ background: paper, color: ink }}>
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
            className="flex items-center gap-2 px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.12em] rounded-xl border transition-all hover:brightness-95"
            style={{ borderColor: vars.g200, color: ink, background: "white" }}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-5 sm:px-7 py-3 sm:py-3.5 text-[12px] sm:text-[13px] font-bold uppercase tracking-[0.14em] rounded-xl transition-all hover:brightness-110"
            style={{ background: accent, color: "white" }}
          >
            <ArrowLeft size={16} /> Back
          </button>
        </div>
      </header>

      <div className="px-4 sm:px-10 py-10 sm:py-14 max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4" style={{ background: accentSoft }}>
            <Inbox size={12} color={accent} />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>
              Admin · Contact Submissions
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl leading-[1.1]" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>
            Contact form submissions
          </h1>
          <p className="text-[14px] font-light mt-3 max-w-2xl leading-[1.7]" style={{ color: vars.g600 }}>
            All inbound leads from the Book a Demo and General Enquiry forms, persisted to the database so no submission is lost if email delivery fails.
          </p>
        </div>

        {emailFailedCount > 0 && (
          <div
            className="flex items-start gap-3 px-5 py-4 rounded-xl mb-6"
            style={{ background: "#fff7ed", border: "1px solid #fed7aa" }}
          >
            <AlertCircle size={18} color="#c2410c" className="mt-0.5 shrink-0" />
            <p className="text-[13px] leading-[1.6]" style={{ color: "#7c2d12" }}>
              <strong>{emailFailedCount} submission{emailFailedCount > 1 ? "s" : ""}</strong> had email delivery failures and may not have been seen by the team. Review them below.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 mb-6">
          {(["all", "book-demo", "enquiry"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-4 py-2 text-[12px] font-bold uppercase tracking-[0.1em] rounded-lg transition-all"
              style={
                filter === f
                  ? { background: accent, color: "white" }
                  : { background: "white", color: vars.g600, border: `1px solid ${vars.g200}` }
              }
            >
              {f === "all" ? `All (${rows.length})` : f === "book-demo" ? `Book a Demo (${rows.filter((r) => r.type === "book-demo").length})` : `Enquiries (${rows.filter((r) => r.type === "enquiry").length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <RefreshCw size={24} className="animate-spin" style={{ color: accent }} />
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 px-5 py-4 rounded-xl" style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
            <AlertCircle size={16} color="#dc2626" />
            <p className="text-[13px]" style={{ color: "#7f1d1d" }}>{error}</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-24" style={{ color: vars.g400 }}>
            <Inbox size={40} className="mx-auto mb-4 opacity-40" />
            <p className="text-[14px]">No submissions yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {visible.map((row) => {
              const isOpen = expanded === row.id;
              const failed = row.emailFailed === "true";
              return (
                <div
                  key={row.id}
                  className="rounded-2xl border transition-all"
                  style={{
                    background: "white",
                    borderColor: failed ? "#fed7aa" : vars.g200,
                  }}
                >
                  <button
                    className="w-full text-left px-5 py-4 flex items-start gap-4"
                    onClick={() => setExpanded(isOpen ? null : row.id)}
                  >
                    <div
                      className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5"
                      style={{ background: row.type === "book-demo" ? accentSoft : "#e0f2fe" }}
                    >
                      <Mail size={14} color={row.type === "book-demo" ? accent : "#0369a1"} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-semibold" style={{ color: ink }}>{row.name}</span>
                        <span
                          className="text-[10px] font-bold uppercase tracking-[0.14em] px-2 py-0.5 rounded-full"
                          style={
                            row.type === "book-demo"
                              ? { background: accentSoft, color: accent }
                              : { background: "#e0f2fe", color: "#0369a1" }
                          }
                        >
                          {row.type === "book-demo" ? "Book a Demo" : "Enquiry"}
                        </span>
                        {failed && (
                          <span
                            className="text-[10px] font-bold uppercase tracking-[0.14em] px-2 py-0.5 rounded-full"
                            style={{ background: "#fff7ed", color: "#c2410c" }}
                          >
                            Email failed
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-[12px]" style={{ color: vars.g600 }}>{row.email}</span>
                        {row.company && (
                          <>
                            <span style={{ color: vars.g300 }}>·</span>
                            <span className="flex items-center gap-1 text-[12px]" style={{ color: vars.g600 }}>
                              <Building2 size={11} /> {row.company}
                            </span>
                          </>
                        )}
                        <span style={{ color: vars.g300 }}>·</span>
                        <span className="flex items-center gap-1 text-[12px]" style={{ color: vars.g400 }}>
                          <Calendar size={11} /> {formatDate(row.createdAt)}
                        </span>
                      </div>
                      {!isOpen && (row.subject || row.message) && (
                        <p className="text-[12px] mt-1.5 truncate max-w-xl" style={{ color: vars.g500 }}>
                          {row.subject || row.message}
                        </p>
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-5 border-t" style={{ borderColor: vars.g100 }}>
                      {row.subject && (
                        <div className="pt-4">
                          <p className="text-[11px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: vars.g400 }}>Subject</p>
                          <p className="text-[13px] leading-[1.6]" style={{ color: ink }}>{row.subject}</p>
                        </div>
                      )}
                      <div className="pt-4">
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: vars.g400 }}>
                          {row.type === "book-demo" ? "What they hope to achieve" : "Message"}
                        </p>
                        <p className="text-[13px] leading-[1.7] whitespace-pre-wrap" style={{ color: ink }}>{row.message}</p>
                      </div>
                      <div className="pt-4">
                        <a
                          href={`mailto:${row.email}?subject=Re: ${encodeURIComponent(row.subject || (row.type === "book-demo" ? "Your demo request" : "Your enquiry"))}`}
                          className="inline-flex items-center gap-2 px-4 py-2 text-[12px] font-bold uppercase tracking-[0.1em] rounded-lg transition-all hover:brightness-95"
                          style={{ background: accentSoft, color: accent }}
                        >
                          <Mail size={13} /> Reply to {row.name}
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
