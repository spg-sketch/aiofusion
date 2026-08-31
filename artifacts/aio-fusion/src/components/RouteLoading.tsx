import { vars } from "../marketing/vars";

export function RouteLoading({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div
      role="status"
      aria-label="Loading page"
      className="flex items-center justify-center"
      style={{
        minHeight: fullScreen ? "100vh" : "18rem",
        width: "100%",
        background: vars.navy,
        color: "white",
      }}
    >
      <div className="flex items-center gap-3 rounded-full px-5 py-3 text-sm font-semibold"
        style={{ background: "rgba(255,255,255,0.1)" }}>
        <span
          aria-hidden="true"
          className="h-5 w-5 animate-spin rounded-full border-2 border-white/35 border-t-white"
        />
        Loading AIO Fusion…
      </div>
    </div>
  );
}