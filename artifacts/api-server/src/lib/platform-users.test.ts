import { describe, it, expect } from "vitest";
import { vi } from "vitest";

// DB-backed migration smoke test using an in-memory PGlite database.
// Verifies that ensurePlatformUser / ensurePlatformCompany correctly create and
// link all three tables (platform_users, platform_companies, platform_memberships)
// and that repeated calls (idempotency) produce the same user UUID.
vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@workspace/db/schema");

  const client = new PGlite();
  const db = drizzle(client, { schema });

  // Create tables in dependency order.
  await client.exec(`
    CREATE TABLE IF NOT EXISTS platform_users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email varchar(255) UNIQUE,
      name varchar(128),
      password_hash text,
      google_id varchar(255) UNIQUE,
      microsoft_id varchar(255) UNIQUE,
      session_version integer NOT NULL DEFAULT 0,
      email_verified boolean,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS platform_companies (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug varchar(64) NOT NULL UNIQUE,
      role varchar NOT NULL DEFAULT 'agency',
      parent_slug varchar(64),
      max_seats int,
      email varchar(255),
      billing_email varchar(255),
      vat_number varchar(64),
      website varchar(512),
      display_name varchar(128),
      free_access boolean NOT NULL DEFAULT false,
      status varchar NOT NULL DEFAULT 'active',
      setup_complete boolean,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS platform_memberships (
      user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      company_id uuid NOT NULL REFERENCES platform_companies(id) ON DELETE CASCADE,
      company_slug varchar(64) NOT NULL,
      role varchar NOT NULL DEFAULT 'owner',
      project_access text,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, company_id)
    );
    CREATE TABLE IF NOT EXISTS platform_accounts (
      username varchar PRIMARY KEY,
      password_hash text NOT NULL,
      role varchar NOT NULL DEFAULT 'user',
      parent varchar,
      max_seats int,
      created_at timestamptz NOT NULL DEFAULT now(),
      email varchar,
      website varchar,
      status varchar NOT NULL DEFAULT 'active'
    );
    CREATE TABLE IF NOT EXISTS platform_meta (
      key varchar PRIMARY KEY,
      value text NOT NULL
    );
  `);

  return {
    db,
    platformUsersTable: schema.platformUsersTable,
    platformCompaniesTable: schema.platformCompaniesTable,
    platformMembershipsTable: schema.platformMembershipsTable,
    platformAccountsTable: schema.platformAccountsTable,
    platformMetaTable: schema.platformMetaTable,
  };
});

import { db, platformUsersTable, platformCompaniesTable, platformMembershipsTable, platformAccountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ensurePlatformUser, ensurePlatformCompany, getUserByEmail, backfillPlatformUsers } from "./platform-auth";

// ── backfillPlatformUsers smoke test ─────────────────────────────────────────
// Seeds platform_accounts with realistic rows (admin, agency with parent/seats,
// client) then calls backfillPlatformUsers() and verifies that corresponding
// platform_users, platform_companies, and platform_memberships rows exist with
// correct role, status, parentSlug, and maxSeats fidelity.
describe("backfillPlatformUsers — migration smoke test", () => {
  it("creates users + companies + memberships for seeded platform_accounts", async () => {
    // Seed test accounts (unique slugs to avoid conflicts with other tests).
    await db.insert(platformAccountsTable).values([
      {
        username: "backfill-admin",
        passwordHash: "hashed-pw-admin",
        role: "admin",
        status: "active",
        email: "backfill-admin@example.com",
        parent: null,
        maxSeats: null,
      },
      {
        username: "backfill-agency",
        passwordHash: "hashed-pw-agency",
        role: "agency",
        status: "active",
        email: "backfill-agency@example.com",
        parent: null,
        maxSeats: 10,
      },
      {
        username: "backfill-client",
        passwordHash: "hashed-pw-client",
        role: "client",
        status: "active",
        email: "backfill-client@example.com",
        parent: "backfill-agency",
        maxSeats: null,
      },
    ]);

    await backfillPlatformUsers();

    // Admin — user + company + membership created.
    const adminUser = await getUserByEmail("backfill-admin@example.com");
    expect(adminUser).not.toBeNull();
    expect(adminUser!.email).toBe("backfill-admin@example.com");

    const [adminCompany] = await db
      .select()
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, "backfill-admin"))
      .limit(1);
    expect(adminCompany).toBeDefined();
    expect(adminCompany!.role).toBe("admin");
    expect(adminCompany!.status).toBe("active");

    const [adminMembership] = await db
      .select()
      .from(platformMembershipsTable)
      .where(eq(platformMembershipsTable.userId, adminUser!.id))
      .limit(1);
    expect(adminMembership).toBeDefined();
    expect(adminMembership!.companySlug).toBe("backfill-admin");

    // Agency — maxSeats preserved in platform_companies.
    const [agencyCompany] = await db
      .select()
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, "backfill-agency"))
      .limit(1);
    expect(agencyCompany).toBeDefined();
    expect(agencyCompany!.role).toBe("agency");
    expect(agencyCompany!.maxSeats).toBe(10);

    // Client — parentSlug hierarchy preserved in platform_companies.
    const [clientCompany] = await db
      .select()
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, "backfill-client"))
      .limit(1);
    expect(clientCompany).toBeDefined();
    expect(clientCompany!.role).toBe("client");
    expect(clientCompany!.parentSlug).toBe("backfill-agency");
    expect(clientCompany!.status).toBe("active");

    // Three distinct users created — no duplicates.
    const clientUser = await getUserByEmail("backfill-client@example.com");
    const agencyUser = await getUserByEmail("backfill-agency@example.com");
    expect(clientUser).not.toBeNull();
    expect(agencyUser).not.toBeNull();
    expect(new Set([adminUser!.id, agencyUser!.id, clientUser!.id]).size).toBe(3);
  });
});

