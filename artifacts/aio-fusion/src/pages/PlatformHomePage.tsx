import { useState } from "react";
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
import { type Session as LocalSession, type SessionInfo, serverLogin, serverLogout, serverGetSessions, serverRevokeSession, serverSelfDeleteAccount, serverSignUp, getUsers as getLocalUsers, canCreateSubAccounts } from "../lib/auth";
import { roleLabel, accountLabel } from "../lib/accountLabels";
function PlatformHomePage({
  onCreateProject,
  onContinueToProjects,
  onArchivedProjects,
  onGuidance,
  onBackToLanding,
  session,
  onLoginSuccess,
  onSignOut,
  onManageUsers,
  onManageSubAccounts,
  onTokenUsage,
}: {
  onCreateProject: () => void;
  onContinueToProjects: () => void;
  onArchivedProjects: () => void;
  onGuidance: () => void;
  onBackToLanding: () => void;
  session: LocalSession | null;
  onLoginSuccess: (s: LocalSession) => void;
  onSignOut: () => void;
  onManageUsers: () => void;
  onManageSubAccounts: () => void;
  onTokenUsage: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showSessions, setShowSessions] = useState(false);
  const [mySessions, setMySessions] = useState<SessionInfo[] | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [revokingSession, setRevokingSession] = useState<string | null>(null);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Sign-up form
  const [showSignup, setShowSignup] = useState(false);
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupCompany, setSignupCompany] = useState("");
  const [signupWebsite, setSignupWebsite] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [signupDone, setSignupDone] = useState(false);

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError(null);
    setSignupLoading(true);
    void serverSignUp({
      name: signupName,
      email: signupEmail,
      companyName: signupCompany,
      website: signupWebsite || undefined,
      password: signupPassword,
    }).then((r) => {
      if (r.ok) {
        setSignupDone(true);
      } else {
        setSignupError(r.error);
      }
    }).finally(() => setSignupLoading(false));
  };

  const loadMySessions = () => {
    setSessionsLoading(true);
    setSessionsError(null);
    void serverGetSessions()
      .then((r) => {
        if (r.ok) setMySessions(r.sessions);
        else setSessionsError(r.error);
      })
      .finally(() => setSessionsLoading(false));
  };

  const handleRevokeSession = (sid: string) => {
    setRevokingSession(sid);
    void serverRevokeSession(sid)
      .then((r) => {
        if (!r.ok) { setSessionsError(r.error); return; }
        setMySessions((prev) => prev ? prev.filter((s) => s.sid !== sid) : prev);
      })
      .finally(() => setRevokingSession(null));
  };

  const handleDeleteAccount = (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError(null);
    if (!deletePassword) { setDeleteError("Enter your password to confirm."); return; }
    setDeleting(true);
    void serverSelfDeleteAccount(deletePassword)
      .then((r) => {
        if (!r.ok) { setDeleteError(r.error); return; }
        onSignOut();
      })
      .finally(() => setDeleting(false));
  };

  const loopSteps: { label: string; sub: string; icon: any }[] = [
    { label: "Set-Up", sub: "Project Data", icon: ClipboardPaste },
    { label: "Audit", sub: "Earned + Site", icon: Search },
    { label: "Optimise", sub: "Content", icon: FileEdit },
    { label: "Plan", sub: "Schedule", icon: Calendar },
    { label: "Target", sub: "Media + Events", icon: Target },
    { label: "Release", sub: "Publish", icon: Send },
    { label: "Measure", sub: "Outcomes", icon: BarChart3 },
  ];
  void onCreateProject; void onArchivedProjects;
  const paper = "#f8fafc";
  const ink = "#0a1628";
  const accent = "#C8497A";
  const accentSoft = "#FBE3ED";
  return (
    <div className="min-h-screen font-['Inter',sans-serif]" style={{ background: "white", color: ink }}>
      <header className="px-4 sm:px-10 py-4 sm:py-6 flex items-center justify-between" style={{ background: "#1A647B", borderBottom: `1px solid rgba(255,255,255,0.15)` }}>
        <button onClick={onBackToLanding} className="flex items-center gap-3.5">
          <img src={`${import.meta.env.BASE_URL}images/logo-white-notagline.png`} alt="AIO Fusion" className="h-20 sm:h-30" />
        </button>
        <button
          onClick={onBackToLanding}
          className="flex items-center gap-2 px-5 sm:px-7 py-3 sm:py-3.5 text-[12px] sm:text-[13px] font-bold uppercase tracking-[0.14em] transition-all hover:brightness-110 rounded-xl"
          style={{ background: accent, color: "white" }}
        >
          <ArrowLeft size={16} /> Back to website
        </button>
      </header>

      <div className="px-4 sm:px-10 py-10 sm:py-14 max-w-7xl mx-auto">
        <div className="mb-8 sm:mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4" style={{ background: accent }}>
            <Sparkles size={12} color="white" />
            <span className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: "white" }}>Platform Home</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>
            Welcome to <span style={{ color: accent }}>AIO Fusion</span>
          </h1>
          <p className="text-[16px] sm:text-[18px] font-light mt-4 leading-[1.7] whitespace-nowrap" style={{ color: vars.g600 }}>
            Sign in to manage your PR and marketing projects, then move through The AIO Marketing Loop to grow business AI authority.
          </p>
        </div>

        {/* LOGIN / SIGN-UP / SESSION - full-width across the page */}
        {!session ? (
          <div className="rounded-2xl p-6 sm:p-10 mb-6 sm:mb-8" style={{ background: "#1A647B", boxShadow: "0 8px 24px -12px rgba(26,100,123,0.35)" }}>

            {/* Pending approval success screen */}
            {signupDone ? (
              <div className="flex flex-col items-center text-center py-6 gap-5">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.15)" }}>
                  <CheckCircle2 size={32} color="white" />
                </div>
                <div>
                  <h2 className="text-[26px] font-bold mb-2" style={{ color: "white", fontFamily: "'Alice', Georgia, serif" }}>Application received</h2>
                  <p className="text-[15px] font-light max-w-lg leading-[1.7]" style={{ color: "rgba(255,255,255,0.85)" }}>
                    Thanks for signing up. Your account is now <strong style={{ color: "white" }}>pending approval</strong> — we'll review your application and be in touch shortly.
                  </p>
                  <p className="text-[13px] mt-3 font-light" style={{ color: "rgba(255,255,255,0.6)" }}>
                    Once approved you can sign in with the email and password you just created.
                  </p>
                </div>
                <button
                  onClick={() => { setSignupDone(false); setShowSignup(false); }}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl text-[13px] font-bold uppercase tracking-[0.14em] transition-all hover:brightness-110"
                  style={{ background: accent, color: "white" }}
                >
                  <LogIn size={15} /> Back to sign in
                </button>
              </div>
            ) : showSignup ? (
              /* --- SIGN-UP FORM --- */
              <>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "white", color: "#1A647B" }}>
                      <Building2 size={20} />
                    </div>
                    <div>
                      <h2 className="text-[22px] font-bold" style={{ color: "white", fontFamily: "'Alice', Georgia, serif" }}>Create an account</h2>
                      <p className="text-[14px] font-light" style={{ color: "rgba(255,255,255,0.75)" }}>Fill in your details and we'll review your application.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowSignup(false); setSignupError(null); }}
                    className="text-[13px] font-bold uppercase tracking-[0.14em] hover:opacity-70 transition-opacity"
                    style={{ color: "rgba(255,255,255,0.7)" }}
                  >
                    ← Sign in instead
                  </button>
                </div>
                <form onSubmit={handleSignup} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-2" style={{ color: "white" }}>Your name</label>
                    <div className="relative">
                      <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: vars.g400 }} />
                      <input type="text" value={signupName} onChange={(e) => setSignupName(e.target.value)} placeholder="First and last name" autoComplete="name" required className="w-full pl-10 pr-3 py-3 rounded-xl border text-[14px] focus:outline-none focus:ring-2" style={{ background: "white", borderColor: vars.g200, color: ink, ["--tw-ring-color" as any]: accent }} />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-2" style={{ color: "white" }}>Work email</label>
                    <div className="relative">
                      <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: vars.g400 }} />
                      <input type="email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" required className="w-full pl-10 pr-3 py-3 rounded-xl border text-[14px] focus:outline-none focus:ring-2" style={{ background: "white", borderColor: vars.g200, color: ink, ["--tw-ring-color" as any]: accent }} />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-2" style={{ color: "white" }}>Company name</label>
                    <div className="relative">
                      <Building2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: vars.g400 }} />
                      <input type="text" value={signupCompany} onChange={(e) => setSignupCompany(e.target.value)} placeholder="e.g. Acme Agency Ltd" required className="w-full pl-10 pr-3 py-3 rounded-xl border text-[14px] focus:outline-none focus:ring-2" style={{ background: "white", borderColor: vars.g200, color: ink, ["--tw-ring-color" as any]: accent }} />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-2" style={{ color: "white" }}>Company website <span className="font-normal normal-case tracking-normal text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>(optional)</span></label>
                    <div className="relative">
                      <Globe size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: vars.g400 }} />
                      <input type="url" value={signupWebsite} onChange={(e) => setSignupWebsite(e.target.value)} placeholder="https://yourcompany.com" autoComplete="url" className="w-full pl-10 pr-3 py-3 rounded-xl border text-[14px] focus:outline-none focus:ring-2" style={{ background: "white", borderColor: vars.g200, color: ink, ["--tw-ring-color" as any]: accent }} />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-2" style={{ color: "white" }}>Password <span className="font-normal normal-case tracking-normal text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>(min 8 characters)</span></label>
                    <div className="relative">
                      <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: vars.g400 }} />
                      <input type="password" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} placeholder="Choose a strong password" autoComplete="new-password" required className="w-full pl-10 pr-3 py-3 rounded-xl border text-[14px] focus:outline-none focus:ring-2" style={{ background: "white", borderColor: vars.g200, color: ink, ["--tw-ring-color" as any]: accent }} />
                    </div>
                  </div>
                  {signupError && (
                    <p className="sm:col-span-2 text-[13px] font-semibold text-center py-2 rounded-xl" style={{ color: "white", background: "rgba(220,38,38,0.25)" }}>{signupError}</p>
                  )}
                  <div className="sm:col-span-2">
                    <button type="submit" disabled={signupLoading} className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-[14px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:-translate-y-0.5 hover:shadow-lg hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed" style={{ background: accent }}>
                      {signupLoading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                      {signupLoading ? "Submitting…" : "Submit application"}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              /* --- SIGN-IN FORM --- */
              <>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "white", color: "#1A647B" }}>
                    <LogIn size={20} />
                  </div>
                  <div>
                    <h2 className="text-[22px] font-bold" style={{ color: "white", fontFamily: "'Alice', Georgia, serif" }}>Sign in to the platform</h2>
                    <p className="text-[14px] font-light" style={{ color: "rgba(255,255,255,0.75)" }}>Enter your username (or email) and password to continue.</p>
                  </div>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setLoginError(null);
                    void (async () => {
                      const result = await serverLogin(username, password);
                      if (result.ok) {
                        setUsername("");
                        setPassword("");
                        onLoginSuccess(result.session);
                      } else {
                        setLoginError(result.error === "pending_approval"
                          ? "Your account is pending approval. You'll be notified once it's been reviewed."
                          : result.error);
                      }
                    })();
                  }}
                  className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 lg:items-end"
                >
                  <div className="lg:col-span-5">
                    <label className="text-[12px] font-bold uppercase tracking-[0.18em] block mb-2" style={{ color: "white" }}>Username or email</label>
                    <div className="relative">
                      <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: vars.g400 }} />
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="username or email"
                        autoComplete="username"
                        className="w-full pl-10 pr-3 py-3 rounded-xl border text-[15px] focus:outline-none focus:ring-2 transition-all"
                        style={{ background: "white", borderColor: vars.g200, color: ink, ["--tw-ring-color" as any]: vars.teal }}
                      />
                    </div>
                  </div>
                  <div className="lg:col-span-4">
                    <label className="text-[12px] font-bold uppercase tracking-[0.18em] block mb-2" style={{ color: "white" }}>Password</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: vars.g400 }} />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password"
                        autoComplete="current-password"
                        className="w-full pl-10 pr-3 py-3 rounded-xl border text-[15px] focus:outline-none focus:ring-2 transition-all"
                        style={{ background: "white", borderColor: vars.g200, color: ink, ["--tw-ring-color" as any]: vars.teal }}
                      />
                    </div>
                  </div>
                  <div className="lg:col-span-3">
                    <button
                      type="submit"
                      className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-[14px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:-translate-y-0.5 hover:shadow-lg hover:brightness-110"
                      style={{ background: accent }}
                    >
                      <LogIn size={16} /> Sign in
                    </button>
                  </div>
                  {loginError && (
                    <p className="lg:col-span-12 text-[13px] font-semibold text-center" style={{ color: vars.red }}>
                      {loginError}
                    </p>
                  )}
                </form>
                <div className="mt-5 pt-5 flex items-center gap-3" style={{ borderTop: "1px solid rgba(255,255,255,0.15)" }}>
                  <span className="text-[13px] font-light" style={{ color: "rgba(255,255,255,0.6)" }}>New to AIO Fusion?</span>
                  <button
                    onClick={() => { setShowSignup(true); setLoginError(null); }}
                    className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.14em] hover:opacity-80 transition-opacity"
                    style={{ color: "white" }}
                  >
                    Create an account <ArrowRight size={13} />
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="rounded-2xl p-6 sm:p-8 mb-6 sm:mb-8 transition-all" style={{ background: "#1A647B", boxShadow: "0 12px 32px -12px rgba(26,100,123,0.35)" }}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.2)", color: "white" }}>
                  <User size={24} />
                </div>
                <div>
                  <span className="inline-flex items-center mb-1.5 px-5 py-2 rounded-md text-[20px] font-bold uppercase tracking-[0.16em]" style={{ background: session.role === "admin" ? ink : "rgba(79,143,255,0.15)", color: session.role === "admin" ? "white" : vars.teal }}>
                    {roleLabel(session.role)}
                  </span>
                  <p className="text-[12px] font-bold uppercase tracking-[0.18em]" style={{ color: "rgba(255,255,255,0.7)" }}>Signed in as</p>
                  <h2 className="text-[22px] font-bold leading-tight mt-0.5" style={{ color: "white", fontFamily: "'Alice', Georgia, serif" }}>
                    {accountLabel(getLocalUsers().find((u) => u.username.toLowerCase() === session.username.toLowerCase()) ?? { username: session.username })}
                  </h2>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {session.role === "admin" ? (
                  <>
                    <button
                      onClick={onManageUsers}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl text-[13px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:bg-white/10"
                      style={{ border: "1.5px solid rgba(255,255,255,0.5)" }}
                    >
                      <Users size={15} /> Manage Accounts
                    </button>
                    <button
                      onClick={onTokenUsage}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl text-[13px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:bg-white/10"
                      style={{ border: "1.5px solid rgba(255,255,255,0.5)" }}
                    >
                      Token Usage
                    </button>
                  </>
                ) : canCreateSubAccounts(session.role) ? (
                  <button
                    onClick={onManageSubAccounts}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl text-[13px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:bg-white/10"
                    style={{ border: "1.5px solid rgba(255,255,255,0.5)" }}
                  >
                    <Users size={15} /> Client Accounts
                  </button>
                ) : null}
                <button
                  onClick={onContinueToProjects}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl text-[13px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:-translate-y-0.5 hover:shadow-md hover:brightness-110"
                  style={{ background: accent }}
                >
                  Project Hub <ArrowRight size={15} />
                </button>
              </div>
            </div>

            {/* MY SESSIONS - expandable panel inside the signed-in card */}
            <div className="mt-6 pt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.2)" }}>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => {
                    const next = !showSessions;
                    setShowSessions(next);
                    if (next && mySessions === null) loadMySessions();
                  }}
                  className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.14em] hover:opacity-70 transition-opacity text-white"
                >
                  <MonitorSmartphone size={15} />
                  {showSessions ? "Hide Account Login Sessions" : "Account Login Sessions"}
                </button>
                <button
                  onClick={onSignOut}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:bg-white/10"
                  style={{ border: "1.5px solid rgba(255,255,255,0.5)" }}
                >
                  <LogOut size={15} /> Sign out
                </button>
              </div>

              {showSessions && (
                <div className="mt-5">
                  {sessionsLoading && (
                    <div className="flex items-center gap-2 text-[14px]" style={{ color: vars.g400 }}>
                      <Loader2 size={14} className="animate-spin" /> Loading sessions…
                    </div>
                  )}
                  {sessionsError && (
                    <p className="text-[13px] font-medium" style={{ color: vars.red }}>{sessionsError}</p>
                  )}
                  {!sessionsLoading && mySessions !== null && (
                    mySessions.length === 0 ? (
                      <p className="text-[13px] font-light" style={{ color: vars.g400 }}>No active sessions found.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: vars.g200 }}>
                        <table className="w-full text-left text-[13px]" style={{ borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ background: vars.g50, borderBottom: `1px solid ${vars.g200}` }}>
                              <th className="px-4 py-3 font-bold uppercase tracking-[0.12em] text-[11px]" style={{ color: vars.g500 }}>Started</th>
                              <th className="px-4 py-3 font-bold uppercase tracking-[0.12em] text-[11px]" style={{ color: vars.g500 }}>Expires</th>
                              <th className="px-4 py-3 font-bold uppercase tracking-[0.12em] text-[11px]" style={{ color: vars.g500 }}>IP</th>
                              <th className="px-4 py-3 font-bold uppercase tracking-[0.12em] text-[11px]" style={{ color: vars.g500 }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {mySessions.map((s, i) => (
                              <tr key={s.sid} style={{ background: i % 2 === 0 ? "white" : vars.g50, borderBottom: `1px solid ${vars.g200}` }}>
                                <td className="px-4 py-3 whitespace-nowrap font-mono" style={{ color: ink }}>
                                  {new Date(s.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                                  {" "}
                                  {new Date(s.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                                  {s.isCurrent && (
                                    <span className="ml-3 inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-[0.14em]" style={{ background: "rgba(34,197,94,0.1)", color: vars.green }}>
                                      This session
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap font-mono text-[12px]" style={{ color: vars.g500 }}>
                                  {new Date(s.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap font-mono text-[12px]" style={{ color: vars.g500 }}>
                                  {s.ipHint ?? "-"}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {!s.isCurrent && (
                                    <button
                                      onClick={() => handleRevokeSession(s.sid)}
                                      disabled={revokingSession === s.sid}
                                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-[0.12em] transition-all hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                                      style={{ color: vars.g500, border: `1.5px solid ${vars.g200}` }}
                                    >
                                      {revokingSession === s.sid ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                                      Revoke
                                    </button>
                                  )}
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

            {/* DANGER ZONE - self-serve account deletion (GDPR right to erasure) */}
            <div className="mt-4 pt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.2)" }}>
              <button
                onClick={() => { setShowDeleteAccount((v) => !v); setDeleteError(null); setDeletePassword(""); }}
                className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] hover:opacity-70 transition-opacity"
                style={{ color: "rgba(255,255,255,0.6)" }}
              >
                <Trash2 size={13} />
                {showDeleteAccount ? "Cancel account deletion" : "Delete my account and data"}
              </button>
              {showDeleteAccount && (
                <form onSubmit={handleDeleteAccount} className="mt-4 rounded-xl p-5" style={{ background: "rgba(0,0,0,0.18)" }}>
                  <p className="text-[13px] font-light leading-[1.7] mb-4" style={{ color: "rgba(255,255,255,0.85)" }}>
                    This permanently deletes your account, all your projects, archive items, planner entries and other data.
                    This cannot be undone. {canCreateSubAccounts(session.role) ? "If you have client accounts, remove them first." : ""}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                    <div className="flex-1">
                      <label className="text-[10px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: "rgba(255,255,255,0.7)" }}>Confirm your password</label>
                      <input
                        type="password"
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none"
                        style={{ borderColor: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.08)", color: "white" }}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={deleting}
                      className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-[12px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:opacity-90 disabled:opacity-50"
                      style={{ background: vars.red }}
                    >
                      {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      Permanently delete
                    </button>
                  </div>
                  {deleteError && <p className="mt-3 text-[13px] font-semibold" style={{ color: "#FFB4B4" }}>{deleteError}</p>}
                </form>
              )}
            </div>
          </div>
        )}

        {/* AIO MARKETING LOOP - full-width below login so all 7 steps fit */}
        <div className="rounded-2xl p-6 sm:p-10 mb-8 sm:mb-10" style={{ background: ink, boxShadow: "0 8px 24px -12px rgba(10,22,40,0.25)" }}>
          <div className="flex items-center gap-4 mb-8 sm:mb-8">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "white", color: "#1A647B" }}>
              <Repeat size={20} />
            </div>
            <div>
              <h2 className="text-[22px] font-bold" style={{ color: "white", fontFamily: "'Alice', Georgia, serif" }}>The AIO Marketing Loop</h2>
              <p className="text-[14px] font-light mt-1" style={{ color: "rgba(255,255,255,0.75)" }}>Each pass moves the needle on AI citations.</p>
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-3 sm:gap-2 items-stretch">
            {loopSteps.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="group relative flex flex-col items-center text-center gap-2.5 px-2 py-4 rounded-xl transition-all duration-300 hover:-translate-y-1 cursor-default bg-white" style={{ border: `1px solid ${vars.g200}` }}>
                  <div className="w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 bg-[#1A647B]/10 text-[#1A647B] group-hover:scale-110 group-hover:bg-[#C8497A] group-hover:text-white">
                    <Icon size={18} />
                  </div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: ink }}>{s.label}</div>
                  <div className="text-[11px] font-medium" style={{ color: vars.g500 }}>{s.sub}</div>
                  {i < loopSteps.length - 1 && (
                    <ChevronRight size={16} className="hidden lg:block absolute top-1/2 -right-3 -translate-y-1/2" style={{ color: vars.g300 }} />
                  )}
                </div>
              );
            })}
            <div className="group flex flex-col items-center justify-center gap-2.5 px-2 py-4 rounded-xl transition-all duration-300 hover:-translate-y-1 cursor-default" style={{ background: accent }}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 bg-white/20 group-hover:bg-white group-hover:scale-110">
                <Repeat size={20} className="transition-colors duration-300 text-white group-hover:text-[#C8497A]" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white">Repeat</span>
            </div>
          </div>
          <p className="text-[14px] font-medium mt-8 leading-[1.7] max-w-3xl" style={{ color: "rgba(255,255,255,0.8)" }}>
            The AIO Marketing Loop runs through every project: capture project data, audit earned media and site visibility, optimise content, plan and target releases, measure impact, then repeat.
          </p>
        </div>

        {/* HOW AIO FUSION WORKS - four guidance articles */}
        <div className="flex items-end justify-between mb-6 sm:mb-8">
          <div>
            <span className="text-[13px] font-bold uppercase tracking-[0.22em]" style={{ color: "#1A647B" }}>Guidance</span>
            <h2 className="text-2xl sm:text-3xl mt-2" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>How AIO Fusion works</h2>
          </div>
          <button
            onClick={onGuidance}
            className="hidden sm:flex items-center gap-2 text-[14px] font-bold uppercase tracking-[0.14em] hover:opacity-70 transition-opacity"
            style={{ color: ink }}
          >
            View all <ArrowRight size={14} />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {[
            { title: "Getting started with AIO Fusion", desc: "A walk-through of the platform, from intake to measurement.", type: "Article", icon: BookOpen },
            { title: "Running an AIO Diagnostic", desc: "How to interpret the diagnostic score and pick the first fixes.", type: "Article", icon: Search },
            { title: "Building a comms plan that scores", desc: "Turning the Comms Planner into AI authority impact.", type: "Article", icon: Calendar },
            { title: "Optimising content for AI citation", desc: "Tracked-changes editing for press releases, articles and case studies.", type: "Video", icon: FileEdit },
          ].map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.title}
                onClick={onGuidance}
                className="text-left rounded-2xl p-5 sm:p-6 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:bg-[#C8497A] flex flex-col group bg-white"
                style={{ border: `2px solid #1A647B` }}
              >
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:bg-white/20" style={{ background: "#1A647B1a", color: "#1A647B" }}>
                    <Icon size={20} className="transition-colors duration-300 group-hover:text-white" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] px-2.5 py-1.5 rounded-md transition-all duration-300 text-[#1A647B] group-hover:text-white group-hover:bg-white/20" style={{ background: "#1A647B0d" }}>{a.type}</span>
                </div>
                <h3 className="text-[17px] font-bold mb-2 leading-snug transition-colors duration-300 text-[#0a1628] group-hover:text-white" style={{ fontFamily: "'Alice', Georgia, serif" }}>{a.title}</h3>
                <p className="text-[14px] font-medium leading-[1.65] transition-colors duration-300 text-[#6b7280] group-hover:text-white/80">{a.desc}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { PlatformHomePage };
