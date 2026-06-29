import { useState, useMemo } from "react";
import {
  ArrowLeft, Users, Globe, Sparkles, Loader2, Plus, User, FileEdit,
  KeyRound, Shield, MonitorSmartphone, Trash2, AlertTriangle, CheckCircle2,
  RefreshCw, Download, Search, X,
} from "lucide-react";
import { vars } from "../marketing/vars";
import {
  type Session as LocalSession,
  type User as LocalUser,
  serverAddUser,
  serverDeleteUser,
  serverChangePassword,
  serverSetDisplayName,
  serverChangeRole,
  serverSetSeatCap,
  serverGetAccountSessions,
  serverRevokeSession,
  getUsers as getLocalUsers,
  refreshAccountsCache,
  type SessionInfo,
} from "../lib/auth";
import { loadStoredProjects } from "../lib/projects";
import { apiBase } from "../lib/apiHelpers";
import { roleLabel, accountLabel } from "../components/SharedUI";

type AuditEvent = {
  id: number;
  actor: string;
  action: string;
  target: string | null;
  meta: string | null;
  createdAt: string;
};

export function UsersAdminPage({
  onBack,
  session,
  onAssignProjectOwner,
  onProjectCreated,
}: {
  onBack: () => void;
  session: LocalSession;
  onAssignProjectOwner: (id: string, owner: string) => void;
  onProjectCreated?: () => void;
}) {
  const ink = "#102B36";
  const accent = "#C8497A";
  const accentSoft = "#FBE3ED";
  const teal = "#1f748f";

  const [users, setUsers] = useState<LocalUser[]>(() => getLocalUsers());
  const refresh = () => {
    void refreshAccountsCache().then(() => {
      setUsers(getLocalUsers());
      onProjectCreated?.();
    });
  };

  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [addingUser, setAddingUser] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "agency" | "client">("client");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const [changePwUser, setChangePwUser] = useState<string | null>(null);
  const [changePwValue, setChangePwValue] = useState("");
  const [changePwLoading, setChangePwLoading] = useState(false);
  const [changePwError, setChangePwError] = useState<string | null>(null);
  const [changePwOk, setChangePwOk] = useState<string | null>(null);
  const [editingDisplayName, setEditingDisplayName] = useState<string | null>(null);
  const [displayNameValue, setDisplayNameValue] = useState("");
  const [displayNameLoading, setDisplayNameLoading] = useState(false);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editingRoleValue, setEditingRoleValue] = useState<"admin" | "agency" | "client">("client");
  const [editingRoleLoading, setEditingRoleLoading] = useState(false);
  const [editingSeatCap, setEditingSeatCap] = useState<string | null>(null);
  const [seatCapValue, setSeatCapValue] = useState<string>("");
  const [seatCapLoading, setSeatCapLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [loadingAccountSessions, setLoadingAccountSessions] = useState<string | null>(null);
  const [accountSessions, setAccountSessions] = useState<Record<string, SessionInfo[]>>({});
  const [revokingAccountSession, setRevokingAccountSession] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [auditEvents, setAuditEvents] = useState<AuditEvent[] | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditActorFilter, setAuditActorFilter] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("");
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [auditExporting, setAuditExporting] = useState(false);

  const projects = useMemo(() => loadStoredProjects(), []);

  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase();
    return users.filter((u) => !q || u.username.toLowerCase().includes(q) || (u.displayName || "").toLowerCase().includes(q) || (u.role || "").toLowerCase().includes(q));
  }, [users, userSearch]);

  const handleAdd = async () => {
    if (!newUsername.trim() || !newPassword.trim()) return;
    setAddLoading(true); setAddError(null);
    const r = await serverAddUser(newUsername.trim(), newPassword, newRole, newDisplayName.trim() || undefined);
    if (r.ok) {
      setNewUsername(""); setNewPassword(""); setNewDisplayName(""); setAddingUser(false);
      refresh();
    } else {
      setAddError(r.error);
    }
    setAddLoading(false);
  };

  const handleDelete = async (username: string) => {
    setDeleteLoading(true);
    const r = await serverDeleteUser(username);
    if (r.ok) { setDeleteConfirm(null); refresh(); }
    setDeleteLoading(false);
  };

  const handleChangePw = async () => {
    if (!changePwUser || !changePwValue.trim()) return;
    setChangePwLoading(true); setChangePwError(null); setChangePwOk(null);
    const r = await serverChangePassword(changePwUser, changePwValue.trim());
    if (r.ok) { setChangePwOk(changePwUser); setChangePwValue(""); setChangePwUser(null); }
    else { setChangePwError(r.error); }
    setChangePwLoading(false);
  };

  const handleSetDisplayName = async (username: string) => {
    setDisplayNameLoading(true);
    const r = await serverSetDisplayName(username, displayNameValue.trim());
    if (r.ok) { setEditingDisplayName(null); setDisplayNameValue(""); refresh(); }
    setDisplayNameLoading(false);
  };

  const handleSetRole = async (username: string) => {
    setEditingRoleLoading(true);
    const r = await serverChangeRole(username, editingRoleValue);
    if (r.ok) { setEditingRole(null); refresh(); }
    setEditingRoleLoading(false);
  };

  const handleSetSeatCap = async (username: string) => {
    setSeatCapLoading(true);
    const val = seatCapValue.trim() === "" ? null : parseInt(seatCapValue, 10);
    const r = await serverSetSeatCap(username, val);
    if (r.ok) { setEditingSeatCap(null); setSeatCapValue(""); refresh(); }
    setSeatCapLoading(false);
  };

  const handleLoadAccountSessions = async (username: string) => {
    setLoadingAccountSessions(username);
    const r = await serverGetAccountSessions(username);
    if (r.ok) setAccountSessions((prev) => ({ ...prev, [username]: r.sessions }));
    setLoadingAccountSessions(null);
  };

  const handleRevokeAccountSession = async (sid: string) => {
    setRevokingAccountSession(sid);
    const r = await serverRevokeSession(sid);
    if (r.ok) {
      setAccountSessions((prev) => {
        const next: Record<string, SessionInfo[]> = {};
        for (const [k, v] of Object.entries(prev)) next[k] = v.filter((s) => s.sid !== sid);
        return next;
      });
    }
    setRevokingAccountSession(null);
  };

  const loadAuditEvents = async () => {
    setAuditLoading(true);
    try {
      const r = await fetch(`${apiBase()}/api/platform/audit-log`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); setAuditEvents(d.events ?? []); }
    } catch {}
    setAuditLoading(false);
  };

  const filteredAuditEvents = useMemo(() => {
    if (!auditEvents) return [];
    return auditEvents.filter((e) => {
      if (auditActorFilter && !e.actor.toLowerCase().includes(auditActorFilter.toLowerCase())) return false;
      if (auditActionFilter && !e.action.toLowerCase().includes(auditActionFilter.toLowerCase())) return false;
      if (auditFrom) { const d = new Date(e.createdAt); if (d < new Date(auditFrom)) return false; }
      if (auditTo) { const d = new Date(e.createdAt); if (d > new Date(auditTo + "T23:59:59")) return false; }
      return true;
    });
  }, [auditEvents, auditActorFilter, auditActionFilter, auditFrom, auditTo]);

  const exportAuditCsv = async () => {
    if (!auditEvents) return;
    setAuditExporting(true);
    const rows = filteredAuditEvents.map((e) =>
      [e.createdAt, e.actor, e.action, e.target ?? "", e.meta ?? ""].map((c) => `"${c.replace(/"/g, '""')}"`).join(",")
    );
    const csv = ["Timestamp,Actor,Action,Target,Meta", ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "audit-log.csv"; a.click();
    URL.revokeObjectURL(url);
    setAuditExporting(false);
  };

  return (
    <div className="min-h-screen font-['Inter',sans-serif]" style={{ background: vars.g50 }}>
      <header className="border-b px-4 sm:px-10 py-4 sm:py-6 flex items-center justify-between sticky top-0 z-10" style={{ background: "white", borderColor: vars.g200 }}>
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] hover:opacity-70 transition-opacity" style={{ color: vars.g500 }}>
            <ArrowLeft size={15} /> Back
          </button>
          <div className="h-5 w-px" style={{ background: vars.g200 }} />
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#F0F4FF", color: teal }}>
              <Globe size={15} />
            </div>
            <div>
              <h1 className="text-[16px] font-bold leading-none" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Platform Administration</h1>
              <p className="text-[11px] font-light mt-0.5" style={{ color: vars.g500 }}>Manage all platform accounts</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => { setAddingUser(true); setAddError(null); }}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:opacity-90"
            style={{ background: teal }}
          >
            <Plus size={13} /> Add Account
          </button>
        </div>
      </header>

      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-4xl mx-auto space-y-6">

        {/* ADD ACCOUNT */}
        {addingUser && (
          <div className="rounded-2xl p-6 sm:p-8" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
            <div className="flex items-start gap-3 mb-5">
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: "#F0F4FF" }}>
                <Plus size={16} color={teal} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[16px] font-bold" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>New account</h2>
                <p className="text-[13px] font-light mt-0.5" style={{ color: vars.g600 }}>Add a new platform account. The user will log in with these credentials.</p>
              </div>
              <button onClick={() => setAddingUser(false)} className="text-[20px] leading-none px-2 mt-0.5" style={{ color: vars.g400 }}>&times;</button>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {([
                { key: "username", label: "Username", placeholder: "e.g. acme-pr", value: newUsername, onChange: setNewUsername },
                { key: "displayName", label: "Display name (optional)", placeholder: "e.g. Acme PR Agency", value: newDisplayName, onChange: setNewDisplayName },
              ] as const).map(({ key, label, placeholder, value, onChange }) => (
                <div key={key}>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>{label}</label>
                  <input
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 rounded-lg border text-[13px] focus:outline-none focus:ring-1"
                    style={{ borderColor: vars.g200 }}
                  />
                </div>
              ))}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Choose a secure password"
                  className="w-full px-3 py-2 rounded-lg border text-[13px] focus:outline-none focus:ring-1"
                  style={{ borderColor: vars.g200 }}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as "admin" | "agency" | "client")}
                  className="w-full px-3 py-2 rounded-lg border text-[13px] focus:outline-none bg-white"
                  style={{ borderColor: vars.g200 }}
                >
                  <option value="client">Client</option>
                  <option value="agency">Agency</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            {addError && (
              <div className="flex items-center gap-2 mt-4 p-3 rounded-lg text-[12px]" style={{ background: "rgba(176,61,51,0.08)", color: "#B03D33" }}>
                <AlertTriangle size={13} /> {addError}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setAddingUser(false)} className="px-4 py-2 rounded-full text-[12px] font-bold border uppercase tracking-[0.12em]" style={{ borderColor: vars.g200, color: vars.g500 }}>Cancel</button>
              <button
                onClick={() => void handleAdd()}
                disabled={!newUsername.trim() || !newPassword.trim() || addLoading}
                className="flex items-center gap-2 px-5 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.12em] text-white disabled:opacity-40"
                style={{ background: teal }}
              >
                {addLoading ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                Create account
              </button>
            </div>
          </div>
        )}

        {/* ACCOUNTS LIST */}
        <div className="rounded-2xl overflow-visible" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
          <div className="flex items-center justify-between gap-4 px-6 py-4 border-b" style={{ borderColor: vars.g200 }}>
            <h2 className="text-[16px] font-bold" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Accounts ({users.length})</h2>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" color={vars.g400} />
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search accounts..."
                className="pl-8 pr-3 py-2 rounded-lg border text-[12px] outline-none focus:ring-1 w-48"
                style={{ borderColor: vars.g200, color: ink, background: vars.g100 }}
              />
            </div>
          </div>
          <ul className="divide-y" style={{ borderColor: vars.g100 }}>
            {filteredUsers.map((u) => {
              const isMe = u.username.toLowerCase() === session.username.toLowerCase();
              const expanded = expandedUser === u.username;
              const sessions = accountSessions[u.username];

              return (
                <li key={u.username} className="px-6 py-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: isMe ? accentSoft : "#F0F4FF", color: isMe ? accent : teal }}>
                        {isMe ? <Sparkles size={16} /> : <User size={16} />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[14px] font-bold truncate" style={{ color: ink }}>{accountLabel(u)}</p>
                          {u.displayName && <p className="text-[11px] font-light" style={{ color: vars.g400 }}>@{u.username}</p>}
                          <span className="text-[9px] font-bold uppercase tracking-[0.16em] px-2 py-0.5 rounded-full" style={{ background: u.role === "admin" ? ink : u.role === "agency" ? "#F0F4FF" : accentSoft, color: u.role === "admin" ? "white" : u.role === "agency" ? teal : accent }}>
                            {roleLabel(u.role)}
                          </span>
                          {isMe && <span className="text-[9px] font-bold uppercase tracking-[0.14em] px-2 py-0.5 rounded-full" style={{ background: "#F0F4FF", color: teal }}>You</span>}
                        </div>
                        {u.role === "agency" && u.seatCap !== undefined && (
                          <p className="text-[11px] font-light mt-0.5" style={{ color: vars.g500 }}>Seat cap: {u.seatCap ?? "Unlimited"}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-1">
                      {/* Display name */}
                      {editingDisplayName === u.username ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            value={displayNameValue}
                            onChange={(e) => setDisplayNameValue(e.target.value)}
                            placeholder="Display name..."
                            className="px-2 py-1.5 rounded-lg border text-[12px] w-36"
                            style={{ borderColor: vars.g200 }}
                            autoFocus
                          />
                          <button onClick={() => void handleSetDisplayName(u.username)} disabled={displayNameLoading} className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white" style={{ background: teal, opacity: displayNameLoading ? 0.5 : 1 }}>
                            {displayNameLoading ? <Loader2 size={10} className="animate-spin" /> : "Save"}
                          </button>
                          <button onClick={() => { setEditingDisplayName(null); setDisplayNameValue(""); }} className="px-2 py-1.5 rounded-lg text-[11px]" style={{ color: vars.g400 }}>Cancel</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingDisplayName(u.username); setDisplayNameValue(u.displayName ?? ""); }}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.12em] transition-all hover:bg-black/5"
                          style={{ color: vars.g500, border: `1.5px solid ${vars.g200}` }}
                        >
                          <FileEdit size={11} /> Name
                        </button>
                      )}

                      {/* Change role */}
                      {!isMe && (
                        editingRole === u.username ? (
                          <div className="flex items-center gap-1.5">
                            <select
                              value={editingRoleValue}
                              onChange={(e) => setEditingRoleValue(e.target.value as "admin" | "agency" | "client")}
                              className="px-2 py-1.5 rounded-lg border text-[12px] bg-white"
                              style={{ borderColor: vars.g200 }}
                            >
                              <option value="client">Client</option>
                              <option value="agency">Agency</option>
                              <option value="admin">Admin</option>
                            </select>
                            <button onClick={() => void handleSetRole(u.username)} disabled={editingRoleLoading} className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white" style={{ background: teal, opacity: editingRoleLoading ? 0.5 : 1 }}>
                              {editingRoleLoading ? <Loader2 size={10} className="animate-spin" /> : "Save"}
                            </button>
                            <button onClick={() => setEditingRole(null)} className="px-2 py-1.5 rounded-lg text-[11px]" style={{ color: vars.g400 }}>Cancel</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingRole(u.username); setEditingRoleValue(u.role); }}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.12em] transition-all hover:bg-black/5"
                            style={{ color: vars.g500, border: `1.5px solid ${vars.g200}` }}
                          >
                            <Shield size={11} /> Role
                          </button>
                        )
                      )}

                      {/* Seat cap */}
                      {u.role === "agency" && (
                        editingSeatCap === u.username ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              value={seatCapValue}
                              onChange={(e) => setSeatCapValue(e.target.value)}
                              placeholder="Unlimited"
                              className="px-2 py-1.5 rounded-lg border text-[12px] w-24"
                              style={{ borderColor: vars.g200 }}
                              autoFocus
                            />
                            <button onClick={() => void handleSetSeatCap(u.username)} disabled={seatCapLoading} className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white" style={{ background: teal, opacity: seatCapLoading ? 0.5 : 1 }}>
                              {seatCapLoading ? <Loader2 size={10} className="animate-spin" /> : "Save"}
                            </button>
                            <button onClick={() => setEditingSeatCap(null)} className="px-2 py-1.5 rounded-lg text-[11px]" style={{ color: vars.g400 }}>Cancel</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingSeatCap(u.username); setSeatCapValue(u.seatCap != null ? String(u.seatCap) : ""); }}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.12em] transition-all hover:bg-black/5"
                            style={{ color: vars.g500, border: `1.5px solid ${vars.g200}` }}
                          >
                            <Users size={11} /> Seats
                          </button>
                        )
                      )}

                      {/* Change password */}
                      {changePwUser === u.username ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="password"
                            value={changePwValue}
                            onChange={(e) => setChangePwValue(e.target.value)}
                            placeholder="New password..."
                            className="px-2 py-1.5 rounded-lg border text-[12px] w-36"
                            style={{ borderColor: vars.g200 }}
                            autoFocus
                          />
                          <button onClick={() => void handleChangePw()} disabled={!changePwValue.trim() || changePwLoading} className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white" style={{ background: teal, opacity: !changePwValue.trim() || changePwLoading ? 0.5 : 1 }}>
                            {changePwLoading ? <Loader2 size={10} className="animate-spin" /> : "Set"}
                          </button>
                          <button onClick={() => { setChangePwUser(null); setChangePwValue(""); setChangePwError(null); }} className="px-2 py-1.5 rounded-lg text-[11px]" style={{ color: vars.g400 }}>Cancel</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setChangePwUser(u.username); setChangePwValue(""); setChangePwError(null); setChangePwOk(null); }}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.12em] transition-all hover:bg-black/5"
                          style={{ color: vars.g500, border: `1.5px solid ${vars.g200}` }}
                        >
                          <KeyRound size={11} /> Password
                        </button>
                      )}

                      {/* Sessions */}
                      <button
                        onClick={() => {
                          const next = expanded ? null : u.username;
                          setExpandedUser(next);
                          if (next && !accountSessions[next]) void handleLoadAccountSessions(next);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.12em] transition-all hover:bg-black/5"
                        style={{ color: expanded ? teal : vars.g500, border: `1.5px solid ${expanded ? teal + "40" : vars.g200}` }}
                      >
                        <MonitorSmartphone size={11} /> Sessions
                      </button>

                      {/* Delete */}
                      {!isMe && (
                        deleteConfirm === u.username ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold" style={{ color: "#B03D33" }}>Sure?</span>
                            <button onClick={() => void handleDelete(u.username)} disabled={deleteLoading} className="px-2.5 py-1.5 rounded-full text-[10px] font-bold text-white uppercase tracking-[0.12em]" style={{ background: "#B03D33", opacity: deleteLoading ? 0.5 : 1 }}>
                              {deleteLoading ? <Loader2 size={10} className="animate-spin" /> : "Delete"}
                            </button>
                            <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1.5 rounded-lg text-[11px]" style={{ color: vars.g400 }}>Cancel</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(u.username)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.12em] transition-all hover:bg-red-50"
                            style={{ color: "#B03D33", border: `1.5px solid rgba(176,61,51,0.3)` }}
                          >
                            <Trash2 size={11} /> Delete
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {/* Inline feedback */}
                  {changePwOk === u.username && (
                    <div className="mt-2 flex items-center gap-2 text-[12px]" style={{ color: "#3D9B6B" }}>
                      <CheckCircle2 size={13} /> Password changed successfully.
                    </div>
                  )}
                  {changePwError && changePwUser === u.username && (
                    <div className="mt-2 flex items-center gap-2 text-[12px]" style={{ color: "#B03D33" }}>
                      <AlertTriangle size={13} /> {changePwError}
                    </div>
                  )}

                  {/* Sessions expansion */}
                  {expanded && (
                    <div className="mt-3 sm:pl-[52px]">
                      {loadingAccountSessions === u.username && (
                        <div className="flex items-center gap-2 text-[12px]" style={{ color: vars.g400 }}>
                          <Loader2 size={13} className="animate-spin" /> Loading sessions…
                        </div>
                      )}
                      {sessions && (
                        sessions.length === 0 ? (
                          <p className="text-[12px] font-light italic" style={{ color: vars.g400 }}>No active sessions for this account.</p>
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
                                {sessions.map((s) => (
                                  <tr key={s.sid} style={{ borderBottom: `1px solid ${vars.g100}` }}>
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
              style={{ borderColor: vars.g200, color: ink, background: vars.g100 }}
            />
            <input
              type="date"
              value={auditTo}
              onChange={e => setAuditTo(e.target.value)}
              className="px-3 py-1.5 rounded-lg border text-[12px] outline-none focus:ring-1"
              style={{ borderColor: vars.g200, color: ink, background: vars.g100 }}
            />
          </div>

          {auditEvents === null ? (
            <p className="text-[13px] font-light italic text-center py-6" style={{ color: vars.g400 }}>
              Click "Load" to fetch the audit log.
            </p>
          ) : filteredAuditEvents.length === 0 ? (
            <p className="text-[13px] font-light italic text-center py-6" style={{ color: vars.g400 }}>
              No events match the current filters.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: vars.g200 }}>
              <table className="w-full text-left text-[12px]" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: vars.g100 }}>
                    {["Timestamp", "Actor", "Action", "Target", "Meta"].map((h) => (
                      <th key={h} className="px-3 py-2 font-bold uppercase tracking-[0.12em] text-[10px]" style={{ color: vars.g500, borderBottom: `1px solid ${vars.g200}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredAuditEvents.map((e, i) => (
                    <tr key={e.id} style={{ background: i % 2 === 0 ? "white" : vars.g50, borderBottom: `1px solid ${vars.g100}` }}>
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-[11px]" style={{ color: vars.g500 }}>
                        {new Date(e.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        {" "}
                        {new Date(e.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-3 py-2 font-semibold" style={{ color: ink }}>{e.actor}</td>
                      <td className="px-3 py-2" style={{ color: teal }}>{e.action}</td>
                      <td className="px-3 py-2" style={{ color: vars.g600 }}>{e.target ?? "—"}</td>
                      <td className="px-3 py-2 max-w-[200px] truncate font-mono text-[11px]" style={{ color: vars.g500 }} title={e.meta ?? undefined}>{e.meta ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
