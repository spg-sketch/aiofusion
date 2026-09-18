import { loadIntakeData, getKeyMessages, getSpokespeople, getProjectMediaCategories, getProjectDataMessages, setActiveProjectId, getActiveProjectId, getConfirmedEntity, getLlmSearchQueries, getCompetitors } from "./IntakeForm";
import CountdownBanner from "./components/CountdownBanner";
import { syncProjectsOnLoad, syncIntakeForProject, pushProjectMeta, deleteRemoteProject, setKnownProjectIds, assertActiveProjectConsistency, isKnownProjectId } from "./lib/projectSync";
import { fetchProjectAllowance, shouldBlockProjectCreation, shouldRouteProjectCreationToManagedClients, type PackageCapacity } from "./lib/billingAllowance";
import { stripEmDashes, normaliseAddedData } from "./lib/utils";
import { apiBase } from "./lib/contentAi";
import { loadSavedAudits } from "./LlmCheckPage";
import InfoTip from "./InfoTip";
import {
  type Session as LocalSession,
  type User as LocalUser,
  type Role as LocalRole,
  type AccountProfile,
  type WorkspaceInfo,
  type PendingMyInvite,
  seedAdminIfEmpty,
  setSession as setCachedSession,
  clearSession as clearCachedSession,
  getUsers as getLocalUsers,
  getVisibleUsernames as getVisibleLocalUsernames,
  serverLogin,
  serverLogout,
  serverExitImpersonation,
  serverAssignOwner,
  serverGetSessions,
  refreshAccountsCache,
  confirmPendingSso,
  bootstrapAuth,
  fetchAccountProfile,
  serverGetMyInvites,
  serverGetWorkspaces,
  type SessionInfo,
} from "./lib/auth";
import { PendingInvitesBanner } from "./components/PendingInvitesBanner";
import type { AcceptedInvitation } from "./components/InvitationResult";
import { WorkspaceSwitcher } from "./components/WorkspaceSwitcher";
import { BackToAgencyLink } from "./components/BackToAgencyLink";
import { isInsightsAdminPath } from "./lib/adminRoute";
import { vars } from "./marketing/vars";
import { PUBLIC_PAGE_DEFINITIONS } from "./marketing/pageMeta";
import { GuidedOnboardingPage } from "./pages/GuidedOnboardingPage";
import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense, startTransition } from "react";
import {
  ChevronRight,
  Lock,
  Search,
  FileEdit,
  BarChart3,
  Archive,
  Send,
  LineChart,
  ArrowRight,
  Sparkles,
  Loader2,
  TrendingUp,
  FileText,
  FileCheck2,
  Target,
  Code2,
  HelpCircle,
  MessageSquareQuote,
  Bot,
  ShieldCheck,
  MessagesSquare,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  Globe,
  Tag,
  User,
  ChevronDown,
  Plus,
  Minus,
  MessageSquare,
  BookOpen,
  Scroll,
  Award,
  Radio,
  Mic2,
  PenLine,
  ClipboardList,
  ArrowUpRight,
  Lightbulb,
  ClipboardPaste,
  Upload,
  Calendar,
  Check,
  Save,
  Circle,
  Zap,
  Mail,
  Shield,
  Eye,
  Building2,
  ArrowLeft,
  LogOut,
  Trash2,
  KeyRound,
  Users,
  Activity,
  Play,
  ChevronUp,
  Menu,
  X,
  LogIn,
  Link as LinkIcon,
  Image as ImageIcon,
  Repeat,
  TrendingDown,
  FolderOpen,
  List as ListIcon,
  Clock,
  Undo2,
  ArchiveRestore,
  RefreshCw,
  MonitorSmartphone,
} from "lucide-react";
import type {
  GenerateStep, Rating,
  DiagnosticResult, SavedDiagnostic, SavedScored,
  ArchiveItem, PlannerStatus, PlannerProject, ScoringConfig,
  CreatorFieldKey, ConfidenceFlag, MediaJournalist, MediaListItem,
  EventConfirmFlag, EventOpportunity, EventItem, PublicView,
  Outlet, Contact,
} from "./types";
import { loadCycle, recordCycle, type CycleHistory } from "./lib/cycles";
import type { Client } from "./lib/projectTypes";
import { CREATED_PROJECTS_KEY, loadStoredProjects, saveStoredProjects } from "./lib/projectStore";
import {
  getProjectSectorLabel, loadClientLogos, saveClientLogos,
  migrateLegacyIntakeToProject, createStoredProject, deriveInitials,
  assignProjectOwner, migrateAssignOwnerlessToAdmin,
  migrateStoredIntakeKeys,
} from "./lib/projects";
import { initContentStore, migrateLocalStorageContentToServer, removeDemoSeedData, loadArchive, loadPlannerProjects, useContentStore, saveArchive, resetContentStore } from "./lib/contentStore";
import { MiniDonut } from "./pages/shared";
import { loadSavedDiagnostics, loadSavedScored, contentGeoKey, techGeoKey } from "./lib/diagnosticStore";
import { CreateProjectModal } from "./components/CreateProjectModal";
import { GenerateFromUrlModal } from "./components/GenerateFromUrlModal";
import { Sidebar } from "./components/Sidebar";
import { GeorgeSupport } from "./components/GeorgeSupport";
import ClientSelectorPage from "./pages/ClientSelectorPage";
import { RouteLoading } from "./components/RouteLoading";
import { AuthPageLoading } from "./components/AuthPageLoading";
import { CheckoutReturnLoading } from "./components/CheckoutReturnLoading";
import { preloadRoute, scheduleIdlePreloads, type RoutePreloader } from "./lib/routePreloading";

const routePreloadingEnabled = import.meta.env.MODE !== "test";

function warmRoute(load: RoutePreloader | undefined): void {
  if (routePreloadingEnabled) preloadRoute(load);
}

// ---------------------------------------------------------------------------
// Route-level lazy chunks - each page is only downloaded when first visited.
// ---------------------------------------------------------------------------
const loadIntakePage = () => import("./IntakeForm");
const loadReportPage = () => import("./ReportPage");
const loadSeoAuditPage = () => import("./SeoAuditPage");
const loadLlmCheckPage = () => import("./LlmCheckPage");
const loadLandingPage = () => import("./marketing/LandingPage");
const loadPricingPage = () => import("./marketing/PricingPage");
const loadForInhousePage = () => import("./marketing/ForInhousePage");
const loadForAgenciesPage = () => import("./marketing/ForAgenciesPage");
const loadInsightsPage = () => import("./marketing/InsightsPage");
const loadAboutPage = () => import("./marketing/AboutPage");
const loadContactPage = () => import("./marketing/ContactPage");
const loadTrustSecurityPage = () => import("./marketing/TrustSecurityPage");
const loadPrivacyPolicyPage = () => import("./marketing/PrivacyPolicyPage");
const loadJournalistPrivacyPage = () => import("./marketing/JournalistPrivacyPage");
const loadTermsConditionsPage = () => import("./marketing/TermsConditionsPage");
const loadForAgentsPage = () => import("./marketing/ForAgentsPage");
const loadDashboardPage = () =>
  import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage }));
const loadDiagnosticPage = () =>
  import("./pages/DiagnosticPage").then((m) => ({ default: m.DiagnosticPage }));
const loadOptimiserPage = () =>
  import("./pages/OptimiserPage").then((m) => ({ default: m.OptimiserPage }));
const loadPlannerPage = () =>
  import("./pages/PlannerPage").then((m) => ({ default: m.PlannerPage }));
const loadReleaseGatewayPage = () =>
  import("./pages/ReleaseGatewayPage").then((m) => ({ default: m.ReleaseGatewayPage }));
const loadArchivePage = () =>
  import("./pages/ArchivePage").then((m) => ({ default: m.ArchivePage }));
const loadGeoContentPage = () =>
  import("./pages/GeoContentPage").then((m) => ({ default: m.GeoContentPage }));
const loadContentCreatorPage = () =>
  import("./pages/ContentCreatorPage").then((m) => ({ default: m.ContentCreatorPage }));
const loadMediaResearchPage = () =>
  import("./pages/MediaResearchPage").then((m) => ({ default: m.MediaResearchPage }));
const loadMarketingIntelligencePage = () =>
  import("./pages/MarketingIntelligencePage").then((m) => ({ default: m.MarketingIntelligencePage }));
const loadPlatformHomePage = () =>
  import("./pages/PlatformHomePage").then((m) => ({ default: m.PlatformHomePage }));
const UsersAdminPage = lazy(() =>
  import("./pages/UsersAdminPage").then((m) => ({ default: m.UsersAdminPage }))
);
const ContactSubmissionsAdminPage = lazy(() =>
  import("./pages/ContactSubmissionsAdminPage").then((m) => ({ default: m.ContactSubmissionsAdminPage }))
);
const PrivacyRightsAdminPage = lazy(() =>
  import("./pages/PrivacyRightsAdminPage").then((m) => ({ default: m.PrivacyRightsAdminPage }))
);
const loadSubAccountsPage = () =>
  import("./pages/SubAccountsPage").then((m) => ({ default: m.SubAccountsPage }));

const InviteAcceptPage = lazy(() =>
  import("./pages/InviteAcceptPage").then((m) => ({ default: m.InviteAcceptPage }))
);
const loadGuidancePage = () =>
  import("./pages/GuidancePage").then((m) => ({ default: m.GuidancePage }));
const loadArchivedProjectsPage = () =>
  import("./pages/ArchivedProjectsPage").then((m) => ({ default: m.ArchivedProjectsPage }));
const loadMediaDatabasePage = () =>
  import("./pages/MediaDatabasePage").then((m) => ({ default: m.MediaDatabasePage }));
const SupportAdminPage = lazy(() =>
  import("./pages/SupportAdminPage").then((m) => ({ default: m.SupportAdminPage }))
);
const LeadsAdminPage = lazy(() =>
  import("./pages/LeadsAdminPage").then((m) => ({ default: m.LeadsAdminPage }))
);
const InsightsAdminPage = lazy(() =>
  import("./pages/InsightsAdminPage").then((m) => ({ default: m.InsightsAdminPage }))
);

