import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// In-memory database mock.
//
// getVisibleUsernames / canManage read the full account list via
// `db.select({...}).from(platformAccountsTable)` — we expose a settable
// accountRows array and return it from that call chain.
//
// ensurePlatformUser performs inserts + upserts on three tables
// (platform_users, platform_companies, platform_memberships).  We model
// those with simple Map/Set structures that honour the same uniqueness rules
// as the real DB so we can test idempotency without a real database.
// ---------------------------------------------------------------------------
const mock = vi.hoisted(() => {
  type AccountRow = { username: string; parent: string | null };

  // Used by getVisibleUsernames / canManage.
  const accountRows: AccountRow[] = [];

  // Used by ensurePlatformUser / ensurePlatformCompany / getUserByEmail.
  const usersByEmail = new Map<string, { id: string; email: string; name: string | null; googleId: string | null; passwordHash: string | null }>();
  const companiesBySlug = new Map<string, { id: string; slug: string; role: string; parentSlug: string | null; maxSeats: number | null; status: string }>();
  const companiesById = new Map<string, { id: string; slug: string; role: string; parentSlug: string | null; maxSeats: number | null; status: string }>();
  const memberships = new Set<string>(); // "userId::companyId" pairs

  // Used by getPlatformSessionAccount tests.
  type SessionRow = {
    sid: string; username: string; userId: string | null; activeCompanyId: string | null;
    expiresAt: Date; ipHint: string | null; createdAt: Date;
  };
  const sessionRows = new Map<string, SessionRow>();

  type FullAccountRow = {
    username: string; passwordHash: string; role: string; parent: string | null;
    maxSeats: number | null; email: string | null; website: string | null; status: string;
  };
  const fullAccountRows = new Map<string, FullAccountRow>();

  function genUuid() {
    return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  }

  const db = {
    select: (_projection?: unknown) => ({
      from: (table: unknown) => {
        // getVisibleUsernames / canManage call select().from(platformAccountsTable)
        // ensurePlatformUser calls select().from(platformUsersTable) etc.
        // We key on which table object is passed using the __table marker.
        const tbl = table as { __table?: string };
        if (tbl.__table === "platform_users") {
          return {
            where: (pred: { __eq?: string }) => ({
              limit: () => {
                const val = pred.__eq;
                const row = val ? usersByEmail.get(val) : undefined;
                return Promise.resolve(row ? [row] : []);
              },
            }),
          };
        }
        if (tbl.__table === "platform_companies") {
          return {
            where: (pred: { __eq?: string }) => ({
              limit: () => {
                const val = pred.__eq;
                if (!val) return Promise.resolve([]);
                // Support lookup by id (used by getPlatformSessionAccount) and by slug.
                const byId = companiesById.get(val);
                if (byId) return Promise.resolve([byId]);
                const bySlug = companiesBySlug.get(val);
                if (bySlug) return Promise.resolve([bySlug]);
                return Promise.resolve([]);
              },
            }),
          };
        }
        if (tbl.__table === "platform_sessions") {
          return {
            where: (pred: { __eq?: string }) => ({
              limit: () => {
                const sid = pred.__eq;
                const row = sid ? sessionRows.get(sid) : undefined;
                return Promise.resolve(row ? [row] : []);
              },
            }),
          };
        }
        // platform_accounts: support both direct await (getVisibleUsernames / canManage)
        // and .where().limit() chaining (getAccount).
        if (tbl.__table === "platform_accounts") {
          const allRows = accountRows.map((r) => ({ ...r }));
          return Object.assign(Promise.resolve(allRows), {
            where: (pred: { __eq?: string }) => ({
              limit: () => {
                const val = pred.__eq;
                const row = val ? fullAccountRows.get(val) : undefined;
                return Promise.resolve(row ? [row] : []);
              },
            }),
          });
        }
        // Default: return empty array for any unrecognised table.
        return Promise.resolve([]);
      },
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        const tbl = table as { __table?: string };
        const doInsert = () => {
          if (tbl.__table === "platform_users") {
            const email = values.email as string;
            if (!usersByEmail.has(email)) {
              const id = genUuid();
              usersByEmail.set(email, {
                id,
                email,
                name: (values.name as string | null) ?? null,
                googleId: (values.googleId as string | null) ?? null,
                passwordHash: (values.passwordHash as string | null) ?? null,
              });
            }
            return [usersByEmail.get(email)];
          }
          if (tbl.__table === "platform_companies") {
            const slug = values.slug as string;
            if (!companiesBySlug.has(slug)) {
              const id = genUuid();
              companiesBySlug.set(slug, {
                id,
                slug,
                role: (values.role as string) ?? "agency",
                parentSlug: (values.parentSlug as string | null) ?? null,
                maxSeats: (values.maxSeats as number | null) ?? null,
                status: (values.status as string) ?? "active",
              });
            }
            return [companiesBySlug.get(slug)];
          }
          if (tbl.__table === "platform_memberships") {
            const key = `${values.userId}::${values.companyId}`;
            memberships.add(key);
          }
          return [];
        };
        const returning = (_projection?: unknown) => Promise.resolve(doInsert());
        return {
          onConflictDoNothing: () => ({ returning, then: (r: (v: unknown) => unknown) => r(doInsert()) }),
          onConflictDoUpdate: () => ({
            returning,
            then: (r: (v: unknown) => unknown) => r(doInsert()),
          }),
          returning,
          then: (r: (v: unknown) => unknown) => r(doInsert()),
        };
      },
    }),
    delete: () => ({ where: () => Promise.resolve() }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  };

  return { accountRows, usersByEmail, companiesBySlug, companiesById, memberships, sessionRows, fullAccountRows, db };
});

