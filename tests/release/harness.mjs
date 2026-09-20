import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, extname } from "node:path";
import { randomBytes, scryptSync } from "node:crypto";

const root = resolve(import.meta.dirname, "../..");
const publicDir = resolve(root, "artifacts/aio-fusion/dist/public");
const pgDir = mkdtempSync(join(tmpdir(), "aio-release-pg-"));
const freePort = () => new Promise((resolvePort, reject) => {
  const probe = createNetServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const address = probe.address();
    if (!address || typeof address === "string") return reject(new Error("Could not reserve a local port"));
    probe.close(() => resolvePort(address.port));
  });
});
const port = await freePort();
const apiPort = await freePort();
const dbUrl = `postgres://release@127.0.0.1:${port}/release`;
const children = [];
const run = (command, args, options = {}) => spawnSync(command, args, {
  cwd: root,
  stdio: "inherit",
  ...options,
  env: { ...process.env, ...options.env },
});
const start = (command, args, env) => {
  const child = spawn(command, args, {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      ...env,
    },
    stdio: "inherit",
  });
  children.push(child);
  return child;
};
const waitFor = async (url) => {
  for (let i = 0; i < 120; i++) {
    try { await fetch(url); return; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
};
let cleaned = false;
const cleanup = () => {
  if (cleaned) return;
  cleaned = true;
  for (const child of children) child.kill("SIGTERM");
  spawnSync("pg_ctl", ["-D", pgDir, "-m", "immediate", "stop"], { cwd: root, stdio: "ignore" });
  rmSync(pgDir, { recursive: true, force: true });
};
process.on("exit", cleanup);
process.on("SIGTERM", () => { cleanup(); process.exit(0); });
process.on("SIGINT", () => { cleanup(); process.exit(0); });

if (!existsSync(join(publicDir, "index.html"))) {
  if (run("pnpm", ["--filter", "@workspace/aio-fusion", "run", "build"]).status !== 0) throw new Error("web build failed");
}
if (!existsSync(resolve(root, "artifacts/api-server/dist/index.mjs"))) {
  if (run("pnpm", ["--filter", "@workspace/api-server", "run", "build"]).status !== 0) throw new Error("API build failed");
}
if (run("initdb", ["-D", pgDir, "--username=release", "--auth=trust", "--no-locale"]).status !== 0) throw new Error("initdb failed");
const pgLog = join(pgDir, "postgres.log");
if (run("pg_ctl", ["-D", pgDir, "-l", pgLog, "-o", `-p ${port} -h 127.0.0.1 -k ${pgDir}`, "-w", "start"]).status !== 0) {
  const detail = existsSync(pgLog) ? readFileSync(pgLog, "utf8") : "no PostgreSQL log was written";
  throw new Error(`postgres failed:\n${detail}`);
}
if (run("createdb", ["-h", "127.0.0.1", "-p", String(port), "-U", "release", "release"]).status !== 0) throw new Error("createdb failed");
if (run("pnpm", ["--filter", "@workspace/db", "run", "push"], { env: { DATABASE_URL: dbUrl } }).status !== 0) throw new Error("schema push failed");

const password = "release-harness-password";
const salt = randomBytes(16).toString("hex");
const hash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
const sql = `
INSERT INTO platform_accounts (username,password_hash,role,email,status)
VALUES ('release-workspace','${hash}','agency','release@example.invalid','active')
ON CONFLICT (username) DO NOTHING;
INSERT INTO platform_accounts (username,password_hash,role,email,status)
VALUES ('other-workspace','${hash}','agency','other@example.invalid','active')
ON CONFLICT (username) DO NOTHING;
WITH company AS (
  INSERT INTO platform_companies (slug,role,email,display_name,status,setup_complete,free_access)
  VALUES ('release-workspace','agency','release@example.invalid','Release Workspace','active',true,true)
  ON CONFLICT (slug) DO UPDATE SET display_name=EXCLUDED.display_name
  RETURNING id
), app_user AS (
  INSERT INTO platform_users (email,name,password_hash,email_verified)
  VALUES ('release@example.invalid','Release User','${hash}',true)
  ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash
  RETURNING id
)
INSERT INTO platform_memberships (user_id,company_id,company_slug,role)
SELECT app_user.id,company.id,'release-workspace','owner' FROM app_user,company
ON CONFLICT (user_id,company_id) DO NOTHING;
INSERT INTO projects (id,name,data,owner)
VALUES ('release-project','Release project','{"client":"release-workspace"}','release-workspace')
ON CONFLICT (id) DO NOTHING;
INSERT INTO projects (id,name,data,owner)
VALUES ('other-workspace','Other workspace project','{"client":"other-workspace"}','other-workspace')
ON CONFLICT (id) DO NOTHING;`;
if (run("psql", ["-h", "127.0.0.1", "-p", String(port), "-U", "release", "-d", "release", "-v", "ON_ERROR_STOP=1", "-c", sql], { env: { DATABASE_URL: dbUrl } }).status !== 0) throw new Error("seed failed");
start("node", ["--enable-source-maps", "artifacts/api-server/dist/index.mjs"], {
  DATABASE_URL: dbUrl, PORT: String(apiPort), NODE_ENV: "test", DEPLOYMENT_ENV: "test",
  ALLOWED_ORIGIN: "http://127.0.0.1:5000", SESSION_COOKIE_SECURE: "false",
  SESSION_SECRET: "release-harness-session-secret",
  PLATFORM_ADMIN_PASSWORD: "release-harness-admin-password",
  RESEND_API_KEY: "synthetic", STRIPE_SECRET_KEY: "sk_test_synthetic",
});
await waitFor(`http://127.0.0.1:${apiPort}/api/platform/me`).catch((error) => {
  if (error) throw error;
});

const server = createServer(async (req, res) => {
  if (req.url.startsWith("/api/")) {
    const upstream = await fetch(`http://127.0.0.1:${apiPort}${req.url}`, {
      method: req.method,
      headers: req.headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req,
      duplex: ["GET", "HEAD"].includes(req.method) ? undefined : "half",
    });
    res.writeHead(upstream.status, Object.fromEntries(upstream.headers));
    res.end(Buffer.from(await upstream.arrayBuffer()));
    return;
  }
  let path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (path === "/") path = "/index.html";
  let file = join(publicDir, path);
  if (!existsSync(file) || !extname(file)) file = join(publicDir, "index.html");
  try {
    const extension = extname(file);
    const contentType = extension === ".html" ? "text/html; charset=utf-8"
      : extension === ".js" ? "text/javascript; charset=utf-8"
      : extension === ".css" ? "text/css; charset=utf-8"
      : extension === ".svg" ? "image/svg+xml"
      : extension === ".webp" ? "image/webp"
      : extension === ".jpg" || extension === ".jpeg" ? "image/jpeg"
      : extension === ".png" ? "image/png"
      : "application/octet-stream";
    res.writeHead(200, { "content-type": contentType });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.listen(5000, "127.0.0.1");