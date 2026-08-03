import { boolean, integer, pgTable, primaryKey, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

// Platform accounts are the AIO Fusion application logins (an agency and the
// client sub-accounts it creates). They are separate from the Replit Auth
// `users`/`sessions` tables, which back the OIDC sign-in flow and must not be
// dropped. These accounts used to live only in each browser's localStorage in
// plain text; they now live here with hashed passwords so logins can be
// enforced on the server.
//
//  - `username`     is the canonical (lowercased) login name and primary key.
//  - `passwordHash` is a scrypt hash, never the raw password.
//  - `role`         is "admin" (sees everything) or "user" (an agency/client).
//  - `parent`       is the lowercased username of the account that created this
//                   one, set only for sub-accounts. It powers the agency ->
//                   client visibility hierarchy.
//  - `maxSeats`     is the optional cap on how many sub-accounts may exist
//                   under this account. NULL = no limit. Only meaningful for
//                   agency-type accounts.
//  - `email`        is the owner's work email — used as an alternative login
//                   handle for new accounts. Optional for legacy accounts.
//  - `website`      is the company website URL. Collected at sign-up and
//                   pre-fills the intake form.
//  - `status`       controls whether the account can access the platform.
//                   "active" (default) = full access.
//                   "pending_approval" = signed up but not yet approved by admin.
//                   "suspended" = manually suspended by admin.
export const platformAccountsTable = pgTable("platform_accounts", {
  username: varchar("username").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role").notNull().default("user"),
  parent: varchar("parent"),
  maxSeats: integer("max_seats"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  email: varchar("email"),
  website: varchar("website"),
  status: varchar("status").notNull().default("active"),
});

// Company/workspace records. Each platform_accounts row (which acts as the
// legacy auth + workspace slug) has a corresponding platform_companies row
// that gives it a stable UUID identity. This decouples the human user
// (platform_users) from the workspace they belong to, and lets a user belong
// to multiple workspaces.
//
//  - `id`           Stable UUID; referenced by memberships and sessions.
//  - `slug`         The canonical lowercased slug (= platform_accounts.username).
//                   Unique, used for URL paths and store keys so existing data
//                   is compatible without migration.
//  - `role`         "admin" | "agency" | "client" | "user" — mirrors
//                   platform_accounts.role for workspace-level access rules.
//  - `parentSlug`   The parent company's slug (mirrors platform_accounts.parent).
//  - `maxSeats`     Optional seat cap for agency accounts.
//  - `email`        Primary contact email for the company.
//  - `billingEmail` Separate billing contact — invoices sent here. Defaults to
//                   `email` if null.
//  - `vatNumber`    VAT registration number, shown on Stripe invoices.
//  - `website`      Company website URL.
//  - `displayName`  Human-readable company name (e.g. "Acme PR Agency"). Replaces
//                   the platform_meta "account:profile:" pattern for new accounts.
//  - `freeAccess`   When true, bypasses the payment gate entirely. Set by master
//                   admins for beta/demo accounts.
//  - `status`       "active" | "pending_approval" | "suspended".
export const platformCompaniesTable = pgTable("platform_companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 64 })
    .notNull()
    .unique()
    .references(() => platformAccountsTable.username, { onDelete: "cascade" }),
  role: varchar("role").notNull().default("agency"),
  parentSlug: varchar("parent_slug", { length: 64 }),
  maxSeats: integer("max_seats"),
  email: varchar("email", { length: 255 }),
  billingEmail: varchar("billing_email", { length: 255 }),
  vatNumber: varchar("vat_number", { length: 64 }),
  website: varchar("website", { length: 512 }),
  displayName: varchar("display_name", { length: 128 }),
  freeAccess: boolean("free_access").notNull().default(false),
  status: varchar("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Individual human users, separate from company/agency accounts.
//
//  - `id`              UUID primary key, issued by the database.
//  - `email`           Unique email address; the primary login identifier.
//  - `name`            Display name (full name or preferred name).
//  - `passwordHash`    scrypt hash, NULL for users who only sign in via SSO.
//  - `googleId`        Google sub (subject) from OAuth; NULL if not linked.
//  - `microsoftId`     Microsoft Entra ID oid from OIDC; NULL if not linked.
//  - `sessionVersion`  Incremented on password change, access revocation, etc.
//                      Sessions carry the version at creation time; a mismatch
//                      causes immediate rejection without touching the session
//                      table. This is the fast-path revocation mechanism.
//  - `createdAt`       When the user registered.
export const platformUsersTable = pgTable("platform_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).unique(),
  name: varchar("name", { length: 128 }),
  passwordHash: text("password_hash"),
  googleId: varchar("google_id", { length: 255 }).unique(),
  microsoftId: varchar("microsoft_id", { length: 255 }).unique(),
  sessionVersion: integer("session_version").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Links a human user to a company workspace.
//
//  - `userId`      References platform_users.id.
//  - `companyId`   References platform_companies.id (stable UUID).
//  - `companySlug` Denormalised slug for fast lookups without joining companies.
//  - `role`        The user's role within this company:
//                    "owner"   — created the account; full control incl. billing.
//                    "admin"   — full access excl. billing; can manage team.
//                    "billing" — billing & invoices only; no project/content access.
//                    "content" — assigned projects + content tools; no admin.
//                    "viewer"  — assigned projects, read-only; no content tools.
//                    Legacy value "member" treated as "content".
export const platformMembershipsTable = pgTable(
  "platform_memberships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => platformUsersTable.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => platformCompaniesTable.id, { onDelete: "cascade" }),
    companySlug: varchar("company_slug", { length: 64 }).notNull(),
    role: varchar("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.companyId] })],
);

// Server-issued sessions for platform accounts. Kept separate from the OIDC
// `sessions` table so the two auth systems never interfere. The session id is a
// random token stored in an httpOnly cookie.
//
//  - `username`         Legacy company slug; kept for backward compat while
//                       all store/audit routes still key on it.
//  - `userId`           platform_users.id of the signed-in human; NULL for
//                       sessions created before the users table existed.
//  - `activeCompanyId`  platform_companies.id of the active workspace; NULL
//                       for legacy sessions. Enables multi-company context
//                       switching without a new login.
//  - `sessionVersion`   The platform_users.session_version at session creation.
//                       NULL = legacy session (version check skipped). If the
//                       user's current session_version exceeds this value, the
//                       session is immediately rejected — this is how password
//                       changes and access revocations propagate without
//                       requiring a session table DELETE.
//  - `ipHint`           First two octets of the login IP, stored coarsely so
//                       the sessions list can show approximate origin.
export const platformSessionsTable = pgTable("platform_sessions", {
  sid: varchar("sid").primaryKey(),
  username: varchar("username").notNull(),
  userId: uuid("user_id"),
  activeCompanyId: uuid("active_company_id"),
  sessionVersion: integer("session_version"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipHint: varchar("ip_hint"),
});

// A tiny key/value table for one-off platform flags (e.g. whether the one-time
// migration of browser-stored accounts has already run).
export const platformMetaTable = pgTable("platform_meta", {
  key: varchar("key").primaryKey(),
  value: text("value").notNull(),
});

export type PlatformAccountRow = typeof platformAccountsTable.$inferSelect;
export type InsertPlatformAccount = typeof platformAccountsTable.$inferInsert;
export type AccountStatus = "active" | "pending_approval" | "suspended";

export type PlatformCompanyRow = typeof platformCompaniesTable.$inferSelect;
export type InsertPlatformCompany = typeof platformCompaniesTable.$inferInsert;

export type PlatformUserRow = typeof platformUsersTable.$inferSelect;
export type InsertPlatformUser = typeof platformUsersTable.$inferInsert;

export type PlatformMembershipRow = typeof platformMembershipsTable.$inferSelect;

// Canonical 5-role membership enum (the varchar column accepts any string for
// forward-compat; these are the only values the application logic understands).
export type MembershipRole = "owner" | "admin" | "billing" | "content" | "viewer";
