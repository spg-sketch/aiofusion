import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { serverExitImpersonation } from "../lib/auth";

/**
 * Compact "Back to my agency account" control shown while an agency user is
 * working inside one of their client accounts. Replaces the old full-width
 * impersonation banner for this case (agencies manage their clients directly,
 * so a persistent warning bar was overkill) - but the route back to the agency
 * workspace must always remain one click away.
 *
 * Rendered in the same slot as the WorkspaceSwitcher (sidebar + project
 * selector header) so it appears wherever the user navigates.
 */
export function BackToAgencyLink({ agencyName, light = false }: { agencyName: string; light?: boolean }) {
  const [exiting, setExiting] = useState(false);

  const handleExit = async () => {
    setExiting(true);
    const result = await serverExitImpersonation();
    if (!result.ok) {
      // The agency's stashed session expired while working in the client
      // account - nothing to restore, send them to login with an explanation.
      window.location.replace("/?aio_session_expired=1");
      return;
    }
    window.location.replace("/?aio_exit_impersonation=1");
  };

  return (
    <button
      onClick={() => void handleExit()}
      disabled={exiting}
      className="aio-button aio-button--text aio-button--compact"
      style={{ color: light ? "#ffffff" : "#1F748F", opacity: exiting ? 0.7 : 1 }}
      title={`Return to your agency workspace (${agencyName})`}
    >
      {exiting ? <Loader2 size={12} className="animate-spin" /> : <ArrowLeft size={13} />}
      {exiting ? "Returning…" : "Back to my agency account"}
    </button>
  );
}

export default BackToAgencyLink;
