import { useEffect, useRef, useState } from "react";
import { Eye, X } from "lucide-react";
import { getImpersonationState, getSession, serverExitImpersonation, type Impersonation } from "../lib/auth";

// A persistent, app-wide banner shown while an admin is "viewing as" another
// account for support. Deliberately self-contained (polls its own state)
// rather than threaded through App.tsx's view routing, so it stays visible no
// matter which page is on screen and never gets lost as new views are added.
export function ImpersonationBanner() {
  const [state, setState] = useState<Impersonation | null>(null);
  const [exiting, setExiting] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  // Publish the banner's rendered height as a CSS variable so the app shell
  // can shrink/shift to avoid content being hidden underneath.
  useEffect(() => {
    const el = bannerRef.current;
    const h = (state && el) ? el.offsetHeight : 0;
    document.documentElement.style.setProperty("--banner-h", `${h}px`);
  }, [state]);

  useEffect(() => {
    return () => document.documentElement.style.setProperty("--banner-h", "0px");
  }, []);

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
    // Navigate to the platform-home view after the session is restored.
    // Using a query param (instead of bare reload) so App.tsx knows to
    // show platform-home rather than the marketing landing page.
    window.location.replace("/?aio_exit_impersonation=1");
  };

  // When a master-owner agency account switches up to admin, the stashed
  // session belongs to their agency account (byRole !== "admin"). Show a
  // distinct, clearer message so they know they're operating as master.
  const isMasterSwitchUp = state.byRole && state.byRole !== "admin";

  const bannerText = isMasterSwitchUp ? (
    <span>
      Signed in as <strong>master</strong> · Exit back to {state.by}
    </span>
  ) : (
    <span>
      Support mode - viewing as <strong>{getSession()?.username ?? "this account"}</strong>, signed in as {state.by}
    </span>
  );

  const exitLabel = isMasterSwitchUp ? "Exit to my account" : "Exit view-as";

  return (
    <div
      ref={bannerRef}
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
      {bannerText}
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
        {exiting ? "Exiting..." : exitLabel}
      </button>
    </div>
  );
}
