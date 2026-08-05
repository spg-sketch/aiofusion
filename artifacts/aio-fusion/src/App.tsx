import { loadIntakeData, getKeyMessages, getSpokespeople, getProjectMediaCategories, getProjectDataMessages, setActiveProjectId, getActiveProjectId, getConfirmedEntity, getLlmSearchQueries, getCompetitors } from "./IntakeForm";
import CountdownBanner from "./components/CountdownBanner";
import { syncProjectsOnLoad, syncIntakeForProject, pushProjectMeta, deleteRemoteProject, setKnownProjectIds, assertActiveProjectConsistency } from "./lib/projectSync";
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
  canCreateSubAccounts,
  bootstrapAuth,
  fetchAccountProfile,
  serverGetMyInvites,
  serverGetWorkspaces,
  type SessionInfo,
} from "./lib/auth";
import { PendingInvitesBanner } from "./components/PendingInvitesBanner";
import { WorkspaceSwitcher } from "./components/WorkspaceSwitcher";
import { vars } from "./marketing/vars";
import AccountTypeSelectPage from "./pages/AccountTypeSelectPage";
import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from "react";
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
import { TokenUsageAdminPage, type TokenUsageRow, type TokenDailyRow, type TokenUserInfo, type SpikeInfo } from "./pages/TokenUsageAdminPage";
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

// ---------------------------------------------------------------------------
// Route-level lazy chunks - each page is only downloaded when first visited.
// ---------------------------------------------------------------------------
const IntakePage = lazy(() => import("./IntakeForm"));
const ReportPage = lazy(() => import("./ReportPage"));
const PressReleasePage = lazy(() => import("./PressReleasePage"));
const SeoAuditPage = lazy(() => import("./SeoAuditPage"));
const LlmCheckPage = lazy(() => import("./LlmCheckPage"));

