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
import { type Session as LocalSession, type SessionInfo, serverLogin, serverLogout, serverGetSessions, serverRevokeSession, getUsers as getLocalUsers, canCreateSubAccounts } from "../lib/auth";
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
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showSessions, setShowSessions] = useState(false);
  const [mySessions, setMySessions] = useState<SessionInfo[] | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [revokingSession, setRevokingSession] = useState<string | null>(null);

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
  const paper = "#FBF6EC";
  const ink = "#102B36";
  const accent = "#C8497A";
  const accentSoft = "#FBE3ED";
  return (
    <div className="min-h-screen font-['Inter',sans-serif]" style={{ background: paper, color: ink }}>
      <header className="px-4 sm:px-10 py-4 sm:py-6 flex items-center justify-between" style={{ background: paper, borderBottom: `1px solid ${vars.g200}` }}>
        <button onClick={onBackToLanding} className="flex items-center gap-3.5">
          <img src={`${import.meta.env.BASE_URL}images/logo-color.png`} alt="AIO Fusion" className="h-16 sm:h-24" />
        </button>
        <button
          onClick={onBackToLanding}
          className="flex items-center gap-2 px-5 sm:px-7 py-3 sm:py-3.5 text-[12px] sm:text-[13px] font-bold uppercase tracking-[0.14em] transition-all hover:opacity-80"
          style={{ background: ink, color: paper }}
        >
          <ArrowLeft size={16} /> Back to website
        </button>
      </header>

      <div className="px-4 sm:px-10 py-10 sm:py-14 max-w-7xl mx-auto">
        <div className="mb-8 sm:mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4" style={{ background: accentSoft, border: `1px solid ${accent}40` }}>
            <Sparkles size={12} color={accent} />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>Platform Home</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>
            Welcome to <span style={{ color: accent }}>AIO Fusion</span>
          </h1>
          <p className="text-[16px] sm:text-[17px] font-light mt-4 max-w-2xl leading-[1.7]" style={{ color: vars.g600 }}>
            Sign in to manage your PR and marketing projects, then move through The AIO Marketing Loop to grow business AI authority.
          </p>
        </div>

        {/* LOGIN / SESSION - full-width across the page */}
        {!session ? (
          <div className="rounded-2xl p-6 sm:p-10 mb-6 sm:mb-8" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: accentSoft, color: accent }}>
                <LogIn size={18} />
              </div>
              <div>
                <h2 className="text-[20px] font-bold" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Sign in to the platform</h2>
                <p className="text-[13px] font-light" style={{ color: vars.g500 }}>Enter your account details to continue.</p>
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
                    setLoginError(result.error);
                  }
                })();
              }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 lg:items-end"
            >
              <div className="lg:col-span-5">
                <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-2" style={{ color: ink }}>Username</label>
                <div className="relative">
                  <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: vars.g400 }} />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="username"
                    autoComplete="username"
                    className="w-full pl-10 pr-3 py-3 rounded-lg border text-[14px] focus:outline-none focus:ring-2"
                    style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
                  />
                </div>
              </div>
              <div className="lg:col-span-4">
                <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-2" style={{ color: ink }}>Password</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: vars.g400 }} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    autoComplete="current-password"
                    className="w-full pl-10 pr-3 py-3 rounded-lg border text-[14px] focus:outline-none focus:ring-2"
                    style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
                  />
                </div>
              </div>
              <div className="lg:col-span-3">
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-full text-[13px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:opacity-90"
                  style={{ background: accent, boxShadow: `0 12px 28px ${accent}40` }}
                >
                  <LogIn size={15} /> Sign in
                </button>
              </div>
              {loginError && (
                <p className="lg:col-span-12 text-[12px] font-semibold text-center" style={{ color: accent }}>
                  {loginError}
                </p>
              )}
            </form>
          </div>
        ) : (
          <div className="rounded-2xl p-6 sm:p-8 mb-6 sm:mb-8" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: accentSoft, color: accent }}>
                  <User size={20} />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: vars.g500 }}>Signed in as</p>
                  <h2 className="text-[18px] font-bold leading-tight" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>
                    {accountLabel(getLocalUsers().find((u) => u.username.toLowerCase() === session.username.toLowerCase()) ?? { username: session.username })}
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.16em] align-middle" style={{ background: session.role === "admin" ? ink : accentSoft, color: session.role === "admin" ? paper : accent }}>
                      {roleLabel(session.role)}
                    </span>
                  </h2>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  onClick={onContinueToProjects}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full text-[12px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:opacity-90"
                  style={{ background: accent }}
                >
                  Continue to Project Hub <ArrowRight size={14} />
                </button>
                {session.role === "admin" ? (
                  <button
                    onClick={onManageUsers}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full text-[12px] font-bold uppercase tracking-[0.14em] transition-all hover:bg-black/5"
                    style={{ color: ink, border: `1.5px solid ${ink}30` }}
                  >
                    <Users size={14} /> Manage Accounts
                  </button>
                ) : canCreateSubAccounts(session.role) ? (
                  <button
                    onClick={onManageSubAccounts}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full text-[12px] font-bold uppercase tracking-[0.14em] transition-all hover:bg-black/5"
                    style={{ color: ink, border: `1.5px solid ${ink}30` }}
                  >
                    <Users size={14} /> Client accounts
                  </button>
                ) : null}
                <button
                  onClick={onSignOut}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full text-[12px] font-bold uppercase tracking-[0.14em] transition-all hover:bg-black/5"
                  style={{ color: vars.g500, border: `1.5px solid ${vars.g200}` }}
                >
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            </div>

            {/* MY SESSIONS — expandable panel inside the signed-in card */}
            <div className="mt-5 pt-5" style={{ borderTop: `1px solid ${vars.g200}` }}>
              <button
                onClick={() => {
                  const next = !showSessions;
                  setShowSessions(next);
                  if (next && mySessions === null) loadMySessions();
                }}
                className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] hover:opacity-70 transition-opacity"
                style={{ color: vars.g500 }}
              >
                <MonitorSmartphone size={14} />
                {showSessions ? "Hide" : "My Sessions"}
              </button>

              {showSessions && (
                <div className="mt-4">
                  {sessionsLoading && (
                    <div className="flex items-center gap-2 text-[13px]" style={{ color: vars.g400 }}>
                      <Loader2 size={13} className="animate-spin" /> Loading sessions…
                    </div>
                  )}
                  {sessionsError && (
                    <p className="text-[12px] font-medium" style={{ color: vars.red }}>{sessionsError}</p>
                  )}
                  {!sessionsLoading && mySessions !== null && (
                    mySessions.length === 0 ? (
                      <p className="text-[12px] font-light" style={{ color: vars.g400 }}>No active sessions found.</p>
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
                            {mySessions.map((s, i) => (
                              <tr key={s.sid} style={{ background: i % 2 === 0 ? "white" : vars.g100, borderBottom: `1px solid ${vars.g200}` }}>
                                <td className="px-3 py-2 whitespace-nowrap font-mono" style={{ color: ink }}>
                                  {new Date(s.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                                  {" "}
                                  {new Date(s.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                                  {s.isCurrent && (
                                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-[0.14em]" style={{ background: vars.green + "20", color: vars.green }}>
                                      This session
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap font-mono text-[11px]" style={{ color: vars.g500 }}>
                                  {new Date(s.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap font-mono text-[11px]" style={{ color: vars.g500 }}>
                                  {s.ipHint ?? "—"}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  {!s.isCurrent && (
                                    <button
                                      onClick={() => handleRevokeSession(s.sid)}
                                      disabled={revokingSession === s.sid}
                                      className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.12em] transition-all hover:opacity-80 disabled:opacity-40"
                                      style={{ color: accent, border: `1.5px solid ${accent}40` }}
                                    >
                                      {revokingSession === s.sid ? <Loader2 size={10} className="animate-spin" /> : <X size={10} />}
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
          </div>
        )}

        {/* AIO MARKETING LOOP - full-width below login so all 7 steps fit */}
        <div className="rounded-2xl p-6 sm:p-10 mb-8 sm:mb-10" style={{ background: ink, color: paper, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.25)" }}>
          <div className="flex items-center gap-3 mb-6 sm:mb-7">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)" }}>
              <Repeat size={18} color={paper} />
            </div>
            <div>
              <h2 className="text-[20px] font-bold" style={{ color: paper, fontFamily: "'Alice', Georgia, serif" }}>The AIO Marketing Loop</h2>
              <p className="text-[13px] font-light" style={{ color: "rgba(251,246,236,0.7)" }}>Each pass moves the needle on AI citations.</p>
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-3 sm:gap-2 items-stretch">
            {loopSteps.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="relative flex flex-col items-center text-center gap-2 px-2 py-3 rounded-xl" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: accentSoft, color: accent }}>
                    <Icon size={17} />
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: paper }}>{s.label}</div>
                  <div className="text-[10px] font-light" style={{ color: "rgba(251,246,236,0.6)" }}>{s.sub}</div>
                  {i < loopSteps.length - 1 && (
                    <ChevronRight size={14} className="hidden lg:block absolute top-1/2 -right-2.5 -translate-y-1/2" style={{ color: "rgba(251,246,236,0.3)" }} />
                  )}
                </div>
              );
            })}
            <div className="flex flex-col items-center justify-center gap-2 px-2 py-3 rounded-xl" style={{ background: accent, color: "white" }}>
              <Repeat size={20} />
              <span className="text-[10px] font-bold uppercase tracking-[0.14em]">Repeat</span>
            </div>
          </div>
          <p className="text-[13px] font-light mt-6 leading-[1.7] max-w-3xl" style={{ color: "rgba(251,246,236,0.8)" }}>
            The AIO Marketing Loop runs through every project: capture project data, audit earned media and site visibility, optimise content, plan and target releases, measure impact, then repeat.
          </p>
        </div>

        {/* HOW AIO FUSION WORKS - four guidance articles */}
        <div className="flex items-end justify-between mb-5 sm:mb-6">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>Guidance</span>
            <h2 className="text-2xl sm:text-3xl mt-2" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>How AIO Fusion works</h2>
          </div>
          <button
            onClick={onGuidance}
            className="hidden sm:flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] hover:opacity-70 transition-opacity"
            style={{ color: ink }}
          >
            View all <ArrowRight size={13} />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {[
            { title: "Getting started with AIO Fusion", desc: "A walk-through of the platform, from intake to measurement.", type: "Article", tint: accent, icon: BookOpen },
            { title: "Running an AIO Diagnostic", desc: "How to interpret the diagnostic score and pick the first fixes.", type: "Article", tint: vars.teal, icon: Search },
            { title: "Building a comms plan that scores", desc: "Turning the Comms Planner into AI authority impact.", type: "Article", tint: vars.gold, icon: Calendar },
            { title: "Optimising content for AI citation", desc: "Tracked-changes editing for press releases, articles and case studies.", type: "Video", tint: vars.green, icon: FileEdit },
          ].map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.title}
                onClick={onGuidance}
                className="text-left rounded-2xl p-5 sm:p-6 transition-all hover:-translate-y-1 flex flex-col"
                style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 4px 14px -8px rgba(16,43,54,0.08)" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = a.tint; e.currentTarget.style.boxShadow = `0 12px 28px -10px ${a.tint}40`; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = vars.g200; e.currentTarget.style.boxShadow = "0 4px 14px -8px rgba(16,43,54,0.08)"; }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${a.tint}18`, color: a.tint }}>
                    <Icon size={17} />
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-[0.18em] px-2 py-1 rounded-full" style={{ background: `${a.tint}15`, color: a.tint }}>{a.type}</span>
                </div>
                <h3 className="text-[15px] font-bold mb-1.5 leading-snug" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>{a.title}</h3>
                <p className="text-[12.5px] font-light leading-[1.65]" style={{ color: vars.g600 }}>{a.desc}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { PlatformHomePage };
