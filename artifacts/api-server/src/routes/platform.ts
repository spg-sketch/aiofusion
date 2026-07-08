import crypto from "crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  platformAccountsTable,
  platformMetaTable,
  platformSessionsTable,
  projectsTable,
  projectSnapshotsTable,
  archiveItemsTable,
  plannerItemsTable,
  scoringConfigsTable,
  mediaOutletsTable,
  mediaContactsTable,
  mediaCategoriesTable,
  tokenUsageTable,
  auditLocksTable,
  adminEventsTable,
} from "@workspace/db";
import { and, count, desc, eq, gte, ilike, like, lte, sql } from "drizzle-orm";
import {
  hashPassword,
  verifyPassword,
  normUsername,
  USERNAME_RE,
  getAccount,
  getAccountByIdentifier,
  emailExists,
  getVisibleUsernames,
  canManage,
  normalizeRole,
  canCreateSubAccounts,
  ensureDefaultAdmin,
  createPlatformSession,
  deletePlatformSession,
  listPlatformSessions,
  revokeOtherSessions,
  getPlatformSessionId,
  setPlatformCookie,
  clearPlatformCookie,
  getImpersonationStashId,
  setImpersonationStashCookie,
  clearImpersonationStashCookie,
  getPlatformSessionAccount,
  makeIpHint,
  type Role,
} from "../lib/platform-auth";
import { requirePlatformAuth } from "../middleware/platform-auth";
import { loginLimiter } from "../middleware/rate-limit";
import { logAdminEvent } from "../lib/admin-events";

const router: IRouter = Router();

const MIGRATED_FLAG = "accounts_migrated";

function publicAccount(
  row: { username: string; role: string; parent: string | null },
  displayName?: string,
  archived?: boolean,
) {
  return {
    username: row.username,
    role: normalizeRole(row.role),
    parent: row.parent ?? undefined,
    ...(displayName ? { displayName } : {}),
    ...(archived ? { archived: true } : {}),
  };
}

// Friendly display names live in the generic platform_meta key/value table
// (one row per account, keyed `account:profile:<username>`) so no schema change
// is needed. The value is JSON, currently just { displayName }.
const PROFILE_PREFIX = "account:profile:";
const profileKey = (username: string) => `${PROFILE_PREFIX}${normUsername(username)}`;

// Archived accounts are soft-deactivated: they cannot log in and are shown
// in a separate section. The flag is stored as a platform_meta row.
const ARCHIVE_PREFIX = "account:archived:";
const archiveKey = (username: string) => `${ARCHIVE_PREFIX}${normUsername(username)}`;

async function getArchivedSet(): Promise<Set<string>> {
  const rows = await db
    .select()
    .from(platformMetaTable)
    .where(like(platformMetaTable.key, `${ARCHIVE_PREFIX}%`));
  return new Set(rows.map((r) => r.key.slice(ARCHIVE_PREFIX.length)));
}

async function setArchived(username: string, archived: boolean): Promise<void> {
  const key = archiveKey(username);
  if (archived) {
    await db
      .insert(platformMetaTable)
      .values({ key, value: "true" })
      .onConflictDoUpdate({ target: platformMetaTable.key, set: { value: "true" } });
  } else {
    await db.delete(platformMetaTable).where(eq(platformMetaTable.key, key));
  }
}

function parseDisplayName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const obj = JSON.parse(value) as { displayName?: unknown };
    const dn = typeof obj?.displayName === "string" ? obj.displayName.trim() : "";
    return dn || undefined;
  } catch {
    return undefined;
  }
}

// Map of lowercased username -> display name for every account that has one.
async function getDisplayNames(): Promise<Map<string, string>> {
  const rows = await db
    .select()
    .from(platformMetaTable)
    .where(like(platformMetaTable.key, `${PROFILE_PREFIX}%`));
  const map = new Map<string, string>();
  for (const r of rows) {
    const dn = parseDisplayName(r.value);
    if (dn) map.set(r.key.slice(PROFILE_PREFIX.length), dn);
  }
  return map;
}

// Set (or, when blank, clear) an account's display name.
async function setDisplayName(username: string, displayName: string): Promise<void> {
  const key = profileKey(username);
  const dn = displayName.trim().slice(0, 64);
  if (!dn) {
    await db.delete(platformMetaTable).where(eq(platformMetaTable.key, key));
    return;
  }
  const value = JSON.stringify({ displayName: dn });
  await db
    .insert(platformMetaTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: platformMetaTable.key, set: { value } });
}

async function deleteProfile(username: string): Promise<void> {
  await db
    .delete(platformMetaTable)
    .where(eq(platformMetaTable.key, profileKey(username)));
}

// --- Session lifecycle ------------------------------------------------------

// Who is signed in (or null). Drives the client's view of the current session.
router.get("/platform/me", async (req: Request, res: Response) => {
  let impersonating: { by: string } | null = null;
  const stashSid = getImpersonationStashId(req);
  if (req.account && stashSid) {
    const adminAccount = await getPlatformSessionAccount(stashSid);
    if (adminAccount) impersonating = { by: adminAccount.username };
  }
  res.json({ account: req.account ?? null, impersonating });
});

// Whether the one-time migration of browser-stored accounts has already run.
// The client uses this to decide whether to push its localStorage accounts up.
router.get("/platform/status", async (_req: Request, res: Response) => {
  try {
    const [row] = await db
      .select()
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, MIGRATED_FLAG))
      .limit(1);
    res.json({ migrated: row?.value === "true" });
  } catch {
    res.status(500).json({ error: "Failed to read status" });
  }
});

