---
name: api-server dev workflow quirks
description: How the AIO Fusion api-server runs in dev and how to reach it for testing
---

# api-server dev workflow

- The `artifacts/api-server` dev workflow runs `build && start` (compiled bundle), NOT a watcher. Code changes to API routes do NOT hot-reload. After editing api-server source, restart the `artifacts/api-server: API Server` workflow or new routes 404.
  **Why:** spent a round getting 404 on a freshly added route because the running process was a pre-edit build.
  **How to apply:** edit api-server route -> restart its workflow before cur/UI testing.

- Locally the api-server listens on port 8080. Test endpoints directly with `curl http://localhost:8080/api/...`.
- `/api/...` is reachable from the web app via the preview proxy (web uses apiBase `https://${window.location.host}` in dev). `$REPLIT_DEV_DOMAIN/api/...` does NOT route to it (connection refused) because each artifact has its own preview path; use localhost:8080 for direct backend tests.
- AI routes (ai-assist, diagnostic, llm-check) use the Anthropic Replit AI integration via env `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` / `_API_KEY`; client model id is `claude-sonnet-4-6`. No user API key needed.
