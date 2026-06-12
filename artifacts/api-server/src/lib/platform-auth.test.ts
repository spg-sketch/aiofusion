import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database layer. getVisibleUsernames / canManage read the full account
// list via `db.select({...}).from(table)`, so we expose a settable row list and
// return it from that call chain. No real database is touched.
const accountRows = vi.hoisted(() => ({ value: [] as Array<{ username: string; parent: string | null }> }));
vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({ from: () => Promise.resolve(accountRows.value) }),
  },
  platformAccountsTable: {},
  platformSessionsTable: {},
  platformMetaTable: {},
  projectsTable: {},
}));

import {
  hashPassword,
  verifyPassword,
  normUsername,
  USERNAME_RE,
  getVisibleUsernames,
  canManage,
} from "./platform-auth";

describe("password hashing", () => {
  it("verifies a correct password against its own hash", () => {
    const stored = hashPassword("correct horse battery");
    expect(verifyPassword("correct horse battery", stored)).toBe(true);
  });

  it("rejects an incorrect password", () => {
    const stored = hashPassword("the-real-one");
    expect(verifyPassword("not-it", stored)).toBe(false);
  });

  it("uses a unique salt so equal passwords hash differently", () => {
    const a = hashPassword("same");
    const b = hashPassword("same");
    expect(a).not.toEqual(b);
    expect(verifyPassword("same", a)).toBe(true);
    expect(verifyPassword("same", b)).toBe(true);
  });

  it("rejects malformed or empty stored hashes without throwing", () => {
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "plaintext")).toBe(false);
    expect(verifyPassword("x", "md5$salt$deadbeef")).toBe(false);
    expect(verifyPassword("x", "scrypt$only-two")).toBe(false);
  });
});

describe("username normalisation and validation", () => {
  it("lowercases and trims, and tolerates non-strings", () => {
    expect(normUsername("  Agency_One  ")).toBe("agency_one");
    expect(normUsername(undefined)).toBe("");
    expect(normUsername(123)).toBe("");
  });

  it("accepts valid usernames and rejects invalid ones", () => {
    expect(USERNAME_RE.test("ab")).toBe(true);
    expect(USERNAME_RE.test("agency.client-01_x")).toBe(true);
    expect(USERNAME_RE.test("a")).toBe(false); // too short
    expect(USERNAME_RE.test("has space")).toBe(false);
    expect(USERNAME_RE.test("bad/slash")).toBe(false);
    expect(USERNAME_RE.test("a".repeat(33))).toBe(false); // too long
  });
});

describe("getVisibleUsernames (account isolation)", () => {
  beforeEach(() => {
    // admin, an agency, two of its clients, and an unrelated account.
    accountRows.value = [
      { username: "admin", parent: null },
      { username: "agency", parent: null },
      { username: "client1", parent: "agency" },
      { username: "client2", parent: "agency" },
      { username: "subclient", parent: "client1" },
      { username: "other", parent: null },
    ];
  });

  it("returns null for an admin (no filter, sees everything)", async () => {
    const visible = await getVisibleUsernames({ username: "admin", role: "admin" });
    expect(visible).toBeNull();
  });

  it("lets an agency see itself plus all descendant clients", async () => {
    const visible = await getVisibleUsernames({ username: "agency", role: "user" });
    expect(new Set(visible)).toEqual(
      new Set(["agency", "client1", "client2", "subclient"]),
    );
    expect(visible).not.toContain("other");
    expect(visible).not.toContain("admin");
  });

  it("limits a client to itself plus its own descendants only", async () => {
    const visible = await getVisibleUsernames({ username: "client1", role: "user" });
    expect(new Set(visible)).toEqual(new Set(["client1", "subclient"]));
    expect(visible).not.toContain("agency");
    expect(visible).not.toContain("client2");
  });

  it("limits a leaf client to only itself", async () => {
    const visible = await getVisibleUsernames({ username: "client2", role: "user" });
    expect(visible).toEqual(["client2"]);
  });
});

describe("canManage (account management rules)", () => {
  beforeEach(() => {
    accountRows.value = [
      { username: "admin", parent: null },
      { username: "agency", parent: null },
      { username: "client1", parent: "agency" },
      { username: "other", parent: null },
    ];
  });

  it("admins can manage anyone", async () => {
    expect(await canManage({ username: "admin", role: "admin" }, "agency")).toBe(true);
    expect(await canManage({ username: "admin", role: "admin" }, "client1")).toBe(true);
  });

  it("an agency can manage its descendant but not itself or unrelated accounts", async () => {
    const agency = { username: "agency", role: "user" as const };
    expect(await canManage(agency, "client1")).toBe(true);
    expect(await canManage(agency, "agency")).toBe(false);
    expect(await canManage(agency, "other")).toBe(false);
  });
});
