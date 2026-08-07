import { useEffect, useState } from "react";
import {
  CheckCircle2, KeyRound, Loader2, LogOut, Mail, MonitorSmartphone, Trash2, X,
} from "lucide-react";
import { vars } from "../marketing/vars";
import {
  type Session as LocalSession, type SessionInfo,
  serverGetSessions, serverRevokeSession, serverChangeMyPassword,
  serverRequestSetPassword, serverSelfDeleteAccount, canCreateSubAccounts,
} from "../lib/auth";
import { apiBase } from "../lib/apiHelpers";
import { MfaSecuritySection } from "./MfaPanels";

const ink = "#0a1628";
const accent = "#C8497A";

/** Sessions, two-factor, change/set password and account deletion — rendered
 *  as a white card on the My Account page (moved from the platform home card). */
export function AccountSecurityCard({ session, onSignOut }: { session: LocalSession; onSignOut: () => void }) {
  // Whether the signed-in user has a password (SSO-only accounts don't).
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  useEffect(() => {
    fetch(`${apiBase()}/api/platform/me`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data: { hasPassword?: boolean } | null) => {
        if (data && typeof data.hasPassword === "boolean") setHasPassword(data.hasPassword);
      })
      .catch(() => { /* non-fatal */ });
  }, []);

  // Sessions
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

  // Change password
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [changeCurrentPassword, setChangeCurrentPassword] = useState("");
  const [changeNewPassword1, setChangeNewPassword1] = useState("");
  const [changeNewPassword2, setChangeNewPassword2] = useState("");
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);
  const [changePasswordDone, setChangePasswordDone] = useState(false);

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

  // Set-a-password (SSO-only accounts)
  const [setPasswordLoading, setSetPasswordLoading] = useState(false);
  const [setPasswordSent, setSetPasswordSent] = useState(false);
  const [setPasswordError, setSetPasswordError] = useState<string | null>(null);

  const handleRequestSetPassword = () => {
    if (setPasswordLoading || setPasswordSent) return;
    setSetPasswordError(null);
    setSetPasswordLoading(true);
    void serverRequestSetPassword()
      .then((r) => {
        if (!r.ok) { setSetPasswordError(r.error); return; }
        setSetPasswordSent(true);
      })
      .finally(() => setSetPasswordLoading(false));
  };

  // Delete account
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const panelStyle = { background: vars.g50, borderColor: vars.g200 };

  return (
    <div className="rounded-2xl p-6 sm:p-8 mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
      <h2 className="text-[16px] font-bold mb-4" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Sign-in &amp; security</h2>

      {/* ACCOUNT LOGIN SESSIONS */}
      <div>
        <button
          onClick={() => {
            const next = !showSessions;
            setShowSessions(next);
            if (next && mySessions === null) loadMySessions();
          }}
          className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.14em] hover:opacity-70 transition-opacity"
          style={{ color: ink }}
        >
          <MonitorSmartphone size={15} />
          {showSessions ? "Hide Account Login Sessions" : "Account Login Sessions"}
        </button>

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

      {/* TWO-FACTOR AUTHENTICATION */}
      <MfaSecuritySection session={session} light />

      {/* CHANGE PASSWORD / SET A PASSWORD */}
      <div className="mt-4 pt-5" style={{ borderTop: `1px solid ${vars.g200}` }}>
        {hasPassword === false ? (
          /* --- SSO-ONLY: no password set yet — offer email-link flow --- */
          <div>
            <button
              onClick={() => { setShowChangePassword((v) => !v); setSetPasswordError(null); }}
              className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.14em] hover:opacity-70 transition-opacity"
              style={{ color: ink }}
            >
              <KeyRound size={15} />
              {showChangePassword ? "Hide Set a Password" : "Set a Password"}
            </button>
            {showChangePassword && (
              <div className="mt-4 rounded-xl p-5 border" style={panelStyle}>
                {setPasswordSent ? (
                  <div className="flex items-start gap-3" style={{ color: "#1B7A3E" }}>
                    <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
                    <p className="text-[14px] font-medium leading-[1.6]">
                      Check your email — we've sent you a link to set your password.
                      The link expires in 1 hour and can only be used once.
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-[13px] font-light leading-[1.7] mb-4" style={{ color: vars.g600 }}>
                      Your account currently uses Google or Microsoft sign-in only — no password is set.
                      Click below and we'll email you a one-time link to choose a password.
                      Once set, you can sign in with your email and password as well.
                    </p>
                    {setPasswordError && (
                      <p className="mb-3 text-[13px] font-medium" style={{ color: vars.red }}>{setPasswordError}</p>
                    )}
                    <button
                      type="button"
                      onClick={handleRequestSetPassword}
                      disabled={setPasswordLoading}
                      className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-[12px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:opacity-90 disabled:opacity-50"
                      style={{ background: accent }}
                    >
                      {setPasswordLoading ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                      {setPasswordLoading ? "Sending…" : "Send me a link"}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          /* --- REGULAR: account has a password — offer change flow --- */
          <div>
            <button
              onClick={() => {
                setShowChangePassword((v) => !v);
                setChangePasswordError(null);
                setChangePasswordDone(false);
                setChangeCurrentPassword("");
                setChangeNewPassword1("");
                setChangeNewPassword2("");
              }}
              className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.14em] hover:opacity-70 transition-opacity"
              style={{ color: ink }}
            >
              <KeyRound size={15} />
              {showChangePassword ? "Hide Change Password" : "Change Password"}
            </button>
            {showChangePassword && (
              <form onSubmit={handleChangePassword} className="mt-4 rounded-xl p-5 border" style={panelStyle}>
                {/* Hidden username field so password managers link the new
                    password to the right saved login and offer to update it. */}
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  value={session.username}
                  readOnly
                  hidden
                  aria-hidden="true"
                  tabIndex={-1}
                />
                {changePasswordDone ? (
                  <div className="flex items-center gap-2 text-[14px] font-medium" style={{ color: "#1B7A3E" }}>
                    <CheckCircle2 size={16} /> Password changed. Other devices have been signed out.
                  </div>
                ) : (
                  <>
                    <p className="text-[13px] font-light leading-[1.7] mb-4" style={{ color: vars.g600 }}>
                      Enter your current password, then choose a new one (at least 8 characters).
                      You will stay signed in here, but every other device will be signed out.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: vars.g500 }}>Current password</label>
                        <input
                          type="password"
                          name="current-password"
                          autoComplete="current-password"
                          value={changeCurrentPassword}
                          onChange={(e) => setChangeCurrentPassword(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none"
                          style={{ borderColor: vars.g200, background: "white", color: ink }}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: vars.g500 }}>New password</label>
                        <input
                          type="password"
                          name="new-password"
                          autoComplete="new-password"
                          value={changeNewPassword1}
                          onChange={(e) => setChangeNewPassword1(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none"
                          style={{ borderColor: vars.g200, background: "white", color: ink }}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: vars.g500 }}>Confirm new password</label>
                        <input
                          type="password"
                          name="confirm-new-password"
                          autoComplete="new-password"
                          value={changeNewPassword2}
                          onChange={(e) => setChangeNewPassword2(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none"
                          style={{ borderColor: vars.g200, background: "white", color: ink }}
                        />
                      </div>
                    </div>
                    {changePasswordError && (
                      <p className="mt-3 text-[13px] font-medium" style={{ color: vars.red }}>{changePasswordError}</p>
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
        )}
      </div>

      {/* DANGER ZONE - self-serve account deletion (GDPR right to erasure) */}
      <div className="mt-4 pt-5" style={{ borderTop: `1px solid ${vars.g200}` }}>
        <button
          onClick={() => { setShowDeleteAccount((v) => !v); setDeleteError(null); setDeletePassword(""); }}
          className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] hover:opacity-70 transition-opacity"
          style={{ color: vars.g500 }}
        >
          <Trash2 size={13} />
          {showDeleteAccount ? "Cancel account deletion" : "Delete my account and data"}
        </button>
        {showDeleteAccount && (
          <form onSubmit={handleDeleteAccount} className="mt-4 rounded-xl p-5 border" style={panelStyle}>
            <p className="text-[13px] font-light leading-[1.7] mb-4" style={{ color: vars.g600 }}>
              This permanently deletes your account, all your projects, archive items, planner entries and other data.
              This cannot be undone. {canCreateSubAccounts(session.role) ? "If you have client accounts, remove them first." : ""}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1">
                <label className="text-[10px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: vars.g500 }}>Confirm your password</label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none"
                  style={{ borderColor: vars.g200, background: "white", color: ink }}
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
            {deleteError && <p className="mt-3 text-[13px] font-semibold" style={{ color: vars.red }}>{deleteError}</p>}
          </form>
        )}
      </div>

      {/* SIGN OUT */}
      <div className="mt-4 pt-5" style={{ borderTop: `1px solid ${vars.g200}` }}>
        <button
          onClick={onSignOut}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold uppercase tracking-[0.14em] transition-all hover:bg-black/5"
          style={{ border: `1.5px solid ${vars.g300}`, color: ink }}
        >
          <LogOut size={15} /> Sign out
        </button>
      </div>
    </div>
  );
}