router.post("/platform/login", loginLimiter, async (req: Request, res: Response) => {
  try {
    // Accept either a username or an email in the `username` field so that
    // legacy username logins and new email logins both work without change.
    const identifier = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!identifier || !password) {
      res.status(400).json({ error: "Enter your username (or email) and password." });
      return;
    }
    const account = await getAccountByIdentifier(identifier);
    if (!account || !verifyPassword(password, account.passwordHash)) {
      res.status(401).json({ error: "Incorrect username or password." });
      return;
    }
    // Block archived accounts (soft-deactivated via platform_meta flag).
    const [archivedRow] = await db
      .select()
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, archiveKey(account.username)))
      .limit(1);
    if (archivedRow?.value === "true") {
      res.status(403).json({ error: "This account has been archived. Contact your administrator." });
      return;
    }
    // Block accounts that haven't been approved yet.
    if (account.status === "pending_approval") {
      res.status(403).json({ error: "pending_approval" });
      return;
    }
    if (account.status === "suspended") {
      res.status(403).json({ error: "This account has been suspended. Contact your administrator." });
      return;
    }
    const rawIp = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
      ?? req.socket.remoteAddress;
    const sid = await createPlatformSession(account.username, makeIpHint(rawIp));
    setPlatformCookie(res, sid);
    res.json({ account: { username: account.username, role: account.role } });
  } catch {
    res.status(500).json({ error: "Login failed" });
  }
});

// --- Self-serve sign-up (public, no auth required) --------------------------
//
// Creates a new agency account with status=pending_approval. The account
// cannot log in until an admin approves it. A username is auto-derived from
// the company name; the owner contacts us via email listed on the record.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/platform/signup", loginLimiter, async (req: Request, res: Response) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 64) : "";
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const companyName = typeof req.body?.companyName === "string" ? req.body.companyName.trim().slice(0, 64) : "";
    const website = typeof req.body?.website === "string" ? req.body.website.trim().slice(0, 128) : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!name) { res.status(400).json({ error: "Your name is required." }); return; }
    if (!email || !EMAIL_RE.test(email)) { res.status(400).json({ error: "A valid email address is required." }); return; }
    if (!companyName) { res.status(400).json({ error: "Company name is required." }); return; }
    if (!password || password.length < 8) { res.status(400).json({ error: "Password must be at least 8 characters." }); return; }

    // Email must be unique.
    if (await emailExists(email)) {
      res.status(409).json({ error: "An account with that email already exists. Try signing in instead." });
      return;
    }

    // Derive a slug username from the company name: lowercase, spaces→hyphens,
    // strip non-alphanumeric. Append a counter if already taken.
    const baseSlug = companyName
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .slice(0, 24)
      .replace(/^-+|-+$/g, "") || "account";

    let username = baseSlug;
    let attempt = 0;
    while (await getAccount(username)) {
      attempt++;
      username = `${baseSlug}-${attempt}`;
    }

    // Store display name in platform_meta so it shows up everywhere company
    // names are rendered without requiring a schema change.
    const displayNameKey = `account:profile:${username}`;
    const displayNameValue = JSON.stringify({ displayName: companyName, ownerName: name });

    await db.insert(platformAccountsTable).values({
      username,
      passwordHash: hashPassword(password),
      role: "agency",
      email,
      website: website || null,
      status: "pending_approval",
    });

    await db
      .insert(platformMetaTable)
      .values({ key: displayNameKey, value: displayNameValue })
      .onConflictDoUpdate({ target: platformMetaTable.key, set: { value: displayNameValue } });

    res.status(201).json({ ok: true, username, status: "pending_approval" });
  } catch (err) {
    console.error("[signup]", err);
    res.status(500).json({ error: "Sign-up failed. Please try again." });
  }
});

// --- Admin: list pending accounts -------------------------------------------

router.get("/platform/admin/pending", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    if (req.account!.role !== "admin") {
      res.status(403).json({ error: "Admin access required." });
      return;
    }
    const rows = await db
      .select()
      .from(platformAccountsTable)
      .where(eq(platformAccountsTable.status, "pending_approval"));

    const displayNames = await getDisplayNames();

    const accounts = rows.map((r) => ({
      username: r.username,
      email: r.email ?? null,
      website: r.website ?? null,
      displayName: displayNames.get(r.username) ?? null,
      createdAt: r.createdAt,
    }));

    res.json({ accounts });
  } catch {
    res.status(500).json({ error: "Failed to load pending accounts." });
  }
});

// --- Admin: approve a pending account ---------------------------------------

router.post("/platform/admin/accounts/:username/approve", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    if (req.account!.role !== "admin") {
      res.status(403).json({ error: "Admin access required." });
      return;
    }
    const target = normUsername(req.params.username);
    if (!target) { res.status(400).json({ error: "Username required." }); return; }
    const account = await getAccount(target);
    if (!account) { res.status(404).json({ error: "Account not found." }); return; }
    if (account.status !== "pending_approval") {
      res.status(400).json({ error: "Account is not pending approval." });
      return;
    }
    await db
      .update(platformAccountsTable)
      .set({ status: "active" })
      .where(eq(platformAccountsTable.username, target));

    void logAdminEvent(
      { username: req.account!.username },
      "account_approve",
      target,
      "account",
      { email: account.email },
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to approve account." });
  }
});

// --- Admin: reject (delete) a pending account -------------------------------

