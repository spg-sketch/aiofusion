import type { InviteFailureReason } from "../lib/auth";

export interface InvitationFailure {
  error?: string;
  reason?: InviteFailureReason;
}

export interface AcceptedInvitation {
  token: string;
  companyId: string;
  companyName: string;
}

const terminalReasons = new Set<InviteFailureReason>([
  "unknown", "used", "declined", "revoked", "replaced", "expired", "inactive",
]);

export function isTerminalInvitationFailure(reason?: InviteFailureReason): boolean {
  return !!reason && terminalReasons.has(reason);
}

export function invitationFailureMessage(failure: InvitationFailure): string {
  // The server may provide a more precise explanation (for example, the
  // inviter's workspace name or an account-specific recovery instruction).
  // Keep it intact; reason copy is only a reliable fallback for older replies.
  if (failure.error) return failure.error;
  switch (failure.reason) {
    case "used": return "This invitation has already been used.";
    case "declined": return "This invitation was declined.";
    case "revoked": return "This invitation was revoked by the sender.";
    case "replaced": return "This invitation was replaced by a newer invitation.";
    case "expired": return "This invitation has expired.";
    case "inactive": return "This workspace is no longer available.";
    case "unknown": return "This invitation is no longer valid.";
    case "session_refresh_required": return "Your sign-in session needs refreshing. Sign out, then sign in again before accepting this invitation.";
    case "email_mismatch": return "This invitation was sent to a different email address. Sign out and sign in with the invited email address.";
    default: return "Failed to accept invitation.";
  }
}

export function InvitationResultNotice({ failure }: { failure?: InvitationFailure }) {
  if (!failure) return null;
  return (
    <p className="text-[11px] font-semibold" style={{ color: "#B91C1C" }} role="alert" data-testid="status-invitation-error">
      {invitationFailureMessage(failure)}
    </p>
  );
}