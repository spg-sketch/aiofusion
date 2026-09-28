import React from "react";
import { vars } from "../marketing/vars";
import { Mail, Phone, MapPin, Globe, ExternalLink, Linkedin, Twitter, Clock, Edit, Check, Bookmark, ThumbsDown, ThumbsUp, Database, Target, Award, Shield, FileText, Undo2, ChevronDown, ChevronRight, AlertCircle, Ban, Loader2 } from "lucide-react";
import { MiniDonut } from "./shared";

export type Contact = {
  id: number;
  outletId: number | null;
  firstName: string;
  lastName: string;
  role: string;
  email: string;
  phone: string;
  notes: string;
  accountId: string | null;
  outletName?: string | null;
  outletCategory?: string | null;
  outletWebsite?: string | null;
  outletCountry?: string | null;
  outletReachBand?: string | null;
  mobile?: string;
  linkedinUrl?: string;
  twitterHandle?: string;
  beats?: string[];
  sectors?: string[];
  geography?: string;
  language?: string;
  seniority?: string;
  editorialStatus?: string;
  sourceUrl?: string;
  sourceRef?: string;
  lastVerifiedAt?: string | null;
  reach?: string;
  reachBand?: string;
  authority?: number;
  authorityScore?: number;
  confidence?: string;
  confidenceLevel?: string;
  publicationReach?: string;
  publicationAuthority?: string | number;
  journalistAuthority?: string | number;
  reviewNotes?: string;
  provenance?: ContactProvenance | null;
  sourceCheckClaimedAt?: string | null;
  sourceStatus?: "current" | "due" | "unavailable" | "changed" | "unverified";
  sourceReviewDueAt?: string | null;
  sourceCheckQueued?: boolean;
  sourceCheck?: {
    id: number;
    checkedAt: string;
    outcome: "current" | "changed" | "unavailable";
    errorCode?: string | null;
    errorMessage?: string;
    reviewedAt?: string | null;
    observedEvidence: { nameFound: boolean; roleFound: boolean; emailFound: boolean; observedRole: string; observedEmails: string[]; excerpt: string };
    differences: Array<{ field: "role" | "email"; kind: "changed" | "removed" | "added"; storedValue: string; observedValue: string; supported: boolean }>;
  } | null;
  recentBylines?: MediaByline[];
  journalistInterests?: string[];
  mediaOpportunities?: MediaOpportunity[];
  lifecycleStatus?: "active" | "departed";
  hasPendingCorrection?: boolean;
};

export type ContactProvenance = Record<string, unknown> & {
  latestPublicDiscovery?: {
    recentBylines?: MediaByline[];
    journalistInterests?: string[];
    mediaOpportunities?: MediaOpportunity[];
    mediaOpportunity?: string;
  };
};

export type MediaByline = { title: string; url?: string; date?: string; summary?: string };
export type MediaOpportunity = { title: string; angle: string; rationale?: string };

/**
 * Keep contact email values useful for review without turning untrusted
 * workbook/page values into mail links.  Import reconciliation normally
 * canonicalises emails, but manually entered and legacy records can still
 * contain a malformed value.
 */
