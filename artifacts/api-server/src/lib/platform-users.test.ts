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
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS platform_companies (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug varchar(64) NOT NULL UNIQUE,
      role varchar NOT NULL DEFAULT 'agency',
      parent_slug varchar(64),
      max_seats int,
      email varchar(255),
      website varchar(512),
      status varchar NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS platform_memberships (
      user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      company_id uuid NOT NULL REFERENCES platform_companies(id) ON DELETE CASCADE,
      company_slug varchar(64) NOT NULL,
      role varchar NOT NULL DEFAULT 'owner',
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

import { db, platformUsersTable, platformCompaniesTable, platformMembershipsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ensurePlatformUser, ensurePlatformCompany, getUserByEmail } from "./platform-auth";

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
