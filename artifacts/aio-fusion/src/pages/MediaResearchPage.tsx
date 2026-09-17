import { useEffect, useRef, useState } from "react";
import { Check, Database, Download, ExternalLink, FileText, Loader2, RotateCcw, Search, Target, ThumbsDown, Users } from "lucide-react";
import { vars } from "../marketing/vars";
import { escapeHtml, apiBase } from "../lib/contentAi";
import { isContentStoreReady, loadArchive, useContentStore } from "../lib/contentStore";
import * as IntakeForm from "../IntakeForm";
import { getExactTargetPhrases as getCanonicalExactTargetPhrases, normaliseExactTargetPhrases, type ExactTargetPhrase } from "../lib/exactTargetPhrases";
import { SummaryRow } from "./shared";
import { RecommendationCard, LiveDiscoveryCard, isSendableContactEmail, type Contact, type Recommendation, type Decision, type LiveDiscovery, type DiscoveryReviewStatus } from "./JournalistComponents";
import { MediaOutreachPanel } from "./MediaOutreachPanel";

export type TargetingBrief = {
  topic: string;
  angle: string;
  audience: string;
  regions: string[];
  publicationTypes: string[];
  whyNow: string;
};

type RecommendationEvaluation = {
  evaluated: number;
  shortlisted: number;
  contacted: number;
  responded: number;
  placed: number;
};

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

