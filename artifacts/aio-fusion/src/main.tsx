import { createRoot } from "react-dom/client";
import { Suspense } from "react";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ImpersonationBanner } from "./components/ImpersonationBanner";
import "./index.css";

// Clear the one-time chunk-reload guard once we've made it to a fresh render,
// so a future genuine chunk-load hiccup can still self-heal with one reload.
try {
  sessionStorage.removeItem("aio-fusion:chunk-reload-attempted");
} catch {
  /* noop */
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <ImpersonationBanner />
    <Suspense fallback={
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f8fafc" }}>
        <div style={{ width: 32, height: 32, border: "3px solid #2896b9", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <App />
    </Suspense>
  </ErrorBoundary>
);
