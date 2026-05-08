export type Role = "admin" | "user";

export type User = {
  username: string;
  password: string;
  role: Role;
  createdAt: number;
};

export type Session = {
  username: string;
  role: Role;
};

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
    (u.role === "admin" || u.role === "user") &&
    typeof u.createdAt === "number"
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
    if (parsed && typeof parsed.username === "string" && (parsed.role === "admin" || parsed.role === "user")) {
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

export function addUser(username: string, password: string, role: Role): { ok: true } | { ok: false; error: string } {
  const u = username.trim();
  if (!u) return { ok: false, error: "Username is required." };
  if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(u)) return { ok: false, error: "Username must be 2–32 characters: letters, numbers, _.-" };
  if (!password || password.length < 4) return { ok: false, error: "Password must be at least 4 characters." };
  const users = getUsers();
  if (users.some((x) => x.username.toLowerCase() === u.toLowerCase())) {
    return { ok: false, error: "That username already exists." };
  }
  users.push({ username: u, password, role, createdAt: Date.now() });
  saveUsers(users);
  return { ok: true };
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
