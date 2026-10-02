import { Linkedin } from "lucide-react";
import { vars } from "../marketing/vars";
import { MiniDonut } from "./shared";
import type { Recommendation } from "./JournalistComponents";

/** Research-only presentation; the stored contact and assessment stay intact. */
export function MediaResearchResultSummary({
  item,
  linkedinUrl,
  publicationUrl,
  emailHref,
  suggestedAngle,
}: {
  item: Recommendation;
  linkedinUrl: string | null;
  publicationUrl: string | null;
  emailHref: string | null;
  suggestedAngle?: string | null;
}) {
  const contact = item.contact;
  const name = [contact.firstName, contact.lastName].map((part) => part?.trim()).filter(Boolean).join(" ");
  const fit = item.assessment?.fitScore;
  const hasFit = typeof fit === "number" && Number.isFinite(fit) && fit >= 0 && fit <= 100;

  return (
    <div data-testid={`research-result-summary-${contact.id}`} className="flex flex-col sm:flex-row gap-5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-[18px] font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
            {name || "Contact name not recorded"}
          </h3>
          {linkedinUrl && (
            <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" title="LinkedIn" aria-label={`LinkedIn profile for ${name || "this contact"}`} className="text-blue-600 hover:text-blue-800">
              <Linkedin size={17} />
            </a>
          )}
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-[12px]">
          <div><dt className="text-slate-500">Job role</dt><dd className="font-medium text-slate-800">{contact.role || "Not recorded"}</dd></div>
          <div><dt className="text-slate-500">Publication</dt><dd className="font-medium text-slate-800">{contact.outletName || "Not recorded"}</dd></div>
          <div><dt className="text-slate-500">Publication sector</dt><dd className="text-slate-800">{contact.outletCategory || "Not recorded"}</dd></div>
          <div><dt className="text-slate-500">Region</dt><dd className="text-slate-800">{contact.geography || contact.outletCountry || "Not recorded"}</dd></div>
          <div><dt className="text-slate-500">Email address</dt><dd className="break-words">
            {emailHref ? <a href={emailHref} className="text-blue-600 hover:underline">{contact.email}</a> : <span className="text-slate-800">{contact.email || "Not recorded"}</span>}
          </dd></div>
          <div><dt className="text-slate-500">Publication website</dt><dd className="break-words">
            {publicationUrl ? <a href={publicationUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{contact.outletWebsite}</a> : <span className="text-slate-800">Not recorded</span>}
          </dd></div>
        </dl>
        <p className="text-[12px] text-slate-700 mt-4">
          <span className="font-semibold">Suggested pitch angle:</span> {suggestedAngle || "No tailored pitch angle is recorded for this contact yet."}
        </p>
        {item.restricted && (
          <p role="alert" data-testid={`contact-restricted-${contact.id}`} className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-800">
            Do not contact restriction is active. Outreach planning is blocked until the restriction is removed.
          </p>
        )}
      </div>
      <div className="self-start flex flex-col items-center rounded-xl border border-slate-100 bg-white px-4 py-3 min-w-[120px]" data-testid="editorial-assessment">
        <span className="text-[11px] font-semibold text-slate-600 mb-2">Editorial fit</span>
        {hasFit ? <><MiniDonut score={fit} color={vars.accent} size={64} /><span className="text-[12px] font-medium text-slate-700 mt-1">{fit}%</span></> : <span className="text-[12px] text-slate-500">Not assessed</span>}
      </div>
    </div>
  );
}