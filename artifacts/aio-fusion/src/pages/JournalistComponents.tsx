import React from "react";
import { vars } from "../marketing/vars";
import { Mail, Phone, MapPin, Globe, ExternalLink, Linkedin, Twitter, Clock, Edit, Check, ThumbsDown, ThumbsUp, Database, Target, Award, Shield, FileText, Undo2 } from "lucide-react";
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
  provenance?: {
    latestPublicDiscovery?: {
      recentBylines?: MediaByline[];
      journalistInterests?: string[];
      mediaOpportunities?: MediaOpportunity[];
      mediaOpportunity?: string;
    };
  } | null;
  lifecycleStatus?: "active" | "departed";
  hasPendingCorrection?: boolean;
};

export type MediaByline = { title: string; url?: string; date?: string; summary?: string };
export type MediaOpportunity = { title: string; angle: string; rationale?: string };

export type Recommendation = {
  rank: number;
  contact: Contact;
  score: number;
  reasons: string[];
  phraseAttributions?: PhraseAttribution[];
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
};

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
  onRefine,
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
  onRefine?: (signal: "more" | "less" | null) => void;
}) {
  const c = item.contact;
  const latestDiscovery = c.provenance?.latestPublicDiscovery;
  return (
    <div className="p-5 border-b last:border-b-0 bg-white hover:bg-slate-50 transition-colors" style={{ borderColor: vars.g200 }}>
      <div className="flex flex-wrap gap-4 items-start justify-between">
        <div className="flex-1 min-w-[280px]">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="text-[18px] font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
              {c.firstName} {c.lastName}
            </h3>
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
            {c.outletReachBand && (
              <>
                <span className="mx-2 text-slate-300">|</span>
                <span className="text-slate-600">Reach: {c.outletReachBand}</span>
              </>
            )}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-[13px] mb-4">
            {c.email && (
              <div className="flex items-center gap-2" style={{ color: vars.g600 }}>
                <Mail size={14} className="text-slate-400" />
                <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a>
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

          {item.reasons && item.reasons.length > 0 && (
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
          <PhraseAttributionSections attributions={item.phraseAttributions} />

          <EnrichmentSections
            recentBylines={c.recentBylines || latestDiscovery?.recentBylines}
            journalistInterests={c.journalistInterests || latestDiscovery?.journalistInterests}
            mediaOpportunities={c.mediaOpportunities || latestDiscovery?.mediaOpportunities}
            legacyMediaOpportunity={latestDiscovery?.mediaOpportunity}
          />

          {c.notes && (
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
          {showMatchScore !== false && <div className="flex flex-col items-center p-3 rounded-xl border border-slate-100 bg-white shadow-sm w-full">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Match Score</span>
            <MiniDonut score={item.score} color={vars.accent} size={64} />
          </div>}
          
          <div className="flex flex-wrap gap-2 justify-end w-full">
            {c.publicationReach && (
              <div className="flex flex-col items-center p-2 rounded-lg bg-slate-50 border border-slate-100 flex-1 min-w-[70px]">
                 <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wide">Pub Reach</span>
                 <span className="text-[13px] font-bold text-slate-700">{c.publicationReach}</span>
              </div>
            )}
            {c.publicationAuthority ? (
              <div className="flex flex-col items-center p-2 rounded-lg bg-slate-50 border border-slate-100 flex-1 min-w-[70px]">
                 <Award size={14} className="text-slate-400 mb-1" />
                 <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wide">Pub Auth</span>
                 <span className="text-[13px] font-bold text-slate-700">{c.publicationAuthority}</span>
              </div>
            ) : null}
            {c.journalistAuthority ? (
              <div className="flex flex-col items-center p-2 rounded-lg bg-slate-50 border border-slate-100 flex-1 min-w-[70px]">
                 <Award size={14} className="text-amber-500 mb-1" />
                 <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wide">Authority</span>
                 <span className="text-[13px] font-bold text-slate-700">{c.journalistAuthority}</span>
              </div>
            ) : null}
            {c.lastVerifiedAt && (
              <div className="flex flex-col items-center p-2 rounded-lg bg-emerald-50 border border-emerald-100 flex-1 min-w-[70px]">
                 <Shield size={14} className="text-emerald-500 mb-1" />
                  <span className="text-[10px] uppercase text-emerald-600 font-semibold tracking-wide">Record checked</span>
                 <span className="text-[11px] font-medium text-emerald-700">{new Date(c.lastVerifiedAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {!isShortlist && onAccept && onDecline && (
        <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t" style={{ borderColor: vars.g100 }}>
          <button 
            data-testid={`button-accept-${c.id}`} 
            onClick={onAccept} 
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-colors" 
            style={{ background: "#3D9B6B", boxShadow: "0 1px 2px rgba(61,155,107,0.3)" }}
          >
            <Check size={14} /> Add to shortlist
          </button>
          <button 
            data-testid={`button-decline-${c.id}`} 
            onClick={onDecline} 
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold border transition-colors bg-white hover:bg-slate-50" 
            style={{ borderColor: vars.g200, color: vars.g600 }}
          >
            <ThumbsDown size={14} /> Decline
          </button>
          {onRefine && <>
            <button disabled={refinementLoading} aria-pressed={refinement === "more"} onClick={() => onRefine(refinement === "more" ? null : "more")} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold border ${refinement === "more" ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-white border-slate-200 text-slate-600"}`}>
              {refinement === "more" ? <Undo2 size={14} /> : <ThumbsUp size={14} />} {refinement === "more" ? "Undo More like this" : "More like this"}
            </button>
            <button disabled={refinementLoading} aria-pressed={refinement === "less"} onClick={() => onRefine(refinement === "less" ? null : "less")} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold border ${refinement === "less" ? "bg-rose-50 border-rose-300 text-rose-800" : "bg-white border-slate-200 text-slate-600"}`}>
              {refinement === "less" ? <Undo2 size={14} /> : <ThumbsDown size={14} />} {refinement === "less" ? "Undo Less like this" : "Less like this"}
            </button>
          </>}
        </div>
      )}
      
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
  onSave
}: {
  candidate: LiveDiscovery;
  isSaving: boolean;
  isSaved: boolean;
  onSave: () => void;
}) {
  const isHighConf = candidate.confidence === "High";
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
              {candidate.confidence} source confidence
            </span>
          </div>
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
                <a href={`mailto:${candidate.email}`} className="hover:underline">{candidate.email}</a>
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

          {candidate.evidence && (
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
            disabled={isSaving || isSaved} 
            className="flex items-center justify-center w-full gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold text-white transition-all disabled:opacity-80 disabled:cursor-not-allowed" 
            style={{ 
              background: isSaved ? "#27734D" : vars.navy,
              boxShadow: isSaved ? "none" : "0 2px 4px rgba(10,22,40,0.15)"
            }}
          >
            {isSaving ? (
              <><div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin"></div> Saving...</>
            ) : isSaved ? (
              <><Check size={16} /> Saved to Media Database</>
            ) : (
              <><Database size={16} /> Save to Media Database</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
