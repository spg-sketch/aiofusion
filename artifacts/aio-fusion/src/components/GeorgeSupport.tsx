import { useState, useEffect, useRef } from "react";
import { X, MessageCircle, Send, CheckCircle2, AlertCircle, Loader2, ChevronDown, Paperclip, ArrowLeft, Clock, InboxIcon } from "lucide-react";
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

type TicketFull = {
  id: number;
  subject: string;
  status: string;
  category: string;
  createdAt: string;
  hasAdminReply: boolean;
  userSeenReply: boolean;
};

type TicketMessage = {
  id: number;
  ticketId: number;
  authorType: "user" | "admin";
  authorUsername: string;
  body: string;
  createdAt: string;
};

type ChatStep =
  | { type: "greeting" }
  | { type: "waiting_question" }
  | { type: "searching" }
  | { type: "faq_options"; entries: FaqEntry[] }
  | { type: "faq_result"; entry: FaqEntry }
  | { type: "not_helpful" }
  | { type: "no_match" }
  | { type: "ticket_form" }
  | { type: "ticket_success"; ticket: Ticket }
  | { type: "ask_another" }
  | { type: "my_tickets_loading" }
  | { type: "my_tickets"; tickets: TicketFull[] }
  | { type: "ticket_detail_loading"; ticketId: number }
  | { type: "ticket_detail"; ticket: TicketFull; messages: TicketMessage[] };

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
  anonMode = false,
}: {
  open: boolean;
  onClose: () => void;
  userName?: string;
  anonMode?: boolean;
}) {
  const [step, setStep] = useState<ChatStep>({ type: "greeting" });
  const [question, setQuestion] = useState("");
  const [helpfulVote, setHelpfulVote] = useState<"yes" | "no" | null>(null);

  // Ticket form state
  const [ticketCategory, setTicketCategory] = useState("General");
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketDescription, setTicketDescription] = useState("");
  const [ticketEmail, setTicketEmail] = useState("");
  const [ticketAttachment, setTicketAttachment] = useState<{ name: string; dataUrl: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);

  // Reply state (used in ticket_detail view)
  const [replyText, setReplyText] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const [hasUpdate, setHasUpdate] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);

  // Check for pending ticket updates on open (authenticated mode only)
  useEffect(() => {
    if (!open || anonMode) return;
    void fetch(`${apiBase()}/api/support/tickets?mine=true&hasUpdate=true`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((d: { tickets?: unknown[] }) => {
        setHasUpdate(Array.isArray(d.tickets) && d.tickets.length > 0);
      })
      .catch(() => {});
  }, [open, anonMode]);

  // Reset to greeting on close
  useEffect(() => {
    if (!open) {
      setStep({ type: "greeting" });
      setQuestion("");
      setHelpfulVote(null);
      setTicketSubject("");
      setTicketDescription("");
      setTicketCategory("General");
      setTicketEmail("");
      setTicketAttachment(null);
      setTicketError(null);
      setReplyText("");
      setReplyError(null);
    }
  }, [open]);

  // Focus input when step changes
  useEffect(() => {
    if (step.type === "waiting_question") {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [step.type]);

  // Scroll thread to bottom and focus reply input when detail view loads
  useEffect(() => {
    if (step.type === "ticket_detail") {
      setTimeout(() => {
        threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
        if (step.ticket.status === "open" || step.ticket.status === "in_progress") {
          replyInputRef.current?.focus();
        }
      }, 50);
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
      const results = data.faq ?? [];
      if (results.length === 0) {
        setStep({ type: "no_match" });
      } else if (results.length === 1) {
        // Only one match — go straight to the answer
        setStep({ type: "faq_result", entry: results[0] });
      } else {
        // Multiple matches — let the user pick the most relevant one
        setStep({ type: "faq_options", entries: results });
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
      const endpoint = anonMode
        ? `${apiBase()}/api/support/tickets/anon`
        : `${apiBase()}/api/support/tickets`;
      const body: Record<string, string> = {
        category: ticketCategory,
        subject: ticketSubject.trim(),
        description: ticketDescription.trim(),
      };
      if (anonMode && ticketEmail.trim()) body.email = ticketEmail.trim();
      if (ticketAttachment) body.attachmentUrl = ticketAttachment.dataUrl;
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
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

  async function handleViewMyTickets() {
    setStep({ type: "my_tickets_loading" });
    try {
      const r = await fetch(`${apiBase()}/api/support/tickets?mine=true`, {
        credentials: "include",
      });
      const data = (await r.json()) as { tickets?: TicketFull[] };
      setStep({ type: "my_tickets", tickets: data.tickets ?? [] });
    } catch {
      setStep({ type: "my_tickets", tickets: [] });
    }
  }

  async function handleViewTicket(ticket: TicketFull) {
    setReplyText("");
    setReplyError(null);
    setStep({ type: "ticket_detail_loading", ticketId: ticket.id });
    try {
      const r = await fetch(`${apiBase()}/api/support/tickets/${ticket.id}/messages`, {
        credentials: "include",
      });
      const data = (await r.json()) as { messages?: TicketMessage[] };
      setStep({ type: "ticket_detail", ticket, messages: data.messages ?? [] });

      // Mark as seen if there's an unread admin reply
      if (ticket.hasAdminReply && !ticket.userSeenReply) {
        void fetch(`${apiBase()}/api/support/tickets/${ticket.id}/seen`, {
          method: "POST",
          credentials: "include",
        }).then(() => {
          // Refresh the update badge
          return fetch(`${apiBase()}/api/support/tickets?mine=true&hasUpdate=true`, {
            credentials: "include",
          });
        }).then((r) => r.json())
          .then((d: { tickets?: unknown[] }) => {
            const stillHasUpdate = Array.isArray(d.tickets) && d.tickets.length > 0;
            setHasUpdate(stillHasUpdate);
            // Notify the sidebar trigger button so it clears without a page reload
            window.dispatchEvent(
              new CustomEvent("aio:george-updates-changed", {
                detail: { hasUpdate: stillHasUpdate },
              }),
            );
          })
          .catch(() => {});
      }
    } catch {
      // Fall back to showing ticket with no messages
      setStep({ type: "ticket_detail", ticket, messages: [] });
    }
  }

  async function handleSendReply() {
    if (step.type !== "ticket_detail") return;
    if (replySubmitting) return;
    const body = replyText.trim();
    if (!body) return;
    setReplySubmitting(true);
    setReplyError(null);
    try {
      const r = await fetch(`${apiBase()}/api/support/tickets/${step.ticket.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body }),
      });
      const data = (await r.json()) as { message?: TicketMessage; error?: string };
      if (!r.ok || !data.message) {
        setReplyError(data.error ?? "Failed to send reply. Please try again.");
        return;
      }
      // Append to thread immediately and clear input
      setStep({
        type: "ticket_detail",
        ticket: step.ticket,
        messages: [...step.messages, data.message],
      });
      setReplyText("");
      setTimeout(() => threadEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch {
      setReplyError("Failed to send reply. Please try again.");
    } finally {
      setReplySubmitting(false);
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
          {/* Back button for sub-views */}
          {(step.type === "my_tickets" || step.type === "my_tickets_loading" || step.type === "ticket_detail" || step.type === "ticket_detail_loading") && (
            <button
              onClick={() => {
                if (step.type === "ticket_detail" || step.type === "ticket_detail_loading") {
                  void handleViewMyTickets();
                } else {
                  setStep({ type: "greeting" });
                }
              }}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
              title="Back"
            >
              <ArrowLeft size={15} />
            </button>
          )}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
            style={{ background: accent }}
          >
            G
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold">
              {step.type === "my_tickets" || step.type === "my_tickets_loading"
                ? "My Tickets"
                : step.type === "ticket_detail" || step.type === "ticket_detail_loading"
                ? "Ticket Thread"
                : "George"}
            </p>
            <p className="text-[11px] opacity-70">GEO Support Assistant</p>
          </div>
          {hasUpdate && step.type !== "ticket_detail" && (
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

          {/* ── My Tickets loading ── */}
          {step.type === "my_tickets_loading" && (
            <GeorgeBubble>
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" style={{ color: teal }} />
                <span className="text-[13px]" style={{ color: vars.g500 }}>Loading your tickets…</span>
              </div>
            </GeorgeBubble>
          )}

          {/* ── My Tickets list ── */}
          {step.type === "my_tickets" && (
            <>
              {step.tickets.length === 0 ? (
                <GeorgeBubble>
                  <div className="flex flex-col items-center gap-2 py-2 text-center">
                    <InboxIcon size={28} style={{ color: vars.g300 ?? "#d1d5db" }} />
                    <p className="text-[13px]" style={{ color: navy }}>You haven't submitted any tickets yet.</p>
                    <button
                      onClick={() => setStep({ type: "ticket_form" })}
                      className="mt-1 px-4 py-2 rounded-lg text-[12px] font-semibold text-white transition-all hover:brightness-110"
                      style={{ background: teal }}
                    >
                      Submit a ticket
                    </button>
                  </div>
                </GeorgeBubble>
              ) : (
                <div className="flex flex-col gap-2">
                  {step.tickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      onClick={() => void handleViewTicket(ticket)}
                      className="w-full text-left rounded-2xl px-4 py-3 transition-all hover:brightness-95 active:scale-[0.99]"
                      style={{ background: "#f0f9fb", border: "1px solid #d0edf3" }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            {ticket.hasAdminReply && !ticket.userSeenReply && (
                              <span
                                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                                style={{ background: accent }}
                                title="New reply"
                              />
                            )}
                            <p className="text-[13px] font-semibold truncate" style={{ color: navy }}>
                              {ticket.subject}
                            </p>
                          </div>
                          <p className="text-[11px]" style={{ color: vars.g500 }}>
                            #{ticket.id} · {ticket.category}
                          </p>
                        </div>
                        <TicketStatusBadge status={ticket.status} accent={accent} teal={teal} />
                      </div>
                      <div className="flex items-center gap-1 mt-1.5">
                        <Clock size={10} style={{ color: vars.g400 }} />
                        <span className="text-[10px]" style={{ color: vars.g400 }}>
                          {formatDate(ticket.createdAt)}
                        </span>
                        {ticket.hasAdminReply && !ticket.userSeenReply && (
                          <span
                            className="ml-1 text-[10px] font-semibold"
                            style={{ color: accent }}
                          >
                            · New reply
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                  <button
                    onClick={() => setStep({ type: "ticket_form" })}
                    className="w-full py-2.5 rounded-xl text-[12px] font-semibold border transition-all hover:bg-gray-50"
                    style={{ borderColor: vars.g200, color: navy }}
                  >
                    + Submit a new ticket
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── Ticket detail loading ── */}
          {step.type === "ticket_detail_loading" && (
            <GeorgeBubble>
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" style={{ color: teal }} />
                <span className="text-[13px]" style={{ color: vars.g500 }}>Loading thread…</span>
              </div>
            </GeorgeBubble>
          )}

          {/* ── Ticket detail thread ── */}
          {step.type === "ticket_detail" && (
            <>
              {/* Ticket meta */}
              <div
                className="rounded-xl px-4 py-3"
                style={{ background: "#f8f8fa", border: `1px solid ${vars.g200}` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold" style={{ color: navy }}>
                      {step.ticket.subject}
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: vars.g500 }}>
                      #{step.ticket.id} · {step.ticket.category} · {formatDate(step.ticket.createdAt)}
                    </p>
                  </div>
                  <TicketStatusBadge status={step.ticket.status} accent={accent} teal={teal} />
                </div>
              </div>

              {/* Messages */}
              {step.messages.length === 0 ? (
                <GeorgeBubble>
                  <p className="text-[13px]" style={{ color: vars.g500 }}>
                    No messages yet — we'll be in touch soon.
                  </p>
                </GeorgeBubble>
              ) : (
                <div className="flex flex-col gap-3">
                  {step.messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} navy={navy} accent={accent} teal={teal} />
                  ))}
                </div>
              )}
              <div ref={threadEndRef} />
            </>
          )}

          {/* ── Standard chat flow ── */}
          {(step.type === "greeting" || step.type === "waiting_question" || step.type === "searching" ||
            step.type === "faq_options" || step.type === "faq_result" || step.type === "not_helpful" ||
            step.type === "no_match" || step.type === "ticket_form" || step.type === "ticket_success" ||
            step.type === "ask_another") && (
            <>
              {/* George greeting bubble */}
              <GeorgeBubble>
                <p className="text-[14px] leading-relaxed" style={{ color: navy }}>
                  Hi{userName ? ` ${userName}` : ""}! I'm <strong>George</strong> — your GEO support assistant.{" "}
                  What can I help you with today?
                </p>
              </GeorgeBubble>

              {/* My tickets CTA on greeting — hidden in anon/unauthenticated mode */}
              {step.type === "greeting" && !anonMode && (
                <div className="flex gap-2">
                  {hasUpdate ? (
                    <button
                      onClick={() => void handleViewMyTickets()}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold text-white transition-all hover:brightness-110"
                      style={{ background: accent }}
                    >
                      <MessageCircle size={13} />
                      View new reply
                    </button>
                  ) : (
                    <button
                      onClick={() => void handleViewMyTickets()}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold border transition-all hover:bg-gray-50"
                      style={{ borderColor: vars.g200, color: navy }}
                    >
                      <InboxIcon size={13} />
                      My tickets
                    </button>
                  )}
                </div>
              )}

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

              {step.type === "faq_options" && (
                <GeorgeBubble>
                  <p className="text-[13px] mb-3" style={{ color: navy }}>
                    I found a few articles that might help — which one looks closest to your question?
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {step.entries.map((entry) => (
                      <button
                        key={entry.id}
                        onClick={() => { setHelpfulVote(null); setStep({ type: "faq_result", entry }); }}
                        className="text-left px-3 py-2.5 rounded-lg border transition-all hover:bg-gray-50 group"
                        style={{ borderColor: vars.g200 }}
                      >
                        <span className="block text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: vars.g400 }}>
                          {entry.category}
                        </span>
                        <span className="block text-[13px] font-medium leading-snug group-hover:underline" style={{ color: navy }}>
                          {entry.question}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => { setQuestion(""); setStep({ type: "waiting_question" }); }}
                    className="mt-3 text-[12px]"
                    style={{ color: vars.g400 }}
                  >
                    None of these — try a different question
                  </button>
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
                          onClick={() => { setHelpfulVote("no"); setStep({ type: "not_helpful" }); }}
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

              {step.type === "not_helpful" && (
                <GeorgeBubble>
                  <p className="text-[13px] mb-3" style={{ color: navy }}>
                    Sorry that didn't quite hit the mark. Would you like to try asking a different way, or shall I raise a support ticket for you?
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => { setHelpfulVote(null); setQuestion(""); setStep({ type: "waiting_question" }); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all hover:bg-gray-50"
                      style={{ borderColor: vars.g200, color: navy }}
                    >
                      Try a different question
                    </button>
                    <button
                      onClick={() => setStep({ type: "ticket_form" })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white transition-all hover:brightness-110"
                      style={{ background: accent }}
                    >
                      Raise a support ticket
                    </button>
                  </div>
                </GeorgeBubble>
              )}

              {step.type === "no_match" && (
                <GeorgeBubble>
                  <p className="text-[13px] mb-3" style={{ color: navy }}>
                    I don't have an answer for that in my knowledge base yet. Want to try rephrasing the question, or would you prefer to raise a support ticket?
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => { setQuestion(""); setStep({ type: "waiting_question" }); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all hover:bg-gray-50"
                      style={{ borderColor: vars.g200, color: navy }}
                    >
                      Try a different question
                    </button>
                    <button
                      onClick={() => setStep({ type: "ticket_form" })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white transition-all hover:brightness-110"
                      style={{ background: accent }}
                    >
                      Raise a support ticket
                    </button>
                  </div>
                </GeorgeBubble>
              )}

              {step.type === "ticket_form" && (
                <TicketForm
                  category={ticketCategory}
                  subject={ticketSubject}
                  description={ticketDescription}
                  email={anonMode ? ticketEmail : undefined}
                  attachment={ticketAttachment}
                  error={ticketError}
                  submitting={submitting}
                  fileRef={fileRef}
                  onCategory={setTicketCategory}
                  onSubject={setTicketSubject}
                  onDescription={setTicketDescription}
                  onEmail={anonMode ? setTicketEmail : undefined}
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
                    {anonMode
                      ? "We've received your request. If you provided an email, we'll be in touch. Reference number: "
                      : "We've received your request and will get back to you by email. Reference number: "}
                    <strong style={{ color: navy }}>#{step.ticket.id}</strong>.
                  </p>
                  <div className="flex gap-2 mt-3">
                    {!anonMode && (
                      <button
                        onClick={() => void handleViewMyTickets()}
                        className="px-4 py-2 rounded-lg text-[12px] font-semibold border transition-all hover:bg-gray-50"
                        style={{ borderColor: vars.g200, color: navy }}
                      >
                        View my tickets
                      </button>
                    )}
                    <button
                      onClick={onClose}
                      className="px-4 py-2 rounded-lg text-[12px] font-semibold text-white transition-all hover:brightness-110"
                      style={{ background: teal }}
                    >
                      Close
                    </button>
                  </div>
                </GeorgeBubble>
              )}
            </>
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

        {/* Reply bar — shown in ticket_detail when ticket is open or in_progress */}
        {step.type === "ticket_detail" && (step.ticket.status === "open" || step.ticket.status === "in_progress") && (
          <div
            className="flex-shrink-0 border-t px-4 py-3 flex flex-col gap-2"
            style={{ borderColor: vars.g200 }}
          >
            {replyError && (
              <p className="text-[11px] px-2 py-1 rounded-lg" style={{ color: "#dc2626", background: "#fef2f2" }}>
                {replyError}
              </p>
            )}
            <div className="flex gap-2 items-end">
              <textarea
                ref={replyInputRef}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSendReply(); }
                }}
                placeholder="Reply to this ticket…"
                rows={2}
                className="flex-1 text-[13px] px-3 py-2 rounded-lg border outline-none focus:ring-2 resize-none"
                style={{
                  borderColor: vars.g200,
                  color: navy,
                  ["--tw-ring-color" as string]: teal,
                }}
              />
              <button
                onClick={() => void handleSendReply()}
                disabled={!replyText.trim() || replySubmitting}
                className="p-2.5 rounded-lg text-white transition-all disabled:opacity-40 hover:brightness-110 flex-shrink-0"
                style={{ background: teal }}
                title="Send reply"
              >
                {replySubmitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
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

function MessageBubble({
  message,
  navy,
  accent,
  teal,
}: {
  message: TicketMessage;
  navy: string;
  accent: string;
  teal: string;
}) {
  const isAdmin = message.authorType === "admin";
  return (
    <div className={`flex flex-col gap-1 ${isAdmin ? "" : "items-end"}`}>
      <div
        className="max-w-[85%] rounded-2xl px-4 py-3"
        style={
          isAdmin
            ? { background: "#f0f9fb", border: "1px solid #d0edf3" }
            : { background: navy, color: "white" }
        }
      >
        <p
          className="text-[11px] font-semibold mb-1"
          style={{ color: isAdmin ? teal : "rgba(255,255,255,0.65)" }}
        >
          {isAdmin ? "Support Team" : "You"}
        </p>
        <p
          className="text-[13px] leading-relaxed whitespace-pre-wrap"
          style={{ color: isAdmin ? navy : "white" }}
        >
          {message.body}
        </p>
      </div>
      <p className="text-[10px] px-1" style={{ color: vars.g400 }}>
        {formatDate(message.createdAt)}
      </p>
    </div>
  );
}

function TicketStatusBadge({
  status,
  accent,
  teal,
}: {
  status: string;
  accent: string;
  teal: string;
}) {
  const cfg: Record<string, { label: string; bg: string; color: string }> = {
    open: { label: "Open", bg: "#f0fdf4", color: "#16a34a" },
    in_progress: { label: "In progress", bg: "#eff6ff", color: teal },
    closed: { label: "Closed", bg: "#f3f4f6", color: "#6b7280" },
    resolved: { label: "Resolved", bg: "#f3f4f6", color: "#6b7280" },
  };
  const c = cfg[status] ?? { label: status, bg: "#f3f4f6", color: "#6b7280" };
  return (
    <span
      className="flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: c.bg, color: c.color }}
    >
      {c.label}
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function TicketForm({
  category, subject, description, email, attachment, error, submitting, fileRef,
  onCategory, onSubject, onDescription, onEmail, onAttachment, onSubmit,
  navy, accent, teal,
}: {
  category: string;
  subject: string;
  description: string;
  email?: string;
  attachment: { name: string; dataUrl: string } | null;
  error: string | null;
  submitting: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onCategory: (v: string) => void;
  onSubject: (v: string) => void;
  onDescription: (v: string) => void;
  onEmail?: (v: string) => void;
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

      {/* Email — shown only in anon/pre-login mode */}
      {onEmail !== undefined && (
        <input
          type="email"
          value={email ?? ""}
          onChange={(e) => onEmail(e.target.value)}
          placeholder="Your email (optional — so we can reply)"
          className="text-[12px] px-3 py-2 rounded-lg border outline-none focus:ring-1"
          style={{ borderColor: vars.g200, color: navy }}
        />
      )}

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