function defaultBrief(
  selected: ResearchArticle,
  categories: string[],
  messages: string[],
  context: ReturnType<typeof projectResearchContext>,
  projectKeywords = context.keywords,
): TargetingBrief {
  const topic = context.sector || categories[0] || projectKeywords[0] || "";
  const articleText = [selected.headline, selected.title, selected.standfirst].filter(Boolean).join(" - ").trim();
  const angle = articleText || messages[0] || "";
  return {
    topic,
    angle,
    audience: "",
    regions: regionForProject(context.regionalText),
    publicationTypes: categories.length > 0 ? categories : [],
    whyNow: ""
  };
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
    const assessment = raw.assessment && typeof raw.assessment === "object"
      ? raw.assessment as Recommendation["assessment"]
      : undefined;
    const readinessReasons = assessment?.readiness?.reasons || [];
    return {
      rank: Number(raw.rank) || index + 1,
      score: Number(raw.score) || 0,
      reasons: Array.isArray(raw.reasons) ? raw.reasons.filter((reason): reason is string => typeof reason === "string") : [],
      phraseAttributions: Array.isArray(raw.phraseAttributions) ? raw.phraseAttributions : [],
      contact,
      assessment,
      recommendationSetId: typeof raw.recommendationSetId === "string" || typeof raw.recommendationSetId === "number"
        ? raw.recommendationSetId
        : undefined,
      restricted: typeof raw.restricted === "boolean"
        ? raw.restricted
        : readinessReasons.some((reason) => /suppressed|do[-\s]?not[-\s]?contact/i.test(reason)),
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
  const [decisionAssessments, setDecisionAssessments] = useState<Record<number, Recommendation["assessment"]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [liveItems, setLiveItems] = useState<LiveDiscovery[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [savedDiscoveries, setSavedDiscoveries] = useState<Record<string, DiscoveryReviewStatus>>({});
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

  const [brief, setBrief] = useState<TargetingBrief>({ topic: "", angle: "", audience: "", regions: [], publicationTypes: [], whyNow: "" });
  const [, setBriefIsDirty] = useState(false);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefLoadError, setBriefLoadError] = useState("");
  const [briefReadyKey, setBriefReadyKey] = useState("");
  const [recommendationSetId, setRecommendationSetId] = useState<number | string | null>(null);
  const [recommendationHasRun, setRecommendationHasRun] = useState(false);
  const [evaluation, setEvaluation] = useState<RecommendationEvaluation | null>(null);
  const [enrichmentWarning, setEnrichmentWarning] = useState("");
  type RequestHandle = { id: number; key: string; controller: AbortController };
  const requestSequence = useRef(0);
  const recommendationRequest = useRef<RequestHandle | null>(null);
  const liveRequest = useRef<RequestHandle | null>(null);
  const discoveryRequests = useRef<Record<string, { id: number; key: string }>>({});
  const decisionRequests = useRef<Record<number, { id: number; key: string }>>({});
  const decisionLoadSequence = useRef(0);
  const recommendationLoadSequence = useRef(0);
  const briefEditRevision = useRef(0);
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
    recommendationLoadSequence.current += 1;
    discoveryRequests.current = {};
    requestSequence.current += 1;
  };

  const requestIsCurrent = (request: RequestHandle, current: RequestHandle | null) =>
    current?.id === request.id && activeStoryRef.current === request.key;

  const decisionIsCurrent = (contactId: number, id: number, key: string) =>
    decisionRequests.current[contactId]?.id === id && activeStoryRef.current === key;

  const loadDecisions = async () => {
    if (!projectId || !storyKey) return;
    const loadId = ++decisionLoadSequence.current;
    const loadKey = `${projectId}:${storyKey}`;
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
      setDecisionAssessments(Object.fromEntries((Array.isArray(data.decisionContacts) ? data.decisionContacts : [])
        .filter((entry: { contactId?: unknown; assessment?: unknown }) => Number(entry.contactId) > 0 && entry.assessment && typeof entry.assessment === "object")
        .map((entry: { contactId: number; assessment: Recommendation["assessment"] }) => [entry.contactId, entry.assessment])));
      // Recommendation records are loaded from GET /recommendations. The
      // decisions endpoint is only for durable decisions and shortlist
      // snapshots; allowing it to replace the recommendation list can restore
      // an old set over a newer enriched result.
    } catch (reason) {
      // A failed decision load must not leave an operator looking at an old
      // article's shortlist, and a late failure from another scope must not
      // overwrite the current article's status.
      if (isCurrent()) setError(reason instanceof Error ? reason.message : "Could not load saved shortlist.");
    }
  };
  useEffect(() => { void loadDecisions(); }, [projectId, storyKey]);

  const loadRecommendations = async () => {
    if (!projectId || !storyKey) return;
    const loadId = ++recommendationLoadSequence.current;
    const loadKey = `${projectId}:${storyKey}`;
    const isCurrent = () => recommendationLoadSequence.current === loadId && activeStoryRef.current === loadKey;
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/recommendations?projectId=${encodeURIComponent(projectId)}&storyKey=${encodeURIComponent(storyKey)}`, { credentials: "include" });
      let data: Record<string, unknown> = {};
      try {
        data = await response.json() as Record<string, unknown>;
      } catch {
        if (!response.ok) throw new Error(`Could not load saved recommendations (HTTP ${response.status}).`);
        throw new Error("Could not load saved recommendations: the server returned invalid data.");
      }
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : `Could not load saved recommendations (HTTP ${response.status}).`);
      if (!isCurrent()) return;
      const set = data.recommendationSet && typeof data.recommendationSet === "object"
        ? data.recommendationSet as Record<string, unknown>
        : null;
      setRecommendationSetId(typeof set?.id === "number" || typeof set?.id === "string" ? set.id : null);
      setRecommendationHasRun(Boolean(set?.id));
      setEvaluation(data.evaluation && typeof data.evaluation === "object" ? data.evaluation as RecommendationEvaluation : null);
      setItems(Array.isArray(data.items) ? dedupeRecommendations(data.items) : []);
    } catch (reason) {
      // A failed refresh must not erase a previously visible, auditable set.
      // Keep the failure visible instead of silently falling back to generated
      // criteria or a blank recommendation list.
      if (isCurrent()) setError(reason instanceof Error ? reason.message : "Could not load saved recommendations.");
    }
  };
  useEffect(() => { void loadRecommendations(); }, [projectId, storyKey]);

  const [enriching, setEnriching] = useState<boolean>(false);

  const enrichRecommendations = async (recommendationSetId: number | string) => {
    if (!projectId || !storyKey) return;
    const requestKey = `${projectId}:${storyKey}`;
    const loadId = ++recommendationLoadSequence.current;
    setEnriching(true);
    setError("");
    setEnrichmentWarning("");
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/recommendations/enrich`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, storyKey, recommendationSetId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not enrich recommendations.");
      if (activeStoryRef.current !== requestKey || recommendationLoadSequence.current !== loadId) return;
      const set = data.recommendationSet && typeof data.recommendationSet === "object"
        ? data.recommendationSet as Record<string, unknown>
        : null;
      setRecommendationSetId(typeof set?.id === "number" || typeof set?.id === "string" ? set.id : recommendationSetId);
      setEvaluation(data.evaluation && typeof data.evaluation === "object" ? data.evaluation as RecommendationEvaluation : null);
      const nextItems = Array.isArray(data.items) ? dedupeRecommendations(data.items) : [];
      setItems(nextItems);
      const warnings = nextItems.flatMap((item) => item.assessment?.warnings || []);
      setEnrichmentWarning(Array.from(new Set(warnings)).join(" "));
      await loadDecisions();
    } catch (reason) {
      if (activeStoryRef.current === requestKey && recommendationLoadSequence.current === loadId) {
        setError(reason instanceof Error ? reason.message : "Could not enrich recommendations.");
      }
    } finally {
      if (activeStoryRef.current === requestKey && recommendationLoadSequence.current === loadId) setEnriching(false);
    }
  };

  const saveAndRecommend = async () => {
    if (!selected || !projectId) { setError("Choose a saved article and active project before matching contacts."); return; }
    
    // Save brief first
    setLoading(true);
    setError("");
    let briefForMatch = brief;
    try {
      const briefResponse = await fetch(`${apiBase()}/api/store/media-db/recommendations/brief`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, storyKey, brief })
      });
      const savedBriefResponse = await briefResponse.json() as Record<string, unknown>;
      if (!briefResponse.ok) throw new Error(typeof savedBriefResponse.error === "string" ? savedBriefResponse.error : "Could not save targeting brief.");
      const savedBrief = savedBriefResponse.brief && typeof savedBriefResponse.brief === "object"
        ? savedBriefResponse.brief as TargetingBrief
        : brief;
      briefForMatch = savedBrief;
      setBrief(savedBrief);
      setBriefIsDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save targeting brief.");
      setLoading(false);
      return;
    }

    const terms = termsFor(selected, categories, messages, brief.topic || projectContext.sector, projectKeywords);
    if (!terms.length) {
      setError("Add meaningful article or project context before matching contacts.");
      setLoading(false);
      return;
    }
    const requestKey = `${projectId}:${storyKey}`;
    if (recommendationRequest.current?.key === requestKey) {
      setLoading(false);
      return;
    }
    recommendationRequest.current?.controller.abort();
    const request: RequestHandle = { id: ++requestSequence.current, key: requestKey, controller: new AbortController() };
    recommendationRequest.current = request;
    setEnrichmentWarning("");
    setItems([]);
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/recommendations`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        signal: request.controller.signal,
         body: JSON.stringify({ projectId, storyKey, brief: briefForMatch, terms, targetPhrases: activeTargetPhrases }),
      });
      const data = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not match database contacts.");
      if (!requestIsCurrent(request, recommendationRequest.current)) return;
      const set = data.recommendationSet && typeof data.recommendationSet === "object"
        ? data.recommendationSet as Record<string, unknown>
        : null;
      setRecommendationSetId(typeof set?.id === "number" || typeof set?.id === "string" ? set.id : null);
      setRecommendationHasRun(true);
      setEvaluation(data.evaluation && typeof data.evaluation === "object" ? data.evaluation as RecommendationEvaluation : null);
      setItems(Array.isArray(data.items) ? dedupeRecommendations(data.items) : []);
      // The POST response is the authoritative newest set. Refetch decisions
      // for persistence, but do not let a concurrent/lagging GET replace that
      // freshly returned recommendation list.
    await loadDecisions();
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

  const briefLoadSequence = useRef(0);

  // Criteria are refreshed only when the article changes. This means an
  // operator can edit either field before the paid stage without a rerender
  // from the content store overwriting their work. The ref also makes the
  // effect idempotent under React StrictMode.
  useEffect(() => {
    if (!selected || !projectId || !storyKey) {
      invalidateRequests();
      setItems([]);
      setRecommendationSetId(null);
      setRecommendationHasRun(false);
      setEvaluation(null);
      setDecisions({});
      setDecisionContacts({});
      setDecisionAssessments({});
      setBriefReadyKey("");
      setBriefLoadError("");
      return;
    }
    
    const loadBrief = async () => {
      const loadId = ++briefLoadSequence.current;
      const currentKey = `${projectId}:${storyKey}`;
      const editRevisionAtStart = briefEditRevision.current;
      setBriefLoading(true);
      setBriefLoadError("");
      setBriefReadyKey("");
      try {
        const response = await fetch(`${apiBase()}/api/store/media-db/recommendations/brief?projectId=${encodeURIComponent(projectId)}&storyKey=${encodeURIComponent(storyKey)}`, { credentials: "include" });
        let data: Record<string, unknown> = {};
        try {
          data = await response.json() as Record<string, unknown>;
        } catch {
          if (!response.ok) throw new Error(`Could not load targeting brief (HTTP ${response.status}).`);
          throw new Error("Could not load targeting brief: the server returned invalid data.");
        }
        if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : `Could not load targeting brief (HTTP ${response.status}).`);
        if (briefLoadSequence.current !== loadId || activeStoryRef.current !== currentKey) return;
        
        if (briefEditRevision.current === editRevisionAtStart) {
          if (data.brief && typeof data.brief === "object") {
            setBrief(data.brief as TargetingBrief);
          } else {
            setBrief(defaultBrief(selected, categories, messages, projectContext, projectKeywords));
          }
          setBriefIsDirty(false);
          setBriefReadyKey(currentKey);
        }
      } catch (e) {
        if (briefLoadSequence.current === loadId && activeStoryRef.current === currentKey) {
          setBriefLoadError(e instanceof Error ? e.message : "Could not load targeting brief.");
          setBriefReadyKey("");
        }
      } finally {
        if (briefLoadSequence.current === loadId) setBriefLoading(false);
      }
    };
    void loadBrief();

    setItems([]);
    setRecommendationSetId(null);
    setRecommendationHasRun(false);
    setEvaluation(null);
    setLiveItems([]);
    setDiscoveryToken("");
    setSavedDiscoveries({});
    setDecisions({});
    setDecisionContacts({});
    setDecisionAssessments({});
    setError("");
    setLoading(false);
    setLiveLoading(false);
    setEnrichmentWarning("");
    
    // Article/project identity is deliberate: edits to generated fields are
    // user-owned and must not be replaced by unrelated store updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { invalidateRequests(); };
  }, [storyKey, projectId]);
  const discoverLive = async () => {
    if (!selected || !projectId) { setError("Choose a saved article and active project before searching the web."); return; }
    const criteria = generatedCriteria(selected, categories, messages, projectContext, projectKeywords);
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
           query: criteria.query,
           regions: brief.regions,
           sectorTopic: brief.topic || criteria.sectorTopic,
          brief,
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
    const requestKey = `${projectId || ""}:${storyKey}`;
    const requestId = ++requestSequence.current;
    const tokenForRequest = discoveryToken;
    discoveryRequests.current[candidate.candidateKey] = { id: requestId, key: requestKey };
    const isCurrent = () =>
      activeStoryRef.current === requestKey
      && discoveryRequests.current[candidate.candidateKey]?.id === requestId
      && discoveryRequests.current[candidate.candidateKey]?.key === requestKey;
    setSavedDiscoveries((current) => ({ ...current, [candidate.candidateKey]: "saving" }));
    setError("");
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/discoveries`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateKey: candidate.candidateKey, discoveryToken: tokenForRequest }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save this discovery.");
      if (!isCurrent()) return;
      const discovery = data.discovery && typeof data.discovery === "object"
        ? data.discovery as { status?: unknown }
        : null;
      const serverStatus = discovery?.status;
      const status: DiscoveryReviewStatus = serverStatus === "approved"
        ? "approved"
        : serverStatus === "rejected"
          ? "rejected"
          : "submitted";
      setSavedDiscoveries((current) => ({ ...current, [candidate.candidateKey]: status }));
      setError("");
    } catch (reason) {
      if (!isCurrent()) return;
      setSavedDiscoveries((current) => {
        return { ...current, [candidate.candidateKey]: "error" };
      });
      setError(reason instanceof Error ? `${reason.message} You can retry sending it for review.` : "Could not save this discovery. You can retry sending it for review.");
    }
  };
  const toggleRestriction = async (contactId: number, doNotContact: boolean) => {
    if (!projectId || !storyKey) return;
    const requestKey = `${projectId}:${storyKey}`;
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/recommendations/contact-restriction`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, storyKey, contactId, doNotContact }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save restriction.");
      
      if (activeStoryRef.current !== requestKey) return;
      // Update immediately, then re-read the saved set. The server recomputes
      // readiness from the current restriction and lifecycle state; retaining
      // the old assessment here would leave an accepted contact blocked after
      // the operator removes a restriction.
      setItems((oldItems) => oldItems.map(item => item.contact.id === contactId
        ? { ...item, restricted: Boolean(data.doNotContact) }
        : item));
      await Promise.all([loadRecommendations(), loadDecisions()]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save restriction.");
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
      await loadRecommendations();
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
      await loadRecommendations();
      await loadDecisions();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not reset refinement."); }
    finally { setRefining(null); }
  };
  const accepted = Object.values(decisions)
    .filter((d) => d.decision === "shortlisted")
    .map((d) => items.find((i) => i.contact.id === d.contactId)?.contact || decisionContacts[d.contactId])
    .filter(Boolean) as Contact[];
    
  const acceptedRecommendations = accepted.map((c) => items.find((i) => i.contact.id === c.id) || {
    rank: 0,
    contact: c,
    score: 0,
    reasons: [],
    assessment: decisionAssessments[c.id],
    restricted: decisionAssessments[c.id]?.readiness.reasons.some((reason) => /suppressed|do[-\s]?not[-\s]?contact/i.test(reason)) || false,
  });

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
  const editBrief = (patch: Partial<TargetingBrief>) => {
    briefEditRevision.current += 1;
    setBrief((current) => ({ ...current, ...patch }));
    setBriefIsDirty(true);
  };
  const toggleBriefRegion = (region: string) => {
    const regions = brief.regions.includes(region)
      ? brief.regions.filter((value) => value !== region)
      : region === "Global"
        ? ["Global"]
        : [...brief.regions.filter((value) => value !== "Global"), region];
    editBrief({ regions });
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
        onToggleRestriction={toggleRestriction}
      />
    );
  };
  return <div className="p-6 sm:p-8 max-w-6xl mx-auto"><div className="mb-6"><div className="flex gap-3 items-center"><Target color="#fff" size={28} /><h1 className="text-3xl sm:text-4xl" style={{ color: "#fff", fontFamily: "'Alice', Georgia, serif" }}>Media Research</h1></div><p className="text-[14px] mt-2" style={{ color: "rgba(255,255,255,.85)" }}>Match trusted contacts already in your database or discover current journalists from public web sources. Every live result includes evidence and a source. Live search sends the selected article excerpt to OpenAI only after you explicitly run it.</p></div>
    <section className="bg-white rounded-2xl border p-5 mb-5 shadow-sm" style={{ borderColor: vars.g200 }}><label className="block text-[12px] font-bold mb-2" style={{ color: vars.navy }}>Saved article</label><select data-testid="select-research-article" value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setItems([]); setLiveItems([]); setDiscoveryToken(""); setError(""); }} className="w-full border rounded-lg p-2 text-[13px] outline-none focus:border-slate-400"><option value="">Choose a saved article</option>{archive.map((a) => <option key={a.id} value={a.id}>{a.title} ({a.contentType})</option>)}</select>{selected && <><div className="grid sm:grid-cols-2 gap-2 mt-4"><SummaryRow label="Article" value={selected.title} /><SummaryRow label="Categories" value={categories.join(", ") || "No categories selected"} /></div><div className="mt-3 rounded-lg border px-3 py-2" style={{ borderColor: vars.g200 }}><p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: vars.g500 }}>Exact target phrases</p>{activeTargetPhrases.length ? <ul className="mt-1 list-disc pl-4 text-[13px]" style={{ color: vars.g600 }}>{activeTargetPhrases.map((phrase) => <li key={phrase.id}><span className="font-medium">{phrase.text}</span><span className="ml-2 text-[11px] text-slate-400">({phrase.intentGroup})</span></li>)}</ul> : <p className="mt-1 text-[12px] text-slate-500">No exact phrases selected for this article or project.</p>}</div></>}
       <div className="mt-5 pt-5 border-t" style={{ borderColor: vars.g100 }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[14px] font-semibold" style={{ color: vars.navy }}>Targeting Brief</h3>
            {briefLoading && <span className="text-[12px] text-slate-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Loading...</span>}
          </div>
           <p className="text-[12px] text-slate-500 mb-4">Edit the saved brief before matching contacts. This brief directs the editorial assessment.</p>
           {briefLoadError && <p className="mb-3 rounded-lg bg-rose-50 border border-rose-100 p-3 text-[12px] text-rose-700">{briefLoadError} Matching is disabled until the saved brief can be loaded.</p>}
          
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-[12px] font-bold mb-1" style={{ color: vars.navy }}>Topic</label>
               <input aria-label="Topic" value={brief.topic} onChange={e => editBrief({ topic: e.target.value })} placeholder="e.g. Cleantech, FinTech" className="w-full border rounded-lg p-2 text-[13px] outline-none focus:border-slate-400" />
            </div>
            <div>
              <label className="block text-[12px] font-bold mb-1" style={{ color: vars.navy }}>Angle</label>
               <input aria-label="Angle" value={brief.angle} onChange={e => editBrief({ angle: e.target.value })} placeholder="e.g. New product launch" className="w-full border rounded-lg p-2 text-[13px] outline-none focus:border-slate-400" />
            </div>
            <div>
              <label className="block text-[12px] font-bold mb-1" style={{ color: vars.navy }}>Audience</label>
               <input aria-label="Audience" value={brief.audience} onChange={e => editBrief({ audience: e.target.value })} placeholder="e.g. CIOs, Consumers" className="w-full border rounded-lg p-2 text-[13px] outline-none focus:border-slate-400" />
            </div>
            <div>
              <label className="block text-[12px] font-bold mb-1" style={{ color: vars.navy }}>Why Now</label>
               <input aria-label="Why now" value={brief.whyNow} onChange={e => editBrief({ whyNow: e.target.value })} placeholder="e.g. Upcoming trade show" className="w-full border rounded-lg p-2 text-[13px] outline-none focus:border-slate-400" />
            </div>
            <div>
              <label className="block text-[12px] font-bold mb-1" style={{ color: vars.navy }}>Publication Types</label>
               <input aria-label="Publication types" value={brief.publicationTypes.join(", ")} onChange={e => editBrief({ publicationTypes: e.target.value.split(",").map(t => t.trim()).filter(Boolean) })} placeholder="e.g. Technology, Finance" className="w-full border rounded-lg p-2 text-[13px] outline-none focus:border-slate-400" />
            </div>
          </div>
          
          <div className="mt-4">
            <label className="block text-[12px] font-bold mb-1" style={{ color: vars.navy }}>Regions</label>
            <div className="flex gap-2">
               {["Global", "UK", "Europe", "US"].map((region) => <button type="button" key={region} onClick={() => toggleBriefRegion(region)} className={`px-4 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors ${brief.regions.includes(region) ? "bg-slate-800 text-white border-slate-800 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{region}</button>)}
            </div>
            {brief.regions.length === 0 && <p className="text-[11px] text-amber-600 mt-1">Please select at least one region to target.</p>}
          </div>
       </div>

       <div className="mt-5 pt-5 border-t flex flex-wrap gap-3" style={{ borderColor: vars.g100 }}><button data-testid="button-recommend-contacts" disabled={loading || briefLoading || briefReadyKey !== `${projectId}:${storyKey}` || Boolean(briefLoadError) || !selected || brief.regions.length === 0 || !brief.topic || !brief.angle} onClick={() => void saveAndRecommend()} className="px-5 py-2.5 rounded-lg text-white text-[13px] font-semibold disabled:opacity-50 transition-all shadow-sm" style={{ background: vars.coral }}>{loading ? <Loader2 className="inline animate-spin mr-1.5" size={16} /> : <Target className="inline mr-1.5" size={16} />}Save brief & match database contacts</button>{items.length > 0 && <button data-testid="button-discover-live" disabled={liveLoading || briefLoading || briefReadyKey !== `${projectId}:${storyKey}` || Boolean(briefLoadError) || !selected || brief.regions.length === 0} onClick={() => void discoverLive()} className="px-5 py-2.5 rounded-lg text-white text-[13px] font-semibold disabled:opacity-50 transition-all shadow-sm" style={{ background: vars.navy }}>{liveLoading ? <Loader2 className="inline animate-spin mr-1.5" size={16} /> : <Search className="inline mr-1.5" size={16} />}Expand with live search</button>}</div><p className="mt-3 text-[11px]" style={{ color: vars.g500 }}>External live search is explicit and does not run automatically. It uses the selected article excerpt and the saved Targeting Brief for AI evaluation. The selected article excerpt is sent to OpenAI only when you explicitly run live search; any returned email must be supported by the cited public source.</p></section>
    {error && <p data-testid="status-research-error" className="p-3 rounded bg-white text-[12px] mb-5" style={{ color: vars.red }}>{error}</p>}
       {(loading || items.length > 0) && <section className="bg-white rounded-2xl border overflow-hidden mb-5 shadow-sm" style={{ borderColor: vars.g200 }}><div className="p-5 border-b flex flex-wrap justify-between gap-3" style={{ background: vars.g50, borderColor: vars.g200 }}><div><h2 className="font-semibold text-lg" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Recommended from your Media Database</h2><p className="text-[13px] mt-1" style={{ color: vars.g500 }}>{loading ? "Preparing recommendations from your project and selected article..." : `${items.length} contacts ranked from saved database fields and article-specific refinement. Match explanations show how feedback affected the order.`}</p>{evaluation && <p className="text-[11px] mt-2 text-slate-500">Evaluation: {evaluation.evaluated} evaluated · {evaluation.shortlisted} shortlisted · {evaluation.contacted} contacted · {evaluation.responded} responded · {evaluation.placed} placed</p>}</div>
       <div className="flex gap-2">
         {items.length > 0 && recommendationSetId !== null && (
           <button disabled={enriching} onClick={() => void enrichRecommendations(recommendationSetId)} className="self-start text-[12px] px-3 py-2 border rounded-lg bg-white disabled:opacity-50 hover:bg-slate-50 transition-colors shadow-sm" style={{ borderColor: vars.g200 }}>
            <FileText size={14} className={`inline mr-1 ${enriching ? "animate-pulse" : ""}`} />
            {enriching ? "Checking top 5..." : "Check top 5 recent coverage"}
          </button>
        )}
        {Object.keys(feedback).length > 0 && <button disabled={refining !== null} onClick={() => void resetRefinement()} className="self-start text-[12px] px-3 py-2 border rounded-lg bg-white disabled:opacity-50" style={{ borderColor: vars.g200 }}><RotateCcw size={14} className={`inline mr-1 ${refining === "reset" ? "animate-spin" : ""}`} />Reset refinement</button>}
       </div></div>{enrichmentWarning && <p className="mx-5 mb-3 rounded-lg bg-amber-50 border border-amber-100 p-3 text-[12px] text-amber-800">Coverage check warning: {enrichmentWarning}</p>}{items.map((item) => contactCard(item))}</section>}
     {liveItems.length > 0 && <section className="bg-white rounded-2xl border overflow-hidden mb-5 shadow-sm" style={{ borderColor: vars.g200 }}><div className="p-5 border-b" style={{ background: vars.g50, borderColor: vars.g200 }}><h2 className="font-semibold text-lg" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Unverified public web discoveries</h2><p className="text-[13px] mt-1" style={{ color: vars.g500 }}>{liveItems.length} current journalists across {livePublicationCount} publications, grounded in public author pages, profiles or article bylines. Review the evidence, then send each discovery for human approval.</p></div>
      {liveGroups.filter((group) => group.items.length > 0).map((group) => <div key={group.label}>
        <div className="px-5 py-2.5 border-b text-[12px] font-bold uppercase tracking-wide" style={{ color: vars.navy, background: "rgba(31,116,143,0.07)", borderColor: vars.g200 }}>{group.label} · {group.items.length}</div>
        {group.items.map((candidate) => (
          <LiveDiscoveryCard
            key={candidate.candidateKey}
            candidate={candidate}
            isSaving={savedDiscoveries[candidate.candidateKey] === "saving"}
             isSaved={savedDiscoveries[candidate.candidateKey] === "submitted"}
             status={savedDiscoveries[candidate.candidateKey]}
            onSave={() => void saveDiscovery(candidate)}
          />
        ))}
      </div>)}
    </section>}
     {!liveLoading && !loading && !briefLoading && !briefLoadError && !error && recommendationHasRun && items.length === 0 && liveItems.length === 0 && selected && <section className="bg-white rounded-2xl border p-5 mb-5 shadow-sm" style={{ borderColor: vars.g200 }}><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-semibold text-lg" style={{ color: vars.navy }}>No suitable saved contacts found</h2><p className="text-[12px] mt-1" style={{ color: vars.g500 }}>Find new journalists with one explicit live search. Results are unverified discoveries, not contacts, and must be sent for review before any human approval.</p></div><button data-testid="button-find-journalists" disabled={liveLoading || briefLoading || briefReadyKey !== `${projectId}:${storyKey}` || Boolean(briefLoadError)} onClick={() => void discoverLive()} className="px-4 py-2.5 rounded-lg text-white text-[13px] font-semibold disabled:opacity-50" style={{ background: vars.navy }}><Search size={15} className="inline mr-1.5" />Find new journalists</button></div></section>}
    <section className="bg-white rounded-2xl border overflow-hidden shadow-sm" style={{ borderColor: vars.g200 }}><div className="p-5 flex flex-wrap justify-between gap-2 border-b" style={{ background: vars.g50, borderColor: vars.g200 }}><div><h2 className="font-semibold text-lg" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Accepted shortlist</h2><p className="text-[13px] mt-1" style={{ color: vars.g500 }}>Persists for this article and project.</p></div>{accepted.length > 0 && <div className="flex gap-2"><button onClick={() => exportAccepted("xls")} className="text-[12px] px-3 py-1.5 border rounded-lg bg-white hover:bg-slate-50 transition-colors shadow-sm" style={{ borderColor: vars.g200 }}><Download size={14} className="inline mr-1 text-slate-400" /> Excel</button><button onClick={() => exportAccepted("doc")} className="text-[12px] px-3 py-1.5 border rounded-lg bg-white hover:bg-slate-50 transition-colors shadow-sm" style={{ borderColor: vars.g200 }}><Download size={14} className="inline mr-1 text-slate-400" /> Word</button></div>}</div>{acceptedRecommendations.length ? acceptedRecommendations.map((r) => contactCard(r, true)) : <p className="p-8 text-[14px] text-center italic" style={{ color: vars.g500 }}>Accept contacts from your recommendations to build the shortlist.</p>}</section>
    {selected && projectId && <MediaOutreachPanel projectId={projectId} storyKey={storyKey} articleTitle={selected.title} recommendations={acceptedRecommendations} targetPhrases={activeTargetPhrases} />}
  </div>;
}
export { MediaResearchPage };