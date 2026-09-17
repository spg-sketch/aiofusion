import { useEffect, useRef, useState } from "react";
import { Check, Database, Download, ExternalLink, Loader2, RotateCcw, Search, Target, ThumbsDown, Users } from "lucide-react";
import { vars } from "../marketing/vars";
import { escapeHtml, apiBase } from "../lib/contentAi";
import { isContentStoreReady, loadArchive, useContentStore } from "../lib/contentStore";
import * as IntakeForm from "../IntakeForm";
import { getExactTargetPhrases as getCanonicalExactTargetPhrases, normaliseExactTargetPhrases, type ExactTargetPhrase } from "../lib/exactTargetPhrases";
import { SummaryRow } from "./shared";
import { RecommendationCard, LiveDiscoveryCard, isSendableContactEmail, type Contact, type Recommendation, type Decision, type LiveDiscovery } from "./JournalistComponents";
import { MediaOutreachPanel } from "./MediaOutreachPanel";


type ResearchArticle = {
  title: string;
  headline?: string;
  standfirst?: string;
  bodyCopy?: string;
  body?: string;
  mediaCats?: string[];
  selectedMessages?: string[];
  targetPhrases?: ExactTargetPhrase[];
  targetPhraseIds?: string[];
};

export function resolveArticleTargetPhrases(
  article: Pick<ResearchArticle, "targetPhrases" | "targetPhraseIds"> | null | undefined,
  projectPhrases: ExactTargetPhrase[],
): ExactTargetPhrase[] {
  if (!article || (article.targetPhrases === undefined && article.targetPhraseIds === undefined)) {
    return projectPhrases;
  }
  const snapshots = normaliseExactTargetPhrases(article.targetPhrases);
  if (snapshots.length > 0) return snapshots;
  const ids = Array.isArray(article.targetPhraseIds) ? new Set(article.targetPhraseIds) : new Set<string>();
  return projectPhrases.filter((phrase) => ids.has(phrase.id));
}

export function resolveArticleResearchContext(
  article: Pick<ResearchArticle, "mediaCats" | "selectedMessages"> | null | undefined,
  projectCategories: string[],
  projectMessages: string[],
): { categories: string[]; messages: string[] } {
  const categories = Array.isArray(article?.mediaCats)
    ? article.mediaCats.filter((value): value is string => typeof value === "string")
    : projectCategories;
  const messages = Array.isArray(article?.selectedMessages)
    ? article.selectedMessages.filter((value): value is string => typeof value === "string")
    : projectMessages;
  return { categories: [...categories], messages: [...messages] };
}

function wordsFrom(values: string[]): string[] {
  return values
    .join(" ")
    .toLowerCase()
    .match(/[a-z][a-z0-9-]{2,}/g)
    ?.filter((term) => term.length > 3) || [];
}

function termsFor(selected: ResearchArticle, categories: string[], messages: string[], sectorTopic = "", projectKeywords: string[] = []) {
  // Keep both sides of the brief represented in the database criteria. A long
  // article must not crowd every intake signal out of the 30-term API contract.
  const projectTerms = wordsFrom([sectorTopic, ...categories, ...messages, ...projectKeywords]);
  const articleTerms = wordsFrom([selected.title, selected.headline || "", selected.standfirst || "", selected.bodyCopy || "", selected.body || ""]);
  return Array.from(new Set([...projectTerms.slice(0, 15), ...articleTerms.slice(0, 20)])).slice(0, 30);
}

function projectResearchContext(): {
  sector: string;
  keywords: string[];
  projectQueryKeywords: string[];
  exactPhrases: ExactTargetPhrase[];
  regionalText: string;
  hasIntakeData: boolean;
} {
  // Use IntakeForm's canonical scoped loader so one project's research
  // criteria can never fall back to another project's legacy bare-key data.
  const data = IntakeForm.loadIntakeData();
  if (!data) return { sector: "", keywords: [], projectQueryKeywords: [], exactPhrases: [], regionalText: "", hasIntakeData: false };
  const formData = data.formData && typeof data.formData === "object" ? data.formData : {};
  const sector = typeof formData["4.4"] === "string" ? formData["4.4"].trim() : "";
  const stringLocations = Array.isArray(data.stringLists?.["3.3"]) ? data.stringLists["3.3"].join(", ") : "";
  const locations = [
    typeof formData["4.5"] === "string" ? formData["4.5"] : "",
    stringLocations || (typeof formData["3.3"] === "string" ? formData["3.3"] : ""),
  ].filter(Boolean).join(", ");
  const primary = data.duals?.["1.2"];
  const additional = Array.isArray(data.dualLists?.["1.3"]) ? data.dualLists["1.3"] : [];
  const productQueries = Array.isArray(data.productQueries)
    ? data.productQueries.flatMap((query: Record<string, unknown>) => [query.area, query.phrases])
    : [];
  const projectMessages = [
    primary?.short, primary?.long,
    ...additional.flatMap((message: Record<string, unknown>) => [message.short, message.long]),
    typeof formData["1.7"] === "string" ? formData["1.7"] : "",
  ];
  return {
    sector,
    keywords: Array.from(new Set([...projectMessages, ...productQueries].filter((value): value is string => typeof value === "string" && Boolean(value.trim())))),
    projectQueryKeywords: Array.from(new Set(productQueries.filter((value): value is string => typeof value === "string" && Boolean(value.trim())))),
    exactPhrases: getCanonicalExactTargetPhrases(data.llmQueries as { v?: 1; discovery?: string[]; shortlist?: string[]; comparison?: string[] } | undefined),
    regionalText: locations,
    hasIntakeData: true,
  };
}

