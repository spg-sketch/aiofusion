import { useState } from "react";
import {
  ChevronRight, Lock, Search, FileEdit, BarChart3, Archive, Send, LineChart, ArrowRight, Sparkles, Loader2,
  TrendingUp, FileText, FileCheck2, Target, Code2, HelpCircle, MessageSquareQuote, Bot, ShieldCheck,
  MessagesSquare, Download, AlertTriangle, CheckCircle2, XCircle, Info, Globe, Tag, User, ChevronDown,
  Plus, Minus, MessageSquare, BookOpen, Scroll, Award, Radio, Mic2, PenLine, ClipboardList, ArrowUpRight,
  Lightbulb, ClipboardPaste, Upload, Calendar, Check, Save, Circle, Zap, Mail, Shield, Eye, Building2,
  ArrowLeft, LogOut, Trash2, KeyRound, Users, Activity, Play, ChevronUp, Menu, X, LogIn,
  Link as LinkIcon, Image as ImageIcon, Repeat, TrendingDown, FolderOpen, List as ListIcon, Clock,
  Undo2, ArchiveRestore, RefreshCw, MonitorSmartphone,
} from "lucide-react";
import { vars } from "../marketing/vars";
import { buildProjectDataText, escapeHtml, safeHttpUrl, downloadWordDocument, apiBase } from "../lib/contentAi";
import { TRADE_MEDIA_CATEGORIES } from "../tradeMediaCategories";
import { getKeyMessages, getProjectMediaCategories, getActiveProjectId } from "../IntakeForm";
import { Labelled, CategoryPickerModal } from "./shared";
type EventOpportunity = {
  type: "Conference entry" | "Award entry" | "Speaker" | "Sponsorship";
  cost: string;
  deadline: string;
  contactDetails?: string;
  notes?: string;
  actionable?: boolean;
};
type EventItem = {
  rank: number;
  name: string;
  url: string;
  category: string;
  startDate: string;
  endDate: string;
  audience: string;
  titleDescription: string;
  location: string;
  authority: number;
  relevanceReason: string;
  opportunities: EventOpportunity[];
  sourceCheckedAt: string;
};
type SearchCriteria = {
  marketingTypes: string[];
  categories: string[];
  period: "6m" | "12m";
  region: "UK" | "NA";
};

