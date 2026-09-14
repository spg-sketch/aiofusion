import { useEffect, useRef, useState } from "react";
import { Bell, CheckCircle2, Loader2, X } from "lucide-react";
import { type InviteFailureReason, type MembershipRole, type PendingMyInvite, serverAcceptMyInvite, serverDeclineMyInvite, serverSwitchWorkspace } from "../lib/auth";
import { type AcceptedInvitation, InvitationResultNotice, isTerminalInvitationFailure } from "./InvitationResult";

const ROLE_LABELS: Record<MembershipRole, string> = {
  owner: "Owner",
  admin: "Admin",
  billing: "Billing",
  content: "Content Team Member",
  viewer: "Viewer",
};

interface Props {
  invites: PendingMyInvite[];
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  acceptedInvites?: AcceptedInvitation[];
  onInviteAccepted: (invite?: AcceptedInvitation) => void; // ask parent to refresh invite list + workspaces
  onDismiss: () => void;
}

interface AcceptState {
  loading: boolean;
  accepted: boolean;
  companyId?: string;
  companyName?: string;
  invitation?: PendingMyInvite;
  error?: string;
  reason?: InviteFailureReason;
}

export function PendingInvitesBanner({ invites, loading, loadError, onRetry, acceptedInvites = [], onInviteAccepted, onDismiss }: Props) {
  const [acceptState, setAcceptState] = useState<Record<string, AcceptState>>({});
  const [switching, setSwitching] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  // Keep --banner-h CSS variable in sync with the banner's rendered height so
  // the platform view (which uses `marginTop: var(--banner-h, 0px)`) always
  // sits below the banner rather than underneath it.
  useEffect(() => {
    const el = bannerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      document.documentElement.style.setProperty("--banner-h", `${el.offsetHeight}px`);
    });
    ro.observe(el);
    document.documentElement.style.setProperty("--banner-h", `${el.offsetHeight}px`);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--banner-h");
    };
  }, [invites]);

  const handleAccept = async (invitation: PendingMyInvite) => {
    const token = invitation.token;
    setAcceptState((s) => ({ ...s, [token]: { loading: true, accepted: false } }));
    const result = await serverAcceptMyInvite(token);
    if (result.ok) {
      setAcceptState((s) => ({
        ...s,
        [token]: {
          loading: false,
          accepted: true,
          companyId: result.companyId,
          companyName: result.companyName ?? invitation.companyName ?? invitation.companySlug,
          invitation,
        },
      }));
      onInviteAccepted(result.companyId ? {
        token,
        companyId: result.companyId,
        companyName: result.companyName ?? invitation.companyName ?? invitation.companySlug,
      } : undefined);
    } else {
      setAcceptState((s) => ({
        ...s,
        [token]: { loading: false, accepted: false, error: result.error, reason: result.reason },
      }));
    }
  };

  const handleSwitch = async (companyId: string) => {
    setSwitching(companyId);
    setSwitchError(null);
    const result = await serverSwitchWorkspace(companyId);
    // serverSwitchWorkspace reloads the page on success; setSwitching(null) is
    // only reached if the call returns an error.
    setSwitching(null);
    if (!result.ok) setSwitchError(result.error ?? "Failed to switch workspace.");
  };

  const handleDecline = async (token: string) => {
    if (!window.confirm("Decline this workspace invitation? Your inviter will be notified.")) return;
    setDeclining(token);
    const result = await serverDeclineMyInvite(token);
    setDeclining(null);
    if (result.ok) onInviteAccepted();
    else setAcceptState((s) => ({ ...s, [token]: { loading: false, accepted: false, error: result.error } }));
  };

  if (
    !loading &&
    !loadError &&
    invites.length === 0 &&
    acceptedInvites.length === 0 &&
    Object.keys(acceptState).every((token) => !acceptState[token]?.accepted)
  ) return null;

  const pending = invites.filter((i) => !acceptState[i.token]?.accepted);
  const accepted = [
    ...acceptedInvites.map((result) => ({ ...result, invitation: { token: result.token } as PendingMyInvite })),
    ...Object.values(acceptState).filter((state) => state.accepted && state.invitation),
  ].filter((state, index, all) => all.findIndex((other) => other.invitation?.token === state.invitation?.token) === index);

  return (
    <div
      ref={bannerRef}
      role="region"
      aria-labelledby="pending-invites-heading"
      className="fixed top-0 left-0 right-0 z-50 font-['Inter',sans-serif]"
      style={{ background: "#FFFBEB", borderBottom: "1px solid #FDE68A" }}
    >
      <div className="max-w-5xl mx-auto px-4 py-3 flex flex-col gap-2">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 pt-0.5">
            <Bell size={14} color="#92400E" />
             <span id="pending-invites-heading" className="text-[13px] font-semibold" role="status" aria-live="polite" style={{ color: "#92400E" }}>
              {pending.length > 0
                ? `You have ${pending.length} pending team invitation${pending.length === 1 ? "" : "s"}`
                : loading ? "Loading team invitations" : loadError ? "Could not load team invitations" : "Invitations accepted"}
            </span>
          </div>
          <button
            onClick={onDismiss}
            className="p-1 rounded hover:bg-yellow-100 flex-shrink-0 transition-colors"
             aria-label="Dismiss team invitations"
          >
            <X size={14} color="#92400E" />
          </button>
        </div>

        {loading && <div className="flex items-center gap-2 pl-5 text-[12px]" style={{ color: "#78350F" }} data-testid="status-invites-loading"><Loader2 size={12} className="animate-spin" /> Loading invitations...</div>}
        {loadError && (
          <div className="flex flex-wrap items-center gap-2 pl-5" role="alert" data-testid="status-invites-load-error">
            <span className="text-[12px] font-semibold" style={{ color: "#B91C1C" }}>{loadError}</span>
            <button onClick={onRetry} data-testid="button-retry-invites" className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-[0.1em]" style={{ background: "#92400E", color: "#FFFBEB" }}>Retry</button>
          </div>
        )}
        {/* Pending invites */}
        {pending.map((inv) => {
          const st = acceptState[inv.token];
          return (
            <div key={inv.token} className="flex flex-wrap items-center gap-2 pl-5">
              <span className="text-[12px]" style={{ color: "#78350F" }}>
                <span className="font-semibold">{inv.companyName}</span>
                {" - "}
                {ROLE_LABELS[inv.role] ?? inv.role}
              </span>
              <InvitationResultNotice failure={st?.error || st?.reason ? st : undefined} />
              <button
                onClick={() => void handleAccept(inv)}
                disabled={st?.loading || isTerminalInvitationFailure(st?.reason) || st?.reason === "session_refresh_required" || st?.reason === "email_mismatch"}
                data-testid={`button-accept-invite-${inv.token}`}
                className="flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-[0.1em] transition-all hover:brightness-105 disabled:opacity-50"
                style={{ background: "#92400E", color: "#FFFBEB" }}
              >
                {st?.loading ? <Loader2 size={11} className="animate-spin" /> : null}
                {st?.loading ? "Accepting…" : "Accept"}
              </button>
              <button
                onClick={() => void handleDecline(inv.token)}
                disabled={st?.loading || declining === inv.token}
                data-testid={`button-decline-invite-${inv.token}`}
                className="px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] disabled:opacity-50"
                style={{ color: "#92400E" }}
              >
                {declining === inv.token ? "Declining…" : "Decline"}
              </button>
            </div>
          );
        })}

        {/* Accepted invites - offer to switch */}
        {accepted.map((st) => {
          const inv = st.invitation!;
          const isSwitching = switching === st.companyId;
          return (
            <div key={inv.token} className="flex flex-wrap items-center gap-2 pl-5">
              <CheckCircle2 size={13} color="#166534" />
              <span className="text-[12px] font-semibold" style={{ color: "#166534" }}>
                Joined {st.companyName}!
              </span>
              {st.companyId && (
                <button
                  onClick={() => void handleSwitch(st.companyId!)}
                  disabled={isSwitching}
                  data-testid={`button-switch-workspace-${st.companyId}`}
                  className="flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-[0.1em] transition-all hover:brightness-105 disabled:opacity-50"
                  style={{ background: "#166534", color: "#F0FDF4" }}
                >
                  {isSwitching ? <Loader2 size={11} className="animate-spin" /> : null}
                  {isSwitching ? "Switching…" : "Switch to workspace"}
                </button>
              )}
            </div>
          );
        })}
        {switchError && <p className="pl-5 text-[11px] font-semibold" role="alert" data-testid="status-switch-error" style={{ color: "#B91C1C" }}>{switchError}</p>}
      </div>
    </div>
  );
}

export default PendingInvitesBanner;
