import { useState, useMemo, useCallback, useEffect } from "react";
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
import { type Session as LocalSession, type SessionInfo, type User as LocalUser, type Role as LocalRole, getUsers as getLocalUsers, serverAddUser, serverDeleteUser, serverChangePassword, serverAssignOwner, serverSetDisplayName, serverArchiveUser, serverChangeRole, serverSetSeatCap, serverGetAccountSessions, serverRevokeSession, refreshAccountsCache, canCreateSubAccounts } from "../lib/auth";
import { roleLabel, accountLabel } from "../lib/accountLabels";
import { loadStoredProjects } from "../lib/projectStore";
import { apiBase } from "../lib/contentAi";
import { pushProjectMeta } from "../lib/projectSync";
import type { Client } from "../lib/projectTypes";
function UsersAdminPage({
  session,
  onBack,
  onAssignProjectOwner,
  onProjectCreated,
}: {
  session: LocalSession;
  onBack: () => void;
  onAssignProjectOwner: (id: string, owner: string) => void;
  onProjectCreated?: () => void;
}) {
  const paper = "#FBF6EC";
  const ink = "#102B36";
  const accent = "#C8497A";
  const accentSoft = "#FBE3ED";
  const green = vars.green;
  const [tick, setTick] = useState(0);
  const [users, setUsers] = useState<LocalUser[]>(() => getLocalUsers());

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
          totals[key].calls += row.callCount;
          totals[key].cost += parseFloat(row.totalCost ?? "0");
        }
        setTokenTotals(totals);
      })
      .catch(() => {});
  }, [session.role]);
  // Re-read projects on every tick so owner reassignments show immediately.
  const allProjects = useMemo(() => loadStoredProjects(), [tick]);
  const projectsByOwner = (username: string) =>
    allProjects.filter((p) => (p.owner || "").toLowerCase() === username.toLowerCase());
  // Order the flat account list as a tree so each client sits directly beneath
  // the agency it reports to (and agencies beneath the master), with a depth so
  // the list can indent nested accounts. Falls back to flat for any account
  // whose parent is missing, and a cycle guard makes sure every account shows.
  const orderedUsers = useMemo(() => {
    const childrenByParent = new Map<string, LocalUser[]>();
    for (const u of users) {
      const p = (u.parent || "").toLowerCase();
      const list = childrenByParent.get(p) || [];
      list.push(u);
      childrenByParent.set(p, list);
    }
    const known = new Set(users.map((u) => u.username.toLowerCase()));
    const out: { user: LocalUser; depth: number }[] = [];
    const seen = new Set<string>();
    const visit = (u: LocalUser, depth: number) => {
      const key = u.username.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ user: u, depth });
      for (const c of childrenByParent.get(key) || []) visit(c, depth + 1);
    };
    for (const u of users) {
      const p = (u.parent || "").toLowerCase();
      if (!p || !known.has(p)) visit(u, 0);
    }
    for (const u of users) if (!seen.has(u.username.toLowerCase())) visit(u, 0);
    return out;
  }, [users]);
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
    actorUsername: string;
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
      const result = await serverSetDisplayName(nameUser, nameValue);
      if (!result.ok) {
        setNameError(result.error);
        return;
      }
      setNameUser(null);
      setNameValue("");
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

  return (
    <div className="min-h-screen font-['Inter',sans-serif]" style={{ background: paper, color: ink }}>
      <header className="px-4 sm:px-10 py-4 sm:py-6 flex items-center justify-between" style={{ background: paper, borderBottom: `1px solid ${vars.g200}` }}>
        <button onClick={onBack} className="flex items-center gap-3.5">
          <img src={`${import.meta.env.BASE_URL}images/logo-color.png`} alt="AIO Fusion" className="h-16 sm:h-24" />
        </button>
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-5 sm:px-7 py-3 sm:py-3.5 text-[12px] sm:text-[13px] font-bold uppercase tracking-[0.14em] transition-all hover:opacity-80"
          style={{ background: ink, color: paper }}
        >
          <ArrowLeft size={16} /> Back to platform
        </button>
      </header>

      <div className="px-4 sm:px-10 py-10 sm:py-14 max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4" style={{ background: accentSoft, border: `1px solid ${accent}40` }}>
            <Users size={12} color={accent} />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>Admin · User Management</span>
          </div>
          <h1 className="text-3xl sm:text-4xl leading-[1.1]" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>
            Manage platform users
          </h1>
          <p className="text-[14px] font-light mt-3 max-w-2xl leading-[1.7]" style={{ color: vars.g600 }}>
            Create the accounts that run on the platform. An Agency can sign in and create their own client accounts. A Direct Client signs in to work on their own projects only. Use the controls below to set a friendly name and to move any project to the account that should own it.
          </p>
        </div>

        {/* GENERATE FROM URL */}
        <div className="rounded-2xl p-6 sm:p-8 mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
          <div className="flex items-start gap-3 mb-5">
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: accentSoft }}>
              <Globe size={16} color={accent} />
            </div>
            <div>
              <h2 className="text-[16px] font-bold" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Generate test project from URL</h2>
              <p className="text-[13px] font-light mt-0.5 leading-[1.6]" style={{ color: vars.g600 }}>
                Enter a company website and Claude will scrape the site, generate a fully-populated Project Set-Up, and save it as a new project ready for auditing.
              </p>
            </div>
          </div>
          <form onSubmit={handleGenerate} className="grid grid-cols-1 md:grid-cols-12 gap-3 md:items-end">
            <div className="md:col-span-6">
              <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Company website URL</label>
              <input
                type="text"
                value={genUrl}
                onChange={(e) => setGenUrl(e.target.value)}
                placeholder="e.g. ogilvy.com or https://ogilvy.com"
                disabled={genRunning}
                className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2 disabled:opacity-50"
                style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
              />
            </div>
            <div className="md:col-span-4">
              <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Company name <span className="font-normal normal-case tracking-normal" style={{ color: vars.g500 }}>(optional hint)</span></label>
              <input
                type="text"
                value={genCompany}
                onChange={(e) => setGenCompany(e.target.value)}
                placeholder="e.g. Ogilvy"
                disabled={genRunning}
                className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2 disabled:opacity-50"
                style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
              />
            </div>
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={genRunning || !genUrl.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-[12px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: accent }}
              >
                {genRunning ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {genRunning ? "Working..." : "Generate"}
              </button>
            </div>
          </form>

          {/* Progress */}
          {genRunning && genStep && (
            <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: accentSoft }}>
              <Loader2 size={14} color={accent} className="animate-spin shrink-0" />
              <span className="text-[13px] font-medium" style={{ color: accent }}>{genStep}</span>
            </div>
          )}

          {/* Error */}
          {genError && (
            <div className="mt-4 flex items-start gap-3 px-4 py-3 rounded-xl" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5" }}>
              <AlertTriangle size={14} color={vars.red} className="shrink-0 mt-0.5" />
              <span className="text-[13px] font-medium" style={{ color: vars.red }}>{genError}</span>
            </div>
          )}

          {/* Success */}
          {genResult && (
            <div className="mt-4 px-4 py-4 rounded-xl" style={{ background: "#F0FDF4", border: "1px solid #86EFAC" }}>
              <div className="flex items-start gap-3">
                <CheckCircle2 size={16} color={green} className="shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold" style={{ color: vars.navy }}>
                    Project created: {genResult.companyName}
                  </p>
                  <p className="text-[12px] mt-0.5" style={{ color: vars.g600 }}>
                    ID: {genResult.projectId} — go back to the platform and it will appear in your project list after a sync.
                  </p>
                </div>
                <button
                  onClick={() => { onBack(); }}
                  className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.12em] transition-all hover:opacity-80 text-white"
                  style={{ background: green }}
                >
                  <ArrowLeft size={12} /> Go to platform
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ADD ACCOUNT */}
        <div className="rounded-2xl p-6 sm:p-8 mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
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
                placeholder="min 4 characters"
                className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2"
                style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
              />
            </div>
            <div className="md:col-span-4">
              <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Account type</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as LocalRole)}
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

        {/* USERS LIST */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
          <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: vars.g200 }}>
            <h2 className="text-[16px] font-bold" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>All users ({users.length})</h2>
          </div>
          <ul className="divide-y" style={{ borderColor: vars.g200 }}>
            {orderedUsers.map(({ user: u, depth }) => {
              const isMe = u.username.toLowerCase() === session.username.toLowerCase();
              const editingPw = pwUser === u.username;
              const editingName = nameUser === u.username;
              const editingRole = roleUser === u.username;
              const editingSeatCap = seatCapUser === u.username;
              const viewingSessions = sessionsUser === u.username;
              const hasDisplayName = !!(u.displayName && u.displayName.trim());
              return (
                <li
                  key={u.username}
                  className="px-6 py-4"
                  style={
                    depth > 0
                      ? { paddingLeft: 24 + depth * 28, borderLeft: `3px solid ${accentSoft}`, background: "rgba(200,73,122,0.025)" }
                      : undefined
                  }
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: accentSoft, color: accent }}>
                        <User size={16} />
                      </div>
                      <div>
                        <p className="text-[14px] font-bold" style={{ color: ink }}>
                          {accountLabel(u)}
                          {isMe && <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: vars.g500 }}>(you)</span>}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.16em]" style={{ background: u.role === "admin" ? ink : accentSoft, color: u.role === "admin" ? paper : accent }}>
                            {roleLabel(u.role)}
                          </span>
                          {hasDisplayName && (
                            <span className="text-[11px] font-light" style={{ color: vars.g500 }}>login: {u.username}</span>
                          )}
                          {u.parent && (
                            <span className="text-[11px] font-light" style={{ color: vars.g500 }}>reports to: {u.parent}</span>
                          )}
                          {(() => {
                            const t = tokenTotals[u.username.toLowerCase()];
                            if (!t || t.calls === 0) return null;
                            return (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold" style={{ background: vars.g100, color: vars.g500, border: `1px solid ${vars.g200}` }}>
                                {t.calls.toLocaleString()} {t.calls === 1 ? "call" : "calls"} &middot; £{t.cost.toFixed(4)}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setNameUser(editingName ? null : u.username); setNameValue(u.displayName || ""); setNameError(null); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] transition-all hover:bg-black/5"
                        style={{ color: ink, border: `1.5px solid ${vars.g200}` }}
                      >
                        <FileEdit size={12} /> {editingName ? "Cancel" : "Name"}
                      </button>
                      <button
                        onClick={() => { setPwUser(editingPw ? null : u.username); setPwValue(""); setPwError(null); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] transition-all hover:bg-black/5"
                        style={{ color: ink, border: `1.5px solid ${vars.g200}` }}
                      >
                        <KeyRound size={12} /> {editingPw ? "Cancel" : "Change password"}
                      </button>
                      {!isMe && (
                        <button
                          onClick={() => { setRoleUser(editingRole ? null : u.username); setRoleValue((u.role as LocalRole) || "agency"); setRoleError(null); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] transition-all hover:bg-black/5"
                          style={{ color: ink, border: `1.5px solid ${vars.g200}` }}
                        >
                          <Shield size={12} /> {editingRole ? "Cancel" : "Change role"}
                        </button>
                      )}
                      {u.role !== "admin" && (
                        <button
                          onClick={() => { setSeatCapUser(editingSeatCap ? null : u.username); setSeatCapValue(""); setSeatCapError(null); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] transition-all hover:bg-black/5"
                          style={{ color: ink, border: `1.5px solid ${vars.g200}` }}
                        >
                          <Users size={12} /> {editingSeatCap ? "Cancel" : "Seat cap"}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          const opening = !viewingSessions;
                          setSessionsUser(opening ? u.username : null);
                          setAccountSessions(null);
                          setAccountSessionsError(null);
                          if (opening) loadAccountSessions(u.username);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] transition-all hover:bg-black/5"
                        style={{ color: ink, border: `1.5px solid ${vars.g200}` }}
                      >
                        <MonitorSmartphone size={12} /> {viewingSessions ? "Close" : "Sessions"}
                      </button>
                      <button
                        onClick={() => handleDelete(u.username)}
                        disabled={isMe}
                        title={isMe ? "You cannot delete your own account" : "Delete user"}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-black/5"
                        style={{ color: accent, border: `1.5px solid ${accent}40` }}
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </div>
                  {(() => {
                    const owned = projectsByOwner(u.username);
                    return (
                      <div className="mt-3 sm:pl-[52px]">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1.5" style={{ color: vars.g500 }}>
                          Projects ({owned.length})
                        </p>
                        {owned.length === 0 ? (
                          <p className="text-[12px] font-light italic" style={{ color: vars.g400 }}>No projects yet.</p>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {owned.map((p) => (
                              <div key={p.id} className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full" style={{ background: accentSoft, color: accent }}>
                                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[8px] font-bold text-white" style={{ background: p.color }}>{p.initials}</span>
                                  {p.name}
                                </span>
                                <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: vars.g400 }}>Owner</span>
                                <select
                                  value={(p.owner || "").toLowerCase()}
                                  onChange={(e) => handleAssign(p.id, e.target.value)}
                                  className="px-2.5 py-1.5 rounded-lg border text-[12px] bg-white focus:outline-none focus:ring-2"
                                  style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
                                >
                                  {users.map((o) => (
                                    <option key={o.username} value={o.username.toLowerCase()}>
                                      {accountLabel(o)} ({roleLabel(o.role)})
                                    </option>
                                  ))}
                                </select>
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
                        placeholder="New password (min 4 chars)"
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
                        <option value="admin">Master (Admin)</option>
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
                                  <th className="px-3 py-2 font-bold uppercase tracking-[0.12em] text-[10px]" style={{ color: vars.g500 }}>Started</th>
                                  <th className="px-3 py-2 font-bold uppercase tracking-[0.12em] text-[10px]" style={{ color: vars.g500 }}>Expires</th>
                                  <th className="px-3 py-2 font-bold uppercase tracking-[0.12em] text-[10px]" style={{ color: vars.g500 }}>IP</th>
                                  <th className="px-3 py-2 font-bold uppercase tracking-[0.12em] text-[10px]" style={{ color: vars.g500 }}></th>
                                </tr>
                              </thead>
                              <tbody>
                                {accountSessions.map((s, i) => (
                                  <tr key={s.sid} style={{ background: i % 2 === 0 ? "white" : vars.g100, borderBottom: `1px solid ${vars.g200}` }}>
                                    <td className="px-3 py-2 whitespace-nowrap font-mono" style={{ color: ink }}>
                                      {new Date(s.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                                      {" "}
                                      {new Date(s.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap font-mono text-[11px]" style={{ color: vars.g500 }}>
                                      {new Date(s.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap font-mono text-[11px]" style={{ color: vars.g500 }}>
                                      {s.ipHint ?? "—"}
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
                </li>
              );
            })}
          </ul>
        </div>

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
                      const target = ev.targetId ? `${ev.targetType ?? ""} ${ev.targetId}`.trim() : ev.targetType ?? "—";
                      const detail = ev.metadata ? Object.entries(ev.metadata).map(([k, v]) => `${k}: ${String(v)}`).join(" · ").slice(0, 120) : "";
                      return (
                        <tr key={ev.id} style={{ background: rowBg, borderBottom: `1px solid ${vars.g200}` }}>
                          <td className="px-4 py-2.5 whitespace-nowrap font-mono" style={{ color: vars.g600 }}>{timeStr}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap font-semibold" style={{ color: ink }}>{ev.actorUsername}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: vars.navy }}>{actionLabel}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap font-mono text-[11px]" style={{ color: vars.g500 }}>{target}</td>
                          <td className="px-4 py-2.5 max-w-xs truncate" style={{ color: vars.g500 }} title={detail || undefined}>{detail || "—"}</td>
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
    </div>
  );
}

export { UsersAdminPage };
