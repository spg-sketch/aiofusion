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
  // Whether the account has two-factor login (TOTP) fully enabled.
  mfaEnabled?: boolean;
  // Optional cap on the number of client seats an agency account may create.
  seatCap?: number | null;
};

export type Session = {
  username: string;
  role: Role;
  // Fine-grained team membership role within the workspace (owner/admin/
  // billing/content/viewer). Undefined = full access (legacy/owner session).
  membershipRole?: MembershipRole | null;
  // Project ids this member may see; null/undefined = all projects.
  projectAccess?: string[] | null;
};

export type MembershipRole = "owner" | "admin" | "billing" | "content" | "viewer";
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

type ServerAccount = { username: string; role: Role; parent?: string; displayName?: string; archived?: boolean; mfaEnabled?: boolean };

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
    ...(a.mfaEnabled ? { mfaEnabled: true } : {}),
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

export type MfaChallenge = { mfaToken: string; enroll: boolean };
export async function serverLogin(
  username: string,
  password: string,
): Promise<LoginResult> {
  const u = username.trim();
  if (!u || !password) return { ok: false, error: "Enter a username and password." };
  const { ok, json } = await postJson("/api/platform/login", { username: u, password });
  if (ok && typeof json?.mfaToken === "string" && (json.mfaRequired || json.mfaEnrollRequired)) {
    return { ok: false, mfa: { mfaToken: json.mfaToken, enroll: json.mfaEnrollRequired === true } };
  }
  if (!ok || !json?.account) {
    return { ok: false, error: json?.error || "Incorrect username or password." };
  }
  return finishLogin(json);
}

