import { useEffect, useRef, useState } from "react";
import { Bell, CheckCircle2, Loader2, X } from "lucide-react";
import { type MembershipRole, type PendingMyInvite, serverAcceptMyInvite, serverSwitchWorkspace } from "../lib/auth";

const ROLE_LABELS: Record<MembershipRole, string> = {
  owner: "Owner",
  admin: "Admin",
  billing: "Billing",
  content: "Content staff",
  viewer: "Viewer",
};

interface Props {
  invites: PendingMyInvite[];
  onInviteAccepted: () => void; // ask parent to refresh invite list + workspaces
  onDismiss: () => void;
}

interface AcceptState {
  loading: boolean;
  accepted: boolean;
  companyId?: string;
  companyName?: string;
  error?: string;
}

export function PendingInvitesBanner({ invites, onInviteAccepted, onDismiss }: Props) {
  const [acceptState, setAcceptState] = useState<Record<string, AcceptState>>({});
  const [switching, setSwitching] = useState<string | null>(null);
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

  const handleAccept = async (token: string) => {
    setAcceptState((s) => ({ ...s, [token]: { loading: true, accepted: false } }));
    const result = await serverAcceptMyInvite(token);
    if (result.ok) {
      setAcceptState((s) => ({
        ...s,
        [token]: { loading: false, accepted: true, companyId: result.companyId, companyName: result.companyName },
      }));
      onInviteAccepted();
    } else {
      setAcceptState((s) => ({
        ...s,
        [token]: { loading: false, accepted: false, error: result.error },
      }));
    }
  };

  const handleSwitch = async (companyId: string) => {
    setSwitching(companyId);
    await serverSwitchWorkspace(companyId);
    // serverSwitchWorkspace reloads the page on success; setSwitching(null) is
    // only reached if the call returns an error.
    setSwitching(null);
  };

  if (invites.length === 0) return null;

  const pending = invites.filter((i) => !acceptState[i.token]?.accepted);
  const accepted = invites.filter((i) => acceptState[i.token]?.accepted);

  return (
    <div
      ref={bannerRef}
      className="fixed top-0 left-0 right-0 z-50 font-['Inter',sans-serif]"
      style={{ background: "#FFFBEB", borderBottom: "1px solid #FDE68A" }}
    >
      <div className="max-w-5xl mx-auto px-4 py-3 flex flex-col gap-2">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 pt-0.5">
            <Bell size={14} color="#92400E" />
            <span className="text-[13px] font-semibold" style={{ color: "#92400E" }}>
              {pending.length > 0
                ? `You have ${pending.length} pending team invitation${pending.length === 1 ? "" : "s"}`
                : "Invitations accepted"}
            </span>
          </div>
          <button
            onClick={onDismiss}
            className="p-1 rounded hover:bg-yellow-100 flex-shrink-0 transition-colors"
            aria-label="Dismiss"
          >
            <X size={14} color="#92400E" />
          </button>
        </div>

        {/* Pending invites */}
        {pending.map((inv) => {
          const st = acceptState[inv.token];
          return (
            <div key={inv.token} className="flex flex-wrap items-center gap-2 pl-5">
              <span className="text-[12px]" style={{ color: "#78350F" }}>
                <span className="font-semibold">{inv.companyName}</span>
                {" — "}
                {ROLE_LABELS[inv.role] ?? inv.role}
              </span>
              {st?.error && (
                <span className="text-[11px] font-semibold" style={{ color: "#B91C1C" }}>
                  {st.error}
                </span>
              )}
              <button
                onClick={() => void handleAccept(inv.token)}
                disabled={st?.loading}
                className="flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-[0.1em] transition-all hover:brightness-105 disabled:opacity-50"
                style={{ background: "#92400E", color: "#FFFBEB" }}
              >
                {st?.loading ? <Loader2 size={11} className="animate-spin" /> : null}
                {st?.loading ? "Accepting…" : "Accept"}
              </button>
            </div>
          );
        })}

        {/* Accepted invites — offer to switch */}
        {accepted.map((inv) => {
          const st = acceptState[inv.token]!;
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
      </div>
    </div>
  );
}

export default PendingInvitesBanner;
