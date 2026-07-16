import { useState, useEffect, useRef } from "react";
import { X, MessageCircle, Send, CheckCircle2, AlertCircle, Loader2, ChevronDown, Paperclip } from "lucide-react";
import { vars } from "../marketing/vars";
import { apiBase } from "../lib/contentAi";

type FaqEntry = {
  id: number;
  category: string;
  question: string;
  answer: string;
};

type Ticket = {
  id: number;
  subject: string;
  status: string;
};

type ChatStep =
  | { type: "greeting" }
  | { type: "waiting_question" }
  | { type: "searching" }
  | { type: "faq_result"; entry: FaqEntry }
  | { type: "no_match" }
  | { type: "ticket_form" }
  | { type: "ticket_success"; ticket: Ticket }
  | { type: "ask_another" };

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
  "Billing & Payments",
  "Bug / Technical Issue",
];

export function GeorgeSupport({
  open,
  onClose,
  userName,
}: {
  open: boolean;
  onClose: () => void;
  userName?: string;
}) {
  const [step, setStep] = useState<ChatStep>({ type: "greeting" });
  const [question, setQuestion] = useState("");
  const [helpfulVote, setHelpfulVote] = useState<"yes" | "no" | null>(null);

  // Ticket form state
  const [ticketCategory, setTicketCategory] = useState("General");
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketDescription, setTicketDescription] = useState("");
  const [ticketAttachment, setTicketAttachment] = useState<{ name: string; dataUrl: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);

  const [hasUpdate, setHasUpdate] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Check for pending ticket updates on open
  useEffect(() => {
    if (!open) return;
    void fetch(`${apiBase()}/api/support/tickets?mine=true&hasUpdate=true`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((d: { tickets?: unknown[] }) => {
        setHasUpdate(Array.isArray(d.tickets) && d.tickets.length > 0);
      })
      .catch(() => {});
  }, [open]);

  // Reset to greeting on close
  useEffect(() => {
    if (!open) {
      setStep({ type: "greeting" });
      setQuestion("");
      setHelpfulVote(null);
      setTicketSubject("");
      setTicketDescription("");
      setTicketCategory("General");
      setTicketAttachment(null);
      setTicketError(null);
    }
  }, [open]);

  // Focus input when step changes
  useEffect(() => {
    if (step.type === "waiting_question") {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [step.type]);

  async function handleAskQuestion() {
    const q = question.trim();
    if (!q) return;
    setStep({ type: "searching" });
    try {
      const r = await fetch(
        `${apiBase()}/api/support/faq?q=${encodeURIComponent(q)}`,
        { credentials: "include" },
      );
      const data = (await r.json()) as { faq: FaqEntry[] };
      const top = data.faq?.[0];
      if (top) {
        setStep({ type: "faq_result", entry: top });
      } else {
        setStep({ type: "no_match" });
      }
    } catch {
      setStep({ type: "no_match" });
    }
  }

  async function handleSubmitTicket() {
    if (!ticketSubject.trim() || !ticketDescription.trim()) {
      setTicketError("Please provide a subject and description.");
      return;
    }
    setSubmitting(true);
    setTicketError(null);
    try {
      const r = await fetch(`${apiBase()}/api/support/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          category: ticketCategory,
          subject: ticketSubject.trim(),
          description: ticketDescription.trim(),
          ...(ticketAttachment ? { attachmentUrl: ticketAttachment.dataUrl } : {}),
        }),
      });
      const data = (await r.json()) as { ticket?: Ticket; error?: string };
      if (!r.ok || !data.ticket) {
        setTicketError(data.error ?? "Failed to submit ticket. Please try again.");
        return;
      }
      setStep({ type: "ticket_success", ticket: data.ticket });
      setHasUpdate(false);
    } catch {
      setTicketError("Failed to submit ticket. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const accent = vars.accent ?? "#C8497A";
  const navy = vars.navy ?? "#0a1628";
  const teal = vars.teal ?? "#1F748F";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-end pointer-events-none"
      style={{ padding: "0 24px 24px 0" }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 pointer-events-auto"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative pointer-events-auto flex flex-col rounded-2xl shadow-2xl overflow-hidden"
        style={{
          width: "min(420px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 48px)",
          background: "white",
          border: `1px solid ${vars.g200}`,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-4 flex-shrink-0"
          style={{ background: navy, color: "white" }}
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
            style={{ background: accent }}
          >
            G
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold">George</p>
            <p className="text-[11px] opacity-70">GEO Support Assistant</p>
          </div>
          {hasUpdate && (
            <div
              className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{ background: accent, color: "white" }}
            >
              New reply
            </div>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Chat body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          {/* George greeting bubble */}
          <GeorgeBubble>
            <p className="text-[14px] leading-relaxed" style={{ color: navy }}>
              Hi{userName ? ` ${userName}` : ""}! I'm <strong>George</strong> — your GEO support assistant.{" "}
              What can I help you with today?
            </p>
          </GeorgeBubble>

          {(step.type === "waiting_question" || step.type === "searching") && (
            <GeorgeBubble>
              <p className="text-[13px]" style={{ color: navy }}>
                Type your question below and I'll search our knowledge base for an answer.
              </p>
            </GeorgeBubble>
          )}

          {step.type === "searching" && (
            <GeorgeBubble>
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" style={{ color: teal }} />
                <span className="text-[13px]" style={{ color: vars.g500 }}>Searching the FAQ…</span>
              </div>
            </GeorgeBubble>
          )}

          {step.type === "faq_result" && (
            <>
              <GeorgeBubble>
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: vars.g400 }}>
                  {step.entry.category}
                </p>
                <p className="text-[14px] font-semibold mb-2" style={{ color: navy }}>
                  {step.entry.question}
                </p>
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: vars.g600 ?? navy }}>
                  {step.entry.answer}
                </p>
              </GeorgeBubble>

              {helpfulVote === null && (
                <GeorgeBubble>
                  <p className="text-[13px] mb-3" style={{ color: navy }}>Was this helpful?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setHelpfulVote("yes"); setStep({ type: "ask_another" }); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all hover:bg-gray-50"
                      style={{ borderColor: vars.g200, color: navy }}
                    >
                      <CheckCircle2 size={13} style={{ color: "#22c55e" }} /> Yes, thanks!
                    </button>
                    <button
                      onClick={() => { setHelpfulVote("no"); setStep({ type: "ticket_form" }); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all hover:bg-gray-50"
                      style={{ borderColor: vars.g200, color: navy }}
                    >
                      <AlertCircle size={13} style={{ color: accent }} /> Not quite
                    </button>
                  </div>
                </GeorgeBubble>
              )}
            </>
          )}

          {step.type === "ask_another" && (
            <GeorgeBubble>
              <p className="text-[13px] mb-3" style={{ color: navy }}>
                Great! Is there anything else I can help with?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setQuestion(""); setStep({ type: "waiting_question" }); }}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all hover:bg-gray-50"
                  style={{ borderColor: vars.g200, color: navy }}
                >
                  Ask another question
                </button>
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white transition-all hover:brightness-110"
                  style={{ background: teal }}
                >
                  All done
                </button>
              </div>
            </GeorgeBubble>
          )}

          {step.type === "no_match" && (
            <GeorgeBubble>
              <p className="text-[13px] leading-relaxed" style={{ color: navy }}>
                I don't have an answer for that in my knowledge base yet. Let me connect you with the support team — they'll get back to you shortly.
              </p>
            </GeorgeBubble>
          )}

          {(step.type === "no_match" || (step.type === "faq_result" && helpfulVote === "no")) && (
            <TicketForm
              category={ticketCategory}
              subject={ticketSubject}
              description={ticketDescription}
              attachment={ticketAttachment}
              error={ticketError}
              submitting={submitting}
              fileRef={fileRef}
              onCategory={setTicketCategory}
              onSubject={setTicketSubject}
              onDescription={setTicketDescription}
              onAttachment={setTicketAttachment}
              onSubmit={handleSubmitTicket}
              navy={navy}
              accent={accent}
              teal={teal}
            />
          )}

          {step.type === "ticket_form" && (
            <TicketForm
              category={ticketCategory}
              subject={ticketSubject}
              description={ticketDescription}
              attachment={ticketAttachment}
              error={ticketError}
              submitting={submitting}
              fileRef={fileRef}
              onCategory={setTicketCategory}
              onSubject={setTicketSubject}
              onDescription={setTicketDescription}
              onAttachment={setTicketAttachment}
              onSubmit={handleSubmitTicket}
              navy={navy}
              accent={accent}
              teal={teal}
            />
          )}

          {step.type === "ticket_success" && (
            <GeorgeBubble>
              <div className="flex items-start gap-2 mb-2">
                <CheckCircle2 size={18} style={{ color: "#22c55e" }} className="flex-shrink-0 mt-0.5" />
                <p className="text-[14px] font-semibold" style={{ color: navy }}>
                  Ticket #{step.ticket.id} submitted!
                </p>
              </div>
              <p className="text-[13px] leading-relaxed" style={{ color: vars.g500 }}>
                We've received your request and will get back to you by email. Reference number:{" "}
                <strong style={{ color: navy }}>#{step.ticket.id}</strong>.
              </p>
              <button
                onClick={onClose}
                className="mt-3 px-4 py-2 rounded-lg text-[12px] font-semibold text-white transition-all hover:brightness-110"
                style={{ background: teal }}
              >
                Close
              </button>
            </GeorgeBubble>
          )}
        </div>

        {/* Input bar — shown when waiting for a question */}
        {(step.type === "greeting" || step.type === "waiting_question") && (
          <div
            className="flex-shrink-0 border-t px-4 py-3 flex gap-2 items-center"
            style={{ borderColor: vars.g200 }}
          >
            <input
              ref={inputRef}
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                if (step.type === "greeting") setStep({ type: "waiting_question" });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleAskQuestion(); }
              }}
              placeholder="Type your question…"
              className="flex-1 text-[13px] px-3 py-2 rounded-lg border outline-none focus:ring-2"
              style={{
                borderColor: vars.g200,
                color: navy,
                ["--tw-ring-color" as string]: teal,
              }}
            />
            <button
              onClick={() => void handleAskQuestion()}
              disabled={!question.trim()}
              className="p-2.5 rounded-lg text-white transition-all disabled:opacity-40 hover:brightness-110"
              style={{ background: teal }}
            >
              <Send size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function GeorgeBubble({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl rounded-tl-sm px-4 py-3"
      style={{ background: "#f0f9fb", border: "1px solid #d0edf3" }}
    >
      {children}
    </div>
  );
}

function TicketForm({
  category, subject, description, attachment, error, submitting, fileRef,
  onCategory, onSubject, onDescription, onAttachment, onSubmit,
  navy, accent, teal,
}: {
  category: string;
  subject: string;
  description: string;
  attachment: { name: string; dataUrl: string } | null;
  error: string | null;
  submitting: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onCategory: (v: string) => void;
  onSubject: (v: string) => void;
  onDescription: (v: string) => void;
  onAttachment: (v: { name: string; dataUrl: string } | null) => void;
  onSubmit: () => void;
  navy: string;
  accent: string;
  teal: string;
}) {
  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-3"
      style={{ background: "#fef9fb", border: `1px solid ${accent}30` }}
    >
      <p className="text-[13px] font-semibold" style={{ color: navy }}>
        Submit a support ticket
      </p>

      {/* Category */}
      <div className="relative">
        <select
          value={category}
          onChange={(e) => onCategory(e.target.value)}
          className="w-full text-[12px] px-3 py-2 rounded-lg border appearance-none pr-8"
          style={{ borderColor: vars.g200, color: navy, background: "white" }}
        >
          {["General", "Getting Started", "Project Set-Up", "LLM Check / Earned Media Audit",
            "Technical GEO / Website Audit", "Content Creator", "Content Optimiser", "Comms Planner",
            "Media Research & Media Database", "Archive & Reports", "Account & Access Management",
            "Bug / Technical Issue"].map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: vars.g400 }} />
      </div>

      {/* Subject */}
      <input
        value={subject}
        onChange={(e) => onSubject(e.target.value)}
        placeholder="Subject *"
        className="text-[12px] px-3 py-2 rounded-lg border outline-none focus:ring-1"
        style={{ borderColor: vars.g200, color: navy }}
      />

      {/* Description */}
      <textarea
        value={description}
        onChange={(e) => onDescription(e.target.value)}
        placeholder="Describe the issue or question in detail… *"
        rows={4}
        className="text-[12px] px-3 py-2 rounded-lg border outline-none resize-none focus:ring-1"
        style={{ borderColor: vars.g200, color: navy }}
      />

      {/* Optional screenshot/file attachment (stored as base64 data-URL, max 512 KB) */}
      <div>
        <input
          type="file"
          ref={fileRef}
          accept="image/*,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            if (!file) { onAttachment(null); return; }
            const reader = new FileReader();
            reader.onload = () => {
              onAttachment({ name: file.name, dataUrl: reader.result as string });
            };
            reader.readAsDataURL(file);
          }}
        />
        <button
          type="button"
          onClick={() => { if (attachment) { onAttachment(null); if (fileRef.current) fileRef.current.value = ""; } else fileRef.current?.click(); }}
          className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
          style={{ borderColor: vars.g200, color: attachment ? "#16a34a" : vars.g500 }}
        >
          <Paperclip size={12} />
          {attachment ? `${attachment.name} (click to remove)` : "Attach screenshot (optional, max 512 KB)"}
        </button>
      </div>

      {error && (
        <p className="text-[12px] px-2 py-1.5 rounded-lg" style={{ color: "#dc2626", background: "#fef2f2" }}>
          {error}
        </p>
      )}

      <button
        onClick={onSubmit}
        disabled={submitting || !subject.trim() || !description.trim()}
        className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-semibold text-white transition-all disabled:opacity-40 hover:brightness-110"
        style={{ background: accent }}
      >
        {submitting && <Loader2 size={13} className="animate-spin" />}
        {submitting ? "Submitting…" : "Submit ticket"}
      </button>
    </div>
  );
}

// Persistent trigger button shown in the app nav / sidebar footer
export function GeorgeTriggerButton({
  onClick,
  hasUpdate,
}: {
  onClick: () => void;
  hasUpdate?: boolean;
}) {
  const accent = vars.accent ?? "#C8497A";
  return (
    <button
      onClick={onClick}
      title="Ask George — Support Assistant"
      className="relative flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all hover:brightness-110 active:scale-95"
      style={{ background: accent, color: "white" }}
    >
      <MessageCircle size={15} />
      <span>Ask George</span>
      {hasUpdate && (
        <span
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center"
          style={{ background: "#ef4444", color: "white" }}
        >
          1
        </span>
      )}
    </button>
  );
}