export function isSendableContactEmail(value: unknown): value is string {
  return typeof value === "string"
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export type AssessmentFactor = {
  key: string;
  label: string;
  weight: number;
  score: number | null;
  reason: string;
};

export type RecommendationAssessment = {
  version: "editorial-v1";
  fitScore: number | null;
  confidence: "high" | "medium" | "low";
  evidenceCoverage: number;
  factors: AssessmentFactor[];
  readiness: { status: "ready" | "needs_check" | "blocked"; reasons: string[] };
  evidence: Array<{ title: string; url: string; publishedAt: string | null; checkedAt: string; excerpt: string; attribution: "page_checked" | "search_suggested"; authorMatched: boolean }>;
  warnings: string[];
  suggestedAngle: string | null;
  evaluation?: { evaluated: boolean; shortlisted: boolean; contacted: boolean; responded: boolean; placed: boolean };
};

export type Recommendation = {
  rank: number;
  contact: Contact;
  score: number;
  reasons: string[];
  phraseAttributions?: PhraseAttribution[];
  assessment?: RecommendationAssessment;
  recommendationSetId?: number | string;
  restricted?: boolean;
};

export type PhraseAttribution = {
  phraseId: string;
  phraseText: string;
  matchKind?: "exact" | "topic";
  exactPhraseMatch: string;
  articleFit: string;
  publicationAuthorityContext: string;
  suggestedPlacementAngle: string;
};

export type Decision = {
  contactId: number;
  decision: "shortlisted" | "rejected" | "contacted";
  note: string;
};

export type LiveDiscovery = {
  candidateKey: string;
  firstName: string;
  lastName: string;
  role: string;
  email: string;
  outletName: string;
  outletWebsite: string;
  sourceUrl: string;
  evidence: string;
  beats: string[];
  sectors?: string[];
  geography?: string;
  mediaOpportunity?: string;
  recentBylines?: MediaByline[];
  journalistInterests?: string[];
  mediaOpportunities?: MediaOpportunity[];
  recentCoverage?: MediaByline[];
  confidence: "High" | "Medium" | "Low";
  verifiedAt: string;
  phraseAttributions?: PhraseAttribution[];
  evidenceStatus?: "pending" | "verified" | "failed";
  evidenceFailure?: string;
};

export type DiscoveryReviewStatus = "saving" | "submitted" | "approved" | "rejected" | "error";

function PhraseAttributionSections({ attributions, aiSuggested = false }: { attributions?: PhraseAttribution[]; aiSuggested?: boolean }) {
  if (!attributions?.length) return null;
  const hasTopicOverlap = attributions.some((attribution) => attribution.matchKind === "topic");
  return (
    <div className="space-y-2 mb-4" data-testid="phrase-attributions">
      <span className="text-[12px] font-bold text-indigo-900 block">
        {aiSuggested ? "AI-suggested phrase fit" : hasTopicOverlap ? "Phrase fit and recorded topic overlap" : "Exact phrase fit"}
      </span>
      {aiSuggested && <span className="text-[10px] text-indigo-700 block">Inferred guidance only. Cited source evidence is shown separately.</span>}
      {attributions.map((attribution) => (
        <div key={attribution.phraseId} className="rounded-lg bg-indigo-50 border border-indigo-100 p-3 text-[12px] text-indigo-900">
          <p className="font-semibold mb-1">“{attribution.phraseText}”</p>
          <dl className="space-y-1">
            <div><dt className="inline font-semibold">{attribution.matchKind === "topic" ? "Recorded topic/keyword overlap: " : "Exact phrase match: "}</dt><dd className="inline">{attribution.exactPhraseMatch}</dd></div>
            <div><dt className="inline font-semibold">Article fit: </dt><dd className="inline">{attribution.articleFit}</dd></div>
            <div><dt className="inline font-semibold">Publication authority context: </dt><dd className="inline">{attribution.publicationAuthorityContext}</dd></div>
            <div><dt className="inline font-semibold">Media opportunities: </dt><dd className="inline">{attribution.suggestedPlacementAngle}</dd></div>
          </dl>
        </div>
      ))}
    </div>
  );
}

function EnrichmentSections({
  recentBylines,
  journalistInterests,
  mediaOpportunities,
  legacyMediaOpportunity,
}: {
  recentBylines?: MediaByline[];
  journalistInterests?: string[];
  mediaOpportunities?: MediaOpportunity[];
  legacyMediaOpportunity?: string;
}) {
  const opportunities = mediaOpportunities?.length
    ? mediaOpportunities
    : legacyMediaOpportunity ? [{ title: "Story angle", angle: legacyMediaOpportunity }] : [];
  if (!recentBylines?.length && !journalistInterests?.length && !opportunities.length) return null;
  return (
    <div className="space-y-3 mb-4">
      {journalistInterests?.length ? (
        <div>
          <span className="text-[12px] font-bold text-slate-700 block mb-2">Journalist interests/topics</span>
          <div className="flex flex-wrap gap-2">
            {journalistInterests.map((interest) => <span key={interest} className="px-2 py-1 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700">{interest}</span>)}
          </div>
        </div>
      ) : null}
      {opportunities.length ? (
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 border-l-4" style={{ borderLeftColor: vars.accent }}>
          <span className="text-[12px] font-bold text-slate-700 block mb-2">Media opportunities</span>
          <div className="space-y-2 text-[13px] text-slate-700">
            {opportunities.map((opportunity, index) => (
              <div key={`${opportunity.title}-${index}`}>
                <p className="font-semibold">{opportunity.title}</p>
                <p className="italic">{opportunity.angle}</p>
                {opportunity.rationale && <p className="text-[12px] text-slate-600 mt-1">{opportunity.rationale}</p>}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {recentBylines?.length ? (
        <div className="p-3 rounded-lg bg-white border border-slate-200">
          <span className="text-[12px] font-bold text-slate-700 block mb-2">Recent bylines</span>
          <div className="space-y-2">
            {recentBylines.map((byline, index) => (
              <div key={`${byline.url || byline.title}-${index}`} className="text-[12px]">
                {byline.url ? <a href={byline.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 hover:underline">{byline.title}</a> : <span className="font-semibold">{byline.title}</span>}
                {byline.date && <span className="text-slate-500 ml-2">{byline.date}</span>}
                {byline.summary && <p className="text-slate-600 mt-1">{byline.summary}</p>}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AssessmentSection({ assessment, compact = false, suggestedAngle }: { assessment?: RecommendationAssessment; compact?: boolean; suggestedAngle?: string | null }) {
  const [factorsOpen, setFactorsOpen] = React.useState(false);
  const compactFitScore = assessment?.fitScore;
  
  if (compact) {
    return (
      <div className="mb-3" data-testid="editorial-assessment">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
          <span className="font-semibold text-slate-800">Editorial fit: {compactFitScore ?? "Not assessed"}{compactFitScore !== null && compactFitScore !== undefined ? "%" : ""}</span>
          <span className="text-slate-600">Evidence confidence: <span className="font-medium capitalize">{assessment?.confidence || "Not assessed"}</span></span>
        </div>
        {assessment && <p className="text-[11px] text-slate-500 mt-1">Confidence reflects the quality and coverage of available evidence, not the likelihood of a placement.</p>}
        {suggestedAngle && <p className="text-[12px] text-slate-700 mt-2"><span className="font-semibold">Suggested pitch angle:</span> {suggestedAngle}</p>}
        {assessment && <>
          <details className="mt-2 text-[12px] text-slate-600">
            <summary className="cursor-pointer font-medium">Evidence and contact checks</summary>
            <div className="mt-2 space-y-2">
              <p>{assessment.evidence.length} cited source{assessment.evidence.length === 1 ? "" : "s"} checked. {assessment.evidenceCoverage} evidence coverage.</p>
              {assessment.readiness.reasons.length > 0 && <p><span className="font-semibold">Contact checks:</span> {assessment.readiness.reasons.join(" ")}</p>}
              {assessment.warnings.map((warning, index) => <p key={index} className="text-amber-700">{warning}</p>)}
              {assessment.evidence.map((evidence, index) => (
                <div key={`${evidence.url}-${index}`} className="rounded-md border border-slate-200 bg-white p-2">
                  <a href={evidence.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{evidence.title}</a>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500 mt-1">
                    {evidence.publishedAt && <span>Published: {new Date(evidence.publishedAt).toLocaleDateString()}</span>}
                    <span>Checked: {new Date(evidence.checkedAt).toLocaleDateString()}</span>
                    {evidence.authorMatched && <span className="text-emerald-700 font-medium">Author matched</span>}
                    <span>{evidence.attribution === "page_checked" ? "Page checked" : "Search suggested"}</span>
                  </div>
                  {evidence.excerpt && <p className="mt-1">“{evidence.excerpt}”</p>}
                </div>
              ))}
            </div>
          </details>
        </>}
      </div>
    );
  }

  return (
    <div className="space-y-4 mb-4">
      {assessment ? (
        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-3 border-b border-slate-200 pb-3">
            <div>
              <span className="text-[12px] font-bold text-slate-700 block mb-1">Editorial fit</span>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-slate-800">{assessment.fitScore ?? "?"}%</span>
                <span className="text-[11px] px-2 py-0.5 bg-slate-200 text-slate-700 rounded-full font-medium">Confidence: {assessment.confidence}</span>
              </div>
            </div>
            <div>
              <span className="text-[12px] font-bold text-slate-700 block mb-1">Contact readiness</span>
              <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-md ${assessment.readiness.status === 'ready' ? 'bg-emerald-100 text-emerald-800' : assessment.readiness.status === 'needs_check' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>
                {assessment.readiness.status === 'ready' ? 'Ready to contact' : assessment.readiness.status === 'needs_check' ? 'Needs verification' : 'Blocked'}
              </span>
            </div>
            {assessment.readiness.status !== 'ready' && assessment.readiness.reasons.length > 0 && (
              <div className="w-full text-[12px] text-slate-600 mt-1">
                <ul className="list-disc pl-4 space-y-0.5">
                  {assessment.readiness.reasons.map((r, i) => <li key={i} className={assessment.readiness.status === 'blocked' ? 'text-rose-700' : 'text-amber-700'}>{r}</li>)}
                </ul>
              </div>
            )}
          </div>

          <div className="mb-3">
             <button onClick={() => setFactorsOpen(!factorsOpen)} className="flex items-center gap-1.5 text-[12px] font-bold text-slate-700 hover:text-slate-900 transition-colors outline-none w-full text-left">
               {factorsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
               Weighted fit factors
             </button>
             {factorsOpen && (
               <div className="mt-3 space-y-2 pl-6">
                 {assessment.factors.map(f => (
                   <div key={f.key} className="text-[12px]">
                     <div className="flex justify-between items-end mb-0.5">
                       <span className="font-semibold text-slate-700">{f.label} <span className="text-slate-400 font-normal ml-1">({f.weight}%)</span></span>
                       <span className="font-bold text-slate-600">{f.score ?? "?"} / 100</span>
                     </div>
                     <p className="text-slate-600 text-[11.5px] leading-relaxed">{f.reason}</p>
                   </div>
                 ))}
                 <p className="text-[10px] text-slate-400 italic mt-2">Scores are based on available evidence. Unknowns are evaluated as null, not zero.</p>
               </div>
             )}
          </div>

          {assessment.suggestedAngle && (
            <div className="mb-3 p-3 bg-white rounded border border-slate-100 border-l-4 border-l-indigo-400">
              <span className="text-[11px] font-bold text-indigo-800 uppercase tracking-wide block mb-1">Inferred Suggested Angle</span>
              <p className="text-[12px] text-slate-700">{assessment.suggestedAngle}</p>
              <span className="text-[10px] text-indigo-500 block mt-1">This is an AI judgement based on available data, not a verified fact. No probability of coverage claimed.</span>
            </div>
          )}

          {assessment.warnings.length > 0 && (
            <div className="mb-3 p-3 bg-rose-50 rounded border border-rose-100">
              <div className="flex items-start gap-2">
                <AlertCircle size={14} className="text-rose-600 mt-0.5" />
                <div>
                  <span className="text-[12px] font-bold text-rose-900 block mb-1">Warnings</span>
                  <ul className="list-disc pl-4 text-[12px] text-rose-800 space-y-0.5">
                    {assessment.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          )}
          
          <div className="pt-3 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-bold text-slate-700">Source evidence ({assessment.evidenceCoverage} found)</span>
            </div>
            {assessment.evidence.length > 0 ? (
              <div className="space-y-2">
                {assessment.evidence.map((ev, i) => (
                  <div key={i} className="text-[11.5px] bg-white p-2 rounded border border-slate-100">
                     <a href={ev.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 hover:underline">{ev.title}</a>
                     <div className="flex gap-3 text-[10px] text-slate-500 mt-1 mb-1.5">
                       {ev.publishedAt && <span>Published: {new Date(ev.publishedAt).toLocaleDateString()}</span>}
                       <span>Checked: {new Date(ev.checkedAt).toLocaleDateString()}</span>
                       {ev.authorMatched && <span className="text-emerald-600 font-medium">Author matched</span>}
                       <span className="bg-slate-100 px-1.5 rounded">{ev.attribution === 'page_checked' ? 'Page checked' : 'Search suggested'}</span>
                     </div>
                     <p className="text-slate-600 italic line-clamp-2">"{ev.excerpt}"</p>
                  </div>
                ))}
              </div>
            ) : (
               <p className="text-[11px] text-slate-500">No explicit evidence gathered yet. Use bounded top-5 search to check recent coverage.</p>
            )}
          </div>
          
          {assessment.evaluation && (
            <div className="pt-3 mt-3 border-t border-slate-200">
              <span className="text-[12px] font-bold text-slate-700 block mb-1">Previous article outcome summary</span>
              <p className="text-[11px] text-slate-600">
                {assessment.evaluation.placed ? "Placed a story." : assessment.evaluation.responded ? "Responded to outreach." : assessment.evaluation.contacted ? "Contacted, no response yet." : assessment.evaluation.shortlisted ? "Shortlisted, not contacted." : "Evaluated, not shortlisted."}
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function RecommendationCard({
  item,
  decision,
  onAccept,
  onDecline,
  onReject,
  noteFor,
  setNoteFor,
  note,
  setNote,
  isShortlist = false,
  onEdit,
  showMatchScore = true,
  refinement,
  refinementLoading = false,
  actionLoading = false,
  onRefine,
  onToggleRestriction,
  sharedScoreCount = 1,
  compact = false,
  savedToDatabase = false,
  onSaveToDatabase,
  bookmarkLoading = false,
}: {
  item: Recommendation;
  decision?: Decision;
  onAccept?: () => void;
  onDecline?: () => void;
  onReject?: (note: string) => void;
  noteFor?: number | null;
  setNoteFor?: (id: number | null) => void;
  note?: string;
  setNote?: (v: string) => void;
  isShortlist?: boolean;
  onEdit?: () => void;
  showMatchScore?: boolean;
  refinement?: "more" | "less";
  refinementLoading?: boolean;
  actionLoading?: boolean;
  onRefine?: (signal: "more" | "less" | null) => void;
  onToggleRestriction?: (contactId: number, restricted: boolean) => void;
  sharedScoreCount?: number;
  compact?: boolean;
  savedToDatabase?: boolean;
  onSaveToDatabase?: () => void;
  bookmarkLoading?: boolean;
}) {
  const c = item.contact;
  const contactName = [c.firstName, c.lastName].map((part) => part?.trim()).filter(Boolean).join(" ");
  const hasRecordedName = contactName.length > 0;
  const latestDiscovery = c.provenance?.latestPublicDiscovery;
  return (
    <div className="p-5 border-b last:border-b-0 bg-white hover:bg-slate-50 transition-colors" style={{ borderColor: vars.g200 }}>
      <div className="flex flex-wrap gap-4 items-start justify-between">
        <div className="flex-1 min-w-[280px]">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="text-[18px] font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
              {hasRecordedName ? contactName : "Contact name not recorded"}
            </h3>
            {compact && <span className="text-[11px] font-semibold text-slate-500" data-testid={`text-recommendation-rank-${c.id}`}>Rank {item.rank}</span>}
            {c.linkedinUrl && (
              <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800" title="LinkedIn">
                <Linkedin size={16} />
              </a>
            )}
            {c.twitterHandle && (
              <a href={`https://twitter.com/${c.twitterHandle.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:text-sky-700" title="Twitter">
                <Twitter size={16} />
              </a>
            )}
            {onEdit && (
              <button onClick={onEdit} className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors ml-auto" title="Edit Profile">
                <Edit size={14} />
              </button>
            )}
          </div>
          {!hasRecordedName && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 mb-3" role="alert">
              <AlertCircle size={15} className="text-amber-700 mt-0.5 shrink-0" />
              <p className="text-[12px] text-amber-900">
                <span className="font-bold">Identity review required.</span> Confirm the journalist's name before outreach.
              </p>
            </div>
          )}
          <p className="text-[14px] mb-3" style={{ color: vars.g600 }}>
            <span className="font-medium text-slate-800">{c.role || "No role recorded"}</span>
            {c.outletName && (
              <>
                <span className="mx-2 text-slate-300">|</span>
                <span className="font-semibold text-slate-800">{c.outletName}</span>
              </>
            )}
            {c.outletCategory && (
              <>
                <span className="mx-2 text-slate-300">|</span>
                <span className="text-slate-600">{c.outletCategory}</span>
              </>
            )}
            {c.outletCountry && (
              <>
                <span className="mx-2 text-slate-300">|</span>
                <span className="text-slate-600">{c.outletCountry}</span>
              </>
            )}
            {c.outletReachBand && !compact && (
              <>
                <span className="mx-2 text-slate-300">|</span>
                <span className="text-slate-600">Reach: {c.outletReachBand}</span>
              </>
            )}
          </p>
          {compact && <p className="text-[12px] text-slate-600 mb-2">
            Source-provided publication reach: {c.publicationReach || c.outletReachBand || "Not available"} <span className="text-[11px] text-slate-500">(not a verified audience measurement)</span>
            <span className="mx-2 text-slate-300">·</span>
            Publication authority: {c.publicationAuthority !== undefined && c.publicationAuthority !== null && c.publicationAuthority !== "" ? c.publicationAuthority : "Not available"}
          </p>}

          <div className={`grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-[13px] ${compact ? "mb-2" : "mb-4"}`}>
            {c.email && (
              <div className="flex items-center gap-2" style={{ color: vars.g600 }}>
                <Mail size={14} className="text-slate-400" />
                {isSendableContactEmail(c.email)
                  ? <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a>
                  : <span title="Review required before sending">{c.email} <span className="text-[11px] text-amber-700">Review - not sendable</span></span>}
              </div>
            )}
            {(c.phone || c.mobile) && (
              <div className="flex items-center gap-2" style={{ color: vars.g600 }}>
                <Phone size={14} className="text-slate-400" />
                <span>{c.phone} {c.mobile ? `(M: ${c.mobile})` : ""}</span>
              </div>
            )}
            {c.geography && (
              <div className="flex items-center gap-2" style={{ color: vars.g600 }}>
                <MapPin size={14} className="text-slate-400" />
                <span>{c.geography}</span>
              </div>
            )}
            {(c.sourceUrl || c.outletWebsite) && (
              <div className="flex items-center gap-2" style={{ color: vars.g600 }}>
                <Globe size={14} className="text-slate-400" />
                <a href={c.sourceUrl || c.outletWebsite || '#'} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-600 flex items-center gap-1">
                  {c.sourceUrl ? "View source" : "Outlet website"} <ExternalLink size={12} />
                </a>
              </div>
            )}
          </div>
          
          {(c.beats?.length || c.sectors?.length) ? (
            <div className="flex flex-wrap gap-2 mb-4">
              {c.beats?.map(b => (
                <span key={`beat-${b}`} className="px-2 py-1 rounded-md text-[11px] font-medium" style={{ background: vars.g100, color: vars.navy }}>
                  Beat: {b}
                </span>
              ))}
              {c.sectors?.map(s => (
                <span key={`sector-${s}`} className="px-2 py-1 rounded-md text-[11px] font-medium" style={{ background: "#F0Fdf4", color: "#166534" }}>
                  Sector: {s}
                </span>
              ))}
            </div>
          ) : null}

          {!compact && item.reasons && item.reasons.length > 0 && (
            <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-100 mb-4">
              <div className="flex items-start gap-2">
                <Target size={14} className="text-indigo-600 mt-0.5" />
                <div>
                  <span className="text-[12px] font-bold text-indigo-900 block mb-1">Why this matches</span>
                  <ul className="list-disc pl-4 text-[12px] text-indigo-800 space-y-1">
                    {item.reasons.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          )}
          {compact && item.phraseAttributions?.length ? (
            <details className="mb-3 text-[12px]">
              <summary className="cursor-pointer font-medium text-indigo-800">Story phrase matches</summary>
              <div className="mt-2"><PhraseAttributionSections attributions={item.phraseAttributions} /></div>
            </details>
          ) : null}
          {!compact && <PhraseAttributionSections attributions={item.phraseAttributions} />}

          {!compact && <EnrichmentSections
            recentBylines={c.recentBylines || latestDiscovery?.recentBylines}
            journalistInterests={c.journalistInterests || latestDiscovery?.journalistInterests}
            mediaOpportunities={c.mediaOpportunities || latestDiscovery?.mediaOpportunities}
            legacyMediaOpportunity={latestDiscovery?.mediaOpportunity}
          />}
          
          <AssessmentSection
            assessment={item.assessment}
            compact={compact}
            suggestedAngle={item.assessment?.suggestedAngle || item.phraseAttributions?.[0]?.suggestedPlacementAngle || c.mediaOpportunities?.[0]?.angle || latestDiscovery?.mediaOpportunities?.[0]?.angle}
          />

          {!compact && c.notes && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-100 mb-4">
              <div className="flex items-start gap-2">
                <FileText size={14} className="text-amber-600 mt-0.5" />
                <div>
                  <span className="text-[12px] font-bold text-amber-900 block mb-1">Notes</span>
                  <p className="text-[12px] text-amber-800">{c.notes}</p>
                </div>
              </div>
            </div>
          )}

        </div>

        <div className="flex flex-col items-end gap-3 min-w-[140px]">
          {!compact && showMatchScore !== false && <div className="flex flex-col items-center p-3 rounded-xl border border-slate-100 bg-white shadow-sm w-full">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              {sharedScoreCount > 1 ? "Shared Match Score" : "Match Score"}
            </span>
            <MiniDonut score={item.score} color={vars.accent} size={64} />
            {sharedScoreCount > 1 && (
              <p className="text-[10px] leading-snug text-center text-slate-500 mt-2" data-testid="shared-score-note">
                {sharedScoreCount} contacts have this score from the available factors. Their order is not a quality difference.
              </p>
            )}
          </div>}
          
          {!compact && <div className="flex flex-wrap gap-2 justify-end w-full">
             {c.publicationReach && (
              <div className="flex flex-col items-center p-2 rounded-lg bg-slate-50 border border-slate-100 flex-1 min-w-[70px]">
                 <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wide" title="Source-provided value; not a verified audience measurement">Source reach</span>
                 <span className="text-[13px] font-bold text-slate-700">{c.publicationReach}</span>
              </div>
            )}
             {c.publicationAuthority !== undefined && c.publicationAuthority !== null && c.publicationAuthority !== "" ? (
              <div className="flex flex-col items-center p-2 rounded-lg bg-slate-50 border border-slate-100 flex-1 min-w-[70px]">
                 <Award size={14} className="text-slate-400 mb-1" />
                 <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wide">Pub Auth</span>
                 <span className="text-[13px] font-bold text-slate-700">{c.publicationAuthority}</span>
              </div>
            ) : null}
             {c.journalistAuthority !== undefined && c.journalistAuthority !== null && c.journalistAuthority !== "" ? (
              <div className="flex flex-col items-center p-2 rounded-lg bg-slate-50 border border-slate-100 flex-1 min-w-[70px]">
                 <Award size={14} className="text-amber-500 mb-1" />
                  <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wide">Journalist authority</span>
                 <span className="text-[13px] font-bold text-slate-700">{c.journalistAuthority}</span>
              </div>
            ) : null}
             {(c.confidence || c.confidenceLevel) && (
               <div className="flex flex-col items-center p-2 rounded-lg bg-indigo-50 border border-indigo-100 flex-1 min-w-[70px]">
                  <Shield size={14} className="text-indigo-500 mb-1" />
                  <span className="text-[10px] uppercase text-indigo-600 font-semibold tracking-wide">Confidence</span>
                  <span className="text-[11px] font-medium text-indigo-700">{c.confidence || c.confidenceLevel}</span>
               </div>
             )}
            {c.lastVerifiedAt && (
              <div className="flex flex-col items-center p-2 rounded-lg bg-emerald-50 border border-emerald-100 flex-1 min-w-[70px]">
                 <Shield size={14} className="text-emerald-500 mb-1" />
                  <span className="text-[10px] uppercase text-emerald-600 font-semibold tracking-wide">Record checked</span>
                 <span className="text-[11px] font-medium text-emerald-700">{new Date(c.lastVerifiedAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>}
        </div>
      </div>

      {(!isShortlist && onAccept) || onToggleRestriction || onSaveToDatabase ? (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t" style={{ borderColor: vars.g100 }}>
          <div className="flex flex-wrap items-center gap-3">
            {onSaveToDatabase && (
              <button
                type="button"
                data-testid={`button-save-media-contact-${c.id}`}
                onClick={onSaveToDatabase}
                disabled={bookmarkLoading}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold border transition-colors ${savedToDatabase ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-white hover:bg-slate-50 text-slate-700"}`}
              >
                {bookmarkLoading ? <Loader2 size={14} className="animate-spin" /> : savedToDatabase ? <Check size={14} /> : <Bookmark size={14} />}
                {bookmarkLoading ? "Saving..." : savedToDatabase ? "Saved to My Media Database" : "Save to My Media Database"}
              </button>
            )}
            {compact && !isShortlist && onAccept && (
              <button
                type="button"
                data-testid={`button-plan-story-outreach-${c.id}`}
                onClick={onAccept}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : decision?.decision === "shortlisted" ? <Check size={14} /> : <Target size={14} />}
                {actionLoading ? "Saving..." : decision?.decision === "shortlisted" ? "Added to story shortlist" : "Plan outreach for this story"}
              </button>
            )}
            {!compact && !isShortlist && onAccept && onDecline && (
              <>
                <button 
                  type="button"
                  data-testid={`button-accept-${c.id}`} 
                  onClick={onAccept} 
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-colors" 
                  style={{ background: "#3D9B6B", boxShadow: "0 1px 2px rgba(61,155,107,0.3)" }}
                >
                  {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  {actionLoading ? "Saving..." : decision?.decision === "shortlisted" ? "Added to shortlist" : "Add to shortlist"}
                </button>
                <button 
                  type="button"
                  data-testid={`button-decline-${c.id}`} 
                  onClick={onDecline} 
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold border transition-colors bg-white hover:bg-slate-50" 
                  style={{ borderColor: vars.g200, color: vars.g600 }}
                >
                  <ThumbsDown size={14} /> Decline
                </button>
                {onRefine && <>
                  <button type="button" disabled={refinementLoading} aria-pressed={refinement === "more"} onClick={() => onRefine(refinement === "more" ? null : "more")} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold border ${refinement === "more" ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-white border-slate-200 text-slate-600"}`}>
                    {refinementLoading ? <Loader2 size={14} className="animate-spin" /> : refinement === "more" ? <Undo2 size={14} /> : <ThumbsUp size={14} />} {refinement === "more" ? "Undo More like this" : "More like this"}
                  </button>
                  <button type="button" disabled={refinementLoading} aria-pressed={refinement === "less"} onClick={() => onRefine(refinement === "less" ? null : "less")} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold border ${refinement === "less" ? "bg-rose-50 border-rose-300 text-rose-800" : "bg-white border-slate-200 text-slate-600"}`}>
                    {refinementLoading ? <Loader2 size={14} className="animate-spin" /> : refinement === "less" ? <Undo2 size={14} /> : <ThumbsDown size={14} />} {refinement === "less" ? "Undo Less like this" : "Less like this"}
                  </button>
                </>}
              </>
            )}
          </div>
          {onToggleRestriction && (
            <button onClick={() => onToggleRestriction(c.id, !item.restricted)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold border transition-colors ${item.restricted ? "bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              <Ban size={14} /> {item.restricted ? "Remove restriction" : "Do not contact"}
            </button>
          )}
        </div>
      ) : null}
      
      {noteFor === c.id && setNote && onReject && (
        <div className="mt-3 flex gap-2 animate-in fade-in slide-in-from-top-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
          <input 
            data-testid={`input-decline-reason-${c.id}`} 
            value={note} 
            onChange={(e) => setNote(e.target.value)} 
            placeholder="Optional reason for declining..." 
            className="flex-1 px-3 py-2 border rounded-md text-[13px] bg-white outline-none focus:border-slate-400" 
          />
          <button 
            onClick={() => onReject(note || "")} 
            className="px-4 py-2 rounded-md text-[13px] font-semibold text-white transition-colors" 
            style={{ background: vars.coral }}
          >
            Save & Remove
          </button>
        </div>
      )}
    </div>
  );
}

export function LiveDiscoveryCard({
  candidate,
  isSaving,
  isSaved,
  status,
  onSave
}: {
  candidate: LiveDiscovery;
  isSaving: boolean;
  isSaved: boolean;
  status?: DiscoveryReviewStatus;
  onSave: () => void;
}) {
  const isHighConf = candidate.confidence === "High";
  const reviewStatus = status || (isSaving ? "saving" : isSaved ? "submitted" : undefined);
  const evidenceStatus = candidate.evidenceStatus || "verified";
  const canSendForReview = evidenceStatus === "verified" && (!reviewStatus || reviewStatus === "error");
  return (
    <div className="p-5 border-b last:border-b-0 bg-white hover:bg-slate-50 transition-colors" style={{ borderColor: vars.g200 }}>
      <div className="flex flex-wrap gap-4 items-start justify-between">
        <div className="flex-1 min-w-[280px]">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="text-[18px] font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
              {candidate.firstName} {candidate.lastName}
            </h3>
            <span 
              className="text-[11px] font-bold px-2 py-1 rounded-md" 
              style={{ 
                color: isHighConf ? "#27734D" : vars.accent, 
                background: isHighConf ? "#E5F5EC" : "rgba(200,73,122,0.1)" 
              }}
            >
              {evidenceStatus === "pending" ? "Evidence check pending" : evidenceStatus === "failed" ? "Evidence check failed" : "Evidence verified"} · {candidate.confidence} source confidence
            </span>
          </div>
          {evidenceStatus === "failed" && <p className="mb-4 rounded-lg border border-rose-100 bg-rose-50 p-3 text-[12px] text-rose-700">{candidate.evidenceFailure || "The cited page did not verify this journalist."}</p>}
          <p className="text-[14px] mb-3" style={{ color: vars.g600 }}>
            <span className="font-medium text-slate-800">{candidate.role || "Editorial contact"}</span>
            {candidate.outletName && (
              <>
                <span className="mx-2 text-slate-300">|</span>
                <span className="font-semibold text-slate-800">{candidate.outletName}</span>
              </>
            )}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-[13px] mb-4">
            {candidate.email && (
              <div className="flex items-center gap-2" style={{ color: vars.g600 }}>
                <Mail size={14} className="text-slate-400" />
                <span title="Pending human approval. Do not send until the discovery has been approved.">
                  {candidate.email}
                  <span className="text-[11px] text-amber-700"> Unverified discovery - review before sending</span>
                </span>
              </div>
            )}
            {candidate.sourceUrl && (
              <div className="flex items-center gap-2" style={{ color: vars.g600 }}>
                <Globe size={14} className="text-slate-400" />
                <a href={candidate.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-600 flex items-center gap-1">
                  View cited source <ExternalLink size={12} />
                </a>
              </div>
            )}
            {candidate.verifiedAt && (
              <div className="flex items-center gap-2" style={{ color: vars.g600 }}>
                <Clock size={14} className="text-slate-400" />
                <span>Source checked {new Date(candidate.verifiedAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>
          
          {candidate.beats?.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {candidate.beats.map((b, i) => (
                <span key={`lbeat-${i}`} className="px-2 py-1 rounded-md text-[11px] font-medium" style={{ background: vars.g100, color: vars.navy }}>
                  Beat: {b}
                </span>
              ))}
              {candidate.sectors?.map((s, i) => (
                <span key={`lsec-${i}`} className="px-2 py-1 rounded-md text-[11px] font-medium" style={{ background: "#F0Fdf4", color: "#166534" }}>
                  Sector: {s}
                </span>
              ))}
            </div>
          )}

          {candidate.geography && (
            <div className="flex items-center gap-2 mb-4 text-[13px]" style={{ color: vars.g600 }}>
              <MapPin size={14} className="text-slate-400" />
              <span>{candidate.geography}</span>
            </div>
          )}

            {candidate.evidence && evidenceStatus !== "failed" && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100 mb-4 border-l-4" style={{ borderLeftColor: "#3D9B6B" }}>
              <span className="text-[12px] font-bold text-emerald-900 block mb-1">AI-generated summary of the cited source</span>
              <p className="text-[13px] text-emerald-900 leading-relaxed">{candidate.evidence}</p>
            </div>
          )}
          <PhraseAttributionSections attributions={candidate.phraseAttributions} aiSuggested />

          <EnrichmentSections
            recentBylines={candidate.recentBylines || candidate.recentCoverage}
            journalistInterests={candidate.journalistInterests}
            mediaOpportunities={candidate.mediaOpportunities}
            legacyMediaOpportunity={candidate.mediaOpportunity}
          />
        </div>
        
        <div className="flex flex-col justify-start items-end min-w-[140px]">
          <button 
            onClick={onSave} 
            disabled={!canSendForReview}
            className="flex items-center justify-center w-full gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold text-white transition-all disabled:opacity-80 disabled:cursor-not-allowed" 
            style={{ 
              background: reviewStatus === "approved" ? "#27734D" : reviewStatus === "rejected" ? vars.g500 : vars.navy,
              boxShadow: reviewStatus === "approved" || reviewStatus === "rejected" ? "none" : "0 2px 4px rgba(10,22,40,0.15)"
            }}
          >
            {evidenceStatus === "pending" ? (
              <><Loader2 size={16} className="animate-spin" /> Checking evidence...</>
            ) : evidenceStatus === "failed" ? (
              <><AlertCircle size={16} /> Evidence failed</>
            ) : reviewStatus === "saving" ? (
              <><div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin"></div> Sending...</>
            ) : reviewStatus === "submitted" ? (
              <><Check size={16} /> Submitted for review</>
            ) : reviewStatus === "approved" ? (
              <><Check size={16} /> Approved</>
            ) : reviewStatus === "rejected" ? (
              <><Ban size={16} /> Rejected</>
            ) : reviewStatus === "error" ? (
              <><Database size={16} /> Retry send for review</>
            ) : (
              <><Database size={16} /> Send for review</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
