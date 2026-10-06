import { useEffect, useRef, useState } from "react";
import { Download, FileText, Loader2, Search, Target } from "lucide-react";
import { vars } from "../marketing/vars";
import { apiBase } from "../lib/contentAi";
import { isContentStoreReady, loadArchive, useContentStore } from "../lib/contentStore";
import * as IntakeForm from "../IntakeForm";
import { getExactTargetPhrases as getCanonicalExactTargetPhrases, normaliseExactTargetPhrases, type ExactTargetPhrase } from "../lib/exactTargetPhrases";
import { SummaryRow } from "./shared";
import { RecommendationCard, LiveDiscoveryCard, type Contact, type Recommendation, type Decision, type LiveDiscovery, type DiscoveryReviewStatus } from "./JournalistComponents";
import { MediaOutreachPanel } from "./MediaOutreachPanel";
import { aiRunKey, discardAiRun, startAiRun, useAiRun } from "../lib/aiRunLifecycle";
import { getSession } from "../lib/auth";
import { useDatabaseCategories } from "../lib/databaseCategories";
import { getAuditDurationSeconds, getAuditSampleCount, recordAuditDuration } from "../lib/auditTiming";
import CountdownBanner from "../components/CountdownBanner";

export type TargetingBrief = {
  topic: string;
  angle: string;
  audience: string;
  regions: string[];
  publicationTypes: string[];
  whyNow: string;
};

function normaliseTargetingBrief(value: unknown, fallback: TargetingBrief): TargetingBrief {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const stringList = (field: unknown, defaultValue: string[]) => Array.isArray(field)
    ? field.filter((entry): entry is string => typeof entry === "string")
    : defaultValue;
  return {
    topic: typeof raw.topic === "string" ? raw.topic : fallback.topic,
    angle: typeof raw.angle === "string" ? raw.angle : fallback.angle,
    audience: typeof raw.audience === "string" ? raw.audience : fallback.audience,
    regions: stringList(raw.regions, fallback.regions),
    // Older briefs could contain multiple sectors. Keep the first saved value
    // as the deterministic single-select choice; the server record is only
    // changed when the user explicitly saves the brief.
    publicationTypes: stringList(raw.publicationTypes, fallback.publicationTypes).slice(0, 1),
    whyNow: typeof raw.whyNow === "string" ? raw.whyNow : fallback.whyNow,
  };
}

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
  const us = /\b(us|u\.s\.|usa|united states|united states of america|america|american|alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|chicago|boston|los angeles|san francisco|seattle|austin)\b/.test(text);
  // Global is intentionally the safe default. A regional default is only
  // inferred when the intake has a clear, unambiguous regional focus.
  const inferred = [uk ? "UK" : "", us ? "US" : ""].filter(Boolean);
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
    publicationTypes: [],
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
      pitchSuggestion: raw.pitchSuggestion && typeof raw.pitchSuggestion === "object"
        ? raw.pitchSuggestion as Recommendation["pitchSuggestion"] : undefined,
      pitchError: typeof raw.pitchError === "string" ? raw.pitchError : undefined,
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

function mergeLiveDiscoveryItems(current: LiveDiscovery[], incoming: LiveDiscovery[]): LiveDiscovery[] {
  const byKey = new Map<string, LiveDiscovery>(incoming.map((item): [string, LiveDiscovery] => [item.candidateKey, item]));
  const ordered = current.map((item) => byKey.get(item.candidateKey) || item);
  const seen = new Set(ordered.map((item) => item.candidateKey));
  return [...ordered, ...incoming.filter((item) => !seen.has(item.candidateKey))];
}

function researchRequestError(response: Response, data: Record<string, unknown>, fallback: string): Error {
  if (response.status === 429) {
    return new Error("This request reached the account's AI spend limit or request quota. Ask an account admin to review the limit, or try again after it resets.");
  }
  return new Error(typeof data.error === "string" ? data.error : fallback);
}

const RESEARCH_SELECTION_KEY = "aio.research.selection.v1";
const DISCOVERY_RESET_KEY = "aio.research.discovery-reset.v1";
const RECOMMENDATION_PAGE_SIZE = 5;

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

function discoveryResetStorageKey(runKey: string): string {
  return `${DISCOVERY_RESET_KEY}::${encodeURIComponent(runKey)}`;
}

function serverDiscoveryWasReset(runKey: string): boolean {
  try { return sessionStorage.getItem(discoveryResetStorageKey(runKey)) === "1"; } catch { return false; }
}

function markServerDiscoveryReset(runKey: string): void {
  try { sessionStorage.setItem(discoveryResetStorageKey(runKey), "1"); } catch { /* browser storage may be unavailable */ }
}

function clearServerDiscoveryReset(runKey: string): void {
  try { sessionStorage.removeItem(discoveryResetStorageKey(runKey)); } catch { /* browser storage may be unavailable */ }
}

function readRememberedResearchSelection(storageKey: string | null): string {
  if (!storageKey) return "";
  try { return sessionStorage.getItem(storageKey) || ""; } catch { return ""; }
}

function readResearchPreload(): string {
  try { return localStorage.getItem("aio.research.preload") || ""; } catch { return ""; }
}

