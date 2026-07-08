import { integer, pgTable, primaryKey, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

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

// Individual human users, separate from company/agency accounts.
//
//  - `id`           UUID primary key, issued by the database.
//  - `email`        Unique email address; the primary login identifier.
//  - `name`         Display name (full name or preferred name).
//  - `passwordHash` scrypt hash, NULL for users who only sign in via Google.
//  - `googleId`     Google sub (subject) from OAuth userinfo; NULL if not linked.
//  - `createdAt`    When the user registered.
export const platformUsersTable = pgTable("platform_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).unique(),
  name: varchar("name", { length: 128 }),
  passwordHash: text("password_hash"),
  googleId: varchar("google_id", { length: 255 }).unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Links a human user to a company/agency account.
//
//  - `userId`     References platform_users.id.
//  - `companyId`  References platform_accounts.username (the company's slug).
//  - `role`       The user's role within this company:
//                   "owner"  — created the account; full control.
//                   "admin"  — platform-wide admin (only used for the admin account).
//                   "member" — future team member invite.
export const platformMembershipsTable = pgTable(
  "platform_memberships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => platformUsersTable.id, { onDelete: "cascade" }),
    companyId: varchar("company_id")
      .notNull()
      .references(() => platformAccountsTable.username, { onDelete: "cascade" }),
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
//  - `ipHint`   is the first two octets of the login IP (e.g. "192.168.x.x")
//               stored so the sessions list can show approximate origin without
//               persisting a full IP address.
//  - `userId`   the platform_users.id of the logged-in user (NULL for legacy
//               sessions created before the users table existed).
export const platformSessionsTable = pgTable("platform_sessions", {
  sid: varchar("sid").primaryKey(),
  username: varchar("username").notNull(),
  userId: uuid("user_id"),
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

export type PlatformUserRow = typeof platformUsersTable.$inferSelect;
export type InsertPlatformUser = typeof platformUsersTable.$inferInsert;

export type PlatformMembershipRow = typeof platformMembershipsTable.$inferSelect;
