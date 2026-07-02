import { Component, type ReactNode } from "react";

interface ErrorBoundaryState {
  hasError: boolean;
}

// Catches render-time errors - most commonly a lazy-loaded page chunk that
// fails to load (flaky connection, or a stale chunk hash after a new deploy).
// Without this, an uncaught error unmounts the whole app and the user is left
// looking at a blank white page with no way back in except a manual refresh.
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error("Caught a render error, showing recovery screen:", error);

    // The most common trigger is a lazy-loaded page chunk failing to fetch
    // (brief network hiccup, or a stale chunk hash after a new deploy). That's
    // usually self-healing with a single reload, so do it automatically once
    // rather than leaving the user stuck on a blank/error screen. Guard with a
    // sessionStorage flag so a genuinely broken page doesn't reload forever.
    const message = error instanceof Error ? error.message : String(error);
    const isChunkLoadError = /dynamically imported module|Failed to fetch|Loading chunk|error loading dynamically/i.test(message);
    if (isChunkLoadError) {
      const key = "aio-fusion:chunk-reload-attempted";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
      }
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            gap: 16,
            background: "#f8fafc",
            fontFamily: "'Inter', sans-serif",
            textAlign: "center",
            padding: 24,
          }}
        >
          <div style={{ fontSize: 15, color: "#0a1628", fontWeight: 600 }}>
            That page had trouble loading.
          </div>
          <div style={{ fontSize: 13, color: "#6b7280", maxWidth: 360 }}>
            This is usually a brief connection hiccup. Reload to pick up where you left off.
          </div>
          <button
            onClick={this.handleReload}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              background: "#C8497A",
              color: "white",
              fontSize: 13,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