router.post("/platform/admin/accounts/:username/reject", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    if (req.account!.role !== "admin") {
      res.status(403).json({ error: "Admin access required." });
      return;
    }
    const target = normUsername(req.params.username);
    if (!target) { res.status(400).json({ error: "Username required." }); return; }
    const account = await getAccount(target);
    if (!account) { res.status(404).json({ error: "Account not found." }); return; }
    if (account.status !== "pending_approval") {
      res.status(400).json({ error: "Only pending accounts can be rejected." });
      return;
    }
    // Hard-delete the rejected application — no data was ever created.
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, target));
    await db.delete(platformMetaTable).where(like(platformMetaTable.key, `%:${target}`));
    void logAdminEvent(
      { username: req.account!.username },
      "account_reject",
      target,
      "account",
      { email: account.email, reason: req.body?.reason ?? null },
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to reject account." });
  }
});

// --- Google OAuth 2.0 sign-in / sign-up -------------------------------------

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";
const OAUTH_STATE_COOKIE = "aio_oauth_state";

function getGoogleCallbackUrl(req: Request): string {
  if (process.env.NODE_ENV !== "production") {
    const host = req.get("x-forwarded-host") || req.get("host") || "";
    const hostname = host.split(":")[0];
    if (hostname) return `https://${hostname}/api/platform/auth/google/callback`;
  }
  return "https://www.aiofusion.ai/api/platform/auth/google/callback";
}

function getFrontendOrigin(req: Request): string {
  if (process.env.NODE_ENV !== "production") {
    const host = req.get("x-forwarded-host") || req.get("host") || "";
    const hostname = host.split(":")[0];
    if (hostname) return `https://${hostname}`;
  }
  return "https://www.aiofusion.ai";
}

router.get("/platform/auth/google", (req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(503).json({ error: "Google Sign-In is not configured." });
    return;
  }
  const state = crypto.randomBytes(16).toString("hex");
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
    path: "/",
  });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGoogleCallbackUrl(req),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  res.redirect(`${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`);
});

router.get("/platform/auth/google/callback", async (req: Request, res: Response) => {
  const origin = getFrontendOrigin(req);
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      res.redirect(`${origin}/?oauth_status=error&oauth_msg=not_configured`);
      return;
    }
    const { code, state, error: oauthError } = req.query as Record<string, string>;
    if (oauthError) {
      res.redirect(`${origin}/?oauth_status=error&oauth_msg=${encodeURIComponent(oauthError)}`);
      return;
    }
    // Verify CSRF state
    const storedState = (req.cookies as Record<string, string>)?.[OAUTH_STATE_COOKIE];
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });
    if (!state || state !== storedState) {
      res.redirect(`${origin}/?oauth_status=error&oauth_msg=invalid_state`);
      return;
    }
    if (!code) {
      res.redirect(`${origin}/?oauth_status=error&oauth_msg=no_code`);
      return;
    }
    // Exchange authorisation code for access token
    const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: getGoogleCallbackUrl(req),
        grant_type: "authorization_code",
      }).toString(),
    });
    if (!tokenRes.ok) {
      res.redirect(`${origin}/?oauth_status=error&oauth_msg=token_exchange_failed`);
      return;
    }
    const tokens = await tokenRes.json() as { access_token?: string; error?: string };
    if (!tokens.access_token) {
      res.redirect(`${origin}/?oauth_status=error&oauth_msg=no_access_token`);
      return;
    }
    // Fetch the user's Google profile
    const userInfoRes = await fetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userInfoRes.ok) {
      res.redirect(`${origin}/?oauth_status=error&oauth_msg=userinfo_failed`);
      return;
    }
    const userInfo = await userInfoRes.json() as { email?: string; name?: string; given_name?: string };
    if (!userInfo.email) {
      res.redirect(`${origin}/?oauth_status=error&oauth_msg=no_email`);
      return;
    }
    // Look up an existing account by email (case-insensitive)
    const [existing] = await db
      .select()
      .from(platformAccountsTable)
      .where(ilike(platformAccountsTable.email, userInfo.email))
      .limit(1);
    if (existing) {
      if (existing.status === "pending_approval") {
        res.redirect(`${origin}/?oauth_status=pending`);
        return;
      }
      if (existing.status === "suspended") {
        res.redirect(`${origin}/?oauth_status=suspended`);
        return;
      }
      // Active account — create a session and redirect in
      const sid = await createPlatformSession(existing.username, makeIpHint(req));
      setPlatformCookie(res, sid);
      res.redirect(`${origin}/?oauth_status=ok`);
      return;
    }
    // No account — register a new pending one from the Google profile
    const displayName = userInfo.name || userInfo.given_name || userInfo.email.split("@")[0];
    const emailDomain = userInfo.email.split("@")[1] ?? "";
    let baseSlug = (emailDomain.split(".")[0] ?? "user")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24);
    if (!baseSlug || !USERNAME_RE.test(baseSlug)) baseSlug = "user";
    let username = baseSlug;
    for (let i = 1; ; i++) {
      if (!(await getAccount(username))) break;
      username = `${baseSlug}-${i}`;
    }
    await db.insert(platformAccountsTable).values({
      username,
      passwordHash: hashPassword(crypto.randomBytes(32).toString("hex")),
      role: "agency",
      status: "pending_approval",
      email: userInfo.email,
      website: null,
    });
    await db.insert(platformMetaTable).values({
      key: `account:profile:${username}`,
      value: JSON.stringify({ displayName, ownerName: displayName }),
    }).onConflictDoUpdate({
      target: platformMetaTable.key,
      set: { value: JSON.stringify({ displayName, ownerName: displayName }) },
    });
    res.redirect(`${origin}/?oauth_status=pending`);
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    res.redirect(`${origin}/?oauth_status=error&oauth_msg=unexpected`);
  }
});

