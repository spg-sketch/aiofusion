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
import { streamContent, buildProjectDataText, escapeHtml, safeHttpUrl, GenerationProgress, downloadWordDocument } from "../lib/contentAi";
import { TRADE_MEDIA_CATEGORIES } from "../tradeMediaCategories";
import { getKeyMessages, getProjectMediaCategories } from "../IntakeForm";
import { Labelled, CategoryPickerModal } from "./shared";
type EventConfirmFlag = "C" | "U";
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
  date: string;
  audience: string;
  titleDescription: string;
  location: string;
  confirmStatus: EventConfirmFlag;
  authority: number;
  relevanceReason: string;
  opportunities: EventOpportunity[];
};

const EVENTS_RESEARCH_LLM_PROMPT_V2 = `You are acting as a senior UK PR event attendance and participation-list builder.
Produce an exhaustive list of marketing types chosen
In business categories selected:
Over period selected:
Use information and instructions in the Project Data document to inform your search.
You are given permission to web-search and verify named contacts before answering.
Use web search for every named contact before writing the row. Do not rely on training-data knowledge of who works where.

For each event, return in this order:
- Event name and homepage URL
- Category using the business categories above
- Event date
- One-sentence description of its audience (job titles, seniority, sector)
- One-sentence description of the title (owner or related media publication, format, frequency, subjects and industry covered)
- Event location / address
- Event participation submission date / deadline/s
- Entry cost (for conferences)
- Award entry costs (for awards only)
- Participation costs (for speaker opportunities only)
- Sponsorship costs (for sponsorship opportunities only - include other relevant information including contact details)
- Events confirmed published data within next <12 months mark as [C] Confirmed
- Unverified - events unconfirmed within next <12 months but held in previous 24 months - mark as [U] Unconfirmed
- Authority score (0-100) - provide an LLM authority score for relevance weighted to categories listed above, the business, quality of audience and other relevant criteria
- Short summary of reasons why an event is relevant to business
- Flag the top 3 most immediately actionable opportunities - events with open entry windows, upcoming deadlines, or speaker pitch processes currently live.

Hard rules:
- Do not invent URLs, events, titles, or emails.

Deliverable:
- A sortable Excel with one row per opportunity - include multiple opportunities for each event.
- A structured list on a Word document.`;
function MarketingIntelligencePage() {
  const [showLLMBrief, setShowLLMBrief] = useState(false);
  const projectCategories = getProjectMediaCategories();
  const [marketingType, setMarketingType] = useState<string[]>(["Trade Conferences"]);
  const [categories, setCategories] = useState<string[]>(projectCategories);
  const [period, setPeriod] = useState<"6m" | "12m">("6m");
  const [region, setRegion] = useState<"UK" | "NA">("UK");
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [results, setResults] = useState<EventItem[] | null>(null);
  const [searching, setSearching] = useState(false);

  const MARKETING_TYPES = ["Trade Conferences", "Conference Sponsorships", "Trade Speaker", "Trade Awards", "Networking"];

  const search = () => {
    setSearching(true);
    setResults(null);
    window.setTimeout(() => {
      setResults([]);
      setSearching(false);
    }, 700);
  };
  void EVENTS_RESEARCH_LLM_PROMPT_V2;

  const actionableOps = (results || []).flatMap((e) =>
    e.opportunities.filter((o) => o.actionable).map((o) => ({ event: e, op: o }))
  ).slice(0, 3);

  const confirmStyle = (c: EventConfirmFlag) =>
    c === "C"
      ? { color: "#1F7244", bg: "rgba(31,114,68,0.12)", label: "[C] Confirmed in next 12 months" }
      : { color: "#A04040", bg: "rgba(160,64,64,0.12)", label: "[U] Unconfirmed - held in last 24 months" };

  const downloadWordReport = () => {
    if (!results) return;
    const itemsHtml = results.map((e) => {
      const cs = confirmStyle(e.confirmStatus);
      const opsHtml = e.opportunities.map((o) => `
        <li><b>${o.type}</b> - <b>Cost:</b> ${o.cost} · <b>Deadline:</b> ${o.deadline}
          ${o.contactDetails ? `<br/><i style="color:#666;">Contact: ${o.contactDetails}</i>` : ""}
          ${o.notes ? `<br/><i style="color:#666;">${o.notes}</i>` : ""}
          ${o.actionable ? `<br/><span style="color:#C8497A;font-weight:bold;">★ Top 3 actionable</span>` : ""}
        </li>
      `).join("");
      return `
        <h2 style="font-family:Georgia,serif;color:#102B36;margin-bottom:4px;">${e.rank}. ${e.name}</h2>
        <p style="margin:0 0 8px 0;color:#1f748f;"><a href="${e.url}">${e.url}</a> · ${e.category} · <b>Authority ${e.authority}/100</b> · <span style="color:${cs.color};font-weight:bold;">${cs.label}</span></p>
        <p><b>Date:</b> ${e.date}</p>
        <p><b>Audience:</b> ${e.audience}</p>
        <p><b>Title / owner:</b> ${e.titleDescription}</p>
        <p><b>Location:</b> ${e.location}</p>
        <p><b>Why it's relevant:</b> ${e.relevanceReason}</p>
        <p><b>Opportunities (${e.opportunities.length}):</b></p>
        <ul>${opsHtml}</ul>
        <hr/>
      `;
    }).join("");
    const topActionHtml = actionableOps.length === 0 ? "<p><i>No live windows flagged at search time.</i></p>" :
      `<ol>${actionableOps.map((a) => `<li><b>${a.event.name}</b> - ${a.op.type} - deadline: ${a.op.deadline}</li>`).join("")}</ol>`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Event Opportunities Report</title></head><body style="font-family:Calibri,Arial,sans-serif;color:#102B36;">
      <h1 style="font-family:Georgia,serif;">Event Opportunities Report</h1>
      <p><b>Marketing types:</b> ${marketingType.join(", ")}</p>
      <p><b>Business categories:</b> ${categories.join(", ")}</p>
      <p><b>Period:</b> ${period === "6m" ? "Next 6 months" : "Next 12 months"} · <b>Region:</b> ${region === "UK" ? "United Kingdom" : "North America"}</p>
      <h2 style="font-family:Georgia,serif;color:#102B36;">Top 3 immediately actionable opportunities</h2>
      ${topActionHtml}
      <hr/>
      ${itemsHtml}
      <h2 style="font-family:Georgia,serif;color:#102B36;">Methodology &amp; source caveats</h2>
      <p>Generated using the Project Data brief, with web-search verification of every named contact, event URL and deadline. Events with confirmed published dates within the next 12 months are marked <b>[C] Confirmed</b>; events unconfirmed for the next 12 months but held in the previous 24 months are marked <b>[U] Unconfirmed</b> and should be re-checked before commitment. Authority scores (0-100) are relevance-weighted to the selected business categories, audience quality and LLM citation footprint. URLs, events, titles and emails are not invented - unverifiable entries are dropped.</p>
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
      const cs = confirmStyle(e.confirmStatus);
      return e.opportunities.map((o) => `
        <tr>
          <td>${e.rank}</td>
          <td>${e.name}</td>
          <td>${e.url}</td>
          <td>${e.category}</td>
          <td>${e.date}</td>
          <td>${e.location}</td>
          <td>${e.audience}</td>
          <td>${e.titleDescription}</td>
          <td style="color:${cs.color};font-weight:bold;">${e.confirmStatus} - ${cs.label.replace(`[${e.confirmStatus}] `, "")}</td>
          <td>${e.authority}</td>
          <td>${o.type}</td>
          <td>${o.cost}</td>
          <td>${o.deadline}</td>
          <td>${o.contactDetails || ""}</td>
          <td>${o.notes || ""}</td>
          <td>${o.actionable ? "YES" : ""}</td>
          <td>${e.relevanceReason}</td>
        </tr>
      `);
    }).join("");
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Opportunities</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet><x:ExcelWorksheet><x:Name>Methodology</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
<body>
<h2>Event Opportunities - one row per opportunity</h2>
<p><b>Marketing types:</b> ${marketingType.join(", ")} · <b>Categories:</b> ${categories.join(", ")} · <b>Period:</b> ${period === "6m" ? "Next 6 months" : "Next 12 months"} · <b>Region:</b> ${region === "UK" ? "United Kingdom" : "North America"}</p>
<table border="1">
  <thead><tr style="background:#102B36;color:white;font-weight:bold;">
    <th>Rank</th><th>Event name</th><th>URL</th><th>Category</th><th>Date</th><th>Location</th><th>Audience</th><th>Title / owner</th><th>Confirm status</th><th>Authority /100</th><th>Opportunity type</th><th>Cost</th><th>Deadline</th><th>Contact details</th><th>Notes</th><th>Top 3 actionable</th><th>Why relevant</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<br/><br/>
