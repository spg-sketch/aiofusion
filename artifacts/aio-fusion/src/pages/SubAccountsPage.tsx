import { useState, useMemo, useEffect, useRef } from "react";
import {
  ChevronRight, Lock, Search, FileEdit, BarChart3, Archive, Send, LineChart, ArrowRight, Sparkles, Loader2,
  TrendingUp, FileText, FileCheck2, Target, Code2, HelpCircle, MessageSquareQuote, Bot, ShieldCheck,
  MessagesSquare, Download, AlertTriangle, CheckCircle2, XCircle, Info, Globe, Tag, User, ChevronDown,
  Plus, Minus, MessageSquare, BookOpen, Scroll, Award, Radio, Mic2, PenLine, ClipboardList, ArrowUpRight,
  Lightbulb, ClipboardPaste, Upload, Calendar, Check, Save, Circle, Zap, Mail, Shield, Eye, Building2,
  ArrowLeft, LogOut, Trash2, KeyRound, Users, Activity, Play, ChevronUp, Menu, X, LogIn,
  Link as LinkIcon, Image as ImageIcon, Repeat, TrendingDown, FolderOpen, List as ListIcon, Clock,
  Undo2, ArchiveRestore, RefreshCw, MonitorSmartphone, MessageCircle,
} from "lucide-react";
import { vars } from "../marketing/vars";
import { apiBase } from "../lib/apiHelpers";
import { accountLabel } from "../lib/accountLabels";
import { loadStoredProjects, saveStoredProjects } from "../lib/projectStore";
import { auditAndRecoverLocalProjects, pushProjectMeta, type ProjectReconciliationAudit } from "../lib/projectSync";
import { fetchProjectAllowance, type PackageCapacity } from "../lib/billingAllowance";
import type { Client } from "../lib/projectTypes";
import { createStoredProject } from "../lib/projects";
import { TeamSection } from "./TeamSection";
import type { AcceptedInvitation } from "../components/InvitationResult";
import { AccountSecurityCard } from "../components/AccountSecurityCard";
import { BillingDetailsCard } from "../components/BillingDetailsCard";
import { SubscriptionCard } from "../components/SubscriptionCard";
import "./SubAccountsPage.css";
import { type Session as LocalSession, type User as LocalUser, type Role, getSubAccounts as getLocalSubAccounts, serverAddUser, serverDeleteUser, serverChangePassword, serverAssignOwner, serverSetDisplayName, serverArchiveUser, serverSetSeatCap, refreshAccountsCache, serverImpersonate, serverSwitchToMaster, serverChangeAccountType, serverSetClientAccess, canCreateSubAccounts } from "../lib/auth";
/** Section ids for the left-hand settings navigation. */
type SettingsSection = "profile" | "security" | "billing" | "team" | "clients" | "archived" | "assign";
type ClientCreationAttempt = { requestKey: string; payload: string; uncertain: boolean };

function newClientCreationRequestKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  // Retain a UUID-shaped fallback for privacy-restricted webviews.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}
type NavigationTarget = {
  username: string;
  projectId: string | null;
  openProjectHub: boolean;
  originalUsername: string;
  projectIntent?: PendingClientProjectIntent;
};
type NavigationRetry = NavigationTarget & { switched: boolean; uncertain: boolean };
type PendingClientProjectIntent = {
  username: string;
  operatorUsername: string;
  project: Client;
  logo?: string | null;
};

