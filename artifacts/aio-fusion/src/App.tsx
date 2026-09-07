import { loadIntakeData, getKeyMessages, getSpokespeople, getProjectMediaCategories, getProjectDataMessages, setActiveProjectId, getActiveProjectId, getConfirmedEntity, getLlmSearchQueries, getCompetitors } from "./IntakeForm";
import CountdownBanner from "./components/CountdownBanner";
import { syncProjectsOnLoad, syncIntakeForProject, pushProjectMeta, deleteRemoteProject, setKnownProjectIds, assertActiveProjectConsistency } from "./lib/projectSync";
import { fetchProjectAllowance } from "./lib/billingAllowance";
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
  getSession as getLocalSession,
  getUsers as getLocalUsers,
  getVisibleUsernames as getVisibleLocalUsernames,
  serverLogin,
  serverLogout,
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
import { getImpersonationState } from "./lib/auth";
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
  migrateLegacyIntakeToProject, createStoredProject,
  assignProjectOwner, migrateAssignOwnerlessToAdmin,
  migrateStoredIntakeKeys,
} from "./lib/projects";
import { initContentStore, migrateLocalStorageContentToServer, removeDemoSeedData, loadArchive, loadPlannerProjects, useContentStore, saveArchive } from "./lib/contentStore";
import { MiniDonut } from "./pages/shared";
import { loadSavedDiagnostics, loadSavedScored, contentGeoKey, techGeoKey } from "./lib/diagnosticStore";
import { CreateProjectModal } from "./components/CreateProjectModal";
import { GenerateFromUrlModal } from "./components/GenerateFromUrlModal";
import { Sidebar } from "./components/Sidebar";
import { GeorgeSupport } from "./components/GeorgeSupport";
import ClientSelectorPage from "./pages/ClientSelectorPage";
import { RouteLoading } from "./components/RouteLoading";
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

function directViewFromLocation(): PublicView | "insights-admin" | null {
  if (isInsightsAdminPath(window.location.pathname, appBase())) return "insights-admin";
  return publicViewFromLocation();
}

function viewToUrl(v: string, insightsArticleId?: string | null): string {
  if (v === "insights-admin") return appBase() + "admin";
  if (v === "insights" && insightsArticleId) {
    return appBase() + "insights/" + insightsArticleId;
  }
  return appBase() + (VIEW_TO_SLUG[v] ?? "");
}