router.post("/platform/logout", async (req: Request, res: Response) => {
  try {
    const sid = getPlatformSessionId(req);
    if (sid) await deletePlatformSession(sid);
    clearPlatformCookie(res);
    // Never leave a stashed admin session behind after a logout.
    clearImpersonationStashCookie(res);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Logout failed" });
  }
});

// --- Impersonation ("view account" for support) -----------------------------
//
// Lets an admin briefly step into another account's view without a password,
// for support/debugging. The admin's own session id is stashed in a second
// cookie so "exit" can restore it without a fresh login; the target account
// gets a normal (single-use) session, which - like a real login - ends any
// session that account already had open.

// POST /api/platform/accounts/:username/impersonate — admin only.
router.post(
  "/platform/accounts/:username/impersonate",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      if (actor.role !== "admin") {
        res.status(403).json({ error: "Admin access required." });
        return;
      }
      // Already viewing as someone else: don't allow nesting, which would
      // overwrite the stash and strand the original admin session.
      if (getImpersonationStashId(req)) {
        res.status(400).json({ error: "Exit the current view-as session first." });
        return;
      }
      const target = normUsername(req.params.username);
      if (!target) {
        res.status(400).json({ error: "Username is required." });
        return;
      }
      if (target === normUsername(actor.username)) {
        res.status(400).json({ error: "You are already signed in as this account." });
        return;
      }
      const account = await getAccount(target);
      if (!account) {
        res.status(404).json({ error: "Account not found." });
        return;
      }
      const adminSid = getPlatformSessionId(req);
      if (!adminSid) {
        res.status(401).json({ error: "Unauthorized: sign in required" });
        return;
      }
      const rawIp = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
        ?? req.socket.remoteAddress;
      const sid = await createPlatformSession(account.username, makeIpHint(rawIp));
      setImpersonationStashCookie(res, adminSid);
      setPlatformCookie(res, sid);
      void logAdminEvent(
        { username: actor.username },
        "impersonate_start",
        account.username,
        "account",
        { role: account.role },
      );
      res.json({ account: { username: account.username, role: account.role } });
    } catch {
      res.status(500).json({ error: "Failed to start view-as session" });
    }
  },
);

// POST /api/platform/exit-impersonation — restores the stashed admin session.
router.post("/platform/exit-impersonation", async (req: Request, res: Response) => {
  try {
    const stashSid = getImpersonationStashId(req);
    if (!stashSid) {
      res.status(400).json({ error: "Not currently viewing another account." });
      return;
    }
    const adminAccount = await getPlatformSessionAccount(stashSid);
    if (!adminAccount) {
      // The stashed admin session expired or was revoked; there is nothing
      // safe to restore, so just clear both cookies and require a fresh login.
      clearImpersonationStashCookie(res);
      clearPlatformCookie(res);
      res.status(401).json({ error: "Your original session expired. Please sign in again." });
      return;
    }
    const viewedSid = getPlatformSessionId(req);
    if (viewedSid && viewedSid !== stashSid) await deletePlatformSession(viewedSid);
    setPlatformCookie(res, stashSid);
    clearImpersonationStashCookie(res);
    void logAdminEvent(
      { username: adminAccount.username },
      "impersonate_exit",
      null,
      "account",
      null,
    );
    res.json({ account: { username: adminAccount.username, role: adminAccount.role } });
  } catch {
    res.status(500).json({ error: "Failed to exit view-as session" });
  }
});

// --- Account management -----------------------------------------------------

// List accounts the caller may see: an admin sees all; a normal account sees
// itself plus its descendant sub-accounts. Powers the client's accounts page.
router.get(
  "/platform/accounts",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const account = req.account!;
      const rows = await db
        .select({
          username: platformAccountsTable.username,
          role: platformAccountsTable.role,
          parent: platformAccountsTable.parent,
        })
        .from(platformAccountsTable);
      const visible = await getVisibleUsernames(account);
      const filtered =
        visible === null
          ? rows
          : rows.filter((r) => visible.includes(normUsername(r.username)));
      const [names, archivedSet] = await Promise.all([getDisplayNames(), getArchivedSet()]);
      res.json({
        accounts: filtered.map((r) =>
          publicAccount(r, names.get(normUsername(r.username)), archivedSet.has(normUsername(r.username))),
        ),
      });
    } catch {
      res.status(500).json({ error: "Failed to load accounts" });
    }
  },
);

