import { useState } from "react";
import { Mail, Users, BookOpen, ArrowUpRight, Calendar, MessageSquare, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import MarketingPage from "./MarketingPage";
import { PageHead } from "./PageHead";
import { PAGE_META } from "./pageMeta";
import { vars } from "./vars";
import HeardAboutField, { hasHeardAboutDetail } from "./HeardAboutField";

const NAVY = "#102B36";
const RASPBERRY = vars.accent;
const CREAM = "#FBF6EC";
const CREAM_DEEP = "#e2e8f0";

interface FieldProps {
  label: string;
  id: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}

function Field({ label, id, required, children, hint }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold" style={{ color: NAVY }}>
        {label}
        {required && <span style={{ color: RASPBERRY }}> *</span>}
      </label>
      {children}
      {hint && <p className="text-[12px]" style={{ color: vars.g600 }}>{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border px-4 py-3 text-[14px] outline-none transition-all " +
  "focus:ring-2 focus:ring-offset-0 bg-white";
const inputStyle = { borderColor: vars.fieldBorder, color: NAVY };
const inputFocusCls = "focus:ring-[#A52F60]";

export function BookDemoForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [goal, setGoal] = useState("");
  const [heardAbout, setHeardAbout] = useState("");
  const [heardAboutDetail, setHeardAboutDetail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/contact/book-demo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, company, goal,
          ...(heardAbout ? { heardAbout, heardAboutDetail: hasHeardAboutDetail(heardAbout) ? heardAboutDetail.trim() : "" } : {}),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      setStatus("success");
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div
        className="flex flex-col items-center gap-4 py-12 text-center"
        role="status"
        aria-live="polite"
      >
        <div className="w-16 h-16 rounded-full flex items-center justify-center"
             style={{ background: "rgba(200,73,122,0.1)" }}>
          <CheckCircle size={32} color={RASPBERRY} />
        </div>
        <h3 className="text-[20px] font-semibold" style={{ fontFamily: "'Alice', Georgia, serif", color: NAVY }}>
          Request received
        </h3>
        <p className="text-[15px] max-w-xs" style={{ color: vars.g500 }}>
          We'll be in touch within one business day to arrange a time that works for you.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="Your name" id="book-demo-name" required>
          <input
            id="book-demo-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Smith"
            required
            className={`${inputCls} ${inputFocusCls}`}
            style={inputStyle}
          />
        </Field>
        <Field label="Work email" id="book-demo-email" required>
          <input
            id="book-demo-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@company.com"
            required
            className={`${inputCls} ${inputFocusCls}`}
            style={inputStyle}
          />
        </Field>
      </div>
      <Field label="Company" id="book-demo-company" required>
        <input
          id="book-demo-company"
          type="text"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Your company name"
          required
          className={`${inputCls} ${inputFocusCls}`}
          style={inputStyle}
        />
      </Field>
      <Field
        label="What are you hoping to achieve?"
        id="book-demo-goal"
        required
        hint="Tell us about your goals so we can tailor the demo."
      >
        <textarea
          id="book-demo-goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="e.g. Improve AI visibility for our clients, track brand mentions in LLM outputs…"
          required
          rows={4}
          className={`${inputCls} ${inputFocusCls} resize-none`}
          style={inputStyle}
        />
      </Field>
      <HeardAboutField id="book-demo-heard-about" value={heardAbout} detail={heardAboutDetail}
        onChange={setHeardAbout} onDetailChange={setHeardAboutDetail} />
      {status === "error" && (
        <div
          className="flex items-start gap-2 p-3 rounded-xl text-[13px]"
          role="alert"
             style={{ background: "rgba(239,68,68,0.08)", color: "#b91c1c" }}>
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {errorMsg}
        </div>
      )}
      <button
        type="submit"
        disabled={status === "loading"}
        className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-[14px] font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ background: RASPBERRY }}
      >
        {status === "loading" ? (
          <><Loader2 size={16} className="animate-spin" /> Sending…</>
        ) : (
          <>Request a Demo</>
        )}
      </button>
    </form>
  );
}

export function EnquiryForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [heardAbout, setHeardAbout] = useState("");
  const [heardAboutDetail, setHeardAboutDetail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/contact/enquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, company, subject, message,
          ...(heardAbout ? { heardAbout, heardAboutDetail: hasHeardAboutDetail(heardAbout) ? heardAboutDetail.trim() : "" } : {}),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      setStatus("success");
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div
        className="flex flex-col items-center gap-4 py-12 text-center"
        role="status"
        aria-live="polite"
      >
        <div className="w-16 h-16 rounded-full flex items-center justify-center"
             style={{ background: "rgba(200,73,122,0.1)" }}>
          <CheckCircle size={32} color={RASPBERRY} />
        </div>
        <h3 className="text-[20px] font-semibold" style={{ fontFamily: "'Alice', Georgia, serif", color: NAVY }}>
          Message received
        </h3>
        <p className="text-[15px] max-w-xs" style={{ color: vars.g500 }}>
          A member of our team will get back to you as soon as possible.
          You can also reach us at{" "}
          <a href="mailto:info@aiofusion.ai" style={{ color: RASPBERRY }}>
            info@aiofusion.ai
          </a>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="Your name" id="enquiry-name" required>
          <input
            id="enquiry-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Smith"
            required
            className={`${inputCls} ${inputFocusCls}`}
            style={inputStyle}
          />
        </Field>
        <Field label="Work email" id="enquiry-email" required>
          <input
            id="enquiry-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@company.com"
            required
            className={`${inputCls} ${inputFocusCls}`}
            style={inputStyle}
          />
        </Field>
      </div>
      <Field label="Company" id="enquiry-company" hint="Optional">
        <input
          id="enquiry-company"
          type="text"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Your company name"
          className={`${inputCls} ${inputFocusCls}`}
          style={inputStyle}
        />
      </Field>
      <Field label="Subject" id="enquiry-subject" required>
        <input
          id="enquiry-subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="What's your enquiry about?"
          required
          className={`${inputCls} ${inputFocusCls}`}
          style={inputStyle}
        />
      </Field>
      <Field label="Message" id="enquiry-message" required>
        <textarea
          id="enquiry-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us more…"
          required
          rows={5}
          className={`${inputCls} ${inputFocusCls} resize-none`}
          style={inputStyle}
        />
      </Field>
      <HeardAboutField id="enquiry-heard-about" value={heardAbout} detail={heardAboutDetail}
        onChange={setHeardAbout} onDetailChange={setHeardAboutDetail} />
      {status === "error" && (
        <div
          className="flex items-start gap-2 p-3 rounded-xl text-[13px]"
          role="alert"
             style={{ background: "rgba(239,68,68,0.08)", color: "#b91c1c" }}>
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {errorMsg}
        </div>
      )}
      <button
        type="submit"
        disabled={status === "loading"}
        className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-[14px] font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ background: NAVY }}
      >
        {status === "loading" ? (
          <><Loader2 size={16} className="animate-spin" /> Sending…</>
        ) : (
          <>Send Message</>
        )}
      </button>
    </form>
  );
}

