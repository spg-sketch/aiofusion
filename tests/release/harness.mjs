import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, extname } from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const root = resolve(import.meta.dirname, "../..");
const publicDir = resolve(root, "artifacts/aio-fusion/dist/public");
const featureMode = process.argv.includes("--features");
const howtoMode = process.argv.includes("--howto");
const mediaResearchMode = process.argv.includes("--media-research");
const customerMediaMode = process.argv.includes("--customer-media");
const manualContactsMode = process.argv.includes("--manual-contacts") || customerMediaMode;
const securityMode = process.argv.includes("--security");
const liveAi = featureMode && process.env.AIO_FEATURE_LIVE_AI === "1";
const liveAiEnv = {};
if (liveAi) {
  for (const key of [
    "AI_INTEGRATIONS_ANTHROPIC_API_KEY", "AI_INTEGRATIONS_ANTHROPIC_BASE_URL",
    "AI_INTEGRATIONS_OPENAI_API_KEY", "AI_INTEGRATIONS_OPENAI_BASE_URL",
  ]) {
    if (!process.env[key]) throw new Error(`Real-AI feature tests require ${key}; no provider values are logged.`);
    liveAiEnv[key] = process.env[key];
  }
}
const pgDir = mkdtempSync(join(tmpdir(), "aio-release-pg-"));
const featureDir = featureMode ? mkdtempSync(join(tmpdir(), "aio-feature-mail-")) : null;
const securityDir = securityMode ? mkdtempSync(join(tmpdir(), "aio-security-mail-")) : null;
const emailCaptureFile = featureDir ? join(featureDir, "resend-capture.jsonl") : null;
const emailInterceptor = resolve(root, "tests/features/resend-interceptor.mjs");
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
const secondApiPort = customerMediaMode ? await freePort() : null;
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
  if (featureDir) rmSync(featureDir, { recursive: true, force: true });
  if (securityDir) rmSync(securityDir, { recursive: true, force: true });
};
process.on("exit", cleanup);
process.on("SIGTERM", () => { cleanup(); process.exit(0); });
process.on("SIGINT", () => { cleanup(); process.exit(0); });

