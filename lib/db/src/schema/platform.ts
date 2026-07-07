import { integer, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

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

// Server-issued sessions for platform accounts. Kept separate from the OIDC
// `sessions` table so the two auth systems never interfere. The session id is a
// random token stored in an httpOnly cookie.
//
//  - `ipHint`   is the first two octets of the login IP (e.g. "192.168.x.x")
//               stored so the sessions list can show approximate origin without
//               persisting a full IP address.
export const platformSessionsTable = pgTable("platform_sessions", {
  sid: varchar("sid").primaryKey(),
  username: varchar("username").notNull(),
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
