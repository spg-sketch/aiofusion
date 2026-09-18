import { useState } from "react";
import { AlertCircle, CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import MarketingPage from "./MarketingPage";
import { PageHead } from "./PageHead";
import { PAGE_META } from "./pageMeta";
import { vars } from "./vars";

type RequestType = "access" | "correction" | "objection" | "removal";

export default function JournalistPrivacyPage(props: {
  onLogin: () => void; onBack: () => void; onNavigate: (v: string) => void; isAuthed?: boolean;
}) {
  const [kind, setKind] = useState<RequestType>("removal");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [outlet, setOutlet] = useState("");
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending"); setError("");
    try {
      const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
      const response = await fetch(`${base}api/journalist-privacy/requests`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestType: kind, name, email, outlet, details }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "We could not receive your request.");
      setStatus("sent");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not receive your request. Please email us instead.");
      setStatus("error");
    }
  }

  return (
    <MarketingPage title="Journalist privacy rights" eyebrow={<><ShieldCheck size={12} /> Media privacy</>} {...props}>
      <PageHead meta={PAGE_META["journalist-privacy"]} />
      <div className="space-y-8">
        <div className="rounded-2xl border bg-white p-6 sm:p-8" style={{ borderColor: vars.g200 }}>
          <p className="text-[16px] leading-[1.8]" style={{ color: vars.g500 }}>
            AIO Fusion processes professional media contact information to help communications teams research relevant
            journalists and publications. This may include names, roles, work contact details, beats, outlet information,
            public source links and provenance. Sources can include public publication pages, supplied datasets and
            workspace research. We do not publish a public lookup or disclose whether a person appears in our records.
          </p>
          <div className="grid gap-5 sm:grid-cols-2 mt-7 text-[14px] leading-[1.7]" style={{ color: vars.g500 }}>
            <div><h2 className="font-semibold" style={{ color: vars.navy }}>Your choices</h2><p>Ask us to access, correct, object to processing, or remove professional information. We may need proportionate verification before disclosing or changing information.</p></div>
            <div><h2 className="font-semibold" style={{ color: vars.navy }}>What happens next</h2><p>Requests are reviewed by an authorised privacy owner. We aim to respond within one calendar month. A request does not itself confirm that a record exists or change any data.</p></div>
            <div><h2 className="font-semibold" style={{ color: vars.navy }}>Sharing and retention</h2><p>Shared reference data and workspace research can have different owners and scopes. We retain a minimal case history to evidence decisions; any lawful retention exception is assessed and recorded.</p></div>
            <div><h2 className="font-semibold" style={{ color: vars.navy }}>Alternative contact</h2><p>You can email <a className="underline" style={{ color: vars.accent }} href="mailto:info@aiofusion.ai?subject=Journalist%20privacy%20rights">info@aiofusion.ai</a>. Please do not send identity documents by email.</p></div>
          </div>
        </div>
        <div className="rounded-2xl border bg-white p-6 sm:p-8" style={{ borderColor: vars.g200 }}>
          <h2 className="text-[24px] mb-2" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Make a privacy request</h2>
          <p className="text-[13px] mb-6" style={{ color: vars.g500 }}>Please provide enough context for us to review your request. We will not use this form to confirm whether a named person or email is in our database.</p>
          {status === "sent" ? (
            <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-xl p-5" style={{ background: "rgba(61,155,107,.1)", color: vars.navy }}>
              <CheckCircle2 className="shrink-0" color="#3D9B6B" /><p>Thank you. Your request has been received. This neutral confirmation does not indicate whether the information you named is held. We will contact you if further verification is needed.</p>
            </div>
          ) : <form onSubmit={submit} className="space-y-5">
            <div><label className="block text-[13px] font-semibold mb-1" htmlFor="journalist-right-type">Request type</label><select id="journalist-right-type" value={kind} onChange={(e) => setKind(e.target.value as RequestType)} className="w-full rounded-xl border px-4 py-3" style={{ borderColor: vars.g200 }}><option value="access">Access / information</option><option value="correction">Correction</option><option value="objection">Object to processing</option><option value="removal">Removal</option></select></div>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="text-[13px] font-semibold">Your name<input required maxLength={160} value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-xl border px-4 py-3 font-normal" style={{ borderColor: vars.g200 }} /></label>
              <label className="text-[13px] font-semibold">Reply email<input required type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-xl border px-4 py-3 font-normal" style={{ borderColor: vars.g200 }} /></label>
            </div>
            <label className="block text-[13px] font-semibold">Publication or outlet <span className="font-normal" style={{ color: vars.g400 }}>(optional)</span><input maxLength={180} value={outlet} onChange={(e) => setOutlet(e.target.value)} className="mt-1 w-full rounded-xl border px-4 py-3 font-normal" style={{ borderColor: vars.g200 }} /></label>
            <label className="block text-[13px] font-semibold">Details<textarea required maxLength={4000} rows={5} value={details} onChange={(e) => setDetails(e.target.value)} className="mt-1 w-full resize-y rounded-xl border px-4 py-3 font-normal" style={{ borderColor: vars.g200 }} placeholder="Tell us what you would like us to review." /></label>
            {status === "error" && <div role="alert" className="flex gap-2 rounded-xl p-3 text-[13px]" style={{ color: "#b91c1c", background: "#fef2f2" }}><AlertCircle size={16} />{error}</div>}
            <button disabled={status === "sending"} className="rounded-xl px-5 py-3 text-[14px] font-semibold text-white disabled:opacity-50" style={{ background: vars.accent }}>{status === "sending" ? "Sending…" : "Send privacy request"}</button>
          </form>}
        </div>
        <a className="inline-flex items-center gap-2 text-[14px] underline" style={{ color: vars.accent }} href="mailto:info@aiofusion.ai?subject=Journalist%20privacy%20rights"><Mail size={16} /> Email the privacy team instead</a>
      </div>
    </MarketingPage>
  );
}