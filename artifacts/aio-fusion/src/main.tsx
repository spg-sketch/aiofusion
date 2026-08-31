import { createRoot } from "react-dom/client";
import { Suspense } from "react";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ImpersonationBanner } from "./components/ImpersonationBanner";
import { RouteLoading } from "./components/RouteLoading";
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
    <Suspense fallback={<RouteLoading fullScreen />}>
      <App />
    </Suspense>
  </ErrorBoundary>
);
