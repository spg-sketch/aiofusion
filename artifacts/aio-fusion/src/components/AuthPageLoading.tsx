import { Loader2 } from "lucide-react";

/**
 * A destination-specific lazy boundary for authentication. It intentionally
 * mirrors the Platform Home header and sign-in card rather than replacing the
 * previous page with the generic full-screen route spinner.
 */
export function AuthPageLoading() {
  return (
    <div
      data-testid="auth-page-loading"
      className="min-h-screen min-w-0 max-w-full overflow-x-hidden font-['Inter',sans-serif]"
      style={{ background: "white", color: "#0a1628" }}
      aria-live="polite"
    >
      <header
        className="px-4 sm:px-10 py-4 sm:py-6 flex items-center justify-between gap-3 sm:gap-6"
        style={{ background: "#1A647B", borderBottom: "1px solid rgba(255,255,255,0.15)" }}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/logo-white-notagline.png`}
          alt="AIO Fusion"
          className="h-14 sm:h-30 w-auto max-w-full"
        />
      </header>
      <div className="min-w-0 max-w-7xl mx-auto px-4 sm:px-10 py-10 sm:py-14">
        <div className="mb-8 sm:mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4" style={{ background: "#C8497A" }}>
            <span className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: "white" }}>Platform Home</span>
          </div>
          <h1 className="aio-type-display">Welcome to <span style={{ color: "#C8497A" }}>AIO Fusion</span></h1>
        </div>
        <div
          role="status"
          aria-label="Loading sign in"
          className="rounded-2xl p-6 sm:p-10 mb-6 sm:mb-8"
          style={{ background: "#1A647B", boxShadow: "0 8px 24px -12px rgba(26,100,123,0.35)" }}
        >
          <div className="max-w-md mx-auto py-8 text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: "rgba(255,255,255,0.15)" }}>
              <Loader2 size={28} className="animate-spin" color="white" />
            </div>
            <p className="text-[15px]" style={{ color: "rgba(255,255,255,0.8)" }}>Preparing secure sign in…</p>
          </div>
        </div>
      </div>
    </div>
  );
}