function regionForProject(regionalText: string): string[] {
  const text = regionalText.toLowerCase();
  const uk = /\b(uk|u\.k\.|gb|g\.b\.|united kingdom|great britain|britain|british|england|scotland|wales|northern ireland|london|manchester|birmingham|liverpool|leeds|glasgow|edinburgh|belfast)\b/.test(text);
  const europe = /\b(europe|european|eu|e\.u\.|austria|belgium|bulgaria|croatia|cyprus|czechia|czech republic|denmark|estonia|finland|france|germany|greece|hungary|ireland|italy|latvia|lithuania|luxembourg|malta|netherlands|poland|portugal|romania|slovakia|slovenia|spain|sweden|norway|switzerland|iceland|paris|berlin|brussels|amsterdam|madrid|rome|milan|lisbon|vienna|copenhagen|stockholm|helsinki|oslo|zurich|geneva|dublin)\b/.test(text);
  const us = /\b(us|u\.s\.|usa|united states|united states of america|america|american|alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|chicago|boston|los angeles|san francisco|seattle|austin)\b/.test(text);
  // Global is intentionally the safe default. A regional default is only
  // inferred when the intake has a clear, unambiguous regional focus.
  const inferred = [uk ? "UK" : "", europe ? "Europe" : "", us ? "US" : ""].filter(Boolean);
  if (inferred.length === 1) return inferred;
  return ["Global"];
}

function generatedCriteria(
  selected: ResearchArticle,
  categories: string[],
  messages: string[],
  context: ReturnType<typeof projectResearchContext>,
  projectKeywords = context.keywords,
) {
  const topic = context.sector || categories[0] || "";
  const categoryText = categories.length ? ` across ${categories.join(", ")} media` : "";
  const keywordText = projectKeywords.slice(0, 3).join(", ");
  const messageText = messages.filter(Boolean).slice(0, 2).join("; ");
  const articleText = [selected.title, selected.headline, selected.standfirst, selected.bodyCopy, selected.body]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const queryParts = [
    `Journalists and editors covering ${topic || "this story"}${categoryText}`,
    articleText ? `Story: ${articleText}` : "",
    keywordText ? `Relevant search phrases: ${keywordText}` : "",
    messageText ? `Key messages: ${messageText}` : "",
  ].filter(Boolean);
  return {
    query: queryParts.join(". ").slice(0, 1000),
    sectorTopic: topic,
    regions: regionForProject(context.regionalText),
  };
}