describe("ensurePlatformCompany — company row creation", () => {
  it("creates a company row with the correct slug", async () => {
    await ensurePlatformCompany({ slug: "acme", role: "agency", status: "active" });

    const [row] = await db
      .select()
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, "acme"))
      .limit(1);

    expect(row).toBeDefined();
    expect(row!.slug).toBe("acme");
    expect(row!.role).toBe("agency");
  });

  it("is idempotent — calling twice returns the same UUID", async () => {
    const id1 = await ensurePlatformCompany({ slug: "idempotent-co", status: "active" });
    const id2 = await ensurePlatformCompany({ slug: "idempotent-co", status: "active" });
    expect(id1).toBe(id2);
  });
});

describe("ensurePlatformUser — user + company + membership creation", () => {
  it("creates a user row, a company row, and a membership row", async () => {
    const userId = await ensurePlatformUser({
      email: "alice@example.com",
      name: "Alice",
      companyUsername: "alice-corp",
      membershipRole: "owner",
    });

    expect(typeof userId).toBe("string");
    expect(userId.length).toBeGreaterThan(0);

    // User row exists.
    const [userRow] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.id, userId))
      .limit(1);
    expect(userRow).toBeDefined();
    expect(userRow!.email).toBe("alice@example.com");
    expect(userRow!.name).toBe("Alice");

    // Company row exists for the slug.
    const [companyRow] = await db
      .select()
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, "alice-corp"))
      .limit(1);
    expect(companyRow).toBeDefined();

    // Membership links user ↔ company.
    const [membership] = await db
      .select()
      .from(platformMembershipsTable)
      .where(eq(platformMembershipsTable.userId, userId))
      .limit(1);
    expect(membership).toBeDefined();
    expect(membership!.companySlug).toBe("alice-corp");
    expect(membership!.role).toBe("owner");
    expect(membership!.companyId).toBe(companyRow!.id);
  });

  it("is idempotent — calling twice with same email returns the same user UUID", async () => {
    const id1 = await ensurePlatformUser({
      email: "bob@example.com",
      companyUsername: "bob-co",
    });
    const id2 = await ensurePlatformUser({
      email: "bob@example.com",
      companyUsername: "bob-co",
    });
    expect(id1).toBe(id2);
  });

  it("getUserByEmail finds the user after creation", async () => {
    await ensurePlatformUser({
      email: "carol@example.com",
      name: "Carol",
      companyUsername: "carol-inc",
    });

    const found = await getUserByEmail("carol@example.com");
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Carol");
  });

  it("updates name/googleId without creating a duplicate user", async () => {
    await ensurePlatformUser({
      email: "dave@example.com",
      companyUsername: "dave-co",
    });

    const id2 = await ensurePlatformUser({
      email: "dave@example.com",
      name: "Dave Updated",
      googleId: "google-dave-123",
      companyUsername: "dave-co",
    });

    const [row] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.id, id2))
      .limit(1);
    expect(row!.name).toBe("Dave Updated");
    expect(row!.googleId).toBe("google-dave-123");

    // Still only one user row for this email.
    const all = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, "dave@example.com"));
    expect(all.length).toBe(1);
  });
});
