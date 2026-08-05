import { useState, useMemo, useEffect } from "react";
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
import { type Session as LocalSession, type User as LocalUser, type Role, getSubAccounts as getLocalSubAccounts, serverAddUser, serverDeleteUser, serverChangePassword, serverAssignOwner, serverSetDisplayName, serverArchiveUser, serverSetSeatCap, refreshAccountsCache, serverImpersonate, serverSwitchToMaster, serverChangeAccountType, canCreateSubAccounts } from "../lib/auth";
import { apiBase } from "../lib/apiHelpers";
import { accountLabel } from "../lib/accountLabels";
import { loadStoredProjects } from "../lib/projectStore";
import { pushProjectMeta } from "../lib/projectSync";
import type { Client } from "../lib/projectTypes";
import { TeamSection } from "./TeamSection";
function SubAccountsPage({
  session,
  onBack,
  onAssignProjectOwner,
  onRoleChanged,
}: {
  session: LocalSession;
  onBack: () => void;
  onAssignProjectOwner: (id: string, owner: string) => void;
  onRoleChanged?: (newRole: Role) => void;
}) {
  const paper = "#f8fafc";
  const ink = "#0a1628";
  const accent = "#C8497A";
  const accentSoft = "#FBE3ED";
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

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

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [pwUser, setPwUser] = useState<string | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);

  // Account Type section state
  const isOwner = session.membershipRole == null || session.membershipRole === "owner";
  const isAgencyOrClient = session.role === "agency" || session.role === "client";
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
  const [isMasterOwner, setIsMasterOwner] = useState<boolean>(false);
  const [switchingToMaster, setSwitchingToMaster] = useState(false);
  const [switchToMasterError, setSwitchToMasterError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`${apiBase()}/api/platform/me`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data: { account?: { googleLinked?: boolean } | null; masterOwner?: boolean } | null) => {
        if (data?.account) setGoogleLinked(data.account.googleLinked ?? false);
        setIsMasterOwner(data?.masterOwner === true);
      })
      .catch(() => { /* non-fatal */ });
  }, []);

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
    setAddError(null);
    setAddSuccess(null);
    void (async () => {
      const result = await serverAddUser(newUsername, newPassword, "client");
      if (result.ok) {
        setAddSuccess(`Created client account '${newUsername.trim()}'.`);
        setNewUsername("");
        setNewPassword("");
        refresh();
      } else {
        setAddError(result.error);
      }
    })();
  };

  const handleEnterAccount = (username: string) => {
    setEnterError(null);
    setEnteringUsername(username);
    void serverImpersonate(username)
      .then((result) => {
        if (!result.ok) {
          setEnterError(result.error);
          setEnteringUsername(null);
          return;
        }
        window.location.reload();
      })
      .catch(() => {
        setEnterError("Failed to enter this account.");
        setEnteringUsername(null);
      });
  };

  const handleArchive = (username: string, archive: boolean) => {
    const msg = archive
      ? `Archive client account '${username}'? They will not be able to sign in until restored. Their projects remain visible to you.`
      : `Restore client account '${username}'? They will be able to sign in again.`;
    if (!confirm(msg)) return;
    void (async () => {
      const result = await serverArchiveUser(username, archive);
      if (!result.ok) { alert(result.error); return; }
      refresh();
    })();
  };

  const handleDelete = (username: string) => {
    if (!confirm(`Delete client account '${username}'? They will no longer be able to sign in. Their projects are kept and stay visible to you.`)) return;
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

  const ownerLabel = (owner: string | undefined) => {
    const o = (owner || "").toLowerCase();
    if (o === session.username.toLowerCase()) return "You";
    const match = subAccounts.find((u) => u.username.toLowerCase() === o);
    return match ? match.username : owner || "Unassigned";
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
            {canCreateSubAccounts(session.role) ? <Users size={12} color={accent} /> : <User size={12} color={accent} />}
            <span className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>
              {canCreateSubAccounts(session.role) ? "Client accounts" : "My account"}
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl leading-[1.1]" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>
            {canCreateSubAccounts(session.role) ? "Manage your client accounts" : "Account settings"}
          </h1>
          <p className="text-[14px] font-light mt-3 max-w-2xl leading-[1.7]" style={{ color: vars.g600 }}>
            {canCreateSubAccounts(session.role)
              ? "Give a client their own login so they can sign in and work on their own projects. They only ever see their own projects, while you still see everything across all of your clients."
              : "Manage your account settings, team members, and security options."}
          </p>
        </div>

        {/* ACCOUNT TYPE */}
        <div className="rounded-2xl p-6 sm:p-8 mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
          <h2 className="text-[16px] font-bold mb-1" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Account type</h2>
          <p className="text-[13px] font-light mb-5 leading-[1.7]" style={{ color: vars.g600 }}>
            Controls how your dashboard is set up — whether you manage multiple clients or one brand.
          </p>
          {!isAgencyOrClient ? (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl" style={{ background: "#FEF9EC", border: "1px solid #F5D57A" }}>
              <Info size={14} className="flex-shrink-0 mt-0.5" style={{ color: "#A0720A" }} />
              <p className="text-[12px] leading-[1.6]" style={{ color: "#7A5500" }}>
                Your account type was set up by an administrator. Contact support to change it.
              </p>
            </div>
          ) : !isOwner ? (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl" style={{ background: "#FEF9EC", border: "1px solid #F5D57A" }}>
              <Info size={14} className="flex-shrink-0 mt-0.5" style={{ color: "#A0720A" }} />
              <p className="text-[12px] leading-[1.6]" style={{ color: "#7A5500" }}>
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
                  className="text-left p-5 rounded-xl border-2 transition-all hover:-translate-y-0.5"
                  style={{
                    borderColor: (selectedType ?? session.role) === "agency" ? accent : vars.g200,
                    background: (selectedType ?? session.role) === "agency" ? "#FDF0F5" : "white",
                    boxShadow: (selectedType ?? session.role) === "agency" ? `0 0 0 1px ${accent}` : undefined,
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: (selectedType ?? session.role) === "agency" ? accent : vars.g100 }}>
                      <Building2 size={16} color={(selectedType ?? session.role) === "agency" ? "white" : vars.g500} />
                    </div>
                    <div>
                      <p className="text-[14px] font-bold" style={{ color: ink }}>Agency / Partner</p>
                      {session.role === "agency" && !selectedType && (
                        <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: accent }}>Current</span>
                      )}
                    </div>
                  </div>
                  <p className="text-[12px] leading-[1.6]" style={{ color: vars.g600 }}>
                    Manage PR for multiple clients. Create client accounts and view all dashboards from one place.
                  </p>
                </button>

                {/* Client option */}
                <button
                  type="button"
                  onClick={() => { setSelectedType("client"); setTypeError(null); setTypeSuccess(null); }}
                  className="text-left p-5 rounded-xl border-2 transition-all hover:-translate-y-0.5"
                  style={{
                    borderColor: (selectedType ?? session.role) === "client" ? "#1A647B" : vars.g200,
                    background: (selectedType ?? session.role) === "client" ? "#EDF6F9" : "white",
                    boxShadow: (selectedType ?? session.role) === "client" ? `0 0 0 1px #1A647B` : undefined,
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: (selectedType ?? session.role) === "client" ? "#1A647B" : vars.g100 }}>
                      <User size={16} color={(selectedType ?? session.role) === "client" ? "white" : vars.g500} />
                    </div>
                    <div>
                      <p className="text-[14px] font-bold" style={{ color: ink }}>Client</p>
                      {session.role === "client" && !selectedType && (
                        <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "#1A647B" }}>Current</span>
                      )}
                    </div>
                  </div>
                  <p className="text-[12px] leading-[1.6]" style={{ color: vars.g600 }}>
                    Manage PR for your own brand. One focused workspace for all your projects.
                  </p>
                </button>
              </div>

              {typeError && (
                <div className="flex items-start gap-2 mb-3 px-4 py-3 rounded-xl" style={{ background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.25)" }}>
                  <XCircle size={14} className="flex-shrink-0 mt-0.5" style={{ color: "rgb(185,28,28)" }} />
                  <p className="text-[12px] font-semibold" style={{ color: "rgb(185,28,28)" }}>{typeError}</p>
                </div>
              )}
              {typeSuccess && (
                <div className="flex items-center gap-2 mb-3 px-4 py-3 rounded-xl" style={{ background: "rgba(22,163,74,0.07)", border: "1px solid rgba(22,163,74,0.25)" }}>
                  <CheckCircle2 size={14} style={{ color: "rgb(21,128,61)" }} />
                  <p className="text-[12px] font-semibold" style={{ color: "rgb(21,128,61)" }}>{typeSuccess}</p>
                </div>
              )}

              {selectedType && selectedType !== session.role && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleChangeAccountType}
                    disabled={typeChanging}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full text-[12px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:opacity-90 disabled:opacity-60"
                    style={{ background: accent }}
                  >
                    {typeChanging ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    {typeChanging ? "Saving..." : `Switch to ${selectedType === "agency" ? "Agency / Partner" : "Client"}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSelectedType(null); setTypeError(null); }}
                    className="px-4 py-2.5 rounded-full text-[12px] font-bold uppercase tracking-[0.14em] transition-all hover:bg-black/5"
                    style={{ color: vars.g500, border: `1.5px solid ${vars.g200}` }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* MY ACCOUNT */}
        <div className="rounded-2xl p-6 sm:p-8 mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
          <h2 className="text-[16px] font-bold mb-4" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>My account</h2>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: accentSoft, color: accent }}>
                <User size={16} />
              </div>
              <div>
                <p className="text-[14px] font-bold" style={{ color: ink }}>{session.username}</p>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.16em]" style={{ background: accentSoft, color: accent }}>{session.role}</span>
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
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.12em] border transition-all hover:bg-gray-50"
                  style={{ borderColor: vars.g300, color: ink }}
                >
                  <LinkIcon size={13} /> Link Google account
                </a>
              ) : null}
              {isMasterOwner && (
                <button
                  onClick={handleSwitchToMaster}
                  disabled={switchingToMaster}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.12em] transition-all hover:opacity-90 disabled:opacity-60"
                  style={{ background: ink, color: "#fff" }}
                >
                  {switchingToMaster ? <Loader2 size={13} className="animate-spin" /> : <Shield size={13} />}
                  {switchingToMaster ? "Switching..." : "Switch to Master"}
                </button>
              )}
            </div>
          </div>
          {switchToMasterError && (
            <p className="mt-3 text-[12px] font-semibold" style={{ color: accent }}>{switchToMasterError}</p>
          )}
        </div>

        {/* TEAM MEMBERS (invite colleagues with roles + project access) */}
        {(session.membershipRole == null || session.membershipRole === "owner" || session.membershipRole === "admin") && (
          <TeamSection />
        )}

        {/* ADD CLIENT ACCOUNT — agency/admin only */}
        {canCreateSubAccounts(session.role) && <div className="rounded-2xl p-6 sm:p-8 mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
          <h2 className="text-[16px] font-bold mb-4" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Create a client account</h2>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-12 gap-3 md:items-end">
            <div className="md:col-span-5">
              <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Username</label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="e.g. acme-client"
                className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2"
                style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
              />
            </div>
            <div className="md:col-span-5">
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
            <div className="md:col-span-2">
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-[12px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:opacity-90"
                style={{ background: accent }}
              >
                <Plus size={14} /> Add
              </button>
            </div>
            {addError && <p className="md:col-span-12 text-[12px] font-semibold" style={{ color: accent }}>{addError}</p>}
            {addSuccess && <p className="md:col-span-12 text-[12px] font-semibold" style={{ color: vars.green }}>{addSuccess}</p>}
          </form>
        </div>}

        {canCreateSubAccounts(session.role) && (<>
        {/* CLIENT ACCOUNTS LIST */}
        <div className="rounded-2xl overflow-hidden mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
          <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: vars.g200 }}>
            <h2 className="text-[16px] font-bold" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Your client accounts ({subAccounts.length}{archivedSubAccounts.length > 0 ? ` + ${archivedSubAccounts.length} archived` : ""})</h2>
          </div>
          {subAccounts.length === 0 ? (
            <p className="px-6 py-6 text-[13px] font-light italic" style={{ color: vars.g500 }}>No client accounts yet. Create one above to give a client their own login.</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: vars.g200 }}>
              {subAccounts.map((u) => {
                const editingPw = pwUser === u.username;
                const owned = manageable.filter((p) => (p.owner || "").toLowerCase() === u.username.toLowerCase());
                return (
                  <li key={u.username} className="px-6 py-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: accentSoft, color: accent }}>
                          <User size={16} />
                        </div>
                        <div>
                          <p className="text-[14px] font-bold" style={{ color: ink }}>{u.username}</p>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.16em]" style={{ background: accentSoft, color: accent }}>Client</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => handleEnterAccount(u.username)}
                          disabled={enteringUsername === u.username}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] transition-all text-white"
                          style={{ background: accent, opacity: enteringUsername === u.username ? 0.7 : 1 }}
                        >
                          {enteringUsername === u.username ? <Loader2 size={12} className="animate-spin" /> : <LogIn size={12} />} Login as client
                        </button>
                        <button
                          onClick={() => { setPwUser(editingPw ? null : u.username); setPwValue(""); setPwError(null); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] transition-all hover:bg-black/5"
                          style={{ color: ink, border: `1.5px solid ${vars.g200}` }}
                        >
                          <KeyRound size={12} /> {editingPw ? "Cancel" : "Change password"}
                        </button>
                        <button
                          onClick={() => handleArchive(u.username, true)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] transition-all hover:bg-black/5"
                          style={{ color: vars.g500, border: `1.5px solid ${vars.g200}` }}
                        >
                          <Archive size={12} /> Archive
                        </button>
                        <button
                          onClick={() => handleDelete(u.username)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] transition-all hover:bg-black/5"
                          style={{ color: accent, border: `1.5px solid ${accent}40` }}
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </div>
                    {enterError && enteringUsername === null && (
                      <p className="mt-2 text-[12px] font-semibold sm:pl-[52px]" style={{ color: accent }}>{enterError}</p>
                    )}
                    <div className="mt-3 sm:pl-[52px]">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1.5" style={{ color: vars.g500 }}>Their projects ({owned.length})</p>
                      {owned.length === 0 ? (
                        <p className="text-[12px] font-light italic" style={{ color: vars.g400 }}>No projects yet.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {owned.map((p) => (
                            <span key={p.id} className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full" style={{ background: accentSoft, color: accent }}>
                              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[8px] font-bold text-white" style={{ background: p.color }}>{p.initials}</span>
                              {p.name}
                            </span>
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
                          placeholder="New password (min 4 chars)"
                          className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border text-[13px] focus:outline-none focus:ring-2"
                          style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
                        />
                        <button type="submit" className="px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] text-white" style={{ background: accent }}>Save</button>
                        {pwError && <span className="text-[12px] font-semibold w-full" style={{ color: accent }}>{pwError}</span>}
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ARCHIVED ACCOUNTS */}
        {archivedSubAccounts.length > 0 && (
          <div className="rounded-2xl overflow-hidden mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
            <div className="px-6 py-4 border-b" style={{ borderColor: vars.g200 }}>
              <h2 className="text-[16px] font-bold" style={{ color: vars.g400, fontFamily: "'Alice', Georgia, serif" }}>Archived clients ({archivedSubAccounts.length})</h2>
              <p className="text-[12px] font-light mt-0.5" style={{ color: vars.g400 }}>These accounts cannot sign in. Their projects remain visible to you.</p>
            </div>
            <ul className="divide-y" style={{ borderColor: vars.g200 }}>
              {archivedSubAccounts.map((u) => {
                const owned = manageable.filter((p) => (p.owner || "").toLowerCase() === u.username.toLowerCase());
                return (
                  <li key={u.username} className="px-6 py-4" style={{ background: vars.g100 + "40" }}>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-3 opacity-60">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: vars.g200, color: vars.g400 }}>
                          <User size={16} />
                        </div>
                        <div>
                          <p className="text-[14px] font-bold" style={{ color: vars.g500 }}>{u.username}</p>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.16em]" style={{ background: vars.g200, color: vars.g400 }}>Archived</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleArchive(u.username, false)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] transition-all hover:bg-black/5"
                          style={{ color: ink, border: `1.5px solid ${vars.g200}` }}
                        >
                          <ArchiveRestore size={12} /> Restore
                        </button>
                        <button
                          onClick={() => handleDelete(u.username)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] transition-all hover:bg-black/5"
                          style={{ color: accent, border: `1.5px solid ${accent}40` }}
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </div>
                    {owned.length > 0 && (
                      <div className="mt-3 sm:pl-[52px]">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1.5" style={{ color: vars.g400 }}>Their projects ({owned.length})</p>
                        <div className="flex flex-wrap gap-1.5">
                          {owned.map((p) => (
                            <span key={p.id} className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full opacity-60" style={{ background: vars.g200, color: vars.g500 }}>
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
        )}

        {/* PROJECT ASSIGNMENT */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
          <div className="px-6 py-4 border-b" style={{ borderColor: vars.g200 }}>
            <h2 className="text-[16px] font-bold" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Assign projects</h2>
            <p className="text-[12px] font-light mt-1" style={{ color: vars.g500 }}>Hand a project to a client so it shows up in their own account. You keep access either way.</p>
          </div>
          {manageable.length === 0 ? (
            <p className="px-6 py-6 text-[13px] font-light italic" style={{ color: vars.g500 }}>No projects to assign yet.</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: vars.g200 }}>
              {manageable.map((p) => (
                <li key={p.id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[10px] font-bold text-white" style={{ background: p.color }}>{p.initials}</span>
                    <div>
                      <p className="text-[14px] font-bold" style={{ color: ink }}>{p.name}</p>
                      <p className="text-[11px] font-light" style={{ color: vars.g500 }}>Currently with: {ownerLabel(p.owner)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: vars.g500 }}>Owner</label>
                    <select
                      value={(p.owner || "").toLowerCase() === session.username.toLowerCase() ? "__me__" : (p.owner || "")}
                      onChange={(e) => {
                        const val = e.target.value === "__me__" ? session.username : e.target.value;
                        onAssignProjectOwner(p.id, val);
                        refresh();
                      }}
                      className="px-3 py-2 rounded-lg border text-[13px] focus:outline-none focus:ring-2 bg-white"
                      style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
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
        </>)}
      </div>
    </div>
  );
}

export { SubAccountsPage };