function dedupeRecommendations(rawItems: unknown[]): Recommendation[] {
  const seen = new Set<number>();
  return rawItems.map((item, index) => {
    const raw = (item || {}) as Record<string, unknown>;
    const contact = (raw.contact || raw) as Contact;
    return {
      rank: Number(raw.rank) || index + 1,
      score: Number(raw.score) || 0,
      reasons: Array.isArray(raw.reasons) ? raw.reasons.filter((reason): reason is string => typeof reason === "string") : [],
      phraseAttributions: Array.isArray(raw.phraseAttributions) ? raw.phraseAttributions : [],
      contact,
    };
  }).filter((item) => {
    const id = Number(item.contact?.id);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function sanitizeSpreadsheetCell(value: unknown): string {
  const text = String(value ?? "");
  return /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
}

function researchCsvCell(value: unknown): string {
  return `"${sanitizeSpreadsheetCell(value).replace(/"/g, '""')}"`;
}

function exportDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().split("T")[0];
}

export const SHORTLIST_EXPORT_COLUMNS = [
  "First Name", "Last Name", "Role", "Email", "Email Status", "Phone", "Mobile",
  "Outlet", "Category", "Country", "Publication Reach", "Beats", "Sectors",
  "Geography", "Language", "Seniority", "Editorial Status", "LinkedIn URL",
  "Source URL", "Source Reference", "Publication Authority", "Journalist Authority",
  "Confidence", "Last Verified", "Source Status", "Lifecycle Status", "Notes", "Review Notes",
] as const;

const RESEARCH_SELECTION_KEY = "aio.research.selection.v1";

function researchSelectionStorageKey(projectId: string | null): string | null {
  if (!projectId) return null;
  try {
    const rawSession = localStorage.getItem("aio.auth.session.v3");
    const session = rawSession ? JSON.parse(rawSession) as { username?: unknown } : null;
    const workspace = typeof session?.username === "string" ? session.username.trim().toLowerCase() : "";
    if (!workspace) return null;
    return `${RESEARCH_SELECTION_KEY}::${encodeURIComponent(workspace)}::${encodeURIComponent(projectId)}`;
  } catch {
    return null;
  }
}

function readRememberedResearchSelection(storageKey: string | null): string {
  if (!storageKey) return "";
  try { return sessionStorage.getItem(storageKey) || ""; } catch { return ""; }
}

function readResearchPreload(): string {
  try { return localStorage.getItem("aio.research.preload") || ""; } catch { return ""; }
}

export function shortlistExportRow(contact: Contact): string[] {
  return [
    contact.firstName,
    contact.lastName,
    contact.role,
    contact.email,
    contact.email ? (isSendableContactEmail(contact.email) ? "Sendable format" : "Review - not sendable") : "",
    contact.phone,
    contact.mobile,
    contact.outletName,
    contact.outletCategory,
    contact.outletCountry,
    contact.publicationReach || contact.outletReachBand,
    (contact.beats || []).join("; "),
    (contact.sectors || []).join("; "),
    contact.geography,
    contact.language,
    contact.seniority,
    contact.editorialStatus,
    contact.linkedinUrl,
    contact.sourceUrl,
    contact.sourceRef,
    contact.publicationAuthority,
    contact.journalistAuthority,
    contact.confidence || contact.confidenceLevel,
    exportDate(contact.lastVerifiedAt),
    contact.sourceStatus,
    contact.lifecycleStatus,
    contact.notes,
    contact.reviewNotes,
  ].map((value) => String(value ?? ""));
}

function MediaResearchPage() {
  const contentVersion = useContentStore();
  const archiveReady = isContentStoreReady();
  const archive = loadArchive().filter((a) => ["Press release", "Article", "Case study", "Whitepaper", "Blog post"].includes(a.contentType));
  const projectId = IntakeForm.getActiveProjectId();
  const selectionStorageKey = researchSelectionStorageKey(projectId);
  const projectContext = projectResearchContext();
  const projectMessages = projectContext.hasIntakeData
    ? IntakeForm.getKeyMessages().map((m) => m.long || m.short).filter((message) => Boolean(message) && !/primary message not yet set|add your primary message/i.test(message))
    : [];
  const projectCategories = IntakeForm.getProjectMediaCategories();
  const [preloadId] = useState(readResearchPreload);
  const preloadIdRef = useRef(preloadId);
  const [selectedId, setSelectedId] = useState(() => preloadId || readRememberedResearchSelection(selectionStorageKey));
  const [items, setItems] = useState<Recommendation[]>([]);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [decisionContacts, setDecisionContacts] = useState<Record<number, Contact>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [liveItems, setLiveItems] = useState<LiveDiscovery[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [savedDiscoveries, setSavedDiscoveries] = useState<Record<string, "saving" | "saved">>({});
  const [discoveryToken, setDiscoveryToken] = useState("");
  const [feedback, setFeedback] = useState<Record<number, "more" | "less">>({});
  const [refining, setRefining] = useState<number | "reset" | null>(null);
  const selected = archive.find((a) => a.id === selectedId);
  const { categories, messages } = resolveArticleResearchContext(selected, projectCategories, projectMessages);
  const projectKeywords = Array.isArray(selected?.selectedMessages)
    ? [...messages, ...projectContext.projectQueryKeywords]
    : projectContext.keywords;
  const activeTargetPhrases = resolveArticleTargetPhrases(selected, projectContext.exactPhrases);
  const storyKey = selected?.id || "";

  const [searchQuery, setSearchQuery] = useState("");
  const [regions, setRegions] = useState<string[]>(["Global"]);
  const [sectorTopic, setSectorTopic] = useState("");
  type RequestHandle = { id: number; key: string; controller: AbortController };
  const requestSequence = useRef(0);
  const recommendationRequest = useRef<RequestHandle | null>(null);
  const liveRequest = useRef<RequestHandle | null>(null);
  const decisionRequests = useRef<Record<number, { id: number; key: string }>>({});
  const decisionLoadSequence = useRef(0);
  const recommendationRevision = useRef(0);
  const activeStoryRef = useRef(`${projectId || ""}:${storyKey}`);
  activeStoryRef.current = `${projectId || ""}:${storyKey}`;

  useEffect(() => {
    // Do not validate or clear a remembered article while the content store is
    // still hydrating. `loadArchive()` is intentionally empty during that
    // window, and treating that as deletion would lose the user's selection.
    if (!archiveReady || !projectId) return;
    const explicitPreload = preloadIdRef.current;
    const currentIsValid = Boolean(selectedId && archive.some((item) => item.id === selectedId));
    const remembered = readRememberedResearchSelection(selectionStorageKey);
    const rememberedIsValid = Boolean(remembered && archive.some((item) => item.id === remembered));
    const candidate = explicitPreload
      ? (archive.some((item) => item.id === explicitPreload) ? explicitPreload : "")
      : (currentIsValid ? selectedId : (rememberedIsValid ? remembered : ""));

    if (candidate !== selectedId) setSelectedId(candidate);
    try { localStorage.removeItem("aio.research.preload"); } catch { /* noop */ }
    preloadIdRef.current = "";
    try {
      if (candidate && archive.some((item) => item.id === candidate) && selectionStorageKey) {
        sessionStorage.setItem(selectionStorageKey, candidate);
      } else if (selectionStorageKey) {
        sessionStorage.removeItem(selectionStorageKey);
      }
    } catch { /* storage may be unavailable */ }
  }, [archiveReady, contentVersion, projectId, selectedId, selectionStorageKey]);

  const invalidateRequests = () => {
    recommendationRequest.current?.controller.abort();
    liveRequest.current?.controller.abort();
    recommendationRequest.current = null;
    liveRequest.current = null;
    // Decision PUTs are deliberately not aborted: the server mutation may
    // already be authorised and cancelling it could make the UI disagree with
    // persistence. Clearing their identities still prevents stale responses
    // from mutating the next article/project view.
    decisionRequests.current = {};
    decisionLoadSequence.current += 1;
    requestSequence.current += 1;
  };

  const requestIsCurrent = (request: RequestHandle, current: RequestHandle | null) =>
    current?.id === request.id && activeStoryRef.current === request.key;

  const decisionIsCurrent = (contactId: number, id: number, key: string) =>
    decisionRequests.current[contactId]?.id === id && activeStoryRef.current === key;

  const toggleRegion = (reg: string) => {
    setRegions((prev) => {
      if (reg === "Global") return prev.includes("Global") ? prev : ["Global"];
      if (prev.includes(reg)) {
        if (prev.length === 1) return prev;
        return prev.filter((r) => r !== reg);
      }
      return [...prev.filter((r) => r !== "Global"), reg];
    });
  };

  const loadDecisions = async (includeRecommendationItems = true) => {
    if (!projectId || !storyKey) return;
    const loadId = ++decisionLoadSequence.current;
    const loadKey = `${projectId}:${storyKey}`;
    const revisionAtStart = recommendationRevision.current;
    const isCurrent = () => decisionLoadSequence.current === loadId && activeStoryRef.current === loadKey;
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/recommendations/decisions?projectId=${encodeURIComponent(projectId)}&storyKey=${encodeURIComponent(storyKey)}`, { credentials: "include" });
      let data: Record<string, unknown> = {};
      try {
        data = await response.json() as Record<string, unknown>;
      } catch {
        if (!response.ok) throw new Error(`Could not load saved shortlist (HTTP ${response.status}).`);
        throw new Error("Could not load saved shortlist: the server returned invalid data.");
      }
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : `Could not load saved shortlist (HTTP ${response.status}).`);
      if (!isCurrent()) return;
      setDecisions(Object.fromEntries((Array.isArray(data.decisions) ? data.decisions : []).map((d: Decision) => [d.contactId, d])));
      setFeedback(Object.fromEntries((Array.isArray(data.feedback) ? data.feedback : []).map((entry: { contactId: number; signal: "more" | "less" }) => [entry.contactId, entry.signal])));
      setDecisionContacts(Object.fromEntries((Array.isArray(data.decisionContacts) ? data.decisionContacts : [])
        .filter((entry: { contactId?: unknown; contact?: unknown }) => Number(entry.contactId) > 0 && entry.contact && typeof entry.contact === "object")
        .map((entry: { contactId: number; contact: Contact }) => [entry.contactId, entry.contact])));
      // The decisions endpoint includes persisted recommendation records so the
      // shortlist remains useful after a page reload, without regenerating it.
      if (includeRecommendationItems && revisionAtStart === recommendationRevision.current && Array.isArray(data.items)) {
        setItems(dedupeRecommendations(data.items));
      }
    } catch (reason) {
      // A failed decision load must not leave an operator looking at an old
      // article's shortlist, and a late failure from another scope must not
      // overwrite the current article's status.
      if (isCurrent()) setError(reason instanceof Error ? reason.message : "Could not load saved shortlist.");
    }
  };
  useEffect(() => { void loadDecisions(); }, [projectId, storyKey]);

  const recommend = async (automatic = false) => {
    if (!selected || !projectId) { setError("Choose a saved article and active project before matching contacts."); return; }
    const terms = termsFor(selected, categories, messages, projectContext.sector, projectKeywords);
    if (!terms.length) {
      if (!automatic) setError("Add meaningful article or project context before matching contacts.");
      return;
    }
    const requestKey = `${projectId}:${storyKey}`;
    if (recommendationRequest.current?.key === requestKey) return;
    recommendationRequest.current?.controller.abort();
    const request: RequestHandle = { id: ++requestSequence.current, key: requestKey, controller: new AbortController() };
    recommendationRequest.current = request;
    recommendationRevision.current += 1;
    setLoading(true); setError(""); if (!automatic) setItems([]);
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/recommendations`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        signal: request.controller.signal,
        body: JSON.stringify({ projectId, storyKey, terms, targetPhrases: activeTargetPhrases }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not match database contacts.");
      if (!requestIsCurrent(request, recommendationRequest.current)) return;
      setItems(Array.isArray(data.items) ? dedupeRecommendations(data.items) : []);
      // The POST response is the authoritative newest set. Refetch decisions
      // for persistence, but do not let a concurrent/lagging GET replace that
      // freshly returned recommendation list.
      await loadDecisions(false);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      if (requestIsCurrent(request, recommendationRequest.current)) setError(reason instanceof Error ? reason.message : "Could not match database contacts.");
    } finally {
      if (requestIsCurrent(request, recommendationRequest.current)) {
        recommendationRequest.current = null;
        setLoading(false);
      }
    }
  };

  // Criteria are refreshed only when the article changes. This means an
  // operator can edit either field before the paid stage without a rerender
  // from the content store overwriting their work. The ref also makes the
  // effect idempotent under React StrictMode.
  useEffect(() => {
    if (!selected || !projectId || !storyKey) return;
    const criteria = generatedCriteria(selected, categories, messages, projectContext, projectKeywords);
    setSearchQuery(criteria.query);
    setSectorTopic(criteria.sectorTopic);
    setRegions(criteria.regions);
    setItems([]);
    setLiveItems([]);
    setDiscoveryToken("");
    setDecisions({});
    setDecisionContacts({});
    setError("");
    setLoading(false);
    setLiveLoading(false);
    let cancelled = false;
    // Deferring by one microtask lets React StrictMode's first setup/cleanup
    // pair cancel the provisional invocation, so exactly one POST is made.
    queueMicrotask(() => {
      if (!cancelled) void recommend(true);
    });
    // Article/project identity is deliberate: edits to generated fields are
    // user-owned and must not be replaced by unrelated store updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => {
      cancelled = true;
      invalidateRequests();
    };
  }, [storyKey, projectId]);
  const discoverLive = async () => {
    if (!selected || !projectId) { setError("Choose a saved article and active project before searching the web."); return; }
    const requestKey = `${projectId}:${storyKey}`;
    liveRequest.current?.controller.abort();
    const request: RequestHandle = { id: ++requestSequence.current, key: requestKey, controller: new AbortController() };
    liveRequest.current = request;
    setLiveLoading(true); setError(""); setLiveItems([]);
    try {
      const response = await fetch(`${apiBase()}/api/content/media-discover`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        signal: request.controller.signal,
        body: JSON.stringify({
          projectId,
          content: {
            title: selected.title,
            headline: selected.headline,
            standfirst: selected.standfirst,
            bodyCopy: selected.bodyCopy || selected.body,
          },
          mediaCategories: categories,
          keyMessages: messages,
          query: searchQuery,
          regions,
          sectorTopic,
            targetPhrases: activeTargetPhrases,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not complete live media research.");
      if (!requestIsCurrent(request, liveRequest.current)) return;
      setLiveItems(Array.isArray(data.items) ? data.items : []);
      setDiscoveryToken(typeof data.discoveryToken === "string" ? data.discoveryToken : "");
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      if (requestIsCurrent(request, liveRequest.current)) setError(reason instanceof Error ? reason.message : "Could not complete live media research.");
    } finally {
      if (requestIsCurrent(request, liveRequest.current)) {
        liveRequest.current = null;
        setLiveLoading(false);
      }
    }
  };
  const saveDiscovery = async (candidate: LiveDiscovery) => {
    setSavedDiscoveries((current) => ({ ...current, [candidate.candidateKey]: "saving" }));
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/discoveries`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateKey: candidate.candidateKey, discoveryToken }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save this discovery.");
      setSavedDiscoveries((current) => ({ ...current, [candidate.candidateKey]: "saved" }));
    } catch (reason) {
      setSavedDiscoveries((current) => {
        const next = { ...current };
        delete next[candidate.candidateKey];
        return next;
      });
      setError(reason instanceof Error ? reason.message : "Could not save this discovery.");
    }
  };
  const saveDecision = async (contactId: number, decision: Decision["decision"], nextNote = "") => {
    if (!projectId || !storyKey) return;
    const requestKey = `${projectId}:${storyKey}`;
    // A decision GET that started before this PUT is only a historical
    // snapshot. Invalidate it before the mutation so its late response cannot
    // overwrite the newer local decision.
    decisionLoadSequence.current += 1;
    const requestId = ++requestSequence.current;
    decisionRequests.current[contactId] = { id: requestId, key: requestKey };
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/recommendations/decisions`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, storyKey, contactId, decision, note: nextNote }),
      });
      const data = await response.json();
      if (!decisionIsCurrent(contactId, requestId, requestKey)) return;
      if (!response.ok) { setError(data.error || "Could not save this decision."); return; }
      setDecisions((old) => ({ ...old, [contactId]: data.decision }));
      if (decision === "shortlisted") {
        const contact = items.find((item) => item.contact.id === contactId)?.contact;
        if (contact) setDecisionContacts((old) => ({ ...old, [contactId]: contact }));
      }
      setNoteFor(null); setNote("");
    } catch (reason) {
      if (decisionIsCurrent(contactId, requestId, requestKey)) {
        setError(reason instanceof Error ? reason.message : "Could not save this decision.");
      }
    } finally {
      if (decisionRequests.current[contactId]?.id === requestId) delete decisionRequests.current[contactId];
    }
  };
  const refine = async (contactId: number, signal: "more" | "less" | null) => {
    if (!projectId || !storyKey) return;
    setRefining(contactId); setError("");
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/recommendations/feedback`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, storyKey, contactId, signal }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not refine recommendations.");
      await loadDecisions();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not refine recommendations."); }
    finally { setRefining(null); }
  };
  const resetRefinement = async () => {
    if (!projectId || !storyKey) return;
    setRefining("reset"); setError("");
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/recommendations/feedback`, {
        method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, storyKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not reset refinement.");
      await loadDecisions();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not reset refinement."); }
    finally { setRefining(null); }
  };
  const accepted = Object.values(decisions)
    .filter((d) => d.decision === "shortlisted")
    .map((d) => items.find((i) => i.contact.id === d.contactId)?.contact || decisionContacts[d.contactId])
    .filter(Boolean) as Contact[];
  const livePublicationCount = new Set(liveItems.map((item) => item.outletName.trim().toLowerCase()).filter(Boolean)).size;
  const liveGroups = [
    {
      label: "United Kingdom",
      items: liveItems.filter((item) => /\b(uk|united kingdom|england|scotland|wales|london)\b/i.test(item.geography || "")),
    },
    {
      label: "United States",
      items: liveItems.filter((item) => /\b(us|usa|united states|new york|washington|california)\b/i.test(item.geography || "")),
    },
    {
      label: "Europe",
      items: liveItems.filter((item) => !/\b(uk|united kingdom|england|scotland|wales|london)\b/i.test(item.geography || "")
        && /\b(europe|european|eu|france|germany|italy|spain|ireland|netherlands|belgium|sweden|denmark|norway|finland|switzerland|austria|poland|portugal|paris|berlin|brussels|amsterdam|madrid|rome|milan|dublin)\b/i.test(item.geography || "")),
    },
  ];
  const groupedKeys = new Set(liveGroups.flatMap((group) => group.items.map((item) => item.candidateKey)));
  liveGroups.push({ label: "Other or global", items: liveItems.filter((item) => !groupedKeys.has(item.candidateKey)) });
  const exportAccepted = (format: "xls" | "doc") => {
    const title = "Accepted Media Contacts";
    const content = format === "xls"
      ? [SHORTLIST_EXPORT_COLUMNS, ...accepted.map(shortlistExportRow)].map((row) => row.map(researchCsvCell).join(",")).join("\r\n")
      : `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1><table border="1"><tr>${SHORTLIST_EXPORT_COLUMNS.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>${accepted.map((contact) => `<tr>${shortlistExportRow(contact).map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
    const blob = new Blob([content], { type: format === "xls" ? "text/csv;charset=utf-8;" : "application/msword" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${title}.${format === "xls" ? "csv" : "doc"}`; link.click(); URL.revokeObjectURL(url);
  };
  const contactCard = (item: Recommendation, shortlist = false) => {
    return (
      <RecommendationCard
        key={item.contact.id}
        item={item}
        decision={decisions[item.contact.id]}
        onAccept={() => void saveDecision(item.contact.id, "shortlisted", decisions[item.contact.id]?.note || "")}
        onDecline={() => { setNoteFor(item.contact.id); setNote(decisions[item.contact.id]?.note || ""); }}
        onReject={(n) => void saveDecision(item.contact.id, "rejected", n)}
        noteFor={noteFor}
        setNoteFor={setNoteFor}
        note={note}
        setNote={setNote}
        isShortlist={shortlist}
        refinement={feedback[item.contact.id]}
        refinementLoading={refining === item.contact.id}
        onRefine={shortlist ? undefined : (signal) => void refine(item.contact.id, signal)}
      />
    );
  };
  return <div className="p-6 sm:p-8 max-w-6xl mx-auto"><div className="mb-6"><div className="flex gap-3 items-center"><Target color="#fff" size={28} /><h1 className="text-3xl sm:text-4xl" style={{ color: "#fff", fontFamily: "'Alice', Georgia, serif" }}>Media Research</h1></div><p className="text-[14px] mt-2" style={{ color: "rgba(255,255,255,.85)" }}>Match trusted contacts already in your database or discover current journalists from public web sources. Every live result includes evidence and a source.</p></div>
    <section className="bg-white rounded-2xl border p-5 mb-5 shadow-sm" style={{ borderColor: vars.g200 }}><label className="block text-[12px] font-bold mb-2" style={{ color: vars.navy }}>Saved article</label><select data-testid="select-research-article" value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setItems([]); setLiveItems([]); setDiscoveryToken(""); setError(""); }} className="w-full border rounded-lg p-2 text-[13px] outline-none focus:border-slate-400"><option value="">Choose a saved article</option>{archive.map((a) => <option key={a.id} value={a.id}>{a.title} ({a.contentType})</option>)}</select>{selected && <><div className="grid sm:grid-cols-2 gap-2 mt-4"><SummaryRow label="Article" value={selected.title} /><SummaryRow label="Categories" value={categories.join(", ") || "No categories selected"} /></div><div className="mt-3 rounded-lg border px-3 py-2" style={{ borderColor: vars.g200 }}><p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: vars.g500 }}>Exact target phrases</p>{activeTargetPhrases.length ? <ul className="mt-1 list-disc pl-4 text-[13px]" style={{ color: vars.g600 }}>{activeTargetPhrases.map((phrase) => <li key={phrase.id}><span className="font-medium">{phrase.text}</span><span className="ml-2 text-[11px] text-slate-400">({phrase.intentGroup})</span></li>)}</ul> : <p className="mt-1 text-[12px] text-slate-500">No exact phrases selected for this article or project.</p>}</div></>}
       <div className="mt-5 pt-5 border-t" style={{ borderColor: vars.g100 }}>
          <h3 className="text-[14px] font-semibold mb-1" style={{ color: vars.navy }}>Live Search Criteria</h3>
          <p className="text-[12px] text-slate-500 mb-3">Generated from your project and selected article. Review or edit before expanding with live search.</p>
         <div className="grid md:grid-cols-2 gap-4">
           <div>
             <label className="block text-[12px] font-bold mb-1" style={{ color: vars.navy }}>Natural Language Query</label>
             <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="e.g. 'Tech reporters in London who cover AI'" className="w-full border rounded-lg p-2 text-[13px] outline-none focus:border-slate-400" />
             <p className="text-[11px] text-slate-500 mt-1">Examples: "US consumer tech editors", "Journalists writing about renewable energy"</p>
           </div>
           <div>
             <label className="block text-[12px] font-bold mb-1" style={{ color: vars.navy }}>Sector / Topic (optional)</label>
             <input value={sectorTopic} onChange={e => setSectorTopic(e.target.value)} placeholder="e.g. Cleantech, FinTech" className="w-full border rounded-lg p-2 text-[13px] outline-none focus:border-slate-400" />
           </div>
         </div>
         <div className="mt-4">
           <label className="block text-[12px] font-bold mb-1" style={{ color: vars.navy }}>Regions</label>
           <div className="flex gap-2">
              {["Global", "UK", "Europe", "US"].map((region) => <button key={region} onClick={() => toggleRegion(region)} className={`px-4 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors ${regions.includes(region) ? "bg-slate-800 text-white border-slate-800 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{region}</button>)}
           </div>
         </div>
       </div>

     <div className="mt-5 pt-5 border-t flex flex-wrap gap-3" style={{ borderColor: vars.g100 }}><button data-testid="button-recommend-contacts" disabled={loading || liveLoading || !selected} onClick={() => void recommend()} className="px-5 py-2.5 rounded-lg text-white text-[13px] font-semibold disabled:opacity-50 transition-all shadow-sm" style={{ background: vars.coral }}>{loading ? <Loader2 className="inline animate-spin mr-1.5" size={16} /> : <Target className="inline mr-1.5" size={16} />}Match database contacts</button><button data-testid="button-discover-live" disabled={liveLoading || !selected || !searchQuery.trim()} onClick={() => void discoverLive()} className="px-5 py-2.5 rounded-lg text-white text-[13px] font-semibold disabled:opacity-50 transition-all shadow-sm" style={{ background: vars.navy }}>{liveLoading ? <Loader2 className="inline animate-spin mr-1.5" size={16} /> : <Search className="inline mr-1.5" size={16} />}Expand with live search</button></div><p className="mt-3 text-[11px]" style={{ color: vars.g500 }}>External live search is explicit and does not run automatically. It sends the selected article excerpt, media categories, key messages and your edited criteria to OpenAI. Email addresses are included only when explicitly published in a cited source.</p></section>
    {error && <p data-testid="status-research-error" className="p-3 rounded bg-white text-[12px] mb-5" style={{ color: vars.red }}>{error}</p>}
      {(loading || items.length > 0) && <section className="bg-white rounded-2xl border overflow-hidden mb-5 shadow-sm" style={{ borderColor: vars.g200 }}><div className="p-5 border-b flex flex-wrap justify-between gap-3" style={{ background: vars.g50, borderColor: vars.g200 }}><div><h2 className="font-semibold text-lg" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Recommended from your Media Database</h2><p className="text-[13px] mt-1" style={{ color: vars.g500 }}>{loading ? "Automatically preparing recommendations from your project and selected article..." : `${items.length} contacts ranked from saved database fields and article-specific refinement. Match explanations show how feedback affected the order.`}</p></div>{Object.keys(feedback).length > 0 && <button disabled={refining !== null} onClick={() => void resetRefinement()} className="self-start text-[12px] px-3 py-2 border rounded-lg bg-white disabled:opacity-50" style={{ borderColor: vars.g200 }}><RotateCcw size={14} className={`inline mr-1 ${refining === "reset" ? "animate-spin" : ""}`} />Reset refinement</button>}</div>{items.map((item) => contactCard(item))}</section>}
    {liveItems.length > 0 && <section className="bg-white rounded-2xl border overflow-hidden mb-5 shadow-sm" style={{ borderColor: vars.g200 }}><div className="p-5 border-b" style={{ background: vars.g50, borderColor: vars.g200 }}><h2 className="font-semibold text-lg" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Live public web discoveries</h2><p className="text-[13px] mt-1" style={{ color: vars.g500 }}>{liveItems.length} current journalists across {livePublicationCount} publications, grounded in public author pages, profiles or article bylines. Review the evidence before saving.</p></div>
      {liveGroups.filter((group) => group.items.length > 0).map((group) => <div key={group.label}>
        <div className="px-5 py-2.5 border-b text-[12px] font-bold uppercase tracking-wide" style={{ color: vars.navy, background: "rgba(31,116,143,0.07)", borderColor: vars.g200 }}>{group.label} · {group.items.length}</div>
        {group.items.map((candidate) => (
          <LiveDiscoveryCard
            key={candidate.candidateKey}
            candidate={candidate}
            isSaving={savedDiscoveries[candidate.candidateKey] === "saving"}
            isSaved={savedDiscoveries[candidate.candidateKey] === "saved"}
            onSave={() => void saveDiscovery(candidate)}
          />
        ))}
      </div>)}
    </section>}
     {!liveLoading && liveItems.length === 0 && selected && <section className="bg-white rounded-2xl border p-4 mb-5" style={{ borderColor: vars.g200 }}><h2 className="font-semibold" style={{ color: vars.navy }}>Expand with live search for additional externally verified contacts</h2><p className="text-[12px] mt-1" style={{ color: vars.g500 }}>Run an explicit live search for current journalists and editors whose public work directly matches this article.</p></section>}
    <section className="bg-white rounded-2xl border overflow-hidden shadow-sm" style={{ borderColor: vars.g200 }}><div className="p-5 flex flex-wrap justify-between gap-2 border-b" style={{ background: vars.g50, borderColor: vars.g200 }}><div><h2 className="font-semibold text-lg" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Accepted shortlist</h2><p className="text-[13px] mt-1" style={{ color: vars.g500 }}>Persists for this article and project.</p></div>{accepted.length > 0 && <div className="flex gap-2"><button onClick={() => exportAccepted("xls")} className="text-[12px] px-3 py-1.5 border rounded-lg bg-white hover:bg-slate-50 transition-colors shadow-sm" style={{ borderColor: vars.g200 }}><Download size={14} className="inline mr-1 text-slate-400" /> Excel</button><button onClick={() => exportAccepted("doc")} className="text-[12px] px-3 py-1.5 border rounded-lg bg-white hover:bg-slate-50 transition-colors shadow-sm" style={{ borderColor: vars.g200 }}><Download size={14} className="inline mr-1 text-slate-400" /> Word</button></div>}</div>{accepted.length ? accepted.map((c) => contactCard({ rank: 0, contact: c, score: items.find((i) => i.contact.id === c.id)?.score || 0, reasons: items.find((i) => i.contact.id === c.id)?.reasons || [] }, true)) : <p className="p-8 text-[14px] text-center italic" style={{ color: vars.g500 }}>Accept contacts from your recommendations to build the shortlist.</p>}</section>
    {selected && projectId && <MediaOutreachPanel projectId={projectId} storyKey={storyKey} articleTitle={selected.title} contacts={accepted} targetPhrases={activeTargetPhrases} />}
  </div>;
}
export { MediaResearchPage };