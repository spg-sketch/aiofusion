import { describe, it, expect, beforeEach } from "vitest";
import {
  addUser,
  getSubAccounts,
  getVisibleUsernames,
  canViewOwner,
  saveUsers,
  type Session,
} from "./auth";

const adminSession: Session = { username: "admin", role: "admin" };

function seed() {
  saveUsers([
    { username: "admin", password: "pw-admin", role: "admin", createdAt: 1 },
    { username: "agency", password: "pw-agency", role: "user", createdAt: 2 },
    { username: "other", password: "pw-other", role: "user", createdAt: 3 },
  ]);
}

describe("auth sub-accounts and visibility", () => {
  beforeEach(() => {
    localStorage.clear();
    seed();
  });

  it("creates a sub-account linked to its parent", () => {
    const result = addUser("client-a", "pw-client", "user", "agency");
    expect(result.ok).toBe(true);
    const subs = getSubAccounts("agency");
    expect(subs.map((u) => u.username)).toEqual(["client-a"]);
    expect(subs[0].parent).toBe("agency");
  });

  it("matches sub-accounts case-insensitively on parent", () => {
    addUser("client-a", "pw-client", "user", "AGENCY");
    expect(getSubAccounts("agency").map((u) => u.username)).toEqual(["client-a"]);
  });

  it("returns null (see everything) for an admin session", () => {
    expect(getVisibleUsernames(adminSession)).toBeNull();
  });

  it("returns empty for no session", () => {
    expect(getVisibleUsernames(null)).toEqual([]);
  });

  it("a normal account sees itself plus its sub-accounts (recursively)", () => {
    addUser("client-a", "pw-a", "user", "agency");
    addUser("client-b", "pw-b", "user", "agency");
    addUser("client-a-sub", "pw-as", "user", "client-a");
    const visible = getVisibleUsernames({ username: "agency", role: "user" });
    expect(visible).not.toBeNull();
    expect(new Set(visible!)).toEqual(new Set(["agency", "client-a", "client-b", "client-a-sub"]));
  });

  it("a sub-account sees only its own projects", () => {
    addUser("client-a", "pw-a", "user", "agency");
    const visible = getVisibleUsernames({ username: "client-a", role: "user" });
    expect(visible).toEqual(["client-a"]);
  });

  it("does not leak another top-level account's projects", () => {
    addUser("client-a", "pw-a", "user", "agency");
    const session: Session = { username: "agency", role: "user" };
    expect(canViewOwner(session, "agency")).toBe(true);
    expect(canViewOwner(session, "client-a")).toBe(true);
    expect(canViewOwner(session, "other")).toBe(false);
    expect(canViewOwner(session, undefined)).toBe(false);
  });

  it("admins can view any owner, including unowned projects", () => {
    expect(canViewOwner(adminSession, "anyone")).toBe(true);
    expect(canViewOwner(adminSession, undefined)).toBe(true);
  });
});
