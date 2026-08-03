import { useEffect, useState, type ReactElement, type CSSProperties } from "react";
import QRCodeImport from "react-qr-code";

// react-qr-code ships class-component typings that are incompatible with the
// React 19 JSX element type; cast to a plain function-component signature.
const QRCode = QRCodeImport as unknown as (props: {
  value: string;
  size?: number;
  bgColor?: string;
  fgColor?: string;
  level?: string;
  style?: CSSProperties;
}) => ReactElement;
import { Loader2, ShieldCheck, KeyRound, Copy, Check, AlertTriangle } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "./ui/input-otp";
import {
  type Session,
  type MfaChallenge,
  serverMfaSetup,
  serverMfaEnable,
  serverMfaVerify,
  serverMfaStatus,
  serverMfaDisable,
  serverMfaRegenerateRecoveryCodes,
} from "../lib/auth";
import { vars } from "../marketing/vars";

// Two-factor authentication panels.
//  - MfaLoginStep: rendered on the sign-in page after a correct password when
//    the server demands a TOTP challenge (verification, or forced enrolment
//    for master accounts).
//  - MfaSecuritySection: self-service management inside the signed-in card
//    (opt-in enable for non-master accounts, status + disable).

function OtpBoxes({ value, onChange, onComplete, disabled }: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: () => void;
  disabled?: boolean;
}) {
  return (
    <InputOTP
      maxLength={6}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      disabled={disabled}
      autoFocus
      inputMode="numeric"
      pattern="[0-9]*"
    >
      <InputOTPGroup>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <InputOTPSlot key={i} index={i} className="h-12 w-11 text-[18px] font-bold bg-white" />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}

function RecoveryCodesBlock({ codes, onDone, doneLabel }: { codes: string[]; onDone: () => void; doneLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <KeyRound size={15} style={{ color: vars.teal }} />
        <p className="text-[13px] font-bold uppercase tracking-[0.14em]" style={{ color: "#0a1628" }}>Your recovery codes</p>
      </div>
      <p className="text-[13px] font-light leading-[1.6] mb-3" style={{ color: vars.g500 }}>
        Save these somewhere safe — each works once if you lose access to your authenticator app. They will not be shown again.
      </p>
      <div className="grid grid-cols-2 gap-2 rounded-xl border p-4 mb-3 font-mono text-[13px]" style={{ borderColor: vars.g200, background: vars.g50, color: "#0a1628" }}>
        {codes.map((c) => <span key={c}>{c}</span>)}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(codes.join("\n")).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-bold uppercase tracking-[0.12em] border transition-all hover:bg-black/5"
          style={{ borderColor: vars.g300, color: vars.g500 }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy all"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-5 py-2 rounded-lg text-[12px] font-bold uppercase tracking-[0.12em] text-white transition-all hover:brightness-110"
          style={{ background: "#C8497A" }}
        >
          {doneLabel}
        </button>
      </div>
    </div>
  );
}

// --- Login-time challenge ----------------------------------------------------

export function MfaLoginStep({ challenge, onSuccess, onCancel }: {
  challenge: MfaChallenge;
  onSuccess: (session: Session, needsSetup: boolean) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  const [recoveryInput, setRecoveryInput] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Enrolment state
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [pendingLogin, setPendingLogin] = useState<{ session: Session; needsSetup: boolean } | null>(null);
  // Set (to the remaining count) after a successful recovery-code login.
  const [recoveryWarning, setRecoveryWarning] = useState<number | null>(null);

  useEffect(() => {
    if (!challenge.enroll) return;
    void serverMfaSetup(challenge.mfaToken).then((r) => {
      if (r.ok) { setOtpauthUrl(r.otpauthUrl); setSecret(r.secret); }
      else setError(r.error);
    });
  }, [challenge]);

  const submit = () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    const entered = useRecovery ? recoveryInput.trim() : code;
    const action = challenge.enroll
      ? serverMfaEnable(entered, challenge.mfaToken).then((r) => {
          if (!r.ok) { setError(r.error); return; }
          if (r.session) {
            // Hold the completed login until they've saved the recovery codes.
            setRecoveryCodes(r.recoveryCodes);
            setPendingLogin({ session: r.session, needsSetup: r.needsSetup === true });
          }
        })
      : serverMfaVerify(challenge.mfaToken, entered).then((r) => {
          if (!r.ok) { setError(r.error); return; }
          if (typeof r.recoveryCodesRemaining === "number") {
            // A recovery code was consumed — warn about the shrinking supply
            // before letting them into the app.
            setRecoveryWarning(r.recoveryCodesRemaining);
            setPendingLogin({ session: r.session, needsSetup: r.needsSetup === true });
            return;
          }
          onSuccess(r.session, r.needsSetup === true);
        });
    void action.finally(() => setBusy(false));
  };

  // Recovery-code login — warn about the shrinking supply before entering the app.
  if (recoveryWarning !== null && pendingLogin) {
    const low = recoveryWarning <= 3;
    return (
      <div className="rounded-2xl p-6 bg-white">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={18} style={{ color: low ? vars.red : "#C8497A" }} />
          <h3 className="text-[16px] font-bold" style={{ color: "#0a1628" }}>You signed in with a recovery code</h3>
        </div>
        <p
          className="text-[14px] font-semibold mb-2"
          style={{ color: low ? vars.red : "#0a1628" }}
        >
          {recoveryWarning === 0
            ? "You have no recovery codes left."
            : `Only ${recoveryWarning} recovery code${recoveryWarning === 1 ? "" : "s"} left.`}
        </p>
        <p className="text-[13px] font-light leading-[1.7] mb-4" style={{ color: vars.g500 }}>
          Recovery codes are single-use. {low
            ? "If you run out and lose access to your authenticator app, you could be locked out of your account. "
            : ""}
          Generate a fresh set with the <strong>Regenerate</strong> button in the Two-factor authentication
          section of your account settings.
        </p>
        <button
          type="button"
          onClick={() => onSuccess(pendingLogin.session, pendingLogin.needsSetup)}
          className="px-7 py-2.5 rounded-xl text-[13px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:brightness-110"
          style={{ background: "#C8497A" }}
        >
          Continue to AIO Fusion
        </button>
      </div>
    );
  }

  // Enrolment complete — show recovery codes before entering the app.
  if (recoveryCodes && pendingLogin) {
    return (
      <div className="rounded-2xl p-6 bg-white">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck size={18} style={{ color: vars.green }} />
          <h3 className="text-[16px] font-bold" style={{ color: "#0a1628" }}>Two-factor authentication is on</h3>
        </div>
        <RecoveryCodesBlock
          codes={recoveryCodes}
          doneLabel="Continue to AIO Fusion"
          onDone={() => onSuccess(pendingLogin.session, pendingLogin.needsSetup)}
        />
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-6 bg-white">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck size={18} style={{ color: "#C8497A" }} />
        <h3 className="text-[16px] font-bold" style={{ color: "#0a1628" }}>
          {challenge.enroll ? "Set up two-factor authentication" : "Two-factor verification"}
        </h3>
      </div>

      {challenge.enroll ? (
        <>
          <p className="text-[13px] font-light leading-[1.7] mb-4" style={{ color: vars.g500 }}>
            Master accounts require two-factor authentication. Scan this QR code with an authenticator app
            (Google Authenticator, 1Password, Authy…), then enter the 6-digit code it shows.
          </p>
          {otpauthUrl ? (
            <div className="flex flex-col sm:flex-row gap-5 items-start mb-4">
              <div className="p-3 rounded-xl border" style={{ borderColor: vars.g200, background: "white" }}>
                <QRCode value={otpauthUrl} size={148} />
              </div>
              <div className="text-[12px] font-light" style={{ color: vars.g500 }}>
                <p className="mb-1.5">Can't scan? Enter this key manually:</p>
                <code className="font-mono text-[12px] break-all px-2 py-1 rounded" style={{ background: vars.g50, color: "#0a1628" }}>{secret}</code>
              </div>
            </div>
          ) : !error ? (
            <div className="flex items-center gap-2 text-[13px] mb-4" style={{ color: vars.g400 }}>
              <Loader2 size={14} className="animate-spin" /> Preparing your QR code…
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-[13px] font-light leading-[1.7] mb-4" style={{ color: vars.g500 }}>
          Enter the 6-digit code from your authenticator app to finish signing in.
        </p>
      )}

      {!useRecovery ? (
        <div className="mb-4"><OtpBoxes value={code} onChange={setCode} onComplete={submit} disabled={busy} /></div>
      ) : (
        <input
          type="text"
          value={recoveryInput}
          onChange={(e) => setRecoveryInput(e.target.value)}
          placeholder="XXXX-XXXX"
          autoFocus
          className="w-full max-w-[260px] px-3 py-2.5 mb-4 rounded-lg border font-mono text-[14px] focus:outline-none focus:ring-2"
          style={{ borderColor: vars.g200, color: "#0a1628", ["--tw-ring-color" as any]: vars.teal }}
        />
      )}

      {error && <p className="text-[13px] font-semibold mb-3" style={{ color: vars.red }}>{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={busy || (useRecovery ? !recoveryInput.trim() : code.length < 6)}
          className="flex items-center gap-2 px-7 py-2.5 rounded-xl text-[13px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:brightness-110 disabled:opacity-50"
          style={{ background: "#C8497A" }}
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {challenge.enroll ? "Verify & enable" : "Verify"}
        </button>
        {!challenge.enroll && (
          <button
            type="button"
            onClick={() => { setUseRecovery((v) => !v); setError(null); }}
            className="text-[12px] font-semibold underline underline-offset-2 hover:opacity-70"
            style={{ color: vars.g500 }}
          >
            {useRecovery ? "Use authenticator code instead" : "Use a recovery code"}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="text-[12px] font-semibold hover:opacity-70"
          style={{ color: vars.g400 }}
        >
          Back to sign in
        </button>
      </div>
    </div>
  );
}

// --- Signed-in management section ---------------------------------------------

export function MfaSecuritySection({ session }: { session: Session }) {
  const [status, setStatus] = useState<{ enabled: boolean; required: boolean; recoveryCodesRemaining: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Enrolment
  const [enrolling, setEnrolling] = useState(false);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  // Disable
  const [disabling, setDisabling] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  // Regenerate recovery codes
  const [regenerating, setRegenerating] = useState(false);
  const [regenCode, setRegenCode] = useState("");

  useEffect(() => {
    void serverMfaStatus().then((r) => {
      if (r.ok) setStatus({ enabled: r.enabled, required: r.required, recoveryCodesRemaining: r.recoveryCodesRemaining });
    });
  }, [session.username]);

  const startEnroll = () => {
    setError(null);
    setBusy(true);
    void serverMfaSetup().then((r) => {
      if (!r.ok) { setError(r.error); return; }
      setOtpauthUrl(r.otpauthUrl);
      setSecret(r.secret);
      setEnrolling(true);
    }).finally(() => setBusy(false));
  };

  const confirmEnroll = () => {
    if (busy || code.length < 6) return;
    setError(null);
    setBusy(true);
    void serverMfaEnable(code).then((r) => {
      if (!r.ok) { setError(r.error); return; }
      setRecoveryCodes(r.recoveryCodes);
      setEnrolling(false);
      setCode("");
      setStatus((s) => s ? { ...s, enabled: true, recoveryCodesRemaining: r.recoveryCodes.length } : s);
    }).finally(() => setBusy(false));
  };

  const confirmDisable = () => {
    if (busy || !disableCode.trim()) return;
    setError(null);
    setBusy(true);
    void serverMfaDisable(disableCode).then((r) => {
      if (!r.ok) { setError(r.error); return; }
      setDisabling(false);
      setDisableCode("");
      setStatus((s) => s ? { ...s, enabled: false, recoveryCodesRemaining: 0 } : s);
    }).finally(() => setBusy(false));
  };

  const confirmRegenerate = () => {
    if (busy || regenCode.length < 6) return;
    setError(null);
    setBusy(true);
    void serverMfaRegenerateRecoveryCodes(regenCode).then((r) => {
      if (!r.ok) { setError(r.error); return; }
      setRegenerating(false);
      setRegenCode("");
      setRecoveryCodes(r.recoveryCodes);
      setStatus((s) => s ? { ...s, recoveryCodesRemaining: r.recoveryCodes.length } : s);
    }).finally(() => setBusy(false));
  };

  if (!status) return null;

  return (
    <div className="mt-4 pt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.2)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-white">
          <ShieldCheck size={15} />
          <span className="text-[13px] font-bold uppercase tracking-[0.14em]">Two-Factor Authentication</span>
          <span
            className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-[0.12em]"
            style={status.enabled
              ? { background: "rgba(34,197,94,0.25)", color: "#B6F2CB" }
              : { background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)" }}
          >
            {status.enabled ? "On" : "Off"}
          </span>
          {status.required && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-[0.12em]" style={{ background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)" }}>
              Required for master accounts
            </span>
          )}
        </div>
        {!status.enabled && (
          <button
            type="button"
            onClick={startEnroll}
            disabled={busy}
            className="px-5 py-2 rounded-xl text-[12px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:bg-white/10 disabled:opacity-50"
            style={{ border: "1.5px solid rgba(255,255,255,0.5)" }}
          >
            Turn on
          </button>
        )}
        {status.enabled && !status.required && !disabling && (
          <button
            type="button"
            onClick={() => { setDisabling(true); setError(null); }}
            className="text-[12px] font-semibold hover:opacity-70"
            style={{ color: "rgba(255,255,255,0.6)" }}
          >
            Turn off
          </button>
        )}
      </div>
      {status.enabled && (
        <p
          className={`mt-2 text-[12px] ${status.recoveryCodesRemaining <= 3 ? "font-semibold" : "font-light"}`}
          style={{ color: status.recoveryCodesRemaining <= 3 ? "#ff8a8a" : "rgba(255,255,255,0.6)" }}
        >
          {status.recoveryCodesRemaining <= 3 && <AlertTriangle size={12} className="inline mr-1 -mt-0.5" />}
          {status.recoveryCodesRemaining} recovery code{status.recoveryCodesRemaining === 1 ? "" : "s"} remaining.
          {!regenerating && !recoveryCodes && (
            <>
              {" "}
              <button
                type="button"
                onClick={() => { setRegenerating(true); setDisabling(false); setError(null); }}
                className="font-semibold underline underline-offset-2 hover:opacity-70"
                style={{ color: "rgba(255,255,255,0.85)" }}
              >
                Regenerate
              </button>
            </>
          )}
        </p>
      )}

      {(enrolling || recoveryCodes || disabling || regenerating) && (
        <div className="mt-4 rounded-xl p-5 bg-white">
          {recoveryCodes ? (
            <RecoveryCodesBlock codes={recoveryCodes} doneLabel="Done" onDone={() => setRecoveryCodes(null)} />
          ) : enrolling ? (
            <>
              <p className="text-[13px] font-light leading-[1.7] mb-4" style={{ color: vars.g500 }}>
                Scan this QR code with an authenticator app, then enter the 6-digit code it shows.
              </p>
              <div className="flex flex-col sm:flex-row gap-5 items-start mb-4">
                {otpauthUrl && (
                  <div className="p-3 rounded-xl border" style={{ borderColor: vars.g200 }}>
                    <QRCode value={otpauthUrl} size={132} />
                  </div>
                )}
                <div className="text-[12px] font-light" style={{ color: vars.g500 }}>
                  <p className="mb-1.5">Can't scan? Enter this key manually:</p>
                  <code className="font-mono text-[12px] break-all px-2 py-1 rounded" style={{ background: vars.g50, color: "#0a1628" }}>{secret}</code>
                </div>
              </div>
              <div className="mb-4"><OtpBoxes value={code} onChange={setCode} onComplete={confirmEnroll} disabled={busy} /></div>
              {error && <p className="text-[13px] font-semibold mb-3" style={{ color: vars.red }}>{error}</p>}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={confirmEnroll}
                  disabled={busy || code.length < 6}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:brightness-110 disabled:opacity-50"
                  style={{ background: "#C8497A" }}
                >
                  {busy && <Loader2 size={13} className="animate-spin" />} Verify & enable
                </button>
                <button type="button" onClick={() => { setEnrolling(false); setCode(""); setError(null); }} className="text-[12px] font-semibold hover:opacity-70" style={{ color: vars.g400 }}>
                  Cancel
                </button>
              </div>
            </>
          ) : regenerating ? (
            <>
              <p className="text-[13px] font-light leading-[1.7] mb-4" style={{ color: vars.g500 }}>
                Enter the 6-digit code from your authenticator app to generate 10 fresh recovery codes. Your old recovery codes will stop working immediately.
              </p>
              <div className="mb-4"><OtpBoxes value={regenCode} onChange={setRegenCode} onComplete={confirmRegenerate} disabled={busy} /></div>
              {error && <p className="text-[13px] font-semibold mb-3" style={{ color: vars.red }}>{error}</p>}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={confirmRegenerate}
                  disabled={busy || regenCode.length < 6}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:brightness-110 disabled:opacity-50"
                  style={{ background: "#C8497A" }}
                >
                  {busy && <Loader2 size={13} className="animate-spin" />} Regenerate codes
                </button>
                <button type="button" onClick={() => { setRegenerating(false); setRegenCode(""); setError(null); }} className="text-[12px] font-semibold hover:opacity-70" style={{ color: vars.g400 }}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[13px] font-light leading-[1.7] mb-3" style={{ color: vars.g500 }}>
                Enter a code from your authenticator app (or a recovery code) to turn off two-factor authentication.
              </p>
              <input
                type="text"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                placeholder="123456 or XXXX-XXXX"
                autoFocus
                className="w-full max-w-[240px] px-3 py-2.5 mb-3 rounded-lg border font-mono text-[14px] focus:outline-none focus:ring-2"
                style={{ borderColor: vars.g200, color: "#0a1628", ["--tw-ring-color" as any]: vars.teal }}
              />
              {error && <p className="text-[13px] font-semibold mb-3" style={{ color: vars.red }}>{error}</p>}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={confirmDisable}
                  disabled={busy || !disableCode.trim()}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: vars.red }}
                >
                  {busy && <Loader2 size={13} className="animate-spin" />} Turn off
                </button>
                <button type="button" onClick={() => { setDisabling(false); setDisableCode(""); setError(null); }} className="text-[12px] font-semibold hover:opacity-70" style={{ color: vars.g400 }}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
