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
import { buildProjectDataText, safeHttpUrl, apiBase } from "../lib/contentAi";
import {
  buildMarketingIntelligenceCsv, buildMarketingIntelligencePdf, downloadReportBlob,
  type EventItem, type SearchCriteria,
} from "../lib/marketingIntelligenceExport";
import { TRADE_MEDIA_CATEGORIES } from "../tradeMediaCategories";
import { getKeyMessages, getProjectMediaCategories, getActiveProjectId } from "../IntakeForm";
import { Labelled, CategoryPickerModal } from "./shared";
import { getSession } from "../lib/auth";
import { aiRunKey, startAiRun, useAiRun } from "../lib/aiRunLifecycle";
import CountdownBanner from "../components/CountdownBanner";
import { getAuditDurationSeconds, getAuditSampleCount, recordAuditDuration } from "../lib/auditTiming";
export const EVENT_SEARCH_CLIENT_TIMEOUT_MS = 190_000;
const SEARCH_TIMEOUT_MESSAGE = "Event research took too long. Please try fewer categories or marketing types.";

function MarketingIntelligencePage() {
  const session = getSession();
  const projectId = getActiveProjectId() || "default";
  const scope = {
    sessionId: session?.userEmail || session?.userName || session?.username || "anonymous",
    workspaceId: session?.username || "default",
    projectId,
  };
  const runKey = aiRunKey(scope, "content-events-search");
  const searchRun = useAiRun<{ criteria: SearchCriteria; request: Record<string, unknown> }, EventItem[]>(runKey);
  const projectCategories = getProjectMediaCategories();
  const [marketingType, setMarketingType] = useState<string[]>(searchRun?.input.criteria.marketingTypes ?? ["Trade Conferences"]);
  const [categories, setCategories] = useState<string[]>(searchRun?.input.criteria.categories ?? projectCategories);
  const [period, setPeriod] = useState<"6m" | "12m">(searchRun?.input.criteria.period ?? "6m");
  const [region, setRegion] = useState<"UK" | "NA">(searchRun?.input.criteria.region ?? "UK");
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportError, setExportError] = useState("");
  const results = searchRun?.status === "succeeded" ? searchRun.result ?? null : null;
  const resultCriteria = searchRun?.status === "succeeded" ? searchRun.input.criteria : null;
  const searching = searchRun?.status === "running";
  const searchError = searchRun?.status === "failed" ? searchRun.error ?? "Search could not complete." : "";

  const MARKETING_TYPES = ["Trade Conferences", "Conference Sponsorships", "Trade Speaker", "Trade Awards", "Networking"];

  const search = () => {
    const requested: SearchCriteria = {
      marketingTypes: [...marketingType],
      categories: [...categories],
      period,
      region,
    };
    const input = {
      criteria: requested,
      request: {
          marketingTypes: requested.marketingTypes,
          categories: requested.categories,
          period: requested.period,
          region: requested.region,
          projectData: buildProjectDataText(),
          projectId: getActiveProjectId(),
      },
    };
    startAiRun({
      key: runKey,
      scope,
      operation: "content-events-search",
      input,
      estimateSeconds: getAuditDurationSeconds("events-search"),
      timeoutMs: EVENT_SEARCH_CLIENT_TIMEOUT_MS,
      timeoutMessage: SEARCH_TIMEOUT_MESSAGE,
      onSuccess: (_result, run) => {
        recordAuditDuration("events-search", Date.now() - run.startedAt, run.estimateSeconds * 1000);
      },
      execute: async () => {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            (async () => {
              const resp = await fetch(`${apiBase()}/api/content/events-search`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                signal: controller.signal,
                body: JSON.stringify(input.request),
              });
              if (!resp.ok) {
                const data = await resp.json().catch(() => null);
                throw new Error((data as { error?: string } | null)?.error ?? "Search failed. Please try again.");
              }
              const data = await resp.json() as { events: EventItem[] };
              if (!data || !Array.isArray(data.events)) {
                throw new Error("Event research returned an invalid response. Please try again.");
              }
              return data.events;
            })(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                reject(new Error(SEARCH_TIMEOUT_MESSAGE));
                controller.abort();
              }, EVENT_SEARCH_CLIENT_TIMEOUT_MS);
            }),
          ]);
        } finally {
          clearTimeout(timer);
          controller.abort();
        }
      },
    });
  };

  const actionableOps = (results || []).flatMap((e) =>
    e.opportunities.filter((o) => o.actionable).map((o) => ({ event: e, op: o }))
  ).slice(0, 3);
  const exportCriteria = resultCriteria ?? { marketingTypes: marketingType, categories, period, region };

  const downloadPdfReport = async () => {
    if (!results || exportingPdf) return;
    setExportError("");
    setExportingPdf(true);
    const generatedAt = new Date().toISOString();
    try {
      const pdf = await buildMarketingIntelligencePdf({ events: results, criteria: exportCriteria, generatedAt });
      downloadReportBlob(pdf.output("blob"), `event-opportunities-report-${generatedAt.slice(0, 10)}.pdf`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "The PDF could not be generated. Please try again.");
    } finally {
      setExportingPdf(false);
    }
  };

  const downloadCsvReport = () => {
    if (!results) return;
    setExportError("");
    const generatedAt = new Date().toISOString();
    try {
      const csv = buildMarketingIntelligenceCsv({ events: results, criteria: exportCriteria, generatedAt });
      downloadReportBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }),
        `event-opportunities-report-${generatedAt.slice(0, 10)}.csv`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "The CSV could not be generated. Please try again.");
    }
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
          <Labelled label="Region" hint="UK or North America.">
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
          {searching && <div className="mb-3 space-y-2">
            <CountdownBanner
              active={searching}
              durationSeconds={searchRun.estimateSeconds}
              startedAt={searchRun.startedAt}
              label="Researching event pages and checking published dates"
              sampleCount={getAuditSampleCount("events-search")}
            />
            <p className="text-[12px]" style={{ color: vars.g600 }}>This countdown is an estimate. Broader searches can take longer.</p>
          </div>}
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
              Both formats include methodology and source caveats. PDF is a formatted report; CSV has one row per opportunity for sorting.
              </p>
              <button onClick={downloadPdfReport} disabled={exportingPdf} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold border bg-white disabled:opacity-60" style={{ borderColor: vars.g200, color: vars.navy }}>
                {exportingPdf ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} color="#B83E42" />} {exportingPdf ? "Preparing PDF..." : "Download Report (PDF)"}
              </button>
              <button onClick={downloadCsvReport} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold border bg-white" style={{ borderColor: vars.g200, color: vars.navy }}>
                <FileText size={13} color="#1F7244" /> Download Report (CSV)
              </button>
            </div>
          </div>
          {exportError && <p role="alert" className="mt-2 text-[12px]" style={{ color: vars.coral }}>{exportError}</p>}
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
