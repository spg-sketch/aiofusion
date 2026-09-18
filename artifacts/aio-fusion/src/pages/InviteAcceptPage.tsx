import { useEffect, useState } from "react";
import { Loader2, Mail, ShieldCheck, AlertTriangle, LogOut } from "lucide-react";
import { vars } from "../marketing/vars";
import { type InviteInfo, type MfaChallenge, bootstrapAuth, clearSession, setSession, serverDeclineInvite, serverGetInviteInfo, serverAcceptInvite, serverLogout } from "../lib/auth";
import { apiBase } from "../lib/apiHelpers";
import { MfaLoginStep } from "../components/MfaPanels";

const ink = "#0a1628";
const accent = "#C8497A";
const accentSoft = "#FBE3ED";
const paper = "#f8fafc";

// Landing page for a team-invite link (/?invite=<token>). The invitee sets a
// password - or continues with Google/Microsoft SSO - and goes straight to
// the dashboard: no account-type selection, the workspace already exists.
export function InviteAcceptPage({ token, onAccepted }: { token: string; onAccepted: () => void }) {
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [signedInAsDifferentUser, setSignedInAsDifferentUser] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState<MfaChallenge | null>(null);
  const [verifyingSession, setVerifyingSession] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [mfaCancelled, setMfaCancelled] = useState(false);

  useEffect(() => {
    void serverGetInviteInfo(token).then((r) => {
      setLoading(false);
      if (r.ok && r.invite) {
        setInvite(r.invite);
        // Prefill with the full name the inviter recorded; the invitee can edit it.
        if (r.invite.invitedName) setName((prev) => prev || r.invite!.invitedName!);
      }
      else setLoadError(r.error ?? "Invitation not found.");
    });
  }, [token]);

  const needsPassword = !invite?.existingUser;

  const confirmSession = async () => {
    setMfaChallenge(null);
    setVerificationError(null);
    setVerifyingSession(true);
    // MFA completion only supplies a provisional session, just like password
    // sign-in. Do not expose a destination until the cookie passes /me.
    clearSession();
    const authority = await bootstrapAuth();
    setVerifyingSession(false);
    if (!authority.session) {
      setVerificationError(authority.error ?? "Your session could not be verified. Please sign in to finish joining the workspace.");
      return;
    }
    setSession(authority.session);
    onAccepted();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || accepted) return;
    setSubmitError(null);
    setSignedInAsDifferentUser(false);
    if (needsPassword) {
      if (password.length < 8) { setSubmitError("Password must be at least 8 characters."); return; }
      if (password !== confirm) { setSubmitError("Passwords don't match."); return; }
    }
    setSubmitting(true);
    void serverAcceptInvite({ token, name: name.trim() || undefined, password: needsPassword ? password : undefined }).then((r) => {
      setSubmitting(false);
      if ("mfa" in r) {
        clearSession();
        setAccepted(true);
        setPassword("");
        setConfirm("");
        setMfaChallenge(r.mfa);
      } else if (r.ok) {
        setAccepted(true);
        setPassword("");
        setConfirm("");
        void confirmSession();
      }
      else {
        setSubmitError(r.error ?? "Failed to accept invitation.");
        setSignedInAsDifferentUser(r.reason === "signed_in_as_different_user");
      }
    });
  };

  const handleSignOutAndContinue = () => {
    setSigningOut(true);
    setSubmitError(null);
    void serverLogout()
      .then(() => window.location.reload())
      .catch(() => {
        setSigningOut(false);
        setSubmitError("We could not sign out this browser. Go to AIO Fusion, sign out, then reopen this invitation.");
      });
  };

  const handleDecline = () => {
    if (!window.confirm("Decline this workspace invitation? Your inviter will be notified.")) return;
    setSubmitError(null);
    setDeclining(true);
    void serverDeclineInvite(token).then((r) => {
      setDeclining(false);
      if (r.ok) setDeclined(true);
      else setSubmitError(r.error ?? "Failed to decline invitation.");
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 font-['Inter',sans-serif]" style={{ background: paper, color: ink }}>
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <img src={`${import.meta.env.BASE_URL}images/logo-color.png`} alt="AIO Fusion" className="h-20" />
        </div>
        <div className="rounded-2xl p-7 sm:p-9" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 12px 32px -16px rgba(16,43,54,0.14)" }}>
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-8">
              <Loader2 size={18} className="animate-spin" color={accent} />
              <span className="text-[14px]" style={{ color: vars.g600 }}>Checking your invitation…</span>
            </div>
          ) : loadError || !invite ? (
            <div className="text-center py-6">
              <AlertTriangle size={28} color={accent} className="mx-auto mb-3" />
              <h1 className="text-[18px] font-bold mb-2" style={{ fontFamily: "'Alice', Georgia, serif" }}>Invitation not available</h1>
              <p className="text-[13px] leading-[1.6]" style={{ color: vars.g600 }}>{loadError}</p>
              <a href={import.meta.env.BASE_URL} className="inline-block mt-5 px-6 py-3 text-[12px] font-bold uppercase tracking-[0.14em]" style={{ background: ink, color: "#fff" }}>
                Go to AIO Fusion
              </a>
            </div>
          ) : accepted ? (
            mfaChallenge ? (
              <MfaLoginStep
                challenge={mfaChallenge}
                onSuccess={() => { void confirmSession(); }}
                onCancel={() => {
                  clearSession();
                  setMfaChallenge(null);
                  setMfaCancelled(true);
                }}
              />
            ) : (
              <div className="space-y-4">
                <h1 className="text-[18px] font-bold" style={{ fontFamily: "'Alice', Georgia, serif" }}>
                  {verifyingSession ? "Verifying your session…" : "Invitation accepted"}
                </h1>
                <p className="text-[13px]" style={{ color: vars.g600 }}>
                  Your invitation has been accepted. You do not need to accept it again.
                  {mfaCancelled && " Sign in to complete your personal two-factor authentication."}
                </p>
                {verifyingSession && <Loader2 aria-label="Verifying session" size={18} className="animate-spin" />}
                {verificationError && (
                  <>
                    <p role="alert" className="text-[13px]" style={{ color: accent }}>{verificationError}</p>
                    <button type="button" onClick={() => { void confirmSession(); }} className="text-[13px] font-bold">
                      Retry session verification
                    </button>
                  </>
                )}
                {!verifyingSession && (
                  <a href={`${import.meta.env.BASE_URL}?oauth_status=ok`} className="inline-block text-[13px] font-bold">
                    Continue to sign in
                  </a>
                )}
              </div>
            )
          ) : declined ? (
            <div className="text-center py-6">
              <Mail size={28} color={accent} className="mx-auto mb-3" />
              <h1 className="text-[18px] font-bold mb-2" style={{ fontFamily: "'Alice', Georgia, serif" }}>Invitation declined</h1>
              <p className="text-[13px] leading-[1.6]" style={{ color: vars.g600 }}>
                Your inviter can now see that you are not joining this workspace.
              </p>
              <a href={import.meta.env.BASE_URL} className="inline-block mt-5 px-6 py-3 text-[12px] font-bold uppercase tracking-[0.14em]" style={{ background: ink, color: "#fff" }}>
                Go to AIO Fusion
              </a>
            </div>
          ) : (
            <>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4" style={{ background: accentSoft, border: `1px solid ${accent}40` }}>
                <Mail size={12} color={accent} />
                <span className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>Team invitation</span>
              </div>
              <h1 className="text-[22px] leading-[1.25] mb-2" style={{ fontFamily: "'Alice', Georgia, serif" }}>
                Join {invite.companyName}
              </h1>
              <p className="text-[13px] leading-[1.65] mb-6" style={{ color: vars.g600 }}>
                You've been invited as <strong style={{ color: ink }}>{invite.roleLabel}</strong> for{" "}
                <strong style={{ color: ink }}>{invite.email}</strong>. Set a password below, or continue with Google or Microsoft.
              </p>

              <form onSubmit={handleSubmit} className="space-y-3">
                {needsPassword && (
                  <>
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5">Your name</label>
                      <input
                        type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe"
                        className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2"
                        style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5">Password</label>
                      <input
                        type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 8 characters" required
                        className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2"
                        style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5">Confirm password</label>
                      <input
                        type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="repeat password" required
                        className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2"
                        style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
                      />
                    </div>
                  </>
                )}
                {submitError && <p className="text-[12px] font-semibold" style={{ color: accent }}>{submitError}</p>}
                {signedInAsDifferentUser && (
                  <button
                    type="button"
                    onClick={handleSignOutAndContinue}
                    disabled={signingOut}
                    className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg border text-[12px] font-bold uppercase tracking-[0.12em] transition-all hover:bg-gray-50 disabled:opacity-60"
                    style={{ borderColor: vars.g300, color: ink }}
                  >
                    {signingOut ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                    {signingOut ? "Signing out…" : "Sign out and continue"}
                  </button>
                )}
                <button
                  type="submit" disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3.5 text-[12px] font-bold uppercase tracking-[0.14em] transition-all hover:opacity-90 disabled:opacity-60"
                  style={{ background: ink, color: "#fff" }}
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                  {submitting ? "Joining…" : needsPassword ? "Set password & join" : "Accept & join"}
                </button>
                <button
                  type="button"
                  onClick={handleDecline}
                  disabled={submitting || declining}
                  className="w-full px-5 py-2 text-[11px] font-bold uppercase tracking-[0.14em] transition-all hover:opacity-75 disabled:opacity-60"
                  style={{ color: vars.g600 }}
                >
                  {declining ? "Declining…" : "Decline invitation"}
                </button>
              </form>

              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px" style={{ background: vars.g200 }} />
                <span className="text-[11px] uppercase tracking-[0.18em]" style={{ color: vars.g600 }}>or</span>
                <div className="flex-1 h-px" style={{ background: vars.g200 }} />
              </div>

              <div className="space-y-2">
                <a
                  href={`${apiBase()}/api/platform/auth/google?invite=${encodeURIComponent(token)}`}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg border text-[13px] font-semibold transition-all hover:bg-gray-50"
                  style={{ borderColor: vars.g300, color: ink }}
                >
                  <img src="https://www.google.com/favicon.ico" alt="" className="w-4 h-4" /> Continue with Google
                </a>
                <a
                  href={`${apiBase()}/api/platform/auth/microsoft?invite=${encodeURIComponent(token)}`}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg border text-[13px] font-semibold transition-all hover:bg-gray-50"
                  style={{ borderColor: vars.g300, color: ink }}
                >
                  <img src="https://www.microsoft.com/favicon.ico" alt="" className="w-4 h-4" /> Continue with Microsoft
                </a>
                <p className="text-[11px] leading-[1.55] pt-1" style={{ color: vars.g600 }}>
                  Use the Google or Microsoft account for <strong>{invite.email}</strong> - the invitation is bound to that email address.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default InviteAcceptPage;