async function finishLogin(json: any): Promise<{ ok: true; session: Session; needsSetup?: boolean }> {
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

export type AccountProfile = {
  displayName: string | null;
  website: string | null;
};
export async function bootstrapAuth(): Promise<{
  session: Session | null;
  needsSetup?: boolean;
  hasPassword?: boolean;
  accountProfile?: AccountProfile | null;
  workspaces?: WorkspaceInfo[];
}> {
  let session: Session | null = null;
  let needsSetup = false;
  let hasPassword: boolean | undefined;
  let accountProfile: AccountProfile | null = null;
  let workspaces: WorkspaceInfo[] = [];
  try {
    const meResp = await fetch(`${apiBase()}/api/platform/me`, { credentials: "include" });
    if (meResp.ok) {
      const me = (await meResp.json()) as {
        account?: ServerAccount | null;
        impersonating?: Impersonation | null;
        setupComplete?: boolean | null;
        hasPassword?: boolean;
        accountProfile?: { displayName?: string | null; website?: string | null } | null;
        workspaces?: WorkspaceInfo[];
      };
      if (me.account) {
        const acct = me.account as ServerAccount & {
          membershipRole?: MembershipRole | null;
          projectAccess?: string[] | null;
        };
        session = {
          username: acct.username,
          role: acct.role,
          membershipRole: acct.membershipRole ?? null,
          projectAccess: acct.projectAccess ?? null,
        };
        setSession(session);
        // setupComplete === false (not null, not true) means the user signed up
        // but hasn't chosen Agency/Partner vs Client yet.
        if (me.setupComplete === false) needsSetup = true;
        hasPassword = me.hasPassword;
        // Only expose profile data when this is a direct account-owner session:
        // impersonation or team-member sessions must not prefill foreign data.
        const isImpersonating = !!me.impersonating;
        const isMember = !!acct.membershipRole;
        if (!isImpersonating && !isMember && me.accountProfile) {
          accountProfile = {
            displayName: me.accountProfile.displayName ?? null,
            website: me.accountProfile.website ?? null,
          };
        }
        if (Array.isArray(me.workspaces)) workspaces = me.workspaces;
      } else {
        clearSession();
      }
    }
  } catch {
    /* offline: fall back to whatever the cache holds */
    session = getSession();
    // accountProfile stays null - we can't safely prefill from cache alone
  }

  if (session) {
    await runMigrationIfNeeded(session.role);
    await refreshAccountsCache();
  }
  return { session, needsSetup, hasPassword, accountProfile, workspaces };
}

export async function serverGetWorkspaces(): Promise<WorkspaceInfo[]> {
  try {
    const resp = await fetch(`${apiBase()}/api/platform/me`, { credentials: "include" });
    if (!resp.ok) return [];
    const json = (await resp.json()) as { workspaces?: WorkspaceInfo[] };
    return Array.isArray(json.workspaces) ? json.workspaces : [];
  } catch {
    return [];
  }
}

export async function fetchAccountProfile(): Promise<AccountProfile | null> {
  try {
    const resp = await fetch(`${apiBase()}/api/platform/me`, { credentials: "include" });
    if (!resp.ok) return null;
    const me = (await resp.json()) as {
      account?: { membershipRole?: string | null } | null;
      impersonating?: unknown | null;
      accountProfile?: { displayName?: string | null; website?: string | null } | null;
    };
    if (!me.account || !me.accountProfile) return null;
    if (!!me.account.membershipRole || !!me.impersonating) return null;
    return {
      displayName: me.accountProfile.displayName ?? null,
      website: me.accountProfile.website ?? null,
    };
  } catch {
    return null;
  }
}
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

// Clear a locked-out user's two-factor login state so they can sign in with
// their password and re-enrol. Admin/manager-only (enforced server-side).
export async function serverResetMfa(
  username: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { ok, json } = await postJson("/api/platform/accounts/reset-mfa", { username });
  if (!ok) return { ok: false, error: json?.error || "Failed to reset two-factor login." };
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

export type TeamMember = {
  userId: string;
  email: string | null;
  name: string | null;
  role: MembershipRole;
  projectAccess: string[] | null;
  createdAt: string;
  isSelf: boolean;
};
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

// Request a password reset email. The server always responds { ok: true }
// whether or not the address is registered (no account enumeration).
export async function serverForgotPassword(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { ok, json } = await postJson("/api/platform/forgot-password", { email });
  if (!ok) return { ok: false, error: json?.error || "Something went wrong. Please try again." };
  return { ok: true };
}

// Complete a password reset using the single-use token from the email link.
export async function serverResetPassword(
  token: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { ok, json } = await postJson("/api/platform/reset-password", { token, password });
  if (!ok) return { ok: false, error: json?.error || "Password reset failed. Please try again." };
  return { ok: true };
}

export async function serverChangeMyPassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { ok, json } = await postJson("/api/platform/change-password", { currentPassword, newPassword });
  if (!ok) return { ok: false, error: json?.error || "Failed to change password. Please try again." };
  return { ok: true };
}

// Request a "set first password" email link for SSO-only accounts (no current
// password needed - identity is confirmed by the active session). The server
// issues a single-use reset token and emails it to the account address.
export async function serverRequestSetPassword(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { ok, json } = await postJson("/api/platform/request-set-password");
  if (!ok) return { ok: false, error: json?.error || "Failed to send the link. Please try again." };
  return { ok: true };
}
export async function serverSetAccountType(
  accountType: "agency" | "client",
): Promise<{ ok: true; role: string } | { ok: false; error: string }> {
  const { ok, json } = await postJson("/api/platform/setup/account-type", { accountType });
  if (!ok) return { ok: false, error: json?.error || "Failed to set account type." };
  return { ok: true, role: json?.role ?? accountType };
}

export async function serverChangeAccountType(
  accountType: "agency" | "client",
): Promise<{ ok: true; role: Role } | { ok: false; error: string }> {
  const { ok, json } = await postJson("/api/platform/settings/account-type", { accountType });
  if (!ok) return { ok: false, error: json?.error || "Failed to update account type." };
  const role = (json?.role === "agency" || json?.role === "client") ? json.role as Role : accountType;
  // Update local session cache immediately so the UI reflects the change.
  const current = getSession();
  if (current) setSession({ ...current, role });
  await refreshAccountsCache();
  return { ok: true, role };
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

export async function serverMfaEnable(
  code: string,
  mfaToken?: string,
): Promise<
  | { ok: true; recoveryCodes: string[]; session?: Session; needsSetup?: boolean }
  | { ok: false; error: string }
> {
  const { ok, json } = await postJson("/api/platform/mfa/enable", { code, ...(mfaToken ? { mfaToken } : {}) });
  if (!ok) return { ok: false, error: json?.error || "Could not enable two-factor authentication." };
  const recoveryCodes: string[] = Array.isArray(json?.recoveryCodes) ? json.recoveryCodes : [];
  if (json?.account) {
    const done = await finishLogin(json);
    return { ok: true, recoveryCodes, session: done.session, needsSetup: done.needsSetup };
  }
  return { ok: true, recoveryCodes };
}

export async function serverMfaStatus(): Promise<
  { ok: true; enabled: boolean; required: boolean; recoveryCodesRemaining: number } | { ok: false; error: string }
> {
  try {
    const resp = await fetch(`${apiBase()}/api/platform/mfa/status`, { credentials: "include" });
    const json = await resp.json().catch(() => null);
    if (!resp.ok) return { ok: false, error: json?.error || "Could not load two-factor status." };
    return {
      ok: true,
      enabled: json?.enabled === true,
      required: json?.required === true,
      recoveryCodesRemaining: typeof json?.recoveryCodesRemaining === "number" ? json.recoveryCodesRemaining : 0,
    };
  } catch {
    return { ok: false, error: "Could not load two-factor status." };
  }
}

export type LoginResult =
  | { ok: true; session: Session; needsSetup?: boolean }
  | { ok: false; mfa: MfaChallenge }
  | { ok: false; error: string };

export async function serverMfaVerify(
  mfaToken: string,
  code: string,
  trustDevice?: boolean,
): Promise<
  | { ok: true; session: Session; needsSetup?: boolean; recoveryCodesRemaining?: number }
  | { ok: false; error: string }
> {
  const { ok, json } = await postJson("/api/platform/mfa/verify", { mfaToken, code, ...(trustDevice ? { trustDevice: true } : {}) });
  if (!ok || !json?.account) return { ok: false, error: json?.error || "That code is not valid." };
  const done = await finishLogin(json);
  // Present only when a recovery code (not a TOTP code) was used for this login.
  const recoveryCodesRemaining =
    typeof json?.recoveryCodesRemaining === "number" ? json.recoveryCodesRemaining : undefined;
  return recoveryCodesRemaining === undefined ? done : { ...done, recoveryCodesRemaining };
}

export type TrustedDevice = {
  id: string;
  label: string;
  createdAt: string;
  expiresAt: string;
  current: boolean;
};
export async function serverMfaSetup(
  mfaToken?: string,
): Promise<{ ok: true; secret: string; otpauthUrl: string } | { ok: false; error: string }> {
  const { ok, json } = await postJson("/api/platform/mfa/setup", mfaToken ? { mfaToken } : {});
  if (!ok || !json?.secret) return { ok: false, error: json?.error || "Could not start two-factor setup." };
  return { ok: true, secret: json.secret, otpauthUrl: json.otpauthUrl };
}

export async function serverMfaRegenerateRecoveryCodes(
  code: string,
): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; error: string }> {
  const { ok, json } = await postJson("/api/platform/mfa/recovery-codes", { code });
  if (!ok || !Array.isArray(json?.recoveryCodes)) {
    return { ok: false, error: json?.error || "Could not regenerate recovery codes." };
  }
  return { ok: true, recoveryCodes: json.recoveryCodes };
}
export async function serverMfaDisable(code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { ok, json } = await postJson("/api/platform/mfa/disable", { code });
  if (!ok) return { ok: false, error: json?.error || "Could not disable two-factor authentication." };
  return { ok: true };
}

export type TeamInvite = {
  token: string;
  email: string;
  role: MembershipRole;
  projectAccess: string[] | null;
  expiresAt: string;
  createdAt: string;
  /** True when expiresAt is in the past but the invite has not been used or revoked. */
  expired: boolean;
};

export type TeamOverview = {
  members: TeamMember[];
  invites: TeamInvite[];
  seatLimit: number;
  seatsUsed: number;
};

export async function serverInviteTeamMember(data: {
  email: string;
  role: MembershipRole;
  projectIds?: string[] | null;
}): Promise<{ ok: boolean; error?: string; limitReached?: boolean }> {
  const { ok, json } = await postJson("/api/platform/team/invite", data);
  return { ok, error: json?.error, limitReached: json?.limitReached };
}

export async function serverAcceptInvite(data: {
  token: string;
  name?: string;
  password?: string;
}): Promise<{ ok: boolean; session?: Session; error?: string }> {
  const { ok, json } = await postJson("/api/platform/invite/accept", data);
  if (!ok) return { ok: false, error: json?.error ?? "Failed to accept invitation." };
  const session: Session = {
    username: json?.account?.username ?? "",
    role: (json?.account?.role ?? "agency") as Role,
    membershipRole: json?.account?.membershipRole ?? null,
  };
  setSession(session);
  return { ok: true, session };
}

export type InviteInfo = {
  email: string;
  companyName: string;
  role: MembershipRole;
  roleLabel: string;
  existingUser: boolean;
};

export async function serverUpdateTeamMember(
  userId: string,
  updates: { role?: MembershipRole; projectIds?: string[] | null },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const resp = await fetch(`${apiBase()}/api/platform/team/members/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(updates),
    });
    const json = await resp.json().catch(() => ({}));
    return { ok: resp.ok, error: json?.error };
  } catch {
    return { ok: false, error: "Network error." };
  }
}

export async function serverGetTeam(): Promise<{ ok: boolean; team?: TeamOverview; error?: string }> {
  try {
    const resp = await fetch(`${apiBase()}/api/platform/team`, { credentials: "include" });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, error: json?.error ?? "Failed to load team." };
    return { ok: true, team: json as TeamOverview };
  } catch {
    return { ok: false, error: "Network error." };
  }
}

export async function serverSetTeamSeatLimit(
  username: string,
  seats: number,
): Promise<{ ok: boolean; error?: string }> {
  const { ok, json } = await postJson("/api/platform/team/seat-limit", { username, seats });
  return { ok, error: json?.error };
}

export async function serverRemoveTeamMember(userId: string): Promise<{ ok: boolean; error?: string }> {
  const { ok, json } = await postJson(`/api/platform/team/members/${encodeURIComponent(userId)}/remove`);
  return { ok, error: json?.error };
}

export async function serverRevokeTeamInvite(token: string): Promise<{ ok: boolean; error?: string }> {
  const { ok, json } = await postJson(`/api/platform/team/invites/${encodeURIComponent(token)}/revoke`);
  return { ok, error: json?.error };
}

export async function serverResendTeamInvite(
  token: string,
): Promise<{ ok: boolean; error?: string; newToken?: string }> {
  const { ok, json } = await postJson(`/api/platform/team/invites/${encodeURIComponent(token)}/resend`);
  return { ok, error: json?.error, newToken: json?.token };
}
export async function serverGetInviteInfo(token: string): Promise<{ ok: boolean; invite?: InviteInfo; error?: string }> {
  try {
    const resp = await fetch(`${apiBase()}/api/platform/invite/${encodeURIComponent(token)}`, {
      credentials: "include",
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, error: json?.error ?? "Invitation not found." };
    return { ok: true, invite: json as InviteInfo };
  } catch {
    return { ok: false, error: "Network error." };
  }
}

export type WorkspaceInfo = {
  companyId: string;
  companySlug: string;
  companyName: string;
  companyRole: string;
  membershipRole: MembershipRole;
  isActive: boolean;
};
export async function serverMfaTrustedDevices(): Promise<
  { ok: true; devices: TrustedDevice[] } | { ok: false; error: string }
> {
  try {
    const resp = await fetch(`${apiBase()}/api/platform/mfa/trusted-devices`, { credentials: "include" });
    const json = await resp.json().catch(() => null);
    if (!resp.ok) return { ok: false, error: json?.error || "Could not load trusted devices." };
    return { ok: true, devices: Array.isArray(json?.devices) ? json.devices : [] };
  } catch {
    return { ok: false, error: "Could not load trusted devices." };
  }
}

export async function serverMfaRevokeTrustedDevice(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const resp = await fetch(`${apiBase()}/api/platform/mfa/trusted-devices/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    const json = await resp.json().catch(() => null);
    if (!resp.ok) return { ok: false, error: json?.error || "Could not remove the trusted device." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not remove the trusted device." };
  }
}

export type PendingMyInvite = {
  token: string;
  companyId: string;
  companySlug: string;
  companyName: string;
  role: MembershipRole;
  expiresAt: string;
  createdAt: string;
};

export async function serverAcceptMyInvite(token: string): Promise<{
  ok: boolean;
  companyId?: string;
  companySlug?: string;
  companyName?: string;
  role?: MembershipRole;
  error?: string;
}> {
  try {
    const resp = await fetch(
      `${apiBase()}/api/platform/my-invites/${encodeURIComponent(token)}/accept`,
      { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include" },
    );
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, error: json?.error ?? "Failed to accept invitation." };
    return {
      ok: true,
      companyId: json?.companyId,
      companySlug: json?.companySlug,
      companyName: json?.companyName,
      role: json?.role,
    };
  } catch {
    return { ok: false, error: "Network error." };
  }
}

export async function serverGetMyInvites(): Promise<{
  ok: boolean;
  invites?: PendingMyInvite[];
  error?: string;
}> {
  try {
    const resp = await fetch(`${apiBase()}/api/platform/my-invites`, { credentials: "include" });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, error: json?.error ?? "Failed to load invitations." };
    return { ok: true, invites: Array.isArray(json?.invites) ? json.invites : [] };
  } catch {
    return { ok: false, error: "Network error." };
  }
}

export async function serverSwitchWorkspace(companyId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const resp = await fetch(`${apiBase()}/api/platform/switch-workspace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ companyId }),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, error: json?.error ?? "Failed to switch workspace." };
    // New session cookie is now set. Reload so every hook and store reinitialises
    // against the new workspace's data. The fresh /platform/me call inside
    // bootstrapAuth will pick up the new session automatically.
    window.location.reload();
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error." };
  }
}
