/**
 * Vite SSR build configuration for the prerender script.
 *
 * Usage (invoked automatically by the `build` npm script):
 *   vite build --config vite.ssr.config.ts
 *
 * Outputs a Node-compatible ESM bundle at dist/ssr/prerender-entry.js.
 * The bundle is self-contained: it imports react/react-dom/server as
 * externals (resolved from the project's node_modules at runtime) and
 * stubs out image/video assets so they don't cause errors in Node.
 */
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/** Replace asset imports (.png, .jpg, …) with an empty string in SSR. */
function stubAssets(): Plugin {
  return {
    name: "stub-assets-for-ssr",
    load(id) {
      if (/\.(png|jpg|jpeg|gif|webp|svg|mp4|mov|ogg|wav|pdf)(\?.*)?$/.test(id)) {
        return `export default ""`;
      }
    },
  };
}

/** Prepend window/document/localStorage stubs to the entry bundle so they are
 *  available before any module code runs (import declarations are hoisted, but
 *  the Rollup renderChunk hook runs after bundling, inserting code before the
 *  first module line). */
function ssrGlobalsBanner(): Plugin {
  const banner = `
// ── Browser-API stubs for SSR prerender ──────────────────────────────────
if (typeof window === "undefined") {
  const _g = globalThis;
  _g.window = {
    scrollTo() {},
    addEventListener() {},
    removeEventListener() {},
    history: { pushState() {}, replaceState() {}, state: null },
    location: { pathname: "/", search: "", hash: "", href: "https://aiofusion.ai/" },
    clearInterval() {},
    setInterval() { return 0; },
    setTimeout() { return 0; },
    clearTimeout() {},
    innerWidth: 1280,
    innerHeight: 800,
  };
  _g.document = {
    title: "",
    querySelector() { return null; },
    getElementById() { return null; },
    createElement() { return { style: {}, setAttribute() {}, appendChild() {}, textContent: "", type: "" }; },
    createTextNode() { return {}; },
    head: { appendChild() {} },
    body: { appendChild() {} },
    addEventListener() {},
    removeEventListener() {},
    visibilityState: "visible",
  };
  _g.localStorage  = { getItem() { return null; }, setItem() {}, removeItem() {}, clear() {} };
  _g.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {}, clear() {} };
  try { _g.navigator = { userAgent: "" }; } catch (_) { /* read-only in some Node versions */ }
  _g.CustomEvent = class CustomEvent { constructor(type, opts) { this.type = type; this.detail = opts?.detail ?? null; } };
  _g.Event = class Event { constructor(type) { this.type = type; } };
}
// ─────────────────────────────────────────────────────────────────────────
`;

  return {
    name: "ssr-globals-banner",
    renderChunk(code, chunk) {
      if (chunk.isEntry) {
        return { code: banner + code, map: null };
      }
    },
  };
}

export default defineConfig({
  plugins: [stubAssets(), react(), ssrGlobalsBanner()],

  define: {
    "import.meta.env.BASE_URL":  JSON.stringify("/"),
    "import.meta.env.SSR":       JSON.stringify(true),
    "import.meta.env.MODE":      JSON.stringify("production"),
    "import.meta.env.PROD":      JSON.stringify(true),
    "import.meta.env.DEV":       JSON.stringify(false),
    "import.meta.env.VITE_API_BASE": JSON.stringify(""),
  },

  build: {
    ssr: "src/prerender-entry.tsx",
    outDir: "dist/ssr",
    emptyOutDir: true,
    target: "node18",
    rollupOptions: {
      // Keep React external so the SSR bundle uses the same React instance
      // as node_modules (required for hooks to work inside renderToStaticMarkup).
      external: [
        "react",
        "react-dom",
        "react-dom/server",
        "node:fs",
        "node:path",
        "node:url",
        "node:process",
      ],
      output: {
        format: "esm",
      },
    },
  },

  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },

  root: path.resolve(import.meta.dirname),
});
