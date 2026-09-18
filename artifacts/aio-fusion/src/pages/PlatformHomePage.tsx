import { useState, useEffect, useRef } from "react";
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
import { type Session as LocalSession, type SessionInfo, type MfaChallenge, serverLogin, serverLogout, serverGetSessions, serverRevokeSession, serverSelfDeleteAccount, serverSignUp, serverGetDiscountInvite, serverResendVerification, serverForgotPassword, serverResetPassword, serverChangeMyPassword, serverRequestSetPassword, canCreateSubAccounts, loadLastSignIn, saveLastSignIn, markPendingSso, clearPendingSso } from "../lib/auth";
import { MfaLoginStep, MfaSecuritySection } from "../components/MfaPanels";
import { apiBase } from "../lib/apiHelpers";
import { roleLabel } from "../lib/accountLabels";
import { BetaTrialBanner } from "../components/BetaTrialBanner";

function membershipRoleLabel(role: NonNullable<LocalSession["membershipRole"]>): string {
  if (role === "content") return "Content Team Member";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function sessionAccessLabel(session: LocalSession): string {
  if (session.membershipRole) return membershipRoleLabel(session.membershipRole);
  return session.role === "admin" ? "Admin" : "Owner";
}

export function getSessionIdentityLabels(session: LocalSession): {
  signedInAs: string;
  companyName: string;
  access: string;
} {
  return {
    signedInAs: session.userName || session.userEmail || session.username,
    companyName: session.companyName || session.username,
    access: sessionAccessLabel(session),
  };
}

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
  onPrivacyRights,
  onManageTeam,
  onManageSubAccounts,
  onInsightsAdmin,
  onOpenGeorge,
  initialNotice,
  resetToken: resetTokenProp,
  isWelcomeLink,
  hasPassword,
  oauthRedirectParams,
  onOauthParamsConsumed,
  backToAgency,
  discountInviteToken,
  authPending = false,
  authError,
  onRetryAuthentication,
}: {
  onCreateProject: () => void;
  onContinueToProjects: () => void;
  onArchivedProjects: () => void;
  onGuidance: () => void;
  onBackToLanding: () => void;
  /** "Back to my agency account" control, present while an agency user is working inside a client account. */
  backToAgency?: React.ReactNode;
  session: LocalSession | null;
  onLoginSuccess: (s: LocalSession) => void;
  onSignOut: () => void;
  onManageUsers: () => void;
  onPrivacyRights?: () => void;
  onManageTeam?: () => void;
  onManageSubAccounts: () => void;
  /** Retained for compatibility with older callers; Token Usage now lives inside Manage Accounts. */
  onTokenUsage?: () => void;
  onInsightsAdmin?: () => void;
  onOpenGeorge?: () => void;
  initialNotice?: string;
  resetToken?: string | null;
  /** True when reset_token arrived via a welcome email (?welcome=1). Shows
   *  "Set your password" copy instead of "Choose a new password". */
  isWelcomeLink?: boolean;
  /** Whether the signed-in account already has a password hash. false = SSO-only
   *  (Google/Microsoft only, no password set yet). undefined = not yet resolved. */
  hasPassword?: boolean;
  /** Initial URL query string captured by App before the history-sync effect
   *  strips it - the OAuth/MFA/verification redirect params live here. */
  oauthRedirectParams?: string | null;
  onOauthParamsConsumed?: () => void;
  /** Token from a discount-invite link (/?discount_invite=...). Captured by
   *  App before the history-sync effect strips the query string. */
  discountInviteToken?: string | null;
  /** A credential was accepted, but its cookie/setup authority is still being
   * verified. No authenticated data is rendered in this state. */
  authPending?: boolean;
  /** A failed authority check is surfaced in the sign-in layout, never as an
   * authenticated fallback. */
  authError?: string | null;
  onRetryAuthentication?: () => void;
}) {
  // Pre-fill the email and remember the method from the last successful
  // sign-in on this browser - kept across logout on purpose (never the
  // password, only the identifier).
  const [lastSignIn] = useState(() => loadLastSignIn());
  const [username, setUsername] = useState(() => lastSignIn?.email ?? "");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(initialNotice ?? null);
  const [mfaChallenge, setMfaChallenge] = useState<MfaChallenge | null>(null);
  const loginInFlight = useRef(false);
  const [loginLoading, setLoginLoading] = useState(false);
  // Sign-up form
  const [showSignup, setShowSignup] = useState(() => Boolean(discountInviteToken));
  // Discount invite (beta/VIP link). Looked up server-side so the signup form
  // can pre-fill the invitee's email and show the discount transparently.
  const [discountInvite, setDiscountInvite] = useState<{ email: string; percent: number; label: string } | null>(null);
  const [discountInviteError, setDiscountInviteError] = useState<string | null>(null);

  // Resolve the discount-invite token (if any) once on mount: pre-fill the
  // invitee's email and surface the discount, or explain why the link failed.
  useEffect(() => {
    if (!discountInviteToken) return;
    void serverGetDiscountInvite(discountInviteToken).then((r) => {
      if (r.ok) {
        setDiscountInvite({ email: r.email, percent: r.percent, label: r.label });
        setSignupEmail((prev) => prev || r.email);
        setShowSignup(true);
      } else {
        setDiscountInviteError(r.error);
        setShowSignup(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discountInviteToken]);
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

  useEffect(() => {
    if (authError) setLoginError(authError);
  }, [authError]);

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
    // Prefer the query string App captured on load - the history-sync effect
    // in App.tsx strips the URL params before this lazy page mounts.
    const params = new URLSearchParams(oauthRedirectParams ?? window.location.search);
    const status = params.get("oauth_status");
    const linkGoogle = params.get("link_google");
    if (!status && !linkGoogle && !params.get("verify_status")) return;
    // A failed/cancelled SSO attempt must not overwrite the remembered method.
    if (status && status !== "ok") clearPendingSso();
    onOauthParamsConsumed?.();
    // Clean the OAuth params from the URL without a reload
    window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    if (linkGoogle) {
      if (linkGoogle === "ok") {
        setLoginError(null);
      }
      return;
    }
    if (status === "linked_microsoft") {
      // Microsoft account linked successfully - nothing to show, the account
      // page will reflect the linked state on next load.
      setLoginError(null);
    } else if (status === "mfa") {
      // SSO login needs a two-factor step: the callback set a short-lived
      // cookie holding the pending token (kept out of the URL so it never
      // lands in browser history or logs). Read it once, clear it, and show
      // the MFA panel.
      const cookieName = "aio_oauth_mfa_token";
      const match = document.cookie
        .split("; ")
        .find((c) => c.startsWith(`${cookieName}=`));
      const mfaToken = match ? decodeURIComponent(match.slice(cookieName.length + 1)) : "";
      // Clear the cookie immediately - it is single-use.
      document.cookie = `${cookieName}=; path=/; max-age=0`;
      const mfaMode = params.get("mfa_mode") ?? "verify";
      if (mfaToken) {
        setMfaChallenge({ mfaToken, enroll: mfaMode === "enroll" });
      } else {
        setLoginError("Two-factor sign-in could not be started. Please try again.");
      }
    } else if (status === "pending") {
      // Legacy servers may still send this for accounts awaiting approval.
      setLoginError("Your account is awaiting approval. Please try again later or contact support.");
    } else if (status === "suspended") {
      setLoginError("Your account has been suspended. Please contact support.");
    } else if (status === "managed") {
      setLoginError("This account is managed by your agency. Contact them for access.");
    } else if (status === "error") {
      const msg = params.get("oauth_msg") ?? "unknown";
      const friendly: Record<string, string> = {
        not_configured: "Google Sign-In is not enabled on this server.",
        microsoft_not_configured: "Microsoft Sign-In is not enabled on this server.",
        invalid_state: "The sign-in session expired. Please try again.",
        state_mismatch: "The sign-in session expired. Please try again.",
        no_code: "Sign-in was interrupted before completing. Please try again.",
        token_exchange_failed:
          "Could not complete sign-in - the provider rejected the request. Please try again.",
        code_already_used:
          "Your sign-in link was already used - this can happen when Teams or Outlook previews it automatically. Please click \"Sign in with Microsoft\" (or Google) again.",
        no_access_token: "The sign-in provider did not return a valid token. Please try again.",
        userinfo_failed: "Could not retrieve your Google profile. Please try again.",
        graph_failed: "Could not retrieve your Microsoft profile. Please try again.",
        no_microsoft_id: "Could not retrieve your Microsoft profile. Please try again.",
        no_email: "Your account does not have a verified email address. Please use password sign-in.",
        unexpected: "An unexpected error occurred. Please try again.",
        access_denied: "Sign-in was cancelled.",
        master_access_removed: "Your access to the Master workspace has been removed. Contact a current Master Owner if you need access restored. Your user account and data have not been deleted.",
        microsoft_already_linked: "That Microsoft account is already linked to a different AIO Fusion account.",
        not_signed_in: "You need to be signed in to link an account. Please sign in and try again.",
      };
      setLoginError(friendly[msg] ?? `Sign-in failed (${msg}). Please try again or sign in with your password.`);
    }
    // status === "ok": session cookie set by server; App.tsx's session loader picks it up automatically

    // Verification link errors - redirect back to the verification-pending screen
    const verifyStatus = params.get("verify_status");
    if (verifyStatus === "expired") {
      setLoginError("Your verification link has expired. Request a new one below.");
      setSignupAwaitingVerification(true);
    } else if (verifyStatus === "invalid" || verifyStatus === "error") {
      setLoginError("This verification link is invalid. Please request a new one.");
      setSignupAwaitingVerification(true);
    }
  }, [oauthRedirectParams, onOauthParamsConsumed]);

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError(null);
    setSignupLoading(true);
    // Be forgiving about the website format - prepend https:// if the
    // scheme was left off (e.g. "aiofusion.ai" or "www.aiofusion.ai").
    const websiteTrimmed = signupWebsite.trim();
    const websiteNormalised = websiteTrimmed && !/^https?:\/\//i.test(websiteTrimmed)
      ? `https://${websiteTrimmed}`
      : websiteTrimmed;
    void serverSignUp({
      name: signupName,
      email: signupEmail,
      companyName: signupCompany,
      website: websiteNormalised || undefined,
      password: signupPassword,
      discountInvite: discountInvite && discountInviteToken ? discountInviteToken : undefined,
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
    <div data-testid="platform-home" className="min-h-screen min-w-0 max-w-full overflow-x-hidden font-['Inter',sans-serif]" style={{ background: "white", color: ink }}>
      <header className="px-4 sm:px-10 py-4 sm:py-6 flex flex-wrap items-center justify-between gap-3 sm:gap-6" style={{ background: "#1A647B", borderBottom: `1px solid rgba(255,255,255,0.15)` }}>
        <button onClick={onBackToLanding} className="flex min-w-0 items-center gap-3.5">
          <img src={`${import.meta.env.BASE_URL}images/logo-white-notagline.png`} alt="AIO Fusion" className="h-14 sm:h-30 w-auto max-w-full" />
        </button>
        <div data-testid="platform-home-navigation" className="flex min-w-0 max-w-full flex-1 flex-wrap items-center justify-end gap-3 sm:flex-none sm:gap-6">
          {backToAgency}
          <button
            onClick={onBackToLanding}
            className="aio-button aio-button--return shrink-0"
            style={{ background: accent, color: "white" }}
          >
            <ArrowLeft size={16} /> <span className="sm:hidden">Website</span><span className="hidden sm:inline">Back to website</span>
          </button>
        </div>
      </header>

      <div className="min-w-0 max-w-7xl mx-auto px-4 sm:px-10 py-10 sm:py-14">
        <div className="mb-8 sm:mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4" style={{ background: accent }}>
            <Sparkles size={12} color="white" />
            <span className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: "white" }}>Platform Home</span>
          </div>
          <h1 className="aio-type-display">
            Welcome to <span style={{ color: accent }}>AIO Fusion</span><span className="text-2xl sm:text-3xl lg:text-4xl font-light ml-2 align-baseline" style={{ color: vars.g500 }}>(beta)</span>
          </h1>
          <p className="aio-type-body mt-4 sm:whitespace-nowrap" style={{ color: vars.g600 }}>
            {session
              ? "Manage your PR and marketing projects, then move through The AIO Fusion Approach to grow business AI authority."
              : "Sign in to manage your PR and marketing projects, then move through The AIO Fusion Approach to grow business AI authority."}
          </p>
        </div>

        {session && session.role !== "admin" && <BetaTrialBanner onViewPlans={onManageSubAccounts} />}

        {/* LOGIN / SIGN-UP / SESSION - full-width across the page */}
        {/* resetToken is checked first so a logged-in SSO user who clicked the
            email link still sees the set-password form rather than the account card. */}
        {resetToken ? (
          <div className="rounded-2xl p-6 sm:p-10 mb-6 sm:mb-8" style={{ background: "#1A647B", boxShadow: "0 8px 24px -12px rgba(26,100,123,0.35)" }}>
            {/* --- RESET / SET PASSWORD (from email link) --- */}
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
                        {isWelcomeLink ? "Set your password" : "Choose a new password"}
                      </h2>
                      <p className="text-[14px] leading-[1.7]" style={{ color: "rgba(255,255,255,0.7)" }}>
                        {isWelcomeLink
                          ? "Choose a password for your account. Once saved, sign in with your new password."
                          : "Enter a new password for your account. Once saved, you'll be signed out of all devices and can sign in with the new password."}
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
          </div>
        ) : authPending ? (
          <div
            data-testid="auth-session-handoff"
            className="rounded-2xl p-6 sm:p-10 mb-6 sm:mb-8"
            style={{ background: "#1A647B", boxShadow: "0 8px 24px -12px rgba(26,100,123,0.35)" }}
            aria-live="polite"
          >
            <div className="max-w-md mx-auto py-8 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: "rgba(255,255,255,0.15)" }}>
                <Loader2 size={28} className="animate-spin" color="white" />
              </div>
              <h2 className="text-[26px] font-bold mb-2" style={{ color: "white", fontFamily: "'Alice', Georgia, serif" }}>
                Signing you in
              </h2>
              <p className="text-[15px] leading-[1.7]" style={{ color: "rgba(255,255,255,0.8)" }}>
                Confirming your account and setup details…
              </p>
            </div>
          </div>
        ) : !session ? (
          <div className="rounded-2xl p-6 sm:p-10 mb-6 sm:mb-8" style={{ background: "#1A647B", boxShadow: "0 8px 24px -12px rgba(26,100,123,0.35)" }}>

            {showForgotPassword ? (
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
                      a password reset link. It can be used once and expires in 1 hour - 
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
                  <p className="text-[15px] mb-2 leading-[1.7]" style={{ color: "white" }}>
                    We've sent a verification link to <strong>{verificationEmail}</strong>.
                    Click it to finish creating your account.
                  </p>
                ) : (
                  <p className="text-[15px] mb-2 leading-[1.7]" style={{ color: "white" }}>
                    Your link has expired. Enter your email below to get a new one.
                  </p>
                )}
                <p className="text-[13.5px] mb-6" style={{ color: "white" }}>
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
                    className="flex items-center justify-center gap-2 mx-auto px-6 py-3.5 rounded-xl text-[13px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:-translate-y-0.5 hover:shadow-lg hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: accent }}
                  >
                    {resendLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    Resend verification email
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setSignupAwaitingVerification(false); setShowSignup(false); setLoginError(null); setResendSent(false); }}
                  className="mt-5 text-[13px] hover:opacity-70 transition-opacity block mx-auto"
                  style={{ color: "white" }}
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
                {(discountInvite || discountInviteError) && (
                  <div
                    className="mb-5 px-4 py-3 rounded-xl text-[14px] font-semibold"
                    style={discountInviteError
                      ? { background: "rgba(220,38,38,0.25)", color: "white" }
                      : { background: "rgba(255,255,255,0.12)", color: "white", border: "1px solid rgba(255,255,255,0.3)" }}
                  >
                    {discountInviteError
                      ? discountInviteError
                      : `${discountInvite!.label} invitation: your subscription will be ${discountInvite!.percent}% off, applied automatically at checkout.`}
                  </div>
                )}
                {/* Sign up with Google / Microsoft. Hidden when arriving via a
                    discount invite - the discount is redeemed through the
                    password signup path, and an SSO signup would lose it. */}
                <div className="mb-5" style={discountInvite ? { display: "none" } : undefined}>
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
                      Continue with Google
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
                      Continue with Microsoft
                    </a>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.2)" }} />
                    <span className="text-[22px] font-bold" style={{ color: "white", fontFamily: "'Alice', Georgia, serif" }}>or fill in your details below</span>
                    <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.2)" }} />
                  </div>
                </div>
                <form onSubmit={handleSignup} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-2" style={{ color: "white" }}>Full name</label>
                    <div className="relative">
                      <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: vars.g400 }} />
                      <input type="text" value={signupName} onChange={(e) => setSignupName(e.target.value)} placeholder="First and last name" autoComplete="name" required className="w-full pl-10 pr-3 py-3 rounded-xl border text-[14px] focus:outline-none focus:ring-2" style={{ background: "white", borderColor: vars.g200, color: ink, ["--tw-ring-color" as any]: accent }} />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-2" style={{ color: "white" }}>Work email address</label>
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
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-2" style={{ color: "white" }}>Company website <span className="font-normal normal-case tracking-normal text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>e.g. https://www.aiofusion.ai</span></label>
                    <div className="relative">
                      <Globe size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: vars.g400 }} />
                      <input type="text" inputMode="url" value={signupWebsite} onChange={(e) => setSignupWebsite(e.target.value)} placeholder="https://www.yourcompany.com" autoComplete="url" required className="w-full pl-10 pr-3 py-3 rounded-xl border text-[14px] focus:outline-none focus:ring-2" style={{ background: "white", borderColor: vars.g200, color: ink, ["--tw-ring-color" as any]: accent }} />
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
                      {signupLoading ? "Creating account…" : "Create account"}
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
                  saveLastSignIn({ email: username.trim() || undefined, method: "password" });
                  setMfaChallenge(null);
                  setUsername("");
                  onLoginSuccess(mfaSession);
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
                  Welcome back - sign in to manage your projects.
                </p>

                {/* SSO - Google + Microsoft */}
                {lastSignIn?.method && (
                  <p className="text-[13px] mb-3" style={{ color: "rgba(255,255,255,0.85)" }}>
                    Last time you signed in with {lastSignIn.method === "google" ? "Google" : lastSignIn.method === "microsoft" ? "Microsoft" : "your email and password"}.
                  </p>
                )}
                <div className="flex flex-col sm:flex-row gap-3 mb-5">
                  <a
                    href={`${apiBase()}/api/platform/auth/google`}
                    onClick={() => markPendingSso("google")}
                    className="flex items-center justify-center gap-3 flex-1 px-5 py-3.5 rounded-xl text-[14px] font-semibold transition-all hover:-translate-y-0.5 hover:shadow-lg border"
                    style={{ background: "white", color: "#3c4043", borderColor: "#dadce0" }}
                  >
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Continue with Google
                  </a>
                  <a
                    href={`${apiBase()}/api/platform/auth/microsoft`}
                    onClick={() => markPendingSso("microsoft")}
                    className="flex items-center justify-center gap-3 flex-1 px-5 py-3.5 rounded-xl text-[14px] font-semibold transition-all hover:-translate-y-0.5 hover:shadow-lg border"
                    style={{ background: "white", color: "#0a1628", borderColor: "#e2e8f0" }}
                  >
                    <svg width="36" height="36" viewBox="0 0 21 21" fill="none" aria-hidden="true">
                      <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                      <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                      <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                      <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                    </svg>
                    Continue with Microsoft
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
                    // State updates are asynchronous, so a ref is required to
                    // make double Enter/click submits single-flight.
                    if (loginInFlight.current) return;
                    loginInFlight.current = true;
                    setLoginError(null);
                    setLoginLoading(true);
                    void (async () => {
                      try {
                        const result = await serverLogin(username, password);
                        if (result.ok) {
                          saveLastSignIn({ email: username.trim(), method: "password" });
                          setUsername("");
                          setPassword("");
                          onLoginSuccess(result.session);
                        } else if ("mfa" in result) {
                          setPassword("");
                          setMfaChallenge(result.mfa);
                        } else {
                          setLoginError(result.error);
                        }
                      } finally {
                        loginInFlight.current = false;
                        setLoginLoading(false);
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
                    <div className="text-[13px] font-semibold text-center py-2 px-3 rounded-xl" style={{ color: "white", background: "rgba(220,38,38,0.25)" }} role="alert">
                      <p>{loginError}</p>
                      {authError && onRetryAuthentication && (
                        <button
                          type="button"
                          data-testid="button-retry-authentication"
                          onClick={onRetryAuthentication}
                          className="mt-2 underline underline-offset-2 hover:opacity-80"
                        >
                          Retry session check
                        </button>
                      )}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={loginLoading}
                    className="self-center w-full sm:w-auto sm:min-w-[220px] flex items-center justify-center gap-2 px-10 py-3.5 rounded-xl text-[14px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:-translate-y-0.5 hover:shadow-lg hover:brightness-110 mt-1"
                    style={{ background: accent }}
                  >
                    {loginLoading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} {loginLoading ? "Signing in…" : "Sign in"}
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
              <div data-testid="platform-home-account-identity" className="flex min-w-0 items-start gap-3 sm:min-w-[170px] sm:items-center sm:gap-4">
                <div className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.2)", color: "white" }}>
                  <User size={24} />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="aio-type-label inline-flex max-w-full items-center whitespace-nowrap mb-1.5 px-3 sm:px-5 py-2 rounded-md uppercase tracking-[0.1em] sm:tracking-[0.16em]" style={{ background: session.role === "admin" ? ink : "rgba(255,255,255,0.18)", color: "white" }}>
                    {session.role === "client"
                      ? session.agencyManagedClient ? "Client Project" : "Client Account"
                      : session.role === "agency" ? "Agency Partner Account" : roleLabel(session.role)}
                  </span>
                  <p className="aio-type-eyebrow" style={{ color: "rgba(255,255,255,0.7)" }}>Signed in as</p>
                  <h2 className="aio-type-card-title mt-0.5 break-words" style={{ color: "white" }}>
                    {getSessionIdentityLabels(session).signedInAs}
                  </h2>
                  <div className="aio-type-supporting mt-2 space-y-0.5 break-words" style={{ color: "rgba(255,255,255,0.78)" }}>
                    <p><span className="font-bold uppercase tracking-[0.12em]">Company:</span> {getSessionIdentityLabels(session).companyName}</p>
                    <p><span className="font-bold uppercase tracking-[0.12em]">Access:</span> {getSessionIdentityLabels(session).access}</p>
                  </div>
                </div>
              </div>
              <div data-testid="platform-home-project-controls" className="grid w-full grid-cols-1 gap-3 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                {session.insightsCmsAccess && onInsightsAdmin && (
                  <button
                    onClick={onInsightsAdmin}
                    className="aio-button aio-button--outline min-w-0 sm:px-6 uppercase tracking-[0.14em] text-white hover:bg-white/10"
                    style={{ border: "1.5px solid rgba(255,255,255,0.5)", background: "transparent", color: "white" }}
                  >
                    <FileEdit size={15} /> Edit Insights CMS
                  </button>
                )}
                {session.role === "admin" && onPrivacyRights && (
                  <button
                    onClick={onPrivacyRights}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] font-semibold"
                    style={{ borderColor: "#d8e2e5", color: ink }}
                  >
                    <ShieldCheck size={15} /> Journalist privacy
                  </button>
                )}
                {session.role === "admin" ? (
                  <>
                    <button
                      onClick={onManageUsers}
                      className="aio-button aio-button--outline min-w-0 sm:px-6 uppercase tracking-[0.14em] text-white hover:bg-white/10"
                      style={{ border: "1.5px solid rgba(255,255,255,0.5)", background: "transparent", color: "white" }}
                    >
                      <Users size={15} /> Manage Accounts
                    </button>
                    <button
                      onClick={onManageTeam ?? onManageUsers}
                      className="aio-button aio-button--outline min-w-0 sm:px-6 uppercase tracking-[0.14em] text-white hover:bg-white/10"
                      style={{ border: "1.5px solid rgba(255,255,255,0.5)", background: "transparent", color: "white" }}
                    >
                      <Users size={15} /> Account &amp; Team Settings
                    </button>
                  </>
                ) : (
                  <button
                    onClick={onManageSubAccounts}
                    className="aio-button aio-button--outline min-w-0 sm:px-6 uppercase tracking-[0.14em] text-white hover:bg-white/10"
                    style={{ border: "1.5px solid rgba(255,255,255,0.5)", background: "transparent", color: "white" }}
                  >
                    {session.role === "agency"
                      ? <><Users size={15} /> Account, Client &amp; Team Settings</>
                      : <><User size={15} /> Account &amp; Team Settings</>}
                  </button>
                )}
                <button
                  onClick={onContinueToProjects}
                  className="aio-button aio-button--primary min-w-0 sm:px-6 uppercase tracking-[0.14em] text-white hover:-translate-y-0.5 hover:shadow-md"
                  style={{ background: accent }}
                >
                  Project Hub <ArrowRight size={15} />
                </button>
              </div>
            </div>

            {/* Sign out - sessions, 2FA, password and deletion now live on the
                My Account page (AccountSecurityCard). */}
            <div className="mt-6 pt-5 flex justify-end" style={{ borderTop: "1px solid rgba(255,255,255,0.2)" }}>
              <button
                onClick={onSignOut}
                className="aio-button aio-button--outline uppercase tracking-[0.14em] text-white hover:bg-white/10"
                style={{ border: "1.5px solid rgba(255,255,255,0.5)", background: "transparent", color: "white" }}
              >
                <LogOut size={15} /> Sign out
              </button>
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
              <h2 className="text-[22px] font-bold" style={{ color: "white", fontFamily: "'Alice', Georgia, serif" }}>The AIO Fusion Approach</h2>
              <p className="text-[14px] font-light mt-1" style={{ color: "rgba(255,255,255,0.75)" }}>Each stage improves how often AI recommends your business.</p>
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
            The AIO Fusion Approach runs through every project: capture project data, audit earned media and site visibility, optimise content, plan and target releases, measure impact, then repeat.
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
