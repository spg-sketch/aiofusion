import { useEffect, useState } from "react";
import { Eye, X } from "lucide-react";
import { getImpersonationState, getSession, serverExitImpersonation, type Impersonation } from "../lib/auth";

// A persistent, app-wide banner shown while an admin is "viewing as" another
// account for support. Deliberately self-contained (polls its own state)
// rather than threaded through App.tsx's view routing, so it stays visible no
// matter which page is on screen and never gets lost as new views are added.
export function ImpersonationBanner() {
  const [state, setState] = useState<Impersonation | null>(null);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await getImpersonationState();
      if (!cancelled) setState(s);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state) return null;

  const handleExit = async () => {
    setExiting(true);
    await serverExitImpersonation();
    // A full reload is the simplest, safest way to reset every page's local
    // state (project lists, cached session, open forms) back to the admin's
    // own view after impersonation ends.
    window.location.reload();
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: "8px 16px",
        background: "#0a1628",
        color: "#ffffff",
        fontFamily: "'Inter', sans-serif",
        fontSize: 13,
      }}
    >
      <Eye size={14} color="#C8497A" />
      <span>
        Support mode - viewing as <strong>{getSession()?.username ?? "this account"}</strong>, signed in as {state.by}
      </span>
      <button
        onClick={handleExit}
        disabled={exiting}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 12px",
          borderRadius: 999,
          background: "#C8497A",
          color: "#ffffff",
          fontSize: 12,
          fontWeight: 600,
          border: "none",
          cursor: exiting ? "default" : "pointer",
          opacity: exiting ? 0.7 : 1,
        }}
      >
        <X size={12} />
        {exiting ? "Exiting..." : "Exit view-as"}
      </button>
    </div>
  );
}