const LandingPageC = lazy(() => import("./marketing/LandingPage"));
const PricingPage = lazy(() => import("./marketing/PricingPage"));
const MarketingPage = lazy(() => import("./marketing/MarketingPage"));
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
const PlaceholderPage = lazy(() =>
  import("./pages/PlaceholderPage").then((m) => ({ default: m.PlaceholderPage }))
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
const UsersAdminPage = lazy(() =>
  import("./pages/UsersAdminPage").then((m) => ({ default: m.UsersAdminPage }))
);
const ContactSubmissionsAdminPage = lazy(() =>
  import("./pages/ContactSubmissionsAdminPage").then((m) => ({ default: m.ContactSubmissionsAdminPage }))
);
const SubAccountsPage = lazy(() =>
  import("./pages/SubAccountsPage").then((m) => ({ default: m.SubAccountsPage }))
);

const InviteAcceptPage = lazy(() =>
  import("./pages/InviteAcceptPage").then((m) => ({ default: m.InviteAcceptPage }))
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
const SupportAdminPage = lazy(() =>
  import("./pages/SupportAdminPage").then((m) => ({ default: m.SupportAdminPage }))
);
const LeadsAdminPage = lazy(() =>
  import("./pages/LeadsAdminPage").then((m) => ({ default: m.LeadsAdminPage }))
);

// Sample/demo agencies have been removed. The Project Hub now shows only real,
// user-created projects loaded from localStorage.

migrateStoredIntakeKeys();

// --- URL <-> view mapping for the public marketing pages ------------------
const VIEW_TO_SLUG: Record<string, string> = {
  landing: "",
  about: "about",
  contact: "contact",
  insights: "insights",
  pricing: "pricing",
  "for-inhouse": "for-inhouse",
  "for-agencies": "for-agencies",
  "for-agents": "for-agents",
  "trust-security": "trust-security",
  "privacy-policy": "privacy-policy",
  "terms-conditions": "terms-conditions",
};

const SLUG_TO_VIEW: Record<string, PublicView> = {
  "": "landing",
  home: "landing",
  about: "about",
  contact: "contact",
  insights: "insights",
  pricing: "pricing",
  "for-inhouse": "for-inhouse",
  inhouse: "for-inhouse",
  "in-house": "for-inhouse",
  "for-agencies": "for-agencies",
  agencies: "for-agencies",
  "for-agents": "for-agents",
  "ai-agents": "for-agents",
  aiagents: "for-agents",
  "trust-security": "trust-security",
  trust: "trust-security",
  security: "trust-security",
  "privacy-policy": "privacy-policy",
  privacy: "privacy-policy",
  "terms-conditions": "terms-conditions",
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

function viewToUrl(v: string, insightsArticleId?: string | null): string {
  if (v === "insights" && insightsArticleId) {
    return appBase() + "insights/" + insightsArticleId;
  }
  return appBase() + (VIEW_TO_SLUG[v] ?? "");
}


function App() {
  const [view, setView] = useState<"landing" | "platform-home" | "platform" | "guidance" | "archived-projects" | "users-admin" | "sub-accounts" | "token-usage" | "for-agents" | "for-agencies" | "for-inhouse" | "insights" | "about" | "contact" | "pricing" | "trust-security" | "privacy-policy" | "terms-conditions">(() => publicViewFromLocation() ?? "landing");
  const [activeClient, setActiveClient] = useState<Client | null>(null);
  const [currentPage, setCurrentPage] = useState("dashboard");
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
  const [showGenerateFromUrl, setShowGenerateFromUrl] = useState(false);
  const [storedProjects, setStoredProjects] = useState<Client[]>([]);

  const [tokenUsageRows, setTokenUsageRows] = useState<TokenUsageRow[] | null>(null);
  const [tokenDailyRows, setTokenDailyRows] = useState<TokenDailyRow[] | null>(null);
  const [tokenUsageUsersByAccount, setTokenUsageUsersByAccount] = useState<Record<string, TokenUserInfo> | undefined>(undefined);
  const [tokenStatusByAccount, setTokenStatusByAccount] = useState<Record<string, string> | undefined>(undefined);
  const [tokenSpikeFlags, setTokenSpikeFlags] = useState<Record<string, SpikeInfo> | undefined>(undefined);
  const [tokenThirtyDayCosts, setTokenThirtyDayCosts] = useState<Record<string, number> | undefined>(undefined);
  const [tokenCurrentMonthSpends, setTokenCurrentMonthSpends] = useState<Record<string, number> | undefined>(undefined);
  const [tokenSpendLimits, setTokenSpendLimits] = useState<Record<string, number | null> | undefined>(undefined);
  const [tokenDefaultLimit, setTokenDefaultLimit] = useState<number | undefined>(undefined);
  const [tokenDefaultMonthlySpendLimitGbp, setTokenDefaultMonthlySpendLimitGbp] = useState<number | undefined>(undefined);
  const [tokenUsageLoading, setTokenUsageLoading] = useState(false);
  const [tokenUsageError, setTokenUsageError] = useState<string | null>(null);

  const loadTokenUsage = () => {
    setTokenUsageLoading(true);
    setTokenUsageError(null);
    void fetch(`${apiBase()}/api/admin/token-usage`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load token usage");
        const data = await r.json() as {
          rows: TokenUsageRow[];
          dailyRows?: TokenDailyRow[];
          usersByAccount?: Record<string, TokenUserInfo>;
          statusByAccount?: Record<string, string>;
          spikeFlags?: Record<string, SpikeInfo>;
          thirtyDayCosts?: Record<string, number>;
          currentMonthSpends?: Record<string, number>;
          spendLimits?: Record<string, number | null>;
          defaultLimit?: number;
          defaultMonthlySpendLimitGbp?: number;
        };
        setTokenUsageRows(data.rows ?? []);
        setTokenDailyRows(data.dailyRows ?? []);
        setTokenUsageUsersByAccount(data.usersByAccount ?? {});
        setTokenStatusByAccount(data.statusByAccount ?? {});
        setTokenSpikeFlags(data.spikeFlags ?? {});
        setTokenThirtyDayCosts(data.thirtyDayCosts ?? {});
        setTokenCurrentMonthSpends(data.currentMonthSpends ?? {});
        setTokenSpendLimits(data.spendLimits ?? {});
        setTokenDefaultLimit(data.defaultLimit);
        setTokenDefaultMonthlySpendLimitGbp(data.defaultMonthlySpendLimitGbp);
      })
      .catch(() => setTokenUsageError("Could not load token usage data. Please try again."))
      .finally(() => setTokenUsageLoading(false));
  };

  // Pull the shared project list and refresh the hub. Used on first load and
  // again whenever the tab regains focus, so a project a colleague created on
  // another device shows up without a manual page reload.
  const resyncProjects = useCallback(async () => {
    const result = await syncProjectsOnLoad();
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
      if (bootNeedsSetup) setNeedsSetup(true);
      if (bootHasPassword !== undefined) setHasPassword(bootHasPassword);
      // Only store profile when the session role is client (direct brand) or
      // agency — admins never need it and it keeps the guard simple in IntakePage.
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
    // Pre-flight limit check for non-admin accounts: if the visible project list
    // is already at 2 or more, surface a friendly message rather than letting
    // the user name a project that the server will then reject.
    if (session && session.role !== "admin" && visibleProjects.length >= 2) {
      window.alert(
        "You've reached the 2-project limit for Agency/Partner accounts.\n\nTo add more projects, contact info@aiofusion.ai.",
      );
      return;
    }
    setNamingProject(true);
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
    setCurrentPage("intake");
    setView("platform");
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
          "You've reached the 2-project limit for Agency/Partner accounts.\n\nTo add more projects, contact info@aiofusion.ai.",
      );
    }
  };
  const [session, setSessionState] = useState<LocalSession | null>(() => {
    if (typeof window === "undefined") return null;
    seedAdminIfEmpty();
    return getLocalSession();
  });
  // True until the server has confirmed (or denied) the session via
  // bootstrapAuth(). Guards must not redirect while this is true — the session
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
  // Pending team invites addressed to the signed-in user's email.
  const [pendingInvites, setPendingInvites] = useState<PendingMyInvite[]>([]);
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

  const handleAssignProjectOwner = (id: string, owner: string) => {
    // Persist server-side first (the upsert push deliberately never changes
    // owner). Only mirror the change locally once the server confirms it, so a
    // denied or failed reassignment never leaves the UI showing a move that did
    // not actually happen. On failure, resync from the server and surface why.
    void (async () => {
      const result = await serverAssignOwner(id, owner);
      if (!result.ok) {
        await refreshAccountsCache();
        setStoredProjects(loadStoredProjects());
        window.alert(result.error);
        return;
      }
      assignProjectOwner(id, owner);
      setStoredProjects(loadStoredProjects());
      await refreshAccountsCache();
    })();
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
  useEffect(() => {
    if (!session?.username) { setPendingInvites([]); return; }
    void serverGetMyInvites().then((r) => {
      if (r.ok && r.invites) setPendingInvites(r.invites);
    });
  }, [session?.username]);

  // Shown on the login form when the admin stash cookie expires mid view-as
  // session and the user is redirected back to sign in.
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState<string | undefined>(undefined);

  // Team invite token from /?invite=<token> — captured once on mount (the
  // history-sync effect rewrites the URL soon after).
  const [inviteToken] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("invite"),
  );
  // Token from a password-reset email link (/?reset_token=...). Captured once
  // on load, before the history-sync effect rewrites the URL and drops the
  // query string, then handed to PlatformHomePage as a prop.
  const [passwordResetToken] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get("reset_token"),
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
      params.has("aio_exit_impersonation") ||
      params.has("aio_switched_master")
    ) {
      setView("platform-home");
    }
    if (params.has("needs_setup")) {
      setNeedsSetup(true);
    }
    if (params.has("aio_session_expired")) {
      setSessionExpiredNotice(
        "Your admin session expired while in view-as mode. Please sign in again.",
      );
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
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }); }, [currentPage]);

  useEffect(() => {
    const navState = { __aioNav: true, view, currentPage, insightsArticleId };
    const url = viewToUrl(view, insightsArticleId);
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
  }, [view, currentPage, insightsArticleId]);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const s = e.state as { __aioNav?: boolean; view?: string; currentPage?: string; insightsArticleId?: string | null } | null;
      // Prefer the navigation state we pushed; fall back to deriving a public
      // page from the URL (e.g. a directly typed /about or a forward nav).
      const targetView = (
        s && s.__aioNav && s.view ? s.view : (publicViewFromLocation() ?? "landing")
      ) as typeof view;
      const targetPage = s && s.__aioNav && s.currentPage ? s.currentPage : pageRef.current;
      const targetArticleId = s && s.__aioNav
        ? (s.insightsArticleId ?? null)
        : (targetView === "insights" ? articleIdFromLocation() : null);
      // Only apply (and arm the skip guard) when something actually changes,
      // otherwise the guard could stay armed and swallow the next real push.
      if (targetView !== viewRef.current || targetPage !== pageRef.current || targetArticleId !== insightsArticleIdRef.current) {
        skipHistoryPush.current = true;
        setView(targetView);
        setCurrentPage(targetPage);
        setInsightsArticleId(targetArticleId);
      }
      window.scrollTo(0, 0);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Access guard for the admin-only users page. Done in an effect (not during
  // render) and as a history-replacing redirect so Back does not loop back
  // onto the denied page.
  // Guard is suppressed while authLoading is true — the session is still being
  // confirmed by the server and a null session at this point does not mean the
  // user is logged out.
  useEffect(() => {
    if (authLoading) return;
    if (view === "users-admin" && (!session || session.role !== "admin")) {
      replaceNextNav.current = true;
      setView("platform-home");
    }
    // The client-accounts page needs a signed-in account, but is open to any
    // role (admins manage everyone via the User Management page instead).
    if (view === "sub-accounts" && !session) {
      replaceNextNav.current = true;
      setView("platform-home");
    }
  }, [view, session, authLoading]);

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
    // While auth is still loading, silently wait — the session is being
    // confirmed by the server and may not be null for much longer.
    if (authLoading) return;
    if (!session) {
      setView("platform-home");
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
    setView("landing");
    window.scrollTo(0, 0);
  };

  const goToView = (v: string) => {
    if (v === "for-inhouse" || v === "insights" || v === "about" || v === "contact" || v === "for-agents" || v === "for-agencies" || v === "pricing" || v === "trust-security" || v === "privacy-policy" || v === "terms-conditions") {
      if (v === "insights") { setInsightsFilter(null); setInsightsArticleId(null); }
      setView(v as any);
      window.scrollTo(0, 0);
    } else if (v === "landing" || v === "landing-b" || v === "landing-c") {
      setView("landing");
      window.scrollTo(0, 0);
    } else if (v === "landing#features") {
      setView("landing");
      setTimeout(() => { document.getElementById("features")?.scrollIntoView({ behavior: "smooth" }); }, 100);
    }
  };

  const enterPlatform = () => setView("platform-home");

  const isAuthed = !!session;

  // Team-invite landing page (/?invite=<token>) — full-page gate, shown before
  // any auth flow. The invitee sets a password or continues with SSO, then the
  // page reloads into the workspace dashboard (no account-type selection).
  if (inviteToken) {
    return (
      <Suspense fallback={null}>
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

  // Billing team members see invoices/billing only — no project data or tools.
  if (session?.membershipRole === "billing" && !authLoading) {
    return (
      <Suspense fallback={null}>
        <BillingOnlyPage workspace={session.username} onSignOut={handleSignOut} />
      </Suspense>
    );
  }

  // Account type selection — full-page gate for brand-new signups (password or
  // SSO) that haven't chosen Agency/Partner vs Client yet. Intercepts all views.
  if (needsSetup && session && !authLoading) {
    return (
      <AccountTypeSelectPage
        onComplete={(role) => {
          setNeedsSetup(false);
          setSessionState({ username: session.username, role });
          // Role just changed (client/agency now known) — refresh profile so
          // the intake prefill fires on the first project the user creates.
          void fetchAccountProfile().then((ap) => setAccountProfile(ap));
          void refreshAccountsCache();
        }}
        onSignOut={handleSignOut}
      />
    );
  }

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
        <PlatformHomePage
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
          onNeedsSetup={() => setNeedsSetup(true)}
          onManageUsers={() => { if (session?.role === "admin") setView("users-admin"); }}
          onManageSubAccounts={() => requireSessionThen(() => setView("sub-accounts"))}
          onTokenUsage={() => { if (session?.role === "admin") { loadTokenUsage(); setView("token-usage"); } }}
          onCreateProject={beginCreateProject}
          onContinueToProjects={() => requireSessionThen(() => setView("platform"))}
          onArchivedProjects={() => requireSessionThen(() => setView("archived-projects"))}
          onGuidance={() => setView("guidance")}
          onBackToLanding={() => goHome()}
          onOpenGeorge={!session ? () => setGeorgeAnonOpen(true) : undefined}
          initialNotice={sessionExpiredNotice}
          resetToken={passwordResetToken}
          hasPassword={hasPassword}
        />
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
    return <UsersAdminPage session={session} onBack={() => setView("platform-home")} onAssignProjectOwner={handleAssignProjectOwner} onProjectCreated={() => { void resyncProjects(); }} onSupportAdmin={() => setView("support-admin" as any)} onLeadsAdmin={() => setView("leads-admin" as any)} />;
  }
  if ((view as string) === "leads-admin") {
    if (!session || session.role !== "admin") return null;
    return (
      <Suspense fallback={null}>
        <LeadsAdminPage onBack={() => setView("users-admin")} />
      </Suspense>
    );
  }
  if ((view as string) === "support-admin") {
    if (!session || session.role !== "admin") return null;
    return (
      <Suspense fallback={null}>
        <SupportAdminPage onBack={() => setView("users-admin")} />
      </Suspense>
    );
  }
  if ((view as string) === "contact-admin") {
    if (!session || session.role !== "admin") return null;
    return (
      <Suspense fallback={null}>
        <ContactSubmissionsAdminPage onBack={() => setView("users-admin")} />
      </Suspense>
    );
  }
  if (view === "token-usage") {
    if (!session || session.role !== "admin") return null;
    return (
      <TokenUsageAdminPage
        rows={tokenUsageRows}
        dailyRows={tokenDailyRows}
        usersByAccount={tokenUsageUsersByAccount}
        statusByAccount={tokenStatusByAccount}
        spikeFlags={tokenSpikeFlags}
        thirtyDayCosts={tokenThirtyDayCosts}
        currentMonthSpends={tokenCurrentMonthSpends}
        spendLimits={tokenSpendLimits}
        defaultLimit={tokenDefaultLimit}
        defaultMonthlySpendLimitGbp={tokenDefaultMonthlySpendLimitGbp}
        loading={tokenUsageLoading}
        error={tokenUsageError}
        onBack={() => setView("platform-home")}
        onRefresh={loadTokenUsage}
      />
    );
  }
  if (view === "sub-accounts") {
    // Direct clients are leaf accounts and cannot manage sub-accounts, but
    // they may still reach this page (as "My Account") if they are a Client
    // account type — they just won't see the sub-account management sections.
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
        session={session}
        onBack={() => setView("platform-home")}
        onAssignProjectOwner={handleAssignProjectOwner}
        onRoleChanged={handleRoleChanged}
        onWorkspacesChanged={() => {
          void serverGetWorkspaces().then((ws: WorkspaceInfo[]) => { if (ws.length > 0) setWorkspaces(ws); });
        }}
      />
    );
  }
  if (view === "guidance") {
    return <GuidancePage onBack={() => setView("platform-home")} />;
  }
  if (view === "archived-projects") {
    return <ArchivedProjectsPage onBack={() => setView("platform-home")} />;
  }

  if (view === "for-agents") {
    return (
      <Suspense fallback={null}>
        <ForAgentsPage onLogin={enterPlatform} onBack={goHome} onNavigate={goToView} isAuthed={isAuthed} />
      </Suspense>
    );
  }

  // Whether the invite banner should be shown in the current render.
  const showInviteBanner = !authLoading && !!session && pendingInvites.length > 0 && !inviteBannerDismissed;

  if (!activeClient) {
    return (
      <>
      {showInviteBanner && (
        <PendingInvitesBanner
          invites={pendingInvites}
          onInviteAccepted={() => {
            void serverGetMyInvites().then((r) => { if (r.ok && r.invites) setPendingInvites(r.invites); });
            void serverGetWorkspaces().then((ws: WorkspaceInfo[]) => { if (ws.length > 0) setWorkspaces(ws); });
          }}
          onDismiss={() => setInviteBannerDismissed(true)}
        />
      )}
      <ClientSelectorPage
        projects={visibleProjects}
        workspaceSwitcher={workspaces.length > 1 ? <WorkspaceSwitcher workspaces={workspaces} /> : undefined}
        onSelectClient={async (client) => {
          setActiveProjectId(client.id);
          // Pull this project's latest Set-Up from the shared store before
          // opening it, so a colleague's saved work shows here too.
          await syncIntakeForProject(client.id);
          setActiveClient({ ...client, logo: clientLogos[client.id] });
          setCurrentPage("dashboard");
        }}
        clientLogos={clientLogos}
        onLogoUpdate={handleLogoUpdate}
        onBackToPlatformHome={() => setView("platform-home")}
        onCreateProject={beginCreateProject}
        onArchivedProjects={() => requireSessionThen(() => setView("archived-projects"))}
        onGuidance={() => {
          setInsightsFilter("Guidance");
          setView("insights");
        }}
        onDeleteProject={handleDeleteProject}
        session={session}
        onGenerateFromUrl={session?.role === "admin" ? () => setShowGenerateFromUrl(true) : undefined}
      />
      {namingProject && <CreateProjectModal onCancel={() => setNamingProject(false)} onCreate={confirmCreateProject} />}
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
              setCurrentPage("dashboard");
            }
          }}
        />
      )}
      </>
    );
  }

  return (
    <>
    {showInviteBanner && (
      <PendingInvitesBanner
        invites={pendingInvites}
        onInviteAccepted={() => {
          void serverGetMyInvites().then((r) => { if (r.ok && r.invites) setPendingInvites(r.invites); });
          void serverGetWorkspaces().then((ws: WorkspaceInfo[]) => { if (ws.length > 0) setWorkspaces(ws); });
        }}
        onDismiss={() => setInviteBannerDismissed(true)}
      />
    )}
    <div className="flex w-full font-['Inter',sans-serif]" style={{ background: "#f8fafc", marginTop: "var(--banner-h, 0px)", height: "calc(100vh - var(--banner-h, 0px))" }}>
      <Sidebar
        workspaceSwitcher={workspaces.length > 1 ? <WorkspaceSwitcher workspaces={workspaces} /> : undefined}
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        activeClient={activeClient}
        onBackToClients={() => setActiveClient(null)}
        onLogoUpdate={handleLogoUpdate}
        onOpenSavedAudit={(id) => { setPendingAuditId(id); setCurrentPage("llm-check"); }}
        onOpenSavedDiagnostic={(id) => { setPendingDiagnosticId(id); setCurrentPage("diagnostic"); }}
        onOpenSavedContentGeo={(id) => { setPendingContentGeoId(id); setCurrentPage("geo-content"); }}
        onOpenSavedTechGeo={(id) => { setPendingTechGeoId(id); setCurrentPage("seo-audit"); }}
        onOpenGeorge={() => { setGeorgeOpen(true); setGeorgeHasUpdate(false); }}
        georgeHasUpdate={georgeHasUpdate}
      />
      <GeorgeSupport
        open={georgeOpen}
        onClose={() => setGeorgeOpen(false)}
        userName={session?.username}
      />
      <main ref={mainRef} className="flex-1 overflow-y-auto pt-14 md:pt-0" style={{ background: "#1A647B" }}>
        {currentPage === "dashboard" && (
          <DashboardPage onNavigate={setCurrentPage} activeClient={activeClient} />
        )}
        {currentPage === "intake" && <IntakePage accountProfile={accountProfile} role={session?.role ?? null} />}
        {currentPage === "diagnostic" && (
          <DiagnosticPage activeClient={activeClient} pendingDiagnosticId={pendingDiagnosticId} onConsumePendingDiagnostic={() => setPendingDiagnosticId(null)} />
        )}
        {currentPage === "llm-check" && <LlmCheckPage activeClient={activeClient} onNavigate={setCurrentPage} pendingAuditId={pendingAuditId} onConsumePending={() => setPendingAuditId(null)} />}
        {currentPage === "optimiser" && (
          <OptimiserPage onNavigate={setCurrentPage} />
        )}
        {currentPage === "seo-audit" && <SeoAuditPage activeClient={activeClient} pendingTechGeoId={pendingTechGeoId} onConsumePendingTechGeo={() => setPendingTechGeoId(null)} />}
        {currentPage === "geo-content" && <GeoContentPage activeClient={activeClient} pendingContentGeoId={pendingContentGeoId} onConsumePendingContentGeo={() => setPendingContentGeoId(null)} />}
        {currentPage === "planner" && <PlannerPage onNavigate={setCurrentPage} />}
        {currentPage === "creator" && <ContentCreatorPage onNavigate={setCurrentPage} />}
        {currentPage === "media-research" && <MediaResearchPage />}
        {currentPage === "marketing-intel" && <MarketingIntelligencePage />}
        {currentPage === "gateway" && <ReleaseGatewayPage />}
        {currentPage === "archive" && <ArchivePage onNavigate={setCurrentPage} />}
        {currentPage === "measure" && <ReportPage activeClient={activeClient} onNavigate={setCurrentPage} />}
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