function SubAccountsPage({
  session,
  onBack,
  onAssignProjectOwner,
  onRoleChanged,
  onWorkspacesChanged,
  onInvitationAccepted,
  onSignOut,
  initialSection,
  deleteReauthResult,
  checkoutResult,
  checkoutSessionId,
  onSectionChange,
  backToAgency,
  onOpenProject,
  onOpenGeorge,
}: {
  session: LocalSession;
  onBack: () => void;
  onAssignProjectOwner: (id: string, owner: string) => Promise<{ ok: boolean; error?: string }>;
  onRoleChanged?: (newRole: Role) => void;
  /** Called after the user accepts a cross-workspace invite so the parent can refresh the workspace list. */
  onWorkspacesChanged?: () => void;
  /** Mirrors an accepted invite into the global invitation banner. */
  onInvitationAccepted?: (invite: AcceptedInvitation) => void;
  /** Signs the user out (used after account deletion and by the sign-out button). */
  onSignOut?: () => void;
  /** Deep-link target (e.g. from an email link ?account_section=security). Falls back to profile if not allowed. */
  initialSection?: string;
  /** Result captured before App removes the provider callback query string. */
  deleteReauthResult?: string | null;
  checkoutResult?: "success" | "cancelled" | null;
  /** Stripe session id captured before App removes the provider callback query string. */
  checkoutSessionId?: string | null;
  /** "Back to my agency account" control, present while an agency user is working inside a client account. */
  backToAgency?: React.ReactNode;
  /** Reports section changes so the parent can mirror them into the URL/history (refresh + Back support). */
  onSectionChange?: (section: string) => void;
  /** Opens the current account's project workspace. */
  onOpenProject?: () => void;
  /** Opens the existing GEOrge support assistant. */
  onOpenGeorge?: () => void;
}) {
  const paper = "#f8fafc";
  const ink = "#0a1628";
  const accent = "#C8497A";
  const accentSoft = "#FBE3ED";
  const [tick, setTick] = useState(0);
  const [packageCapacity, setPackageCapacity] = useState<PackageCapacity | null>(null);
  const [reconciliationAudit, setReconciliationAudit] = useState<ProjectReconciliationAudit | null>(null);
  const [reconciliationError, setReconciliationError] = useState<string | null>(null);
  const [reconciliationLoading, setReconciliationLoading] = useState(false);
  const [reconciliationAttempt, setReconciliationAttempt] = useState(0);
  const [assigningProjectId, setAssigningProjectId] = useState<string | null>(null);
  const refresh = () => setTick((t) => t + 1);

  // --- Left-hand settings navigation -------------------------------------
  const isClientManager = canCreateSubAccounts(session.role);
  // Agency/partner accounts always run their clients' accounts on their
  // behalf: client rows get a simplified button set (no passwords, no
  // sign-in access) and new clients are always created as managed.
  const isAgencyPartner = session.role === "agency";
  const agencyPackageIsFull = isAgencyPartner
    && packageCapacity?.remaining != null
    && packageCapacity.remaining <= 0;
  useEffect(() => {
    if (!isAgencyPartner) return;
    void fetchProjectAllowance().then((allowance) => {
      if (!allowance) return;
      setPackageCapacity(allowance.packageCapacity ?? {
        billingSlug: session.username,
        kind: "agency",
        included: allowance.projectAllowance,
        purchased: 0,
        reserved: allowance.projectsUsed,
        used: allowance.projectsUsed,
        remaining: Math.max(0, allowance.projectAllowance - allowance.projectsUsed),
        allowance: allowance.projectAllowance,
        overLimit: allowance.projectsUsed > allowance.projectAllowance,
      });
    });
  }, [isAgencyPartner, session.username, tick]);
  // Clients under an agency partner never see billing - the agency is billed.
  const canSeeBilling = !session.agencyManagedClient && (session.membershipRole == null || session.membershipRole === "owner" || session.membershipRole === "admin" || session.membershipRole === "billing");
  // Agency-managed partner clients have no team of their own - collaboration
  // happens through the agency's project seats, so hide the section entirely.
  const canSeeTeam = !session.agencyManagedClient && (session.membershipRole == null || session.membershipRole === "owner" || session.membershipRole === "admin");
  const navGroups: { label: string; items: { id: SettingsSection; label: string; icon: typeof User }[] }[] = [
    {
      label: "My Account",
      items: [
        { id: "profile" as const, label: "Profile & workspace", icon: User },
        ...(onSignOut && !session.agencyManagedClient ? [{ id: "security" as const, label: "Sign-in & security", icon: ShieldCheck }] : []),
        ...(canSeeBilling ? [{ id: "billing" as const, label: "Billing details", icon: FileText }] : []),
        ...(canSeeTeam ? [{ id: "team" as const, label: "Team members", icon: Users }] : []),
      ],
    },
    ...(isClientManager
      ? [{
          label: isAgencyPartner ? "My Client Projects" : "My Client Accounts",
          items: [
            { id: "clients" as const, label: isAgencyPartner ? "Client Projects" : "Client accounts", icon: Building2 },
            { id: "archived" as const, label: isAgencyPartner ? "Archived Client Projects" : "Archived clients", icon: Archive },
            { id: "assign" as const, label: "Assign projects", icon: FolderOpen },
          ],
        }]
      : []),
  ];
  const allowedSections = navGroups.flatMap((g) => g.items.map((i) => i.id));
  const [section, setSection] = useState<SettingsSection>(() =>
    initialSection && (allowedSections as string[]).includes(initialSection)
      ? (initialSection as SettingsSection)
      : "profile",
  );
  useEffect(() => {
    if (section !== "assign") return;
    let active = true;
    setReconciliationAudit(null);
    setReconciliationLoading(true);
    setReconciliationError(null);
    void Promise.all([auditAndRecoverLocalProjects(), refreshAccountsCache()])
      .then(([audit, accountsRefreshed]) => {
        if (!active) return;
        if (audit === "unauthorized") {
          setReconciliationError("Your session has expired. Sign in again before reconciling projects.");
        } else if (!audit) {
          setReconciliationError("The server could not be reached. Browser-only projects have not been changed.");
        } else if (accountsRefreshed === false) {
          setReconciliationError("Managed client records could not be refreshed. No project ownership has been changed.");
        } else {
          setReconciliationAudit(audit);
          refresh();
        }
      })
      .finally(() => {
        if (active) setReconciliationLoading(false);
      });
    return () => { active = false; };
    // Audit once whenever the human opens the assignment section.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, reconciliationAttempt]);
  // Central section switcher: updates local state and reports the change to
  // the parent so it can mirror the section into the URL/history stack.
  const selectSection = (next: SettingsSection) => {
    setSection(next);
    onSectionChange?.(next);
  };
  // If a role change removes the active section (e.g. switching Agency -> Client
  // while on a client section), fall back to the profile view.
  useEffect(() => {
    if (!allowedSections.includes(section)) selectSection("profile");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedSections.join(",")]);
  // Follow external section changes (browser Back/Forward restoring a
  // previously viewed section via the parent's history sync).
  useEffect(() => {
    const target: SettingsSection =
      initialSection && (allowedSections as string[]).includes(initialSection)
        ? (initialSection as SettingsSection)
        : "profile";
    if (target !== section) setSection(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSection]);

  // Re-read on every refresh tick so adds, deletes and assignments show at once.
  const allSubAccounts = useMemo(() => getLocalSubAccounts(session.username), [session.username, tick]);
  const subAccounts = useMemo(() => allSubAccounts.filter((u) => !u.archived), [allSubAccounts]);
  const archivedSubAccounts = useMemo(() => allSubAccounts.filter((u) => u.archived), [allSubAccounts]);
  const subUsernames = useMemo(() => new Set(allSubAccounts.map((u) => u.username.toLowerCase())), [allSubAccounts]);
  const manageable = useMemo(() => {
    const me = session.username.toLowerCase();
    return loadStoredProjects().filter((p) => {
      const owner = (p.owner || "").toLowerCase();
      return owner === me || subUsernames.has(owner);
    });
  }, [session.username, subUsernames, tick]);

  const [newCompanyName, setNewCompanyName] = useState("");
  const [newWebsite, setNewWebsite] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  // Managed account: the agency runs the project on the client's behalf and
  // the client is NOT given sign-in access (no password, no welcome email).
  const [newManaged, setNewManaged] = useState(false);
  const [newLogoDataUrl, setNewLogoDataUrl] = useState<string | null>(null);
  const [logoProcessing, setLogoProcessing] = useState(false);
  const [addingClient, setAddingClient] = useState(false);
  const [clientCreationUncertain, setClientCreationUncertain] = useState(false);
  const [pendingClientCreation, setPendingClientCreation] = useState<{ username: string; projectId: string } | null>(null);
  const [navigationRetry, setNavigationRetry] = useState<NavigationRetry | null>(null);
  // Preserve the original request while its outcome is uncertain.
  const clientCreationAttemptRef = useRef<ClientCreationAttempt | null>(null);
  const clientCreationInFlightRef = useRef(false);
  const markClientCreationEdited = () => {
    if (clientCreationInFlightRef.current || clientCreationAttemptRef.current?.uncertain) return;
    clientCreationAttemptRef.current = null;
  };
  // A switch changes the server session before the browser reloads. Keep a
  // lock while that transition is in flight so a double click cannot start a
  // second switch (or overwrite the first handoff).
  const navigationLockRef = useRef(false);
  // Guards against a slow earlier image load overwriting a later selection.
  const logoRequestRef = useRef(0);

  // Bumped whenever a logo may have changed (own upload, another tab/session,
  // returning from "View account"). Logo images use this as a cache buster;
  // native lazy loading keeps a long client list from downloading every
  // source logo before it is visible.
  const [logoTick, setLogoTick] = useState(0);

  useEffect(() => {
    const bump = () => setLogoTick((t) => t + 1);
    window.addEventListener("aio:logo-changed", bump);
    window.addEventListener("focus", bump);
    return () => {
      window.removeEventListener("aio:logo-changed", bump);
      window.removeEventListener("focus", bump);
    };
  }, []);

  const clientLogoUrl = (username: string) =>
    `${apiBase()}/api/platform/accounts/${encodeURIComponent(username)}/logo?v=${logoTick}`;

  /** Downscale the chosen client logo to a data URL for the create form. */
  const handleNewClientLogo = (file: File) => {
    setAddError(null);
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setAddError("The logo must be a PNG, JPEG or WebP image.");
      return;
    }
    const requestId = ++logoRequestRef.current;
    setLogoProcessing(true);
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (requestId !== logoRequestRef.current) return; // a newer file was chosen
      const scale = Math.min(1, 512 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) { setLogoProcessing(false); setAddError("Could not process the logo image."); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setNewLogoDataUrl(file.type === "image/jpeg" ? canvas.toDataURL("image/jpeg", 0.85) : canvas.toDataURL("image/png"));
      setLogoProcessing(false);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      if (requestId !== logoRequestRef.current) return;
      setLogoProcessing(false);
      setAddError("Could not read that logo file.");
    };
    img.src = objectUrl;
  };
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [pwUser, setPwUser] = useState<string | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [profileUser, setProfileUser] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileWebsite, setProfileWebsite] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);

  // "Give client access" inline panel state (per managed client account).
  const [accessUser, setAccessUser] = useState<string | null>(null);
  const [accessPassword, setAccessPassword] = useState("");
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  // Per-username success note shown in the row after granting/removing access.
  const [accessNotice, setAccessNotice] = useState<{ username: string; text: string } | null>(null);

  const handleGrantAccess = (username: string, password?: string) => {
    if (accessBusy) return;
    setAccessError(null);
    setAccessBusy(true);
    void (async () => {
      const result = await serverSetClientAccess(username, "grant", password);
      setAccessBusy(false);
      if (!result.ok) { setAccessError(result.error); return; }
      setAccessUser(null);
      setAccessPassword("");
      setAccessNotice({
        username,
        text: result.emailSent
          ? "Access granted - we've emailed the key contact a set-password link (valid 7 days)."
          : "Access granted - share the password with the client directly.",
      });
      refresh();
    })();
  };

  const handleResendWelcome = (username: string) => {
    if (accessBusy) return;
    setAccessError(null);
    setAccessBusy(true);
    void (async () => {
      const result = await serverSetClientAccess(username, "resend-welcome");
      setAccessBusy(false);
      if (!result.ok) { setAccessError(result.error); return; }
      setAccessNotice({ username, text: "We've sent a fresh set-password link to the key contact (valid 7 days)." });
    })();
  };

  /** Human-friendly phrase for how recently the client last signed in. */
  const describeLastSignIn = (iso: string): string => {
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return "recently";
    const days = Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000));
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    return `${days} days ago`;
  };

  // Backfill for client accounts created as managed before the flag was
  // persisted: records the Managed badge and makes sure no credential remains.
  const handleMarkManaged = (username: string) => {
    if (!confirm(`Mark '${username}' as a managed account? Use this when the client was never given (or should not have) sign-in access. Any existing password will be invalidated and active sessions signed out. You can give client access back at any time.`)) return;
    void (async () => {
      let result = await serverSetClientAccess(username, "mark-managed");
      // The server warns when the client signed in recently - they appear to
      // be actively using the account, so ask before locking them out.
      if (!result.ok && result.requiresConfirmation && result.lastSignInAt) {
        if (!confirm(`Heads up: '${username}' last signed in ${describeLastSignIn(result.lastSignInAt)}, so the client appears to be actively using this account. Marking it as managed will lock them out immediately. Continue anyway?`)) return;
        result = await serverSetClientAccess(username, "mark-managed", undefined, { confirmRecentSignIn: true });
      }
      if (!result.ok) { alert(result.error); return; }
      setAccessNotice({ username, text: "Marked as managed - the client has no sign-in access." });
      refresh();
    })();
  };

  const handleRevokeAccess = (username: string) => {
    void (async () => {
      // Re-fetch the account list first so the "last signed in" warning
      // reflects the client's CURRENT session state, not a stale cache.
      await refreshAccountsCache();
      const target = getLocalSubAccounts(session.username)
        .find((u) => u.username.toLowerCase() === username.toLowerCase());
      const lastLine = target?.lastSignInAt
        ? `They last signed in ${formatLastSignIn(target.lastSignInAt)} - removing access will interrupt their active session.`
        : "They have never signed in (no active session found).";
      if (!confirm(`Remove sign-in access for '${username}'?\n\n${lastLine}\n\nTheir password will be invalidated and they will be signed out everywhere. You can give access back at any time.`)) return;
      let result = await serverSetClientAccess(username, "revoke");
      if (!result.ok && result.requiresConfirmation && result.lastSignInAt) {
        if (!confirm(`Heads up: '${username}' last signed in ${describeLastSignIn(result.lastSignInAt)}, so the client appears to be actively using this account. Removing access will sign them out everywhere. Continue anyway?`)) return;
        result = await serverSetClientAccess(username, "revoke", undefined, { confirmRecentSignIn: true });
      }
      if (!result.ok) { alert(result.error); return; }
      setAccessNotice({ username, text: "Client access removed - this is now a managed account." });
      refresh();
    })();
  };

  // Account Type section state
  const isOwner = session.membershipRole == null || session.membershipRole === "owner";
  // Legacy accounts (role "user", created before account types existed) may
  // pick a type for the first time, so they get the selector too.
  const isAgencyOrClient = session.role === "agency" || session.role === "client" || session.role === "user";
  const [selectedType, setSelectedType] = useState<"agency" | "client" | null>(null);
  const [typeChanging, setTypeChanging] = useState(false);
  const [typeError, setTypeError] = useState<string | null>(null);
  const [typeSuccess, setTypeSuccess] = useState<string | null>(null);

  const handleChangeAccountType = () => {
    if (!selectedType || typeChanging) return;
    if (selectedType === session.role) {
      setSelectedType(null);
      return;
    }
    setTypeChanging(true);
    setTypeError(null);
    setTypeSuccess(null);
    void (async () => {
      const result = await serverChangeAccountType(selectedType);
      setTypeChanging(false);
      if (!result.ok) {
        setTypeError(result.error);
        return;
      }
      setTypeSuccess(`Account type updated to ${selectedType === "agency" ? "Agency / Partner" : "Client"}.`);
      setSelectedType(null);
      if (onRoleChanged) onRoleChanged(result.role);
    })();
  };

  const [enteringUsername, setEnteringUsername] = useState<string | null>(null);
  const [enterError, setEnterError] = useState<string | null>(null);
  const [googleLinked, setGoogleLinked] = useState<boolean | null>(null);
  const [microsoftLinked, setMicrosoftLinked] = useState<boolean | null>(null);
  const [accountWebsite, setAccountWebsite] = useState<string | null>(null);
  const [editingActiveProject, setEditingActiveProject] = useState(false);
  const [activeProjectName, setActiveProjectName] = useState("");
  const [activeProjectWebsite, setActiveProjectWebsite] = useState("");
  const [savingActiveProject, setSavingActiveProject] = useState(false);
  const [activeProjectError, setActiveProjectError] = useState<string | null>(null);
  const [workspaceNameNeedsReview, setWorkspaceNameNeedsReview] = useState(false);
  const [reviewWorkspaceName, setReviewWorkspaceName] = useState(session.companyName?.trim() || "");
  const [reviewingWorkspaceName, setReviewingWorkspaceName] = useState(false);
  const [workspaceNameReviewError, setWorkspaceNameReviewError] = useState<string | null>(null);
  const [confirmedWorkspaceName, setConfirmedWorkspaceName] = useState<string | null>(null);
  // Profile images - value is a cache-busted URL when an image exists, null when none.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState<"avatar" | "logo" | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const profileImageUrl = (kind: "avatar" | "logo") =>
    `${apiBase()}/api/platform/profile/image/${kind}?t=${Date.now()}`;

  useEffect(() => {
    // Probe for existing images; 404 simply means none uploaded yet.
    (["avatar", "logo"] as const).forEach((kind) => {
      fetch(`${apiBase()}/api/platform/profile/image/${kind}`, { credentials: "include" })
        .then((r) => {
          if (r.ok) (kind === "avatar" ? setAvatarUrl : setLogoUrl)(profileImageUrl(kind));
        })
        .catch(() => { /* non-fatal */ });
    });
  }, []);

  // Logo sizing dialog state: source image + zoom/pan the user chooses.
  const [logoAdjust, setLogoAdjust] = useState<{ src: string; imgW: number; imgH: number; zoom: number; offX: number; offY: number } | null>(null);
  const logoDragRef = useRef<{ startX: number; startY: number; baseOffX: number; baseOffY: number } | null>(null);
  const LOGO_PREVIEW = 240; // px, square preview in the dialog

  /** Uploads a prepared data URL to the profile-image endpoint. */
  const uploadImageDataUrl = (kind: "avatar" | "logo", dataUrl: string) => {
    setUploadingImage(kind);
    fetch(`${apiBase()}/api/platform/profile/image`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, dataUrl }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null) as { error?: string } | null;
          setImageError(body?.error ?? "Failed to save the image.");
          return;
        }
        (kind === "avatar" ? setAvatarUrl : setLogoUrl)(profileImageUrl(kind));
        // Let any client-list views refetch their logos straight away.
        if (kind === "logo") window.dispatchEvent(new Event("aio:logo-changed"));
      })
      .catch(() => setImageError("Failed to save the image."))
      .finally(() => setUploadingImage(null));
  };

  /** Opens the sizing dialog for a chosen logo file. */
  const handleLogoFileChosen = (file: File) => {
    setImageError(null);
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setImageError("Please choose a PNG, JPEG or WebP image.");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // Keep a reasonably sized working copy so the dialog stays snappy.
      const workScale = Math.min(1, 1024 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * workScale));
      canvas.height = Math.max(1, Math.round(img.height * workScale));
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(objectUrl); setImageError("Could not process the image."); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      setLogoAdjust({ src: canvas.toDataURL("image/png"), imgW: canvas.width, imgH: canvas.height, zoom: 1, offX: 0, offY: 0 });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setImageError("Could not read that image file.");
    };
    img.src = objectUrl;
  };

  /** Renders the adjusted logo to a square 512px PNG and saves it. */
  const handleLogoAdjustSave = () => {
    if (!logoAdjust) return;
    const { src, imgW, imgH, zoom, offX, offY } = logoAdjust;
    const img = new Image();
    img.onload = () => {
      const OUT = 512;
      const f = OUT / LOGO_PREVIEW;
      const s0 = Math.min(LOGO_PREVIEW / imgW, LOGO_PREVIEW / imgH);
      const drawW = imgW * s0 * zoom;
      const drawH = imgH * s0 * zoom;
      const x = LOGO_PREVIEW / 2 + offX - drawW / 2;
      const y = LOGO_PREVIEW / 2 + offY - drawH / 2;
      const canvas = document.createElement("canvas");
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext("2d");
      if (!ctx) { setImageError("Could not process the image."); return; }
      ctx.drawImage(img, x * f, y * f, drawW * f, drawH * f);
      setLogoAdjust(null);
      uploadImageDataUrl("logo", canvas.toDataURL("image/png"));
    };
    img.src = src;
  };

  /** Downscales the chosen file on a canvas, then saves it server-side. */
  const handleImageUpload = (kind: "avatar" | "logo", file: File) => {
    setImageError(null);
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setImageError("Please choose a PNG, JPEG or WebP image.");
      return;
    }
    setUploadingImage(kind);
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxSide = kind === "avatar" ? 256 : 512;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) { setUploadingImage(null); setImageError("Could not process the image."); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // PNG keeps logo transparency; JPEG keeps photos small.
      const dataUrl = file.type === "image/jpeg"
        ? canvas.toDataURL("image/jpeg", 0.85)
        : canvas.toDataURL("image/png");
      fetch(`${apiBase()}/api/platform/profile/image`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, dataUrl }),
      })
        .then(async (r) => {
          if (!r.ok) {
            const body = await r.json().catch(() => null) as { error?: string } | null;
            setImageError(body?.error ?? "Failed to save the image.");
            return;
          }
          (kind === "avatar" ? setAvatarUrl : setLogoUrl)(profileImageUrl(kind));
          if (kind === "logo") window.dispatchEvent(new Event("aio:logo-changed"));
        })
        .catch(() => setImageError("Failed to save the image."))
        .finally(() => setUploadingImage(null));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setUploadingImage(null);
      setImageError("Could not read that image file.");
    };
    img.src = objectUrl;
  };

  const handleImageRemove = (kind: "avatar" | "logo") => {
    setImageError(null);
    fetch(`${apiBase()}/api/platform/profile/image/${kind}`, { method: "DELETE", credentials: "include" })
      .then((r) => {
        if (r.ok) {
          (kind === "avatar" ? setAvatarUrl : setLogoUrl)(null);
          if (kind === "logo") window.dispatchEvent(new Event("aio:logo-changed"));
        }
      })
      .catch(() => { /* non-fatal */ });
  };
  const [isMasterOwner, setIsMasterOwner] = useState<boolean>(false);
  const [switchingToMaster, setSwitchingToMaster] = useState(false);
  const [switchToMasterError, setSwitchToMasterError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`${apiBase()}/api/platform/me`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data: { account?: { googleLinked?: boolean; microsoftLinked?: boolean } | null; masterOwner?: boolean; accountProfile?: { displayName?: string | null; website?: string | null; workspaceNameNeedsReview?: boolean } | null } | null) => {
        if (data?.accountProfile?.website) setAccountWebsite(data.accountProfile.website);
        if (data?.accountProfile?.workspaceNameNeedsReview === true) {
          setWorkspaceNameNeedsReview(true);
          setReviewWorkspaceName(data.accountProfile.displayName?.trim() || session.companyName?.trim() || "");
        }
        if (data?.account) {
          setGoogleLinked(data.account.googleLinked ?? false);
          setMicrosoftLinked(data.account.microsoftLinked ?? false);
        }
        setIsMasterOwner(data?.masterOwner === true);
      })
      .catch(() => { /* non-fatal */ });
  }, []);

  const handleWorkspaceNameReview = () => {
    const nextName = reviewWorkspaceName.trim();
    if (!nextName || reviewingWorkspaceName) return;
    setReviewingWorkspaceName(true);
    setWorkspaceNameReviewError(null);
    void serverSetDisplayName(
      session.username,
      nextName,
      undefined,
      { confirmWorkspaceNameReview: true },
    ).then((result) => {
      setReviewingWorkspaceName(false);
      if (!result.ok) {
        setWorkspaceNameReviewError(result.error);
        return;
      }
      setConfirmedWorkspaceName(nextName);
      setWorkspaceNameNeedsReview(false);
      onWorkspacesChanged?.();
    });
  };

  const handleSaveActiveProject = () => {
    const nextName = activeProjectName.trim();
    if (!nextName || savingActiveProject) return;
    setSavingActiveProject(true);
    setActiveProjectError(null);
    void serverSetDisplayName(session.username, nextName, activeProjectWebsite.trim())
      .then((result) => {
        setSavingActiveProject(false);
        if (!result.ok) {
          setActiveProjectError(result.error);
          return;
        }
        setConfirmedWorkspaceName(nextName);
        setAccountWebsite(activeProjectWebsite.trim() || null);
        setEditingActiveProject(false);
        onWorkspacesChanged?.();
      });
  };

  const handleSwitchToMaster = () => {
    setSwitchToMasterError(null);
    setSwitchingToMaster(true);
    void serverSwitchToMaster()
      .then((result) => {
        if (!result.ok) {
          setSwitchToMasterError(result.error);
          setSwitchingToMaster(false);
          return;
        }
        // Use a query param so App.tsx shows platform-home after the reload
        // instead of the marketing landing page.
        window.location.replace("/?aio_switched_master=1");
      })
      .catch(() => {
        setSwitchToMasterError("Failed to switch to master account.");
        setSwitchingToMaster(false);
      });
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (clientCreationInFlightRef.current || pendingClientCreation) return;
    if (agencyPackageIsFull) {
      setAddError("Your client/project package is full. Add another annual package in Billing before creating a managed client.");
      return;
    }
    setAddError(null);
    setAddSuccess(null);
    setNavigationRetry(null);
    const companyName = newCompanyName.trim();
    if (!companyName) { setAddError("Enter the client's company name."); return; }
    let website = newWebsite.trim();
    if (!website) { setAddError("Enter the client's company website."); return; }
    if (!/^https?:\/\//i.test(website)) website = `https://${website}`;
    const contactEmail = newContactEmail.trim();
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      setAddError("The key contact email address doesn't look valid.");
      return;
    }
    // Suggest a username from the company name; the server makes it unique.
    const usernameSuggestion = companyName
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9_.-]/g, "")
      .replace(/-+/g, "-")
      .slice(0, 28)
      .replace(/^[-.]+|[-.]+$/g, "") || "client";
    // Agency partners always create managed clients - no password, no email.
    const effectiveManaged = isAgencyPartner || newManaged;
    const creationPayload = JSON.stringify({
      username: usernameSuggestion,
      password: effectiveManaged ? "" : newPassword,
      role: "client",
      displayName: companyName,
      website,
      contactName: newContactName.trim(),
      contactEmail,
      autoUsername: true,
      logoDataUrl: newLogoDataUrl || undefined,
      managed: effectiveManaged || undefined,
    });
    const previousAttempt = clientCreationAttemptRef.current;
    if (previousAttempt?.uncertain && previousAttempt.payload !== creationPayload) {
      setAddError("This creation is awaiting confirmation. Retry the original request before editing the draft.");
      return;
    }
    const creationRequestKey = previousAttempt?.payload === creationPayload
      ? previousAttempt.requestKey : newClientCreationRequestKey();
    clientCreationAttemptRef.current = {
      requestKey: creationRequestKey, payload: creationPayload,
      uncertain: previousAttempt?.uncertain === true,
    };
    setClientCreationUncertain(previousAttempt?.uncertain === true);
    clientCreationInFlightRef.current = true;
    setAddingClient(true);
    let creationConfirmed = false;
    void (async () => {
      try {
        const result = await serverAddUser(usernameSuggestion, effectiveManaged ? "" : newPassword, "client", companyName, {
          website,
          contactName: newContactName.trim(),
          contactEmail,
          autoUsername: true,
          ...(newLogoDataUrl ? { logoDataUrl: newLogoDataUrl } : {}),
          ...(effectiveManaged ? { managed: true } : {}),
          creationRequestKey,
        });
        if (!result.ok) {
          clientCreationAttemptRef.current = {
            requestKey: creationRequestKey, payload: creationPayload,
            uncertain: previousAttempt?.uncertain === true || result.uncertain === true,
          };
          setClientCreationUncertain(previousAttempt?.uncertain === true || result.uncertain === true);
          setAddError(result.error);
          return;
        }
        creationConfirmed = true;
        clientCreationAttemptRef.current = null;
        setClientCreationUncertain(false);

        // The agency remains the authenticated operator. The target owner is
        // sent separately so the server can authorize and stamp the new row;
        // never create under the agency and transfer afterwards.
        if (isAgencyPartner) {
          const project = createStoredProject(companyName, {
            owner: result.username,
            persist: false,
          });
          const projectIntent: PendingClientProjectIntent = {
            username: result.username,
            operatorUsername: session.username,
            project,
            logo: newLogoDataUrl,
          };
          try {
            sessionStorage.setItem("aio:pending-client-project", JSON.stringify(projectIntent));
          } catch {
            throw new Error("This browser could not prepare the Client Project. Check storage permissions and try again.");
          }
          setPendingClientCreation({ username: result.username, projectId: project.id });
          try {
            await persistPendingClientProject(projectIntent);
          } catch (error) {
            showNavigationFailure({
              username: result.username,
              projectId: null,
              openProjectHub: true,
              originalUsername: session.username,
              projectIntent,
            }, error, false, false);
            return;
          }
          const navigated = await navigateToAccount(
            result.username,
            null,
            true,
            session.username,
          );
          if (!navigated) return;
        }

        // welcomeLinkCreated === false means the account exists but the
        // set-password link could not be issued - warn instead of implying
        // the client received a working sign-in link.
        const linkFailed = !effectiveManaged && !!contactEmail && result.welcomeLinkCreated === false;
        setAddSuccess(
          `Created ${isAgencyPartner ? "Client Project" : "client account"} '${result.username}' for ${companyName}.` +
          (effectiveManaged
            ? (isAgencyPartner
                ? " Opening Project Hub."
                : " This is a managed account - the client has not been given sign-in access. Use 'View account' to work on their behalf.")
            : linkFailed
              ? ` However, a set-password link could not be created for ${contactEmail}. Any email they receive will not include a sign-in link - use 'Grant access' on the account, or share a password with them directly.`
              : contactEmail ? ` We've emailed ${contactEmail} to let them know.` : ""),
        );
        setNewCompanyName("");
        setNewWebsite("");
        setNewContactName("");
        setNewContactEmail("");
        setNewPassword("");
        setNewManaged(false);
        setNewLogoDataUrl(null);
        refresh();
      } catch (error) {
        if (creationConfirmed) {
          setAddError(error instanceof Error ? error.message : "The account was created, but opening it failed.");
          return;
        }
        clientCreationAttemptRef.current = {
          requestKey: creationRequestKey, payload: creationPayload, uncertain: true,
        };
        setClientCreationUncertain(true);
        setAddError(error instanceof Error ? error.message : "Failed to create the client account.");
      } finally {
        clientCreationInFlightRef.current = false;
        setAddingClient(false);
      }
    })();
  };

  const clearClientProjectHandoff = () => {
    try {
      sessionStorage.removeItem("aio:open-client-projects");
    } catch { /* session storage may be unavailable in a privacy-restricted browser */ }
  };

  /**
   * Persist an agency-created project while the browser is already in the
   * child session. The intent remains in sessionStorage until the server
   * confirms the upsert, so a lost response can safely retry the same id.
   */
  const persistPendingClientProject = async (intent: PendingClientProjectIntent): Promise<void> => {
    const result = await pushProjectMeta(
      intent.project as unknown as Record<string, unknown> & { id: string },
      intent.logo,
      { owner: intent.username },
    );
    if (!result.ok) {
      throw new Error(result.error ?? "The Client Project could not be saved. Try again.");
    }
    const current = loadStoredProjects();
    if (!current.some((p) => p.id === intent.project.id)) {
      saveStoredProjects([intent.project, ...current]);
    }
    try {
      sessionStorage.removeItem("aio:pending-client-project");
    } catch { /* keep the in-memory navigation retry usable */ }
    refresh();
  };

  const completeNavigation = (target: NavigationTarget) => {
    if (target.openProjectHub) {
      sessionStorage.setItem(
        "aio:open-client-projects",
        JSON.stringify({ username: target.username, projectId: target.projectId }),
      );
      // Use an explicit protected destination on reload. Root is prerendered
      // marketing HTML, which would flash before the auth bootstrap runs.
       window.location.replace(`${import.meta.env.BASE_URL || "/"}project-hub`);
      return;
    }
    window.location.reload();
  };

  type TransitionReconciliation = "matched" | "mismatch" | "unavailable";
  const reconcileTransition = async (target: NavigationTarget): Promise<TransitionReconciliation> => {
    try {
      const response = await fetch(`${apiBase()}/api/platform/me`, { credentials: "include" });
      if (!response.ok) return "unavailable";
      const data = await response.json() as {
        account?: { username?: string } | null;
        impersonating?: { by?: string } | null;
      };
      const accountUsername = data.account?.username?.trim().toLowerCase();
      const operatorUsername = data.impersonating?.by?.trim().toLowerCase();
      if (
        accountUsername === target.username.trim().toLowerCase() &&
        operatorUsername === target.originalUsername.trim().toLowerCase()
      ) {
        return "matched";
      }
      return "mismatch";
    } catch {
      return "unavailable";
    }
  };

  const showNavigationFailure = (
    target: NavigationTarget,
    error: unknown,
    switched: boolean,
    uncertain = !switched,
  ) => {
    // A failed server request must never leave a previous workspace target
    // waiting to be consumed. Once the switch itself succeeded, preserve the
    // new handoff so retry can finish locally without another impersonation.
    if (!switched) clearClientProjectHandoff();
    const message = error instanceof Error
      ? error.message
      : typeof error === "string" && error
        ? error
        : "Failed to enter this account.";
    setEnterError(message);
    setEnteringUsername(null);
    setNavigationRetry({ ...target, switched, uncertain });
    navigationLockRef.current = false;
  };

  /**
   * Switches into an account and, for an agency client, leaves App a
   * one-time project-hub handoff. The handoff is deliberately written only
   * after the authorized server transition succeeds. Clearing it first keeps
   * an earlier workspace target from being replayed after a failed request.
   */
  const navigateToAccount = async (
    username: string,
    projectId: string | null,
    openProjectHub: boolean,
    originalUsername = session.username,
    projectIntent?: PendingClientProjectIntent,
  ) => {
    if (navigationLockRef.current) return false;
    const target: NavigationTarget = { username, projectId, openProjectHub, originalUsername, projectIntent };
    navigationLockRef.current = true;
    setEnterError(null);
    setNavigationRetry(null);
    setEnteringUsername(username);
    clearClientProjectHandoff();

    let switched = false;
    try {
      const result = await serverImpersonate(username);
      if (!result.ok) {
        const reconciliation = await reconcileTransition(target);
        if (reconciliation === "matched") {
          switched = true;
          if (target.projectIntent) await persistPendingClientProject(target.projectIntent);
          completeNavigation(target);
          return true;
        }
        showNavigationFailure(target, result.error, false, true);
        return false;
      }
      switched = true;
      if (target.projectIntent) await persistPendingClientProject(target.projectIntent);
      completeNavigation(target);
      return true;
    } catch (error) {
      if (!switched) {
        const reconciliation = await reconcileTransition(target);
        if (reconciliation === "matched") {
          switched = true;
          try {
            if (target.projectIntent) await persistPendingClientProject(target.projectIntent);
            completeNavigation(target);
            return true;
          } catch (recoveryError) {
            showNavigationFailure(target, recoveryError, true, false);
            return false;
          }
        }
      }
      showNavigationFailure(target, error, switched);
      return false;
    }
  };

  const handleRetryNavigation = () => {
    if (navigationLockRef.current || !navigationRetry) return;
    const target = navigationRetry;
    if (!target.switched) {
      if (!target.uncertain) {
        if (target.projectIntent) {
          navigationLockRef.current = true;
          setEnterError(null);
          setNavigationRetry(null);
          setEnteringUsername(target.username);
          void persistPendingClientProject(target.projectIntent)
            .then(() => {
              navigationLockRef.current = false;
              return navigateToAccount(target.username, target.projectId, target.openProjectHub, target.originalUsername);
            })
            .catch((error) => showNavigationFailure(target, error, false, false));
        } else {
          void navigateToAccount(target.username, target.projectId, target.openProjectHub, target.originalUsername);
        }
        return;
      }

      // A failed request may have switched the server cookie before its
      // response was lost. Reconcile first on every retry. Only a confirmed
      // mismatch authorises another serverImpersonate request.
      navigationLockRef.current = true;
      setEnterError(null);
      setNavigationRetry(null);
      setEnteringUsername(target.username);
      void reconcileTransition(target).then(async (reconciliation) => {
        if (reconciliation === "matched") {
          try {
            if (target.projectIntent) await persistPendingClientProject(target.projectIntent);
            completeNavigation(target);
          } catch (error) {
            showNavigationFailure(target, error, true, false);
          }
          return;
        }
        if (reconciliation === "unavailable") {
          showNavigationFailure(
            target,
            "We could not confirm the workspace switch. Try again.",
            false,
            true,
          );
          return;
        }
        navigationLockRef.current = false;
        void navigateToAccount(target.username, target.projectId, target.openProjectHub, target.originalUsername, target.projectIntent);
      });
      return;
    }

    // The server session is already the target workspace. Only retry the
    // handoff/history/reload steps; calling serverImpersonate again here can
    // incorrectly attempt a nested switch from inside the client session.
    navigationLockRef.current = true;
    setEnterError(null);
    setNavigationRetry(null);
    setEnteringUsername(target.username);
    void (async () => {
      try {
        if (target.projectIntent) await persistPendingClientProject(target.projectIntent);
        completeNavigation(target);
      } catch (error) {
        showNavigationFailure(target, error, true);
      }
    })();
  };

  const handleEnterAccount = (username: string) => {
    void navigateToAccount(username, null, false);
  };

  // A zero-project client row has its own explicit creation action. It must
  // not be implemented by the generic Open Project Hub action: the project
  // needs to be saved while the child session is active and must retain its
  // id if the response is lost and the user retries.
  const handleCreateClientProject = async (account: LocalUser) => {
    if (navigationLockRef.current) return;
    const project = createStoredProject(account.displayName?.trim() || account.username, {
      owner: account.username,
      persist: false,
    });
    const intent: PendingClientProjectIntent = {
      username: account.username,
      operatorUsername: session.username,
      project,
    };
    try {
      sessionStorage.setItem("aio:pending-client-project", JSON.stringify(intent));
    } catch {
      setEnterError("This browser could not prepare the Client Project. Check storage permissions and try again.");
      return;
    }
    setEnteringUsername(account.username);
    try {
      await persistPendingClientProject(intent);
      await navigateToAccount(account.username, null, true, session.username);
    } catch (error) {
      setEnterError(error instanceof Error ? error.message : "The Client Project could not be saved. Try again.");
    } finally {
      setEnteringUsername(null);
    }
  };

  // Agency partner shortcut: enter the client's workspace and land on their
  // Project Hub. A specific project chip can still request a direct project.
  // App consumes the one-time handoff after the successful session reload.
  const handleOpenClientProjects = async (username: string, projectId?: string | null) => {
    await navigateToAccount(username, projectId ?? null, true);
  };

  const handleArchive = (username: string, archive: boolean) => {
    const accountTerm = isAgencyPartner ? "client project" : "client account";
    const msg = isAgencyPartner
      ? archive
        ? `Archive ${accountTerm} '${username}'? Their projects remain visible to you and can be restored later.`
        : `Restore ${accountTerm} '${username}'? Their projects will be available in your agency workspace again.`
      : archive
        ? `Archive ${accountTerm} '${username}'? They will not be able to sign in until restored. Their projects remain visible to you.`
        : `Restore ${accountTerm} '${username}'? They will be able to sign in again.`;
    if (!confirm(msg)) return;
    void (async () => {
      const result = await serverArchiveUser(username, archive);
      if (!result.ok) { alert(result.error); return; }
      refresh();
    })();
  };

  const handleDelete = (username: string) => {
    const accountTerm = isAgencyPartner ? "client project" : "client account";
    const message = isAgencyPartner
      ? `Delete ${accountTerm} '${username}'? Their projects are kept and stay visible to you.`
      : `Delete ${accountTerm} '${username}'? They will no longer be able to sign in. Their projects are kept and stay visible to you.`;
    if (!confirm(message)) return;
    // Reassign the deleted account's projects to the parent first, so they
    // remain visible after the account (and its place in the user graph) is
    // gone. Visibility is derived from current ownership, so an orphaned owner
    // would otherwise disappear from the parent's view.
    const target = username.toLowerCase();
    loadStoredProjects().forEach((p) => {
      if ((p.owner || "").toLowerCase() === target) {
        onAssignProjectOwner(p.id, session.username);
      }
    });
    void (async () => {
      const result = await serverDeleteUser(username);
      if (!result.ok) {
        alert(result.error);
        return;
      }
      refresh();
    })();
  };

  const handleSavePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (!pwUser) return;
    void (async () => {
      const result = await serverChangePassword(pwUser, pwValue);
      if (!result.ok) {
        setPwError(result.error);
        return;
      }
      setPwUser(null);
      setPwValue("");
      refresh();
    })();
  };

  const handleSaveClientProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    if (!profileUser) return;
    void (async () => {
      const result = await serverSetDisplayName(profileUser, profileName, profileWebsite);
      if (!result.ok) {
        setProfileError(result.error);
        return;
      }
      setProfileUser(null);
      setProfileName("");
      setProfileWebsite("");
      refresh();
    })();
  };

  const ownerLabel = (owner: string | undefined) => {
    const o = (owner || "").toLowerCase();
    if (o === session.username.toLowerCase()) return "You";
    const match = subAccounts.find((u) => u.username.toLowerCase() === o);
    return match ? match.username : owner || "Unassigned";
  };
  const unrecoveredProjectIds = new Set(
    reconciliationAudit?.localOnly.filter((item) => !item.recovered).map((item) => item.id) ?? [],
  );
  const reconciliationReady =
    reconciliationAudit !== null && reconciliationError === null && !reconciliationLoading;

  const handleConfirmedProjectAssignment = async (project: Client, owner: string) => {
    const currentOwner = (project.owner || session.username).toLowerCase();
    const targetOwner = owner.toLowerCase();
    if (currentOwner === targetOwner) return;
    const targetLabel = ownerLabel(owner);
    if (!confirm(`Move '${project.name}' from ${ownerLabel(project.owner)} to ${targetLabel}? This changes which ${isAgencyPartner ? "Client Project" : "client workspace"} owns and opens the project.`)) {
      refresh();
      return;
    }
    setAssigningProjectId(project.id);
    const result = await onAssignProjectOwner(project.id, owner);
    setAssigningProjectId(null);
    if (!result.ok) {
      setReconciliationError(result.error || "The project could not be reassigned.");
      refresh();
      return;
    }
    setReconciliationError(null);
    refresh();
  };

  return (
    <div className="aio-account-settings min-h-screen font-['Inter',sans-serif]" style={{ background: paper, color: ink }}>
      <header className="settings-header px-4 sm:px-10 py-4 sm:py-6 flex items-center justify-between" style={{ background: paper, borderBottom: `1px solid ${vars.g200}` }}>
        <div className="settings-header-brand flex items-center gap-5">
          <button type="button" onClick={onBack} aria-label="Return to AIO Fusion home" className="settings-logo flex items-center gap-3.5">
            <img src={`${import.meta.env.BASE_URL}images/logo-color.png`} alt="AIO Fusion home" className="h-16 sm:h-24" />
          </button>
        </div>
        <div className="flex items-center gap-4 sm:gap-6">
          {backToAgency}
          <button
            onClick={onBack}
            className="settings-back-button aio-button aio-button--return"
            style={{ background: accent, color: paper }}
          >
            <ArrowLeft size={16} /> Back to platform
          </button>
        </div>
      </header>

      <main className="settings-main px-4 sm:px-10 py-10 sm:py-14 max-w-[1320px] mx-auto">
        <div className="settings-intro mb-8">
          <h1 className="aio-type-page-title">
            Account Settings
          </h1>
          <p className="settings-intro-description aio-type-body mt-3 max-w-2xl" style={{ color: vars.g600 }}>
            {isAgencyPartner
              ? <>Manage your agency account, team and Client Projects in one place.<br />Open managed projects directly without requiring clients to have a separate AIO Fusion login.</>
              : canCreateSubAccounts(session.role)
              ? "Give a client their own login so they can sign in and work on their own projects. They only ever see their own projects, while you still see everything across all of your clients."
              : "Manage your account settings, team members, and security options."}
          </p>
        </div>

        <div className="settings-layout flex flex-col lg:flex-row gap-6 lg:gap-10 items-start">
          {/* LEFT-HAND NAV (desktop) */}
          <aside className="settings-nav hidden lg:block w-56 flex-shrink-0 sticky top-6">
            {navGroups.map((group) => (
              <div key={group.label} className="mb-6">
                <p className="aio-type-eyebrow mb-2 px-3" style={{ color: vars.g400 }}>{group.label}</p>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = section === item.id;
                    const Icon = item.icon;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => selectSection(item.id)}
                          aria-current={active ? "page" : undefined}
                          className={`settings-nav-button aio-type-supporting w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all ${active ? "settings-nav-button-active" : ""}`}
                          style={{
                            background: active ? accentSoft : "transparent",
                            color: active ? accent : vars.g600,
                            fontWeight: active ? 700 : 500,
                          }}
                        >
                          <span className={`settings-nav-icon ${item.id === "security" || item.id === "team" ? "settings-nav-icon-navy" : "settings-nav-icon-pink"}`}>
                            <Icon size={14} className="flex-shrink-0" />
                          </span>
                          {item.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {onOpenGeorge && (
              <div className="settings-george-card">
                <p className="settings-george-title aio-type-eyebrow">Need help?</p>
                <p className="aio-type-supporting">GEOrge is ready to help with your account and platform questions.</p>
                <button type="button" onClick={onOpenGeorge} className="aio-button aio-button--primary">
                  <MessageCircle size={15} /> Ask GEOrge
                </button>
              </div>
            )}
          </aside>

          {/* MOBILE NAV - horizontal pills */}
          <div className="settings-mobile-nav lg:hidden w-full -mx-1 px-1 overflow-x-auto">
            <div className="flex items-center gap-2 pb-1" style={{ minWidth: "max-content" }}>
              {navGroups.flatMap((g) => g.items).map((item) => {
                const active = section === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectSection(item.id)}
                    aria-current={active ? "page" : undefined}
                    className={`settings-mobile-nav-button aio-type-label flex items-center gap-1.5 px-3.5 py-2 rounded-full whitespace-nowrap transition-all ${active ? "settings-mobile-nav-button-active" : ""}`}
                    style={{
                      background: active ? accent : "white",
                      color: active ? "white" : vars.g600,
                      border: `1.5px solid ${active ? accent : vars.g200}`,
                    }}
                  >
                    <span className={`settings-nav-icon ${item.id === "security" || item.id === "team" ? "settings-nav-icon-navy" : "settings-nav-icon-pink"}`}>
                      <Icon size={13} />
                    </span> {item.label}
                  </button>
                );
              })}
            </div>
            {onOpenGeorge && (
              <button type="button" onClick={onOpenGeorge} className="settings-george-mobile-button aio-button aio-button--primary">
                <MessageCircle size={15} /> Ask GEOrge
              </button>
            )}
          </div>

          <div className="settings-content flex-1 min-w-0 w-full">
        {enterError && navigationRetry && (
          <div
            role="alert"
            className="mb-6 flex flex-wrap items-center gap-3 rounded-xl px-4 py-3"
            style={{ background: "rgba(200,73,122,0.07)", border: `1px solid ${accent}40` }}
          >
            <p className="aio-type-supporting flex-1 min-w-[220px]" style={{ color: accent }}>{enterError}</p>
            <button
              type="button"
              onClick={handleRetryNavigation}
              disabled={enteringUsername !== null}
              className="aio-button aio-button--outline aio-button--compact"
              style={{ color: accent, borderColor: `${accent}60` }}
            >
              <Repeat size={12} /> {navigationRetry.openProjectHub ? "Retry navigation to Project Hub" : "Retry navigation to account"}
            </button>
          </div>
        )}

        {section === "profile" && (<>
        {/* ACCOUNT TYPE */}
        <div className="settings-card settings-card-account-type rounded-2xl p-6 sm:p-8 mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
          <h2 className="aio-type-section-title mb-1" style={{ color: ink }}>Account type</h2>
          <p className="aio-type-supporting mb-5" style={{ color: vars.g600 }}>
            {session.role === "user"
              ? "Your account was created before account types existed - choose the one that fits how you work."
              : "Controls how your dashboard is set up - whether you manage multiple clients or one brand."}
          </p>
          {!isAgencyOrClient ? (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl" style={{ background: "#FEF9EC", border: "1px solid #F5D57A" }}>
              <Info size={14} className="flex-shrink-0 mt-0.5" style={{ color: "#A0720A" }} />
              <p className="aio-type-supporting" style={{ color: "#7A5500" }}>
                Your account type was set up by an administrator. Contact support to change it.
              </p>
            </div>
          ) : !isOwner ? (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl" style={{ background: "#FEF9EC", border: "1px solid #F5D57A" }}>
              <Info size={14} className="flex-shrink-0 mt-0.5" style={{ color: "#A0720A" }} />
              <p className="aio-type-supporting" style={{ color: "#7A5500" }}>
                Only the account owner can change the account type.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                {/* Agency / Partner option */}
                <button
                  type="button"
                  onClick={() => { setSelectedType("agency"); setTypeError(null); setTypeSuccess(null); }}
                  className={`settings-account-option text-left p-5 rounded-xl border-2 transition-all hover:-translate-y-0.5 ${(selectedType ?? session.role) === "agency" ? "settings-account-option-selected" : ""}`}
                  style={{
                    borderColor: (selectedType ?? session.role) === "agency" ? accent : vars.g200,
                    background: (selectedType ?? session.role) === "agency" ? "#FDF0F5" : "white",
                    boxShadow: (selectedType ?? session.role) === "agency" ? `0 0 0 1px ${accent}` : undefined,
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="settings-account-icon settings-account-icon-agency w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: (selectedType ?? session.role) === "agency" ? accent : vars.g100 }}>
                      <Building2 size={16} color={(selectedType ?? session.role) === "agency" ? "white" : vars.g500} />
                    </div>
                    <div>
                      <p className="aio-type-card-title" style={{ color: ink }}>Agency / Partner</p>
                      {session.role === "agency" && !selectedType && (
                        <span className="aio-type-eyebrow" style={{ color: accent }}>Current</span>
                      )}
                    </div>
                  </div>
                  <p className="aio-type-supporting" style={{ color: vars.g600 }}>
                    Manage PR for multiple clients. Create Client Projects and view all dashboards from one place.
                  </p>
                </button>

                {/* Client option */}
                <button
                  type="button"
                  onClick={() => { setSelectedType("client"); setTypeError(null); setTypeSuccess(null); }}
                  className={`settings-account-option text-left p-5 rounded-xl border-2 transition-all hover:-translate-y-0.5 ${(selectedType ?? session.role) === "client" ? "settings-account-option-selected" : ""}`}
                  style={{
                    borderColor: (selectedType ?? session.role) === "client" ? "#1A647B" : vars.g200,
                    background: (selectedType ?? session.role) === "client" ? "#EDF6F9" : "white",
                    boxShadow: (selectedType ?? session.role) === "client" ? `0 0 0 1px #1A647B` : undefined,
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="settings-account-icon settings-account-icon-client w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: (selectedType ?? session.role) === "client" ? "#1A647B" : vars.g100 }}>
                      <User size={16} color={(selectedType ?? session.role) === "client" ? "white" : vars.g500} />
                    </div>
                    <div>
                      <p className="aio-type-card-title" style={{ color: ink }}>Client</p>
                      {session.role === "client" && !selectedType && (
                        <span className="aio-type-eyebrow" style={{ color: "#1A647B" }}>Current</span>
                      )}
                    </div>
                  </div>
                  <p className="aio-type-supporting" style={{ color: vars.g600 }}>
                    Manage PR for your own brand. One focused workspace for all your projects.
                  </p>
                </button>
              </div>

              {typeError && (
                <div className="flex items-start gap-2 mb-3 px-4 py-3 rounded-xl" style={{ background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.25)" }}>
                  <XCircle size={14} className="flex-shrink-0 mt-0.5" style={{ color: "rgb(185,28,28)" }} />
                  <p className="aio-type-supporting" style={{ color: "rgb(185,28,28)" }}>{typeError}</p>
                </div>
              )}
              {typeSuccess && (
                <div className="flex items-center gap-2 mb-3 px-4 py-3 rounded-xl" style={{ background: "rgba(22,163,74,0.07)", border: "1px solid rgba(22,163,74,0.25)" }}>
                  <CheckCircle2 size={14} style={{ color: "rgb(21,128,61)" }} />
                  <p className="aio-type-supporting" style={{ color: "rgb(21,128,61)" }}>{typeSuccess}</p>
                </div>
              )}

              {selectedType && selectedType !== session.role && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleChangeAccountType}
                    disabled={typeChanging}
                    className="aio-button aio-button--primary text-white"
                    style={{ background: accent }}
                  >
                    {typeChanging ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    {typeChanging ? "Saving..." : `Switch to ${selectedType === "agency" ? "Agency / Partner" : "Client"}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSelectedType(null); setTypeError(null); }}
                    className="aio-button aio-button--outline"
                    style={{ color: vars.g500, border: `1.5px solid ${vars.g200}` }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* SIGNED-IN PROFILE AND ACTIVE WORKSPACE */}
        {workspaceNameNeedsReview && isOwner && (
          <div className="settings-alert rounded-2xl p-6 sm:p-8 mb-6" style={{ background: "#FEF9EC", border: "1px solid #F5D57A" }}>
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" style={{ color: "#A0720A" }} />
              <div className="flex-1 min-w-0">
                <h2 className="aio-type-section-title mb-1" style={{ color: ink }}>Please check your company name</h2>
                <p className="aio-type-supporting mb-4" style={{ color: "#7A5500" }}>
                  An earlier Google or Microsoft sign-up may have used your personal name here. Confirm it if it is correct, or enter your organisation's name.
                </p>
                <label className="aio-type-label block uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }} htmlFor="workspace-name-review">
                  Company name
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    id="workspace-name-review"
                    value={reviewWorkspaceName}
                    onChange={(event) => setReviewWorkspaceName(event.target.value)}
                    maxLength={64}
                    className="aio-type-body flex-1 rounded-xl px-4 py-2.5 outline-none"
                    style={{ border: `1px solid ${vars.g300}`, color: ink, background: "white" }}
                  />
                  <button
                    type="button"
                    onClick={handleWorkspaceNameReview}
                    disabled={!reviewWorkspaceName.trim() || reviewingWorkspaceName}
                    className="aio-button aio-button--primary text-white"
                    style={{ background: accent }}
                  >
                    {reviewingWorkspaceName ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    {reviewingWorkspaceName ? "Saving..." : "Confirm name"}
                  </button>
                </div>
                {workspaceNameReviewError && <p className="aio-type-supporting mt-2" style={{ color: "rgb(185,28,28)" }}>{workspaceNameReviewError}</p>}
              </div>
            </div>
          </div>
        )}
        <div className="settings-card settings-card-profile rounded-2xl p-6 sm:p-8 mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
          <h2 className="aio-type-section-title mb-1" style={{ color: ink }}>Your profile</h2>
          <p className="aio-type-supporting mb-4" style={{ color: vars.g500 }}>
            This is the person currently signed in to AIO Fusion.
          </p>
          {(googleLinked === false || microsoftLinked === false) && (
            <p className="aio-type-body mb-4" style={{ color: vars.g600 }}>
              Linking is optional - if you would like to link your account to an existing Google or Microsoft account, please select below.
            </p>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1">
              <label
                className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer overflow-hidden group relative"
                style={{ background: accentSoft, color: accent }}
                title={avatarUrl ? "Change your photo" : "Add your photo"}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Your photo" className="w-full h-full object-cover" />
                ) : uploadingImage === "avatar" ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <User size={16} />
                )}
                <span className="absolute inset-0 hidden group-hover:flex items-center justify-center text-center leading-[1.2] px-1 text-[8px] font-bold uppercase tracking-[0.08em] text-white" style={{ background: "rgba(10,22,40,0.55)" }}>
                  {avatarUrl ? "Change" : "Add photo"}
                </span>
                <input
                  type="file"
                  aria-label="Upload profile photo"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={uploadingImage !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) handleImageUpload("avatar", f);
                  }}
                />
              </label>
              <div>
                 <p className="aio-type-card-title" style={{ color: ink }}>{session.userName?.trim() || session.userEmail?.trim() || session.username}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.16em]" style={{ background: "#E6F4EA", color: "#1B7A3E" }}>
                    <CheckCircle2 size={10} /> Signed in
                  </span>
                   {session.userEmail && <span className="aio-type-meta" style={{ color: vars.g500 }}>{session.userEmail}</span>}
                </div>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => handleImageRemove("avatar")}
                    className="aio-button aio-button--text mt-1"
                    style={{ color: vars.g400 }}
                  >
                    Remove photo
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {googleLinked === true ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold" style={{ background: "#E6F4EA", color: "#1B7A3E" }}>
                  <CheckCircle2 size={13} /> Google linked
                </span>
              ) : googleLinked === false ? (
                <a
                  href={`${apiBase()}/api/platform/auth/google/link`}
                   className="aio-button aio-button--outline"
                  style={{ borderColor: vars.g300, color: ink }}
                >
                  <LinkIcon size={13} /> Link Google account
                </a>
              ) : null}
              {microsoftLinked === true ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold" style={{ background: "#E6F4EA", color: "#1B7A3E" }}>
                  <CheckCircle2 size={13} /> Microsoft linked
                </span>
              ) : microsoftLinked === false ? (
                <a
                  href={`${apiBase()}/api/platform/auth/microsoft?action=link`}
                   className="aio-button aio-button--outline"
                  style={{ borderColor: vars.g300, color: ink }}
                >
                  <LinkIcon size={13} /> Link Microsoft account
                </a>
              ) : null}
              {isMasterOwner && (
                <button
                  onClick={handleSwitchToMaster}
                  disabled={switchingToMaster}
                  className="aio-button aio-button--secondary"
                  style={{ background: ink, color: "#fff" }}
                >
                  {switchingToMaster ? <Loader2 size={13} className="animate-spin" /> : <Shield size={13} />}
                  {switchingToMaster ? "Switching..." : "Switch to Master"}
                </button>
              )}
            </div>
          </div>
          {switchToMasterError && (
            <p className="aio-type-supporting mt-3" style={{ color: accent }}>{switchToMasterError}</p>
          )}

          {/* ACTIVE WORKSPACE */}
          <div className="mt-5 pt-5 flex flex-col sm:flex-row sm:items-center gap-4" style={{ borderTop: `1px solid ${vars.g200}` }}>
            <div className="flex items-center gap-3 flex-1">
              <label
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden cursor-pointer group relative"
                style={{ background: vars.g50, border: `1px solid ${vars.g200}` }}
                title={logoUrl ? "Change your logo" : "Add your logo"}
              >
                {logoUrl ? (
                  <img src={logoUrl} alt="Brand logo" className="w-full h-full object-contain p-1" />
                ) : uploadingImage === "logo" ? (
                  <Loader2 size={16} className="animate-spin" style={{ color: vars.g400 }} />
                ) : (
                  <ImageIcon size={16} style={{ color: vars.g400 }} />
                )}
                <span className="absolute inset-0 hidden group-hover:flex items-center justify-center text-center leading-[1.2] px-1 text-[8px] font-bold uppercase tracking-[0.08em] text-white" style={{ background: "rgba(10,22,40,0.55)" }}>
                  {logoUrl ? "Change" : "Add logo"}
                </span>
                <input
                  type="file"
                  aria-label="Upload workspace logo"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={uploadingImage !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) handleLogoFileChosen(f);
                  }}
                />
              </label>
              <div className="min-w-0">
                <p className="aio-type-eyebrow" style={{ color: vars.g400 }}>
                  {session.role === "client"
                    ? session.agencyManagedClient ? "Active client project" : "Active project"
                    : "Active workspace"}
                </p>
                <p className="aio-type-card-title truncate" style={{ color: ink }}>{confirmedWorkspaceName || session.companyName?.trim() || session.username}</p>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.16em]" style={{ background: accentSoft, color: accent }}>
                    {session.role === "agency"
                      ? "Agency Partner"
                      : session.role === "client"
                      ? session.agencyManagedClient ? "Client Project" : "Client Account"
                      : session.role}
                  </span>
                  {accountWebsite && (
                    <a
                      href={accountWebsite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="aio-type-meta inline-flex items-center gap-1 hover:underline"
                      style={{ color: vars.g500 }}
                    >
                      <Globe size={11} /> {accountWebsite.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    </a>
                  )}
                </div>
                <p className="aio-type-supporting" style={{ color: vars.g500 }}>
                  {logoUrl ? "This is the workspace logo, not your personal photo. Click it to change or resize it." : "Add a company or brand logo for this workspace (PNG, JPEG or WebP)."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {session.role === "client" && !session.agencyManagedClient && (
                <>
                  <button
                    type="button"
                    onClick={onOpenProject}
                    className="aio-button aio-button--primary text-white"
                    style={{ background: accent }}
                  >
                    <FolderOpen size={13} /> Go to project
                  </button>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!editingActiveProject) {
                          setActiveProjectName(confirmedWorkspaceName || session.companyName?.trim() || session.username);
                          setActiveProjectWebsite(accountWebsite || "");
                          setActiveProjectError(null);
                        }
                        setEditingActiveProject((editing) => !editing);
                      }}
                      className="aio-button aio-button--outline"
                      style={{ color: ink, border: `1.5px solid ${vars.g200}` }}
                    >
                      <FileEdit size={13} /> {editingActiveProject ? "Cancel" : "Edit details"}
                    </button>
                  )}
                </>
              )}
              {logoUrl && (
                <button
                  type="button"
                  onClick={() => handleImageRemove("logo")}
                  className="aio-button aio-button--text"
                  style={{ color: vars.g400 }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          {editingActiveProject && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl p-4" style={{ background: vars.g50, border: `1px solid ${vars.g200}` }}>
              <label className="aio-type-label uppercase tracking-[0.12em]" style={{ color: vars.g500 }}>
                Project name
                <input
                  value={activeProjectName}
                  onChange={(event) => setActiveProjectName(event.target.value)}
                  maxLength={64}
                  className="aio-type-body mt-1.5 w-full rounded-xl px-3 py-2.5 outline-none"
                  style={{ background: "white", border: `1px solid ${vars.g300}`, color: ink }}
                />
              </label>
              <label className="aio-type-label uppercase tracking-[0.12em]" style={{ color: vars.g500 }}>
                Company website
                <input
                  value={activeProjectWebsite}
                  onChange={(event) => setActiveProjectWebsite(event.target.value)}
                  placeholder="https://www.example.com"
                  className="aio-type-body mt-1.5 w-full rounded-xl px-3 py-2.5 outline-none"
                  style={{ background: "white", border: `1px solid ${vars.g300}`, color: ink }}
                />
              </label>
              <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveActiveProject}
                  disabled={!activeProjectName.trim() || savingActiveProject}
                  className="aio-button aio-button--primary text-white"
                  style={{ background: accent }}
                >
                  {savingActiveProject ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  {savingActiveProject ? "Saving..." : "Save details"}
                </button>
                <span className="aio-type-supporting" style={{ color: vars.g500 }}>Click the logo above to change it.</span>
              </div>
              {activeProjectError && <p className="aio-type-supporting sm:col-span-2" style={{ color: "rgb(185,28,28)" }}>{activeProjectError}</p>}
            </div>
          )}
          {imageError && (
            <p className="aio-type-supporting mt-3" style={{ color: accent }}>{imageError}</p>
          )}
        </div>
        </>)}

        {/* LOGO SIZING DIALOG - zoom and drag the logo into the square frame */}
        {logoAdjust && (
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4" style={{ background: "rgba(10,22,40,0.55)" }} onClick={() => setLogoAdjust(null)}>
            <div className="rounded-2xl p-6 w-full max-w-sm" style={{ background: "white", boxShadow: "0 24px 64px -16px rgba(16,43,54,0.4)" }} onClick={(e) => e.stopPropagation()}>
              <h3 className="aio-type-card-title mb-1" style={{ color: ink }}>Size your logo</h3>
              <p className="aio-type-supporting mb-4" style={{ color: vars.g500 }}>Drag to position and use the slider to zoom until your logo sits nicely in the square.</p>
              <div className="mx-auto mb-4 relative overflow-hidden rounded-xl touch-none select-none" style={{ width: LOGO_PREVIEW, height: LOGO_PREVIEW, border: `1px solid ${vars.g200}`, background: "repeating-conic-gradient(#f1f5f9 0% 25%, white 0% 50%) 50% / 20px 20px", cursor: "grab" }}
                onPointerDown={(e) => {
                  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                  logoDragRef.current = { startX: e.clientX, startY: e.clientY, baseOffX: logoAdjust.offX, baseOffY: logoAdjust.offY };
                }}
                onPointerMove={(e) => {
                  const d = logoDragRef.current;
                  if (!d) return;
                  setLogoAdjust((prev) => prev ? { ...prev, offX: d.baseOffX + (e.clientX - d.startX), offY: d.baseOffY + (e.clientY - d.startY) } : prev);
                }}
                onPointerUp={() => { logoDragRef.current = null; }}
                onPointerCancel={() => { logoDragRef.current = null; }}
              >
                {(() => {
                  const s0 = Math.min(LOGO_PREVIEW / logoAdjust.imgW, LOGO_PREVIEW / logoAdjust.imgH);
                  const w = logoAdjust.imgW * s0 * logoAdjust.zoom;
                  const hh = logoAdjust.imgH * s0 * logoAdjust.zoom;
                  return (
                    <img
                      src={logoAdjust.src}
                      alt="Logo preview"
                      draggable={false}
                      className="absolute pointer-events-none"
                      style={{ width: w, height: hh, left: LOGO_PREVIEW / 2 + logoAdjust.offX - w / 2, top: LOGO_PREVIEW / 2 + logoAdjust.offY - hh / 2, maxWidth: "none" }}
                    />
                  );
                })()}
              </div>
              <div className="flex items-center gap-3 mb-5">
                 <span className="aio-type-label uppercase tracking-[0.14em]" style={{ color: vars.g500 }}>Zoom</span>
                <input
                  type="range"
                  aria-label="Logo zoom"
                  min={0.4}
                  max={3}
                  step={0.01}
                  value={logoAdjust.zoom}
                  onChange={(e) => setLogoAdjust((prev) => prev ? { ...prev, zoom: Number(e.target.value) } : prev)}
                  className="flex-1"
                  style={{ accentColor: accent }}
                />
                <button
                  type="button"
                  onClick={() => setLogoAdjust((prev) => prev ? { ...prev, zoom: 1, offX: 0, offY: 0 } : prev)}
                   className="aio-button aio-button--text underline"
                  style={{ color: vars.g500 }}
                >
                  Reset
                </button>
              </div>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setLogoAdjust(null)}
                   className="aio-button aio-button--outline"
                  style={{ borderColor: vars.g300, color: ink }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleLogoAdjustSave}
                   className="aio-button aio-button--primary text-white"
                  style={{ background: accent }}
                >
                  Save logo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SIGN-IN & SECURITY (sessions, 2FA, password, deletion) */}
        {section === "security" && onSignOut && !session.agencyManagedClient && (
          <AccountSecurityCard
            session={session}
            onSignOut={onSignOut}
            deleteReauthResult={deleteReauthResult}
          />
        )}

        {/* BILLING DETAILS (billing email + VAT) - owner/admin/billing members only */}
        {section === "billing" && canSeeBilling && (
          <>
            <SubscriptionCard checkoutResult={checkoutResult} checkoutSessionId={checkoutSessionId} />
            <BillingDetailsCard />
          </>
        )}

        {/* TEAM MEMBERS (invite colleagues with roles + project access) */}
        {section === "team" && canSeeTeam && (
          <TeamSection onWorkspacesChanged={onWorkspacesChanged} onInvitationAccepted={onInvitationAccepted} />
        )}

        {/* ADD CLIENT ACCOUNT - agency/admin only */}
        {section === "clients" && isClientManager && <div className="settings-card rounded-2xl p-6 sm:p-8 mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
           <h2 className="aio-type-section-title mb-4" style={{ color: ink }}>{isAgencyPartner ? "Add a Client Project" : "Create a client account"}</h2>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-6">
               <label htmlFor="new-client-company-name" className="aio-type-label uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Company name</label>
              <input
                id="new-client-company-name"
                type="text"
                value={newCompanyName}
                disabled={addingClient || clientCreationUncertain}
                onChange={(e) => { markClientCreationEdited(); setNewCompanyName(e.target.value); setAddSuccess(null); }}
                placeholder="e.g. Acme Ltd"
                required
                 className="aio-type-body w-full px-3 py-2.5 rounded-lg border focus:outline-none focus:ring-2"
                style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
              />
            </div>
            <div className="md:col-span-6">
               <label htmlFor="new-client-company-website" className="aio-type-label uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Company website</label>
              <input
                id="new-client-company-website"
                type="text"
                inputMode="url"
                value={newWebsite}
                disabled={addingClient || clientCreationUncertain}
                onChange={(e) => { markClientCreationEdited(); setNewWebsite(e.target.value); setAddSuccess(null); }}
                placeholder="e.g. https://www.acme.com"
                required
                 className="aio-type-body w-full px-3 py-2.5 rounded-lg border focus:outline-none focus:ring-2"
                style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
              />
            </div>
            <div className="md:col-span-6">
               <label htmlFor="new-client-contact-name" className="aio-type-label uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Key contact full name <span className="normal-case tracking-normal" style={{ color: vars.g400 }}>(optional)</span></label>
              <input
                id="new-client-contact-name"
                type="text"
                value={newContactName}
                disabled={addingClient || clientCreationUncertain}
                onChange={(e) => { markClientCreationEdited(); setNewContactName(e.target.value); setAddSuccess(null); }}
                placeholder="e.g. Jane Smith"
                 className="aio-type-body w-full px-3 py-2.5 rounded-lg border focus:outline-none focus:ring-2"
                style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
              />
            </div>
            <div className="md:col-span-6">
               <label htmlFor="new-client-contact-email" className="aio-type-label uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Key contact email <span className="normal-case tracking-normal" style={{ color: vars.g400 }}>(optional)</span></label>
              <input
                id="new-client-contact-email"
                type="text"
                inputMode="email"
                value={newContactEmail}
                disabled={addingClient || clientCreationUncertain}
                onChange={(e) => { markClientCreationEdited(); setNewContactEmail(e.target.value); setAddSuccess(null); }}
                placeholder="e.g. jane@acme.com"
                 className="aio-type-body w-full px-3 py-2.5 rounded-lg border focus:outline-none focus:ring-2"
                style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
              />
            </div>
            {!isAgencyPartner && (
             <label htmlFor="new-client-managed" className="md:col-span-12 flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer" style={{ borderColor: vars.g200, background: newManaged ? accentSoft : "white" }}>
              <input
                id="new-client-managed"
                type="checkbox"
                checked={newManaged}
                disabled={addingClient || clientCreationUncertain}
                onChange={(e) => { markClientCreationEdited(); setNewManaged(e.target.checked); setAddSuccess(null); }}
                className="mt-0.5"
                style={{ accentColor: accent }}
              />
              <span>
                 <span className="aio-type-label block" style={{ color: ink }}>We'll manage this account on the client's behalf</span>
                 <span className="aio-type-supporting block mt-0.5" style={{ color: vars.g500 }}>
                  The client won't be given sign-in access - no password to share and no email is sent. You work on their projects through "View account". You can give them access later by setting a password on their account.
                </span>
              </span>
            </label>
            )}
            <div className="md:col-span-6">
               <label className="aio-type-label uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Client logo <span className="normal-case tracking-normal" style={{ color: vars.g400 }}>(optional)</span></label>
              <div className="flex items-center gap-3">
                {newLogoDataUrl && (
                  <img src={newLogoDataUrl} alt="Client logo preview" className="h-10 w-10 rounded-lg object-contain" style={{ border: `1px solid ${vars.g200}`, background: "white" }} />
                )}
                <label
                   className="aio-button aio-button--outline cursor-pointer"
                  style={{ borderColor: vars.g200, color: ink }}
                >
                  {logoProcessing ? "Processing..." : newLogoDataUrl ? "Replace logo" : "Upload logo"}
                  <input
                    aria-label="Upload client logo"
                    type="file"
                    disabled={addingClient || clientCreationUncertain}
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        markClientCreationEdited();
                        handleNewClientLogo(f);
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
                {newLogoDataUrl && (
                  <button
                    type="button"
                    disabled={addingClient || clientCreationUncertain}
                    onClick={() => { markClientCreationEdited(); setNewLogoDataUrl(null); }}
                    className="text-[12px] font-semibold underline"
                    style={{ color: vars.g500 }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
            {!isAgencyPartner && !newManaged && (
              <div className="md:col-span-6">
                 <label className="aio-type-label uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Password</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  disabled={addingClient || clientCreationUncertain}
                  onChange={(e) => { markClientCreationEdited(); setNewPassword(e.target.value); }}
                  placeholder="min 8 characters"
                  required
                   className="aio-type-body w-full px-3 py-2.5 rounded-lg border focus:outline-none focus:ring-2"
                  style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
                />
              </div>
            )}
            <div className="md:col-span-6 flex items-end">
              {agencyPackageIsFull ? (
                <button
                  type="button"
                  onClick={() => selectSection("billing")}
                  className="aio-button aio-button--primary w-full md:w-auto text-white"
                  style={{ background: accent }}
                >
                  <FileText size={14} /> Add a package in Billing
                </button>
              ) : (
              <button
                type="submit"
                 disabled={addingClient || logoProcessing || pendingClientCreation !== null}
                 className="aio-button aio-button--primary w-full md:w-auto text-white"
                style={{ background: accent }}
              >
                 {addingClient ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {pendingClientCreation ? "Project save pending" : isAgencyPartner ? "Add Client Project" : "Add client"}
              </button>
              )}
            </div>
             <p className="aio-type-supporting md:col-span-12" style={{ color: vars.g500 }}>
              {isAgencyPartner
                 ? "Each managed client reserves one package unit and can have one project. There is no separate client login or password, and billing stays with your agency."
                : newManaged
                ? "No email will be sent and the client won't be able to sign in - you manage everything on their behalf."
                : "If you add a key contact email, we'll let them know their account has been created and they can set their own password."}
            </p>
            {clientCreationUncertain && (
              <p className="aio-type-supporting md:col-span-12" style={{ color: accent }}>
                We couldn't confirm whether this client was created. The draft is locked to the original details - retry to safely recover the original result before making edits.
              </p>
            )}
             {addError && <p className="aio-type-supporting md:col-span-12" style={{ color: accent }}>{addError}</p>}
             {addSuccess && <p className="aio-type-supporting md:col-span-12" style={{ color: vars.green }}>{addSuccess}</p>}
          </form>
        </div>}

        {isClientManager && (<>
        {/* CLIENT ACCOUNTS LIST */}
        {section === "clients" && (
        <div className="rounded-2xl overflow-hidden mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
          <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: vars.g200 }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
               <h2 className="aio-type-section-title" style={{ color: ink }}>{isAgencyPartner ? "Your Client Projects" : "Your client accounts"} ({subAccounts.length}{archivedSubAccounts.length > 0 ? ` + ${archivedSubAccounts.length} archived` : ""})</h2>
              {isAgencyPartner && packageCapacity && (
                <span className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold" style={{ background: accentSoft, color: accent }}>
                  {packageCapacity.included} included · {packageCapacity.purchased} purchased · {packageCapacity.reserved} reserved · {packageCapacity.used} projects used · {packageCapacity.remaining === null ? "Unlimited" : Math.max(0, packageCapacity.remaining)} remaining · {packageCapacity.allowance === null ? "Unlimited" : packageCapacity.allowance} allowance · {packageCapacity.overLimit ? "over limit" : "within limit"}
                </span>
              )}
            </div>
          </div>
          {subAccounts.length === 0 ? (
             <p className="aio-type-supporting px-6 py-6 italic" style={{ color: vars.g500 }}>
              {isAgencyPartner ? "No Client Projects yet. Add one above, then start its first project." : "No client accounts yet. Create one above to give a client their own login."}
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: vars.g200 }}>
              {subAccounts.map((u) => {
                const editingPw = pwUser === u.username;
                const editingProfile = profileUser === u.username;
                const owned = manageable.filter((p) => (p.owner || "").toLowerCase() === u.username.toLowerCase());
                const logoSrc = clientLogoUrl(u.username);
                return (
                  <li key={u.username} className="px-6 py-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden relative" style={{ background: accentSoft, color: accent, border: `1px solid ${vars.g200}` }}>
                          <User size={16} />
                          <img
                            src={logoSrc}
                            alt={`${u.displayName ?? u.username} logo`}
                            loading="lazy"
                            decoding="async"
                            className="absolute inset-0 w-full h-full object-contain p-0.5"
                            onError={(event) => { event.currentTarget.hidden = true; }}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                             <p className="aio-type-card-title" style={{ color: ink }}>{u.displayName ?? u.username}</p>
                            {u.displayName && (
                               <p className="aio-type-meta" style={{ color: vars.g500 }}>@{u.username}</p>
                            )}
                            <span className="inline-flex items-center gap-1.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.16em]" style={{ background: accentSoft, color: accent }}>{isAgencyPartner ? "Client Project" : "Client"}</span>
                              {u.managed && !isAgencyPartner && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.16em]" style={{ background: vars.g200, color: vars.g500 }}>Managed</span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                       {!isAgencyPartner && <p className="aio-type-meta flex items-center gap-1.5 sm:pl-[52px]" style={{ color: vars.g500 }}>
                        <Clock size={12} />
                        {u.lastSignInAt ? `Last signed in ${formatLastSignIn(u.lastSignInAt)}` : "Never signed in"}
                      </p>}
                      <div className="flex items-center gap-2 flex-wrap sm:pl-[52px]">
                        <button
                          onClick={() => (isAgencyPartner
                            ? void handleOpenClientProjects(u.username, null)
                            : handleEnterAccount(u.username))}
                          disabled={enteringUsername === u.username}
                          className="aio-button aio-button--primary aio-button--compact text-white"
                          style={{ background: accent, opacity: enteringUsername === u.username ? 0.7 : 1 }}
                        >
                          {enteringUsername === u.username
                            ? <Loader2 size={13} className="animate-spin" />
                            : isAgencyPartner
                            ? <FolderOpen size={13} />
                            : <LogIn size={13} />}
                          {isAgencyPartner
                            ? "Open Project Hub"
                            : u.managed
                            ? "Open account"
                            : "Login as client"}
                        </button>
                        <button
                          onClick={() => {
                            if (editingProfile) {
                              setProfileUser(null);
                              setProfileError(null);
                              return;
                            }
                            setProfileUser(u.username);
                            setProfileName(u.displayName || "");
                            setProfileWebsite(u.website || "");
                            setProfileError(null);
                          }}
                          className="aio-button aio-button--outline aio-button--compact"
                        >
                          <FileEdit size={13} /> {editingProfile ? "Cancel" : "Edit details"}
                        </button>
                        {!isAgencyPartner && !u.agencyManaged && (
                        <button
                          onClick={() => { setPwUser(editingPw ? null : u.username); setPwValue(""); setPwError(null); }}
                          className="aio-button aio-button--outline aio-button--compact"
                        >
                          <KeyRound size={12} /> {editingPw ? "Cancel" : "Change password"}
                        </button>
                        )}
                        {isAgencyPartner || u.agencyManaged ? null : u.managed ? (
                          <button
                            onClick={() => { setAccessUser(accessUser === u.username ? null : u.username); setAccessPassword(""); setAccessError(null); setAccessNotice(null); }}
                            className="aio-button aio-button--outline aio-button--compact"
                            style={{ color: vars.green, borderColor: `${vars.green}40` }}
                          >
                            <Shield size={12} /> {accessUser === u.username ? "Cancel" : "Give client access"}
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => handleResendWelcome(u.username)}
                              disabled={accessBusy}
                              className="aio-button aio-button--outline aio-button--compact"
                              style={{ color: accent, borderColor: `${accent}40` }}
                              title="Send a fresh set-password email"
                            >
                              {accessBusy ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />} Resend welcome email
                            </button>
                            <button
                              onClick={() => handleRevokeAccess(u.username)}
                              className="aio-button aio-button--outline aio-button--compact"
                            >
                              <Lock size={12} /> Remove client access
                            </button>
                            <button
                              onClick={() => handleMarkManaged(u.username)}
                              title={isAgencyPartner
                                ? "Use this if the Client Project is run by your agency and was never given sign-in access."
                                : "Use this if the client account is run by your organisation and was never given sign-in access."}
                              className="aio-button aio-button--outline aio-button--compact"
                            >
                              <Shield size={12} /> Mark as managed
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleArchive(u.username, true)}
                          className="aio-button aio-button--outline aio-button--compact"
                        >
                          <Archive size={12} /> Archive
                        </button>
                        <button
                          onClick={() => handleDelete(u.username)}
                          className="aio-button aio-button--destructive aio-button--compact"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </div>
                    {editingProfile && (
                      <form onSubmit={handleSaveClientProfile} className="mt-3 flex flex-wrap items-center gap-2 sm:pl-[52px]">
                        <input
                          type="text"
                          value={profileName}
                          onChange={(e) => setProfileName(e.target.value)}
                          placeholder="Client name (leave blank to clear)"
                          className="aio-type-body flex-1 min-w-[180px] px-3 py-2 rounded-lg border focus:outline-none focus:ring-2"
                          style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
                        />
                        <input
                          type="url"
                          value={profileWebsite}
                          onChange={(e) => setProfileWebsite(e.target.value)}
                          placeholder="Website (leave blank to clear)"
                          className="aio-type-body flex-1 min-w-[180px] px-3 py-2 rounded-lg border focus:outline-none focus:ring-2"
                          style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
                        />
                        <button type="submit" className="aio-button aio-button--primary text-white" style={{ background: accent }}>
                          Save details
                        </button>
                        {profileError && <span className="aio-type-supporting w-full" style={{ color: accent }}>{profileError}</span>}
                      </form>
                    )}
                    {accessNotice?.username === u.username && (
                      <p className="aio-type-supporting mt-2 sm:pl-[52px]" style={{ color: vars.green }}>{accessNotice.text}</p>
                    )}
                    {accessUser === u.username && (
                      <div className="mt-3 rounded-xl p-4 sm:ml-[52px]" style={{ background: vars.g100 + "60", border: `1px solid ${vars.g200}` }}>
                        <p className="aio-type-label mb-2" style={{ color: ink }}>Give this client sign-in access</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={accessBusy}
                            onClick={() => handleGrantAccess(u.username)}
                            className="aio-button aio-button--primary text-white"
                            style={{ background: accent }}
                          >
                            {accessBusy ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />} Email set-password link
                          </button>
                          <span className="aio-type-meta" style={{ color: vars.g500 }}>or</span>
                          <input
                            type="text"
                            value={accessPassword}
                            onChange={(e) => setAccessPassword(e.target.value)}
                            placeholder="Set a password (min 8 chars)"
                            className="aio-type-body flex-1 min-w-[180px] px-3 py-2 rounded-lg border focus:outline-none focus:ring-2"
                            style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
                          />
                          <button
                            type="button"
                            disabled={accessBusy || accessPassword.length < 8}
                            onClick={() => handleGrantAccess(u.username, accessPassword)}
                            className="aio-button aio-button--outline"
                            style={{ color: ink, border: `1.5px solid ${vars.g200}` }}
                          >
                            Set password
                          </button>
                        </div>
                        <p className="aio-type-meta mt-2" style={{ color: vars.g500 }}>
                          Emailing sends the key contact a single-use set-password link (valid 7 days). Setting a password yourself means you share it with the client directly.
                        </p>
                        {accessError && <p className="aio-type-supporting mt-2" style={{ color: accent }}>{accessError}</p>}
                      </div>
                    )}
                    <div className="mt-3 sm:pl-[52px]">
                      <p className="aio-type-eyebrow mb-1.5" style={{ color: vars.g500 }}>Their projects ({owned.length})</p>
                       {isAgencyPartner && owned.length === 0 && (
                         <button
                           type="button"
                           onClick={() => void handleCreateClientProject(u)}
                           disabled={enteringUsername === u.username}
                           className="aio-button aio-button--outline aio-button--compact mb-2"
                           style={{ color: accent, borderColor: `${accent}60`, opacity: enteringUsername === u.username ? 0.7 : 1 }}
                         >
                           {enteringUsername === u.username
                             ? <Loader2 size={12} className="animate-spin" />
                             : <Plus size={12} />}
                           Create Project
                         </button>
                       )}
                       {isAgencyPartner && owned.length > 1 && (
                         <p role="status" className="aio-type-supporting mb-2" style={{ color: "#92400E" }}>
                           This client has historical projects above the current one-project limit. Existing hubs remain available, but no more can be added.
                         </p>
                       )}
                      {owned.length === 0 ? (
                        <p className="aio-type-supporting italic" style={{ color: vars.g400 }}>No projects yet.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {owned.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => isAgencyPartner && handleOpenClientProjects(u.username, p.id)}
                              disabled={!isAgencyPartner || enteringUsername === u.username}
                              className="aio-type-meta inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-opacity disabled:cursor-default"
                              style={{ background: accentSoft, color: accent, opacity: enteringUsername === u.username ? 0.7 : 1 }}
                              title={isAgencyPartner ? `Open ${p.name}` : undefined}
                            >
                              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[8px] font-bold text-white" style={{ background: p.color }}>{p.initials}</span>
                              {p.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {editingPw && (
                      <form onSubmit={handleSavePassword} className="mt-3 flex flex-wrap items-center gap-2 sm:pl-[52px]">
                        <input
                          type="text"
                          value={pwValue}
                          onChange={(e) => setPwValue(e.target.value)}
                          placeholder="New password (min 8 chars)"
                          className="aio-type-body flex-1 min-w-[200px] px-3 py-2 rounded-lg border focus:outline-none focus:ring-2"
                          style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
                        />
                        <button type="submit" className="aio-button aio-button--primary text-white" style={{ background: accent }}>Save</button>
                        {pwError && <span className="aio-type-supporting w-full" style={{ color: accent }}>{pwError}</span>}
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        )}

        {/* ARCHIVED ACCOUNTS */}
        {section === "archived" && (
          archivedSubAccounts.length === 0 ? (
            <div className="settings-card rounded-2xl p-6 sm:p-8 mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
              <h2 className="aio-type-section-title mb-1" style={{ color: ink }}>{isAgencyPartner ? "Archived Client Projects" : "Archived clients"}</h2>
              <p className="aio-type-supporting italic" style={{ color: vars.g500 }}>{isAgencyPartner ? "No archived Client Projects. When you archive a Client Project, it appears here and can be restored at any time." : "No archived client accounts. When you archive a client, they appear here and can be restored at any time."}</p>
            </div>
          ) : (
          <div className="rounded-2xl overflow-hidden mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
            <div className="px-6 py-4 border-b" style={{ borderColor: vars.g200 }}>
               <h2 className="aio-type-section-title" style={{ color: vars.g400 }}>{isAgencyPartner ? "Archived Client Projects" : "Archived clients"} ({archivedSubAccounts.length})</h2>
               <p className="aio-type-supporting mt-0.5" style={{ color: vars.g400 }}>
                 {isAgencyPartner ? "These Client Projects are archived. Their projects remain visible to you." : "These accounts cannot sign in. Their projects remain visible to you."}
               </p>
            </div>
            <ul className="divide-y" style={{ borderColor: vars.g200 }}>
              {archivedSubAccounts.map((u) => {
                const owned = manageable.filter((p) => (p.owner || "").toLowerCase() === u.username.toLowerCase());
                const logoSrc = clientLogoUrl(u.username);
                return (
                  <li key={u.username} className="px-6 py-4" style={{ background: vars.g100 + "40" }}>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-3 opacity-60">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden relative" style={{ background: vars.g200, color: vars.g400, border: `1px solid ${vars.g200}` }}>
                          <User size={16} />
                          <img
                            src={logoSrc}
                            alt={`${u.displayName ?? u.username} logo`}
                            loading="lazy"
                            decoding="async"
                            className="absolute inset-0 w-full h-full object-contain p-0.5"
                            style={{ filter: "grayscale(0.5) opacity(0.7)" }}
                            onError={(event) => { event.currentTarget.hidden = true; }}
                          />
                        </div>
                        <div>
                           <p className="aio-type-card-title" style={{ color: vars.g500 }}>{u.displayName ?? u.username}</p>
                          {u.displayName && (
                            <p className="aio-type-meta" style={{ color: vars.g400 }}>@{u.username}</p>
                          )}
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.16em]" style={{ background: vars.g200, color: vars.g400 }}>Archived</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleArchive(u.username, false)}
                          className="aio-button aio-button--outline aio-button--compact"
                        >
                          <ArchiveRestore size={12} /> Restore
                        </button>
                        <button
                          onClick={() => handleDelete(u.username)}
                          className="aio-button aio-button--destructive aio-button--compact"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </div>
                    {owned.length > 0 && (
                      <div className="mt-3 sm:pl-[52px]">
                         <p className="aio-type-eyebrow mb-1.5" style={{ color: vars.g400 }}>Their projects ({owned.length})</p>
                        <div className="flex flex-wrap gap-1.5">
                          {owned.map((p) => (
                             <span key={p.id} className="aio-type-meta inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full opacity-60" style={{ background: vars.g200, color: vars.g500 }}>
                              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[8px] font-bold text-white" style={{ background: p.color }}>{p.initials}</span>
                              {p.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          )
        )}

        {/* PROJECT ASSIGNMENT */}
        {section === "assign" && (
        <div className="rounded-2xl overflow-hidden" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
          <div className="px-6 py-4 border-b" style={{ borderColor: vars.g200 }}>
             <h2 className="aio-type-section-title" style={{ color: ink }}>Assign projects</h2>
             <p className="aio-type-supporting mt-1" style={{ color: vars.g500 }}>Review every active agency and client project before moving it. No project is matched to a client by name.</p>
            {(reconciliationLoading || reconciliationError) && (
            <div className="aio-type-supporting mt-3 rounded-xl px-4 py-3" style={{ background: vars.g100, border: `1px solid ${vars.g200}`, color: vars.g500 }}>
              {reconciliationLoading ? (
                <p className="flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Loading projects...</p>
              ) : reconciliationError ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold" style={{ color: accent }}>{reconciliationError}</p>
                  <button
                    type="button"
                    onClick={() => setReconciliationAttempt((attempt) => attempt + 1)}
                     className="aio-button aio-button--compact"
                    style={{ color: accent, border: `1px solid ${accent}40` }}
                  >
                    <RefreshCw size={11} /> Retry audit
                  </button>
                </div>
              ) : null}
            </div>
            )}
          </div>
          {manageable.length === 0 ? (
             <p className="aio-type-supporting px-6 py-6 italic" style={{ color: vars.g500 }}>No projects to assign yet.</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: vars.g200 }}>
              {manageable.map((p) => (
                <li key={p.id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[10px] font-bold text-white" style={{ background: p.color }}>{p.initials}</span>
                    <div>
                      <p className="aio-type-card-title" style={{ color: ink }}>{p.name}</p>
                      <p className="aio-type-meta" style={{ color: vars.g500 }}>Currently with: {ownerLabel(p.owner)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="aio-type-label uppercase tracking-[0.16em]" style={{ color: vars.g500 }}>Owner</label>
                    <select
                      value={(p.owner || "").toLowerCase() === session.username.toLowerCase() ? "__me__" : (p.owner || "")}
                      onChange={(e) => {
                        const val = e.target.value === "__me__" ? session.username : e.target.value;
                        void handleConfirmedProjectAssignment(p, val);
                      }}
                      disabled={assigningProjectId === p.id || !reconciliationReady || unrecoveredProjectIds.has(p.id)}
                      aria-label={`Owner for ${p.name}`}
                       className="aio-type-body px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 bg-white"
                      style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
                      title={unrecoveredProjectIds.has(p.id) ? "This browser-only project must be recovered before it can be assigned." : undefined}
                    >
                      <option value="__me__">You ({session.username})</option>
                      {subAccounts.map((u) => (
                        <option key={u.username} value={u.username}>{u.username}</option>
                      ))}
                    </select>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        )}
        </>)}
          </div>
        </div>
      </main>
    </div>
  );
}

/** Human-friendly "when did they last sign in" phrase, e.g. "2 hours ago". */
function formatLastSignIn(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "at an unknown time";
  const diffMs = Date.now() - then;
  if (diffMs < 60_000) return "moments ago";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return `on ${new Date(iso).toLocaleDateString()}`;
}

export { SubAccountsPage };