if (securityMode || featureMode || howtoMode || mediaResearchMode || manualContactsMode || !existsSync(join(publicDir, "index.html"))) {
  if (securityMode) {
    // Build the real web bundles, but never query a published Insights API.
    if (run("pnpm", ["--filter", "@workspace/aio-fusion", "exec", "vite", "build", "--config", "vite.config.ts"]).status !== 0 ||
        run("pnpm", ["--filter", "@workspace/aio-fusion", "exec", "vite", "build", "--config", "vite.ssr.config.ts"]).status !== 0 ||
        run("pnpm", ["--filter", "@workspace/aio-fusion", "exec", "node", "--input-type=module", "-e", "const {runPrerender}=await import('./dist/ssr/prerender-entry.js'); await runPrerender({canonicalDomain:null});"]).status !== 0) {
      throw new Error("isolated web build failed");
    }
  } else if (run("pnpm", ["--filter", "@workspace/aio-fusion", "run", "build"]).status !== 0) throw new Error("web build failed");
}
if (securityMode || featureMode || howtoMode || mediaResearchMode || manualContactsMode || !existsSync(resolve(root, "artifacts/api-server/dist/index.mjs"))) {
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
VALUES ('release-workspace','${hash}','${featureMode ? "client" : "agency"}','release@example.invalid','active')
ON CONFLICT (username) DO NOTHING;
INSERT INTO platform_accounts (username,password_hash,role,email,status)
VALUES ('other-workspace','${hash}','agency','other@example.invalid','active')
ON CONFLICT (username) DO NOTHING;
WITH company AS (
  INSERT INTO platform_companies (slug,role,email,display_name,status,setup_complete,free_access)
   VALUES ('release-workspace','${featureMode ? "client" : "agency"}','release@example.invalid','Release Workspace','active',true,${featureMode ? "false" : "true"})
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
if (manualContactsMode) {
  // These identities exist only in this harness's disposable PostgreSQL.
  const manualSql = `
    WITH company AS (
      INSERT INTO platform_companies (slug,role,email,display_name,status,setup_complete,free_access)
      VALUES ('other-workspace','agency','other@example.invalid','Other Synthetic Workspace','active',true,true)
      RETURNING id
    ), app_user AS (
      INSERT INTO platform_users (email,name,password_hash,email_verified)
      VALUES ('other@example.invalid','other@example.invalid','${hash}',true) RETURNING id
    )
    INSERT INTO platform_memberships (user_id,company_id,company_slug,role)
    SELECT app_user.id,company.id,'other-workspace','owner' FROM app_user,company;
    WITH app_user AS (
      INSERT INTO platform_users (email,name,password_hash,email_verified)
      VALUES ('viewer@example.invalid','viewer@example.invalid','${hash}',true) RETURNING id
    )
    INSERT INTO platform_memberships (user_id,company_id,company_slug,role)
    SELECT app_user.id,company.id,'release-workspace','viewer'
    FROM app_user,platform_companies company WHERE company.slug='release-workspace';`;
  if (run("psql", ["-h", "127.0.0.1", "-p", String(port), "-U", "release", "-d", "release", "-v", "ON_ERROR_STOP=1", "-c", manualSql]).status !== 0) throw new Error("manual contact synthetic identities seed failed");
}
if (howtoMode) {
  // Synthetic, verified editorial identity. This is not an administrator and
  // has no project access. Never seed or modify a real staff/customer account.
  const editorialSql = `
    WITH editorial_user AS (
      INSERT INTO platform_users (email,name,password_hash,email_verified,google_id)
      VALUES ('howto-editor@aiofusion.ai','How-to Test Editor','${hash}',true,'howto-isolated-google-subject')
      RETURNING id
    )
    INSERT INTO platform_memberships (user_id,company_id,company_slug,role,project_access)
    SELECT editorial_user.id,c.id,c.slug,'content','[]'
    FROM editorial_user,platform_companies c WHERE c.slug='release-workspace';
  `;
  if (run("psql", ["-h", "127.0.0.1", "-p", String(port), "-U", "release", "-d", "release",
    "-v", "ON_ERROR_STOP=1", "-c", editorialSql], { env: { DATABASE_URL: dbUrl } }).status !== 0) throw new Error("isolated editorial seed failed");
  if (run("pnpm", ["--filter", "@workspace/api-server", "run", "migrate:howto"],
    { env: { DATABASE_URL: dbUrl, DEPLOYMENT_ENV: "test" } }).status !== 0) throw new Error("How-to seed migration failed");
  // Existing editorial illustrations, registered only in the disposable DB.
  // No customer assets, new privileges or target-database mutations.
  const illustrationSql = `
    INSERT INTO insight_media (id,file_name,content_type,size_bytes,public_url,alt_text)
    VALUES
      ('article-1-pr-ai','article-1-pr-ai.webp','image/webp','0','/images/insights/article-1-pr-ai.webp','Collaboration illustration'),
      ('article-3-b2b-authority','article-3-b2b-authority.webp','image/webp','0','/images/insights/article-3-b2b-authority.webp','Strategy illustration'),
      ('article-4-agentic-media','article-4-agentic-media.webp','image/webp','0','/images/insights/article-4-agentic-media.webp','Communication illustration');
  `;
  if (run("psql", ["-h", "127.0.0.1", "-p", String(port), "-U", "release", "-d", "release",
    "-v", "ON_ERROR_STOP=1", "-c", illustrationSql]).status !== 0) throw new Error("isolated illustration fixture failed");
}
if (featureMode) {
  const betaSql = `
    ALTER TABLE platform_companies
      ADD COLUMN IF NOT EXISTS beta_trial_started_at timestamptz,
      ADD COLUMN IF NOT EXISTS beta_trial_ends_at timestamptz;
    UPDATE platform_companies SET
      beta_trial_started_at = NOW(), beta_trial_ends_at = NOW() + INTERVAL '60 days'
    WHERE slug = 'release-workspace';`;
  if (run("psql", ["-h", "127.0.0.1", "-p", String(port), "-U", "release", "-d", "release",
    "-v", "ON_ERROR_STOP=1", "-c", betaSql], { env: { DATABASE_URL: dbUrl } }).status !== 0) throw new Error("isolated beta seed failed");
}
if (customerMediaMode) {
  const adminSalt = randomBytes(16).toString("hex");
  const adminHash = `scrypt$${adminSalt}$${scryptSync("release-harness-admin-password", adminSalt, 64).toString("hex")}`;
  const customerMediaSql = `
    INSERT INTO platform_accounts(username,password_hash,role,email,status)
    VALUES ('admin','${adminHash}','admin','admin@example.invalid','active')
    ON CONFLICT (username) DO UPDATE SET password_hash=EXCLUDED.password_hash;
    INSERT INTO platform_companies(slug,role,email,display_name,status,setup_complete,free_access)
    VALUES ('admin','admin','admin@example.invalid','Master Media Fixture','active',true,true)
    ON CONFLICT (slug) DO NOTHING;
    WITH master_user AS (
      INSERT INTO platform_users(email,name,password_hash,email_verified)
      VALUES ('admin@example.invalid','Master Media Fixture','${adminHash}',true)
      ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash RETURNING id
    )
    INSERT INTO platform_memberships(user_id,company_id,company_slug,role)
    SELECT u.id,c.id,c.slug,'owner' FROM master_user u,platform_companies c WHERE c.slug='admin'
    ON CONFLICT (user_id,company_id) DO NOTHING;
    INSERT INTO projects(id,name,data,owner) VALUES ('master-media-project','Master fixture','{}','admin');
    INSERT INTO platform_meta(key,value)
    SELECT 'person:mfa:' || id,'{"secret":"JBSWY3DPEHPK3PXP","enabled":true,"recoveryHashes":[],"updatedAt":"synthetic-master-factor"}'
      FROM platform_users WHERE email='admin@example.invalid';
    INSERT INTO platform_accounts (username,password_hash,role,email,status,parent)
    VALUES ('direct-media','${hash}','client','direct-media@example.invalid','active',null),
      ('managed-media','${hash}','client','managed-media@example.invalid','active','release-workspace');
    INSERT INTO platform_companies (slug,role,email,display_name,status,setup_complete,free_access,parent_slug)
    VALUES ('direct-media','client','direct-media@example.invalid','Direct Media Fixture','active',true,true,null),
      ('managed-media','client','managed-media@example.invalid','Managed Media Fixture','active',true,true,'release-workspace');
    WITH person AS (
      INSERT INTO platform_users(email,name,password_hash,email_verified)
      VALUES ('direct-media@example.invalid','direct-media@example.invalid','${hash}',true) RETURNING id
    )
    INSERT INTO platform_memberships(user_id,company_id,company_slug,role)
    SELECT person.id,c.id,c.slug,'owner' FROM person,platform_companies c WHERE c.slug='direct-media';
    INSERT INTO platform_memberships(user_id,company_id,company_slug,role)
    SELECT u.id,c.id,c.slug,'owner' FROM platform_users u,platform_companies c
    WHERE u.email='release@example.invalid' AND c.slug='managed-media';
    INSERT INTO projects(id,name,data,owner)
    VALUES ('direct-media-project','Direct fixture','{}','direct-media'),
      ('managed-media-project','Managed fixture','{}','managed-media');
    INSERT INTO media_outlets(name,category,country,website,account_id)
    SELECT 'Batch Publication ' || lpad(n::text,2,'0'),'Energy','UK','https://publication.example.invalid',null FROM generate_series(1,26) n;
    INSERT INTO media_contacts(first_name,last_name,email,role,sectors,account_id,outlet_id)
    SELECT 'Batch','Journalist ' || lpad(n::text,2,'0'),'batch-' || n || '@example.invalid','Reporter',ARRAY['Energy'],null,
      (SELECT id FROM media_outlets WHERE name='Batch Publication ' || lpad(n::text,2,'0'))
      FROM generate_series(1,26) n;
    INSERT INTO media_outlets(name,account_id)
    SELECT 'Private Publication ' || slug,slug FROM platform_companies WHERE slug IN ('release-workspace','direct-media','managed-media','other-workspace');
    INSERT INTO media_contacts(first_name,last_name,email,account_id,outlet_id)
    SELECT 'Private',slug,'private-' || slug || '@example.invalid',slug,
      (SELECT id FROM media_outlets WHERE name='Private Publication ' || slug)
      FROM platform_companies WHERE slug IN ('release-workspace','direct-media','managed-media','other-workspace');
    INSERT INTO media_bookmarks(account_id,contact_id)
    SELECT c.slug,m.id FROM platform_companies c,media_contacts m
      WHERE c.slug IN ('release-workspace','direct-media','managed-media') AND m.account_id IS NULL;
    INSERT INTO media_bookmarks(account_id,outlet_id)
    SELECT c.slug,m.id FROM platform_companies c,media_outlets m
      WHERE c.slug IN ('release-workspace','direct-media','managed-media') AND m.account_id IS NULL;
    WITH people AS (
      INSERT INTO platform_users(email,name,password_hash,email_verified)
      VALUES ('editor-media@example.invalid','Editor Media Fixture','${hash}',true),
        ('billing-media@example.invalid','Billing Media Fixture','${hash}',true) RETURNING id,email
    )
    INSERT INTO platform_memberships(user_id,company_id,company_slug,role)
    SELECT p.id,c.id,c.slug,CASE WHEN p.email='editor-media@example.invalid' THEN 'content' ELSE 'billing' END
      FROM people p,platform_companies c WHERE c.slug='other-workspace';
  `;
  if (run("psql", ["-h", "127.0.0.1", "-p", String(port), "-U", "release", "-d", "release",
    "-v", "ON_ERROR_STOP=1", "-c", customerMediaSql]).status !== 0) throw new Error("isolated customer media fixtures failed");
}

if (mediaResearchMode) {
  const mediaResearchSql = `
    INSERT INTO archive_items (
      id, project_id, owner, title, content_type, status, headline, standfirst,
      body_copy, selected_messages, media_cats
    ) VALUES (
      'media-research-pagination-story', 'release-project', 'release-workspace',
      'Renewable Energy Coverage Story', 'Article', 'Published',
      'Renewable energy reporting for industry leaders',
      'A focused renewable energy story for specialist media.',
      'Renewable energy innovation is changing how businesses plan for the future.',
      '["Renewable energy innovation is changing how businesses plan for the future."]'::jsonb,
      '["Renewable Energy"]'::jsonb
    );
    INSERT INTO archive_items (
      id, project_id, owner, title, content_type, status
    ) VALUES (
      'media-research-private-story', 'other-workspace', 'other-workspace',
      'Private Workspace Article', 'Article', 'Published'
    );
    INSERT INTO media_contacts (
      first_name, last_name, role, email, beats, sectors, geography, account_id
    )
    SELECT
      'Research',
      'Contact ' || contact_number,
      'Reporter',
      'research-' || contact_number || '@release.invalid',
      ARRAY['renewable energy'],
      ARRAY['renewable energy'],
      'Global',
      NULL
    FROM generate_series(1, 32) AS contacts(contact_number);
    INSERT INTO media_contacts (
      first_name, last_name, role, email, beats, sectors, geography, editorial_status, account_id
    ) VALUES (
      'Unrelated', 'Contact', 'Reporter', '',
      ARRAY['local history'], ARRAY['local history'], 'Global', 'departed', NULL
    );
  `;
  if (run("psql", ["-h", "127.0.0.1", "-p", String(port), "-U", "release", "-d", "release",
    "-v", "ON_ERROR_STOP=1", "-c", mediaResearchSql], { env: { DATABASE_URL: dbUrl } }).status !== 0) {
    throw new Error("isolated Media Research regression fixture seed failed");
  }
}
start("node", [
  ...(securityMode ? ["--import", resolve(root, "tests/security/outbound-interceptor.mjs")] : []),
  ...(featureMode ? ["--import", emailInterceptor] : []),
  "--enable-source-maps",
  "artifacts/api-server/dist/index.mjs",
], {
  DATABASE_URL: dbUrl, PORT: String(apiPort), NODE_ENV: securityMode ? "production" : "test", DEPLOYMENT_ENV: securityMode ? "staging" : howtoMode ? "development" : "test",
  ALLOWED_ORIGIN: "http://127.0.0.1:5000", SESSION_COOKIE_SECURE: "false",
  SESSION_SECRET: "release-harness-session-secret",
  PLATFORM_ADMIN_PASSWORD: "release-harness-admin-password",
  RESEND_API_KEY: "aio-features-synthetic-resend-key",
  STRIPE_SECRET_KEY: "sk_test_aio_features_synthetic_never_used",
  ...liveAiEnv,
  ...(securityMode ? {
    AIO_SECURITY_CAPTURE_FILE: join(securityDir, "mail.jsonl"),
    CANONICAL_DOMAIN: "staging.aiofusion.ai",
    // Deployed bootstrap requires this variable name. Its VALUE is always
    // the new loopback fixture, never any inherited published credential.
    PRODUCTION_DATABASE_URL: dbUrl,
  } : {}),
  ...(featureMode ? {
    AIO_FEATURE_EMAIL_CAPTURE: "1",
    AIO_FEATURE_EMAIL_CAPTURE_FILE: emailCaptureFile,
  } : {}),
});
await waitFor(`http://127.0.0.1:${apiPort}/api/platform/me`).catch((error) => {
  if (error) throw error;
});
if (secondApiPort) {
  start("node", ["--enable-source-maps", "artifacts/api-server/dist/index.mjs"], {
    DATABASE_URL: dbUrl, PORT: String(secondApiPort), NODE_ENV: "test", DEPLOYMENT_ENV: "test",
    ALLOWED_ORIGIN: "http://127.0.0.1:5000", SESSION_COOKIE_SECURE: "false",
    SESSION_SECRET: "release-harness-session-secret",
    PLATFORM_ADMIN_PASSWORD: "release-harness-admin-password",
  });
  await waitFor(`http://127.0.0.1:${secondApiPort}/api/platform/me`);
}

const server = createServer(async (req, res) => {
  if (securityMode && req.method === "GET" && req.url === "/__test/security-state") {
    const state = run("psql", ["-h", "127.0.0.1", "-p", String(port), "-U", "release", "-d", "release",
      "-At", "-c", `SELECT json_build_object(
        'foreignProject',(SELECT row_to_json(p) FROM projects p WHERE id='other-workspace'),
        'projects',(SELECT count(*) FROM projects),
        'contacts',(SELECT count(*) FROM media_contacts),
        'tokenUsage',(SELECT count(*) FROM token_usage),
        'archive',(SELECT count(*) FROM archive_items),
        'planner',(SELECT count(*) FROM planner_items))`],
      { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", env: { DATABASE_URL: dbUrl } });
    res.writeHead(state.status === 0 ? 200 : 500, { "content-type": "application/json" });
    res.end(state.status === 0 ? state.stdout.trim() : '{"error":"Fixture integrity query failed"}');
    return;
  }
  if (mediaResearchMode && req.method === "GET" && req.url === "/__test/media-research-state") {
    const state = run("psql", ["-h", "127.0.0.1", "-p", String(port), "-U", "release", "-d", "release",
      "-At", "-c", "SELECT json_build_object('tokenUsageCount',(SELECT count(*) FROM token_usage))"],
    { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", env: { DATABASE_URL: dbUrl } });
    if (state.status !== 0) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Could not read isolated Media Research usage state." }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(state.stdout.trim());
    return;
  }
  if (featureMode && req.method === "GET" && req.url?.startsWith("/__test/verification-email")) {
    const query = new URL(req.url, "http://127.0.0.1:5000").searchParams;
    const email = (query.get("email") ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "A valid email address is required." }));
      return;
    }
    const captured = existsSync(emailCaptureFile) ? readFileSync(emailCaptureFile, "utf8").split("\n").filter(Boolean) : [];
    const message = captured.map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean).reverse().find((entry) => {
      const to = Array.isArray(entry.message?.to) ? entry.message.to : [entry.message?.to];
      return entry.message?.subject === "Verify your AIO Fusion email address"
        && to.some((recipient) => String(recipient).trim().toLowerCase() === email);
    });
    if (!message) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "No captured verification email exists for this address." }));
      return;
    }
    const body = `${message.message?.text ?? ""}\n${message.message?.html ?? ""}`.replace(/&amp;/g, "&");
    const verifyUrl = body.match(/https?:\/\/[^\s"'<>]+\/api\/platform\/verify-email\?token=[A-Fa-f0-9]+/)?.[0];
    if (!verifyUrl) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Captured verification email did not contain a usable verification link." }));
      return;
    }
    const token = new URL(verifyUrl).searchParams.get("token");
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({
      email,
      subject: message.message.subject,
      text: message.message.text,
      html: message.message.html,
      // Keep the emailed bearer token but direct the browser only to this
      // loopback harness. Verification still runs through the real API route.
      localVerifyUrl: `http://127.0.0.1:5000/api/platform/verify-email?token=${encodeURIComponent(token)}`,
    }));
    return;
  }
  if (req.url.startsWith("/api/")) {
    try {
      const targetPort = customerMediaMode && secondApiPort && req.headers["x-release-api-worker"] === "second" ? secondApiPort : apiPort;
      const upstream = await fetch(`http://127.0.0.1:${targetPort}${req.url}`, {
        method: req.method,
        headers: req.headers,
        redirect: "manual",
        body: ["GET", "HEAD"].includes(req.method) ? undefined : req,
        duplex: ["GET", "HEAD"].includes(req.method) ? undefined : "half",
      });
      const headers = Object.fromEntries(upstream.headers);
      const cookies = upstream.headers.getSetCookie();
      if (cookies.length) headers["set-cookie"] = cookies;
      // fetch decompresses bodies; do not forward stale encoding/length headers.
      delete headers["content-encoding"];
      delete headers["content-length"];
      if (featureMode && headers.location) {
        const destination = new URL(headers.location, `http://127.0.0.1:${apiPort}`);
        if (!["127.0.0.1", "localhost"].includes(destination.hostname)) {
          throw new Error("Feature harness refused a redirect outside the isolated server");
        }
        // Production redirects use HTTPS. Preserve the redirect, session
        // cookie and query, but let the browser follow it on this local server.
        headers.location = `http://127.0.0.1:5000${destination.pathname}${destination.search}${destination.hash}`;
      }
      res.writeHead(upstream.status, headers);
      if (upstream.body) await pipeline(Readable.fromWeb(upstream.body), res);
      else res.end();
    } catch (error) {
      console.error("Isolated harness upstream request failed:", error.message);
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Isolated test API is unavailable." }));
      } else {
        res.destroy();
      }
    }
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