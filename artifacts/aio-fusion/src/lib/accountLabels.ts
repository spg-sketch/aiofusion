import type { Role as LocalRole } from "./auth";
// Friendly label for a role. The master account is shown as "Master", legacy
// "user" accounts behave as agencies.
export function roleLabel(role: LocalRole | undefined): string {
  if (role === "admin") return "Master";
  if (role === "client") return "Client";
  return "Agency";
}

// What an account is shown as: its display name when set, otherwise its login.
export function accountLabel(u: { username: string; displayName?: string }): string {
  return (u.displayName && u.displayName.trim()) || u.username;
}