// Create a sub-account. The new account's parent is the caller (so it joins the
// caller's visibility subtree). Only an admin may create another admin.
router.post(
  "/platform/accounts",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      const username = normUsername(req.body?.username);
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const requestedRole = normalizeRole(req.body?.role);
      // The master (admin) may create an agency, a direct client, or another
      // admin. Everyone else can only ever create a leaf client account, so we
      // coerce the requested role rather than trusting it.
      const role: Role = actor.role === "admin" ? requestedRole : "client";
      const displayName =
        typeof req.body?.displayName === "string" ? req.body.displayName : "";

      if (!username) {
        res.status(400).json({ error: "Username is required." });
        return;
      }
      if (!USERNAME_RE.test(username)) {
        res.status(400).json({
          error: "Username must be 2-32 characters: letters, numbers, _.-",
        });
        return;
      }
      if (!password || password.length < 4) {
        res.status(400).json({ error: "Password must be at least 4 characters." });
        return;
      }
      // A direct client is a leaf account and may not create sub-accounts.
      if (!canCreateSubAccounts(actor.role)) {
        res.status(403).json({ error: "Your account cannot create other accounts." });
        return;
      }
      const existing = await getAccount(username);
      if (existing) {
        res.status(409).json({ error: "That username already exists." });
        return;
      }

      // Seat-cap enforcement: if the parent account has a maxSeats limit, count
      // existing direct sub-accounts and reject if the cap is already reached.
      if (actor.role !== "admin") {
        const parentAccount = await getAccount(normUsername(actor.username));
        if (parentAccount?.maxSeats != null) {
          const [{ value: currentSeats }] = await db
            .select({ value: count() })
            .from(platformAccountsTable)
            .where(eq(platformAccountsTable.parent, normUsername(actor.username)));
          if (currentSeats >= parentAccount.maxSeats) {
            res.status(403).json({
              error: `Seat cap reached (${parentAccount.maxSeats} ${parentAccount.maxSeats === 1 ? "seat" : "seats"} allowed). Contact your administrator to increase the limit.`,
            });
            return;
          }
        }
      }

      await db.insert(platformAccountsTable).values({
        username,
        passwordHash: hashPassword(password),
        role,
        parent: normUsername(actor.username),
      });
      if (displayName.trim()) await setDisplayName(username, displayName);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to create account" });
    }
  },
);

// Change an account's password. Admins may change anyone's; a normal account may
// change its own descendants'. Changing your own password is always allowed.
router.post(
  "/platform/accounts/password",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      const target = normUsername(req.body?.username);
      const newPassword =
        typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
      if (!target) {
        res.status(400).json({ error: "Username is required." });
        return;
      }
      if (!newPassword || newPassword.length < 4) {
        res.status(400).json({ error: "Password must be at least 4 characters." });
        return;
      }
      const isSelf = target === normUsername(actor.username);
      if (!isSelf && !(await canManage(actor, target))) {
        res.status(403).json({ error: "You cannot change this account." });
        return;
      }
      const existing = await getAccount(target);
      if (!existing) {
        res.status(404).json({ error: "Account not found." });
        return;
      }
      await db
        .update(platformAccountsTable)
        .set({ passwordHash: hashPassword(newPassword) })
        .where(eq(platformAccountsTable.username, target));
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to change password" });
    }
  },
);

// Set (or clear) an account's friendly display name. The master may set any
// account's; an account may set its own or its descendants'. A blank name
// clears it (the account then shows by username).
router.post(
  "/platform/accounts/profile",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      const target = normUsername(req.body?.username);
      const displayName =
        typeof req.body?.displayName === "string" ? req.body.displayName : "";
      if (!target) {
        res.status(400).json({ error: "Username is required." });
        return;
      }
      const isSelf = target === normUsername(actor.username);
      if (!isSelf && !(await canManage(actor, target))) {
        res.status(403).json({ error: "You cannot change this account." });
        return;
      }
      const existing = await getAccount(target);
      if (!existing) {
        res.status(404).json({ error: "Account not found." });
        return;
      }
      await setDisplayName(target, displayName);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to update account" });
    }
  },
);

// Archive (or unarchive) an account. Archived accounts cannot log in and are
// shown separately in the parent's UI. Projects are NOT reassigned — the parent
// keeps visibility. Only the parent or an admin may archive a sub-account.
router.post(
  "/platform/accounts/archive",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      const target = normUsername(req.body?.username);
      const archive = req.body?.archive !== false;
      if (!target) {
        res.status(400).json({ error: "Username is required." });
        return;
      }
      const existing = await getAccount(target);
      if (!existing) {
        res.status(404).json({ error: "Account not found." });
        return;
      }
      if (!(await canManage(actor, target))) {
        res.status(403).json({ error: "You cannot archive this account." });
        return;
      }
      await setArchived(target, archive);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to update account" });
    }
  },
);

// Delete an account. Admins may delete anyone (except the last admin); a normal
// account may delete its descendants. An account cannot delete itself here.
router.post(
  "/platform/accounts/delete",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      const target = normUsername(req.body?.username);
      if (!target) {
        res.status(400).json({ error: "Username is required." });
        return;
      }
      const existing = await getAccount(target);
      if (!existing) {
        res.status(404).json({ error: "Account not found." });
        return;
      }
      if (!(await canManage(actor, target))) {
        res.status(403).json({ error: "You cannot delete this account." });
        return;
      }
      if (existing.role === "admin") {
        const admins = await db
          .select({ username: platformAccountsTable.username })
          .from(platformAccountsTable)
          .where(eq(platformAccountsTable.role, "admin"));
        if (admins.length <= 1) {
          res.status(400).json({ error: "Cannot delete the last admin." });
          return;
        }
      }
      // Reassign the deleted account's projects to the actor first, so they
      // remain visible (visibility is derived from current ownership). Without
      // this, a deleted owner would orphan its projects out of the parent's view.
      await db
        .update(projectsTable)
        .set({ owner: normUsername(actor.username) })
        .where(eq(projectsTable.owner, target));
      await db
        .delete(platformAccountsTable)
        .where(eq(platformAccountsTable.username, target));
      await deleteProfile(target);
      void logAdminEvent(
        { username: actor.username },
        "account_delete",
        target,
        "account",
        { deletedRole: existing.role, projectsReassignedTo: normUsername(actor.username) },
      );
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to delete account" });
    }
  },
);

