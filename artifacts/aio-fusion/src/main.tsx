import { createRoot } from "react-dom/client";
import { Suspense } from "react";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <Suspense fallback={
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#FBF6EC" }}>
      <div style={{ width: 32, height: 32, border: "3px solid #2896b9", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  }>
    <App />
  </Suspense>
);
