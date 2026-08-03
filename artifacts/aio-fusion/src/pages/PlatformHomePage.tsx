import { useState, useEffect } from "react";
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
import { type Session as LocalSession, type SessionInfo, type MfaChallenge, serverLogin, serverLogout, serverGetSessions, serverRevokeSession, serverSelfDeleteAccount, serverSignUp, serverResendVerification, serverForgotPassword, serverResetPassword, serverChangeMyPassword, getUsers as getLocalUsers, canCreateSubAccounts } from "../lib/auth";
import { MfaLoginStep, MfaSecuritySection } from "../components/MfaPanels";
import { apiBase } from "../lib/apiHelpers";
import { roleLabel, accountLabel } from "../lib/accountLabels";
function PlatformHomePage({
  onCreateProject,
  onContinueToProjects,
  onArchivedProjects,
  onGuidance,
  onBackToLanding,
  session,
  onLoginSuccess,
  onNeedsSetup,
  onSignOut,
  onManageUsers,
  onManageSubAccounts,
  onTokenUsage,
  onOpenGeorge,
  initialNotice,
  resetToken: resetTokenProp,
  oauthRedirectParams,
  onOauthParamsConsumed,
}: {
  onCreateProject: () => void;
  onContinueToProjects: () => void;
  onArchivedProjects: () => void;
  onGuidance: () => void;
  onBackToLanding: () => void;
  session: LocalSession | null;
  onLoginSuccess: (s: LocalSession) => void;
  onNeedsSetup?: () => void;
  onSignOut: () => void;
  onManageUsers: () => void;
  onManageSubAccounts: () => void;
  onTokenUsage: () => void;
  onOpenGeorge?: () => void;
  initialNotice?: string;
  resetToken?: string | null;
  /** Initial URL query string captured by App before the history-sync effect
   *  strips it — the OAuth/MFA/verification redirect params live here. */
  oauthRedirectParams?: string | null;
  onOauthParamsConsumed?: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(initialNotice ?? null);
  const [mfaChallenge, setMfaChallenge] = useState<MfaChallenge | null>(null);
  const [showSessions, setShowSessions] = useState(false);
  const [mySessions, setMySessions] = useState<SessionInfo[] | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [revokingSession, setRevokingSession] = useState<string | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [changeCurrentPassword, setChangeCurrentPassword] = useState("");
  const [changeNewPassword1, setChangeNewPassword1] = useState("");
  const [changeNewPassword2, setChangeNewPassword2] = useState("");
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);
  const [changePasswordDone, setChangePasswordDone] = useState(false);
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
  // Email verification pending (password signup only)
  const [signupAwaitingVerification, setSignupAwaitingVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  // Forgot / reset password
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(resetTokenProp ?? null);
  const [resetPassword1, setResetPassword1] = useState("");
  const [resetPassword2, setResetPassword2] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);

  // Arriving from a password-reset email link (/?reset_token=...): the token
  // is captured by App.tsx before its history sync strips the query string and
  // handed down as a prop. Also read the URL directly as a fallback, and clean
  // the token out of the URL so it never lingers in history.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("reset_token");
    if (!token) return;
    setResetToken(token);
    params.delete("reset_token");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
  }, []);

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotLoading || !forgotEmail.trim()) return;
    setForgotLoading(true);
    void serverForgotPassword(forgotEmail.trim())
      .then(() => setForgotSent(true))
      .finally(() => setForgotLoading(false));
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    if (resetPassword1.length < 8) { setResetError("Password must be at least 8 characters."); return; }
    if (resetPassword1 !== resetPassword2) { setResetError("Passwords do not match."); return; }
    if (!resetToken) { setResetError("This reset link is invalid. Please request a new one."); return; }
    setResetLoading(true);
    void serverResetPassword(resetToken, resetPassword1)
      .then((r) => {
        if (!r.ok) { setResetError(r.error); return; }
        setResetDone(true);
      })
      .finally(() => setResetLoading(false));
  };

  // Handle Google OAuth redirect back to this page
  useEffect(() => {
    // Prefer the query string App captured on load — the history-sync effect
    // in App.tsx strips the URL params before this lazy page mounts.
    const params = new URLSearchParams(oauthRedirectParams ?? window.location.search);
    const status = params.get("oauth_status");
    const linkGoogle = params.get("link_google");
    if (!status && !linkGoogle && !params.get("verify_status")) return;
    onOauthParamsConsumed?.();
    // Clean the OAuth params from the URL without a reload
    window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    if (linkGoogle) {
      if (linkGoogle === "ok") {
        setLoginError(null);
      }
      return;
    }
    if (status === "mfa") {
      // SSO login needs a two-factor step: the callback redirected here with a
      // short-lived pending token instead of a session. Show the MFA panel.
      const mfaToken = params.get("mfa_token") ?? "";
      const mfaMode = params.get("mfa_mode") ?? "verify";
      if (mfaToken) {
        setMfaChallenge({ mfaToken, enroll: mfaMode === "enroll" });
      } else {
        setLoginError("Two-factor sign-in could not be started. Please try again.");
      }
    } else if (status === "suspended") {
      setLoginError("Your account has been suspended. Please contact support.");
    } else if (status === "error") {
      const msg = params.get("oauth_msg") ?? "unknown";
      const friendly: Record<string, string> = {
        not_configured: "Google Sign-In is not enabled on this server.",
        invalid_state: "The sign-in session expired. Please try again.",
        token_exchange_failed: "Could not complete sign-in with Google. Please try again.",
        no_access_token: "Google did not return a valid token. Please try again.",
        userinfo_failed: "Could not retrieve your Google profile. Please try again.",
        no_email: "Your Google account does not have a verified email. Please use password sign-in.",
        unexpected: "An unexpected error occurred. Please try again.",
        access_denied: "Sign-in was cancelled.",
      };
      setLoginError(friendly[msg] ?? `Google sign-in failed (${msg}). Please try again or sign in with your password.`);
    }
    // status === "ok": session cookie set by server; App.tsx's session loader picks it up automatically

    // Verification link errors — redirect back to the verification-pending screen
    const verifyStatus = params.get("verify_status");
    if (verifyStatus === "expired") {
      setLoginError("Your verification link has expired. Request a new one below.");
      setSignupAwaitingVerification(true);
    } else if (verifyStatus === "invalid" || verifyStatus === "error") {
      setLoginError("This verification link is invalid. Please request a new one.");
      setSignupAwaitingVerification(true);
    }
  }, []);

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
      if (!r.ok) { setSignupError(r.error); return; }
      if (r.needsVerification) {
        setVerificationEmail(r.email);
        setSignupAwaitingVerification(true);
        return;
      }
      onLoginSuccess(r.session);
    }).finally(() => setSignupLoading(false));
  };

  const handleResendVerification = () => {
    if (resendLoading) return;
    setResendLoading(true);
    setResendSent(false);
    void serverResendVerification(verificationEmail)
      .then(() => { setResendSent(true); })
      .finally(() => setResendLoading(false));
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

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setChangePasswordError(null);
    if (!changeCurrentPassword) { setChangePasswordError("Enter your current password."); return; }
    if (changeNewPassword1.length < 8) { setChangePasswordError("New password must be at least 8 characters."); return; }
    if (changeNewPassword1 !== changeNewPassword2) { setChangePasswordError("New passwords do not match."); return; }
    setChangePasswordLoading(true);
    void serverChangeMyPassword(changeCurrentPassword, changeNewPassword1)
      .then((r) => {
        if (!r.ok) { setChangePasswordError(r.error); return; }
        setChangePasswordDone(true);
        setChangeCurrentPassword("");
        setChangeNewPassword1("");
        setChangeNewPassword2("");
      })
      .finally(() => setChangePasswordLoading(false));
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
            Welcome to <span style={{ color: accent }}>AIO Fusion</span><span className="text-2xl sm:text-3xl lg:text-4xl font-light ml-2 align-baseline" style={{ color: vars.g500 }}>(beta)</span>
          </h1>
          <p className="text-[16px] sm:text-[18px] font-light mt-4 leading-[1.7] whitespace-nowrap" style={{ color: vars.g600 }}>
            Sign in to manage your PR and marketing projects, then move through The AIO Marketing Loop to grow business AI authority.
          </p>
        </div>

        {/* LOGIN / SIGN-UP / SESSION - full-width across the page */}
        {!session ? (
          <div className="rounded-2xl p-6 sm:p-10 mb-6 sm:mb-8" style={{ background: "#1A647B", boxShadow: "0 8px 24px -12px rgba(26,100,123,0.35)" }}>

            {resetToken ? (
              /* --- RESET PASSWORD (from email link) --- */
              <div className="max-w-md mx-auto py-4">
                {resetDone ? (
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: "rgba(255,255,255,0.15)" }}>
                      <CheckCircle2 size={28} color="white" />
                    </div>
                    <h2 className="text-[26px] font-bold mb-2" style={{ color: "white", fontFamily: "'Alice', Georgia, serif" }}>
                      Password updated
                    </h2>
                    <p className="text-[15px] mb-6 leading-[1.7]" style={{ color: "rgba(255,255,255,0.8)" }}>
                      Your password has been changed and you've been signed out everywhere.
                      Sign in with your new password to continue.
                    </p>
                    <button
                      type="button"
                      onClick={() => { setResetToken(null); setResetDone(false); setResetPassword1(""); setResetPassword2(""); }}
                      className="flex items-center justify-center gap-2 mx-auto px-8 py-3.5 rounded-xl text-[14px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:-translate-y-0.5 hover:shadow-lg hover:brightness-110"
                      style={{ background: accent }}
                    >
                      <LogIn size={16} /> Sign in
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-center mb-6">
                      <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: "rgba(255,255,255,0.15)" }}>
                        <KeyRound size={28} color="white" />
                      </div>
                      <h2 className="text-[26px] font-bold mb-2" style={{ color: "white", fontFamily: "'Alice', Georgia, serif" }}>
                        Choose a new password
                      </h2>
                      <p className="text-[14px] leading-[1.7]" style={{ color: "rgba(255,255,255,0.7)" }}>
                        Enter a new password for your account. Once saved, you'll be signed
                        out of all devices and can sign in with the new password.
                      </p>
                    </div>
                    <form onSubmit={handleResetPassword} className="flex flex-col gap-3">
                      <div className="relative">
                        <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: vars.g400 }} />
                        <input
                          type="password"
                          value={resetPassword1}
                          onChange={(e) => setResetPassword1(e.target.value)}
                          placeholder="New password (min 8 characters)"
                          autoComplete="new-password"
                          required
                          className="w-full pl-10 pr-4 py-3 rounded-xl border text-[15px] focus:outline-none focus:ring-2 transition-all"
                          style={{ background: "white", borderColor: vars.g200, color: ink, ["--tw-ring-color" as any]: accent }}
                        />
                      </div>
                      <div className="relative">
                        <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: vars.g400 }} />
                        <input
                          type="password"
                          value={resetPassword2}
                          onChange={(e) => setResetPassword2(e.target.value)}
                          placeholder="Confirm new password"
                          autoComplete="new-password"
                          required
                          className="w-full pl-10 pr-4 py-3 rounded-xl border text-[15px] focus:outline-none focus:ring-2 transition-all"
                          style={{ background: "white", borderColor: vars.g200, color: ink, ["--tw-ring-color" as any]: accent }}
                        />
                      </div>
                      {resetError && (
                        <p className="text-[13px] font-semibold text-center py-2 px-3 rounded-xl" style={{ color: "white", background: "rgba(220,38,38,0.3)" }}>
                          {resetError}
                        </p>
                      )}
                      <button
                        type="submit"
                        disabled={resetLoading}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-[14px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:-translate-y-0.5 hover:shadow-lg hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
                        style={{ background: accent }}
                      >
                        {resetLoading ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                        {resetLoading ? "Saving…" : "Set new password"}
                      </button>
                    </form>
                    <button
                      type="button"
                      onClick={() => { setResetToken(null); setResetError(null); }}
                      className="mt-5 text-[13px] hover:opacity-70 transition-opacity block mx-auto"
                      style={{ color: "rgba(255,255,255,0.5)" }}
                    >
                      ← Back to sign in
                    </button>
                  </>
                )}
              </div>
            ) : showForgotPassword ? (
              /* --- FORGOT PASSWORD --- */
              <div className="max-w-md mx-auto py-4 text-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: "rgba(255,255,255,0.15)" }}>
                  <KeyRound size={28} color="white" />
                </div>
                <h2 className="text-[26px] font-bold mb-2" style={{ color: "white", fontFamily: "'Alice', Georgia, serif" }}>
                  Forgot your password?
                </h2>
                {forgotSent ? (
                  <>
                    <p className="text-[15px] mb-6 leading-[1.7]" style={{ color: "rgba(255,255,255,0.8)" }}>
                      If an account exists for <strong>{forgotEmail.trim()}</strong>, we've sent
                      a password reset link. It can be used once and expires in 1 hour —
                      check your inbox (and spam folder).
                    </p>
                    <button
                      type="button"
                      onClick={() => { setShowForgotPassword(false); setForgotSent(false); setForgotEmail(""); }}
                      className="text-[13px] hover:opacity-70 transition-opacity block mx-auto"
                      style={{ color: "rgba(255,255,255,0.5)" }}
                    >
                      ← Back to sign in
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-[14px] mb-6 leading-[1.7]" style={{ color: "rgba(255,255,255,0.7)" }}>
                      Enter the email address for your account and we'll send you a link
                      to reset your password.
                    </p>
                    <form onSubmit={handleForgotPassword} className="flex flex-col gap-3">
                      <div className="relative">
                        <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: vars.g400 }} />
                        <input
                          type="email"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          placeholder="your@email.com"
                          autoComplete="email"
                          required
                          className="w-full pl-10 pr-4 py-3 rounded-xl border text-[15px] focus:outline-none focus:ring-2 transition-all"
                          style={{ background: "white", borderColor: vars.g200, color: ink, ["--tw-ring-color" as any]: accent }}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={forgotLoading || !forgotEmail.trim()}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-[14px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:-translate-y-0.5 hover:shadow-lg hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
                        style={{ background: accent }}
                      >
                        {forgotLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        {forgotLoading ? "Sending…" : "Send reset link"}
                      </button>
                    </form>
                    <button
                      type="button"
                      onClick={() => { setShowForgotPassword(false); setForgotEmail(""); }}
                      className="mt-5 text-[13px] hover:opacity-70 transition-opacity block mx-auto"
                      style={{ color: "rgba(255,255,255,0.5)" }}
                    >
                      ← Back to sign in
                    </button>
                  </>
                )}
              </div>
            ) : signupAwaitingVerification ? (
              /* --- EMAIL VERIFICATION PENDING --- */
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: "rgba(255,255,255,0.15)" }}>
                  <Mail size={28} color="white" />
                </div>
                <h2 className="text-[26px] font-bold mb-2" style={{ color: "white", fontFamily: "'Alice', Georgia, serif" }}>
                  {verificationEmail ? "Check your inbox" : "Verification link expired"}
                </h2>
                {verificationEmail ? (
                  <p className="text-[15px] mb-2 leading-[1.7]" style={{ color: "rgba(255,255,255,0.8)" }}>
                    We've sent a verification link to <strong>{verificationEmail}</strong>.
                    Click it to finish creating your account.
                  </p>
                ) : (
                  <p className="text-[15px] mb-2 leading-[1.7]" style={{ color: "rgba(255,255,255,0.8)" }}>
                    Your link has expired. Enter your email below to get a new one.
                  </p>
                )}
                <p className="text-[13.5px] mb-6" style={{ color: "rgba(255,255,255,0.5)" }}>
                  Didn't receive the email? Check your spam folder, then use the button below.
                </p>
                {loginError && (
                  <p className="text-[13px] font-semibold text-center py-2 px-3 rounded-xl mb-5" style={{ color: "white", background: "rgba(220,38,38,0.3)" }}>
                    {loginError}
                  </p>
                )}
                {!verificationEmail && (
                  <div className="mb-4 max-w-xs mx-auto">
                    <input
                      type="email"
                      placeholder="your@email.com"
                      onChange={(e) => setVerificationEmail(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border text-[14px] focus:outline-none"
                      style={{ background: "white", borderColor: "transparent", color: "#0a1628" }}
                    />
                  </div>
                )}
                {resendSent ? (
                  <p className="text-[13px] text-center py-3 rounded-xl mb-4 flex items-center justify-center gap-2" style={{ color: "white", background: "rgba(255,255,255,0.12)" }}>
                    <CheckCircle2 size={14} /> New link sent! Check your inbox.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={resendLoading || !verificationEmail}
                    className="flex items-center justify-center gap-2 mx-auto px-6 py-3 rounded-xl text-[13px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:bg-white/10 disabled:opacity-40"
                    style={{ border: "1.5px solid rgba(255,255,255,0.5)" }}
                  >
                    {resendLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    Resend verification email
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setSignupAwaitingVerification(false); setShowSignup(false); setLoginError(null); setResendSent(false); }}
                  className="mt-5 text-[13px] hover:opacity-70 transition-opacity block mx-auto"
                  style={{ color: "rgba(255,255,255,0.5)" }}
                >
                  ← Back to sign in
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
                      <p className="text-[14px] font-light" style={{ color: "rgba(255,255,255,0.75)" }}>Fill in your details to get started straight away.</p>
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
                {/* Sign up with Google / Microsoft */}
                <div className="mb-5">
                  <div className="flex flex-col sm:flex-row gap-3 mb-4">
                    <a
                      href={`${apiBase()}/api/platform/auth/google`}
                      className="flex items-center justify-center gap-3 flex-1 px-5 py-3.5 rounded-xl text-[14px] font-semibold transition-all hover:-translate-y-0.5 hover:shadow-md"
                      style={{ background: "white", color: "#0a1628" }}
                    >
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                      Google
                    </a>
                    <a
                      href={`${apiBase()}/api/platform/auth/microsoft`}
                      className="flex items-center justify-center gap-3 flex-1 px-5 py-3.5 rounded-xl text-[14px] font-semibold transition-all hover:-translate-y-0.5 hover:shadow-md"
                      style={{ background: "white", color: "#0a1628" }}
                    >
                      <svg width="36" height="36" viewBox="0 0 21 21" fill="none" aria-hidden="true">
                        <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                        <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                        <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                        <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                      </svg>
                      Microsoft
                    </a>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.2)" }} />
                    <span className="text-[12px] font-light" style={{ color: "rgba(255,255,255,0.55)" }}>or fill in your details below</span>
                    <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.2)" }} />
                  </div>
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
            ) : mfaChallenge ? (
              /* --- MFA CHALLENGE (second sign-in step) --- */
              <MfaLoginStep
                challenge={mfaChallenge}
                onCancel={() => { setMfaChallenge(null); setLoginError(null); }}
                onSuccess={(mfaSession, needsSetup) => {
                  setMfaChallenge(null);
                  setUsername("");
                  onLoginSuccess(mfaSession);
                  if (needsSetup) onNeedsSetup?.();
                }}
              />
            ) : (
              /* --- SIGN-IN FORM --- */
              <>
                <div className="flex items-start justify-between gap-3 mb-1">
                  <h2 className="text-[24px] font-bold" style={{ color: "white", fontFamily: "'Alice', Georgia, serif" }}>Sign in</h2>
                  <button
                    type="button"
                    onClick={() => { setShowSignup(true); setLoginError(null); }}
                    className="flex items-center gap-2 text-[24px] font-bold hover:opacity-80 transition-opacity"
                    style={{ color: "white", fontFamily: "'Alice', Georgia, serif" }}
                  >
                    Create an account <ArrowRight size={20} />
                  </button>
                </div>
                <p className="text-[14px] mb-6" style={{ color: "white" }}>
                  Welcome back — sign in to manage your projects.
                </p>

                {/* SSO — Google + Microsoft */}
                <div className="flex flex-col sm:flex-row gap-3 mb-5">
                  <a
                    href={`${apiBase()}/api/platform/auth/google`}
                    className="flex items-center justify-center gap-3 flex-1 px-5 py-3.5 rounded-xl text-[14px] font-semibold transition-all hover:-translate-y-0.5 hover:shadow-lg border"
                    style={{ background: "white", color: "#3c4043", borderColor: "#dadce0" }}
                  >
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Google
                  </a>
                  <a
                    href={`${apiBase()}/api/platform/auth/microsoft`}
                    className="flex items-center justify-center gap-3 flex-1 px-5 py-3.5 rounded-xl text-[14px] font-semibold transition-all hover:-translate-y-0.5 hover:shadow-lg border"
                    style={{ background: "white", color: "#0a1628", borderColor: "#e2e8f0" }}
                  >
                    <svg width="36" height="36" viewBox="0 0 21 21" fill="none" aria-hidden="true">
                      <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                      <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                      <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                      <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                    </svg>
                    Microsoft
                  </a>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.2)" }} />
                  <span className="text-[15px]" style={{ color: "white" }}>or sign in with email</span>
                  <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.2)" }} />
                </div>

                {/* Email + password stacked */}
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
                        if (result.needsSetup) onNeedsSetup?.();
                      } else if ("mfa" in result) {
                        setPassword("");
                        setMfaChallenge(result.mfa);
                      } else {
                        setLoginError(result.error);
                      }
                    })();
                  }}
                  className="flex flex-col gap-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="relative">
                      <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: vars.g400 }} />
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Email or username"
                        autoComplete="username"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border text-[15px] focus:outline-none focus:ring-2 transition-all"
                        style={{ background: "white", borderColor: vars.g200, color: ink, ["--tw-ring-color" as any]: vars.teal }}
                      />
                    </div>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: vars.g400 }} />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        autoComplete="current-password"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border text-[15px] focus:outline-none focus:ring-2 transition-all"
                        style={{ background: "white", borderColor: vars.g200, color: ink, ["--tw-ring-color" as any]: vars.teal }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end -mt-1">
                    <button
                      type="button"
                      onClick={() => { setShowForgotPassword(true); setLoginError(null); }}
                      className="text-[13px] hover:opacity-70 transition-opacity"
                      style={{ color: "rgba(255,255,255,0.6)" }}
                    >
                      Forgot password?
                    </button>
                  </div>
                  {loginError && (
                    <p className="text-[13px] font-semibold text-center py-2 px-3 rounded-xl" style={{ color: "white", background: "rgba(220,38,38,0.25)" }}>
                      {loginError}
                    </p>
                  )}
                  <button
                    type="submit"
                    className="self-center w-full sm:w-auto sm:min-w-[220px] flex items-center justify-center gap-2 px-10 py-3.5 rounded-xl text-[14px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:-translate-y-0.5 hover:shadow-lg hover:brightness-110 mt-1"
                    style={{ background: accent }}
                  >
                    <LogIn size={16} /> Sign in
                  </button>
                </form>
                {onOpenGeorge && (
                  <div className="mt-3 flex justify-center">
                    <button
                      type="button"
                      onClick={onOpenGeorge}
                      className="flex items-center gap-1.5 text-[13px] hover:opacity-80 transition-opacity"
                      style={{ color: "white" }}
                    >
                      <HelpCircle size={14} />
                      Need help? Ask GEOrge
                    </button>
                  </div>
                )}
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

            {/* TWO-FACTOR AUTHENTICATION - status + opt-in management */}
            <MfaSecuritySection session={session} />

            {/* CHANGE PASSWORD - proactive credential change for signed-in users */}
            <div className="mt-4 pt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.2)" }}>
              <button
                onClick={() => {
                  setShowChangePassword((v) => !v);
                  setChangePasswordError(null);
                  setChangePasswordDone(false);
                  setChangeCurrentPassword("");
                  setChangeNewPassword1("");
                  setChangeNewPassword2("");
                }}
                className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.14em] hover:opacity-70 transition-opacity text-white"
              >
                <KeyRound size={15} />
                {showChangePassword ? "Hide Change Password" : "Change Password"}
              </button>
              {showChangePassword && (
                <form onSubmit={handleChangePassword} className="mt-4 rounded-xl p-5" style={{ background: "rgba(0,0,0,0.18)" }}>
                  {changePasswordDone ? (
                    <div className="flex items-center gap-2 text-[14px] font-medium" style={{ color: "#86efac" }}>
                      <CheckCircle2 size={16} /> Password changed. Other devices have been signed out.
                    </div>
                  ) : (
                    <>
                      <p className="text-[13px] font-light leading-[1.7] mb-4" style={{ color: "rgba(255,255,255,0.85)" }}>
                        Enter your current password, then choose a new one (at least 8 characters).
                        You will stay signed in here, but every other device will be signed out.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: "rgba(255,255,255,0.7)" }}>Current password</label>
                          <input
                            type="password"
                            autoComplete="current-password"
                            value={changeCurrentPassword}
                            onChange={(e) => setChangeCurrentPassword(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none"
                            style={{ borderColor: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.08)", color: "white" }}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: "rgba(255,255,255,0.7)" }}>New password</label>
                          <input
                            type="password"
                            autoComplete="new-password"
                            value={changeNewPassword1}
                            onChange={(e) => setChangeNewPassword1(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none"
                            style={{ borderColor: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.08)", color: "white" }}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: "rgba(255,255,255,0.7)" }}>Confirm new password</label>
                          <input
                            type="password"
                            autoComplete="new-password"
                            value={changeNewPassword2}
                            onChange={(e) => setChangeNewPassword2(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none"
                            style={{ borderColor: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.08)", color: "white" }}
                          />
                        </div>
                      </div>
                      {changePasswordError && (
                        <p className="mt-3 text-[13px] font-medium" style={{ color: "#fca5a5" }}>{changePasswordError}</p>
                      )}
                      <button
                        type="submit"
                        disabled={changePasswordLoading}
                        className="mt-4 flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-[12px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:opacity-90 disabled:opacity-50"
                        style={{ background: accent }}
                      >
                        {changePasswordLoading ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                        Change Password
                      </button>
                    </>
                  )}
                </form>
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