function MarketingIntelligencePage() {
  const projectCategories = getProjectMediaCategories();
  const [marketingType, setMarketingType] = useState<string[]>(["Trade Conferences"]);
  const [categories, setCategories] = useState<string[]>(projectCategories);
  const [period, setPeriod] = useState<"6m" | "12m">("6m");
  const [region, setRegion] = useState<"UK" | "NA">("UK");
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [results, setResults] = useState<EventItem[] | null>(null);
  const [resultCriteria, setResultCriteria] = useState<SearchCriteria | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const MARKETING_TYPES = ["Trade Conferences", "Conference Sponsorships", "Trade Speaker", "Trade Awards", "Networking"];

  const search = async () => {
    const requested: SearchCriteria = {
      marketingTypes: [...marketingType],
      categories: [...categories],
      period,
      region,
    };
    setSearching(true);
    setResults(null);
    setSearchError("");
    try {
      const resp = await fetch(`${apiBase()}/api/content/events-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          marketingTypes: requested.marketingTypes,
          categories: requested.categories,
          period: requested.period,
          region: requested.region,
          projectData: buildProjectDataText(),
          projectId: getActiveProjectId(),
        }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => null);
        throw new Error((data as { error?: string } | null)?.error ?? "Search failed. Please try again.");
      }
      const data = await resp.json() as { events: EventItem[] };
      setResults(Array.isArray(data.events) ? data.events : []);
      setResultCriteria(requested);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search could not complete. Please try again.");
      setResults(null);
    } finally {
      setSearching(false);
    }
  };

  const actionableOps = (results || []).flatMap((e) =>
    e.opportunities.filter((o) => o.actionable).map((o) => ({ event: e, op: o }))
  ).slice(0, 3);
  const exportCriteria = resultCriteria ?? { marketingTypes: marketingType, categories, period, region };

  const downloadWordReport = () => {
    if (!results) return;
    const itemsHtml = results.map((e) => {
      const opsHtml = e.opportunities.map((o) => `
        <li><b>${escapeHtml(o.type)}</b> - <b>Cost:</b> ${escapeHtml(o.cost || "Not published")} &middot; <b>Deadline:</b> ${escapeHtml(o.deadline || "Not published")}
          ${o.contactDetails ? `<br/><i style="color:#666;">Contact: ${escapeHtml(o.contactDetails)}</i>` : ""}
          ${o.notes ? `<br/><i style="color:#666;">${escapeHtml(o.notes)}</i>` : ""}
          ${o.actionable ? `<br/><span style="color:#C8497A;font-weight:bold;">Top 3 upcoming verified deadline</span>` : ""}
        </li>
      `).join("");
      return `
        <h2 style="font-family:Georgia,serif;color:#102B36;margin-bottom:4px;">${escapeHtml(String(e.rank))}. ${escapeHtml(e.name)}</h2>
        <p style="margin:0 0 8px 0;color:#1f748f;"><a href="${escapeHtml(safeHttpUrl(e.url))}">${escapeHtml(e.url)}</a> &middot; ${escapeHtml(e.category)} &middot; <b>Authority ${escapeHtml(String(e.authority))}/100</b></p>
        <p><b>Date:</b> ${escapeHtml(e.startDate)} to ${escapeHtml(e.endDate)}</p>
        <p><b>Audience:</b> ${escapeHtml(e.audience)}</p>
        <p><b>Title / owner:</b> ${escapeHtml(e.titleDescription)}</p>
        <p><b>Location:</b> ${escapeHtml(e.location)}</p>
        <p><b>Why it is relevant:</b> ${escapeHtml(e.relevanceReason)}</p>
        <p><b>Source checked:</b> ${escapeHtml(e.sourceCheckedAt)}</p>
        <p><b>Opportunities (${e.opportunities.length}):</b></p>
        <ul>${opsHtml}</ul>
        <hr/>
      `;
    }).join("");
    const topActionHtml = actionableOps.length === 0 ? "<p><i>No upcoming verified deadlines found.</i></p>" :
      `<ol>${actionableOps.map((a) => `<li><b>${escapeHtml(a.event.name)}</b> - ${escapeHtml(a.op.type)} - deadline: ${escapeHtml(a.op.deadline || "Not published")}</li>`).join("")}</ol>`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Event Opportunities Report</title></head><body style="font-family:Calibri,Arial,sans-serif;color:#102B36;">
      <h1 style="font-family:Georgia,serif;">Event Opportunities Report</h1>
      <p><b>Marketing types:</b> ${escapeHtml(exportCriteria.marketingTypes.join(", "))}</p>
      <p><b>Business categories:</b> ${escapeHtml(exportCriteria.categories.join(", "))}</p>
      <p><b>Period:</b> ${escapeHtml(exportCriteria.period === "6m" ? "Next 6 months" : "Next 12 months")} &middot; <b>Region:</b> ${escapeHtml(exportCriteria.region === "UK" ? "United Kingdom" : "North America")}</p>
      <h2 style="font-family:Georgia,serif;color:#102B36;">Top 3 upcoming verified deadlines</h2>
      ${topActionHtml}
      <hr/>
      ${itemsHtml}
      <h2 style="font-family:Georgia,serif;color:#102B36;">Methodology &amp; source caveats</h2>
      <p>Generated using the Project Data brief and current web search. Every result links to a cited event page where the event name and selected-period date were checked. A deadline is shown only when it appeared near submission or entry language on the same page. Authority scores (0-100) are an AI relevance estimate based on category fit, audience quality and potential third-party visibility, not measured reach.</p>
    </body></html>`;
    const blob = new Blob([html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `event-opportunities-report-${new Date().toISOString().slice(0, 10)}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadExcelReport = () => {
    if (!results) return;
    // One row per opportunity
    const rows = results.flatMap((e) => {
      return e.opportunities.map((o) => `
        <tr>
          <td>${escapeHtml(String(e.rank))}</td>
          <td>${escapeHtml(e.name)}</td>
          <td><a href="${escapeHtml(safeHttpUrl(e.url))}">${escapeHtml(e.url)}</a></td>
          <td>${escapeHtml(e.category)}</td>
          <td>${escapeHtml(e.startDate)}</td>
          <td>${escapeHtml(e.endDate)}</td>
          <td>${escapeHtml(e.location)}</td>
          <td>${escapeHtml(e.audience)}</td>
          <td>${escapeHtml(e.titleDescription)}</td>
          <td>${escapeHtml(String(e.authority))}</td>
          <td>${escapeHtml(o.type)}</td>
          <td>${escapeHtml(o.cost || "Not published")}</td>
          <td>${escapeHtml(o.deadline || "Not published")}</td>
          <td>${escapeHtml(o.contactDetails || "")}</td>
          <td>${escapeHtml(o.notes || "")}</td>
          <td>${o.actionable ? "YES" : ""}</td>
          <td>${escapeHtml(e.relevanceReason)}</td>
          <td>${escapeHtml(e.sourceCheckedAt)}</td>
        </tr>
      `);
    }).join("");
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Opportunities</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet><x:ExcelWorksheet><x:Name>Methodology</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
<body>
<h2>Event Opportunities - one row per opportunity</h2>
<p><b>Marketing types:</b> ${escapeHtml(exportCriteria.marketingTypes.join(", "))} &middot; <b>Categories:</b> ${escapeHtml(exportCriteria.categories.join(", "))} &middot; <b>Period:</b> ${escapeHtml(exportCriteria.period === "6m" ? "Next 6 months" : "Next 12 months")} &middot; <b>Region:</b> ${escapeHtml(exportCriteria.region === "UK" ? "United Kingdom" : "North America")}</p>
<table border="1">
  <thead><tr style="background:#102B36;color:white;font-weight:bold;">
    <th>Rank</th><th>Event name</th><th>URL</th><th>Category</th><th>Start Date</th><th>End Date</th><th>Location</th><th>Audience</th><th>Title / owner</th><th>AI relevance /100</th><th>Opportunity type</th><th>Cost</th><th>Deadline</th><th>Contact details</th><th>Notes</th><th>Top 3 upcoming verified deadlines</th><th>Why relevant</th><th>Source checked</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<br/><br/>
<h2>Methodology</h2>
<p>Generated using the Project Data brief and current web search. Every result links to a cited event page where the event name and selected-period date were checked. A deadline is shown only when it appeared near submission or entry language on the same page. Authority scores (0-100) are an AI relevance estimate based on category fit, audience quality and potential third-party visibility, not measured reach.</p>
</body></html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `event-opportunities-report-${new Date().toISOString().slice(0, 10)}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp size={20} color="#ffffff" />
          <h1 className="text-3xl sm:text-4xl tracking-tight" style={{ color: "#ffffff", fontFamily: "'Alice', Georgia, serif" }}>Marketing Intelligence</h1>
        </div>
        <p className="text-[15px] font-light" style={{ color: "rgba(255,255,255,0.97)" }}>
          Find current awards, conferences and speaker platforms worth pursuing. Each result is checked against its cited event page and ranked using an AI relevance estimate tailored to your Project Data brief.
        </p>
      </div>

      {/* Form */}
      <div className="bg-white rounded-2xl border p-6 sm:p-8 space-y-5 mb-6" style={{ borderColor: vars.g200 }}>
        <Labelled label="Marketing Type" hint="Choose one or more event types.">
          <div className="flex flex-wrap gap-2">
            {MARKETING_TYPES.map((mt) => {
              const on = marketingType.includes(mt);
              return (
                <button key={mt} onClick={() => setMarketingType(on ? marketingType.filter((x) => x !== mt) : [...marketingType, mt])} className="text-[12px] font-semibold px-3 py-1.5 rounded-full border transition-all duration-200 hover:-translate-y-0.5 hover:scale-105 hover:shadow-md active:scale-95" style={{ borderColor: on ? vars.coral : vars.g200, background: on ? "rgba(224,120,86,0.1)" : "white", color: on ? vars.coral : vars.g500 }}>
                  {mt}
                </button>
              );
            })}
          </div>
        </Labelled>

        <Labelled label="Select Category" hint="Multi-select from the business categories list.">
          <div className="rounded-lg border p-3 mb-2" style={{ borderColor: vars.g200, background: vars.g50 }}>
            {categories.length === 0 ? (
              <p className="text-[13px] font-light italic" style={{ color: vars.g600 }}>No categories selected.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {categories.map((cat) => (
                  <span key={cat} className="text-[11px] font-medium px-2.5 py-1 rounded-full inline-flex items-center gap-1.5" style={{ background: "rgba(201,160,78,0.18)", color: "#7A5E25" }}>
                    {cat}
                    <button onClick={() => setCategories(categories.filter((c) => c !== cat))}><XCircle size={11} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => setShowCatPicker(true)} className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border" style={{ borderColor: vars.g200, color: vars.accent }}>+ Choose categories</button>
        </Labelled>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Labelled label="Period" hint="Search 6-month or 12-month windows.">
            <div className="inline-flex rounded-lg border p-0.5" style={{ borderColor: vars.g200 }}>
              {(["6m", "12m"] as const).map((p) => (
                <button key={p} onClick={() => setPeriod(p)} className="px-4 py-1.5 rounded text-[12px] font-semibold" style={{ background: period === p ? vars.coral : "transparent", color: period === p ? "white" : vars.g500 }}>
                  {p === "6m" ? "Next 6 months" : "Next 12 months"}
                </button>
              ))}
            </div>
          </Labelled>
          <Labelled label="Region" hint="UK or North America (more in V2).">
            <div className="inline-flex rounded-lg border p-0.5" style={{ borderColor: vars.g200 }}>
              {(["UK", "NA"] as const).map((r) => (
                <button key={r} onClick={() => setRegion(r)} className="px-4 py-1.5 rounded text-[12px] font-semibold" style={{ background: region === r ? vars.gold : "transparent", color: region === r ? "white" : vars.g500 }}>
                  {r === "UK" ? "United Kingdom" : "North America"}
                </button>
              ))}
            </div>
          </Labelled>
        </div>

        <div className="pt-3 border-t" style={{ borderColor: vars.g100 }}>
          <div className="flex flex-wrap gap-2 mb-2">
            <button onClick={search} disabled={searching} className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[13px] font-semibold text-white disabled:opacity-70 disabled:cursor-default" style={{ background: vars.coral }}>
              {searching ? (
                <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Searching...</>
              ) : (
                <><Search size={14} /> Search Events</>
              )}
            </button>
          </div>
          <p className="text-[14px] font-normal leading-relaxed" style={{ color: vars.navy }}>
            Searches current event pages for the chosen marketing types, categories, period and region. Results are retained only when the cited page contains the event identity and published date. Deadlines appear only when found near submission or entry language. The authority figure is an AI relevance estimate, not measured reach.
          </p>
        </div>
      </div>

      {/* Error */}
      {searchError && (
        <div className="rounded-2xl border p-5 flex items-start gap-3" style={{ background: "rgba(200,73,122,0.06)", borderColor: "rgba(200,73,122,0.25)" }}>
          <AlertTriangle size={16} style={{ color: "#C8497A", flexShrink: 0, marginTop: 2 }} />
          <p className="text-[13px]" style={{ color: vars.navy }}>{searchError}</p>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-4">
          {results.length === 0 ? (
            <div className="rounded-2xl border p-10 text-center" style={{ background: "white", borderColor: vars.g200 }}>
              <Search size={28} color={vars.g300} className="mx-auto mb-3" />
              <p className="text-sm font-medium mb-1" style={{ color: vars.navy }}>No events found for this search</p>
              <p className="text-[13px]" style={{ color: vars.g600 }}>Try adjusting the marketing type, categories, or time period and search again.</p>
            </div>
          ) : (
          <>
          <div className="rounded-2xl p-5" style={{ background: "white", border: `1px solid ${vars.g200}` }}>
            <p className="text-[13px] font-bold uppercase tracking-[0.16em] mb-2" style={{ color: vars.coral }}>Top 3 upcoming verified deadlines</p>
            {actionableOps.length === 0 ? (
              <p className="text-[12px] italic" style={{ color: vars.g500 }}>No upcoming verified deadlines found.</p>
            ) : (
              <ul className="space-y-1.5">
                {actionableOps.map((a, i) => (
                  <li key={i} className="text-[13px]" style={{ color: vars.navy }}>
                    <span className="font-semibold">{a.event.name}</span> - {a.op.type} - deadline: {a.op.deadline}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: vars.g200 }}>
            <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: vars.g200 }}>
              <h3 className="text-sm font-bold uppercase tracking-[0.12em]" style={{ color: vars.navy }}>Recommended events ({results.length})</h3>
              <span className="text-[11px]" style={{ color: vars.g500 }}>Ranked by AI relevance estimate and category fit</span>
            </div>
            <div className="divide-y" style={{ borderColor: vars.g100 }}>
              {results.map((e) => {
                return (
                  <div key={e.name} className="p-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold" style={{ color: vars.navy }}>
                          {e.rank}. {e.name}
                        </p>
                        <a href={e.url} target="_blank" rel="noreferrer" className="text-[11px] underline" style={{ color: vars.accent }}>{e.url}</a>
                        <p className="text-[13px] font-light mt-1" style={{ color: vars.g600 }}>
                          {e.category} &middot; {e.startDate} to {e.endDate}{e.location ? <> &middot; {e.location}</> : null}
                        </p>
                        <p className="text-[11px] font-light mt-0.5" style={{ color: vars.g500 }}>
                          Source checked: {new Date(e.sourceCheckedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: "rgba(201,160,78,0.18)", color: "#7A5E25" }}>AI relevance {e.authority}/100</span>
                      </div>
                    </div>
                    <p className="text-[12px] font-light leading-relaxed mb-1" style={{ color: vars.g600 }}>
                      <strong style={{ color: vars.navy }}>AI-summarised audience:</strong> {e.audience}
                    </p>
                    <p className="text-[12px] font-light leading-relaxed mb-1" style={{ color: vars.g600 }}>
                      <strong style={{ color: vars.navy }}>AI-summarised organiser:</strong> {e.titleDescription}
                    </p>
                    <p className="text-[12px] font-light leading-relaxed mb-2" style={{ color: vars.g600 }}>
                      <strong style={{ color: vars.navy }}>Why relevant:</strong> {e.relevanceReason}
                    </p>
                    <div className="mt-2 rounded-lg" style={{ background: vars.g50, border: `1px solid ${vars.g100}` }}>
                      <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] border-b" style={{ color: vars.g500, borderColor: vars.g100 }}>Opportunities ({e.opportunities.length})</p>
                      <ul className="divide-y" style={{ borderColor: vars.g100 }}>
                        {e.opportunities.map((o, i) => (
                          <li key={i} className="px-3 py-2 text-[12px]" style={{ color: vars.g600 }}>
                            <div className="flex items-start justify-between gap-2 flex-wrap">
                              <strong style={{ color: vars.navy }}>{o.type}</strong>
                              {o.actionable && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(224,120,86,0.12)", color: vars.coral }}>Top 3 actionable</span>
                              )}
                            </div>
                            <p className="mt-0.5"><strong>Cost:</strong> {o.cost || "Not published"}</p>
                            <p><strong>Deadline:</strong> <span style={{ color: o.actionable ? vars.coral : vars.g600 }}>{o.deadline || "Not published"}</span></p>
                            {o.contactDetails && <p className="italic" style={{ color: vars.g600 }}>Contact: {o.contactDetails}</p>}
                            {o.notes && <p className="italic" style={{ color: vars.g600 }}>{o.notes}</p>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Download buttons */}
            <div className="px-5 py-4 border-t flex flex-wrap items-center gap-3" style={{ borderColor: vars.g100, background: vars.g50 }}>
              <p className="text-[12px] font-light flex-1 min-w-[200px]" style={{ color: vars.g600 }}>
                Both formats include a methodology and source caveats. Excel exports one row per opportunity for sorting.
              </p>
              <button onClick={downloadWordReport} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold border bg-white" style={{ borderColor: vars.g200, color: vars.navy }}>
                <FileText size={13} color="#2B579A" /> Download Report (Word)
              </button>
              <button onClick={downloadExcelReport} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold border bg-white" style={{ borderColor: vars.g200, color: vars.navy }}>
                <FileText size={13} color="#1F7244" /> Download Report (Excel)
              </button>
            </div>
          </div>
          </>
          )}
        </div>
      )}

      {showCatPicker && (
        <CategoryPickerModal
          all={TRADE_MEDIA_CATEGORIES}
          selected={categories}
          projectSet={projectCategories}
          onClose={() => setShowCatPicker(false)}
          onSave={(next) => { setCategories(next); setShowCatPicker(false); }}
        />
      )}

    </div>
  );
}

export { MarketingIntelligencePage };