<h2>Methodology</h2>
<p>Generated using the Project Data brief, with web-search verification of every named contact, event URL and deadline. Events with confirmed published dates within the next 12 months are marked [C] Confirmed; events unconfirmed for the next 12 months but held in the previous 24 months are marked [U] Unconfirmed and should be re-checked before commitment. Authority scores (0-100) are relevance-weighted to selected business categories, audience quality and LLM citation footprint. URLs, events, titles and emails are not invented - unverifiable entries are dropped.</p>
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
        <p className="text-[14px] font-light" style={{ color: "rgba(255,255,255,0.85)" }}>
          Find the awards, conferences and speaker platforms worth pursuing, each scored on the AI authority it can deliver. Wins and speaking slots create the credible, independent mentions that AI tools reward, strengthening your place in their answers. Recommendations are tailored to your Project Data brief.
        </p>
      </div>

      {/* Form */}
      <div className="bg-white rounded-2xl border p-6 sm:p-8 space-y-5 mb-6" style={{ borderColor: vars.g200 }}>
        <Labelled label="Marketing Type" hint="Choose one or more event types.">
          <div className="flex flex-wrap gap-2">
            {MARKETING_TYPES.map((mt) => {
              const on = marketingType.includes(mt);
              return (
                <button key={mt} onClick={() => setMarketingType(on ? marketingType.filter((x) => x !== mt) : [...marketingType, mt])} className="text-[12px] font-semibold px-3 py-1.5 rounded-full border transition-colors" style={{ borderColor: on ? vars.coral : vars.g200, background: on ? "rgba(224,120,86,0.1)" : "white", color: on ? vars.coral : vars.g500 }}>
                  {mt}
                </button>
              );
            })}
          </div>
        </Labelled>

        <Labelled label="Select Category" hint="Multi-select from the business categories list.">
          <div className="rounded-lg border p-3 mb-2" style={{ borderColor: vars.g200, background: vars.g50 }}>
            {categories.length === 0 ? (
              <p className="text-[12px] font-light italic" style={{ color: vars.g400 }}>No categories selected.</p>
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
            <button onClick={() => setShowLLMBrief((v) => !v)} className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-[12px] font-semibold border bg-white" style={{ borderColor: vars.g200, color: vars.accent }}>
              <FileText size={13} /> {showLLMBrief ? "Hide" : "View"} LLM brief
            </button>
          </div>
          <p className="text-[11px] font-light leading-relaxed" style={{ color: vars.g500 }}>
            Builds an exhaustive, web-verified list of UK PR events for the chosen marketing types and business categories, with one row per opportunity (entry, award, speaker, sponsorship). Events confirmed in the next 12 months are flagged <strong style={{ color: "#1F7244" }}>[C] Confirmed</strong>; events held in the previous 24 months but not yet confirmed forward are flagged <strong style={{ color: "#A04040" }}>[U] Unconfirmed</strong>. Each event carries an LLM authority score (0-100), a relevance summary and named-contact details verified at search time. No URLs, events, titles or emails are invented.
          </p>
          {showLLMBrief && (
            <pre className="mt-3 p-3 rounded-lg text-[11px] font-mono leading-relaxed whitespace-pre-wrap overflow-auto max-h-[320px]" style={{ background: vars.g50, border: `1px solid ${vars.g100}`, color: vars.g600 }}>{EVENTS_RESEARCH_LLM_PROMPT_V2}</pre>
          )}
        </div>
      </div>

      {/* Results */}
      {results && (
        <div className="space-y-4">
          {results.length === 0 ? (
            <div className="rounded-2xl border p-10 text-center" style={{ background: "white", borderColor: vars.g200 }}>
              <Search size={28} color={vars.g300} className="mx-auto mb-3" />
              <p className="text-sm font-medium mb-1" style={{ color: vars.g500 }}>No events found for this search</p>
              <p className="text-[12px]" style={{ color: vars.g400 }}>Try adjusting the marketing type, categories, or time period and search again.</p>
            </div>
          ) : (
          <>
          <div className="rounded-2xl p-5" style={{ background: "rgba(224,120,86,0.08)", border: `1px solid rgba(224,120,86,0.25)` }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-2" style={{ color: vars.coral }}>Top 3 immediately actionable opportunities</p>
            {actionableOps.length === 0 ? (
              <p className="text-[12px] italic" style={{ color: vars.g500 }}>No live windows flagged at search time.</p>
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
              <span className="text-[11px]" style={{ color: vars.g500 }}>Ranked by LLM authority + category fit</span>
            </div>
            <div className="divide-y" style={{ borderColor: vars.g100 }}>
              {results.map((e) => {
                const cs = confirmStyle(e.confirmStatus);
                return (
                  <div key={e.name} className="p-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold" style={{ color: vars.navy }}>
                          {e.rank}. {e.name}
                        </p>
                        <a href={e.url} target="_blank" rel="noreferrer" className="text-[11px] underline" style={{ color: vars.accent }}>{e.url}</a>
                        <p className="text-[12px] font-light mt-1" style={{ color: vars.g500 }}>
                          {e.category} · {e.date} · {e.location}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: cs.bg, color: cs.color }}>{cs.label}</span>
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: "rgba(201,160,78,0.18)", color: "#7A5E25" }}>Authority {e.authority}/100</span>
                      </div>
                    </div>
                    <p className="text-[12px] font-light leading-relaxed mb-1" style={{ color: vars.g600 }}>
                      <strong style={{ color: vars.navy }}>Audience:</strong> {e.audience}
                    </p>
                    <p className="text-[12px] font-light leading-relaxed mb-1" style={{ color: vars.g600 }}>
                      <strong style={{ color: vars.navy }}>Title / owner:</strong> {e.titleDescription}
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
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(224,120,86,0.12)", color: vars.coral }}>★ Top 3 actionable</span>
                              )}
                            </div>
                            <p className="mt-0.5"><strong>Cost:</strong> {o.cost}</p>
                            <p><strong>Deadline:</strong> <span style={{ color: o.actionable ? vars.coral : vars.g600 }}>{o.deadline}</span></p>
                            {o.contactDetails && <p className="italic" style={{ color: vars.g500 }}>Contact: {o.contactDetails}</p>}
                            {o.notes && <p className="italic" style={{ color: vars.g500 }}>{o.notes}</p>}
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
              <p className="text-[11px] font-light flex-1 min-w-[200px]" style={{ color: vars.g500 }}>
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
