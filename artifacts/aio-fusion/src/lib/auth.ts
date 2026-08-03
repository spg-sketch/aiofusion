export type Role = "admin" | "agency" | "client" | "user";

// Normalise any stored/incoming role to a known value. Legacy "user" accounts
// (created before the agency/client split) behave like an agency.
export function normalizeRole(role: unknown): Role {
  if (role === "admin") return "admin";
  if (role === "agency") return "agency";
  if (role === "client") return "client";
  return "user";
}

// The master and agency resellers may create sub-accounts; a direct client may
// not.
export function canCreateSubAccounts(role: Role | undefined): boolean {
  return role !== "client";
}

export type User = {
  username: string;
  password: string;
  role: Role;
  // Optional friendly label shown in the UI (e.g. "AIO Fusion"). The username
  // stays the canonical login handle.
  displayName?: string;
  createdAt: number;
  // Username of the account that created this one. Set only for sub-accounts
  // (e.g. a client login created by an agency user). Undefined for top-level
  // accounts and admins.
  parent?: string;
  // Soft-deactivated accounts are hidden from the active list and cannot log in.
  archived?: boolean;
  // Optional cap on the number of client seats an agency account may create.
  seatCap?: number | null;
};

export type Session = {
  username: string;
  role: Role;
};

// Present when an admin is currently "viewing as" this account for support.
export type Impersonation = { by: string; byRole?: string };

const USERS_KEY = "aio.auth.users.v3";
const SESSION_KEY = "aio.auth.session.v3";

const DEFAULT_ADMIN: User = {
  username: "admin",
  password: "K9mt-4Rxq-7NzPv2",
  role: "admin",
  createdAt: Date.now(),
};

function isValidUser(x: unknown): x is User {
  if (!x || typeof x !== "object") return false;
  const u = x as Record<string, unknown>;
  return (
    typeof u.username === "string" &&
    u.username.length > 0 &&
    typeof u.password === "string" &&
    (u.role === "admin" || u.role === "agency" || u.role === "client" || u.role === "user") &&
    typeof u.createdAt === "number" &&
    (u.parent === undefined || typeof u.parent === "string")
  );
}

export function getUsers(): User[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidUser);
  } catch {
    return [];
  }
}

export function saveUsers(users: User[]): void {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch {
    /* noop */
  }
}

export function seedAdminIfEmpty(): void {
  const users = getUsers();
  if (users.length === 0 || !users.some((u) => u.role === "admin")) {
    const next = users.length === 0 ? [DEFAULT_ADMIN] : [...users, DEFAULT_ADMIN];
    saveUsers(next);
  }
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.username === "string" &&
      (parsed.role === "admin" ||
        parsed.role === "agency" ||
        parsed.role === "client" ||
        parsed.role === "user")
    ) {
      return parsed as Session;
    }
    return null;
  } catch {
    return null;
  }
}

export function setSession(s: Session): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* noop */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* noop */
  }
}

export function login(username: string, password: string): { ok: true; session: Session } | { ok: false; error: string } {
  const u = username.trim().toLowerCase();
  const p = password;
  if (!u || !p) return { ok: false, error: "Enter a username and password." };
  const user = getUsers().find((x) => x.username.toLowerCase() === u);
  if (!user || user.password !== p) {
    return { ok: false, error: "Incorrect username or password." };
  }
  const session: Session = { username: user.username, role: user.role };
  setSession(session);
  return { ok: true, session };
}

export function addUser(username: string, password: string, role: Role, parent?: string): { ok: true } | { ok: false; error: string } {
  const u = username.trim();
  if (!u) return { ok: false, error: "Username is required." };
  if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(u)) return { ok: false, error: "Username must be 2–32 characters: letters, numbers, _.-" };
  if (!password || password.length < 4) return { ok: false, error: "Password must be at least 4 characters." };
  const users = getUsers();
  if (users.some((x) => x.username.toLowerCase() === u.toLowerCase())) {
    return { ok: false, error: "That username already exists." };
  }
  const parentName = typeof parent === "string" ? parent.trim() : "";
  users.push({ username: u, password, role, createdAt: Date.now(), ...(parentName ? { parent: parentName } : {}) });
  saveUsers(users);
  return { ok: true };
}