function SectionCard({
  icon,
  eyebrow,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border-2 bg-white overflow-hidden" style={{ borderColor: NAVY }}>
      <div className="px-8 pt-8 pb-6 border-b" style={{ borderColor: vars.g100 }}>
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
               style={{ background: "rgba(200,73,122,0.08)" }}>
            {icon}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] mb-1"
               style={{ color: RASPBERRY }}>
              {eyebrow}
            </p>
            <h2 className="text-[28px] font-semibold leading-tight mb-2"
                style={{ fontFamily: "'Alice', Georgia, serif", color: NAVY }}>
              {title}
            </h2>
            <p className="text-[14px] leading-[1.7]" style={{ color: vars.g500 }}>
              {description}
            </p>
          </div>
        </div>
      </div>
      <div className="px-8 py-8">{children}</div>
    </div>
  );
}

export default function ContactPage(props: { onLogin: () => void; onBack: () => void; onNavigate: (v: string) => void; isAuthed?: boolean }) {
  return (
    <MarketingPage
      title="Get in touch"
      eyebrow={<><Mail size={12} /> Contact</> as any}
      {...props}
    >
      <PageHead meta={PAGE_META.contact} />
      <p className="text-[16px] font-normal leading-[1.8] mb-10" style={{ color: vars.g600 }}>
        Book a demo or send us a message - we'd love to hear from you.
      </p>

      <div className="flex flex-col gap-8 mb-12">
        <SectionCard
          icon={<Calendar size={22} color={RASPBERRY} />}
          eyebrow="Book a Demo"
          title="See AIO Fusion in action"
          description="Get a personalised walkthrough of the platform. We'll show you how AIO Fusion helps you track, measure, and grow your brand's visibility in AI-generated answers."
        >
          <BookDemoForm />
        </SectionCard>

        <SectionCard
          icon={<MessageSquare size={22} color={NAVY} />}
          eyebrow="General Enquiry"
          title="Ask us anything"
          description="Have a question about pricing, how the platform works, or whether AIO Fusion is right for your team? Send us a message and we'll get back to you."
        >
          <EnquiryForm />
        </SectionCard>
      </div>

      <div className="space-y-3">
        <a
          href="mailto:info@aiofusion.ai"
          className="flex items-center gap-4 p-5 rounded-2xl border-2 bg-white transition-all hover:shadow-md"
          style={{ borderColor: NAVY }}
        >
          <div className="w-12 h-12 rounded-xl flex items-center justify-center"
               style={{ background: "rgba(31,116,143,0.08)" }}>
            <Mail size={20} color={vars.accent} />
          </div>
          <div className="flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em]" style={{ color: vars.g600 }}>Email</p>
            <p className="text-[16px] font-semibold" style={{ color: vars.navy }}>info@aiofusion.ai</p>
          </div>
          <ArrowUpRight size={18} color={vars.accent} />
        </a>
        <a
          href="https://www.linkedin.com/company/aio-fusion"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 p-5 rounded-2xl border-2 bg-white transition-all hover:shadow-md"
          style={{ borderColor: NAVY }}
        >
          <div className="w-12 h-12 rounded-xl flex items-center justify-center"
               style={{ background: "rgba(31,116,143,0.08)" }}>
            <Users size={20} color={vars.accent} />
          </div>
          <div className="flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em]" style={{ color: vars.g600 }}>LinkedIn</p>
            <p className="text-[16px] font-semibold" style={{ color: vars.navy }}>Follow AIO Fusion</p>
          </div>
          <ArrowUpRight size={18} color={vars.accent} />
        </a>
        <div
          className="flex items-center gap-4 p-5 rounded-2xl border-2 bg-white"
          style={{ borderColor: NAVY }}
        >
          <div className="w-12 h-12 rounded-xl flex items-center justify-center"
               style={{ background: "rgba(31,116,143,0.08)" }}>
            <BookOpen size={20} color={vars.accent} />
          </div>
          <div className="flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em]" style={{ color: vars.g600 }}>Substack</p>
            <p className="text-[16px] font-semibold" style={{ color: vars.navy }}>
              Subscribe to insights{" "}
              <span className="text-[12px] font-normal italic" style={{ color: vars.g600 }}>(coming soon)</span>
            </p>
          </div>
        </div>
      </div>
    </MarketingPage>
  );
}
