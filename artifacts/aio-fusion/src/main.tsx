import { createRoot } from "react-dom/client";
import { Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ImpersonationBanner } from "./components/ImpersonationBanner";
import { RouteLoading } from "./components/RouteLoading";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Clear the one-time chunk-reload guard once we've made it to a fresh render,
// so a future genuine chunk-load hiccup can still self-heal with one reload.
try {
  sessionStorage.removeItem("aio-fusion:chunk-reload-attempted");
} catch {
  /* noop */
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ImpersonationBanner />
      <Suspense fallback={<RouteLoading fullScreen />}>
        <App />
      </Suspense>
    </QueryClientProvider>
  </ErrorBoundary>
);