function MediaResearchPage() {
  const contentVersion = useContentStore();
  const archiveReady = isContentStoreReady();
  const archive = loadArchive().filter((a) => ["Press release", "Article", "Case study", "Whitepaper", "Blog post"].includes(a.contentType));
  const projectId = IntakeForm.getActiveProjectId();
  const session = getSession();
  const workspaceId = session?.username || "";
  const discoveryScope = {
    sessionId: session?.userEmail || session?.userName || workspaceId || "anonymous",
    workspaceId: workspaceId || "default",
    projectId: projectId || "none",
  };
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
  const [recommendationPage, setRecommendationPage] = useState(1);
  const [recommendationPageLoading, setRecommendationPageLoading] = useState(false);
  const [recommendationPagination, setRecommendationPagination] = useState<{
    start: number;
    end: number;
    hasPrevious: boolean;
    hasNext: boolean;
  } | null>(null);
  const [rankingRevision, setRankingRevision] = useState<string | number | null>(null);
  const [visibilityRevision, setVisibilityRevision] = useState<string | number | null>(null);
  const [collectionTotal, setCollectionTotal] = useState<number | null>(null);
  const [totalMatches, setTotalMatches] = useState<number | null>(null);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [exportSelection, setExportSelection] = useState<number[] | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const [decisionSaving, setDecisionSaving] = useState<Record<string, boolean>>({});
  const [decisionContacts, setDecisionContacts] = useState<Record<number, Contact>>({});
  const [decisionAssessments, setDecisionAssessments] = useState<Record<number, Recommendation["assessment"]>>({});
  const [decisionPitches, setDecisionPitches] = useState<Record<number, Recommendation["pitchSuggestion"]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [liveItems, setLiveItems] = useState<LiveDiscovery[]>([]);
  const [remoteEmptyDiscoveryKey, setRemoteEmptyDiscoveryKey] = useState("");
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveNow, setLiveNow] = useState(() => Date.now());
  const [savedDiscoveries, setSavedDiscoveries] = useState<Record<string, DiscoveryReviewStatus>>({});
  const [discoveryToken, setDiscoveryToken] = useState("");
  const researchGeneration = useRef(0);
  const [bookmarkedContacts, setBookmarkedContacts] = useState<Set<number>>(() => new Set());
  const [bookmarkLoading, setBookmarkLoading] = useState<Record<number, boolean>>({});
  const [bookmarkLoadError, setBookmarkLoadError] = useState("");
  const [bookmarkLoadAttempt, setBookmarkLoadAttempt] = useState(0);
  const bookmarkWorkspaceRef = useRef(workspaceId);
  bookmarkWorkspaceRef.current = workspaceId;
  const databaseCategories = useDatabaseCategories();
  const selected = archive.find((a) => a.id === selectedId);
  const { categories, messages } = resolveArticleResearchContext(selected, projectCategories, projectMessages);
  const projectKeywords = Array.isArray(selected?.selectedMessages)
    ? [...messages, ...projectContext.projectQueryKeywords]
    : projectContext.keywords;
  const activeTargetPhrases = resolveArticleTargetPhrases(selected, projectContext.exactPhrases);
  const storyKey = selected?.id || "";
  useEffect(() => {
    setExportSelection(null);
    setExportError("");
  }, [projectId, storyKey]);
  const discoveryRunKey = aiRunKey(discoveryScope, "media-discover", storyKey || "new-article");
  type DiscoveryRunResult = { items: LiveDiscovery[]; discoveryToken: string };
  type RemoteDiscoveryRun = DiscoveryRunResult & { runId: string; status: "running" | "succeeded" | "failed"; error?: string; startedAt?: string };
  const discoveryRun = useAiRun<
    { projectId: string; storyKey: string; serverStartedAt?: number },
    DiscoveryRunResult
  >(discoveryRunKey);
  const showEmptyDiscovery = Boolean(selected)
    && !liveLoading
    && liveItems.length === 0
    && (discoveryRun
      ? discoveryRun.status === "succeeded" && discoveryRun.result?.items.length === 0
      : remoteEmptyDiscoveryKey === discoveryRunKey);
  const discoveryStartedAt = discoveryRun?.input.serverStartedAt ?? discoveryRun?.startedAt;
  const liveElapsedSeconds = discoveryStartedAt ? Math.max(0, Math.floor((liveNow - discoveryStartedAt) / 1000)) : 0;
  const liveEstimatedSeconds = discoveryRun?.estimateSeconds ?? getAuditDurationSeconds("media-discover");
  const verifiedLiveCount = liveItems.filter((item) => item.evidenceStatus === "verified" || !item.evidenceStatus).length;
  const pendingLiveCount = liveItems.filter((item) => item.evidenceStatus === "pending").length;
  const liveStage = pendingLiveCount > 0
    ? "Checking evidence"
    : verifiedLiveCount > 0
      ? liveLoading ? "Verified results ready · search continues" : "Verified results ready"
      : liveLoading
        ? "Finding sources"
        : discoveryRun?.status === "failed"
          ? "Search failed"
          : discoveryRun?.status === "succeeded"
            ? "Search complete"
            : "";

  useEffect(() => {
    if (!liveLoading) return;
    const timer = window.setInterval(() => setLiveNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [liveLoading]);

  useEffect(() => {
    let active = true;
    setBookmarkedContacts(new Set());
    setBookmarkLoading({});
    setBookmarkLoadError("");
    void (async () => {
      try {
        const rows: Array<Record<string, unknown>> = [];
        let page = 1;
        let total = Number.POSITIVE_INFINITY;
        const pageSize = 100;
        while ((page - 1) * pageSize < total && page <= 100) {
          const response = await fetch(`${apiBase()}/api/store/media-db/bookmarks?page=${page}&pageSize=${pageSize}`, { credentials: "include" });
          const data = await response.json() as Record<string, unknown> | Array<Record<string, unknown>>;
          if (!response.ok) throw new Error(typeof (data as Record<string, unknown>)?.error === "string" ? String((data as Record<string, unknown>).error) : "Could not load saved media bookmarks.");
          const currentRows = Array.isArray(data)
            ? data
            : Array.isArray((data as Record<string, unknown>).bookmarks)
              ? (data as Record<string, unknown>).bookmarks as Array<Record<string, unknown>>
              : Array.isArray((data as Record<string, unknown>).items)
                ? (data as Record<string, unknown>).items as Array<Record<string, unknown>>
                : [];
          rows.push(...currentRows);
          total = typeof (data as Record<string, unknown>).total === "number" ? (data as Record<string, unknown>).total as number : currentRows.length;
          page += 1;
          if (!Array.isArray(data) && currentRows.length === 0) break;
        }
        const ids = rows.map((row) => Number(row.contactId ?? row.contact_id ?? (row.contact as Record<string, unknown> | undefined)?.id))
          .filter((id) => Number.isInteger(id) && id > 0);
        if (active) {
          setBookmarkedContacts(new Set(ids));
          setBookmarkLoadError("");
        }
      } catch (reason) {
        if (active) setBookmarkLoadError(reason instanceof Error ? reason.message : "Could not load saved media bookmarks.");
      }
    })();
    return () => { active = false; };
  }, [bookmarkLoadAttempt, workspaceId]);

  const pollDiscoveryRun = async (runId: string, _progress?: (value: number) => void, generation = researchGeneration.current): Promise<DiscoveryRunResult> => {
    const deadline = Date.now() + 120_000;
    const pollStoryKey = `${projectId}:${storyKey}`;
    for (;;) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), Math.min(15_000, remainingMs));
      let response: Response;
      try {
        response = await fetch(`${apiBase()}/api/content/journalist-search-runs/${encodeURIComponent(runId)}`, { credentials: "include", signal: controller.signal });
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          throw new Error("Live search status timed out. Your run may still be working; return to this story to resume it.");
        }
        throw reason;
      } finally {
        window.clearTimeout(timeout);
      }
      const data = await response.json() as RemoteDiscoveryRun & { error?: string };
      if (!response.ok) throw researchRequestError(response, data as Record<string, unknown>, "Could not load live media research.");
      const receivedItems = Array.isArray(data.items) ? data.items : [];
      if (researchGeneration.current === generation && activeStoryRef.current === pollStoryKey) {
        setLiveItems((current) => mergeLiveDiscoveryItems(current, receivedItems));
        if (data.discoveryToken) setDiscoveryToken(data.discoveryToken);
      }
      if (data.status === "failed") throw new Error(data.error || "Could not complete live media research.");
      if (data.status === "succeeded") return { items: receivedItems, discoveryToken: data.discoveryToken || "" };
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
    }
    throw new Error("Live search timed out while waiting for progress. The server keeps the run for rehydration; retry now or return to this article later to resume and review any saved results.");
  };

  const [brief, setBrief] = useState<TargetingBrief>({ topic: "", angle: "", audience: "", regions: [], publicationTypes: [], whyNow: "" });
  const [briefIsDirty, setBriefIsDirty] = useState(false);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefLoadError, setBriefLoadError] = useState("");
  const [briefReadyKey, setBriefReadyKey] = useState("");
  const [recommendationSetId, setRecommendationSetId] = useState<number | string | null>(null);
  const [recommendationHasRun, setRecommendationHasRun] = useState(false);
  const [evaluation, setEvaluation] = useState<RecommendationEvaluation | null>(null);
  const [enrichmentWarning, setEnrichmentWarning] = useState("");
  const [pitchProgress, setPitchProgress] = useState<{ scope: string; completed: number; total: number } | null>(null);
  const [pitchErrors, setPitchErrors] = useState<{ scope: string; errors: Record<number, string> } | null>(null);
  const pitchBusyRef = useRef(false);
  const [coverageResult, setCoverageResult] = useState<{ key: string; text: string } | null>(null);
  type RequestHandle = { id: number; key: string; controller: AbortController };
  const requestSequence = useRef(0);
  const recommendationRequest = useRef<RequestHandle | null>(null);
  const discoveryRequests = useRef<Record<string, { id: number; key: string }>>({});
  const decisionLoadSequence = useRef(0);
  const recommendationLoadSequence = useRef(0);
  const recommendationResultsRef = useRef<HTMLElement | null>(null);
  const [recommendationScrollRequest, setRecommendationScrollRequest] = useState<{ loadId: number; scope: string } | null>(null);
  const coverageOperationSequence = useRef(0);
  const briefEditRevision = useRef(0);
  const activeStoryRef = useRef(`${projectId || ""}:${storyKey}`);
  activeStoryRef.current = `${projectId || ""}:${storyKey}`;
  const activeRecommendationScopeRef = useRef(`${workspaceId}:${projectId || ""}:${storyKey}`);
  activeRecommendationScopeRef.current = `${workspaceId}:${projectId || ""}:${storyKey}`;

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
    recommendationRequest.current = null;
    decisionLoadSequence.current += 1;
    recommendationLoadSequence.current += 1;
    discoveryRequests.current = {};
    requestSequence.current += 1;
  };

  const requestIsCurrent = (request: RequestHandle, current: RequestHandle | null) =>
    current?.id === request.id && activeStoryRef.current === request.key;

  const loadDecisions = async () => {
    if (!projectId || !storyKey) return;
    const loadId = ++decisionLoadSequence.current;
    const loadKey = `${projectId}:${storyKey}`;
    const isCurrent = () => decisionLoadSequence.current === loadId && activeStoryRef.current === loadKey;
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/recommendations/decisions?projectId=${encodeURIComponent(projectId)}&storyKey=${encodeURIComponent(storyKey)}&shortlistOnly=1`, { credentials: "include" });
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
      setDecisionContacts(Object.fromEntries((Array.isArray(data.decisionContacts) ? data.decisionContacts : [])
        .filter((entry: { contactId?: unknown; contact?: unknown }) => Number(entry.contactId) > 0 && entry.contact && typeof entry.contact === "object")
        .map((entry: { contactId: number; contact: Contact }) => [entry.contactId, entry.contact])));
      setDecisionAssessments(Object.fromEntries((Array.isArray(data.decisionContacts) ? data.decisionContacts : [])
        .filter((entry: { contactId?: unknown; assessment?: unknown }) => Number(entry.contactId) > 0 && entry.assessment && typeof entry.assessment === "object")
        .map((entry: { contactId: number; assessment: Recommendation["assessment"] }) => [entry.contactId, entry.assessment])));
      setDecisionPitches(Object.fromEntries((Array.isArray(data.decisionContacts) ? data.decisionContacts : [])
        .filter((entry: { contactId?: unknown }) => Number(entry.contactId) > 0)
        .map((entry: { contactId: number; pitchSuggestion: Recommendation["pitchSuggestion"] }) => [entry.contactId, entry.pitchSuggestion])));
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

  const saveStoryShortlist = async (contactId: number) => {
    if (!projectId || !storyKey) return;
    const generation = researchGeneration.current;
    const requestKey = `${projectId}:${storyKey}`;
    const savingKey = `${requestKey}:${contactId}`;
    setDecisionSaving((current) => ({ ...current, [savingKey]: true }));
    setError("");
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/recommendations/decisions`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, storyKey, contactId, decision: "shortlisted", note: "" }),
      });
      let data: Record<string, unknown> = {};
      try {
        data = await response.json() as Record<string, unknown>;
      } catch {
        if (!response.ok) throw new Error(`Could not add contact to this story shortlist (HTTP ${response.status}).`);
        throw new Error("Could not add contact to this story shortlist: the server returned invalid data.");
      }
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not add contact to this story shortlist.");
      if (researchGeneration.current !== generation || activeStoryRef.current !== requestKey) return;
      const saved = data.decision && typeof data.decision === "object" ? data.decision as Partial<Decision> : {};
      setDecisions((current) => ({
        ...current,
        [contactId]: {
          contactId,
          decision: saved.decision === "shortlisted" ? saved.decision : "shortlisted",
          note: typeof saved.note === "string" ? saved.note : "",
        },
      }));
      await loadDecisions();
    } catch (reason) {
      if (researchGeneration.current === generation && activeStoryRef.current === requestKey) setError(reason instanceof Error ? reason.message : "Could not add contact to this story shortlist.");
    } finally {
      if (researchGeneration.current === generation) setDecisionSaving((current) => ({ ...current, [savingKey]: false }));
    }
  };
  useEffect(() => { void loadDecisions(); }, [projectId, storyKey]);

  const loadRecommendations = async (page = recommendationPage, allowStaleReset = true, scrollToResults = false) => {
    if (!projectId || !storyKey) return;
    if (page > 1 && (recommendationSetId === null || rankingRevision === null || visibilityRevision === null)) {
      setItems([]);
      setRecommendationPage(1);
      setRecommendationPagination(null);
      setRankingRevision(null);
      setVisibilityRevision(null);
      setRecommendationSetId(null);
      setCollectionTotal(null);
      setTotalMatches(null);
      void loadRecommendations(1, false, scrollToResults);
      return;
    }
    const loadId = ++recommendationLoadSequence.current;
    const loadKey = `${projectId}:${storyKey}`;
    const scopeKey = `${workspaceId}:${loadKey}`;
    const isCurrent = () => recommendationLoadSequence.current === loadId
      && activeStoryRef.current === loadKey
      && activeRecommendationScopeRef.current === scopeKey;
    setRecommendationPageLoading(true);
    try {
      const pageQuery = new URLSearchParams({ projectId, storyKey, page: String(page) });
      if (page > 1 && recommendationSetId !== null && rankingRevision !== null && visibilityRevision !== null) {
        pageQuery.set("setId", String(recommendationSetId));
        pageQuery.set("revision", String(rankingRevision));
        pageQuery.set("visibilityRevision", String(visibilityRevision));
      }
      const response = await fetch(`${apiBase()}/api/store/media-db/recommendations?${pageQuery.toString()}`, { credentials: "include" });
      let data: Record<string, unknown> = {};
      try {
        data = await response.json() as Record<string, unknown>;
      } catch {
        if (!response.ok) throw new Error(`Could not load saved recommendations (HTTP ${response.status}).`);
        throw new Error("Could not load saved recommendations: the server returned invalid data.");
      }
      if (response.status === 409) {
        if (isCurrent() && allowStaleReset) {
          // A set was reranked while paging. Drop the stale page immediately
          // and reload a fresh first page; never combine rows from revisions.
          setItems([]);
          setRecommendationPage(1);
          setRecommendationPagination(null);
          setRankingRevision(null);
          setVisibilityRevision(null);
          setRecommendationSetId(null);
          setCollectionTotal(null);
          setTotalMatches(null);
          setError("");
          void loadRecommendations(1, false, scrollToResults);
        } else if (isCurrent()) {
          setError(typeof data.error === "string" ? data.error : "Recommendations changed while loading. Return to page one and retry.");
        }
        return;
      }
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : `Could not load saved recommendations (HTTP ${response.status}).`);
      if (!isCurrent()) return;
      const set = data.recommendationSet && typeof data.recommendationSet === "object"
        ? data.recommendationSet as Record<string, unknown>
        : null;
      const pagination = data.pagination && typeof data.pagination === "object"
        ? data.pagination as Record<string, unknown>
        : {};
      setRecommendationSetId(typeof set?.id === "number" || typeof set?.id === "string" ? set.id : null);
      setRankingRevision(typeof data.rankingRevision === "string" || typeof data.rankingRevision === "number" ? data.rankingRevision : null);
      setVisibilityRevision(typeof data.visibilityRevision === "string" || typeof data.visibilityRevision === "number" ? data.visibilityRevision : null);
      setRecommendationHasRun(Boolean(set?.id));
      setEvaluation(data.evaluation && typeof data.evaluation === "object" ? data.evaluation as RecommendationEvaluation : null);
      const nextItems = dedupeRecommendations(Array.isArray(data.items) ? data.items : []).slice(0, RECOMMENDATION_PAGE_SIZE);
      setItems(nextItems);
      setTotalMatches(typeof data.totalMatches === "number"
        ? data.totalMatches
        : typeof pagination.totalMatches === "number" ? pagination.totalMatches : null);
      setCollectionTotal(typeof data.collectionTotal === "number"
        ? data.collectionTotal
        : typeof pagination.collectionTotal === "number" ? pagination.collectionTotal : null);
      setRecommendationPage(typeof data.page === "number" ? data.page : page);
      setRecommendationPagination({
        start: typeof data.start === "number" ? data.start : 0,
        end: typeof data.end === "number" ? data.end : 0,
        hasPrevious: typeof data.hasPrevious === "boolean" ? data.hasPrevious : page > 1,
        hasNext: typeof data.hasNext === "boolean" ? data.hasNext : (typeof data.totalMatches === "number" && page * RECOMMENDATION_PAGE_SIZE < data.totalMatches),
      });
      if (scrollToResults) setRecommendationScrollRequest({ loadId, scope: scopeKey });
    } catch (reason) {
      // A failed refresh must not erase a previously visible, auditable set.
      // Keep the failure visible instead of silently falling back to generated
      // criteria or a blank recommendation list.
      if (isCurrent()) setError(reason instanceof Error ? reason.message : "Could not load saved recommendations.");
    } finally {
      if (isCurrent()) setRecommendationPageLoading(false);
    }
  };
  useEffect(() => { void loadRecommendations(1); }, [projectId, storyKey, workspaceId]);
  useEffect(() => {
    // Scroll after the new cards render, not while the previous five are loading.
    if (recommendationScrollRequest?.scope === activeRecommendationScopeRef.current
      && recommendationScrollRequest.loadId === recommendationLoadSequence.current) {
      recommendationResultsRef.current?.scrollIntoView({ behavior: "auto", block: "start", inline: "nearest" });
    }
  }, [recommendationScrollRequest]);

  const [enriching, setEnriching] = useState<boolean>(false);
  const coverageScopeRef = useRef(`${workspaceId}:${projectId || ""}:${storyKey}`);
  useEffect(() => {
    const scopeKey = `${workspaceId}:${projectId || ""}:${storyKey}`;
    if (coverageScopeRef.current === scopeKey) return;
    coverageScopeRef.current = scopeKey;
    coverageOperationSequence.current += 1;
    setEnriching(false);
    setEnrichmentWarning("");
    setCoverageResult(null);
    setError("");
  }, [workspaceId, projectId, storyKey]);

  const enrichRecommendations = async (recommendationSetId: number | string) => {
    if (!projectId || !storyKey) return;
    const requestKey = `${projectId}:${storyKey}`;
    const scopeKey = `${workspaceId}:${requestKey}`;
    const coverageId = ++coverageOperationSequence.current;
    const loadId = ++recommendationLoadSequence.current;
    const coverageOwnerIsCurrent = () => coverageOperationSequence.current === coverageId
      && coverageScopeRef.current === scopeKey
      && activeRecommendationScopeRef.current === scopeKey;
    const isCurrent = () => coverageOwnerIsCurrent()
      && activeStoryRef.current === requestKey
      && activeRecommendationScopeRef.current === scopeKey
      && recommendationLoadSequence.current === loadId;
    setEnriching(true);
    setError("");
    setEnrichmentWarning("");
    setCoverageResult(null);
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/recommendations/enrich`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, storyKey, recommendationSetId }),
      });
      const data = await response.json();
      if (!response.ok) throw researchRequestError(response, data, "Could not enrich recommendations.");
      if (!isCurrent()) return;
      const set = data.recommendationSet && typeof data.recommendationSet === "object"
        ? data.recommendationSet as Record<string, unknown>
        : null;
      setRecommendationSetId(typeof set?.id === "number" || typeof set?.id === "string" ? set.id : recommendationSetId);
      setRankingRevision(typeof data.rankingRevision === "string" || typeof data.rankingRevision === "number" ? data.rankingRevision : null);
      setVisibilityRevision(typeof data.visibilityRevision === "string" || typeof data.visibilityRevision === "number" ? data.visibilityRevision : null);
      setEvaluation(data.evaluation && typeof data.evaluation === "object" ? data.evaluation as RecommendationEvaluation : null);
      const nextItems = dedupeRecommendations(Array.isArray(data.items) ? data.items : []);
      setItems(nextItems);
      setRecommendationPage(1);
      setRecommendationPageLoading(false);
      const pagination = data.pagination && typeof data.pagination === "object" ? data.pagination as Record<string, unknown> : {};
      setRecommendationPagination({
        start: typeof data.start === "number" ? data.start : nextItems.length ? 1 : 0,
        end: typeof data.end === "number" ? data.end : nextItems.length,
        hasPrevious: typeof data.hasPrevious === "boolean" ? data.hasPrevious : false,
        hasNext: typeof data.hasNext === "boolean" ? data.hasNext : (typeof data.totalMatches === "number" ? data.totalMatches : totalMatches ?? nextItems.length) > RECOMMENDATION_PAGE_SIZE,
      });
      setTotalMatches(typeof data.totalMatches === "number" ? data.totalMatches : typeof pagination.totalMatches === "number" ? pagination.totalMatches : totalMatches);
      setCollectionTotal(typeof data.collectionTotal === "number" ? data.collectionTotal : typeof pagination.collectionTotal === "number" ? pagination.collectionTotal : collectionTotal);
      const warnings = nextItems.flatMap((item) => item.assessment?.warnings || []);
      setEnrichmentWarning(Array.from(new Set(warnings)).join(" "));
      const checkedCount = nextItems.slice(0, RECOMMENDATION_PAGE_SIZE).filter((item) =>
        item.assessment?.evidence.some((source) => source.attribution === "page_checked" && source.authorMatched)
      ).length;
      setCoverageResult({
        key: requestKey,
        text: `Coverage check finished. ${checkedCount} of up to ${Math.min(RECOMMENDATION_PAGE_SIZE, totalMatches ?? nextItems.length)} contacts in the global top five have a page-checked byline. This check is independent of the page you were viewing. The research assessment has been updated; this does not verify current contact details.`,
      });
      await loadDecisions();
    } catch (reason) {
      if (isCurrent()) {
        setError(reason instanceof Error ? reason.message : "Could not enrich recommendations.");
      }
    } finally {
      if (coverageOwnerIsCurrent()) setEnriching(false);
    }
  };

  const saveAndRecommend = async () => {
    if (!selected || !projectId) { setError("Choose a saved article and active project before matching contacts."); return; }
    const generation = researchGeneration.current;
    const workspaceAtStart = workspaceId;
    const scopeKey = `${workspaceAtStart}:${projectId}:${storyKey}`;
    const isScopeCurrent = () => activeRecommendationScopeRef.current === scopeKey;
    
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
      if (!briefResponse.ok) throw researchRequestError(briefResponse, savedBriefResponse, "Could not save targeting brief.");
      if (researchGeneration.current !== generation || !isScopeCurrent()) return;
      const savedBrief = normaliseTargetingBrief(savedBriefResponse.brief, brief);
      briefForMatch = {
        ...savedBrief,
        publicationTypes: savedBrief.publicationTypes.filter((sector) => databaseCategories.categories.includes(sector)),
      };
      setBrief(savedBrief);
      setBriefIsDirty(false);
    } catch (e) {
      if (researchGeneration.current === generation && isScopeCurrent()) {
        setError(e instanceof Error ? e.message : "Could not save targeting brief.");
        setLoading(false);
      }
      return;
    }

    const terms = termsFor(
      selected,
      [...categories, ...briefForMatch.publicationTypes],
      [...messages, briefForMatch.angle],
      briefForMatch.topic || projectContext.sector,
      projectKeywords,
    );
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
    recommendationLoadSequence.current += 1;
    setRecommendationPageLoading(false);
    setRecommendationPage(1);
    setRecommendationPagination(null);
    setRankingRevision(null);
    setVisibilityRevision(null);
    setCollectionTotal(null);
    setTotalMatches(null);
    setItems([]);
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/recommendations`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        signal: request.controller.signal,
         body: JSON.stringify({ projectId, storyKey, brief: briefForMatch, terms, targetPhrases: activeTargetPhrases, page: 1, pageSize: RECOMMENDATION_PAGE_SIZE }),
      });
      const data = await response.json() as Record<string, unknown>;
      if (!response.ok) throw researchRequestError(response, data, "Could not match database contacts.");
      if (researchGeneration.current !== generation || !isScopeCurrent()) return;
      if (!requestIsCurrent(request, recommendationRequest.current)) return;
      const set = data.recommendationSet && typeof data.recommendationSet === "object"
        ? data.recommendationSet as Record<string, unknown>
        : null;
      setRecommendationSetId(typeof set?.id === "number" || typeof set?.id === "string" ? set.id : null);
      setRecommendationHasRun(true);
      setEvaluation(data.evaluation && typeof data.evaluation === "object" ? data.evaluation as RecommendationEvaluation : null);
      const receivedItems = dedupeRecommendations(Array.isArray(data.items) ? data.items : []);
      const nextItems = receivedItems.slice(0, RECOMMENDATION_PAGE_SIZE);
      setItems(nextItems);
      const pagination = data.pagination && typeof data.pagination === "object" ? data.pagination as Record<string, unknown> : {};
      setTotalMatches(typeof data.totalMatches === "number" ? data.totalMatches : typeof pagination.totalMatches === "number" ? pagination.totalMatches : receivedItems.length);
      setCollectionTotal(typeof data.collectionTotal === "number" ? data.collectionTotal : typeof pagination.collectionTotal === "number" ? pagination.collectionTotal : null);
      setRecommendationPage(1);
      setRankingRevision(typeof data.rankingRevision === "string" || typeof data.rankingRevision === "number" ? data.rankingRevision : null);
      setVisibilityRevision(typeof data.visibilityRevision === "string" || typeof data.visibilityRevision === "number" ? data.visibilityRevision : null);
      setRecommendationPagination({
        start: typeof data.start === "number" ? data.start : nextItems.length ? 1 : 0,
        end: typeof data.end === "number" ? data.end : nextItems.length,
        hasPrevious: typeof data.hasPrevious === "boolean" ? data.hasPrevious : false,
        hasNext: typeof data.hasNext === "boolean" ? data.hasNext : receivedItems.length > RECOMMENDATION_PAGE_SIZE,
      });
      // The POST response is the authoritative newest set. Refetch decisions
      // for persistence, but do not let a concurrent/lagging GET replace that
      // freshly returned recommendation list.
    await loadDecisions();
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      if (researchGeneration.current === generation && isScopeCurrent() && requestIsCurrent(request, recommendationRequest.current)) setError(reason instanceof Error ? reason.message : "Could not match database contacts.");
    } finally {
      if (researchGeneration.current === generation && isScopeCurrent() && requestIsCurrent(request, recommendationRequest.current)) {
        recommendationRequest.current = null;
        setLoading(false);
      }
    }
  };

  const briefLoadSequence = useRef(0);
  const recommendationWorkspaceRef = useRef(workspaceId);
  useEffect(() => {
    if (recommendationWorkspaceRef.current === workspaceId) return;
    recommendationWorkspaceRef.current = workspaceId;
    setItems([]);
    setRecommendationPage(1);
    setRecommendationPagination(null);
    setRankingRevision(null);
    setVisibilityRevision(null);
    setCollectionTotal(null);
    setTotalMatches(null);
    setRecommendationSetId(null);
    setRecommendationHasRun(false);
    setRecommendationPageLoading(false);
  }, [workspaceId]);

  // Criteria are refreshed only when the article changes. This means an
  // operator can edit either field before the paid stage without a rerender
  // from the content store overwriting their work. The ref also makes the
  // effect idempotent under React StrictMode.
  useEffect(() => {
    if (!selected || !projectId || !storyKey) {
      invalidateRequests();
      setItems([]);
      setRecommendationPage(1);
      setRecommendationPagination(null);
      setRankingRevision(null);
      setVisibilityRevision(null);
      setCollectionTotal(null);
      setTotalMatches(null);
      setRecommendationSetId(null);
      setRecommendationHasRun(false);
      setRecommendationPageLoading(false);
      setEvaluation(null);
      setDecisions({});
      setDecisionContacts({});
      setDecisionAssessments({});
      setDecisionPitches({});
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
          setBrief(normaliseTargetingBrief(data.brief, defaultBrief(selected, categories, messages, projectContext, projectKeywords)));
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
    setRecommendationPage(1);
    setRecommendationPagination(null);
    setRankingRevision(null);
    setVisibilityRevision(null);
    setRecommendationPageLoading(false);
    setCollectionTotal(null);
    setTotalMatches(null);
    setRecommendationSetId(null);
    setRecommendationHasRun(false);
    setEvaluation(null);
    setLiveItems([]);
    setDiscoveryToken("");
    setSavedDiscoveries({});
    setDecisions({});
    setDecisionContacts({});
    setDecisionAssessments({});
    setDecisionPitches({});
    setError("");
    setLoading(false);
    setLiveLoading(false);
    setEnrichmentWarning("");
    
    // Article/project identity is deliberate: edits to generated fields are
    // user-owned and must not be replaced by unrelated store updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { invalidateRequests(); };
  }, [storyKey, projectId]);

  useEffect(() => {
    if (!projectId || !storyKey) return;
    if (serverDiscoveryWasReset(discoveryRunKey)) return;
    const generationAtStart = researchGeneration.current;
    let cancelled = false;
    void (async () => {
      const response = await fetch(`${apiBase()}/api/content/journalist-search-runs/latest?projectId=${encodeURIComponent(projectId)}&storyKey=${encodeURIComponent(storyKey)}`, { credentials: "include" });
      if (!response.ok || cancelled || researchGeneration.current !== generationAtStart || serverDiscoveryWasReset(discoveryRunKey)) return;
      const remote = await response.json() as RemoteDiscoveryRun | null;
      if (!remote || cancelled || researchGeneration.current !== generationAtStart || serverDiscoveryWasReset(discoveryRunKey) || activeStoryRef.current !== `${projectId}:${storyKey}`) return;
      setRemoteEmptyDiscoveryKey(remote.status === "succeeded" && Array.isArray(remote.items) && remote.items.length === 0 ? discoveryRunKey : "");
      setLiveItems(Array.isArray(remote.items) ? remote.items : []);
      if (remote.discoveryToken) setDiscoveryToken(remote.discoveryToken);
      if ((remote.status === "running" || remote.status === "failed") && !discoveryRun) {
        const serverStartedAt = typeof remote.startedAt === "string" ? Date.parse(remote.startedAt) : NaN;
        startAiRun<{ resumedRunId: string; serverStartedAt?: number }, DiscoveryRunResult>({
          key: discoveryRunKey,
          scope: discoveryScope,
          operation: "media-discover",
          subjectId: storyKey,
          input: {
            resumedRunId: remote.runId,
            serverStartedAt: Number.isFinite(serverStartedAt) && serverStartedAt > 0 && serverStartedAt <= Date.now() ? serverStartedAt : undefined,
          },
          estimateSeconds: getAuditDurationSeconds("media-discover"),
          // Restore a stored failure without starting another provider search.
          execute: (progress) => remote.status === "failed"
            ? Promise.reject(new Error(remote.error || "Could not complete live media research."))
            : pollDiscoveryRun(remote.runId, progress),
        });
      }
    })().catch(() => {
      // A missing historical run must not block database recommendations.
    });
    return () => { cancelled = true; };
    // Run identity and story identity are represented by discoveryRunKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discoveryRunKey]);

  // The lifecycle is app-owned, so a page unmount must not lose a live
  // discovery. Rehydrate its result when the user navigates back to this page.
  useEffect(() => {
    if (!discoveryRun) return;
    if (discoveryRun.status === "running") {
      setLiveLoading(true);
      return;
    }
    setLiveLoading(false);
    if (discoveryRun.status === "failed") {
      setError(discoveryRun.error || "Could not complete live media research.");
      return;
    }
    if (discoveryRun.status === "succeeded" && discoveryRun.result) {
      setLiveItems(discoveryRun.result.items);
      setDiscoveryToken(discoveryRun.result.discoveryToken);
      setError("");
    }
  }, [discoveryRun]);

  const discoverLive = async () => {
    if (!selected || !projectId) { setError("Choose a saved article and active project before searching the web."); return; }
    setRemoteEmptyDiscoveryKey("");
    const generation = researchGeneration.current;
    const criteria = generatedCriteria(
      selected,
      [...categories, ...brief.publicationTypes.filter((sector) => databaseCategories.categories.includes(sector))],
      [...messages, brief.angle],
      { ...projectContext, sector: brief.topic || projectContext.sector },
      projectKeywords,
    );
    const requestKey = `${projectId}:${storyKey}`;
    const run = startAiRun<{ projectId: string; storyKey: string }, DiscoveryRunResult>({
      key: discoveryRunKey,
      scope: discoveryScope,
      operation: "media-discover",
      subjectId: storyKey || "new-article",
      input: { projectId, storyKey },
      estimateSeconds: getAuditDurationSeconds("media-discover"),
      execute: async (progress) => {
        const response = await fetch(`${apiBase()}/api/content/media-discover`, {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            storyKey,
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
            brief: {
              ...brief,
              publicationTypes: brief.publicationTypes.filter((sector) => databaseCategories.categories.includes(sector)),
            },
            targetPhrases: activeTargetPhrases,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw researchRequestError(response, data, "Could not complete live media research.");
        const immediateItems = Array.isArray(data.items) ? data.items as LiveDiscovery[] : null;
        if (immediateItems) {
          return { items: immediateItems, discoveryToken: typeof data.discoveryToken === "string" ? data.discoveryToken : "" };
        }
        const runId = typeof data.runId === "string" ? data.runId : "";
        if (!runId) throw new Error("The live discovery run could not be started.");
        return pollDiscoveryRun(runId, progress, generation);
      },
      onSuccess: async (result, completedRun) => {
        // Learn once from successful, fully observed app-owned searches, even
        // after navigation. Resumed and failed runs do not skew the average.
        recordAuditDuration("media-discover", Date.now() - completedRun.startedAt, completedRun.estimateSeconds * 1000);
        // The app-owned lifecycle retains the verified result across in-app
        // navigation. Do not submit candidates for human review automatically;
        // each result still requires the explicit "Send for review" action.
        if (researchGeneration.current !== generation || activeStoryRef.current !== requestKey) return;
        clearServerDiscoveryReset(discoveryRunKey);
        setLiveItems((current) => mergeLiveDiscoveryItems(current, result.items));
        setDiscoveryToken(result.discoveryToken);
        setError("");
      },
    });
    if (run.status === "running") {
      setLiveLoading(true);
      setError("");
      setLiveNow(Date.now());
      if (discoveryRun?.status !== "running") setLiveItems([]);
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
  const saveContactBookmark = async (contactId: number) => {
    const requestWorkspace = workspaceId;
    setBookmarkLoading((current) => ({ ...current, [contactId]: true }));
    setError("");
    try {
      const isSaved = bookmarkedContacts.has(contactId);
      const response = await fetch(`${apiBase()}/api/store/media-db/bookmarks/contact/${contactId}`, {
        method: isSaved ? "DELETE" : "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      let data: Record<string, unknown> = {};
      try { data = await response.json() as Record<string, unknown>; } catch { /* successful no-content responses are valid */ }
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not update your saved media database.");
      if (bookmarkWorkspaceRef.current !== requestWorkspace) return;
      setBookmarkedContacts((current) => {
        const next = new Set(current);
        if (isSaved) next.delete(contactId);
        else next.add(contactId);
        return next;
      });
      setBookmarkLoadError("");
    } catch (reason) {
      if (bookmarkWorkspaceRef.current === requestWorkspace) setError(reason instanceof Error ? reason.message : "Could not update your saved media database.");
    } finally {
      if (bookmarkWorkspaceRef.current === requestWorkspace) {
        setBookmarkLoading((current) => ({ ...current, [contactId]: false }));
      }
    }
  };
  const toggleRestriction = async (contactId: number, doNotContact: boolean) => {
    if (!projectId || !storyKey) return;
    const generation = researchGeneration.current;
    const requestKey = `${projectId}:${storyKey}`;
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/recommendations/contact-restriction`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, storyKey, contactId, doNotContact }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save restriction.");
      
      if (researchGeneration.current !== generation || activeStoryRef.current !== requestKey) return;
      // Update immediately, then re-read the saved set. The server recomputes
      // readiness from the current restriction and lifecycle state; retaining
      // the old assessment here would leave an accepted contact blocked after
      // the operator removes a restriction.
      setItems((oldItems) => oldItems.map(item => item.contact.id === contactId
        ? { ...item, restricted: Boolean(data.doNotContact) }
        : item));
      await Promise.all([loadRecommendations(), loadDecisions()]);
    } catch (reason) {
      if (researchGeneration.current === generation && activeStoryRef.current === requestKey) {
        setError(reason instanceof Error ? reason.message : "Could not save restriction.");
      }
    }
  };

  const accepted = Object.values(decisions)
    .filter((d) => d.decision === "shortlisted")
    .map((d) => items.find((i) => i.contact.id === d.contactId)?.contact || decisionContacts[d.contactId])
    .filter(Boolean) as Contact[];
  const acceptedIds = [...new Set(accepted.map((contact) => contact.id))];
  // Existing story selections count as explicit selections when they fit in
  // one file. For larger lists the user must choose at most 25 contacts.
  const exportIds = exportSelection === null
    ? acceptedIds.length <= 25 ? acceptedIds : []
    : exportSelection.filter((id) => acceptedIds.includes(id));
  const toggleExportContact = (id: number) => {
    setExportSelection((current) => {
      const chosen = current ?? (acceptedIds.length <= 25 ? acceptedIds : []);
      return chosen.includes(id)
        ? chosen.filter((selected) => selected !== id)
        : chosen.length < 25 ? [...chosen, id] : chosen;
    });
  };
    
  const acceptedRecommendations = accepted.map((c) => items.find((i) => i.contact.id === c.id) || {
    rank: 0,
    contact: c,
    score: 0,
    reasons: [],
    assessment: decisionAssessments[c.id],
    pitchSuggestion: decisionPitches[c.id],
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
  const exportAccepted = async () => {
    if (!exportIds.length || exportIds.length > 25 || exportBusy) return;
    setExportBusy(true);
    setExportError("");
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/export`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "selected", type: "contacts", ids: exportIds }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || `CSV export failed with status ${response.status}.`);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "Accepted Media Contacts.csv";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      setExportError(reason instanceof Error ? reason.message : "Could not download the CSV export.");
    } finally {
      setExportBusy(false);
    }
  };
  const generateDisplayedPitches = async () => {
    if (pitchBusyRef.current || !projectId || !storyKey || recommendationSetId === null || briefIsDirty) return;
    const scope = `${workspaceId}:${projectId}:${storyKey}`;
    const loadId = recommendationLoadSequence.current;
    const editRevision = briefEditRevision.current;
    const candidates = items.slice(0, 5);
    const current = () => activeRecommendationScopeRef.current === scope
      && recommendationLoadSequence.current === loadId && briefEditRevision.current === editRevision;
    pitchBusyRef.current = true;
    setPitchProgress({ scope, completed: 0, total: candidates.length });
    setPitchErrors({ scope, errors: {} });
    try {
      // Sequential requests give actual per-contact progress and prevent one
      // failed suggestion from discarding the rest of the displayed batch.
      for (let index = 0; index < candidates.length; index += 1) {
        if (!current()) break;
        const contactId = candidates[index].contact.id;
        try {
          const response = await fetch(`${apiBase()}/api/store/media-db/recommendations/pitch-angles`, {
            method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId, storyKey, recommendationSetId: Number(recommendationSetId), contactIds: [contactId], brief }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Could not generate this pitch angle.");
          const result = data.results?.find((entry: { contactId: number }) => entry.contactId === contactId);
          if (!result?.suggestion) throw new Error(result?.error || "No tailored suggestion was generated.");
          if (current()) {
            setItems((rows) => rows.map((row) => row.contact.id === contactId ? { ...row, pitchSuggestion: result.suggestion } : row));
            setDecisionPitches((rows) => ({ ...rows, [contactId]: result.suggestion }));
          }
        } catch (reason) {
          if (current()) setPitchErrors((state) => ({ scope, errors: { ...(state?.scope === scope ? state.errors : {}), [contactId]: reason instanceof Error ? reason.message : "Could not generate this pitch angle." } }));
        }
        if (current()) setPitchProgress({ scope, completed: index + 1, total: candidates.length });
      }
    } finally {
      pitchBusyRef.current = false;
      setPitchProgress(null);
    }
  };
  const editBrief = (patch: Partial<TargetingBrief>) => {
    briefEditRevision.current += 1;
    setItems((rows) => rows.map((row) => ({ ...row, pitchSuggestion: undefined })));
    setDecisionPitches({});
    setBrief((current) => ({ ...current, ...patch }));
    setBriefIsDirty(true);
  };
  const goToRecommendationPage = (page: number) => {
    if (page < 1 || page === recommendationPage || recommendationPageLoading) return;
    if (page > 1 && (recommendationSetId === null || rankingRevision === null || visibilityRevision === null)) {
      setError("The recommendation ranking changed. Reloading the first page.");
      setItems([]);
      setRecommendationPage(1);
      setRecommendationPagination(null);
      setRankingRevision(null);
      setVisibilityRevision(null);
      setRecommendationSetId(null);
      setCollectionTotal(null);
      setTotalMatches(null);
      void loadRecommendations(1, false, true);
      return;
    }
    void loadRecommendations(page, true, true);
  };
  const toggleBriefRegion = (region: string) => {
    const regions = brief.regions.includes(region)
      ? region === "Global" ? [] : brief.regions.filter((value) => value !== region)
      : region === "Global"
        ? ["Global"]
        : [...brief.regions.filter((value) => value !== "Global"), region];
    editBrief({ regions });
  };
  const resetResearch = () => {
    setRemoteEmptyDiscoveryKey("");
    // Invalidate UI ownership before scheduling state changes so late
    // responses cannot repopulate a cleared search. Drop this page's
    // app-owned snapshot and suppress server-history rehydration for this
    // article in this browser session; server history itself is untouched.
    researchGeneration.current += 1;
    invalidateRequests();
    discardAiRun(discoveryRunKey);
    if (storyKey) markServerDiscoveryReset(discoveryRunKey);
    briefLoadSequence.current += 1;
    activeStoryRef.current = `${projectId || ""}:`;
    setSelectedId("");
    setBrief({ topic: "", angle: "", audience: "", regions: [], publicationTypes: [], whyNow: "" });
    setBriefIsDirty(false);
    setBriefReadyKey("");
    setBriefLoading(false);
    setBriefLoadError("");
    setItems([]);
    setRecommendationPage(1);
    setRecommendationPagination(null);
    setRankingRevision(null);
    setVisibilityRevision(null);
    setCollectionTotal(null);
    setTotalMatches(null);
    setRecommendationSetId(null);
    setRecommendationHasRun(false);
    setEvaluation(null);
    setDecisions({});
    setDecisionSaving({});
    setDecisionContacts({});
    setDecisionAssessments({});
    setDecisionPitches({});
    setLiveItems([]);
    setLiveLoading(false);
    setDiscoveryToken("");
    setSavedDiscoveries({});
    setLoading(false);
    setEnriching(false);
    setEnrichmentWarning("");
    setError("");
    try {
      if (selectionStorageKey) sessionStorage.removeItem(selectionStorageKey);
      localStorage.removeItem("aio.research.preload");
    } catch { /* browser storage may be unavailable */ }
    preloadIdRef.current = "";
  };
  const hasUnavailableSavedSector = brief.publicationTypes.length > 0
    && databaseCategories.status !== "loading"
    && (databaseCategories.status !== "ready" || brief.publicationTypes.some((sector) => !databaseCategories.categories.includes(sector)));
  const sectorSelectionUnresolved = brief.publicationTypes.length > 0
    && (databaseCategories.status === "loading" || hasUnavailableSavedSector);
  const showResetSearch = showEmptyDiscovery || recommendationHasRun || items.length > 0 || liveItems.length > 0 || loading || liveLoading
    || ["running", "succeeded", "failed"].includes(discoveryRun?.status || "");
  const contactCard = (item: Recommendation, shortlist = false) => {
    const sharedScoreCount = shortlist ? 1 : items.filter((candidate) => candidate.score === item.score).length;
    return (
      <div key={item.contact.id}>
      {pitchErrors?.scope === `${workspaceId}:${projectId}:${storyKey}` && pitchErrors.errors[item.contact.id] && <p role="alert" className="mx-5 mb-2 p-3 text-[12px] text-amber-800 bg-amber-50 rounded-lg">Pitch angle: {pitchErrors.errors[item.contact.id]}</p>}
      <RecommendationCard
        key={item.contact.id}
        item={item}
        researchSummary
        isShortlist={shortlist}
        compact={!shortlist}
        decision={decisions[item.contact.id]}
        onAccept={!shortlist ? () => void saveStoryShortlist(item.contact.id) : undefined}
        actionLoading={Boolean(decisionSaving[`${projectId}:${storyKey}:${item.contact.id}`])}
        savedToDatabase={!shortlist && bookmarkedContacts.has(item.contact.id)}
        onSaveToDatabase={!shortlist ? () => void saveContactBookmark(item.contact.id) : undefined}
        bookmarkLoading={Boolean(bookmarkLoading[item.contact.id])}
        onToggleRestriction={toggleRestriction}
        sharedScoreCount={sharedScoreCount}
      />
      </div>
    );
  };
  const displayedStart = recommendationPagination?.start ?? (items.length ? ((recommendationPage - 1) * RECOMMENDATION_PAGE_SIZE) + 1 : 0);
  const displayedEnd = recommendationPagination?.end ?? (items.length ? displayedStart + items.length - 1 : 0);
  const collectionCountLabel = collectionTotal === null ? "collection total unavailable" : `${collectionTotal.toLocaleString("en-US")} records`;
  const relevantMatchesLabel = totalMatches === null ? "relevant match total unavailable" : `${totalMatches.toLocaleString("en-US")} relevant matches`;
  const recommendationSummary = recommendationPage === 1
    ? `Showing ${items.length} of ${collectionCountLabel} · ${relevantMatchesLabel}`
    : items.length
      ? `Showing ${displayedStart}–${displayedEnd} of ${collectionCountLabel} · ${relevantMatchesLabel}`
      : `No ranked matches on page ${recommendationPage} · ${relevantMatchesLabel} · ${collectionCountLabel}`;
  const hasNextRecommendationPage = recommendationPagination?.hasNext
    ?? (totalMatches !== null && recommendationPage * RECOMMENDATION_PAGE_SIZE < totalMatches);
  const hasPreviousRecommendationPage = recommendationPagination?.hasPrevious ?? recommendationPage > 1;
  return <div className="p-6 sm:p-8 max-w-6xl mx-auto"><div className="mb-6"><div className="flex gap-3 items-center"><Target color="#fff" size={28} /><h1 className="text-3xl sm:text-4xl" style={{ color: "#fff", fontFamily: "'Alice', Georgia, serif" }}>Media Research</h1></div><p className="text-[14px] mt-2" style={{ color: "rgba(255,255,255,.85)" }}>Match trusted contacts already in your database or discover current journalists from public web sources. Every live result includes evidence and a source. Live search sends the selected article excerpt to OpenAI only after you explicitly run it.</p></div>
     <section className="bg-white rounded-2xl border p-5 mb-5 shadow-sm" style={{ borderColor: vars.g200 }}>
       <div className="flex flex-wrap items-end justify-between gap-3">
         <div className="flex-1 min-w-[240px]">
           <label className="block text-[12px] font-bold mb-2" style={{ color: vars.navy }}>Saved article</label>
            <select data-testid="select-research-article" value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setItems([]); setRecommendationPage(1); setCollectionTotal(null); setTotalMatches(null); setLiveItems([]); setDiscoveryToken(""); setError(""); }} className="w-full border rounded-lg p-2 text-[13px] outline-none focus:border-slate-400"><option value="">Choose a saved article</option>{archive.map((a) => <option key={a.id} value={a.id}>{a.title} ({a.contentType})</option>)}</select>
         </div>
         {showResetSearch && <button type="button" data-testid="button-new-research-search" onClick={resetResearch} className="px-4 py-2 rounded-lg border text-[12px] font-semibold bg-white hover:bg-slate-50" style={{ borderColor: vars.g200, color: vars.navy }}>New search / reset</button>}
       </div>
       {selected && <><div className="grid sm:grid-cols-2 gap-2 mt-4"><SummaryRow label="Article" value={selected.title} /><SummaryRow label="Categories" value={categories.join(", ") || "No categories selected"} /></div><div className="mt-3 rounded-lg border px-3 py-2" style={{ borderColor: vars.g200 }}><p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: vars.g500 }}>Exact target phrases</p>{activeTargetPhrases.length ? <ul className="mt-1 list-disc pl-4 text-[13px]" style={{ color: vars.g600 }}>{activeTargetPhrases.map((phrase) => <li key={phrase.id}><span className="font-medium">{phrase.text}</span><span className="ml-2 text-[11px] text-slate-400">({phrase.intentGroup})</span></li>)}</ul> : <p className="mt-1 text-[12px] text-slate-500">No exact phrases selected for this article or project.</p>}</div></>}
       <div className="mt-5 pt-5 border-t" style={{ borderColor: vars.g100 }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[14px] font-semibold" style={{ color: vars.navy }}>Targeting Brief</h3>
            {briefLoading && <span className="text-[12px] text-slate-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Loading...</span>}
          </div>
            <p className="text-[12px] text-slate-500 mb-4">Choose a topic, story angle, database media sectors and regions. Exact story phrases remain attached to this article.</p>
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
               <label className="block text-[12px] font-bold mb-1" style={{ color: vars.navy }}>Media sectors</label>
               <select
                 aria-label="Media sectors"
                  data-testid="select-media-sector"
                  value={brief.publicationTypes[0] || ""}
                 disabled={databaseCategories.status !== "ready"}
                  onChange={(event) => editBrief({ publicationTypes: event.currentTarget.value ? [event.currentTarget.value] : [] })}
                  className="w-full border rounded-lg p-2 text-[13px] outline-none focus:border-slate-400 disabled:bg-slate-50"
               >
                  <option value="">No sector filter</option>
                 {databaseCategories.categories.map((category) => <option key={category} value={category}>{category}</option>)}
               </select>
                <p className="mt-1 text-[11px] text-slate-500">Choose one sector from your Media Database categories, or leave the filter blank.</p>
               {databaseCategories.status === "loading" && <p className="mt-1 text-[11px] text-slate-500">Loading database sectors…</p>}
               {databaseCategories.status === "empty" && <p className="mt-1 text-[11px] text-amber-700">No database sectors are available yet. Continue without a sector filter.</p>}
               {databaseCategories.status === "error" && <p className="mt-1 text-[11px] text-rose-700">{databaseCategories.error} <button type="button" onClick={databaseCategories.retry} className="underline">Retry</button></p>}
               {hasUnavailableSavedSector && <p className="mt-1 text-[11px] text-amber-700">A previously saved sector is not available in the current database categories. It will not be used. <button type="button" data-testid="button-clear-unavailable-sectors" onClick={() => editBrief({ publicationTypes: [] })} className="underline">Clear unavailable sectors</button></p>}
             </div>
          </div>
          
          <div className="mt-4">
            <label className="block text-[12px] font-bold mb-1" style={{ color: vars.navy }}>Regions</label>
            <div className="flex gap-2">
                {["Global", "UK", "US"].map((region) => <button data-testid={`button-region-${region.toLowerCase()}`} type="button" key={region} onClick={() => toggleBriefRegion(region)} className={`px-4 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors ${brief.regions.includes(region) ? "bg-slate-800 text-white border-slate-800 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{region}</button>)}
            </div>
             <p className="text-[11px] text-slate-500 mt-1">Global applies no geography filter; it does not remove or rewrite stored regions.</p>
            {brief.regions.length === 0 && <p className="text-[11px] text-amber-600 mt-1">Please select at least one region to target.</p>}
          </div>
       </div>

        <div className="mt-5 pt-5 border-t flex flex-wrap gap-3" style={{ borderColor: vars.g100 }}>
          <button data-testid="button-recommend-contacts" disabled={loading || briefLoading || briefReadyKey !== `${projectId}:${storyKey}` || Boolean(briefLoadError) || sectorSelectionUnresolved || !selected || brief.regions.length === 0 || !brief.topic || !brief.angle} onClick={() => void saveAndRecommend()} className="px-5 py-2.5 rounded-lg text-white text-[13px] font-semibold disabled:opacity-50 transition-all shadow-sm" style={{ background: vars.coral }}>{loading ? <Loader2 className="inline animate-spin mr-1.5" size={16} /> : <Target className="inline mr-1.5" size={16} />}Save brief & match database contacts</button>
          {items.length > 0 && <button data-testid="button-discover-live" aria-describedby="research-live-search-help" disabled={liveLoading || briefLoading || briefReadyKey !== `${projectId}:${storyKey}` || Boolean(briefLoadError) || sectorSelectionUnresolved || !selected || brief.regions.length === 0} onClick={() => void discoverLive()} className="px-5 py-2.5 rounded-lg text-white text-[13px] font-semibold disabled:opacity-50 transition-all shadow-sm" style={{ background: vars.navy }}>{liveLoading ? <Loader2 className="inline animate-spin mr-1.5" size={16} /> : <Search className="inline mr-1.5" size={16} />}Find additional journalists online</button>}
        </div>
        <p id="research-live-search-help" className="mt-3 text-[12px]" style={{ color: vars.g600 }}>Optional: search beyond your Media Database. Results appear below in “Public web discoveries”, separate from your database matches. They are not added to your Media Database automatically; send a verified candidate for review first.</p>
        <p className="mt-2 text-[11px]" style={{ color: vars.g500 }}>Live search runs only when you choose it. The selected article excerpt and saved Targeting Brief are sent to OpenAI for evaluation; any returned email must be supported by a cited public source.</p>
        {items.length > 0 && <p className="mt-2 text-[11px] text-slate-500">“Save to My Media Database” creates an account-level reusable contact bookmark. It does not add the contact to this story’s shortlist or create story outreach planning.</p>}
        {showResetSearch && <p className="mt-2 text-[11px] text-slate-500">New search / reset clears this page’s current brief and results and forgets the selected article here; saved briefs, story decisions, bookmarks, and outreach remain in your account.</p>}
      </section>
     {error && <p data-testid="status-research-error" className="p-3 rounded bg-white text-[12px] mb-5" style={{ color: vars.red }}>{error}</p>}
      {bookmarkLoadError && <p data-testid="status-bookmark-load-error" className="p-3 rounded bg-white text-[12px] mb-5 text-amber-800">Saved status could not be loaded: {bookmarkLoadError}. Saving remains available. <button type="button" onClick={() => setBookmarkLoadAttempt((attempt) => attempt + 1)} className="underline">Retry saved status</button></p>}
     {showEmptyDiscovery && <p role="status" data-testid="empty-live-discovery" className="text-[13px] text-white mb-5">No additional journalists found</p>}
     {(liveLoading || discoveryRun?.status === "failed") && <section className="bg-white rounded-xl border p-4 mb-5" style={{ borderColor: vars.g200 }} data-testid="status-live-discovery">
       <div className="flex flex-wrap items-center justify-between gap-3">
         <div>
           <p className="text-[13px] font-semibold text-slate-800">{liveStage || "Live search"}</p>
           {liveLoading && <div className="mt-2 space-y-2">
             <CountdownBanner
               active={liveLoading}
               durationSeconds={liveEstimatedSeconds}
               startedAt={discoveryStartedAt}
               label="Finding journalists and checking evidence"
               sampleCount={getAuditSampleCount("media-discover")}
             />
             {liveItems.length > 0 && <p className="text-[12px] text-slate-600">{verifiedLiveCount} verified, {pendingLiveCount} pending</p>}
             <p className="text-[12px] text-slate-600">This countdown is an estimate. Verified results appear as checks complete.</p>
           </div>}
           {liveLoading && liveElapsedSeconds >= 40 && <p className="text-[12px] text-slate-600 mt-1">You can leave and return to this article later to resume the account-bound search.</p>}
            {discoveryRun?.status === "failed" && <p className="text-[12px] text-rose-700 mt-1">The run stopped or timed out. Retry live search; any verified results remain available for review. Server-persisted runs are rehydrated when you return to this article, and a timeout does not delete them.</p>}
         </div>
         {discoveryRun?.status === "failed" && <button type="button" data-testid="button-retry-live-search" onClick={() => void discoverLive()} className="px-3 py-2 rounded-lg border text-[12px] font-semibold" style={{ borderColor: vars.g200, color: vars.navy }}>Retry live search</button>}
       </div>
     </section>}
     {coverageResult?.key === `${projectId}:${storyKey}` && (
       <p role="status" className="mb-3 rounded-lg border border-sky-100 bg-sky-50 p-3 text-[12px] text-sky-900">
         {coverageResult.text}
       </p>
     )}
        {(loading || items.length > 0 || (recommendationHasRun && recommendationPage > 1)) && <section ref={recommendationResultsRef} className="bg-white rounded-2xl border overflow-hidden mb-5 shadow-sm" style={{ borderColor: vars.g200 }}><div className="p-5 border-b flex flex-wrap justify-between gap-3" style={{ background: vars.g50, borderColor: vars.g200 }}><div><h2 className="font-semibold text-lg" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Recommended from your Media Database</h2><p data-testid="recommendation-pagination-summary" className="text-[13px] mt-1" style={{ color: vars.g500 }}>{loading || recommendationPageLoading ? "Loading ranked contacts..." : recommendationSummary}</p>{evaluation && <p className="text-[11px] mt-2 text-slate-500">Evaluation: {evaluation.evaluated} evaluated · {evaluation.shortlisted} shortlisted · {evaluation.contacted} contacted · {evaluation.responded} responded · {evaluation.placed} placed</p>}</div>
       <div className="flex gap-2">
         {items.length > 0 && recommendationSetId !== null && (
           <div className="max-w-sm"><button type="button" data-testid="button-generate-pitch-angles" disabled={Boolean(pitchProgress) || loading || enriching || recommendationPageLoading || briefIsDirty || briefLoading} onClick={() => void generateDisplayedPitches()} className="self-start text-[12px] px-3 py-2 border rounded-lg bg-white disabled:opacity-50 hover:bg-slate-50" style={{ borderColor: vars.g200 }}>
            {pitchProgress?.scope === `${workspaceId}:${projectId}:${storyKey}` ? `Generating angles ${pitchProgress.completed}/${pitchProgress.total}...` : "Generate pitch angles for displayed contacts"}
           </button><p className="text-[11px] text-slate-500 mt-1">Generates AI suggestions for up to five contacts on this page and counts toward your account’s AI spend limit. Loading or changing pages never generates pitches. {briefIsDirty && "Save your brief and match contacts again first."}</p></div>
         )}
         {items.length > 0 && recommendationSetId !== null && (
           <button disabled={enriching} onClick={() => void enrichRecommendations(recommendationSetId)} className="self-start text-[12px] px-3 py-2 border rounded-lg bg-white disabled:opacity-50 hover:bg-slate-50 transition-colors shadow-sm" style={{ borderColor: vars.g200 }}>
            <FileText size={14} className={`inline mr-1 ${enriching ? "animate-pulse" : ""}`} />
            {enriching ? "Checking top 5..." : "Check top 5 recent coverage"}
          </button>
        )}
        </div></div><p className="mx-5 mb-3 text-[11px] text-slate-500">The explicit coverage action checks up to five contacts from the global top five, regardless of the page you are viewing, and counts toward your account’s AI spend limit. Pagination does not run a coverage check.</p>{enrichmentWarning && <p className="mx-5 mb-3 rounded-lg bg-amber-50 border border-amber-100 p-3 text-[12px] text-amber-800">Coverage check warning: {enrichmentWarning}</p>}{items.map((item) => contactCard(item))}{!items.length && recommendationPage > 1 && !recommendationPageLoading && <p className="p-5 text-center text-[13px] text-slate-500">There are no eligible contacts on this page. Use Previous five to return to earlier matches.</p>}{(hasPreviousRecommendationPage || hasNextRecommendationPage) && <div className="p-5 border-t flex justify-center gap-3" style={{ borderColor: vars.g200 }}>{hasPreviousRecommendationPage && <button type="button" data-testid="button-previous-recommendations" disabled={recommendationPageLoading} onClick={() => goToRecommendationPage(recommendationPage - 1)} className="px-5 py-2.5 rounded-lg border bg-white text-[13px] font-semibold hover:bg-slate-50 disabled:opacity-50" style={{ borderColor: vars.g200, color: vars.navy }}>Previous five</button>}{hasNextRecommendationPage && <button type="button" data-testid="button-next-recommendations" disabled={recommendationPageLoading} onClick={() => goToRecommendationPage(recommendationPage + 1)} className="px-5 py-2.5 rounded-lg border bg-white text-[13px] font-semibold hover:bg-slate-50 disabled:opacity-50" style={{ borderColor: vars.g200, color: vars.navy }}>See next five</button>}</div>}</section>}
        {liveItems.length > 0 && <section className="bg-white rounded-2xl border overflow-hidden mb-5 shadow-sm" style={{ borderColor: vars.g200 }}><div className="p-5 border-b" style={{ background: vars.g50, borderColor: vars.g200 }}><h2 className="font-semibold text-lg" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Public web discoveries</h2><p className="text-[13px] mt-1" style={{ color: vars.g500 }}>{liveItems.length} journalists across {livePublicationCount} publications. {liveLoading ? "Evidence checks are continuing. Verified cards are ready to review now; pending candidates are identified." : "Evidence checks are complete."}</p><p className="text-[12px] mt-2" style={{ color: vars.g500 }}>These are additional online candidates, not saved database contacts. Use “Send for review” on a verified result; a steward must approve it before it becomes a contact.</p></div>
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
     {!liveLoading && !loading && !briefLoading && !briefLoadError && !error && recommendationHasRun && items.length === 0 && liveItems.length === 0 && selected && <section className="bg-white rounded-2xl border p-5 mb-5 shadow-sm" style={{ borderColor: vars.g200 }}>
       <div className="flex flex-wrap items-center justify-between gap-4">
         <div><h2 className="font-semibold text-lg" style={{ color: vars.navy }}>No suitable saved contacts found</h2><p className="text-[12px] mt-1" style={{ color: vars.g500 }}>Optional live search finds additional candidates under “Public web discoveries” below. Verified candidates must be sent for review and approved before they become database contacts.</p></div>
         <button data-testid="button-find-journalists" aria-describedby="research-live-search-help" disabled={liveLoading || briefLoading || briefReadyKey !== `${projectId}:${storyKey}` || Boolean(briefLoadError)} onClick={() => void discoverLive()} className="px-4 py-2.5 rounded-lg text-white text-[13px] font-semibold disabled:opacity-50" style={{ background: vars.navy }}><Search size={15} className="inline mr-1.5" />Find additional journalists online</button>
       </div>
     </section>}
     <section className="bg-white rounded-2xl border overflow-hidden shadow-sm" style={{ borderColor: vars.g200 }}>
       <div className="p-5 flex flex-wrap justify-between gap-2 border-b" style={{ background: vars.g50, borderColor: vars.g200 }}>
         <div>
           <h2 className="font-semibold text-lg" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Story outreach planning</h2>
           <p className="text-[13px] mt-1" style={{ color: vars.g500 }}>Story selections and outreach context stay separate from reusable Media Database saves. Selecting a contact here does not send a pitch.</p>
         </div>
         {accepted.length > 0 && <button data-testid="button-export-shortlist-csv" disabled={exportBusy || exportIds.length === 0} onClick={() => void exportAccepted()} className="text-[12px] px-3 py-1.5 border rounded-lg bg-white hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50" style={{ borderColor: vars.g200 }}>
           <Download size={14} className="inline mr-1 text-slate-400" /> Download selected CSV ({exportIds.length})
         </button>}
       </div>
       {acceptedIds.length > 25 && <p className="mx-5 mt-3 text-[12px] text-slate-600">Choose up to 25 contacts per download. No partial CSV is created automatically.</p>}
       {exportError && <p role="alert" className="mx-5 mt-3 text-[12px] text-red-700">{exportError}</p>}
       {acceptedRecommendations.length ? acceptedRecommendations.map((r) =>
         <div key={r.contact.id}>
           <label className="flex items-center gap-2 px-5 pt-3 text-[12px] text-slate-700">
             <input type="checkbox" aria-label={`Select ${r.contact.firstName} ${r.contact.lastName} for CSV`} checked={exportIds.includes(r.contact.id)} disabled={!exportIds.includes(r.contact.id) && exportIds.length >= 25} onChange={() => toggleExportContact(r.contact.id)} />
             Include in CSV download
           </label>
           {contactCard(r, true)}
         </div>
       ) : <p className="p-8 text-[14px] text-center italic" style={{ color: vars.g500 }}>No contacts selected for this story yet. Use “Plan outreach for this story” on a recommendation to make it available here; saving it to My Media Database alone does not mark it as pitched.</p>}
     </section>
    {selected && projectId && <MediaOutreachPanel projectId={projectId} storyKey={storyKey} articleTitle={selected.title} recommendations={acceptedRecommendations} targetPhrases={activeTargetPhrases} />}
  </div>;
}
export { MediaResearchPage };