// Direct sub-accounts of the given account (case-insensitive match on parent).
export function getSubAccounts(parentUsername: string): User[] {
  const p = parentUsername.trim().toLowerCase();
  if (!p) return [];
  return getUsers().filter((u) => (u.parent || "").toLowerCase() === p);
}

// All usernames (lowercased) whose projects the given session is allowed to
// see. Returns null for an admin, meaning "every project, no filtering". For a
// normal account it is the account itself plus every descendant sub-account
// (recursively), so an agency sees its own projects and all of its clients'.
export function getVisibleUsernames(session: Session | null): string[] | null {
  if (!session) return [];
  if (session.role === "admin") return null;
  const users = getUsers();
  const childrenByParent = new Map<string, string[]>();
  for (const u of users) {
    const parent = (u.parent || "").toLowerCase();
    if (!parent) continue;
    const list = childrenByParent.get(parent) || [];
    list.push(u.username.toLowerCase());
    childrenByParent.set(parent, list);
  }
  const start = session.username.toLowerCase();
  const visible = new Set<string>([start]);
  const queue = [start];
  while (queue.length) {
    const current = queue.shift()!;
    for (const child of childrenByParent.get(current) || []) {
      if (!visible.has(child)) {
        visible.add(child);
        queue.push(child);
      }
    }
  }
  return [...visible];
}

// Whether the given session may see a project owned by `owner`. Admins see all;
// an unowned project is treated as admin-only (the ownership migration assigns
// legacy projects to an admin, so a normal account never owns a blank one).
export function canViewOwner(session: Session | null, owner: string | undefined): boolean {
  const allowed = getVisibleUsernames(session);
  if (allowed === null) return true;
  return allowed.includes((owner || "").toLowerCase());
}

export function deleteUser(username: string): { ok: true } | { ok: false; error: string } {
  const users = getUsers();
  const target = users.find((x) => x.username.toLowerCase() === username.toLowerCase());
  if (!target) return { ok: false, error: "User not found." };
  if (target.role === "admin" && users.filter((x) => x.role === "admin").length <= 1) {
    return { ok: false, error: "Cannot delete the last admin." };
  }
  saveUsers(users.filter((x) => x.username.toLowerCase() !== username.toLowerCase()));
  return { ok: true };
}