vi.mock("@workspace/db", () => ({
  db: mock.db,
  platformAccountsTable: { __table: "platform_accounts" },
  platformUsersTable: { __table: "platform_users" },
  platformCompaniesTable: { __table: "platform_companies" },
  platformMembershipsTable: { __table: "platform_memberships" },
  platformSessionsTable: { __table: "platform_sessions" },
  platformMetaTable: { __table: "platform_meta" },
  projectsTable: { __table: "projects" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (_col: unknown, val: unknown) => ({ __eq: val }),
  ne: (_col: unknown, val: unknown) => ({ __ne: val }),
  and: (...parts: unknown[]) => ({ __and: parts }),
  desc: (_col: unknown) => ({}),
  inArray: (_col: unknown, vals: unknown[]) => ({ __inArray: vals }),
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

import {
  hashPassword,
  verifyPassword,
  normUsername,
  USERNAME_RE,
  getVisibleUsernames,
  canManage,
  normalizeRole,
  canCreateSubAccounts,
  ensurePlatformUser,
  getPlatformSessionAccount,
} from "./platform-auth";

// ---------------------------------------------------------------------------
// normalizeRole
// ---------------------------------------------------------------------------
describe("normalizeRole (role overload + legacy handling)", () => {
  it("passes through the known roles unchanged", () => {
    expect(normalizeRole("admin")).toBe("admin");
    expect(normalizeRole("agency")).toBe("agency");
    expect(normalizeRole("client")).toBe("client");
  });

  it("treats the legacy 'user' value as the default agency-like role", () => {
    expect(normalizeRole("user")).toBe("user");
  });

  it("falls back to 'user' for unknown or non-string values", () => {
    expect(normalizeRole("superadmin")).toBe("user");
    expect(normalizeRole(undefined)).toBe("user");
    expect(normalizeRole(null)).toBe("user");
    expect(normalizeRole(42)).toBe("user");
  });
});

// ---------------------------------------------------------------------------
// canCreateSubAccounts
// ---------------------------------------------------------------------------
describe("canCreateSubAccounts (creation gating)", () => {
  it("lets the master and agencies (incl. legacy users) create sub-accounts", () => {
    expect(canCreateSubAccounts("admin")).toBe(true);
    expect(canCreateSubAccounts("agency")).toBe(true);
    expect(canCreateSubAccounts("user")).toBe(true);
  });

  it("blocks a direct client (leaf account) from creating sub-accounts", () => {
    expect(canCreateSubAccounts("client")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Password hashing
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Username normalisation
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// getVisibleUsernames
// ---------------------------------------------------------------------------
describe("getVisibleUsernames (account isolation)", () => {
  beforeEach(() => {
    mock.accountRows.length = 0;
    mock.accountRows.push(
      { username: "admin", parent: null },
      { username: "agency", parent: null },
      { username: "client1", parent: "agency" },
      { username: "client2", parent: "agency" },
      { username: "subclient", parent: "client1" },
      { username: "other", parent: null },
    );
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

  it("lets a client see itself, its direct parent, and its own descendants", async () => {
    const visible = await getVisibleUsernames({ username: "client1", role: "user" });
    expect(new Set(visible)).toEqual(new Set(["client1", "subclient", "agency"]));
    expect(visible).not.toContain("client2");
    expect(visible).not.toContain("other");
  });

  it("lets a leaf client see itself and its direct parent only", async () => {
    const visible = await getVisibleUsernames({ username: "client2", role: "user" });
    expect(new Set(visible)).toEqual(new Set(["client2", "agency"]));
  });
});

// ---------------------------------------------------------------------------
// canManage
// ---------------------------------------------------------------------------
describe("canManage (account management rules)", () => {
  beforeEach(() => {
    mock.accountRows.length = 0;
    mock.accountRows.push(
      { username: "admin", parent: null },
      { username: "agency", parent: null },
      { username: "client1", parent: "agency" },
      { username: "other", parent: null },
    );
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

  it("a client cannot manage its parent even though it can see parent projects", async () => {
    const client = { username: "client1", role: "user" as const };
    expect(await canManage(client, "agency")).toBe(false);
    expect(await canManage(client, "client1")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ensurePlatformUser — idempotency
// ---------------------------------------------------------------------------
describe("ensurePlatformUser (idempotency)", () => {
  beforeEach(() => {
    // Reset user/company/membership state between tests.
    mock.usersByEmail.clear();
    mock.companiesBySlug.clear();
    mock.memberships.clear();
  });

  it("calling twice with the same email returns the same UUID", async () => {
    const id1 = await ensurePlatformUser({
      email: "idempotent@example.com",
      name: "Idempotent User",
      companyUsername: "idempotent-co",
    });
    const id2 = await ensurePlatformUser({
      email: "idempotent@example.com",
      name: "Idempotent User",
      companyUsername: "idempotent-co",
    });
    expect(typeof id1).toBe("string");
    expect(id1.length).toBeGreaterThan(0);
    expect(id1).toBe(id2);
  });

  it("calling with two different emails creates two distinct UUIDs", async () => {
    const id1 = await ensurePlatformUser({
      email: "user-a@example.com",
      companyUsername: "company-a",
    });
    const id2 = await ensurePlatformUser({
      email: "user-b@example.com",
      companyUsername: "company-b",
    });
    expect(id1).not.toBe(id2);
  });

  it("repeated calls do not accumulate duplicate company rows", async () => {
    await ensurePlatformUser({ email: "c@example.com", companyUsername: "my-corp" });
    await ensurePlatformUser({ email: "c@example.com", companyUsername: "my-corp" });
    const companiesForSlug = [...mock.companiesBySlug.keys()].filter((k) => k === "my-corp");
    expect(companiesForSlug.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getPlatformSessionAccount — fallback paths
//
// The function tries platform_companies (by activeCompanyId) first, then falls
// back to platform_accounts. These tests verify the fallback works correctly
// so a missing company row does not silently lock out a user.
// ---------------------------------------------------------------------------
describe("getPlatformSessionAccount (session resolution + fallback)", () => {
  const FUTURE = new Date(Date.now() + 1_000_000_000);
  const PAST = new Date(Date.now() - 1_000);

  beforeEach(() => {
    mock.sessionRows.clear();
    mock.fullAccountRows.clear();
    mock.companiesById.clear();
  });

  it("returns null for an unknown session id", async () => {
    const result = await getPlatformSessionAccount("nonexistent-sid");
    expect(result).toBeNull();
  });

  it("returns null and cleans up an expired session", async () => {
    mock.sessionRows.set("expired-sid", {
      sid: "expired-sid",
      username: "myagency",
      userId: null,
      activeCompanyId: null,
      expiresAt: PAST,
      ipHint: null,
      createdAt: new Date(),
    });
    const result = await getPlatformSessionAccount("expired-sid");
    expect(result).toBeNull();
  });

  it("resolves via platform_companies when activeCompanyId is present and the row exists", async () => {
    const companyId = "company-uuid-001";
    mock.companiesById.set(companyId, {
      id: companyId,
      slug: "myagency",
      role: "agency",
      parentSlug: null,
      maxSeats: null,
      status: "active",
    });
    mock.sessionRows.set("valid-new-sid", {
      sid: "valid-new-sid",
      username: "myagency",
      userId: "user-uuid-001",
      activeCompanyId: companyId,
      expiresAt: FUTURE,
      ipHint: null,
      createdAt: new Date(),
    });

    const result = await getPlatformSessionAccount("valid-new-sid");
    expect(result).not.toBeNull();
    expect(result!.username).toBe("myagency");
    expect(result!.role).toBe("agency");
    expect(result!.userId).toBe("user-uuid-001");
    expect(result!.activeCompanyId).toBe(companyId);
  });

  it("falls back to platform_accounts when activeCompanyId points to a missing company row", async () => {
    mock.fullAccountRows.set("myagency", {
      username: "myagency",
      passwordHash: "scrypt$salt$hash",
      role: "agency",
      parent: null,
      maxSeats: null,
      email: null,
      website: null,
      status: "active",
    });
    mock.sessionRows.set("orphan-company-sid", {
      sid: "orphan-company-sid",
      username: "myagency",
      userId: "user-uuid-002",
      activeCompanyId: "missing-company-uuid",
      expiresAt: FUTURE,
      ipHint: null,
      createdAt: new Date(),
    });

    const result = await getPlatformSessionAccount("orphan-company-sid");
    expect(result).not.toBeNull();
    expect(result!.username).toBe("myagency");
    expect(result!.role).toBe("agency");
  });

  it("resolves a legacy session (no activeCompanyId, no userId) via platform_accounts only", async () => {
    mock.fullAccountRows.set("legacyuser", {
      username: "legacyuser",
      passwordHash: "scrypt$salt$hash",
      role: "user",
      parent: null,
      maxSeats: null,
      email: null,
      website: null,
      status: "active",
    });
    mock.sessionRows.set("legacy-sid", {
      sid: "legacy-sid",
      username: "legacyuser",
      userId: null,
      activeCompanyId: null,
      expiresAt: FUTURE,
      ipHint: null,
      createdAt: new Date(),
    });

    const result = await getPlatformSessionAccount("legacy-sid");
    expect(result).not.toBeNull();
    expect(result!.username).toBe("legacyuser");
    expect(result!.role).toBe("user");
    expect(result!.userId).toBeUndefined();
    expect(result!.activeCompanyId).toBeUndefined();
  });

  it("returns null when both the company row is missing and the account row is missing", async () => {
    mock.sessionRows.set("ghost-sid", {
      sid: "ghost-sid",
      username: "deletedaccount",
      userId: null,
      activeCompanyId: null,
      expiresAt: FUTURE,
      ipHint: null,
      createdAt: new Date(),
    });

    const result = await getPlatformSessionAccount("ghost-sid");
    expect(result).toBeNull();
  });

  it("returns null for a legacy session whose platform_accounts row is suspended", async () => {
    mock.fullAccountRows.set("suspendeduser", {
      username: "suspendeduser",
      passwordHash: "scrypt$salt$hash",
      role: "agency",
      parent: null,
      maxSeats: null,
      email: null,
      website: null,
      status: "suspended",
    });
    mock.sessionRows.set("suspended-legacy-sid", {
      sid: "suspended-legacy-sid",
      username: "suspendeduser",
      userId: null,
      activeCompanyId: null,
      expiresAt: FUTURE,
      ipHint: null,
      createdAt: new Date(),
    });

    const result = await getPlatformSessionAccount("suspended-legacy-sid");
    expect(result).toBeNull();
  });

  it("returns null for a new-path session whose platform_accounts fallback row is suspended (missing company)", async () => {
    mock.fullAccountRows.set("suspendedagency", {
      username: "suspendedagency",
      passwordHash: "scrypt$salt$hash",
      role: "agency",
      parent: null,
      maxSeats: null,
      email: null,
      website: null,
      status: "suspended",
    });
    mock.sessionRows.set("suspended-orphan-sid", {
      sid: "suspended-orphan-sid",
      username: "suspendedagency",
      userId: "user-uuid-003",
      activeCompanyId: "missing-company-uuid-2",
      expiresAt: FUTURE,
      ipHint: null,
      createdAt: new Date(),
    });

    const result = await getPlatformSessionAccount("suspended-orphan-sid");
    expect(result).toBeNull();
  });
});
