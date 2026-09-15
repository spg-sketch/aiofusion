import { useState, useMemo, useCallback, useEffect } from "react";
import {
  ChevronRight, Lock, Search, FileEdit, BarChart3, Archive, Send, LineChart, ArrowRight, Sparkles, Loader2,
  TrendingUp, FileText, FileCheck2, Target, Code2, HelpCircle, MessageSquareQuote, Bot, ShieldCheck,
  MessagesSquare, Download, AlertTriangle, CheckCircle2, XCircle, Info, Globe, Tag, User, ChevronDown,
  Plus, Minus, MessageSquare, BookOpen, Scroll, Award, Radio, Mic2, PenLine, ClipboardList, ArrowUpRight,
  Lightbulb, ClipboardPaste, Upload, Calendar, Check, Save, Circle, Zap, Mail, Shield, Eye, Building2,
  ArrowLeft, LogOut, Trash2, KeyRound, Users, Activity, Play, ChevronUp, Menu, X, LogIn,
  Link as LinkIcon, Image as ImageIcon, Repeat, TrendingDown, FolderOpen, List as ListIcon, Clock,
  Undo2, ArchiveRestore, RefreshCw, MonitorSmartphone, MoreVertical, ShieldOff,
} from "lucide-react";
import { vars } from "../marketing/vars";
import { TokenUsageSection } from "./TokenUsageSection";
import { BetaParticipantsSection } from "./BetaParticipantsSection";
import { UsersAdminDemoSection } from "./UsersAdminDemoSection";