function App() {
  const [view, setView] = useState<"landing" | "platform-home" | "platform" | "guidance" | "archived-projects" | "users-admin" | "insights-admin" | "sub-accounts" | "for-agents" | "for-agencies" | "for-inhouse" | "insights" | "about" | "contact" | "pricing" | "trust-security" | "privacy-policy" | "terms-conditions">(() => directViewFromLocation() ?? "landing");
  const [activeClient, setActiveClient] = useState<Client | null>(null);
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
    startTransition(() => setCurrentPage(nextPage));
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
  // When set, the project being named was started from a client placeholder
  // card in the hub: pre-fill the client's company name and, once created,
  // assign the project to that client account.
  const [showGenerateFromUrl, setShowGenerateFromUrl] = useState(false);
  const [storedProjects, setStoredProjects] = useState<Client[]>([]);

  // Warm only the small set of destinations that are likely from the current
  // context. Each chunk is queued separately during idle time, preserving route
  // splitting and yielding between downloads.
  useEffect(() => {
    if (!routePreloadingEnabled) return;
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
  }, [view, currentPage]);

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
  const resyncProjects = useCallback(async () => {
    // Refresh the cached accounts list in the same breath so the managed
    // Clients section stays current across devices. Runs in parallel with the
    // project sync and keeps the existing cache on any failure.
    const [result] = await Promise.all([syncProjectsOnLoad(), refreshAccountsCache()]);
    if (result === "unauthorized") {
      // Server session has expired mid-use. Re-check with /api/platform/me;
      // if it confirms the session is gone, clear local state and redirect
      // to the login screen so the user can re-authenticate.
      const { session: s } = await bootstrapAuth();
      setSessionState(s);
      return;
    }
    if (result) {
      // Claim any ownerless project the sync just pulled down (e.g. a legacy
      // NULL-owned row) before showing the list, so it is attributed to the
      // master instead of silently vanishing.
      await migrateAssignOwnerlessToAdmin();
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
    }
  }, []);

  useEffect(() => {
    migrateLegacyIntakeToProject();
    void migrateAssignOwnerlessToAdmin();
    setStoredProjects(loadStoredProjects());
    // Reconcile the session with the server (the real authority): this validates
    // the session cookie, runs the one-time account migration, and refreshes the
    // cached account list. Then sync the shared store so this login sees every
    // project it may see, on every device. Local-only projects are pushed up.
    void (async () => {
      const { session: s, needsSetup: bootNeedsSetup, hasPassword: bootHasPassword, workspaces: ws, accountProfile: ap } = await bootstrapAuth();
      setSessionState(s);
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
      await migrateLocalStorageContentToServer();
      await initContentStore();
      await resyncProjects();
    })();
  }, [resyncProjects]);

  // Live refresh: re-sync when the tab becomes visible or regains focus, and on
  // a gentle interval while open, so colleagues see each other's new projects
  // without reloading. All calls are no-ops when the server is unreachable.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void resyncProjects();
    };
    const onFocus = () => void resyncProjects();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void resyncProjects();
    }, 60000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
    };
  }, [resyncProjects]);

  const beginCreateProject = () => requireSessionThen(() => {
    void (async () => {
      if (session?.role !== "admin") {
        const allowance = await fetchProjectAllowance();
        if (allowance?.atLimit) {
          setAccountSection("billing");
          transitionToView("sub-accounts");
          return;
        }
      }
      setNamingProject(true);
    })();
  });

  const handleDeleteProject = (id: string) => {
    const next = loadStoredProjects().filter((p) => p.id !== id);
    saveStoredProjects(next);
    setStoredProjects(next);
    setClientLogos((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
    void deleteRemoteProject(id);
  };

  const confirmCreateProject = async (name: string, logo?: string) => {
    const project = createStoredProject(name);
    const afterCreate = loadStoredProjects();
    setStoredProjects(afterCreate);
    // Update the known-IDs cache BEFORE setActiveProjectId so the integrity
    // check inside that call sees the newly created project as valid.
    setKnownProjectIds(afterCreate.map((p) => p.id));
    setActiveProjectId(project.id);
    setNamingProject(false);
    if (logo) setClientLogos((prev) => ({ ...prev, [project.id]: logo }));
    setActiveClient(logo ? { ...project, logo } : project);
    warmRoute(loadIntakePage);
    startTransition(() => {
      setCurrentPage("intake");
      setView("platform");
    });
    const pushResult = await pushProjectMeta(
      project as unknown as Record<string, unknown> & { id: string },
      logo,
    );
    if (!pushResult.ok && pushResult.limitReached) {
      // Roll back the locally created project - the server rejected it.
      const rolled = loadStoredProjects().filter((p) => p.id !== project.id);
      saveStoredProjects(rolled);
      setStoredProjects(rolled);
      // Sync cache to rolled-back list before switching active ID.
      setKnownProjectIds(rolled.map((p) => p.id));
      const prev = rolled[0] ?? null;
      setActiveProjectId(prev?.id ?? null);
      setActiveClient(prev ?? null);
      window.alert(
        pushResult.error ??
          "You've reached your project allowance. Add another project workspace from the Billing section of your account settings.",
      );
      return;
    }
  };

  const resumeOnboardingProject = async (
    projectSummary: { id: string; name: string },
  ): Promise<{ ok: boolean; error?: string; saved?: boolean }> => {
    // Do not complete the server-side setup marker until this browser has
    // loaded the durable project it is about to enter.
    await resyncProjects();
    const projects = loadStoredProjects();
    const project = projects.find((candidate) => candidate.id === projectSummary.id);
    if (!project) {
      return { ok: false, error: "Your project is saved, but it is still loading. Refresh and continue setup.", saved: true };
    }
    try {
      const response = await fetch(`${apiBase()}/api/platform/onboarding/complete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: projectSummary.id }),
      });
      const json = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) return { ok: false, error: json.error ?? "Could not finish account setup." };
    } catch {
      return { ok: false, error: "Your project was saved, but setup could not finish. Check your connection and try again." };
    }
    setKnownProjectIds(projects.map((candidate) => candidate.id));
    setActiveProjectId(project.id);
    setActiveClient({ ...project, logo: clientLogos[project.id] });
    setNeedsSetup(false);
    warmRoute(loadIntakePage);
    startTransition(() => {
      setCurrentPage("intake");
      setView("platform");
    });
    return { ok: true };
  };

  const confirmOnboardingProject = async (name: string, logo?: string): Promise<{ ok: boolean; error?: string; saved?: boolean }> => {
    if (!session) return { ok: false, error: "Your session has expired. Sign in again." };
    const allowance = await fetchProjectAllowance();
    if (allowance?.atLimit) {
      return { ok: false, error: "Your project allowance is full. Check your access choice and try again." };
    }
    const project = createStoredProject(name);
    const afterCreate = loadStoredProjects();
    setStoredProjects(afterCreate);
    setKnownProjectIds(afterCreate.map((p) => p.id));
    if (logo) setClientLogos((previous) => ({ ...previous, [project.id]: logo }));
    const pushed = await pushProjectMeta(
      project as unknown as Record<string, unknown> & { id: string },
      logo,
    );
    if (!pushed.ok) {
      const rolled = loadStoredProjects().filter((p) => p.id !== project.id);
      saveStoredProjects(rolled);
      setStoredProjects(rolled);
      setKnownProjectIds(rolled.map((p) => p.id));
      return { ok: false, error: pushed.error ?? "Could not save the project. Check your connection and try again." };
    }
    const completed = await resumeOnboardingProject({ id: project.id, name: project.name });
    return completed.ok ? completed : { ...completed, saved: true };
  };
  const [session, setSessionState] = useState<LocalSession | null>(() => {
    if (typeof window === "undefined") return null;
    seedAdminIfEmpty();
    return getLocalSession();
  });
  // True until the server has confirmed (or denied) the session via
  // bootstrapAuth(). Guards must not redirect while this is true - the session
  // state is still provisional (localStorage only) and may not yet reflect the
  // real cookie state.
  const [authLoading, setAuthLoading] = useState(true);
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

  // Detect the agency-working-in-client-account case once per page load.
  useEffect(() => {
    if (!session || session.role === "admin") { setAgencyImpersonatedBy(null); return; }
    let cancelled = false;
    void getImpersonationState().then((imp) => {
      if (!cancelled) setAgencyImpersonatedBy(imp?.byRole === "agency" ? imp.by : null);
    });
    return () => { cancelled = true; };
  }, [session?.username, session?.role]);

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
  // flag in sessionStorage before the impersonation reload. Once the session
  // is confirmed, land on the projects hub - and when the client has exactly
  // one project, open it directly as soon as the sync makes it visible.
  const pendingClientProjectId = useRef<string | null>(null);
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
      const parsed = JSON.parse(raw) as { projectId?: string | null };
      pendingClientProjectId.current = typeof parsed.projectId === "string" ? parsed.projectId : null;
    } catch {
      pendingClientProjectId.current = null;
    }
    // Only neutralise the "clients" section leftover from the page the
    // shortcut was clicked on - a genuine email deep link to another section
    // (security, billing...) must still navigate even if a stale stash exists.
    setAccountSection((prev) => {
      if (prev === "clients") {
        suppressAccountSectionNav.current = true;
        return null;
      }
      return prev;
    });
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

  // Poll for unseen admin replies so the George badge lights up even before
  // the user opens the support panel. Only runs when logged in (non-admin
  // users own tickets; admins don't need the badge).
  useEffect(() => {
    if (!session || session.role === "admin") return;

    const check = () => {
      void fetch(`${apiBase()}/api/support/tickets?mine=true&hasUpdate=true`, {
        credentials: "include",
      })
        .then((r) => r.json())
        .then((d: { tickets?: unknown[] }) => {
          setGeorgeHasUpdate(Array.isArray(d.tickets) && d.tickets.length > 0);
        })
        .catch(() => {});
    };

    check();

    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    const onFocus = () => check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(check, 90_000);

    return () => {
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

  // Poll for George unread replies persistently: on session load and every 5 min
  const checkGeorgeUpdates = useCallback(async () => {
    if (!session) return;
    try {
      const r = await fetch(
        `${import.meta.env.VITE_API_BASE ?? ""}/api/support/tickets?mine=true&hasUpdate=true`,
        { credentials: "include" },
      );
      if (!r.ok) return;
      const d = (await r.json()) as { tickets?: unknown[] };
      setGeorgeHasUpdate(Array.isArray(d.tickets) && d.tickets.length > 0);
    } catch { /* non-fatal */ }
  }, [session]);

  useEffect(() => {
    void checkGeorgeUpdates();
    const id = window.setInterval(() => { void checkGeorgeUpdates(); }, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [checkGeorgeUpdates]);

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
    if (!username) {
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
  }, [session?.username]);
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

  // Stripe Checkout return flag (/?checkout=success|cancelled). Captured once
  // on load, before the history-sync effect rewrites the URL and drops the
  // query string, then handed to SubAccountsPage for the subscription card.
  const [checkoutResult] = useState<"success" | "cancelled" | null>(() => {
    const v = new URLSearchParams(window.location.search).get("checkout");
    return v === "success" || v === "cancelled" ? v : null;
  });

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
    const s = window.location.search;
    return /(?:^|[?&])(?:oauth_status|link_google|verify_status)=/.test(s) ? s : null;
  });
  const [deleteReauthResult] = useState<string | null>(
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
    if (
      params.has("oauth_status") ||
      params.has("needs_setup") ||
      params.has("verify_status") ||
      params.has("reset_token") ||
      params.has("discount_invite") ||
      params.has("aio_exit_impersonation") ||
      params.has("aio_switched_master") ||
      params.has("aio_switched_workspace")
    ) {
      warmRoute(loadPlatformHomePage);
      startTransition(() => setView("platform-home"));
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
      startTransition(() => setView("platform-home"));
    }
    if (params.has("aio_session_expired")) {
      setSessionExpiredNotice(
        "Your admin session expired while in view-as mode. Please sign in again.",
      );
      warmRoute(loadPlatformHomePage);
      startTransition(() => setView("platform-home"));
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
      const targetView = (
        s && s.__aioNav && s.view ? s.view : (directViewFromLocation() ?? "landing")
      ) as typeof view;
      const targetPage = s && s.__aioNav && s.currentPage ? s.currentPage : pageRef.current;
      const targetArticleId = s && s.__aioNav
        ? (s.insightsArticleId ?? null)
        : (targetView === "insights" ? articleIdFromLocation() : null);
      const targetAccountSection = s && s.__aioNav
        ? (s.accountSection ?? null)
        : new URLSearchParams(window.location.search).get("account_section");
      // Only apply (and arm the skip guard) when something actually changes,
      // otherwise the guard could stay armed and swallow the next real push.
      if (targetView !== viewRef.current || targetPage !== pageRef.current || targetArticleId !== insightsArticleIdRef.current || targetAccountSection !== accountSectionRef.current) {
        skipHistoryPush.current = true;
        startTransition(() => {
          setView(targetView);
          setCurrentPage(targetPage);
          setInsightsArticleId(targetArticleId);
          setAccountSection(targetAccountSection);
        });
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
  }, [accountSection, authLoading, session]);

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
    void serverLogout();
    setSessionState(null);
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
    if (v === "for-inhouse" || v === "insights" || v === "about" || v === "contact" || v === "for-agents" || v === "for-agencies" || v === "pricing" || v === "trust-security" || v === "privacy-policy" || v === "terms-conditions") {
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

  const enterPlatform = () => transitionToView("platform-home");

  const isAuthed = !!session;

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
        onRoleChanged={(role) => {
          setSessionState({ ...session, role });
          void refreshAccountsCache();
        }}
        onCreateFirstProject={confirmOnboardingProject}
        onResumeFirstProject={resumeOnboardingProject}
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
  if (view === "terms-conditions") {
    return <TermsConditionsPage onLogin={enterPlatform} onBack={goHome} onNavigate={goToView} isAuthed={isAuthed} />;
  }
  if (view === "platform-home") {
    return (
      <>
        {inviteBannerNode}
        <div data-testid="platform-home-banner-offset" className="min-w-0 max-w-full overflow-x-hidden" style={{ marginTop: "var(--banner-h, 0px)" }}>
          <PlatformHomePage
            backToAgency={agencyImpersonatedBy ? <BackToAgencyLink agencyName={agencyImpersonatedBy} light /> : undefined}
            session={session}
            oauthRedirectParams={oauthRedirectParams}
            onOauthParamsConsumed={() => setOauthRedirectParams(null)}
            onLoginSuccess={(s) => {
              setSessionExpiredNotice(undefined);
              setGeorgeAnonOpen(false);
              setSessionState(s);
              // Refresh accountProfile so an in-session login (password / SSO /
              // MFA) gets the same prefill as a page-load bootstrapAuth call.
              void fetchAccountProfile().then((ap) => setAccountProfile(ap));
              void initContentStore().then(() => resyncProjects());
            }}
            onSignOut={handleSignOut}
            // Login and MFA responses contain only a transient hint. Rehydrate
            // from /platform/me before opening the full-page gate so a stale or
            // exempt response (member, staff, managed workspace) cannot trap a
            // user in setup.
            onNeedsSetup={() => {
              void bootstrapAuth().then(({ needsSetup: eligible }) => {
                setNeedsSetup(eligible === true);
              });
            }}
            onManageUsers={() => {
              if (session?.role === "admin") {
                setAccountSection("agencies");
                transitionToView("users-admin");
              }
            }}
            onManageSubAccounts={() => requireSessionThen(() => transitionToView("sub-accounts"))}
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
        {namingProject && <CreateProjectModal onCancel={() => setNamingProject(false)} onCreate={confirmCreateProject} />}
      </>
    );
  }
  if (view === "users-admin") {
    if (!session || session.role !== "admin") {
      return null;
    }
    return <UsersAdminPage session={session} initialSection={accountSection ?? undefined} onSectionChange={setAccountSection} onBack={() => transitionToView("platform-home")} onAssignProjectOwner={handleAssignProjectOwner} onProjectCreated={() => { void resyncProjects(); }} onSupportAdmin={() => transitionToView("support-admin" as any)} onLeadsAdmin={() => transitionToView("leads-admin" as any)} onInsightsAdmin={() => transitionToView("insights-admin")} />;
  }
  if (view === "insights-admin") {
    if (!session || session.insightsCmsAccess !== true) return null;
    return <InsightsAdminPage onBack={() => transitionToView("platform-home")} />;
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
    const handleRoleChanged = async (newRole: import("./lib/auth").Role) => {
      // Re-sync the authoritative session from the server so all role-dependent
      // UI (dashboard tabs, project limits, etc.) reflects the new type.
      const { session: s } = await bootstrapAuth();
      setSessionState(s ?? { ...session, role: newRole });
    };
    return (
      <SubAccountsPage
        backToAgency={agencyImpersonatedBy ? <BackToAgencyLink agencyName={agencyImpersonatedBy} /> : undefined}
        initialSection={accountSection ?? undefined}
        deleteReauthResult={deleteReauthResult}
        checkoutResult={checkoutResult}
        onSectionChange={(s) => setAccountSection(s)}
        session={session}
        onBack={() => transitionToView("platform-home")}
        onAssignProjectOwner={handleAssignProjectOwner}
        onRoleChanged={handleRoleChanged}
        onWorkspacesChanged={() => {
          void serverGetWorkspaces().then((ws: WorkspaceInfo[]) => { if (ws.length > 0) setWorkspaces(ws); });
        }}
        onInvitationAccepted={handleInvitationAccepted}
        onSignOut={handleSignOut}
      />
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
          onCancel={() => setNamingProject(false)}
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
        onOpenAccount={() => transitionToView("sub-accounts")}
      />
      <GeorgeSupport
        open={georgeOpen}
        onClose={() => setGeorgeOpen(false)}
        userName={session?.username}
      />
      <main ref={mainRef} className="flex-1 overflow-y-auto pt-14 md:pt-0" style={{ background: "#1A647B" }}>
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
      </main>
    </div>
    </>
  );
}
export default App;

const BillingOnlyPage = lazy(() =>
  import("./pages/BillingOnlyPage").then((m) => ({ default: m.BillingOnlyPage }))
);