// Self-serve "delete my account and data" (GDPR right to erasure). Any signed-in
// account may call this on itself. Requires the caller to re-enter their own
// password as a confirmation step for such a destructive, irreversible action.
// An account with active (non-archived) sub-accounts must remove or reassign
// them first — we never silently cascade-delete another account's data as a
// side effect of someone else's deletion request.
router.post(
  "/platform/account/self-delete",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      const username = normUsername(actor.username);
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!password) {
        res.status(400).json({ error: "Enter your password to confirm." });
        return;
      }
      const account = await getAccount(username);
      if (!account || !verifyPassword(password, account.passwordHash)) {
        res.status(401).json({ error: "Incorrect password." });
        return;
      }
      if (account.role === "admin") {
        const admins = await db
          .select({ username: platformAccountsTable.username })
          .from(platformAccountsTable)
          .where(eq(platformAccountsTable.role, "admin"));
        if (admins.length <= 1) {
          res.status(400).json({ error: "You are the last admin, so this account cannot be deleted. Promote another account to admin first." });
          return;
        }
      }
      const children = await db
        .select({ username: platformAccountsTable.username })
        .from(platformAccountsTable)
        .where(eq(platformAccountsTable.parent, username));
      if (children.length > 0) {
        res.status(400).json({
          error: `You still have ${children.length} client account${children.length === 1 ? "" : "s"} under you. Delete or reassign them first.`,
        });
        return;
      }

      // Hard-delete everything scoped to this account. Order does not matter
      // (no foreign keys tie these tables together), but we log the event
      // before removing the account row so the actor/target are still valid.
      void logAdminEvent({ username: actor.username }, "account_self_delete", username, "account", {
        role: account.role,
      });
      await db.delete(archiveItemsTable).where(eq(archiveItemsTable.owner, username));
      await db.delete(plannerItemsTable).where(eq(plannerItemsTable.owner, username));
      await db.delete(scoringConfigsTable).where(eq(scoringConfigsTable.owner, username));
      await db.delete(auditLocksTable).where(eq(auditLocksTable.owner, username));
      await db.delete(projectSnapshotsTable).where(eq(projectSnapshotsTable.owner, username));
      await db.delete(projectsTable).where(eq(projectsTable.owner, username));
      await db.delete(mediaOutletsTable).where(eq(mediaOutletsTable.accountId, username));
      await db.delete(mediaContactsTable).where(eq(mediaContactsTable.accountId, username));
      await db.delete(mediaCategoriesTable).where(eq(mediaCategoriesTable.accountId, username));
      await db.delete(tokenUsageTable).where(eq(tokenUsageTable.accountId, username));
      await db.delete(platformSessionsTable).where(eq(platformSessionsTable.username, username));
      await deleteProfile(username);
      await db.delete(platformMetaTable).where(eq(platformMetaTable.key, archiveKey(username)));
      await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, username));

      clearPlatformCookie(res);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to delete account. Please try again or contact info@aiofusion.ai." });
    }
  },
);

// Set (or clear) the seat cap for an agency account. Admin-only.
// PATCH /api/platform/accounts/:username/seat-cap
// Body: { maxSeats: number | null }   — null clears the limit
router.patch(
  "/platform/accounts/:username/seat-cap",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      if (actor.role !== "admin") {
        res.status(403).json({ error: "Only an admin can set seat caps." });
        return;
      }
      const target = normUsername(req.params.username);
      if (!target) {
        res.status(400).json({ error: "Username is required." });
        return;
      }
      const existing = await getAccount(target);
      if (!existing) {
        res.status(404).json({ error: "Account not found." });
        return;
      }
      const raw = req.body?.maxSeats;
      let maxSeats: number | null;
      if (raw === null || raw === undefined || raw === "") {
        maxSeats = null;
      } else {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 0) {
          res.status(400).json({ error: "maxSeats must be a non-negative integer or null." });
          return;
        }
        maxSeats = n;
      }
      await db
        .update(platformAccountsTable)
        .set({ maxSeats })
        .where(eq(platformAccountsTable.username, target));
      res.json({ ok: true, maxSeats });
    } catch {
      res.status(500).json({ error: "Failed to update seat cap" });
    }
  },
);

// --- Sessions API -----------------------------------------------------------

// Helper: mask all but the last 8 chars of a session id before sending to
// the browser (reduces exposure of the actual token).
function maskSid(sid: string): string {
  if (sid.length <= 8) return "*".repeat(sid.length);
  return "*".repeat(sid.length - 8) + sid.slice(-8);
}

function sessionToPublic(s: { sid: string; createdAt: Date; expiresAt: Date; ipHint: string | null }, currentSid: string) {
  return {
    sid: maskSid(s.sid),
    isCurrent: s.sid === currentSid,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    ipHint: s.ipHint ?? null,
  };
}

// Return the calling user's own active sessions.
// GET /api/platform/sessions
router.get(
  "/platform/sessions",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const account = req.account!;
      const currentSid = getPlatformSessionId(req) ?? "";
      const sessions = await listPlatformSessions(account.username);
      res.json({ sessions: sessions.map((s) => sessionToPublic(s, currentSid)) });
    } catch {
      res.status(500).json({ error: "Failed to load sessions" });
    }
  },
);

// Return active sessions for any account. Admin-only.
// GET /api/platform/accounts/:username/sessions
router.get(
  "/platform/accounts/:username/sessions",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      if (actor.role !== "admin") {
        res.status(403).json({ error: "Admin access required." });
        return;
      }
      const target = normUsername(req.params.username);
      if (!target) {
        res.status(400).json({ error: "Username is required." });
        return;
      }
      const existing = await getAccount(target);
      if (!existing) {
        res.status(404).json({ error: "Account not found." });
        return;
      }
      const currentSid = getPlatformSessionId(req) ?? "";
      const sessions = await listPlatformSessions(target);
      res.json({ sessions: sessions.map((s) => sessionToPublic(s, currentSid)) });
    } catch {
      res.status(500).json({ error: "Failed to load sessions" });
    }
  },
);