import { type Session as LocalSession, type SessionInfo, type User as LocalUser, type Role as LocalRole, type PendingAccount, getUsers as getLocalUsers, serverAddUser, serverDeleteUser, serverChangePassword, serverResetMfa, serverResetStagingTestAccount, serverAssignOwner, serverSetDisplayName, serverArchiveUser, serverChangeRole, serverSetSeatCap, serverGetAccountSessions, serverRevokeSession, serverImpersonate, serverGetPendingAccounts, serverApproveAccount, serverRejectAccount, refreshAccountsCache, canCreateSubAccounts, serverSetMasterOwner, serverGetMasterOwners } from "../lib/auth";
import { roleLabel, accountLabel } from "../lib/accountLabels";
import { loadStoredProjects } from "../lib/projectStore";
import { apiBase } from "../lib/contentAi";
import { SubscriptionsAdminCard } from "../components/SubscriptionsAdminCard";
import { pushProjectMeta } from "../lib/projectSync";
import type { Client } from "../lib/projectTypes";
export function UsersAdminPage({
  session,
  onBack,
  onAssignProjectOwner,
  onProjectCreated,
  onSupportAdmin,
  onLeadsAdmin,
  onInsightsAdmin,
  initialSection,
  onSectionChange,
}: {
  session: LocalSession;
  onBack: () => void;
  onAssignProjectOwner: (id: string, owner: string) => Promise<{ ok: boolean; error?: string }>;
  onProjectCreated?: () => void;
  onSupportAdmin?: () => void;
  onLeadsAdmin?: () => void;
  onInsightsAdmin?: () => void;
  initialSection?: string;
  onSectionChange?: (section: string) => void;
}) {
  const paper = "#f8fafc";
  const ink = "#0a1628";
  const accent = "#C8497A";
  const accentSoft = "#FBE3ED";
  const green = vars.green;
  const [tick, setTick] = useState(0);
  const [users, setUsers] = useState<LocalUser[]>(() => getLocalUsers());
  const [stagingTestResetUsername, setStagingTestResetUsername] = useState<string | null>(null);
  const [supportOutstandingCount, setSupportOutstandingCount] = useState<number | null>(null);

  useEffect(() => {
    if (session.role !== "admin") return;
    void fetch(`${apiBase()}/api/platform/admin/staging-test-reset`, { credentials: "include" })
      .then((response) => response.ok ? response.json() : null)
      .then((data: { enabled?: boolean; username?: string } | null) => {
        setStagingTestResetUsername(
          data?.enabled === true && typeof data.username === "string" ? data.username : null,
        );
      })
      .catch(() => setStagingTestResetUsername(null));
  }, [session.role]);

  useEffect(() => {
    if (session.role !== "admin" || !onSupportAdmin) return;
    void fetch(`${apiBase()}/api/support/tickets?summary=outstanding`, { credentials: "include" })
      .then((response) => response.ok ? response.json() : null)
      .then((data: { outstandingCount?: number } | null) => {
        setSupportOutstandingCount(
          typeof data?.outstandingCount === "number" ? data.outstandingCount : null,
        );
      })
      .catch(() => setSupportOutstandingCount(null));
  }, [onSupportAdmin, session.role]);

  // ── Pending approvals ─────────────────────────────────────────────────────
  const [pendingAccounts, setPendingAccounts] = useState<PendingAccount[] | null>(null);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [approvingUser, setApprovingUser] = useState<string | null>(null);
  const [rejectingUser, setRejectingUser] = useState<string | null>(null);

  const loadPendingAccounts = () => {
    setPendingLoading(true);
    setPendingError(null);
    void serverGetPendingAccounts()
      .then((r) => {
        if (r.ok) setPendingAccounts(r.accounts);
        else setPendingError(r.error);
      })
      .finally(() => setPendingLoading(false));
  };

  useEffect(() => { if (session.role === "admin") loadPendingAccounts(); }, [session.role]);

  const handleApprove = (username: string) => {
    setApprovingUser(username);
    void serverApproveAccount(username)
      .then((r) => {
        if (!r.ok) { setPendingError(r.error); return; }
        setPendingAccounts((prev) => prev ? prev.filter((a) => a.username !== username) : prev);
        refresh();
      })
      .finally(() => setApprovingUser(null));
  };

  const handleReject = (username: string) => {
    if (!confirm(`Reject and permanently delete the application from '${username}'?`)) return;
    setRejectingUser(username);
    void serverRejectAccount(username)
      .then((r) => {
        if (!r.ok) { setPendingError(r.error); return; }
        setPendingAccounts((prev) => prev ? prev.filter((a) => a.username !== username) : prev);
      })
      .finally(() => setRejectingUser(null));
  };

  // Per-account token totals fetched once on mount (admin only).
  const [tokenTotals, setTokenTotals] = useState<Record<string, { calls: number; cost: number }>>({});
  useEffect(() => {
    if (session.role !== "admin") return;
    void fetch(`${apiBase()}/api/admin/token-usage`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { rows: { accountId: string; callCount: number; totalCost: string }[] }) => {
        const totals: Record<string, { calls: number; cost: number }> = {};
        for (const row of data.rows ?? []) {
          const key = row.accountId.toLowerCase();
          if (!totals[key]) totals[key] = { calls: 0, cost: 0 };
          totals[key].calls += Number(row.callCount);
          totals[key].cost += parseFloat(row.totalCost ?? "0");
        }
        setTokenTotals(totals);
      })
      .catch(() => {});
  }, [session.role]);

  // Audit locks keyed by projectId (admin only).
  const AUDIT_TYPE_LABELS: Record<string, string> = {
    website: "Website Visibility Audit",
    visibility: "GEO / LLM Check",
  };
  const [auditLocks, setAuditLocks] = useState<Record<string, { auditType: string; lastRunAt: string }[]>>({});
  const fetchAuditLocks = useCallback(() => {
    if (session.role !== "admin") return;
    void fetch(`${apiBase()}/api/admin/audit-locks`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { rows: { projectId: string; auditType: string; lastRunAt: string }[] }) => {
        const grouped: Record<string, { auditType: string; lastRunAt: string }[]> = {};
        for (const row of data.rows ?? []) {
          if (!grouped[row.projectId]) grouped[row.projectId] = [];
          grouped[row.projectId].push({ auditType: row.auditType, lastRunAt: row.lastRunAt });
        }
        setAuditLocks(grouped);
      })
      .catch(() => {});
  }, [session.role]);
  useEffect(() => { fetchAuditLocks(); }, [fetchAuditLocks]);

  const clearAuditLock = useCallback((projectId: string, auditType: string) => {
    void fetch(`${apiBase()}/api/admin/audit-lock`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ projectId, auditType }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => { fetchAuditLocks(); })
      .catch(() => {});
  }, [fetchAuditLocks]);
  // Re-read projects on every tick so owner reassignments show immediately.
  const allProjects = useMemo(() => loadStoredProjects(), [tick]);
  const projectsByOwner = (username: string) =>
    allProjects.filter((p) => (p.owner || "").toLowerCase() === username.toLowerCase());
  // Group accounts into a real parent-child tree (rather than a flat,
  // margin-indented list) so the master/agency/client hierarchy reads clearly:
  // each account's children render nested inside it, with a connecting rail.
  // A cycle guard and "unknown parent" fallback make sure every account still
  // shows even if its parent record is missing.
  const knownUsernames = useMemo(() => new Set(users.map((u) => u.username.toLowerCase())), [users]);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, LocalUser[]>();
    for (const u of users) {
      const p = (u.parent || "").toLowerCase();
      const list = map.get(p) || [];
      list.push(u);
      map.set(p, list);
    }
    return map;
  }, [users]);
  const topLevelUsers = useMemo(() => {
    const seen = new Set<string>();
    const out: LocalUser[] = [];
    for (const u of users) {
      const p = (u.parent || "").toLowerCase();
      if (!p || !knownUsernames.has(p)) {
        const key = u.username.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          out.push(u);
        }
      }
    }
    return out;
  }, [users, knownUsernames]);

  // ── 2FA filter + active/archived section split ────────────────────────────
  const [only2FAOff, setOnly2FAOff] = useState(false);
  const [accountSearch, setAccountSearch] = useState("");

  // Two section-scoped mfa filter sets - propagation never crosses the
  // archived/active boundary, so an archived parent is not surfaced because
  // of an active descendant that won't actually be rendered under it.
  //
  // mfaFilterPassingActive: non-archived accounts that pass (no mfaEnabled)
  //   or have a non-archived descendant that passes.
  const mfaFilterPassingActive = useMemo<Set<string> | null>(() => {
    if (!only2FAOff) return null;
    const passing = new Set<string>();
    for (const u of users) {
      if (!u.archived && !u.mfaEnabled) passing.add(u.username.toLowerCase());
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const u of users) {
        if (u.archived) continue;
        const key = u.username.toLowerCase();
        if (passing.has(key)) continue;
        const kids = childrenByParent.get(key) ?? [];
        if (kids.some((c) => !c.archived && passing.has(c.username.toLowerCase()))) {
          passing.add(key);
          changed = true;
        }
      }
    }
    return passing;
  }, [only2FAOff, users, childrenByParent]);

  // mfaFilterPassingArchived: archived accounts that pass or have an archived
  //   descendant that passes.
  const mfaFilterPassingArchived = useMemo<Set<string> | null>(() => {
    if (!only2FAOff) return null;
    const passing = new Set<string>();
    for (const u of users) {
      if (u.archived && !u.mfaEnabled) passing.add(u.username.toLowerCase());
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const u of users) {
        if (!u.archived) continue;
        const key = u.username.toLowerCase();
        if (passing.has(key)) continue;
        const kids = childrenByParent.get(key) ?? [];
        if (kids.some((c) => c.archived && passing.has(c.username.toLowerCase()))) {
          passing.add(key);
          changed = true;
        }
      }
    }
    return passing;
  }, [only2FAOff, users, childrenByParent]);

  // Active section roots: non-archived top-level users PLUS non-archived users
  // whose direct parent is archived (they'd otherwise be invisible - the
  // archived section skips non-archived children and they have no active path).
  const activeTopLevel = useMemo(() => {
    const topActive = topLevelUsers.filter((u) => !u.archived);
    const seen = new Set(topActive.map((u) => u.username.toLowerCase()));
    const orphans = users.filter((u) => {
      if (u.archived) return false;
      const parentKey = (u.parent ?? "").toLowerCase();
      if (!parentKey || !knownUsernames.has(parentKey)) return false;
      const parentUser = users.find((p) => p.username.toLowerCase() === parentKey);
      return parentUser && parentUser.archived; // parent archived → surface here
    });
    return [...topActive, ...orphans.filter((u) => !seen.has(u.username.toLowerCase()))];
  }, [topLevelUsers, users, knownUsernames]);

  // Archived section roots: archived top-level users PLUS archived users whose
  // direct parent is non-archived (mirror of the active-orphan rule above).
  const archivedTopLevel = useMemo(() => {
    const topArchived = topLevelUsers.filter((u) => u.archived);
    const seen = new Set(topArchived.map((u) => u.username.toLowerCase()));
    const orphans = users.filter((u) => {
      if (!u.archived) return false;
      const parentKey = (u.parent ?? "").toLowerCase();
      if (!parentKey || !knownUsernames.has(parentKey)) return false;
      const parentUser = users.find((p) => p.username.toLowerCase() === parentKey);
      return parentUser && !parentUser.archived; // parent active → surface here
    });
    return [...topArchived, ...orphans.filter((u) => !seen.has(u.username.toLowerCase()))];
  }, [topLevelUsers, users, knownUsernames]);

  const visibleActiveTopLevel = useMemo(
    () => (mfaFilterPassingActive !== null
      ? activeTopLevel.filter((u) => mfaFilterPassingActive.has(u.username.toLowerCase()))
      : activeTopLevel),
    [activeTopLevel, mfaFilterPassingActive],
  );
  const visibleArchivedTopLevel = useMemo(
    () => (mfaFilterPassingArchived !== null
      ? archivedTopLevel.filter((u) => mfaFilterPassingArchived.has(u.username.toLowerCase()))
      : archivedTopLevel),
    [archivedTopLevel, mfaFilterPassingArchived],
  );

  // Which accounts have their sub-account tree collapsed. Starts empty (every
  // account expanded), since admins usually need to see the whole hierarchy.
  const [collapsedAccounts, setCollapsedAccounts] = useState<Set<string>>(new Set());
  const toggleCollapse = (username: string) => {
    setCollapsedAccounts((prev) => {
      const next = new Set(prev);
      const key = username.toLowerCase();
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Master-owner flags (admin only) ──────────────────────────────────
  const [masterOwnerSet, setMasterOwnerSet] = useState<Set<string>>(new Set());
  const [masterOwnerTogglingFor, setMasterOwnerTogglingFor] = useState<string | null>(null);
  useEffect(() => {
    if (session.role !== "admin") return;
    void serverGetMasterOwners().then((r) => {
      if (r.ok) setMasterOwnerSet(new Set(r.usernames.map((u) => u.toLowerCase())));
    });
  }, [session.role]);

  const handleToggleMasterOwner = (username: string, current: boolean) => {
    setMasterOwnerTogglingFor(username);
    void serverSetMasterOwner(username, !current)
      .then((r) => {
        if (r.ok) {
          setMasterOwnerSet((prev) => {
            const next = new Set(prev);
            if (!current) next.add(username.toLowerCase());
            else next.delete(username.toLowerCase());
            return next;
          });
        }
      })
      .finally(() => setMasterOwnerTogglingFor(null));
  };

  // ── View account (support impersonation) ─────────────────────────────
  const [impersonatingUsername, setImpersonatingUsername] = useState<string | null>(null);
  const [impersonateError, setImpersonateError] = useState<string | null>(null);

  // ── Per-row "Manage" overflow menu + projects expand/collapse ─────────
  // Secondary actions (Name/Password/Role/Seat cap/Sessions/Delete) live
  // behind a single compact menu per account instead of a wrapping row of
  // pill buttons, so each row reads as one clean line at a glance.
  const [manageMenuUser, setManageMenuUser] = useState<string | null>(null);
  const PROJECTS_COLLAPSE_THRESHOLD = 3;
  const [expandedProjectsFor, setExpandedProjectsFor] = useState<Set<string>>(new Set());
  const toggleProjectsExpanded = (username: string) => {
    setExpandedProjectsFor((prev) => {
      const next = new Set(prev);
      const key = username.toLowerCase();
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const handleViewAccount = (username: string) => {
    setImpersonateError(null);
    setImpersonatingUsername(username);
    try {
      sessionStorage.setItem("aio:master-account-return", JSON.stringify({ section }));
      const ownedProjects = projectsByOwner(username);
      sessionStorage.setItem(
        "aio:open-client-projects",
        JSON.stringify({ projectId: ownedProjects.length === 1 ? ownedProjects[0]!.id : null }),
      );
    } catch {
      // Navigation still works if storage is unavailable.
    }
    void serverImpersonate(username)
      .then((result) => {
        if (!result.ok) {
          setImpersonateError(result.error);
          setImpersonatingUsername(null);
          return;
        }
        // App.tsx consumes aio:open-client-projects after the reload, skips the
        // viewed account's platform/login screen, and opens its sole project
        // directly (or its project hub when there is no unambiguous target).
        window.location.replace("/");
      })
      .catch(() => {
        setImpersonateError("Failed to view this account.");
        setImpersonatingUsername(null);
      });
  };
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newRole, setNewRole] = useState<LocalRole>("agency");
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [pwUser, setPwUser] = useState<string | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [nameUser, setNameUser] = useState<string | null>(null);
  const [nameValue, setNameValue] = useState("");
  const [websiteValue, setWebsiteValue] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [roleUser, setRoleUser] = useState<string | null>(null);
  const [roleValue, setRoleValue] = useState<LocalRole>("agency");
  const [roleError, setRoleError] = useState<string | null>(null);

  // ── Seat cap state ────────────────────────────────────────────────────
  const [seatCapUser, setSeatCapUser] = useState<string | null>(null);
  const [seatCapValue, setSeatCapValue] = useState<string>("");
  const [seatCapError, setSeatCapError] = useState<string | null>(null);

  const handleSaveSeatCap = (e: React.FormEvent) => {
    e.preventDefault();
    setSeatCapError(null);
    if (!seatCapUser) return;
    const parsed = seatCapValue.trim() === "" ? null : parseInt(seatCapValue.trim(), 10);
    if (seatCapValue.trim() !== "" && (isNaN(parsed as number) || (parsed as number) < 0)) {
      setSeatCapError("Must be a non-negative number or blank (no limit).");
      return;
    }
    void (async () => {
      const result = await serverSetSeatCap(seatCapUser, parsed);
      if (!result.ok) { setSeatCapError(result.error); return; }
      setSeatCapUser(null);
      setSeatCapValue("");
      refresh();
    })();
  };

  // ── Per-account sessions state ────────────────────────────────────────
  const [sessionsUser, setSessionsUser] = useState<string | null>(null);
  const [accountSessions, setAccountSessions] = useState<SessionInfo[] | null>(null);
  const [accountSessionsLoading, setAccountSessionsLoading] = useState(false);
  const [accountSessionsError, setAccountSessionsError] = useState<string | null>(null);
  const [revokingAccountSession, setRevokingAccountSession] = useState<string | null>(null);

  const loadAccountSessions = (username: string) => {
    setAccountSessionsLoading(true);
    setAccountSessionsError(null);
    void serverGetAccountSessions(username)
      .then((r) => {
        if (r.ok) setAccountSessions(r.sessions);
        else setAccountSessionsError(r.error);
      })
      .finally(() => setAccountSessionsLoading(false));
  };

  const handleRevokeAccountSession = (sid: string) => {
    if (!sessionsUser) return;
    setRevokingAccountSession(sid);
    void serverRevokeSession(sid, sessionsUser)
      .then((r) => {
        if (!r.ok) { setAccountSessionsError(r.error); return; }
        setAccountSessions((prev) => prev ? prev.filter((s) => s.sid !== sid) : prev);
      })
      .finally(() => setRevokingAccountSession(null));
  };

  // ── Generate-from-URL state ───────────────────────────────────────────
  const [genUrl, setGenUrl] = useState("");
  const [genCompany, setGenCompany] = useState("");
  const [genRunning, setGenRunning] = useState(false);
  const [genStep, setGenStep] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [genResult, setGenResult] = useState<{ projectId: string; companyName: string } | null>(null);

  // ── Audit log state ───────────────────────────────────────────────────────
  type AdminEvent = {
    id: number;
    actorId: string;
    actorUsername: string;
    actorName: string | null;
    actorEmail: string | null;
    action: string;
    targetId: string | null;
    targetType: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  };
  const [auditEvents, setAuditEvents] = useState<AdminEvent[] | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditActorFilter, setAuditActorFilter] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("");
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [auditExporting, setAuditExporting] = useState(false);

  type AssessmentOutcomeRow = {
    auditId: string;
    projectId: string;
    projectName: string;
    owner: string;
    savedAt: string;
    status: "complete" | "fallback" | "unknown";
    reasonCategory:
      | "scoring_unavailable"
      | "invalid_response"
      | "incomplete_response"
      | "scoring_error"
      | null;
    authorityIndex: number | null;
    grade: string | null;
    visibilityScore: number | null;
  };
  const [assessmentOutcomes, setAssessmentOutcomes] = useState<AssessmentOutcomeRow[] | null>(null);
  const [assessmentOutcomesLoading, setAssessmentOutcomesLoading] = useState(false);
  const [assessmentOutcomesError, setAssessmentOutcomesError] = useState<string | null>(null);
  const [assessmentProjectFilter, setAssessmentProjectFilter] = useState("");
  const [assessmentStatusFilter, setAssessmentStatusFilter] = useState("");

  const loadAssessmentOutcomes = () => {
    setAssessmentOutcomesLoading(true);
    setAssessmentOutcomesError(null);
    const params = new URLSearchParams();
    if (assessmentProjectFilter.trim()) params.set("projectId", assessmentProjectFilter.trim());
    if (assessmentStatusFilter) params.set("status", assessmentStatusFilter);
    const qs = params.toString() ? `?${params.toString()}` : "";
    void fetch(`${apiBase()}/api/admin/audit-outcomes${qs}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load assessment outcomes");
        const data = await r.json() as { outcomes: AssessmentOutcomeRow[] };
        setAssessmentOutcomes(data.outcomes ?? []);
      })
      .catch(() => setAssessmentOutcomesError("Could not load assessment outcomes. Please try again."))
      .finally(() => setAssessmentOutcomesLoading(false));
  };

  const ASSESSMENT_REASON_LABELS: Record<NonNullable<AssessmentOutcomeRow["reasonCategory"]>, string> = {
    scoring_unavailable: "Scoring unavailable",
    invalid_response: "Invalid scoring response",
    incomplete_response: "Incomplete scoring response",
    scoring_error: "Scoring service error",
  };

  const loadAuditEvents = () => {
    setAuditLoading(true);
    setAuditError(null);
    const params = new URLSearchParams();
    if (auditActorFilter.trim()) params.set("actor", auditActorFilter.trim());
    if (auditActionFilter.trim()) params.set("action", auditActionFilter.trim());
    if (auditFrom.trim()) params.set("from", auditFrom.trim());
    if (auditTo.trim()) params.set("to", auditTo.trim());
    const qs = params.toString() ? `?${params.toString()}` : "";
    void fetch(`${apiBase()}/api/platform/admin-events${qs}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load audit log");
        const data = await r.json() as { events: AdminEvent[] };
        setAuditEvents(data.events ?? []);
      })
      .catch(() => setAuditError("Could not load audit log. Please try again."))
      .finally(() => setAuditLoading(false));
  };

  const exportAuditCsv = async () => {
    setAuditExporting(true);
    try {
      const params = new URLSearchParams();
      if (auditActorFilter.trim()) params.set("actor", auditActorFilter.trim());
      if (auditActionFilter.trim()) params.set("action", auditActionFilter.trim());
      if (auditFrom.trim()) params.set("from", auditFrom.trim());
      if (auditTo.trim()) params.set("to", auditTo.trim());
      const qs = params.toString() ? `?${params.toString()}` : "";
      const r = await fetch(`${apiBase()}/api/platform/admin-events/export${qs}`, { credentials: "include" });
      if (!r.ok) throw new Error("Export failed");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setAuditError("Could not export audit log. Please try again.");
    } finally {
      setAuditExporting(false);
    }
  };

  const ACTION_LABELS: Record<string, string> = {
    forced_llm_audit: "Forced LLM audit",
    forced_website_audit: "Forced website audit",
    account_delete: "Deleted account",
    account_role_change: "Changed account role",
    project_owner_reassign: "Reassigned project owner",
    platform_migrate: "Ran platform migration",
    master_owner_set: "Set master-owner flag",
    switch_to_master: "Switched to master",
  };

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = genUrl.trim();
    if (!trimmedUrl) return;
    setGenRunning(true);
    setGenStep("Connecting...");
    setGenError(null);
    setGenResult(null);
    void (async () => {
      try {
        const resp = await fetch(`${apiBase()}/api/admin/generate-from-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: trimmedUrl, companyName: genCompany.trim() }),
        });
        const contentType = resp.headers.get("content-type") || "";
        if (!contentType.includes("text/event-stream")) {
          const data = await resp.json().catch(() => null) as Record<string, unknown> | null;
          throw new Error((data && typeof data.error === "string" ? data.error : null) || "Request failed. Please try again.");
        }
        if (!resp.body) throw new Error("Could not read response stream.");
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let sep: number;
          while ((sep = buffer.indexOf("\n\n")) !== -1) {
            const chunk = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            let event = "message";
            let dataStr = "";
            for (const line of chunk.split("\n")) {
              if (line.startsWith("event:")) event = line.slice(6).trim();
              else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
            }
            if (!dataStr) continue;
            let parsed: Record<string, unknown>;
            try { parsed = JSON.parse(dataStr) as Record<string, unknown>; } catch { continue; }
            if (event === "progress") {
              setGenStep(typeof parsed.message === "string" ? parsed.message : null);
            } else if (event === "result") {
              const projectId = typeof parsed.projectId === "string" ? parsed.projectId : "";
              const companyName = typeof parsed.companyName === "string" ? parsed.companyName : "Project";
              setGenResult({ projectId, companyName });
              setGenStep(null);
              onProjectCreated?.();
            } else if (event === "error") {
              throw new Error(typeof parsed.error === "string" ? parsed.error : "Something went wrong. Please try again.");
            }
          }
        }
      } catch (err) {
        setGenError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
        setGenStep(null);
      } finally {
        setGenRunning(false);
      }
    })();
  };

  const refresh = () => { setUsers(getLocalUsers()); setTick((t) => t + 1); };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setAddSuccess(null);
    void (async () => {
      const result = await serverAddUser(newUsername, newPassword, newRole, newDisplayName);
      if (result.ok) {
        setAddSuccess(`Created ${roleLabel(newRole)} account '${newDisplayName.trim() || newUsername.trim()}'.`);
        setNewUsername("");
        setNewPassword("");
        setNewDisplayName("");
        setNewRole("agency");
        refresh();
      } else {
        setAddError(result.error);
      }
    })();
  };

  const handleDelete = (username: string) => {
    if (!confirm(`Delete user '${username}'? This cannot be undone.`)) return;
    void (async () => {
      const result = await serverDeleteUser(username);
      if (!result.ok) {
        alert(result.error);
        return;
      }
      refresh();
    })();
  };

  // Clear a locked-out user's two-factor setup so they can sign in with just
  // their password and re-enrol. Destructive for their MFA state, so confirm.
  const handleResetMfa = (username: string) => {
    if (!confirm(`Reset two-factor login for '${username}'? They will be able to sign in with just their password and will need to set up two-factor again.`)) return;
    void (async () => {
      const result = await serverResetMfa(username);
      if (!result.ok) {
        alert(result.error);
        return;
      }
      alert(`Two-factor login has been reset for '${username}'.`);
      // Re-pull accounts from the server so the "2FA on" badge and the
      // reset menu item disappear immediately rather than on next page load.
      await refreshAccountsCache();
      refresh();
    })();
  };

  const handleResetStagingTestAccount = (username: string) => {
    if (!confirm(
      `Reset '${username}' to a brand-new account?\n\nThis permanently removes its projects, onboarding, billing, media and workspace data, and signs it out everywhere. Its email and password are preserved. This action only works on staging.`,
    )) return;
    void (async () => {
      const result = await serverResetStagingTestAccount(username);
      if (!result.ok) {
        alert(result.error);
        return;
      }
      alert(
        `'${username}' is ready for another signup test. Sign in with the same email and password to begin onboarding again.`,
      );
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

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    setNameError(null);
    if (!nameUser) return;
    void (async () => {
      const result = await serverSetDisplayName(nameUser, nameValue, websiteValue);
      if (!result.ok) {
        setNameError(result.error);
        return;
      }
      setNameUser(null);
      setNameValue("");
      setWebsiteValue("");
      refresh();
    })();
  };

  const handleSaveRole = (e: React.FormEvent) => {
    e.preventDefault();
    setRoleError(null);
    if (!roleUser) return;
    void (async () => {
      const result = await serverChangeRole(roleUser, roleValue);
      if (!result.ok) {
        setRoleError(result.error);
        return;
      }
      setRoleUser(null);
      refresh();
    })();
  };

  // Reassign a project to any account, then refresh so the new owner shows.
  const handleAssign = (id: string, owner: string) => {
    onAssignProjectOwner(id, owner);
    refresh();
  };

  // Renders one account card, plus (recursively) its sub-accounts nested
  // inside a bordered "rail" container, so the master/agency/client
  // hierarchy is expressed structurally instead of via margin indentation.
  function renderAccountNode(u: LocalUser, depth: number, sectionIsArchived: boolean): React.ReactElement {
    const isMe = u.username.toLowerCase() === session.username.toLowerCase();
    const editingPw = pwUser === u.username;
    const editingName = nameUser === u.username;
    const editingRole = roleUser === u.username;
    const editingSeatCap = seatCapUser === u.username;
    const viewingSessions = sessionsUser === u.username;
    const isMasterOwner = masterOwnerSet.has(u.username.toLowerCase());
    const isTogglingMasterOwner = masterOwnerTogglingFor === u.username;
    const hasDisplayName = !!(u.displayName && u.displayName.trim());
    // Filter children: only those whose own archived status matches the current
    // section, and only those that pass the section-scoped mfa filter.
    const sectionFilter = sectionIsArchived ? mfaFilterPassingArchived : mfaFilterPassingActive;
    const children = (childrenByParent.get(u.username.toLowerCase()) ?? []).filter((c) => {
      if (!!c.archived !== sectionIsArchived) return false;
      if (sectionFilter !== null && !sectionFilter.has(c.username.toLowerCase())) return false;
      return true;
    });
    const hasChildren = children.length > 0;
    const isCollapsed = collapsedAccounts.has(u.username.toLowerCase());
    return (
      <div key={u.username} className="flex flex-col gap-3">
        <div
          className="rounded-xl p-4 sm:p-5 transition-all"
          style={{ background: vars.g100 + "80", border: `1.5px solid ${vars.g200}` }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              {hasChildren ? (
                <button
                  onClick={() => toggleCollapse(u.username)}
                  title={isCollapsed ? "Expand sub-accounts" : "Collapse sub-accounts"}
                  className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-all hover:bg-black/5"
                  style={{ border: `1.5px solid ${vars.g200}`, color: vars.g500 }}
                >
                  {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                </button>
              ) : (
                <span className="w-6 shrink-0" />
              )}
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: u.role === "admin" ? ink : accentSoft, color: u.role === "admin" ? "white" : accent }}>
                <User size={18} />
              </div>
              <div>
                <p className="text-[15px] font-bold leading-tight" style={{ color: ink }}>
                  {accountLabel(u)}
                  {isMe && <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: vars.g500 }}>(you)</span>}
                  {hasChildren && (
                    <span className="ml-2 text-[10px] font-semibold" style={{ color: vars.g400 }}>
                      ({children.length} sub-account{children.length === 1 ? "" : "s"})
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-1">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.16em]" style={{ background: u.role === "admin" ? ink : accentSoft, color: u.role === "admin" ? paper : accent }}>
                    {roleLabel(u.role)}
                  </span>
                  {u.mfaEnabled && (
                    <span
                      title="Two-factor login is enabled on this account"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.16em]"
                      style={{ background: "#e6f4ea", color: "#1e7e46" }}
                    >
                      <ShieldCheck size={10} /> 2FA on
                    </span>
                  )}
                  <span className="text-[11px] font-light truncate" style={{ color: vars.g500 }}>
                    {[
                      hasDisplayName ? u.username : null,
                      u.parent ? `reports to ${u.parent}` : null,
                    ].filter(Boolean).join(" · ")}
                  </span>
                  {(() => {
                    const t = tokenTotals[u.username.toLowerCase()];
                    if (!t || t.calls === 0) return null;
                    return (
                      <span className="text-[10px] font-medium ml-auto sm:ml-0" style={{ color: vars.g400 }}>
                        {t.calls.toLocaleString()} {t.calls === 1 ? "call" : "calls"} &middot; £{t.cost.toFixed(4)}
                      </span>
                    );
                  })()}
                </div>
              </div>
            </div>
            <div className="relative flex items-center gap-1.5 shrink-0 flex-wrap">
              {session.role === "admin" && (u.role === "agency" || u.role === "user") && (
                <button
                  onClick={() => handleToggleMasterOwner(u.username, isMasterOwner)}
                  disabled={isTogglingMasterOwner}
                  title={isMasterOwner ? "Revoke master-owner access" : "Grant master-owner access"}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] transition-all disabled:opacity-40 hover:brightness-95"
                  style={isMasterOwner
                    ? { color: "white", background: "#0a1628", border: `1.5px solid #0a1628` }
                    : { color: vars.g500, background: "white", border: `1.5px solid ${vars.g200}` }
                  }
                >
                  {isTogglingMasterOwner ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
                  {isMasterOwner ? "Master owner" : "Master owner"}
                </button>
              )}
              {!isMe && (
                <button
                  onClick={() => handleViewAccount(u.username)}
                  disabled={impersonatingUsername === u.username}
                  title="View this account (support mode)"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] transition-all disabled:opacity-40 hover:brightness-110"
                  style={{ color: "white", background: accent, border: `1.5px solid ${accent}` }}
                >
                  {impersonatingUsername === u.username ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />} View account
                </button>
              )}
              <button
                onClick={() => setManageMenuUser(manageMenuUser === u.username ? null : u.username)}
                title="More actions"
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all hover:bg-black/5"
                style={{ border: `1.5px solid ${vars.g200}`, color: vars.g500 }}
              >
                <MoreVertical size={14} />
              </button>
              {manageMenuUser === u.username && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setManageMenuUser(null)} />
                  <div
                    className="absolute right-0 top-9 z-20 w-48 py-1.5 rounded-xl overflow-hidden"
                    style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 12px 32px -8px rgba(16,43,54,0.22)" }}
                  >
                    <button
                      onClick={() => {
                        setManageMenuUser(null);
                        setNameUser(u.username);
                        setNameValue(u.displayName || "");
                        setWebsiteValue(u.website || "");
                        setNameError(null);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[12px] font-medium text-left hover:bg-black/5"
                      style={{ color: ink }}
                    >
                      <FileEdit size={13} /> Edit profile
                    </button>
                    <button
                      onClick={() => { setManageMenuUser(null); setPwUser(u.username); setPwValue(""); setPwError(null); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[12px] font-medium text-left hover:bg-black/5"
                      style={{ color: ink }}
                    >
                      <KeyRound size={13} /> Reset password
                    </button>
                    {!isMe && u.mfaEnabled && (
                      <button
                        onClick={() => { setManageMenuUser(null); handleResetMfa(u.username); }}
                        title="Clear this account's two-factor login so they can sign in with just their password"
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[12px] font-medium text-left hover:bg-black/5"
                        style={{ color: ink }}
                      >
                        <ShieldOff size={13} /> Reset two-factor
                      </button>
                    )}
                    {!isMe && (
                      <button
                        onClick={() => { setManageMenuUser(null); setRoleUser(u.username); setRoleValue((u.role as LocalRole) || "agency"); setRoleError(null); }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[12px] font-medium text-left hover:bg-black/5"
                        style={{ color: ink }}
                      >
                        <Shield size={13} /> Change role
                      </button>
                    )}
                    {u.role !== "admin" && (
                      <button
                        onClick={() => { setManageMenuUser(null); setSeatCapUser(u.username); setSeatCapValue(""); setSeatCapError(null); }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[12px] font-medium text-left hover:bg-black/5"
                        style={{ color: ink }}
                      >
                        <Users size={13} /> Seat cap
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setManageMenuUser(null);
                        setSessionsUser(u.username);
                        setAccountSessions(null);
                        setAccountSessionsError(null);
                        loadAccountSessions(u.username);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[12px] font-medium text-left hover:bg-black/5"
                      style={{ color: ink }}
                    >
                      <MonitorSmartphone size={13} /> Sessions
                    </button>
                    <div className="my-1 border-t" style={{ borderColor: vars.g200 }} />
                    {stagingTestResetUsername === u.username && !isMe && u.role !== "admin" && !u.parent && (
                      <button
                        onClick={() => { setManageMenuUser(null); handleResetStagingTestAccount(u.username); }}
                        title="Staging only: preserve this login but clear its new-account journey"
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[12px] font-medium text-left hover:bg-black/5"
                        style={{ color: accent }}
                      >
                        <RefreshCw size={13} /> Reset signup test
                      </button>
                    )}
                    <button
                      onClick={() => { setManageMenuUser(null); handleDelete(u.username); }}
                      disabled={isMe}
                      title={isMe ? "You cannot delete your own account" : "Delete account"}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[12px] font-medium text-left hover:bg-black/5 disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ color: accent }}
                    >
                      <Trash2 size={13} /> Delete account
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          {(editingName || editingPw || editingRole || editingSeatCap || viewingSessions) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:pl-[52px]">
              {editingName && (
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] px-2 py-1 rounded-full" style={{ background: vars.g100, color: vars.g500 }}>
                  <FileEdit size={10} /> Editing name
                  <button onClick={() => setNameUser(null)} className="ml-1 hover:opacity-60"><X size={10} /></button>
                </span>
              )}
              {editingPw && (
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] px-2 py-1 rounded-full" style={{ background: vars.g100, color: vars.g500 }}>
                  <KeyRound size={10} /> Resetting password
                  <button onClick={() => setPwUser(null)} className="ml-1 hover:opacity-60"><X size={10} /></button>
                </span>
              )}
              {editingRole && (
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] px-2 py-1 rounded-full" style={{ background: vars.g100, color: vars.g500 }}>
                  <Shield size={10} /> Changing role
                  <button onClick={() => setRoleUser(null)} className="ml-1 hover:opacity-60"><X size={10} /></button>
                </span>
              )}
              {editingSeatCap && (
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] px-2 py-1 rounded-full" style={{ background: vars.g100, color: vars.g500 }}>
                  <Users size={10} /> Editing seat cap
                  <button onClick={() => setSeatCapUser(null)} className="ml-1 hover:opacity-60"><X size={10} /></button>
                </span>
              )}
              {viewingSessions && (
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] px-2 py-1 rounded-full" style={{ background: vars.g100, color: vars.g500 }}>
                  <MonitorSmartphone size={10} /> Viewing sessions
                  <button onClick={() => setSessionsUser(null)} className="ml-1 hover:opacity-60"><X size={10} /></button>
                </span>
              )}
            </div>
          )}
          {(() => {
            const owned = projectsByOwner(u.username);
            const isExpanded = expandedProjectsFor.has(u.username.toLowerCase());
            const shouldOfferCollapse = owned.length > PROJECTS_COLLAPSE_THRESHOLD;
            const visible = shouldOfferCollapse && !isExpanded ? owned.slice(0, PROJECTS_COLLAPSE_THRESHOLD) : owned;
            return (
              <div className="mt-3 sm:pl-[52px]">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: vars.g500 }}>
                    Projects ({owned.length})
                  </p>
                  {shouldOfferCollapse && (
                    <button
                      onClick={() => toggleProjectsExpanded(u.username)}
                      className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] hover:opacity-70"
                      style={{ color: accent }}
                    >
                      {isExpanded ? "Show fewer" : `Show all ${owned.length}`} {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </button>
                  )}
                </div>
                {owned.length === 0 ? (
                  <p className="text-[12px] font-light italic mt-1.5" style={{ color: vars.g400 }}>No projects yet.</p>
                ) : (
                  <div className="flex flex-col mt-1.5 rounded-lg overflow-hidden" style={{ border: `1px solid ${vars.g200}` }}>
                    {visible.map((p, i) => (
                      <div key={p.id} style={{ background: i % 2 === 0 ? "white" : vars.g100 + "60", borderTop: i > 0 ? `1px solid ${vars.g200}` : undefined }}>
                        <div className="flex flex-wrap items-center gap-2 px-2.5 py-1.5">
                          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[8px] font-bold text-white shrink-0" style={{ background: p.color }}>{p.initials}</span>
                          <span className="text-[12px] font-medium truncate" style={{ color: ink }}>{p.name}</span>
                          {isDemoProject(p) && (
                            <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em]" style={{ background: "#FFF4D8", color: "#9A5A00" }}>
                              Demo
                            </span>
                          )}
                          <select
                            value={(p.owner || "").toLowerCase()}
                            onChange={(e) => handleAssign(p.id, e.target.value)}
                            className="ml-auto px-2 py-1 rounded-md border text-[11px] bg-white focus:outline-none focus:ring-2"
                            style={{ borderColor: vars.g200, color: vars.g500, ["--tw-ring-color" as any]: accent }}
                          >
                            {users.map((o) => (
                              <option key={o.username} value={o.username.toLowerCase()}>
                                {accountLabel(o)} ({roleLabel(o.role)})
                              </option>
                            ))}
                          </select>
                        </div>
                        {(auditLocks[p.id] ?? []).map((lk) => (
                          <div key={lk.auditType} className="flex items-center gap-2 px-2.5 pb-1.5 -mt-0.5">
                            <Lock size={10} style={{ color: vars.g400 }} />
                            <span className="text-[10px]" style={{ color: vars.g500 }}>
                              {AUDIT_TYPE_LABELS[lk.auditType] ?? lk.auditType} locked
                              {" - "}{new Date(lk.lastRunAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                            </span>
                            <button
                              onClick={() => clearAuditLock(p.id, lk.auditType)}
                              className="text-[9px] font-semibold px-1.5 py-0.5 rounded border hover:opacity-80"
                              style={{ borderColor: vars.g300, color: vars.g500, background: "white" }}
                            >
                              Clear lock
                            </button>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
          {editingName && (
            <form onSubmit={handleSaveName} className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                placeholder="Display name (leave blank to clear)"
                className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border text-[13px] focus:outline-none focus:ring-2"
                style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
              />
              <input
                type="url"
                value={websiteValue}
                onChange={(e) => setWebsiteValue(e.target.value)}
                placeholder="Website (leave blank to clear)"
                className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border text-[13px] focus:outline-none focus:ring-2"
                style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] text-white"
                style={{ background: accent }}
              >
                Save
              </button>
              {nameError && <span className="text-[12px] font-semibold w-full" style={{ color: accent }}>{nameError}</span>}
            </form>
          )}
          {editingPw && (
            <form onSubmit={handleSavePassword} className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={pwValue}
                onChange={(e) => setPwValue(e.target.value)}
                placeholder="New password (min 8 chars)"
                className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border text-[13px] focus:outline-none focus:ring-2"
                style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] text-white"
                style={{ background: accent }}
              >
                Save
              </button>
              {pwError && <span className="text-[12px] font-semibold w-full" style={{ color: accent }}>{pwError}</span>}
            </form>
          )}
          {editingRole && (
            <form onSubmit={handleSaveRole} className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={roleValue}
                onChange={(e) => setRoleValue(e.target.value as LocalRole)}
                className="px-3 py-2 rounded-lg border text-[13px] bg-white focus:outline-none focus:ring-2"
                style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
              >
                <option value="agency">Agency</option>
                <option value="client">Direct Client</option>
              </select>
              <button
                type="submit"
                className="px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] text-white"
                style={{ background: accent }}
              >
                Save
              </button>
              {roleError && <span className="text-[12px] font-semibold w-full" style={{ color: accent }}>{roleError}</span>}
            </form>
          )}
          {editingSeatCap && (
            <form onSubmit={handleSaveSeatCap} className="mt-3 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={seatCapValue}
                  onChange={(e) => setSeatCapValue(e.target.value)}
                  placeholder="No limit (leave blank)"
                  className="w-44 px-3 py-2 rounded-lg border text-[13px] focus:outline-none focus:ring-2"
                  style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
                />
                <span className="text-[12px]" style={{ color: vars.g500 }}>max sub-accounts (blank = no limit)</span>
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] text-white"
                style={{ background: accent }}
              >
                Save
              </button>
              {seatCapError && <span className="text-[12px] font-semibold w-full" style={{ color: accent }}>{seatCapError}</span>}
            </form>
          )}
          {viewingSessions && (
            <div className="mt-3">
              {accountSessionsLoading && (
                <div className="flex items-center gap-2 text-[12px]" style={{ color: vars.g400 }}>
                  <Loader2 size={12} className="animate-spin" /> Loading sessions…
                </div>
              )}
              {accountSessionsError && (
                <p className="text-[12px] font-medium" style={{ color: vars.red }}>{accountSessionsError}</p>
              )}
              {!accountSessionsLoading && accountSessions !== null && (
                accountSessions.length === 0 ? (
                  <p className="text-[12px] font-light" style={{ color: vars.g400 }}>No active sessions.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border" style={{ borderColor: vars.g200 }}>
                    <table className="w-full text-left text-[12px]" style={{ borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: vars.g100, borderBottom: `1px solid ${vars.g200}` }}>
                          <th className="px-3 py-2 font-bold uppercase tracking-[0.12em] text-[10px]" style={{ color: vars.g500 }}>Human user</th>
                          <th className="px-3 py-2 font-bold uppercase tracking-[0.12em] text-[10px]" style={{ color: vars.g500 }}>Started</th>
                          <th className="px-3 py-2 font-bold uppercase tracking-[0.12em] text-[10px]" style={{ color: vars.g500 }}>Expires</th>
                          <th className="px-3 py-2 font-bold uppercase tracking-[0.12em] text-[10px]" style={{ color: vars.g500 }}>IP</th>
                          <th className="px-3 py-2 font-bold uppercase tracking-[0.12em] text-[10px]" style={{ color: vars.g500 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {accountSessions.map((s, i) => (
                          <tr key={s.sid} style={{ background: i % 2 === 0 ? "white" : vars.g100, borderBottom: `1px solid ${vars.g200}` }}>
                            <td className="px-3 py-2 max-w-[180px]" style={{ color: ink }}>
                              {s.userName || s.userEmail ? (
                                <div>
                                  {s.userName && <p className="text-[12px] font-semibold truncate">{s.userName}</p>}
                                  {s.userEmail && <p className="text-[10px] font-mono truncate" style={{ color: vars.g500 }}>{s.userEmail}</p>}
                                  {s.userId && <p className="text-[9px] font-mono truncate" style={{ color: vars.g400 }} title={s.userId}>{s.userId}</p>}
                                </div>
                              ) : (
                                <span className="text-[11px] font-light" style={{ color: vars.g400 }}>Legacy session</span>
                              )}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap font-mono" style={{ color: ink }}>
                              {new Date(s.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                              {" "}
                              {new Date(s.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap font-mono text-[11px]" style={{ color: vars.g500 }}>
                              {new Date(s.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap font-mono text-[11px]" style={{ color: vars.g500 }}>
                              {s.ipHint ?? "-"}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <button
                                onClick={() => handleRevokeAccountSession(s.sid)}
                                disabled={revokingAccountSession === s.sid}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.12em] transition-all hover:opacity-80 disabled:opacity-40"
                                style={{ color: accent, border: `1.5px solid ${accent}40` }}
                              >
                                {revokingAccountSession === s.sid ? <Loader2 size={10} className="animate-spin" /> : <X size={10} />}
                                Revoke
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>
          )}
        </div>
        {hasChildren && !isCollapsed && (
          <div className="ml-[22px] pl-4 border-l-2 flex flex-col gap-3" style={{ borderColor: accentSoft }}>
            {children.map((c) => renderAccountNode(c, depth + 1, sectionIsArchived))}
          </div>
        )}
      </div>
    );
  }


  type MasterSection = "masters" | "agencies" | "clients" | "archived" | "demo" | "beta" | "usage" | "audit";
  const navGroups = [
    {
      label: "Account Management",
      items: [
        { id: "masters" as const, label: "Master accounts", icon: Shield },
        { id: "agencies" as const, label: "Agency / Partner accounts", icon: Building2 },
        { id: "clients" as const, label: "Direct Client accounts", icon: User },
        { id: "archived" as const, label: "Archived accounts", icon: Archive },
      ],
    },
    {
      label: "Growth & Access",
      items: [
        { id: "demo" as const, label: "Create Demo Client", icon: Play },
        { id: "beta" as const, label: "Beta Participants", icon: Sparkles },
      ],
    },
    {
      label: "Platform Metrics",
      items: [
        { id: "usage" as const, label: "Token & AI Usage", icon: Activity },
        { id: "audit" as const, label: "System Audit", icon: Shield },
      ],
    },
  ];
  
  const allowedSections = navGroups.flatMap((g) => g.items.map((i) => i.id));
  const [section, setSection] = useState<MasterSection>(() =>
    initialSection && allowedSections.includes(initialSection as MasterSection)
      ? (initialSection as MasterSection)
      : "agencies"
  );

  useEffect(() => {
    if (initialSection && allowedSections.includes(initialSection as MasterSection)) {
      setSection(initialSection as MasterSection);
    }
  }, [initialSection]);
  
  const selectSection = (s: MasterSection) => {
    setSection(s);
    if (s === "agencies") setNewRole("agency");
    if (s === "clients") setNewRole("client");
    onSectionChange?.(s);
  };

  const accountMatchesSearch = useCallback((u: LocalUser, seen = new Set<string>()): boolean => {
    const key = u.username.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    const needle = accountSearch.trim().toLowerCase();
    if (!needle) return true;
    if (
      key.includes(needle) ||
      (u.displayName ?? "").toLowerCase().includes(needle)
    ) return true;
    return (childrenByParent.get(key) ?? []).some((child) => accountMatchesSearch(child, seen));
  }, [accountSearch, childrenByParent]);

  const filterAccountRoots = useCallback(
    (roots: LocalUser[]) => roots.filter((user) => accountMatchesSearch(user)),
    [accountMatchesSearch],
  );

  const renderAccountFilters = () => (
    <div className="flex flex-col sm:flex-row gap-3 rounded-2xl border bg-white p-4" style={{ borderColor: vars.g200 }}>
      <label className="relative flex-1">
        <span className="sr-only">Search accounts</span>
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" color={vars.g400} />
        <input
          value={accountSearch}
          onChange={(e) => setAccountSearch(e.target.value)}
          placeholder="Search name, username, email or website"
          className="w-full rounded-xl border py-2.5 pl-9 pr-3 text-[13px] outline-none focus:ring-2"
          style={{ borderColor: vars.g200, ["--tw-ring-color" as string]: accent }}
        />
      </label>
      <button
        type="button"
        onClick={() => setOnly2FAOff((value) => !value)}
        className="rounded-xl border px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em]"
        style={{
          borderColor: only2FAOff ? accent : vars.g200,
          background: only2FAOff ? accentSoft : "white",
          color: only2FAOff ? accent : vars.g600,
        }}
      >
        {only2FAOff ? "Without 2FA (on)" : "Only without 2FA"}
      </button>
    </div>
  );

  function isDemoProject(project: Client): boolean {
    return project.demo === true;
  }

  const agenciesUsers = filterAccountRoots(visibleActiveTopLevel.filter((u) => u.role === "agency"));
  const clientsUsers = filterAccountRoots(visibleActiveTopLevel.filter((u) => u.role === "client" || u.role === "user"));
  const masterUsers = filterAccountRoots(visibleActiveTopLevel.filter((u) => u.role === "admin"));

  return (
    <div className="min-h-screen flex flex-col font-['Inter',sans-serif]" style={{ background: paper, color: ink }}>
      <header className="px-4 sm:px-10 py-4 sm:py-6 flex items-center justify-between z-10 shrink-0" style={{ background: "white", borderBottom: `1px solid ${vars.g200}` }}>

        <button onClick={onBack} className="flex items-center gap-3.5">
          <img src={`${import.meta.env.BASE_URL}images/logo-navy.png`} alt="AIO Fusion" className="h-16 sm:h-24" onError={(e) => { (e.target as HTMLImageElement).src = `${import.meta.env.BASE_URL}images/logo-white.png`; }} />
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="aio-button aio-button--return"
            style={{ background: accent, color: "white" }}
          >
            <ArrowLeft size={16} /> Back to platform
          </button>
        </div>
      </header>

      <div className="flex-1 md:flex">
        {/* Sidebar */}
        <div className="hidden w-64 shrink-0 bg-white border-r md:block" style={{ borderColor: vars.g200 }}>
          <div className="py-6 px-4 space-y-8">
            {navGroups.map((group) => (
              <div key={group.label}>
                <h3 className="px-3 mb-2 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: vars.g500 }}>
                  {group.label}
                </h3>
                <nav className="space-y-1">
                  {group.items.map((item) => {
                    const isActive = section === item.id;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => selectSection(item.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-semibold transition-all ${
                          isActive ? 'bg-[#FBE3ED] text-[#C8497A]' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }`}
                      >
                        <Icon size={16} className={isActive ? 'text-[#C8497A]' : 'text-gray-400'} />
                        {item.label}
                      </button>
                    );
                  })}
                </nav>
              </div>
            ))}
            {(onInsightsAdmin || onLeadsAdmin || onSupportAdmin) && (
              <div>
                <h3 className="px-3 mb-2 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: vars.g500 }}>
                  Content &amp; Enquiries
                </h3>
                <nav className="space-y-1">
                  {onInsightsAdmin && (
                    <button
                      type="button"
                      onClick={onInsightsAdmin}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-semibold text-gray-600 transition-all hover:bg-gray-100 hover:text-gray-900"
                    >
                      <FileText size={16} className="text-gray-400" /> Insights
                    </button>
                  )}
                  {onLeadsAdmin && (
                    <button
                      type="button"
                      onClick={onLeadsAdmin}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-semibold text-gray-600 transition-all hover:bg-gray-100 hover:text-gray-900"
                    >
                      <Mail size={16} className="text-gray-400" /> Leads
                    </button>
                  )}
                  {onSupportAdmin && (
                    <button
                      type="button"
                      onClick={onSupportAdmin}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-[13px] font-semibold text-gray-600 transition-all hover:bg-gray-100 hover:text-gray-900"
                    >
                      <MessageSquare size={16} className="shrink-0 text-gray-400" />
                      <span>
                        {supportOutstandingCount === null
                          ? "Support"
                          : `Support (${supportOutstandingCount} ${supportOutstandingCount === 1 ? "ticket" : "tickets"} outstanding)`}
                      </span>
                    </button>
                  )}
                </nav>
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="min-w-0 flex-1 px-4 py-6 sm:px-10 sm:py-10">
          <div className="max-w-5xl mx-auto space-y-12">
            <label className="block md:hidden">
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: vars.g500 }}>
                Manage accounts
              </span>
              <select
                value={section}
                onChange={(e) => selectSection(e.target.value as MasterSection)}
                className="w-full rounded-xl border bg-white px-3 py-3 text-[13px] font-semibold"
                style={{ borderColor: vars.g200, color: ink }}
              >
                {navGroups.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.items.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {(onInsightsAdmin || onLeadsAdmin || onSupportAdmin) && (
              <div className="grid grid-cols-2 gap-2 md:hidden">
                {onInsightsAdmin && (
                  <button
                    type="button"
                    onClick={onInsightsAdmin}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border bg-white px-3 py-3 text-[12px] font-semibold"
                    style={{ borderColor: vars.g200, color: ink }}
                  >
                    <FileText size={15} /> Insights
                  </button>
                )}
                {onLeadsAdmin && (
                  <button
                    type="button"
                    onClick={onLeadsAdmin}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border bg-white px-3 py-3 text-[12px] font-semibold"
                    style={{ borderColor: vars.g200, color: ink }}
                  >
                    <Mail size={15} /> Leads
                  </button>
                )}
                {onSupportAdmin && (
                  <button
                    type="button"
                    onClick={onSupportAdmin}
                    className="col-span-2 flex items-center justify-center gap-2 rounded-xl border bg-white px-3 py-3 text-[12px] font-semibold"
                    style={{ borderColor: vars.g200, color: ink }}
                  >
                    <MessageSquare size={15} />
                    {supportOutstandingCount === null
                      ? "Support"
                      : `Support (${supportOutstandingCount} ${supportOutstandingCount === 1 ? "ticket" : "tickets"} outstanding)`}
                  </button>
                )}
              </div>
            )}
            
            {section === "demo" && <UsersAdminDemoSection onProjectCreated={() => { refresh(); onProjectCreated?.(); }} />}
            {section === "beta" && (
              <div className="space-y-8">
                <BetaParticipantsSection />
                <SubscriptionsAdminCard />
              </div>
            )}
            {section === "usage" && <TokenUsageSection onViewAccount={handleViewAccount} />}
            
            {section === "masters" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Master accounts</h2>
                  <p className="text-sm text-gray-500 mt-1">Manage active Master administrators and their account access.</p>
                </div>
                {renderAccountFilters()}
                <div className="flex flex-col gap-4">
                  {masterUsers.length === 0 && <p className="text-sm text-gray-500">No active Master accounts match these filters.</p>}
                  {masterUsers.map((user) => renderAccountNode(user, 0, false))}
                </div>
              </div>
            )}

            {section === "agencies" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Agency / Partner accounts</h2>
                  <p className="text-sm text-gray-500 mt-1">Manage active agency accounts and their sub-clients.</p>
                </div>
                {renderAccountFilters()}
                <div className="flex flex-col gap-4">
                  
              <div className="rounded-2xl p-6 sm:p-8 mb-6 bg-white border shadow-sm" style={{ borderColor: vars.g200 }}>
                <h2 className="text-[16px] font-bold mb-4" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Add a new account</h2>
                <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-12 gap-3 md:items-end">
                  <div className="md:col-span-6">
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Display name</label>
                    <input
                      type="text"
                      value={newDisplayName}
                      onChange={(e) => setNewDisplayName(e.target.value)}
                      placeholder="e.g. Acme Agency Ltd"
                      className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2"
                      style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
                    />
                  </div>
                  <div className="md:col-span-6">
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Username (login)</label>
                    <input
                      type="text"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="e.g. patrick"
                      className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2"
                      style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Password</label>
                    <input
                      type="text"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="min 8 characters"
                      className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2"
                      style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Account type</label>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as any)}
                      className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2 bg-white"
                      style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
                    >
                      <option value="agency">Agency</option>
                      <option value="client">Direct Client</option>
                    </select>
                  </div>
                  <div className="md:col-span-4">
                    <button
                      type="submit"
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-[12px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:opacity-90"
                      style={{ background: accent }}
                    >
                      <Plus size={14} /> Add
                    </button>
                  </div>
                  {addError && (
                    <p className="md:col-span-12 text-[12px] font-semibold" style={{ color: accent }}>{addError}</p>
                  )}
                  {addSuccess && (
                    <p className="md:col-span-12 text-[12px] font-semibold" style={{ color: vars.green }}>{addSuccess}</p>
                  )}
                </form>
              </div>

                  {agenciesUsers.length === 0 && <p className="text-sm text-gray-500">No active agency accounts.</p>}
                  {agenciesUsers.map(u => renderAccountNode(u, 0, false))}
                </div>
              </div>
            )}

            {section === "clients" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Direct Client accounts</h2>
                  <p className="text-sm text-gray-500 mt-1">Manage active direct clients and standalone users.</p>
                </div>
                {renderAccountFilters()}
                <div className="flex flex-col gap-4">
                  
              <div className="rounded-2xl p-6 sm:p-8 mb-6 bg-white border shadow-sm" style={{ borderColor: vars.g200 }}>
                <h2 className="text-[16px] font-bold mb-4" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Add a new account</h2>
                <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-12 gap-3 md:items-end">
                  <div className="md:col-span-6">
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Display name</label>
                    <input
                      type="text"
                      value={newDisplayName}
                      onChange={(e) => setNewDisplayName(e.target.value)}
                      placeholder="e.g. Acme Agency Ltd"
                      className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2"
                      style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
                    />
                  </div>
                  <div className="md:col-span-6">
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Username (login)</label>
                    <input
                      type="text"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="e.g. patrick"
                      className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2"
                      style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Password</label>
                    <input
                      type="text"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="min 8 characters"
                      className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2"
                      style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Account type</label>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as any)}
                      className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2 bg-white"
                      style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
                    >
                      <option value="agency">Agency</option>
                      <option value="client">Direct Client</option>
                    </select>
                  </div>
                  <div className="md:col-span-4">
                    <button
                      type="submit"
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-[12px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:opacity-90"
                      style={{ background: accent }}
                    >
                      <Plus size={14} /> Add
                    </button>
                  </div>
                  {addError && (
                    <p className="md:col-span-12 text-[12px] font-semibold" style={{ color: accent }}>{addError}</p>
                  )}
                  {addSuccess && (
                    <p className="md:col-span-12 text-[12px] font-semibold" style={{ color: vars.green }}>{addSuccess}</p>
                  )}
                </form>
              </div>

                  {clientsUsers.length === 0 && <p className="text-sm text-gray-500">No active direct client accounts.</p>}
                  {clientsUsers.map(u => renderAccountNode(u, 0, false))}
                </div>
              </div>
            )}

            {section === "archived" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Archived accounts</h2>
                  <p className="text-sm text-gray-500 mt-1">Suspended and archived accounts. They cannot sign in.</p>
                </div>
                {renderAccountFilters()}
                <div className="flex flex-col gap-4">
                  {filterAccountRoots(visibleArchivedTopLevel).length === 0 && <p className="text-sm text-gray-500">No archived accounts match these filters.</p>}
                  {filterAccountRoots(visibleArchivedTopLevel).map(u => renderAccountNode(u, 0, true))}
                </div>
              </div>
            )}

            {section === "audit" && (
              <div className="space-y-12">
                <div>
                  <h2 className="text-2xl font-bold" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>System Audit</h2>
                  <p className="text-sm text-gray-500 mt-1">Review system logs and backend assessment outcomes.</p>
                </div>

                <details className="rounded-2xl border bg-white p-5" style={{ borderColor: vars.g200 }}>
                  <summary className="cursor-pointer text-[13px] font-bold" style={{ color: ink }}>
                    Legacy pending-account recovery ({pendingAccounts?.length ?? 0})
                  </summary>
                  <p className="mt-2 text-[12px]" style={{ color: vars.g500 }}>
                    Compatibility access for older applications only. Normal sign-up no longer uses manual approval.
                  </p>
                  <div className="mt-4 space-y-3">
                    {pendingLoading && <p className="text-[12px]" style={{ color: vars.g500 }}>Loading pending accounts...</p>}
                    {pendingError && <p className="text-[12px] font-semibold" style={{ color: vars.red }}>{pendingError}</p>}
                    {!pendingLoading && pendingAccounts?.length === 0 && (
                      <p className="text-[12px]" style={{ color: vars.g500 }}>No legacy pending accounts.</p>
                    )}
                    {pendingAccounts?.map((account) => (
                      <div key={account.username} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: vars.g200 }}>
                        <div>
                          <p className="text-[13px] font-semibold" style={{ color: ink }}>{account.displayName || account.username}</p>
                          <p className="text-[11px]" style={{ color: vars.g500 }}>
                            {[account.username, account.email, account.website].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleApprove(account.username)}
                            disabled={approvingUser === account.username || rejectingUser === account.username}
                            className="rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white disabled:opacity-40"
                            style={{ background: green }}
                          >
                            {approvingUser === account.username ? "Approving..." : "Approve legacy account"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReject(account.username)}
                            disabled={approvingUser === account.username || rejectingUser === account.username}
                            className="rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] disabled:opacity-40"
                            style={{ borderColor: vars.red, color: vars.red }}
                          >
                            {rejectingUser === account.username ? "Rejecting..." : "Reject"}
                          </button>
                        </div>
                      </div>
                    ))}
                    <button type="button" onClick={loadPendingAccounts} className="text-[11px] font-semibold" style={{ color: accent }}>
                      Refresh legacy pending accounts
                    </button>
                  </div>
                </details>

        {/* AUTHORITY ASSESSMENT OUTCOMES */}
        {session.role === "admin" && (
          <div className="rounded-2xl p-6 sm:p-8 mt-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: "#FFFBEB" }}>
                  <BarChart3 size={16} color="#D97706" />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Authority assessment outcomes</h2>
                  <p className="text-[13px] font-light mt-0.5 leading-[1.6]" style={{ color: vars.g600 }}>
                    Safe status metadata for saved Earned Media reports. Raw probes, prompts and report narratives are not shown here.
                  </p>
                </div>
              </div>
              <button
                onClick={loadAssessmentOutcomes}
                disabled={assessmentOutcomesLoading}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] border transition-all hover:opacity-80 disabled:opacity-40"
                style={{ borderColor: vars.g200, color: vars.navy }}
              >
                {assessmentOutcomesLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Load / Refresh
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-3 mb-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.14em] block mb-1.5" style={{ color: vars.g500 }}>Project ID</label>
                <input
                  value={assessmentProjectFilter}
                  onChange={(e) => setAssessmentProjectFilter(e.target.value)}
                  placeholder="Optional exact project ID"
                  className="w-full px-3 py-2.5 rounded-lg border text-[13px] focus:outline-none focus:ring-2"
                  style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.14em] block mb-1.5" style={{ color: vars.g500 }}>Outcome</label>
                <select
                  value={assessmentStatusFilter}
                  onChange={(e) => setAssessmentStatusFilter(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border text-[13px] bg-white focus:outline-none focus:ring-2"
                  style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
                >
                  <option value="">All outcomes</option>
                  <option value="complete">Complete</option>
                  <option value="fallback">Fallback</option>
                  <option value="unknown">Legacy / unknown</option>
                </select>
              </div>
            </div>

            {assessmentOutcomesError && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg mb-4" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5" }}>
                <AlertTriangle size={14} color={vars.red} className="shrink-0 mt-0.5" />
                <p className="text-[12px] font-medium" style={{ color: vars.red }}>{assessmentOutcomesError}</p>
              </div>
            )}
            {assessmentOutcomesLoading && (
              <div className="flex items-center gap-2 text-[13px] py-4" style={{ color: vars.g500 }}>
                <Loader2 size={14} className="animate-spin" /> Loading assessment outcomes…
              </div>
            )}
            {!assessmentOutcomesLoading && assessmentOutcomes && assessmentOutcomes.length === 0 && (
              <p className="text-[13px] font-light italic py-4" style={{ color: vars.g400 }}>No saved audits match these filters.</p>
            )}
            {!assessmentOutcomesLoading && assessmentOutcomes && assessmentOutcomes.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${vars.g200}` }}>
                      {["Project", "Saved", "Outcome", "Fallback reason", "Authority", "Visibility"].map((heading) => (
                        <th key={heading} className="text-[10px] font-bold uppercase tracking-[0.08em] py-2 pr-4 whitespace-nowrap" style={{ color: vars.g500 }}>{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {assessmentOutcomes.map((row) => {
                      const statusColour = row.status === "complete" ? vars.green : row.status === "fallback" ? "#D97706" : vars.g400;
                      return (
                        <tr key={row.auditId} style={{ borderBottom: `1px solid ${vars.g100}` }}>
                          <td className="text-[12px] py-3 pr-4 align-top">
                            <strong style={{ color: vars.navy }}>{row.projectName}</strong>
                            <span className="block text-[10px] mt-0.5" style={{ color: vars.g400 }}>{row.projectId}</span>
                          </td>
                          <td className="text-[11px] py-3 pr-4 align-top whitespace-nowrap" style={{ color: vars.g500 }}>
                            {new Date(row.savedAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="text-[11px] font-semibold py-3 pr-4 align-top capitalize" style={{ color: statusColour }}>{row.status === "unknown" ? "Legacy / unknown" : row.status}</td>
                          <td className="text-[11px] py-3 pr-4 align-top" style={{ color: vars.g500 }}>
                            {row.reasonCategory ? ASSESSMENT_REASON_LABELS[row.reasonCategory] : "-"}
                          </td>
                          <td className="text-[11px] py-3 pr-4 align-top whitespace-nowrap" style={{ color: vars.g600 }}>
                            {row.authorityIndex === null ? "-" : `${row.authorityIndex}${row.grade ? ` (${row.grade})` : ""}`}
                          </td>
                          <td className="text-[11px] py-3 align-top" style={{ color: vars.g600 }}>{row.visibilityScore ?? "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* AUDIT LOG */}
        <div className="rounded-2xl p-6 sm:p-8 mt-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: "#F0F4FF" }}>
                <Shield size={16} color="#1f748f" />
              </div>
              <div>
                <h2 className="text-[16px] font-bold" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Audit log</h2>
                <p className="text-[13px] font-light mt-0.5 leading-[1.6]" style={{ color: vars.g600 }}>
                  Read-only record of privileged admin actions. Up to 500 events, newest first.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => { void exportAuditCsv(); }}
                disabled={auditExporting}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] border transition-all hover:opacity-80 disabled:opacity-40"
                style={{ borderColor: vars.g200, color: vars.g600 }}
                title="Export matching events as CSV"
              >
                {auditExporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                Export CSV
              </button>
              <button
                onClick={loadAuditEvents}
                disabled={auditLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] border transition-all hover:opacity-80 disabled:opacity-40"
                style={{ borderColor: vars.g200, color: vars.navy }}
              >
                {auditLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                {auditEvents === null ? "Load" : "Refresh"}
              </button>
            </div>
          </div>

          {/* Filter bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <input
              type="text"
              placeholder="Filter actor…"
              value={auditActorFilter}
              onChange={e => setAuditActorFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border text-[12px] outline-none focus:ring-1"
              style={{ borderColor: vars.g200, color: ink, background: vars.g100 }}
            />
            <input
              type="text"
              placeholder="Filter action…"
              value={auditActionFilter}
              onChange={e => setAuditActionFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border text-[12px] outline-none focus:ring-1"
              style={{ borderColor: vars.g200, color: ink, background: vars.g100 }}
            />
            <input
              type="date"
              value={auditFrom}
              onChange={e => setAuditFrom(e.target.value)}
              className="px-3 py-1.5 rounded-lg border text-[12px] outline-none focus:ring-1"
              style={{ borderColor: vars.g200, color: auditFrom ? ink : vars.g400, background: vars.g100 }}
              title="From date"
            />
            <input
              type="date"
              value={auditTo}
              onChange={e => setAuditTo(e.target.value)}
              className="px-3 py-1.5 rounded-lg border text-[12px] outline-none focus:ring-1"
              style={{ borderColor: vars.g200, color: auditTo ? ink : vars.g400, background: vars.g100 }}
              title="To date"
            />
          </div>
          {/* Quick search across loaded results */}
          {auditEvents !== null && auditEvents.length > 0 && (
            <div className="relative mb-4">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" color={vars.g400} />
              <input
                type="text"
                placeholder="Search actor, action, target, detail…"
                value={auditSearch}
                onChange={e => setAuditSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border text-[12px] outline-none focus:ring-1"
                style={{ borderColor: vars.g200, color: ink, background: vars.g100 }}
              />
            </div>
          )}

          {auditError && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl mb-4" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5" }}>
              <AlertTriangle size={13} color={vars.red} />
              <span className="text-[12px] font-medium" style={{ color: vars.red }}>{auditError}</span>
            </div>
          )}

          {auditEvents === null && !auditLoading && !auditError && (
            <p className="text-[13px] font-light text-center py-6" style={{ color: vars.g400 }}>Set filters above then click Load, or Load to fetch all recent events.</p>
          )}

          {auditEvents !== null && (() => {
            const needle = auditSearch.trim().toLowerCase();
            const filtered = needle
              ? auditEvents.filter(ev => {
                  const target = ev.targetId ? `${ev.targetType ?? ""} ${ev.targetId}`.trim() : ev.targetType ?? "";
                  const detail = ev.metadata ? Object.entries(ev.metadata).map(([k, v]) => `${k}: ${String(v)}`).join(" ") : "";
                  return (
                    ev.actorUsername.toLowerCase().includes(needle) ||
                    (ev.actorName?.toLowerCase() ?? "").includes(needle) ||
                    (ev.actorEmail?.toLowerCase() ?? "").includes(needle) ||
                    ev.action.toLowerCase().includes(needle) ||
                    target.toLowerCase().includes(needle) ||
                    detail.toLowerCase().includes(needle)
                  );
                })
              : auditEvents;

            if (filtered.length === 0) {
              return <p className="text-[13px] font-light text-center py-6" style={{ color: vars.g400 }}>No events match your filters.</p>;
            }
            return (
              <div className="overflow-x-auto rounded-xl border" style={{ borderColor: vars.g200 }}>
                <table className="w-full text-left text-[12px]" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: vars.g100, borderBottom: `1px solid ${vars.g200}` }}>
                      <th className="px-4 py-2.5 font-bold uppercase tracking-[0.14em] text-[10px]" style={{ color: vars.g500 }}>Time</th>
                      <th className="px-4 py-2.5 font-bold uppercase tracking-[0.14em] text-[10px]" style={{ color: vars.g500 }}>Actor</th>
                      <th className="px-4 py-2.5 font-bold uppercase tracking-[0.14em] text-[10px]" style={{ color: vars.g500 }}>Action</th>
                      <th className="px-4 py-2.5 font-bold uppercase tracking-[0.14em] text-[10px]" style={{ color: vars.g500 }}>Target</th>
                      <th className="px-4 py-2.5 font-bold uppercase tracking-[0.14em] text-[10px]" style={{ color: vars.g500 }}>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((ev, i) => {
                      const rowBg = i % 2 === 0 ? "white" : vars.g100;
                      const ts = new Date(ev.createdAt);
                      const timeStr = ts.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) + " " + ts.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
                      const actionLabel = ACTION_LABELS[ev.action] ?? ev.action;
                      const target = ev.targetId ? `${ev.targetType ?? ""} ${ev.targetId}`.trim() : ev.targetType ?? "-";
                      const detail = ev.metadata ? Object.entries(ev.metadata).map(([k, v]) => `${k}: ${String(v)}`).join(" · ").slice(0, 120) : "";
                      return (
                        <tr key={ev.id} style={{ background: rowBg, borderBottom: `1px solid ${vars.g200}` }}>
                          <td className="px-4 py-2.5 whitespace-nowrap font-mono" style={{ color: vars.g600 }}>{timeStr}</td>
                          <td className="px-4 py-2.5 max-w-[180px]" style={{ color: ink }}>
                            <p className="font-semibold truncate">{ev.actorUsername}</p>
                            {(ev.actorName || ev.actorEmail) && (
                              <p className="text-[10px] font-mono truncate mt-0.5" style={{ color: vars.g400 }}>
                                {[ev.actorName, ev.actorEmail].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: vars.navy }}>{actionLabel}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap font-mono text-[11px]" style={{ color: vars.g500 }}>{target}</td>
                          <td className="px-4 py-2.5 max-w-xs truncate" style={{ color: vars.g500 }} title={detail || undefined}>{detail || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {needle && (
                  <p className="px-4 py-2 text-[11px]" style={{ color: vars.g400, borderTop: `1px solid ${vars.g200}` }}>
                    Showing {filtered.length} of {auditEvents.length} loaded events
                  </p>
                )}
              </div>
            );
          })()}
        </div>
              </div>
            )}
            
          </div>
        </div>
      </div>
    </div>
  );
}