export function changePassword(username: string, newPassword: string): { ok: true } | { ok: false; error: string } {
  if (!newPassword || newPassword.length < 4) return { ok: false, error: "Password must be at least 4 characters." };
  const users = getUsers();
  const idx = users.findIndex((x) => x.username.toLowerCase() === username.toLowerCase());
  if (idx === -1) return { ok: false, error: "User not found." };
  users[idx] = { ...users[idx], password: newPassword };
  saveUsers(users);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Server-backed auth.
//
// The functions above keep working against localStorage, but that is now only a
// cache for synchronous UI reads (the project hub filter, the accounts list).
// The real security boundary is the server: logins are verified there, sessions
// are httpOnly cookies, and the project store only returns what a session may
// see. The functions below talk to that server and keep the local cache in step.
// ---------------------------------------------------------------------------

const apiBase = () => (import.meta.env.DEV ? `https://${window.location.host}` : "");

type ServerAccount = { username: string; role: Role; parent?: string; displayName?: string; archived?: boolean };

async function postJson(path: string, body?: unknown): Promise<{ ok: boolean; status: number; json: any }> {
  try {
    const resp = await fetch(`${apiBase()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json: any = null;
    try {
      json = await resp.json();
    } catch {
      /* no body */
    }
    return { ok: resp.ok, status: resp.status, json };
  } catch {
    return { ok: false, status: 0, json: null };
  }
}

// Replace the cached user list with the accounts the server says we may see.
// Passwords are never returned by the server, so the cache holds none.
function cacheAccounts(accounts: ServerAccount[]): void {
  const users: User[] = accounts.map((a) => ({
    username: a.username,
    password: "",
    role: normalizeRole(a.role),
    createdAt: Date.now(),
    ...(a.displayName ? { displayName: a.displayName } : {}),
    ...(a.parent ? { parent: a.parent } : {}),
    ...(a.archived ? { archived: true } : {}),
  }));
  saveUsers(users);
}

export async function refreshAccountsCache(): Promise<void> {
  try {
    const resp = await fetch(`${apiBase()}/api/platform/accounts`, { credentials: "include" });
    if (!resp.ok) return;
    const json = (await resp.json()) as { accounts?: ServerAccount[] };
    if (Array.isArray(json.accounts)) cacheAccounts(json.accounts);
  } catch {
    /* keep existing cache */
  }
}

// One-time migration of browser-stored accounts and project ownership. Only an
// admin may run it (the server enforces this too), and only the admin's browser
// holds the accounts worth carrying over. Must run BEFORE refreshAccountsCache,
// while the local cache still holds the original accounts and their passwords.
async function runMigrationIfNeeded(role: Role): Promise<void> {
  if (role !== "admin") return;
  try {
    const statusResp = await fetch(`${apiBase()}/api/platform/status`, { credentials: "include" });
    if (!statusResp.ok) return;
    const status = (await statusResp.json()) as { migrated?: boolean };
    if (status.migrated) return;
    const localUsers = getUsers().filter((u) => u.password);
    await postJson("/api/platform/migrate", { users: localUsers });
  } catch {
    /* best-effort; the server stays the source of truth */
  }
}

// Verify credentials on the server. On success the server sets the session
// cookie; we mirror the session, run the one-time migration if this is the
// admin's first sign-in, then refresh the cached account list.
export async function serverLogin(
  username: string,
  password: string,
): Promise<{ ok: true; session: Session; needsSetup?: boolean } | { ok: false; error: string }> {
  const u = username.trim();
  if (!u || !password) return { ok: false, error: "Enter a username and password." };
  const { ok, json } = await postJson("/api/platform/login", { username: u, password });
  if (!ok || !json?.account) {
    return { ok: false, error: json?.error || "Incorrect username or password." };
  }
  const session: Session = { username: json.account.username, role: json.account.role };
  setSession(session);
  await runMigrationIfNeeded(session.role);
  await refreshAccountsCache();
  return { ok: true, session, needsSetup: json.needsSetup === true };
}

export async function serverLogout(): Promise<void> {
  await postJson("/api/platform/logout");
  clearSession();
}

// Reconcile the local session with the server on app load. Validates the
// session cookie, runs the one-time account migration if an admin is signed in
// and it has not happened yet, then refreshes the cached account list. Returns
// the authoritative session and whether account setup is still pending.
export async function bootstrapAuth(): Promise<{ session: Session | null; needsSetup?: boolean }> {
  let session: Session | null = null;
  let needsSetup = false;
  try {
    const meResp = await fetch(`${apiBase()}/api/platform/me`, { credentials: "include" });
    if (meResp.ok) {
      const me = (await meResp.json()) as {
        account?: ServerAccount | null;
        impersonating?: Impersonation | null;
        setupComplete?: boolean | null;
      };
      if (me.account) {
        session = { username: me.account.username, role: me.account.role };
        setSession(session);
        // setupComplete === false (not null, not true) means the user signed up
        // but hasn't chosen Agency/Partner vs Client yet.
        if (me.setupComplete === false) needsSetup = true;
      } else {
        clearSession();
      }
    }
  } catch {
    /* offline: fall back to whatever the cache holds */
    session = getSession();
  }

  if (session) {
    await runMigrationIfNeeded(session.role);
    await refreshAccountsCache();
  }
  return { session, needsSetup };
}

// Fetch the current impersonation state (null when not viewing as another
// account). Safe to call even when signed out.
export async function getImpersonationState(): Promise<Impersonation | null> {
  try {
    const resp = await fetch(`${apiBase()}/api/platform/me`, { credentials: "include" });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { impersonating?: Impersonation | null };
    return json.impersonating ?? null;
  } catch {
    return null;
  }
}

// Admin-only: start viewing another account's session for support. Returns
// the new (target) session on success.
export async function serverImpersonate(
  username: string,
): Promise<{ ok: true; session: Session } | { ok: false; error: string }> {
  const { ok, json } = await postJson(`/api/platform/accounts/${encodeURIComponent(username)}/impersonate`);
  if (!ok || !json?.account) return { ok: false, error: json?.error || "Failed to view this account." };
  const session: Session = { username: json.account.username, role: json.account.role };
  setSession(session);
  await refreshAccountsCache();
  return { ok: true, session };
}

// Switch from an agency account (with masterOwner=true) into the admin session.
// Uses the same stash-and-replace cookie pattern as impersonation, so the
// existing ImpersonationBanner "Exit" flow restores the agency session.
export async function serverSwitchToMaster(): Promise<
  { ok: true; session: Session } | { ok: false; error: string }
> {
  const { ok, json } = await postJson("/api/platform/switch-to-master");
  if (!ok || !json?.account) return { ok: false, error: json?.error || "Failed to switch to master." };
  const session: Session = { username: json.account.username, role: json.account.role };
  setSession(session);
  await refreshAccountsCache();
  return { ok: true, session };
}

// Admin-only: set or clear the masterOwner flag on an agency account.
export async function serverSetMasterOwner(
  username: string,
  masterOwner: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const resp = await fetch(
      `${apiBase()}/api/platform/admin/accounts/${encodeURIComponent(username)}/master-owner`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ masterOwner }),
      },
    );
    let json: any = null;
    try { json = await resp.json(); } catch { /* no body */ }
    if (!resp.ok) return { ok: false, error: json?.error || "Failed to update master-owner status." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to update master-owner status." };
  }
}

// Admin-only: fetch the full set of usernames that currently have masterOwner=true.
export async function serverGetMasterOwners(): Promise<
  { ok: true; usernames: string[] } | { ok: false; error: string }
> {
  try {
    const resp = await fetch(`${apiBase()}/api/platform/admin/master-owners`, { credentials: "include" });
    if (!resp.ok) {
      let json: any = null;
      try { json = await resp.json(); } catch { /* no body */ }
      return { ok: false, error: json?.error || "Failed to load master-owner list." };
    }
    const json = (await resp.json()) as { usernames: string[] };
    return { ok: true, usernames: json.usernames ?? [] };
  } catch {
    return { ok: false, error: "Failed to load master-owner list." };
  }
}

// Restore the admin's own session after a view-as session.
export async function serverExitImpersonation(): Promise<
  { ok: true; session: Session } | { ok: false; error: string }
> {
  const { ok, json } = await postJson("/api/platform/exit-impersonation");
  if (!ok || !json?.account) return { ok: false, error: json?.error || "Failed to exit view-as session." };
  const session: Session = { username: json.account.username, role: json.account.role };
  setSession(session);
  await refreshAccountsCache();
  return { ok: true, session };
}

export async function serverAddUser(
  username: string,
  password: string,
  role: Role,
  displayName?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { ok, json } = await postJson("/api/platform/accounts", {
    username,
    password,
    role,
    ...(displayName ? { displayName } : {}),
  });
  if (!ok) return { ok: false, error: json?.error || "Failed to create account." };
  await refreshAccountsCache();
  return { ok: true };
}

// Set (or clear, when blank) an account's friendly display name.
export async function serverSetDisplayName(
  username: string,
  displayName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { ok, json } = await postJson("/api/platform/accounts/profile", {
    username,
    displayName,
  });
  if (!ok) return { ok: false, error: json?.error || "Failed to update account." };
  await refreshAccountsCache();
  return { ok: true };
}

// Reassign a project to another account. This persists on the server (the only
// path that changes ownership) and respects the caller's visibility rules.
export async function serverAssignOwner(
  id: string,
  owner: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { ok, json } = await postJson("/api/store/projects/owner", { id, owner });
  if (!ok) return { ok: false, error: json?.error || "Failed to reassign project." };
  return { ok: true };
}

export async function serverDeleteUser(
  username: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { ok, json } = await postJson("/api/platform/accounts/delete", { username });
  if (!ok) return { ok: false, error: json?.error || "Failed to delete account." };
  await refreshAccountsCache();
  return { ok: true };
}

export async function serverArchiveUser(
  username: string,
  archive: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { ok, json } = await postJson("/api/platform/accounts/archive", { username, archive });
  if (!ok) return { ok: false, error: json?.error || "Failed to update account." };
  await refreshAccountsCache();
  return { ok: true };
}

export async function serverChangePassword(
  username: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { ok, json } = await postJson("/api/platform/accounts/password", { username, newPassword });
  if (!ok) return { ok: false, error: json?.error || "Failed to change password." };
  return { ok: true };
}

export async function serverChangeRole(
  username: string,
  role: Role,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { ok, json } = await postJson("/api/platform/accounts/role", { username, role });
  if (!ok) return { ok: false, error: json?.error || "Failed to change role." };
  await refreshAccountsCache();
  return { ok: true };
}

// Set (or clear, when null) the seat cap on an agency account. Admin-only.
export async function serverSetSeatCap(
  username: string,
  maxSeats: number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const resp = await fetch(`${apiBase()}/api/platform/accounts/${encodeURIComponent(username)}/seat-cap`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ maxSeats }),
    });
    let json: any = null;
    try { json = await resp.json(); } catch { /* no body */ }
    if (!resp.ok) return { ok: false, error: json?.error || "Failed to update seat cap." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to update seat cap." };
  }
}

// Self-serve "delete my account and data" (GDPR right to erasure). Requires
// the caller's own password as a confirmation step. On success the server has
// hard-deleted the account and everything it owns, and cleared the session
// cookie, so we clear the local cache too.
export async function serverSelfDeleteAccount(
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { ok, json } = await postJson("/api/platform/account/self-delete", { password });
  if (!ok) return { ok: false, error: json?.error || "Failed to delete account." };
  clearSession();
  saveUsers([]);
  return { ok: true };
}

// Self-serve sign-up.
// Returns one of three shapes:
//  - needsVerification=true  → no session yet; user must click the email link
//  - session present         → logged in immediately (SSO path or future skip)
//  - error                   → something went wrong
export async function serverSignUp(data: {
  name: string;
  email: string;
  companyName: string;
  website?: string;
  password: string;
}): Promise<
  | { ok: true; session: Session; needsVerification?: false }
  | { ok: true; needsVerification: true; email: string }
  | { ok: false; error: string }
> {
  const { ok, json } = await postJson("/api/platform/signup", data);
  if (!ok) return { ok: false, error: json?.error || "Sign-up failed. Please try again." };
  if (json?.needsVerification) {
    return { ok: true, needsVerification: true, email: json.email ?? data.email };
  }
  // Fallback: auto-login path (kept for forward compat)
  const session: Session = { username: json.username, role: json.role ?? "agency" };
  setSession(session);
  await refreshAccountsCache();
  return { ok: true, session };
}

// Resend the email verification link to the given address.
export async function serverResendVerification(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { ok, json } = await postJson("/api/platform/resend-verification", { email });
  if (!ok) return { ok: false, error: json?.error || "Failed to resend. Please try again." };
  return { ok: true };
}

// After email verification + Google/Microsoft SSO signup, the user must choose
// their account type (Agency/Partner vs Client). This calls the setup endpoint.
export async function serverSetAccountType(
  accountType: "agency" | "client",
): Promise<{ ok: true; role: string } | { ok: false; error: string }> {
  const { ok, json } = await postJson("/api/platform/setup/account-type", { accountType });
  if (!ok) return { ok: false, error: json?.error || "Failed to set account type." };
  return { ok: true, role: json?.role ?? accountType };
}

export type PendingAccount = {
  username: string;
  email: string | null;
  website: string | null;
  displayName: string | null;
  createdAt: string;
};

// Admin: list all pending-approval accounts.
export async function serverGetPendingAccounts(): Promise<
  { ok: true; accounts: PendingAccount[] } | { ok: false; error: string }
> {
  try {
    const resp = await fetch(`${apiBase()}/api/platform/admin/pending`, { credentials: "include" });
    if (!resp.ok) {
      let json: any = null;
      try { json = await resp.json(); } catch { /* no body */ }
      return { ok: false, error: json?.error || "Failed to load pending accounts." };
    }
    const json = (await resp.json()) as { accounts: PendingAccount[] };
    return { ok: true, accounts: json.accounts ?? [] };
  } catch {
    return { ok: false, error: "Failed to load pending accounts." };
  }
}

// Admin: approve a pending account.
export async function serverApproveAccount(
  username: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { ok, json } = await postJson(`/api/platform/admin/accounts/${encodeURIComponent(username)}/approve`);
  if (!ok) return { ok: false, error: json?.error || "Failed to approve account." };
  return { ok: true };
}

// Admin: reject (delete) a pending account.
export async function serverRejectAccount(
  username: string,
  reason?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { ok, json } = await postJson(`/api/platform/admin/accounts/${encodeURIComponent(username)}/reject`, { reason });
  if (!ok) return { ok: false, error: json?.error || "Failed to reject account." };
  return { ok: true };
}

export type SessionInfo = {
  sid: string;
  isCurrent: boolean;
  createdAt: string;
  expiresAt: string;
  ipHint: string | null;
  userId?: string | null;
  userEmail?: string | null;
  userName?: string | null;
};

// Fetch the calling user's own active sessions.
export async function serverGetSessions(): Promise<{ ok: true; sessions: SessionInfo[] } | { ok: false; error: string }> {
  try {
    const resp = await fetch(`${apiBase()}/api/platform/sessions`, { credentials: "include" });
    if (!resp.ok) {
      let json: any = null;
      try { json = await resp.json(); } catch { /* no body */ }
      return { ok: false, error: json?.error || "Failed to load sessions." };
    }
    const json = (await resp.json()) as { sessions: SessionInfo[] };
    return { ok: true, sessions: json.sessions ?? [] };
  } catch {
    return { ok: false, error: "Failed to load sessions." };
  }
}

// Fetch active sessions for any account. Admin-only.
export async function serverGetAccountSessions(
  username: string,
): Promise<{ ok: true; sessions: SessionInfo[] } | { ok: false; error: string }> {
  try {
    const resp = await fetch(`${apiBase()}/api/platform/accounts/${encodeURIComponent(username)}/sessions`, {
      credentials: "include",
    });
    if (!resp.ok) {
      let json: any = null;
      try { json = await resp.json(); } catch { /* no body */ }
      return { ok: false, error: json?.error || "Failed to load sessions." };
    }
    const json = (await resp.json()) as { sessions: SessionInfo[] };
    return { ok: true, sessions: json.sessions ?? [] };
  } catch {
    return { ok: false, error: "Failed to load sessions." };
  }
}

// Revoke a session by its masked sid. Optionally specify a username (admin-only)
// to revoke from another account.
export async function serverRevokeSession(
  maskedSid: string,
  username?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const url = `${apiBase()}/api/platform/sessions/${encodeURIComponent(maskedSid)}${username ? `?username=${encodeURIComponent(username)}` : ""}`;
    const resp = await fetch(url, { method: "DELETE", credentials: "include" });
    let json: any = null;
    try { json = await resp.json(); } catch { /* no body */ }
    if (!resp.ok) return { ok: false, error: json?.error || "Failed to revoke session." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to revoke session." };
  }
}