// Revoke a specific session by masked sid suffix. The caller may revoke their
// own non-current sessions; admins may revoke any session on any account.
// DELETE /api/platform/sessions/:sid
router.delete(
  "/platform/sessions/:sid",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      const currentSid = getPlatformSessionId(req) ?? "";
      // The client sends the masked sid (last 8 chars). We need to resolve it
      // to a real sid. We search among the caller's own sessions first; admins
      // may also specify a username query param to revoke from another account.
      const targetUsername = typeof req.query.username === "string"
        ? normUsername(req.query.username)
        : normUsername(actor.username);

      // Only admins may revoke other users' sessions.
      if (targetUsername !== normUsername(actor.username) && actor.role !== "admin") {
        res.status(403).json({ error: "You can only revoke your own sessions." });
        return;
      }

      const maskedParam = req.params.sid;
      const sessions = await listPlatformSessions(targetUsername);
      const match = sessions.find((s) => maskSid(s.sid) === maskedParam);
      if (!match) {
        res.status(404).json({ error: "Session not found." });
        return;
      }
      // Non-admins cannot revoke their current session here (they use logout).
      if (match.sid === currentSid && actor.role !== "admin") {
        res.status(400).json({ error: "Use logout to end your current session." });
        return;
      }
      await deletePlatformSession(match.sid);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to revoke session" });
    }
  },
);

// --- One-time migration -----------------------------------------------------

// Carry browser-stored accounts and project ownership onto the server. Runs
// exactly once (guarded by a meta flag): the admin (whose browser holds the
// accounts) triggers it from the client after signing in. Existing server
// accounts are never overwritten, the default admin is always ensured, and
// project owners are backfilled from each project's existing data so nothing is
// lost.
//
// This is admin-only. It must never be open: an unauthenticated migrate could
// otherwise seed arbitrary (including admin) accounts on a fresh deploy before
// the real admin has run it.
router.post(
  "/platform/migrate",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
  try {
    if (req.account!.role !== "admin") {
      res.status(403).json({ error: "Only an admin can run the migration." });
      return;
    }
    const [flag] = await db
      .select()
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, MIGRATED_FLAG))
      .limit(1);
    if (flag?.value === "true") {
      res.json({ ok: true, alreadyMigrated: true });
      return;
    }

    const incoming = Array.isArray(req.body?.users) ? req.body.users : [];
    let inserted = 0;
    for (const u of incoming) {
      const username = normUsername(u?.username);
      const password = typeof u?.password === "string" ? u.password : "";
      if (!username || !USERNAME_RE.test(username) || password.length < 1) continue;
      const role: Role = u?.role === "admin" ? "admin" : "user";
      const parent = normUsername(u?.parent);
      const result = await db
        .insert(platformAccountsTable)
        .values({
          username,
          passwordHash: hashPassword(password),
          role,
          parent: parent || null,
        })
        // Never overwrite an account that already exists on the server.
        .onConflictDoNothing({ target: platformAccountsTable.username });
      if (result.rowCount) inserted += result.rowCount;
    }

    // Always guarantee an admin login survives the migration.
    await ensureDefaultAdmin();

    // Backfill project ownership from each project's own data blob (the browser
    // stored the owner username inside `data.owner`). Only fills rows that have
    // no owner yet, so existing ownership is never disturbed.
    await db.execute(sql`
      UPDATE ${projectsTable}
      SET owner = lower(${projectsTable.data}->>'owner')
      WHERE owner IS NULL
        AND nullif(${projectsTable.data}->>'owner', '') IS NOT NULL
    `);

    await db
      .insert(platformMetaTable)
      .values({ key: MIGRATED_FLAG, value: "true" })
      .onConflictDoUpdate({
        target: platformMetaTable.key,
        set: { value: "true" },
      });

    void logAdminEvent(
      { username: req.account!.username },
      "platform_migrate",
      null,
      "platform",
      { inserted },
    );

    res.json({ ok: true, inserted });
  } catch {
    res.status(500).json({ error: "Migration failed" });
  }
});

// Change an account's role. Admin-only — only an admin may escalate or
// demote another account's role. Cannot be used to demote the last admin.
router.post(
  "/platform/accounts/role",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      if (actor.role !== "admin") {
        res.status(403).json({ error: "Only an admin can change account roles." });
        return;
      }
      const target = normUsername(req.body?.username);
      const newRole = normalizeRole(req.body?.role);
      if (!target) {
        res.status(400).json({ error: "Username is required." });
        return;
      }
      if (!["admin", "agency", "client"].includes(newRole)) {
        res.status(400).json({ error: "Role must be admin, agency, or client." });
        return;
      }
      const existing = await getAccount(target);
      if (!existing) {
        res.status(404).json({ error: "Account not found." });
        return;
      }
      if (existing.role === newRole) {
        res.json({ ok: true });
        return;
      }
      // Prevent removing the last admin.
      if (existing.role === "admin" && newRole !== "admin") {
        const admins = await db
          .select({ username: platformAccountsTable.username })
          .from(platformAccountsTable)
          .where(eq(platformAccountsTable.role, "admin"));
        if (admins.length <= 1) {
          res.status(400).json({ error: "Cannot demote the last admin." });
          return;
        }
      }
      const prevRole = existing.role;
      await db
        .update(platformAccountsTable)
        .set({ role: newRole })
        .where(eq(platformAccountsTable.username, target));
      void logAdminEvent(
        { username: actor.username },
        "account_role_change",
        target,
        "account",
        { previousRole: prevRole, newRole },
      );
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to change account role" });
    }
  },
);