const IntakePage = lazy(() => import("./IntakeForm"));
const ReportPage = lazy(() => import("./ReportPage"));
const SeoAuditPage = lazy(() => import("./SeoAuditPage"));
const LlmCheckPage = lazy(() => import("./LlmCheckPage"));
const LandingPageC = lazy(() => import("./marketing/LandingPage"));
const PricingPage = lazy(() => import("./marketing/PricingPage"));
const ForInhousePage = lazy(() => import("./marketing/ForInhousePage"));
const ForAgenciesPage = lazy(() => import("./marketing/ForAgenciesPage"));
const InsightsPage = lazy(() => import("./marketing/InsightsPage"));
const AboutPage = lazy(() => import("./marketing/AboutPage"));
const ContactPage = lazy(() => import("./marketing/ContactPage"));
const TrustSecurityPage = lazy(() => import("./marketing/TrustSecurityPage"));
const PrivacyPolicyPage = lazy(() => import("./marketing/PrivacyPolicyPage"));
const JournalistPrivacyPage = lazy(() => import("./marketing/JournalistPrivacyPage"));
const TermsConditionsPage = lazy(() => import("./marketing/TermsConditionsPage"));
const ForAgentsPage = lazy(() => import("./marketing/ForAgentsPage"));
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage }))
);
const DiagnosticPage = lazy(() =>
  import("./pages/DiagnosticPage").then((m) => ({ default: m.DiagnosticPage }))
);
const OptimiserPage = lazy(() =>
  import("./pages/OptimiserPage").then((m) => ({ default: m.OptimiserPage }))
);
const PlannerPage = lazy(() =>
  import("./pages/PlannerPage").then((m) => ({ default: m.PlannerPage }))
);
const ReleaseGatewayPage = lazy(() =>
  import("./pages/ReleaseGatewayPage").then((m) => ({ default: m.ReleaseGatewayPage }))
);
const ArchivePage = lazy(() =>
  import("./pages/ArchivePage").then((m) => ({ default: m.ArchivePage }))
);
const GeoContentPage = lazy(() =>
  import("./pages/GeoContentPage").then((m) => ({ default: m.GeoContentPage }))
);
const ContentCreatorPage = lazy(() =>
  import("./pages/ContentCreatorPage").then((m) => ({ default: m.ContentCreatorPage }))
);
const MediaResearchPage = lazy(() =>
  import("./pages/MediaResearchPage").then((m) => ({ default: m.MediaResearchPage }))
);
const MarketingIntelligencePage = lazy(() =>
  import("./pages/MarketingIntelligencePage").then((m) => ({ default: m.MarketingIntelligencePage }))
);
const PlatformHomePage = lazy(() =>
  import("./pages/PlatformHomePage").then((m) => ({ default: m.PlatformHomePage }))
);
const SubAccountsPage = lazy(() =>
  import("./pages/SubAccountsPage").then((m) => ({ default: m.SubAccountsPage }))
);
const GuidancePage = lazy(() =>
  import("./pages/GuidancePage").then((m) => ({ default: m.GuidancePage }))
);
const ArchivedProjectsPage = lazy(() =>
  import("./pages/ArchivedProjectsPage").then((m) => ({ default: m.ArchivedProjectsPage }))
);
const MediaDatabasePage = lazy(() =>
  import("./pages/MediaDatabasePage").then((m) => ({ default: m.MediaDatabasePage }))
);

const VIEW_PRELOADERS: Record<string, RoutePreloader> = {
  landing: loadLandingPage,
  "platform-home": loadPlatformHomePage,
  "for-inhouse": loadForInhousePage,
  "for-agencies": loadForAgenciesPage,
  "for-agents": loadForAgentsPage,
  insights: loadInsightsPage,
  about: loadAboutPage,
  contact: loadContactPage,
  pricing: loadPricingPage,
  "trust-security": loadTrustSecurityPage,
  "privacy-policy": loadPrivacyPolicyPage,
  "journalist-privacy": loadJournalistPrivacyPage,
  "terms-conditions": loadTermsConditionsPage,
  "sub-accounts": loadSubAccountsPage,
  guidance: loadGuidancePage,
  "archived-projects": loadArchivedProjectsPage,
};

const PAGE_PRELOADERS: Record<string, RoutePreloader> = {
  dashboard: loadDashboardPage,
  intake: loadIntakePage,
  diagnostic: loadDiagnosticPage,
  "llm-check": loadLlmCheckPage,
  optimiser: loadOptimiserPage,
  "seo-audit": loadSeoAuditPage,
  "geo-content": loadGeoContentPage,
  planner: loadPlannerPage,
  creator: loadContentCreatorPage,
  "media-research": loadMediaResearchPage,
  "marketing-intel": loadMarketingIntelligencePage,
  gateway: loadReleaseGatewayPage,
  archive: loadArchivePage,
  measure: loadReportPage,
  "media-database": loadMediaDatabasePage,
};

const PUBLIC_IDLE_PRELOADS: Record<string, RoutePreloader[]> = {
  landing: [loadPricingPage, loadForInhousePage, loadForAgenciesPage],
  pricing: [loadLandingPage, loadForInhousePage],
  insights: [loadLandingPage, loadAboutPage],
  default: [loadLandingPage, loadPricingPage],
};

const PROJECT_IDLE_PRELOADS: Record<string, RoutePreloader[]> = {
  dashboard: [loadIntakePage, loadLlmCheckPage],
  intake: [loadDashboardPage, loadLlmCheckPage],
  "llm-check": [loadDiagnosticPage, loadDashboardPage],
  diagnostic: [loadLlmCheckPage, loadOptimiserPage],
  planner: [loadContentCreatorPage, loadArchivePage],
  creator: [loadOptimiserPage, loadArchivePage],
  optimiser: [loadContentCreatorPage, loadArchivePage],
  default: [loadDashboardPage],
};

// Sample/demo agencies have been removed. The Project Hub now shows only real,
// user-created projects loaded from localStorage.

migrateStoredIntakeKeys();

// --- URL <-> view mapping for the public marketing pages ------------------
// Derived from PUBLIC_PAGE_DEFINITIONS (marketing/pageMeta.ts) - the single source of
// truth that also drives the prerender build and sitemap. Adding a public page
// therefore forces the pageMeta entry (and prerendered HTML) to exist, which
// pageMeta.consistency.test.ts enforces.
const VIEW_TO_SLUG: Record<string, string> = Object.fromEntries(
  PUBLIC_PAGE_DEFINITIONS.map(({ view, slug }) => [view, slug]),
);

const CANONICAL_SLUG_TO_VIEW: Record<string, PublicView> = Object.fromEntries(
  PUBLIC_PAGE_DEFINITIONS.map(({ view, slug }) => [slug, view]),
);

// Canonical slug resolution comes from the same registry as prerendering and
// sitemap generation. These are deliberately aliases only: a public route can
// no longer be added to one direction of navigation and omitted from the other.
const SLUG_TO_VIEW: Record<string, PublicView> = {
  ...CANONICAL_SLUG_TO_VIEW,
  home: "landing",
  inhouse: "for-inhouse",
  "in-house": "for-inhouse",
  agencies: "for-agencies",
  "ai-agents": "for-agents",
  aiagents: "for-agents",
  trust: "trust-security",
  security: "trust-security",
  privacy: "privacy-policy",
  terms: "terms-conditions",
};

function appBase(): string {
  return import.meta.env.BASE_URL || "/";
}

function slugFromLocation(): string {
  const base = appBase().replace(/\/+$/, "");
  let p = window.location.pathname;
  if (base && (p === base || p.startsWith(base + "/"))) p = p.slice(base.length);
  return p.replace(/^\/+/, "").replace(/\/+$/, "").split("/")[0].toLowerCase();
}

function articleIdFromLocation(): string | null {
  const base = appBase().replace(/\/+$/, "");
  let p = window.location.pathname;
  if (base && (p === base || p.startsWith(base + "/"))) p = p.slice(base.length);
  const parts = p.replace(/^\/+/, "").replace(/\/+$/, "").split("/");
  if (parts[0]?.toLowerCase() === "insights" && parts[1]) return parts[1].toLowerCase();
  return null;
}

function publicViewFromLocation(): PublicView | null {
  return SLUG_TO_VIEW[slugFromLocation()] ?? null;
}

function directViewFromLocation(): PublicView | "insights-admin" | "platform-home" | "platform" | null {
  const protectedDestination = protectedDestinationFromLocation();
  if (protectedDestination === "project-hub") return "platform";
  if (protectedDestination === "platform") return "platform-home";
  if (isInsightsAdminPath(window.location.pathname, appBase())) return "insights-admin";
  return publicViewFromLocation();
}

// Authenticated reloads use a non-public destination so prerendered marketing
// HTML is never the first document painted. The server still serves the same
// app shell; this marker is consumed only by the client bootstrap.
function isProtectedDestination(): boolean {
  return protectedDestinationFromLocation() !== null;
}

function protectedDestinationFromLocation(): "platform" | "project-hub" | null {
  const base = appBase().replace(/\/+$/, "");
  let path = window.location.pathname;
  if (base && (path === base || path.startsWith(`${base}/`))) path = path.slice(base.length);
  const slug = path.replace(/^\/+/, "").replace(/\/+$/, "").split("/")[0].toLowerCase();
  if (slug === "project-hub") return "project-hub";
  if (slug === "platform") return "platform";
  return null;
}

const AUTH_REDIRECT_QUERY_KEYS = [
    "oauth_status",
    "link_google",
    "needs_setup",
    "verify_status",
    "reset_token",
    "discount_invite",
    "delete_reauth",
    "aio_exit_impersonation",
    "aio_switched_master",
    "aio_switched_workspace",
    "aio_session_expired",
    "account_section",
    "checkout",
  ] as const;

function resolveAuthenticationRedirect(search = window.location.search) {
  const params = new URLSearchParams(search);
  const isAuthRedirect = AUTH_REDIRECT_QUERY_KEYS.some((key) => params.has(key));
  return {
    isAuthRedirect,
    oauthRedirectParams: ["oauth_status", "link_google", "verify_status", "delete_reauth"].some((key) => params.has(key))
      ? search
      : null,
  };
}

function isAuthenticationLanding(): boolean {
  return resolveAuthenticationRedirect().isAuthRedirect;
}

function viewToUrl(v: string, insightsArticleId?: string | null): string {
  if (v === "insights-admin") return appBase() + "admin";
  if (v === "platform") return appBase() + "project-hub";
  if (v === "platform-home") return appBase() + "platform";
  if (v === "insights" && insightsArticleId) {
    return appBase() + "insights/" + insightsArticleId;
  }
  return appBase() + (VIEW_TO_SLUG[v] ?? "");
}