// Move an account to a different parent (re-parent). Admin-only. The new
// parent must exist and be an agency or admin account; you cannot re-parent
// to a leaf client. Passing an empty string for newParent places the account
// directly under admin (parent = null).
router.post(
  "/platform/accounts/reparent",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      if (actor.role !== "admin") {
        res.status(403).json({ error: "Only an admin can move accounts." });
        return;
      }
      const target = normUsername(req.body?.username);
      const rawParent = typeof req.body?.newParent === "string" ? req.body.newParent.trim() : "";
      const newParent = rawParent ? normUsername(rawParent) : null;
      if (!target) {
        res.status(400).json({ error: "Username is required." });
        return;
      }
      const existing = await getAccount(target);
      if (!existing) {
        res.status(404).json({ error: "Account not found." });
        return;
      }
      if (existing.role === "admin") {
        res.status(400).json({ error: "Cannot re-parent the admin account." });
        return;
      }
      if (newParent) {
        const parentAccount = await getAccount(newParent);
        if (!parentAccount) {
          res.status(404).json({ error: "New parent account not found." });
          return;
        }
        if (parentAccount.role === "client") {
          res.status(400).json({ error: "Cannot nest under a client account. Choose an agency or admin." });
          return;
        }
      }
      const prevParent = existing.parent ?? null;
      await db
        .update(platformAccountsTable)
        .set({ parent: newParent ?? "admin" })
        .where(eq(platformAccountsTable.username, target));
      void logAdminEvent(
        { username: actor.username },
        "account_reparent",
        target,
        "account",
        { previousParent: prevParent, newParent: newParent ?? "admin" },
      );
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to move account" });
    }
  },
);

// --- Admin events (audit log) -----------------------------------------------

function buildAuditConditions(query: Request["query"]) {
  const { action, actor, from, to } = query;
  const conditions = [];
  if (typeof action === "string" && action.trim()) {
    conditions.push(ilike(adminEventsTable.action, `%${action.trim()}%`));
  }
  if (typeof actor === "string" && actor.trim()) {
    conditions.push(ilike(adminEventsTable.actorUsername, `%${actor.trim()}%`));
  }
  if (typeof from === "string" && from.trim()) {
    const d = new Date(from.trim());
    if (!isNaN(d.getTime())) conditions.push(gte(adminEventsTable.createdAt, d));
  }
  if (typeof to === "string" && to.trim()) {
    const d = new Date(to.trim());
    if (!isNaN(d.getTime())) {
      // If a date-only string was supplied (no time component), treat it as
      // end-of-day so the full selected day is included in results.
      if (/^\d{4}-\d{2}-\d{2}$/.test(to.trim())) {
        d.setUTCHours(23, 59, 59, 999);
      }
      conditions.push(lte(adminEventsTable.createdAt, d));
    }
  }
  return conditions.length > 0 ? and(...conditions) : undefined;
}

const AUDIT_COLS = {
  id: adminEventsTable.id,
  actorUsername: adminEventsTable.actorUsername,
  action: adminEventsTable.action,
  targetId: adminEventsTable.targetId,
  targetType: adminEventsTable.targetType,
  metadata: adminEventsTable.metadata,
  createdAt: adminEventsTable.createdAt,
} as const;

// Return up to 500 admin events (filtered). Admin-only.
// Query params: action, actor, from (ISO), to (ISO)
router.get(
  "/platform/admin-events",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      if (req.account!.role !== "admin") {
        res.status(403).json({ error: "Admin access required." });
        return;
      }
      const where = buildAuditConditions(req.query);
      const rows = await db
        .select(AUDIT_COLS)
        .from(adminEventsTable)
        .where(where)
        .orderBy(desc(adminEventsTable.createdAt))
        .limit(500);
      res.json({ events: rows });
    } catch {
      res.status(500).json({ error: "Failed to load audit log" });
    }
  },
);

function csvEscape(v: unknown): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

// Stream all matching events as CSV. Admin-only.
// Query params: action, actor, from (ISO), to (ISO)
router.get(
  "/platform/admin-events/export",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      if (req.account!.role !== "admin") {
        res.status(403).json({ error: "Admin access required." });
        return;
      }
      const where = buildAuditConditions(req.query);
      const rows = await db
        .select(AUDIT_COLS)
        .from(adminEventsTable)
        .where(where)
        .orderBy(desc(adminEventsTable.createdAt));

      const dateSlug = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="audit-log-${dateSlug}.csv"`,
      );

      res.write("id,time,actor,action,target_type,target_id,detail\n");
      for (const row of rows) {
        const detail =
          row.metadata
            ? Object.entries(row.metadata as Record<string, unknown>)
                .map(([k, v]) => `${k}: ${String(v)}`)
                .join(" | ")
            : "";
        res.write(
          [
            csvEscape(row.id),
            csvEscape(row.createdAt),
            csvEscape(row.actorUsername),
            csvEscape(row.action),
            csvEscape(row.targetType ?? ""),
            csvEscape(row.targetId ?? ""),
            csvEscape(detail),
          ].join(",") + "\n",
        );
      }
      res.end();
    } catch {
      res.status(500).json({ error: "Failed to export audit log" });
    }
  },
);

export default router;