function App() {
  const [view, setView] = useState<"landing" | "platform-home" | "platform" | "guidance" | "archived-projects" | "users-admin" | "insights-admin" | "privacy-admin" | "sub-accounts" | "for-agents" | "for-agencies" | "for-inhouse" | "insights" | "about" | "contact" | "pricing" | "trust-security" | "privacy-policy" | "journalist-privacy" | "terms-conditions">(() =>
    isAuthenticationLanding() ? "platform-home" : (directViewFromLocation() ?? "landing"),
  );
  // One owner for every in-flight authority/cache request. Identity changes
  // abort this scope before any new session can begin.
  const authRequestGeneration = useRef(0);
  const authRequestAbort = useRef(new AbortController());
  const refreshAuthoritativeSession = useRef<() => void>(() => {});
  const confirmedSessionRef = useRef<LocalSession | null>(null);
  const authLoadingRef = useRef(true);
  const [authLoading, setAuthLoading] = useState(true);
  const projectRefreshRef = useRef<{ signal: AbortSignal; promise: Promise<void> } | null>(null);
  const [activeClient, setActiveClient] = useState<Client | null>(null);
  const activeClientRef = useRef<Client | null>(null);
  activeClientRef.current = activeClient;
  const [currentPage, setCurrentPage] = useState("dashboard");
  // Lazy route chunks can take a moment on their first visit. Navigation is a
  // transition so React keeps the current page visible until the destination
  // is ready instead of replacing the whole app with the root Suspense spinner.
  const transitionToView = useCallback((nextView: typeof view) => {
    warmRoute(VIEW_PRELOADERS[nextView]);
    startTransition(() => setView(nextView));
  }, []);
  const transitionToPage = useCallback((nextPage: string) => {
    warmRoute(PAGE_PRELOADERS[nextPage]);
    // Commit the destination immediately so a cold lazy chunk shows the
    // shell-preserving page loader instead of leaving the previous page on
    // screen while React waits for the transition to finish.
    setCurrentPage(nextPage);
  }, []);
  const [pendingAuditId, setPendingAuditId] = useState<string | null>(null);
  const [pendingDiagnosticId, setPendingDiagnosticId] = useState<string | null>(null);
  const [pendingContentGeoId, setPendingContentGeoId] = useState<string | null>(null);
  const [pendingTechGeoId, setPendingTechGeoId] = useState<string | null>(null);
  const [georgeOpen, setGeorgeOpen] = useState(false);
  const [georgeHasUpdate, setGeorgeHasUpdate] = useState(false);
  const [georgeAnonOpen, setGeorgeAnonOpen] = useState(false);
  const [, setSavedAuditsVersion] = useState(0);

  useEffect(() => {
    const handler = () => setSavedAuditsVersion((v) => v + 1);
    window.addEventListener("aio:saved-audits-changed", handler);
    return () => window.removeEventListener("aio:saved-audits-changed", handler);
  }, []);
  const [insightsFilter, setInsightsFilter] = useState<string | null>(null);
  const [insightsArticleId, setInsightsArticleId] = useState<string | null>(() =>
    (publicViewFromLocation() ?? "landing") === "insights" ? articleIdFromLocation() : null
  );
  const [clientLogos, setClientLogos] = useState<Record<string, string>>(() => loadClientLogos());
  const [namingProject, setNamingProject] = useState(false);
  const [createProjectCapacity, setCreateProjectCapacity] = useState<PackageCapacity | null>(null);
  // Keep one server-stable draft across a lost upsert response. The modal
  // remains open on any persistence error and retries this exact id.
  const pendingProjectDraftRef = useRef<{
    sessionUsername: string;
    project: Client;
    logo?: string;
  } | null>(null);
  const [pendingProjectError, setPendingProjectError] = useState<string | null>(null);
  // When set, the project being named was started from a client placeholder
  // card in the hub: pre-fill the client's company name and, once created,
  // assign the project to that client account.
  const [showGenerateFromUrl, setShowGenerateFromUrl] = useState(false);
  const [storedProjects, setStoredProjects] = useState<Client[]>([]);

  // Warm only the small set of destinations that are likely from the current
  // context. Each chunk is queued separately during idle time, preserving route
  // splitting and yielding between downloads.
  useEffect(() => {
    if (!routePreloadingEnabled || authLoading) return;
    if (view === "platform-home") {
      return scheduleIdlePreloads([
        loadDashboardPage,
        loadSubAccountsPage,
        loadGuidancePage,
        loadArchivedProjectsPage,
      ]);
    }
    if (view === "platform") {
      return scheduleIdlePreloads(
        PROJECT_IDLE_PRELOADS[currentPage] ?? PROJECT_IDLE_PRELOADS.default,
      );
    }
    return scheduleIdlePreloads(
      PUBLIC_IDLE_PRELOADS[view] ?? PUBLIC_IDLE_PRELOADS.default,
    );
  }, [view, currentPage, authLoading]);

  // Marketing navigation is mostly ordinary same-origin links. Event
  // delegation provides hover/focus warming without coupling every marketing
  // component to the route loader.
  useEffect(() => {
    if (!routePreloadingEnabled) return;
    const warmLinkedRoute = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      const base = appBase().replace(/\/+$/, "");
      let path = url.pathname;
      if (base && (path === base || path.startsWith(`${base}/`))) path = path.slice(base.length);
      const slug = path.replace(/^\/+/, "").split("/")[0].toLowerCase();
      warmRoute(VIEW_PRELOADERS[SLUG_TO_VIEW[slug] ?? (slug ? "" : "landing")]);
    };
    document.addEventListener("pointerover", warmLinkedRoute, { capture: true, passive: true });
    document.addEventListener("focusin", warmLinkedRoute, true);
    return () => {
      document.removeEventListener("pointerover", warmLinkedRoute, true);
      document.removeEventListener("focusin", warmLinkedRoute, true);
    };
  }, []);


  // Pull the shared project list and refresh the hub. Used on first load and
  // again whenever the tab regains focus, so a project a colleague created on
  // another device shows up without a manual page reload.
  const resyncProjects = useCallback(async (options: { background?: boolean } = {}) => {
    // Background focus/visibility timers must never probe project/account
    // endpoints while the cookie authority check is unresolved or signed out.
    if (authLoadingRef.current || !confirmedSessionRef.current) return;
    // Refresh the cached accounts list in the same breath so the managed
    // Clients section stays current across devices. Runs in parallel with the
    // project sync and keeps the existing cache on any failure.
    const generation = authRequestGeneration.current;
    const signal = authRequestAbort.current.signal;
    // Focus and visibility often fire together. Only passive refreshes join an
    // in-flight read; a post-mutation refresh must always fetch fresh data.
    if (options.background && projectRefreshRef.current?.signal === signal) {
      return projectRefreshRef.current.promise;
    }
    const refresh = (async () => {
      // The session cookie can change in another tab without producing a 401.
      // Verify the active workspace identity before accepting any project list
      // returned under that cookie.
      const authority = await bootstrapAuth({ signal });
      if (signal.aborted || generation !== authRequestGeneration.current) return;
      const expected = confirmedSessionRef.current;
      if (!authority.session || !expected
        || authority.session.username !== expected.username
        || authority.session.role !== expected.role) {
        refreshAuthoritativeSession.current();
        return;
      }
      const [result] = await Promise.all([syncProjectsOnLoad({ signal }), refreshAccountsCache(signal)]);
      if (signal.aborted || generation !== authRequestGeneration.current) return;
      if (result === "unauthorized") {
        // Server session has expired mid-use. Re-check with /api/platform/me;
        // if it confirms the session is gone, clear local state and redirect
        // to the login screen so the user can re-authenticate.
        refreshAuthoritativeSession.current();
        return;
      }
      if (result) {
        // Claim any ownerless project the sync just pulled down (e.g. a legacy
        // NULL-owned row) before showing the list, so it is attributed to the
        // master instead of silently vanishing.
        await migrateAssignOwnerlessToAdmin({ signal });
        if (signal.aborted || generation !== authRequestGeneration.current) return;
        const merged = loadStoredProjects() as unknown as Client[];
        setStoredProjects(merged);
        setClientLogos(result.logos);
        // Update the module-level known-IDs cache so the integrity check inside
        // setActiveProjectId always compares against the current project list,
        // then run a proactive check in case the active ID drifted since the
        // last sync (e.g. after a login change on another device).
        const ids = merged.map((p) => p.id);
        setKnownProjectIds(ids);
        assertActiveProjectConsistency(ids);
        if (activeClientRef.current && !ids.includes(activeClientRef.current.id)) {
          resetContentStore();
          setActiveProjectId(null);
          setActiveClient(null);
          setPendingAuditId(null);
          setPendingDiagnosticId(null);
          setPendingContentGeoId(null);
          setPendingTechGeoId(null);
          setCurrentPage("dashboard");
          transitionToView("platform");
        }
      }
    })();
    projectRefreshRef.current = { signal, promise: refresh };
    try {
      await refresh;
    } finally {
      if (projectRefreshRef.current?.promise === refresh) projectRefreshRef.current = null;
    }
  }, []);

  useEffect(() => {
    migrateLegacyIntakeToProject();
    // Never render project metadata from a previous browser session before the
    // authenticated server has supplied this workspace's authorized list.
    setStoredProjects([]);
    setKnownProjectIds([]);
    // Reconcile the session with the server (the real authority) before any
    // protected destination becomes reachable. Cache migration/account refresh
    // happens only in the normal post-authority project sync.
    void (async () => {
      const generation = ++authRequestGeneration.current;
      const signal = authRequestAbort.current.signal;
      setAuthError(null);
      const {
        session: s,
        needsSetup: bootNeedsSetup,
        hasPassword: bootHasPassword,
        workspaces: ws,
        accountProfile: ap,
        impersonating,
        error,
      } = await bootstrapAuth({ signal });
      // A logout, a newer sign-in, or a workspace change may have happened
      // while /me was in flight. Never let that older authority reply revive
      // an identity or its setup destination.
      if (signal.aborted || generation !== authRequestGeneration.current) return;
      if (s) setCachedSession(s);
      else clearCachedSession();
      confirmedSessionRef.current = s;
      setSessionState(s);
      setAuthError(error ?? null);
      setAgencyImpersonatedBy(impersonating?.byRole === "agency" ? impersonating.by : null);
      if (ws && ws.length > 0) setWorkspaces(ws);
      // The server is authoritative here. A stale ?needs_setup=1 callback URL
      // must not keep an already-configured client trapped on the setup page.
      setNeedsSetup(bootNeedsSetup === true);
      if (bootHasPassword !== undefined) setHasPassword(bootHasPassword);
      // Only store profile when the session role is client (direct brand) or
      // agency - admins never need it and it keeps the guard simple in IntakePage.
      if (ap && s && (s.role === "client" || s.role === "agency")) {
        setAccountProfile(ap);
      }
      setAuthLoading(false);
      authLoadingRef.current = false;
      if (!s) return;
      await migrateLocalStorageContentToServer({ signal });
      if (generation !== authRequestGeneration.current) return;
      // Project discovery does not depend on archive/planner/scoring reads.
      // Keep legacy migration ordered but remove the subsequent read waterfall.
      await Promise.all([initContentStore({ signal }), resyncProjects()]);
    })();
  }, [resyncProjects]);

  // Live refresh: re-sync when the tab becomes visible or regains focus, and on
  // a gentle interval while open, so colleagues see each other's new projects
  // without reloading. All calls are no-ops when the server is unreachable.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void resyncProjects({ background: true });
    };
    const onFocus = () => void resyncProjects({ background: true });
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void resyncProjects({ background: true });
    }, 60000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
    };
  }, [resyncProjects]);

  const openProjectBilling = async () => {
    if (session?.agencyManagedClient) {
      const navigateToAgencyBilling = () => {
        sessionStorage.removeItem("aio:open-client-projects");
        window.location.replace(appBase() + "?aio_exit_impersonation=1&account_section=billing");
      };
      const reconcileExit = async () => {
        if (!agencyImpersonatedBy) return false;
        const response = await fetch(`${apiBase()}/api/platform/me`, { credentials: "include" });
        if (!response.ok) return false;
        const me = await response.json();
        if (me.account?.username !== agencyImpersonatedBy || me.impersonating) return false;
        navigateToAgencyBilling();
        return true;
      };
      try {
        const result = await serverExitImpersonation();
        if (!result.ok) {
          if (await reconcileExit()) return;
          window.alert(result.error || "Could not return to your agency. Use Back to my agency account to retry.");
          return;
        }
        navigateToAgencyBilling();
      } catch {
        try { if (await reconcileExit()) return; } catch { /* leave the current page recoverable */ }
        window.alert("Could not return to your agency billing. Use Back to my agency account to retry.");
      }
      return;
    }
    setAccountSection("billing");
    transitionToView("sub-accounts");
  };

  const beginCreateProject = () => requireSessionThen(() => {
    // Agency-root projects do not consume the managed client/project product
    // correctly. Start from client selection so the project is created with a
    // server-authorized managed-client owner.
    if (shouldRouteProjectCreationToManagedClients(session ?? {})) {
      setAccountSection("clients");
      transitionToView("sub-accounts");
      return;
    }
    void (async () => {
      if (session?.role !== "admin") {
        const allowance = await fetchProjectAllowance();
        const owner = session?.username.toLowerCase();
        const ownerHasProject = !!owner && loadStoredProjects().some(
          (project) => (project.owner || "").toLowerCase() === owner,
        );
        const blocked = allowance?.packageCapacity
          ? shouldBlockProjectCreation(allowance.packageCapacity, {
              agencyManagedClient: session?.agencyManagedClient === true,
              ownerHasProject,
            })
          : allowance?.atLimit === true;
        if (blocked) {
          await openProjectBilling();
          return;
        }
        setCreateProjectCapacity(allowance?.packageCapacity ?? null);
      }
      setPendingProjectError(null);
      pendingProjectDraftRef.current = null;
      setNamingProject(true);
    })();
  });

  const deleteProjectConfirmed = async (id: string) => {
    const startedSession = deletionSessionRef.current;
    const result = await deleteRemoteProject(id);
    if (deletionSessionRef.current !== startedSession) {
      return { ok: false, error: "Workspace changed. Refresh the project list before trying again." };
    }
    if (!result.ok) return result;
    const next = loadStoredProjects().filter((p) => p.id !== id);
    saveStoredProjects(next);
    setStoredProjects(next);
    setKnownProjectIds(next.map((p) => p.id));
    if (getActiveProjectId() === id) {
      setActiveProjectId("");
      setPendingAuditId(null);
      setPendingDiagnosticId(null);
      setPendingContentGeoId(null);
      setPendingTechGeoId(null);
    }
    setActiveClient((current) => current?.id === id ? null : current);
    setClientLogos((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
    return { ok: true };
  };

  // Existing archive callers remain fire-and-forget compatible, but failures
  // now leave their project in place rather than pretending deletion succeeded.
  const handleDeleteProject = (id: string) => {
    void deleteProjectConfirmed(id).then((result) => {
      if (!result.ok) window.alert(result.error);
    });
  };

  const confirmCreateProject = async (name: string, logo?: string) => {
    const startedSession = confirmedSessionRef.current;
    const previousDraft = pendingProjectDraftRef.current;
    const sessionUsername = startedSession?.username ?? session?.username;
    const project = previousDraft && previousDraft.sessionUsername === sessionUsername
      ? {
          ...previousDraft.project,
          name: name.trim() || previousDraft.project.name,
          initials: deriveInitials(name.trim() || previousDraft.project.name),
        }
      : createStoredProject(name, { persist: false });
    if (!previousDraft || previousDraft.sessionUsername !== sessionUsername) {
      pendingProjectDraftRef.current = { sessionUsername: sessionUsername ?? "", project, logo };
    } else {
      pendingProjectDraftRef.current = { ...previousDraft, project, logo };
    }
    setPendingProjectError(null);
    const pushResult = await pushProjectMeta(
      project as unknown as Record<string, unknown> & { id: string },
      logo,
    );
    if (!pushResult.ok) {
      if (pushResult.limitReached) {
        // No local project was published, so the modal can safely retry or
        // direct the user to billing without leaving a phantom hub card.
        pendingProjectDraftRef.current = null;
        setPendingProjectError(null);
        setNamingProject(true);
        const existing = loadStoredProjects();
        setStoredProjects(existing);
        setKnownProjectIds(existing.map((p) => p.id));
        setActiveProjectId(existing[0]?.id ?? null);
        setActiveClient(existing[0] ?? null);
        window.alert(
          pushResult.error ??
            "You've reached your project allowance. Add another project workspace from the Billing section of your account settings.",
        );
        await openProjectBilling();
        return { ok: false };
      }
      // A transient failure must not look like success. CreateProjectModal
      // keeps its inputs and retries the same stable project id.
      setPendingProjectError(pushResult.error ?? "The project could not be saved. Check your connection and try again.");
      return { ok: false };
    }
    // The account/workspace may have changed while the request was in flight.
    // Do not publish a project from the old authority into the new workspace.
    if (
      startedSession?.username !== confirmedSessionRef.current?.username ||
      startedSession?.username !== session?.username
    ) {
      setPendingProjectError("The workspace changed while this project was saving. Retry from the current workspace.");
      return { ok: false };
    }
    const afterCreate = loadStoredProjects();
    const nextProjects = [project, ...afterCreate.filter((p) => p.id !== project.id)];
    saveStoredProjects(nextProjects);
    setStoredProjects(nextProjects);
    // Update the known-IDs cache BEFORE setActiveProjectId so the integrity
    // check inside that call sees the newly persisted project as valid.
    setKnownProjectIds(nextProjects.map((p) => p.id));
    setActiveProjectId(project.id);
    setNamingProject(false);
    pendingProjectDraftRef.current = null;
    setPendingProjectError(null);
    try {
      const rawIntent = sessionStorage.getItem("aio:pending-client-project");
      if (rawIntent) {
        const intent = JSON.parse(rawIntent) as { project?: { id?: string } };
        if (intent.project?.id === project.id) sessionStorage.removeItem("aio:pending-client-project");
      }
    } catch { /* malformed intents are handled by the resume guard */ }
    if (logo) setClientLogos((prev) => ({ ...prev, [project.id]: logo }));
    setActiveClient(logo ? { ...project, logo } : project);
    warmRoute(loadIntakePage);
    // Commit the authenticated destination synchronously only after the
    // server and local cache both confirm the project.
    setCurrentPage("intake");
    setView("platform");
    return { ok: true };
  };

  const cancelCreateProject = () => {
    const pendingId = pendingProjectDraftRef.current?.project.id;
    try {
      const rawIntent = sessionStorage.getItem("aio:pending-client-project");
      if (pendingId && rawIntent) {
        const intent = JSON.parse(rawIntent) as { project?: { id?: string } };
        if (intent.project?.id === pendingId) sessionStorage.removeItem("aio:pending-client-project");
      }
    } catch {
      try { sessionStorage.removeItem("aio:pending-client-project"); } catch { /* no-op */ }
    }
    pendingProjectDraftRef.current = null;
    setPendingProjectError(null);
    setNamingProject(false);
  };

  const completeAccountOnboarding = useCallback(async (destinationSection: "profile" | "billing" = "profile"): Promise<{ ok: boolean; error?: string }> => {
    try {
      const response = await fetch(`${apiBase()}/api/platform/onboarding/complete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) return { ok: false, error: json.error ?? "Could not finish account setup." };
    } catch {
      return { ok: false, error: "Account setup could not finish. Check your connection and try again." };
    }
    setNeedsSetup(false);
    startTransition(() => {
      setAccountSection(destinationSection);
      setView("sub-accounts");
    });
    window.scrollTo(0, 0);
    return { ok: true };
  }, []);
  const [session, setSessionState] = useState<LocalSession | null>(() => {
    if (typeof window === "undefined") return null;
    seedAdminIfEmpty();
    // Browser storage is a convenience cache only. Do not render it while the
    // httpOnly-cookie authority check is unresolved.
    return null;
  });
  const deletionSessionRef = useRef(session);
  deletionSessionRef.current = session;
  // True until the server has confirmed (or denied) the session via
  // bootstrapAuth(). Guards must not redirect while this is true - the session
  // state is still provisional (localStorage only) and may not yet reflect the
  // real cookie state.
  const [authError, setAuthError] = useState<string | null>(null);
  // True when the user is signed in but hasn't chosen Agency/Partner vs Client yet
  // (new organic signups via password or SSO).
  const [needsSetup, setNeedsSetup] = useState(false);
  // Whether the signed-in account has a password hash. undefined = not yet
  // resolved (bootstrapAuth pending). false = SSO-only (no password set yet).
  const [hasPassword, setHasPassword] = useState<boolean | undefined>(undefined);
  // Profile data for intake prefill (company name + website). Set by
  // bootstrapAuth when the session is a direct account-owner session.
  // Null means prefill should not be attempted (impersonation, team member,
  // offline fallback, or admin account).
  const [accountProfile, setAccountProfile] = useState<AccountProfile | null>(null);
  // All workspaces the signed-in user belongs to (from /platform/me).
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  // Non-null when an agency user is working inside one of their client
  // accounts: the agency's name, used by the BackToAgencyLink control that
  // replaced the old full-width impersonation banner for this case.
  const [agencyImpersonatedBy, setAgencyImpersonatedBy] = useState<string | null>(null);
  const agencyImpersonatedByRef = useRef<string | null>(null);
  agencyImpersonatedByRef.current = agencyImpersonatedBy;

  const beginAuthoritativeHandoff = useCallback((provisional: LocalSession | null) => {
    authRequestAbort.current.abort();
    authRequestAbort.current = new AbortController();
    const generation = ++authRequestGeneration.current;
    const signal = authRequestAbort.current.signal;
    setSessionExpiredNotice(undefined);
    setGeorgeAnonOpen(false);
    setAuthError(null);
    setAuthLoading(true);
    authLoadingRef.current = true;
    // Never publish a provisional identity to app effects (invites,
    // impersonation, project sync) while /me is pending. In addition to
    // preventing access leakage, this prevents those effects from issuing a
    // competing /me request against the same newly-established cookie.
    void provisional;
    clearCachedSession();
    confirmedSessionRef.current = null;
    setSessionState(null);
    setStoredProjects([]);
    setClientLogos({});
    setKnownProjectIds([]);
    setActiveProjectId(null);
    setActiveClient(null);
    resetContentStore();
    setNeedsSetup(false);
    setHasPassword(undefined);
    setAccountProfile(null);
    void (async () => {
      const {
        session: confirmedSession,
        needsSetup: eligible,
        hasPassword: confirmedHasPassword,
        workspaces: confirmedWorkspaces,
        accountProfile: confirmedProfile,
        impersonating,
        error,
      } = await bootstrapAuth({ signal });
      if (signal.aborted || generation !== authRequestGeneration.current) return;
      if (confirmedSession) setCachedSession(confirmedSession);
      else clearCachedSession();
      confirmedSessionRef.current = confirmedSession;
      setSessionState(confirmedSession);
      setNeedsSetup(eligible === true);
      setWorkspaces(confirmedWorkspaces ?? []);
      setAuthError(error ?? null);
      setAgencyImpersonatedBy(impersonating?.byRole === "agency" ? impersonating.by : null);
      if (confirmedHasPassword !== undefined) setHasPassword(confirmedHasPassword);
      if (confirmedProfile && confirmedSession && (confirmedSession.role === "client" || confirmedSession.role === "agency")) {
        setAccountProfile(confirmedProfile);
      }
      setAuthLoading(false);
      authLoadingRef.current = false;
      if (!confirmedSession) return;
      await Promise.all([initContentStore({ signal }), resyncProjects()]);
    })();
  }, [resyncProjects]);
  refreshAuthoritativeSession.current = () => beginAuthoritativeHandoff(null);
  // Pending team invites addressed to the signed-in user's email.
  const [pendingInvites, setPendingInvites] = useState<PendingMyInvite[]>([]);
  const [pendingInvitesLoading, setPendingInvitesLoading] = useState(false);
  const [pendingInvitesError, setPendingInvitesError] = useState<string | null>(null);
  // Keeps confirmations rendered when the successful refresh removes their invite.
  const [acceptedInvites, setAcceptedInvites] = useState<AcceptedInvitation[]>([]);
  const inviteRequestGeneration = useRef(0);
  const inviteRequestUsername = useRef<string | null>(null);
  // Update during render so an old request cannot land in the gap before the
  // identity-change effect runs after commit.
  inviteRequestUsername.current = session?.username ?? null;
  // True when the user has dismissed the invite banner for this page session.
  const [inviteBannerDismissed, setInviteBannerDismissed] = useState(false);

  // Only show the projects this account is allowed to see. Admins see every
  // project; a normal account sees its own plus any belonging to its client
  // sub-accounts. This is what stops a non-admin login seeing every project.
  const visibleProjects = useMemo(() => {
    const allowed = getVisibleLocalUsernames(session);
    if (allowed === null) return storedProjects; // admin: no filtering
    const allowedSet = new Set(allowed);
    return storedProjects.filter((p) => allowedSet.has((p.owner || "").toLowerCase()));
  }, [storedProjects, session]);

  // "Client projects" shortcut (agency partners): SubAccountsPage stashes a
  // workspace-bound destination before the authorized transition reload.
  // Row actions always open the hub; only explicit project links open a project.
  const pendingClientProjectId = useRef<string | null>(null);
  const pendingClientProjectResumeRef = useRef<string | null>(null);
  // The shortcut is clicked from the account settings page, whose URL carries
  // ?account_section=clients. That param survives the impersonation reload and
  // its deep-link effect would otherwise navigate straight back to account
  // settings, overriding the shortcut. Consuming the stash suppresses it.
  const suppressAccountSectionNav = useRef(false);
  useEffect(() => {
    if (authLoading || !session) return;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem("aio:open-client-projects");
      if (raw !== null) sessionStorage.removeItem("aio:open-client-projects");
    } catch { /* non-fatal */ }
    if (raw === null) return;
    try {
      const parsed = JSON.parse(raw) as { username?: string; projectId?: string | null };
      if (!parsed || parsed.username !== session.username) return;
      pendingClientProjectId.current = typeof parsed.projectId === "string" ? parsed.projectId : null;
    } catch {
      pendingClientProjectId.current = null;
      return;
    }
    suppressAccountSectionNav.current = true;
    setAccountSection(null);
    setActiveClient(null);
    setActiveProjectId(null);
    transitionToView("platform");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session]);
  useEffect(() => {
    const pid = pendingClientProjectId.current;
    if (!pid) return;
    const target = visibleProjects.find((p) => p.id === pid);
    if (!target) return;
    pendingClientProjectId.current = null;
    void (async () => {
      setActiveProjectId(target.id);
      await syncIntakeForProject(target.id);
      setActiveClient({ ...target, logo: clientLogos[target.id] });
      transitionToPage("dashboard");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleProjects, clientLogos]);

  // If the browser was reloaded after impersonation but before the first
  // project upsert replied, finish the durable intent from the child session.
  // The same id is retried, so a lost response cannot create a duplicate.
  useEffect(() => {
    if (authLoading || !session) return;
    let raw: string | null = null;
    try { raw = sessionStorage.getItem("aio:pending-client-project"); } catch { return; }
    if (!raw) return;
    const clearPendingIntent = () => {
      try { sessionStorage.removeItem("aio:pending-client-project"); } catch { /* no-op */ }
      pendingClientProjectResumeRef.current = null;
    };
    let intent: {
      username?: string;
      operatorUsername?: string;
      project?: Client;
      logo?: string | null;
    };
    try {
      intent = JSON.parse(raw) as typeof intent;
    } catch {
      clearPendingIntent();
      return;
    }
    const username = intent.username?.trim();
    const operatorUsername = intent.operatorUsername?.trim();
    const pendingCandidate = intent.project;
    const projectIsValid = !!pendingCandidate
      && typeof pendingCandidate.id === "string"
      && pendingCandidate.id.trim().length > 0
      && typeof pendingCandidate.name === "string"
      && pendingCandidate.name.trim().length > 0
      && typeof pendingCandidate.owner === "string"
      && !!username
      && pendingCandidate.owner.trim().toLowerCase() === username.toLowerCase()
      && !!operatorUsername
      && (pendingCandidate.logo === undefined || pendingCandidate.logo === null || typeof pendingCandidate.logo === "string");
    if (!projectIsValid || (intent.logo !== undefined && intent.logo !== null && typeof intent.logo !== "string")) {
      clearPendingIntent();
      return;
    }
    // Leave the intent alone while the agency session is still in the
    // hand-off. A different authenticated identity must never consume it.
    const currentUsername = session.username.trim();
    if (username.toLowerCase() !== currentUsername.toLowerCase()) {
      if (currentUsername.toLowerCase() !== operatorUsername.toLowerCase()) clearPendingIntent();
      return;
    }
    if (agencyImpersonatedBy?.trim().toLowerCase() !== operatorUsername.toLowerCase()) {
      clearPendingIntent();
      return;
    }
    const authority = confirmedSessionRef.current;
    const generation = authRequestGeneration.current;
    const signal = authRequestAbort.current.signal;
    const pendingProject = intent.project;
    if (!pendingProject || pendingClientProjectResumeRef.current === pendingProject.id) return;
    pendingClientProjectResumeRef.current = pendingProject.id;
    void (async () => {
      const result = await pushProjectMeta(
        pendingProject as unknown as Record<string, unknown> & { id: string },
        intent.logo,
      );
      // The cookie/session may have changed while the upsert was in flight.
      // Keep the durable intent for the new authority to reconcile, but never
      // publish this response into another workspace's local cache.
      if (
        signal.aborted
        || generation !== authRequestGeneration.current
        || confirmedSessionRef.current !== authority
        || confirmedSessionRef.current?.username.trim().toLowerCase() !== username.toLowerCase()
        || agencyImpersonatedByRef.current?.trim().toLowerCase() !== operatorUsername.toLowerCase()
      ) {
        pendingClientProjectResumeRef.current = null;
        return;
      }
      if (!result.ok) {
        pendingClientProjectResumeRef.current = null;
        pendingProjectDraftRef.current = {
          sessionUsername: username,
          project: pendingProject,
          logo: intent.logo ?? undefined,
        };
        setPendingProjectError(result.error ?? "The Client Project could not be saved. Try again.");
        setNamingProject(true);
        return;
      }
      const current = loadStoredProjects();
      const next = current.some((p) => p.id === pendingProject.id)
        ? current
        : [pendingProject, ...current];
      saveStoredProjects(next);
      setStoredProjects(next);
      setKnownProjectIds(next.map((p) => p.id));
      try {
        sessionStorage.removeItem("aio:pending-client-project");
        sessionStorage.setItem(
          "aio:open-client-projects",
          JSON.stringify({ username, projectId: null }),
        );
      } catch { /* the project is still safely persisted */ }
      pendingClientProjectId.current = null;
      suppressAccountSectionNav.current = true;
      setAccountSection(null);
      setActiveClient(null);
      setActiveProjectId(null);
      transitionToView("platform");
    })();
  }, [agencyImpersonatedBy, authLoading, session, transitionToView]);

  // Poll for unseen admin replies so the George badge lights up even before
  // the user opens the support panel. Only runs when logged in (non-admin
  // users own tickets; admins don't need the badge).
  useEffect(() => {
    if (!session || session.role === "admin") return;
    const controller = new AbortController();
    let pending = false;

    const check = async () => {
      if (pending || document.visibilityState !== "visible" || controller.signal.aborted) return;
      pending = true;
      try {
        const r = await fetch(`${apiBase()}/api/support/tickets?mine=true&hasUpdate=true`, {
          credentials: "include", signal: controller.signal,
        });
        if (!r.ok) return;
        const d = await r.json() as { tickets?: unknown[] };
        if (!controller.signal.aborted) setGeorgeHasUpdate(Array.isArray(d.tickets) && d.tickets.length > 0);
      } catch { /* non-fatal */ }
      finally { pending = false; }
    };

    check();

    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    const onFocus = () => check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(check, 90_000);

    return () => {
      controller.abort();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
    };
  }, [session]);

  const handleAssignProjectOwner = async (id: string, owner: string): Promise<{ ok: boolean; error?: string }> => {
    // Persist server-side first (the upsert push deliberately never changes
    // owner). Only mirror the change locally once the server confirms it, so a
    // denied or failed reassignment never leaves the UI showing a move that did
    // not actually happen. On failure, resync from the server and surface why.
    const result = await serverAssignOwner(id, owner);
    if (!result.ok) {
      await resyncProjects();
      return result;
    }
    assignProjectOwner(id, owner);
    setStoredProjects(loadStoredProjects());
    await refreshAccountsCache();
    return { ok: true };
  };

  useEffect(() => { removeDemoSeedData(); }, []);

  // Keep the sidebar trigger badge in sync when GeorgeSupport marks a reply as seen
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ hasUpdate: boolean }>).detail;
      setGeorgeHasUpdate(detail.hasUpdate);
    };
    window.addEventListener("aio:george-updates-changed", handler);
    return () => window.removeEventListener("aio:george-updates-changed", handler);
  }, []);

  // Fetch pending invites for the signed-in user. Re-runs when the session
  // username changes (login / workspace switch). Uses the username as the dep
  // rather than the full session object to avoid unnecessary re-fetches.
  const reloadPendingInvites = useCallback(() => {
    const username = session?.username ?? null;
    const generation = ++inviteRequestGeneration.current;
    if (!username || session?.agencyManagedClient) {
      setPendingInvites([]);
      setPendingInvitesError(null);
      setPendingInvitesLoading(false);
      return;
    }
    setPendingInvitesLoading(true);
    setPendingInvitesError(null);
    void serverGetMyInvites().then((r) => {
      // Cookies can change before an old request settles. Never apply a reply
      // unless it is still the newest request for the same signed-in identity.
      if (generation !== inviteRequestGeneration.current || username !== inviteRequestUsername.current) return;
      setPendingInvitesLoading(false);
      if (r.ok) setPendingInvites(r.invites ?? []);
      else {
        setPendingInvites([]);
        setPendingInvitesError(r.error ?? "Failed to load invitations.");
      }
    });
  }, [session?.username, session?.agencyManagedClient]);
  useEffect(() => {
    // Invalidate all in-flight responses and immediately remove data that
    // belonged to the prior identity before loading this identity's invites.
    inviteRequestGeneration.current += 1;
    setPendingInvites([]);
    setPendingInvitesError(null);
    setAcceptedInvites([]);
    reloadPendingInvites();
  }, [reloadPendingInvites, session?.username]);
  const handleInvitationAccepted = useCallback((invite?: AcceptedInvitation) => {
    if (invite) {
      setAcceptedInvites((previous) => [...previous.filter((item) => item.token !== invite.token), invite]);
      // Avoid exposing a stale Accept action while the authoritative refresh is
      // in flight.
      setPendingInvites((previous) => previous.filter((item) => item.token !== invite.token));
    }
    reloadPendingInvites();
    void serverGetWorkspaces().then((ws: WorkspaceInfo[]) => { if (ws.length > 0) setWorkspaces(ws); });
  }, [reloadPendingInvites]);

  // Shown on the login form when the admin stash cookie expires mid view-as
  // session and the user is redirected back to sign in.
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState<string | undefined>(undefined);

  // Deep-link target section on the account settings page
  // (/?account_section=security from security emails). Captured once on load,
  // before the history-sync effect rewrites the URL and drops the query string.
  // Also kept in sync while the settings page is open so the section survives
  // a refresh and participates in Back/Forward history navigation.
  const [accountSection, setAccountSection] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("account_section");
    if (fromUrl) return fromUrl;
    if (params.has("delete_reauth")) return "security";
    if (!params.has("aio_exit_impersonation")) return null;
    try {
      const raw = sessionStorage.getItem("aio:master-account-return");
      sessionStorage.removeItem("aio:master-account-return");
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { section?: unknown };
      return typeof parsed.section === "string" ? parsed.section : null;
    } catch {
      return null;
    }
  });
  // A raw auth callback can deliberately re-open the section already selected
  // before navigation (e.g. Security → delete re-auth → Security). Keep a
  // revision so that semantic redirect is not lost to unchanged state values.
  const [authRedirectRevision, setAuthRedirectRevision] = useState(0);

  // Stripe Checkout return flag (/?checkout=success|cancelled). Captured once
  // on load, before the history-sync effect rewrites the URL and drops the
  // query string, then handed to the onboarding and Account Settings billing
  // cards. The session id is required to server-reconcile paid onboarding
  // before showing a payment acknowledgement.
  const [checkoutResult] = useState<"success" | "cancelled" | null>(() => {
    const v = new URLSearchParams(window.location.search).get("checkout");
    return v === "success" || v === "cancelled" ? v : null;
  });
  const [checkoutSessionId] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get("session_id"),
  );

  // Team invite token from /?invite=<token> - captured once on mount (the
  // history-sync effect rewrites the URL soon after).
  // Email clients sometimes append stray punctuation or whitespace to the
  // link; trim the obvious cruft here (the server normalises more thoroughly).
  const [inviteToken] = useState<string | null>(() => {
    const raw = new URLSearchParams(window.location.search).get("invite");
    if (!raw) return null;
    const cleaned = raw.trim().replace(/["'>)\]}.,;:!?]+$/, "");
    return cleaned || null;
  });
  // Token from a password-reset email link (/?reset_token=...). Captured once
  // on load, before the history-sync effect rewrites the URL and drops the
  // query string, then handed to PlatformHomePage as a prop.
  const [passwordResetToken] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get("reset_token"),
  );
  // Whether the reset_token arrived via a welcome email (?welcome=1). When
  // true PlatformHomePage shows "Set your password" copy instead of "Choose a
  // new password". Captured alongside reset_token before history-sync strips
  // the query string.
  const [isWelcomeLink] = useState<boolean>(
    () => new URLSearchParams(window.location.search).get("welcome") === "1",
  );
  // Token from a discount-invite link (/?discount_invite=...). Captured once
  // on load, before the history-sync effect strips the query string, then
  // handed to PlatformHomePage so the signup form can redeem it.
  const [discountInviteToken] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get("discount_invite"),
  );
  // OAuth/verification redirect params (/?oauth_status=mfa&mfa_token=... etc).
  // Captured once on load, before the history-sync effect rewrites the URL and
  // drops the query string, then handed to PlatformHomePage as a prop. Without
  // this, the MFA challenge token from an SSO login is lost and the user just
  // sees the plain sign-in form again.
  const [oauthRedirectParams, setOauthRedirectParams] = useState<string | null>(() => {
    return resolveAuthenticationRedirect().oauthRedirectParams;
  });
  const [deleteReauthResult, setDeleteReauthResult] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get("delete_reauth"),
  );

  // Navigate to the platform-home view when returning from a Google OAuth
  // redirect (e.g. /?oauth_status=ok), an impersonation exit, or a
  // switch-to-master reload. The session cookie is already set by the server;
  // the existing /api/platform/me call will pick it up.
  // Also handles the stash-cookie-expired case: no session to restore, so we
  // land on the login form with an explanatory notice.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirect = resolveAuthenticationRedirect();
    setOauthRedirectParams(redirect.oauthRedirectParams);
    if (redirect.isAuthRedirect) {
      warmRoute(loadPlatformHomePage);
      setView("platform-home");
    }
    // needs_setup is only a routing hint. bootstrapAuth and /platform/me are
    // authoritative, so a stale callback URL can never restart setup.
    // SSO round-trip succeeded - promote the staged sign-in method to the
    // remembered "last sign-in" record. Failure statuses never promote.
    if (params.get("oauth_status") === "ok") {
      confirmPendingSso();
    }
    if (params.has("account_section")) {
      // Land on the account settings page (the target section is passed to
      // SubAccountsPage via the captured accountSection state). If the user
      // is not signed in yet, the sub-accounts guard sends them to the login
      // page and accountSectionPending re-navigates after sign-in.
      warmRoute(loadPlatformHomePage);
      setView("platform-home");
    }
    if (params.has("aio_session_expired")) {
      setSessionExpiredNotice(
        "Your admin session expired while in view-as mode. Please sign in again.",
      );
      warmRoute(loadPlatformHomePage);
      setView("platform-home");
    }
  }, []);

  // --- Browser history sync ---------------------------------------------
  // The app navigates via internal state (view/currentPage) rather than URLs.
  // Without this, the browser Back button has no in-app history to step
  // through and leaves the site entirely. We mirror each navigation into the
  // history stack so Back moves through previous in-app screens instead.
  const navInitDone = useRef(false);
  const skipHistoryPush = useRef(false);
  // When a navigation should overwrite the current history entry instead of
  // adding a new one (e.g. an access-denied redirect), set this first.
  const replaceNextNav = useRef(false);
  // Always-current copies of the nav state so the popstate handler (which has
  // no deps) can tell whether a pop actually changes anything.
  const viewRef = useRef(view);
  viewRef.current = view;
  const pageRef = useRef(currentPage);
  pageRef.current = currentPage;
  const insightsArticleIdRef = useRef(insightsArticleId);
  insightsArticleIdRef.current = insightsArticleId;
  const accountSectionRef = useRef(accountSection);
  accountSectionRef.current = accountSection;
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }); }, [currentPage]);

  // SEO: authenticated platform views must never be indexed or followed by
  // crawlers. Public marketing pages set "index, follow" via PageHead when
  // they mount, so navigating back to a public page undoes this.
  useEffect(() => {
    const isPublic = view in VIEW_TO_SLUG;
    if (isPublic) return;
    let el = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("name", "robots");
      document.head.appendChild(el);
    }
    el.setAttribute("content", "noindex, nofollow");
  }, [view]);

  // Keep the intake prefill source fresh: when the user opens the intake page,
  // re-fetch their account profile so a name/website change made earlier in the
  // session (by them or by their agency) flows into the next fresh intake.
  useEffect(() => {
    if (currentPage !== "intake") return;
    if (!session) return;
    void fetchAccountProfile().then((ap) => setAccountProfile(ap));
  }, [currentPage, session]);

  useEffect(() => {
    const navState = { __aioNav: true, view, currentPage, insightsArticleId, accountSection };
    // Reflect the active settings section in the URL so a refresh restores it
    // (matches the email deep-link format /?account_section=security).
    const url = (view === "sub-accounts" || view === "users-admin") && accountSection
      ? viewToUrl(view, insightsArticleId) + "?account_section=" + encodeURIComponent(accountSection)
      : viewToUrl(view, insightsArticleId);
    if (!navInitDone.current) {
      navInitDone.current = true;
      window.history.replaceState(navState, "", url);
      return;
    }
    if (skipHistoryPush.current) {
      skipHistoryPush.current = false;
      return;
    }
    if (replaceNextNav.current) {
      replaceNextNav.current = false;
      window.history.replaceState(navState, "", url);
      return;
    }
    window.history.pushState(navState, "", url);
  }, [view, currentPage, insightsArticleId, accountSection]);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const s = e.state as { __aioNav?: boolean; view?: string; currentPage?: string; insightsArticleId?: string | null; accountSection?: string | null } | null;
      // Prefer the navigation state we pushed; fall back to deriving a public
      // page from the URL (e.g. a directly typed /about or a forward nav).
      const protectedDestination = protectedDestinationFromLocation();
      const targetView = (
        protectedDestination === "project-hub"
          ? "platform"
          : protectedDestination === "platform"
            ? "platform-home"
          : (s && s.__aioNav && s.view ? s.view : (directViewFromLocation() ?? "landing"))
      ) as typeof view;
      const targetPage = s && s.__aioNav && s.currentPage ? s.currentPage : pageRef.current;
      const targetArticleId = s && s.__aioNav
        ? (s.insightsArticleId ?? null)
        : (targetView === "insights" ? articleIdFromLocation() : null);
      const targetAccountSection = s && s.__aioNav
        ? (s.accountSection ?? null)
        : (() => {
            const params = new URLSearchParams(window.location.search);
            return params.get("account_section") ?? (params.has("delete_reauth") ? "security" : null);
          })();
      const redirect = resolveAuthenticationRedirect();
      // History entries for raw auth callbacks must be interpreted the same
      // way as initial load. This also restores a consumed OAuth/link result
      // when the user navigates Back/Forward to that entry.
      setOauthRedirectParams(redirect.oauthRedirectParams);
      setDeleteReauthResult(new URLSearchParams(window.location.search).get("delete_reauth"));
      if (redirect.isAuthRedirect) {
        accountSectionNavDone.current = false;
        setAuthRedirectRevision((revision) => revision + 1);
      }
      const resolvedTargetView = redirect.isAuthRedirect ? "platform-home" as typeof view : targetView;
      // Only apply (and arm the skip guard) when something actually changes,
      // otherwise the guard could stay armed and swallow the next real push.
      if (resolvedTargetView !== viewRef.current || targetPage !== pageRef.current || targetArticleId !== insightsArticleIdRef.current || targetAccountSection !== accountSectionRef.current) {
        skipHistoryPush.current = true;
        const applyPopNavigation = () => {
          setView(resolvedTargetView);
          setCurrentPage(targetPage);
          setInsightsArticleId(targetArticleId);
          setAccountSection(targetAccountSection);
        };
        // An auth callback replaces a public page with a security boundary.
        // Do not defer that swap: a transition may keep marketing content
        // painted while the cold Platform Home chunk is still pending.
        if (redirect.isAuthRedirect) applyPopNavigation();
        else startTransition(applyPopNavigation);
      }
      window.scrollTo(0, 0);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Navigate to the account settings page once the session is confirmed when
  // the page was opened via an email deep link (/?account_section=...).
  const accountSectionNavDone = useRef(false);
  useEffect(() => {
    if (!accountSection || accountSectionNavDone.current) return;
    if (authLoading || !session) return;
    accountSectionNavDone.current = true;
    // The "Client projects" shortcut consumed its stash this load - the
    // account_section param is a leftover from the page the shortcut was
    // clicked on, not a deep link to follow.
    if (suppressAccountSectionNav.current) return;
    if (session.role === "admin" && ["masters", "agencies", "clients", "archived", "demo", "beta", "usage", "audit"].includes(accountSection)) {
      transitionToView("users-admin");
    } else {
      transitionToView("sub-accounts");
    }
  }, [accountSection, authLoading, session, authRedirectRevision]);

  // Access guard for the protected admin pages. Done in an effect (not during
  // render) and as a history-replacing redirect so Back does not loop back
  // onto the denied page.
  // Guard is suppressed while authLoading is true - the session is still being
  // confirmed by the server and a null session at this point does not mean the
  // user is logged out.
  useEffect(() => {
    if (authLoading) return;
    const deniedUsersAdmin = view === "users-admin" && (!session || session.role !== "admin");
    const deniedInsightsAdmin = view === "insights-admin" && (!session || session.insightsCmsAccess !== true);
    if (deniedUsersAdmin || deniedInsightsAdmin) {
      replaceNextNav.current = true;
      transitionToView("platform-home");
    }
    // The client-accounts page needs a signed-in account, but is open to any
    // role (admins manage everyone via the User Management page instead).
    if (view === "sub-accounts" && !session) {
      replaceNextNav.current = true;
      transitionToView("platform-home");
    }
  }, [view, session, authLoading, transitionToView]);

  // Persist project logos whenever they change so they survive a refresh.
  useEffect(() => { saveClientLogos(clientLogos); }, [clientLogos]);

  const handleSignOut = () => {
    // Invalidate a still-settling /me reply before clearing UI state.
    authRequestAbort.current.abort();
    authRequestAbort.current = new AbortController();
    authRequestGeneration.current += 1;
    void serverLogout();
    clearCachedSession();
    setSessionState(null);
    setStoredProjects([]);
    setClientLogos({});
    setKnownProjectIds([]);
    setActiveProjectId(null);
    resetContentStore();
    setAuthLoading(false);
    confirmedSessionRef.current = null;
    authLoadingRef.current = false;
    setAuthError(null);
    setNeedsSetup(false);
    setAccountProfile(null);
    setActiveClient(null);
    setView("landing");
    window.scrollTo(0, 0);
  };

  const requireSessionThen = (next: () => void) => {
    // While auth is still loading, silently wait - the session is being
    // confirmed by the server and may not be null for much longer.
    if (authLoading) return;
    if (!session) {
      transitionToView("platform-home");
      window.scrollTo(0, 0);
      return;
    }
    next();
  };

  const handleLogoUpdate = (clientId: string, logoDataUrl: string) => {
    setClientLogos((prev) => ({ ...prev, [clientId]: logoDataUrl }));
    setActiveClient((prev) => (prev && prev.id === clientId ? { ...prev, logo: logoDataUrl } : prev));
    const project = loadStoredProjects().find((p) => p.id === clientId);
    if (project) void pushProjectMeta(project as unknown as Record<string, unknown> & { id: string }, logoDataUrl);
  };

  const goHome = () => {
    transitionToView("landing");
    window.scrollTo(0, 0);
  };

  const goToView = (v: string) => {
    if (v === "for-inhouse" || v === "insights" || v === "about" || v === "contact" || v === "for-agents" || v === "for-agencies" || v === "pricing" || v === "trust-security" || v === "privacy-policy" || v === "journalist-privacy" || v === "terms-conditions") {
      warmRoute(VIEW_PRELOADERS[v]);
      startTransition(() => {
        if (v === "insights") { setInsightsFilter(null); setInsightsArticleId(null); }
        setView(v as any);
      });
      window.scrollTo(0, 0);
    } else if (v === "landing" || v === "landing-b" || v === "landing-c") {
      transitionToView("landing");
      window.scrollTo(0, 0);
    } else if (v === "landing#features") {
      transitionToView("landing");
      setTimeout(() => { document.getElementById("features")?.scrollIntoView({ behavior: "smooth" }); }, 100);
    }
  };

  const enterPlatform = () => {
    warmRoute(loadPlatformHomePage);
    // Enter the auth destination synchronously. Its local Suspense boundary
    // keeps the sign-in shell visible while a cold chunk arrives instead of
    // retaining a marketing page during the transition.
    setView("platform-home");
  };
  const openAccountSettings = () => {
    setAccountSection("profile");
    transitionToView("sub-accounts");
    window.scrollTo(0, 0);
  };

  const isAuthed = !authLoading && !!session;

  // Team-invite landing page (/?invite=<token>) - full-page gate, shown before
  // any auth flow. The invitee sets a password or continues with SSO, then the
  // page reloads into the workspace dashboard (no account-type selection).
  if (inviteToken) {
    return (
      <Suspense fallback={<RouteLoading fullScreen />}>
        <InviteAcceptPage
          token={inviteToken}
          onAccepted={() => {
            // Full reload so the fresh session cookie drives bootstrapAuth;
            // oauth_status=ok routes straight to the platform home view.
            window.location.replace(`${import.meta.env.BASE_URL}?oauth_status=ok`);
          }}
        />
      </Suspense>
    );
  }

  // A payment return is not a fresh sign-in. Keep the same neutral payment
  // presentation while /me establishes authority instead of briefly showing
  // Platform Home before onboarding can reconcile the checkout.
  if (checkoutResult === "success" && authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#f8fafc]">
        <div className="w-full max-w-xl">
          <CheckoutReturnLoading />
        </div>
      </div>
    );
  }

  // Billing team members see invoices/billing only - no project data or tools.
  // Agency-partner clients have no billing of their own (the agency is billed),
  // so their billing members fall through to the normal read-only app instead.
  if (session?.membershipRole === "billing" && !session.agencyManagedClient && !authLoading) {
    return (
      <Suspense fallback={<RouteLoading fullScreen />}>
        <BillingOnlyPage workspace={session.username} onSignOut={handleSignOut} />
      </Suspense>
    );
  }

  // Server-authoritative guided setup for genuinely new organic workspace
  // owners. setupComplete null/true, members, staff, managed workspaces and
  // impersonated sessions never enter this gate.
  if (needsSetup && session && !authLoading) {
    return (
      <GuidedOnboardingPage
        checkoutResult={checkoutResult}
        checkoutSessionId={checkoutSessionId}
        accountProfile={accountProfile}
        accountRole={session.role === "client" || session.role === "agency" ? session.role : undefined}
        onRoleChanged={(role) => {
          setSessionState({ ...session, role });
          void refreshAccountsCache();
        }}
        onComplete={completeAccountOnboarding}
        onSignOut={handleSignOut}
      />
    );
  }

  // Kept above authenticated route returns so every authenticated destination
  // can opt into the same global invite surface.
  const showInviteBanner = !authLoading && !!session && !inviteBannerDismissed &&
    (pendingInvitesLoading || !!pendingInvitesError || pendingInvites.length > 0 || acceptedInvites.length > 0);
  const inviteBannerNode = showInviteBanner ? (
    <PendingInvitesBanner
      invites={pendingInvites}
      loading={pendingInvitesLoading}
      loadError={pendingInvitesError}
      onRetry={reloadPendingInvites}
      acceptedInvites={acceptedInvites}
      onInviteAccepted={handleInvitationAccepted}
      onDismiss={() => setInviteBannerDismissed(true)}
    />
  ) : null;

  if (view === "landing") {
    return <LandingPageC onLogin={enterPlatform} onNavigate={goToView} isAuthed={isAuthed} />;
  }
  if (view === "for-inhouse") {
    return <ForInhousePage onLogin={enterPlatform} onBack={goHome} onNavigate={goToView} isAuthed={isAuthed} />;
  }
  if (view === "for-agencies") {
    return <ForAgenciesPage onLogin={enterPlatform} onBack={goHome} onNavigate={goToView} isAuthed={isAuthed} />;
  }
  if (view === "insights") {
    return <InsightsPage onLogin={enterPlatform} onBack={goHome} onNavigate={goToView} isAuthed={isAuthed} initialFilter={insightsFilter} onClearFilter={() => setInsightsFilter(null)} openArticleId={insightsArticleId} onOpenArticle={setInsightsArticleId} onCloseArticle={() => setInsightsArticleId(null)} />;
  }
  if (view === "about") {
    return <AboutPage onLogin={enterPlatform} onBack={goHome} onNavigate={goToView} isAuthed={isAuthed} />;
  }
  if (view === "contact") {
    return <ContactPage onLogin={enterPlatform} onBack={goHome} onNavigate={goToView} isAuthed={isAuthed} />;
  }
  if (view === "pricing") {
    return <PricingPage onLogin={enterPlatform} onNavigate={goToView} isAuthed={isAuthed} />;
  }
  if (view === "trust-security") {
    return <TrustSecurityPage onLogin={enterPlatform} onBack={goHome} onNavigate={goToView} isAuthed={isAuthed} />;
  }
  if (view === "privacy-policy") {
    return <PrivacyPolicyPage onLogin={enterPlatform} onBack={goHome} onNavigate={goToView} isAuthed={isAuthed} />;
  }
  if (view === "journalist-privacy") {
    return <JournalistPrivacyPage onLogin={enterPlatform} onBack={goHome} onNavigate={goToView} isAuthed={isAuthed} />;
  }
  if (view === "terms-conditions") {
    return <TermsConditionsPage onLogin={enterPlatform} onBack={goHome} onNavigate={goToView} isAuthed={isAuthed} />;
  }
  if (view === "platform-home") {
    return (
      <Suspense fallback={<AuthPageLoading />}>
        {inviteBannerNode}
        <div data-testid="platform-home-banner-offset" className="min-w-0 max-w-full overflow-x-hidden" style={{ marginTop: "var(--banner-h, 0px)" }}>
          <PlatformHomePage
            backToAgency={agencyImpersonatedBy ? <BackToAgencyLink agencyName={agencyImpersonatedBy} light /> : undefined}
            // During a successful credential hand-off the local session is
            // provisional. Keep it out of PlatformHome until /me confirms it.
            session={authLoading ? null : session}
            authPending={authLoading}
            authError={authError}
            onRetryAuthentication={() => beginAuthoritativeHandoff(null)}
            oauthRedirectParams={oauthRedirectParams}
            onOauthParamsConsumed={() => setOauthRedirectParams(null)}
            onLoginSuccess={beginAuthoritativeHandoff}
            onSignOut={handleSignOut}
            onManageUsers={() => {
              if (session?.role === "admin") {
                setAccountSection("agencies");
                transitionToView("users-admin");
              }
            }}
            onPrivacyRights={() => { if (session?.role === "admin") transitionToView("privacy-admin"); }}
            onManageTeam={() => requireSessionThen(() => {
              setAccountSection("team");
              transitionToView("sub-accounts");
            })}
            onManageSubAccounts={() => requireSessionThen(openAccountSettings)}
            onInsightsAdmin={() => { if (session?.insightsCmsAccess) transitionToView("insights-admin"); }}
            onCreateProject={beginCreateProject}
            onContinueToProjects={() => requireSessionThen(() => transitionToView("platform"))}
            onArchivedProjects={() => requireSessionThen(() => transitionToView("archived-projects"))}
            onGuidance={() => transitionToView("guidance")}
            onBackToLanding={() => goHome()}
            onOpenGeorge={!session ? () => setGeorgeAnonOpen(true) : undefined}
            initialNotice={sessionExpiredNotice}
            resetToken={passwordResetToken}
            isWelcomeLink={isWelcomeLink}
            hasPassword={hasPassword}
            discountInviteToken={discountInviteToken}
          />
        </div>
        {!session && (
          <GeorgeSupport
            open={georgeAnonOpen}
            onClose={() => setGeorgeAnonOpen(false)}
            anonMode
          />
        )}
        {namingProject && (
          <CreateProjectModal
            initialName={pendingProjectDraftRef.current?.project.name}
            error={pendingProjectError}
            packageCapacity={createProjectCapacity}
            onCancel={cancelCreateProject}
            onCreate={confirmCreateProject}
          />
        )}
      </Suspense>
    );
  }
  if (view === "users-admin") {
    if (!session || session.role !== "admin") {
      return null;
    }
    return <UsersAdminPage session={session} initialSection={accountSection ?? undefined} onSectionChange={setAccountSection} onBack={() => transitionToView("platform-home")} onAssignProjectOwner={handleAssignProjectOwner} onDeleteProject={deleteProjectConfirmed} onProjectCreated={() => { void resyncProjects(); }} onSupportAdmin={() => transitionToView("support-admin" as any)} onLeadsAdmin={() => transitionToView("leads-admin" as any)} onInsightsAdmin={() => transitionToView("insights-admin")} />;
  }
  if (view === "insights-admin") {
    if (!session || session.insightsCmsAccess !== true) return null;
    return <InsightsAdminPage onBack={() => transitionToView("platform-home")} />;
  }
  if (view === "privacy-admin") {
    if (!session || session.role !== "admin") return null;
    return <Suspense fallback={<RouteLoading fullScreen />}><PrivacyRightsAdminPage onBack={() => transitionToView("platform-home")} /></Suspense>;
  }
  if ((view as string) === "leads-admin") {
    if (!session || session.role !== "admin") return null;
    return (
      <Suspense fallback={<RouteLoading fullScreen />}>
        <LeadsAdminPage onBack={() => transitionToView("users-admin")} />
      </Suspense>
    );
  }
  if ((view as string) === "support-admin") {
    if (!session || session.role !== "admin") return null;
    return (
      <Suspense fallback={<RouteLoading fullScreen />}>
        <SupportAdminPage onBack={() => transitionToView("users-admin")} />
      </Suspense>
    );
  }
  if ((view as string) === "contact-admin") {
    if (!session || session.role !== "admin") return null;
    return (
      <Suspense fallback={<RouteLoading fullScreen />}>
        <ContactSubmissionsAdminPage onBack={() => transitionToView("users-admin")} />
      </Suspense>
    );
  }
  if (view === "sub-accounts") {
    // Direct clients are leaf accounts and cannot manage sub-accounts, but
    // they may still reach this page (as "My Account") if they are a Client
    // account type - they just won't see the sub-account management sections.
    if (!session) {
      return null;
    }
    const handleRoleChanged = async (_newRole: import("./lib/auth").Role) => {
      // Re-sync the authoritative session from the server so all role-dependent
      // UI (dashboard tabs, project limits, etc.) reflects the new type. The
      // shared hand-off owns generation/abort/cache commits.
      refreshAuthoritativeSession.current();
    };
    return (
      <>
      <SubAccountsPage
        backToAgency={agencyImpersonatedBy ? <BackToAgencyLink agencyName={agencyImpersonatedBy} /> : undefined}
        initialSection={accountSection ?? undefined}
        deleteReauthResult={deleteReauthResult}
        checkoutResult={checkoutResult}
        checkoutSessionId={checkoutSessionId}
        onSectionChange={(s) => setAccountSection(s)}
        session={session}
        onBack={() => {
          setAccountSection(null);
          transitionToView("platform-home");
          window.scrollTo(0, 0);
        }}
        onOpenProject={() => {
          setAccountSection(null);
          transitionToView("platform");
          window.scrollTo(0, 0);
        }}
        onAssignProjectOwner={handleAssignProjectOwner}
        onRoleChanged={handleRoleChanged}
        onWorkspacesChanged={() => {
          void serverGetWorkspaces().then((ws: WorkspaceInfo[]) => { if (ws.length > 0) setWorkspaces(ws); });
        }}
        onInvitationAccepted={handleInvitationAccepted}
        onSignOut={handleSignOut}
        onOpenGeorge={() => {
          setGeorgeOpen(true);
          setGeorgeHasUpdate(false);
        }}
      />
      <GeorgeSupport
        open={georgeOpen}
        onClose={() => setGeorgeOpen(false)}
        userName={session?.username}
      />
      </>
    );
  }
  if (view === "guidance") {
    return <GuidancePage onBack={() => transitionToView("platform-home")} />;
  }
  if (view === "archived-projects") {
    return <ArchivedProjectsPage onBack={() => transitionToView("platform-home")} />;
  }

  if (view === "for-agents") {
    return (
      <Suspense fallback={<RouteLoading fullScreen />}>
        <ForAgentsPage onLogin={enterPlatform} onBack={goHome} onNavigate={goToView} isAuthed={isAuthed} />
      </Suspense>
    );
  }

  if (!activeClient) {
    return (
      <>
       {inviteBannerNode}
      <ClientSelectorPage
        projects={visibleProjects}
        workspaceSwitcher={(workspaces.length > 1 || agencyImpersonatedBy) ? (
          <div className="flex items-center gap-3">
            {workspaces.length > 1 && <WorkspaceSwitcher workspaces={workspaces} />}
            {agencyImpersonatedBy && <BackToAgencyLink agencyName={agencyImpersonatedBy} />}
          </div>
        ) : undefined}
        onSelectClient={async (client) => {
          // Cards can outlive a background refresh for one render. Validate at
          // the final boundary before any project-scoped intake request.
          if (!isKnownProjectId(client.id) || !visibleProjects.some((project) => project.id === client.id)) {
            setActiveProjectId(null);
            setActiveClient(null);
            await resyncProjects();
            return;
          }
          setActiveProjectId(client.id);
          // Pull this project's latest Set-Up from the shared store before
          // opening it, so a colleague's saved work shows here too.
          await syncIntakeForProject(client.id);
          setActiveClient({ ...client, logo: clientLogos[client.id] });
          transitionToPage("dashboard");
        }}
        clientLogos={clientLogos}
        onLogoUpdate={handleLogoUpdate}
        onBackToPlatformHome={() => transitionToView("platform-home")}
        onCreateProject={beginCreateProject}
        onArchivedProjects={() => requireSessionThen(() => transitionToView("archived-projects"))}
        onGuidance={() => {
          setInsightsFilter("Guidance");
          transitionToView("insights");
        }}
        onDeleteProject={handleDeleteProject}
        session={session}
        onGenerateFromUrl={session?.role === "admin" ? () => setShowGenerateFromUrl(true) : undefined}
      />
      {namingProject && (
        <CreateProjectModal
          initialName={pendingProjectDraftRef.current?.project.name}
          error={pendingProjectError}
          packageCapacity={createProjectCapacity}
          onCancel={cancelCreateProject}
          onCreate={confirmCreateProject}
        />
      )}
      {showGenerateFromUrl && (
        <GenerateFromUrlModal
          onCancel={() => setShowGenerateFromUrl(false)}
          onComplete={async (projectId, _projectName) => {
            setShowGenerateFromUrl(false);
            await resyncProjects();
            // Navigate directly into the new project
            const target = storedProjects.find((p) => p.id === projectId);
            if (target) {
              setActiveProjectId(target.id);
              await syncIntakeForProject(target.id);
              setActiveClient({ ...target, logo: clientLogos[target.id] });
              transitionToPage("dashboard");
            }
          }}
        />
      )}
      </>
    );
  }

  return (
    <>
    {inviteBannerNode}
    <div className="flex w-full font-['Inter',sans-serif]" style={{ background: "#f8fafc", marginTop: "var(--banner-h, 0px)", height: "calc(100vh - var(--banner-h, 0px))" }}>
      <Sidebar
        workspaceSwitcher={(workspaces.length > 1 || agencyImpersonatedBy) ? (
          <div className="flex flex-col items-start gap-1.5">
            {workspaces.length > 1 && <WorkspaceSwitcher workspaces={workspaces} />}
            {agencyImpersonatedBy && <BackToAgencyLink agencyName={agencyImpersonatedBy} />}
          </div>
        ) : undefined}
        currentPage={currentPage}
        onNavigate={transitionToPage}
        onPreloadNavigate={routePreloadingEnabled ? (page) => warmRoute(PAGE_PRELOADERS[page]) : undefined}
        activeClient={activeClient}
        onBackToClients={() => setActiveClient(null)}
        onLogoUpdate={handleLogoUpdate}
        onOpenSavedAudit={(id) => { setPendingAuditId(id); transitionToPage("llm-check"); }}
        onOpenSavedDiagnostic={(id) => { setPendingDiagnosticId(id); transitionToPage("diagnostic"); }}
        onOpenSavedContentGeo={(id) => { setPendingContentGeoId(id); transitionToPage("geo-content"); }}
        onOpenSavedTechGeo={(id) => { setPendingTechGeoId(id); transitionToPage("seo-audit"); }}
        onOpenGeorge={() => { setGeorgeOpen(true); setGeorgeHasUpdate(false); }}
        georgeHasUpdate={georgeHasUpdate}
        onOpenAccount={openAccountSettings}
      />
      <GeorgeSupport
        open={georgeOpen}
        onClose={() => setGeorgeOpen(false)}
        userName={session?.username}
      />
      <main ref={mainRef} aria-label="AIO Fusion workspace" className="flex-1 overflow-y-auto pt-14 md:pt-0" style={{ background: "#1A647B" }}>
        <Suspense fallback={<RouteLoading />}>
          {currentPage === "dashboard" && (
            <DashboardPage onNavigate={transitionToPage} activeClient={activeClient} />
          )}
          {currentPage === "intake" && <IntakePage accountProfile={accountProfile} role={session?.role ?? null} />}
          {currentPage === "diagnostic" && (
            <DiagnosticPage activeClient={activeClient} pendingDiagnosticId={pendingDiagnosticId} onConsumePendingDiagnostic={() => setPendingDiagnosticId(null)} />
          )}
          {currentPage === "llm-check" && <LlmCheckPage activeClient={activeClient} onNavigate={transitionToPage} pendingAuditId={pendingAuditId} onConsumePending={() => setPendingAuditId(null)} />}
          {currentPage === "optimiser" && (
            <OptimiserPage onNavigate={transitionToPage} />
          )}
          {currentPage === "seo-audit" && <SeoAuditPage activeClient={activeClient} pendingTechGeoId={pendingTechGeoId} onConsumePendingTechGeo={() => setPendingTechGeoId(null)} />}
          {currentPage === "geo-content" && <GeoContentPage activeClient={activeClient} pendingContentGeoId={pendingContentGeoId} onConsumePendingContentGeo={() => setPendingContentGeoId(null)} />}
          {currentPage === "planner" && <PlannerPage onNavigate={transitionToPage} />}
          {currentPage === "creator" && <ContentCreatorPage onNavigate={transitionToPage} />}
          {currentPage === "media-research" && <MediaResearchPage />}
          {currentPage === "marketing-intel" && <MarketingIntelligencePage />}
          {currentPage === "gateway" && <ReleaseGatewayPage />}
          {currentPage === "archive" && <ArchivePage onNavigate={transitionToPage} />}
          {currentPage === "measure" && <ReportPage activeClient={activeClient} onNavigate={transitionToPage} />}
          {currentPage === "media-database" && <MediaDatabasePage />}
        </Suspense>
      </main>
    </div>
    </>
  );
}
export default App;

const BillingOnlyPage = lazy(() =>
  import("./pages/BillingOnlyPage").then((m) => ({ default: m.BillingOnlyPage }))
);
