import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// PGlite-backed in-memory database mock
// ---------------------------------------------------------------------------
vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@workspace/db/schema");

  const client = new PGlite();
  const db = drizzle(client, { schema });

  await client.exec(`
    CREATE TABLE IF NOT EXISTS platform_accounts (
      username varchar PRIMARY KEY,
      password_hash text NOT NULL,
      role varchar NOT NULL DEFAULT 'user',
      status varchar NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS platform_companies (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug varchar(64) NOT NULL UNIQUE REFERENCES platform_accounts(username) ON DELETE CASCADE,
      role varchar NOT NULL DEFAULT 'agency',
      display_name varchar(128),
      status varchar NOT NULL DEFAULT 'active',
      free_access boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS platform_users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email varchar(255) UNIQUE,
      name varchar(128),
      password_hash text,
      session_version integer NOT NULL DEFAULT 0,
      email_verified boolean,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS platform_invitations (
      token varchar(64) PRIMARY KEY,
      email varchar(255) NOT NULL,
      company_id uuid NOT NULL REFERENCES platform_companies(id) ON DELETE CASCADE,
      company_slug varchar(64) NOT NULL,
      role varchar NOT NULL DEFAULT 'viewer',
      project_access text,
      invited_by_user_id uuid,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      revoked_at timestamptz,
      reminder_sent_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  // Re-export the schema table objects so invite-reminders.ts can use them
  // with the PGlite-backed db (same pattern as @workspace/db/index.ts which
  // does `export * from "./schema"`).
  return { db, ...schema };
});

// ---------------------------------------------------------------------------
// Mock notify-email so no real emails are sent
// ---------------------------------------------------------------------------
// Default: returns true (email delivered). Override per-test for failure paths.
const mockSendInviteReminderEmail = vi.fn().mockResolvedValue(true);
vi.mock("./notify-email", () => ({
  sendInviteReminderEmail: (...args: unknown[]) => mockSendInviteReminderEmail(...args),
  getAppBaseUrl: () => "https://www.aiofusion.ai",
}));

// Mock platform-auth helpers used by invite-reminders
vi.mock("./platform-auth", () => ({
  normalizeMembershipRole: (r: string) => r || "viewer",
}));

// Mock team-invites constants used by invite-reminders
vi.mock("./team-invites", () => ({
  MEMBERSHIP_ROLE_LABELS: {
    owner: "Owner", admin: "Admin", billing: "Billing", content: "Content Team Member", viewer: "Viewer",
  },
}));

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { sendInviteReminders } from "./invite-reminders";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HOUR = 60 * 60 * 1000;

let companyId = "";
let companySlug = "testco";

async function setupCompany(): Promise<void> {
  await db.execute(sql`
    INSERT INTO platform_accounts (username, password_hash) VALUES (${companySlug}, 'x')
    ON CONFLICT DO NOTHING
  `);
  const res = await db.execute(sql`
    INSERT INTO platform_companies (slug, status) VALUES (${companySlug}, 'active')
    ON CONFLICT (slug) DO UPDATE SET status = 'active'
    RETURNING id
  `);
  companyId = (res as unknown as { rows: { id: string }[] }).rows[0]!.id;
}

async function seedInvite(
  token: string,
  expiresAt: Date,
  opts?: { usedAt?: Date; revokedAt?: Date; reminderSentAt?: Date },
): Promise<void> {
  await db.execute(sql`
    INSERT INTO platform_invitations
      (token, email, company_id, company_slug, role, expires_at, used_at, revoked_at, reminder_sent_at)
    VALUES
      (${token}, ${token + "@x.com"}, ${companyId}::uuid, ${companySlug}, 'viewer',
       ${expiresAt}, ${opts?.usedAt ?? null}, ${opts?.revokedAt ?? null}, ${opts?.reminderSentAt ?? null})
  `);
}

async function getReminderSentAt(token: string): Promise<Date | null> {
  const res = await db.execute(sql`
    SELECT reminder_sent_at FROM platform_invitations WHERE token = ${token}
  `);
  const row = (res as unknown as { rows: { reminder_sent_at: Date | null }[] }).rows[0];
  return row?.reminder_sent_at ?? null;
}

async function setExpiresAt(token: string, expiresAt: Date): Promise<void> {
  await db.execute(sql`
    UPDATE platform_invitations SET expires_at = ${expiresAt} WHERE token = ${token}
  `);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sendInviteReminders()", () => {
  beforeEach(async () => {
    mockSendInviteReminderEmail.mockClear();
    await db.execute(sql`DELETE FROM platform_invitations`);
    await setupCompany();
  });

  it("sends a reminder for an invite expiring in 24h (well within the 25h window)", async () => {
    const expiresAt = new Date(Date.now() + 24 * HOUR);
    await seedInvite("tok-in-window", expiresAt);

    await sendInviteReminders();

    expect(mockSendInviteReminderEmail).toHaveBeenCalledOnce();
    expect(mockSendInviteReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: "tok-in-window@x.com" }),
    );
    const stamped = await getReminderSentAt("tok-in-window");
    expect(stamped).not.toBeNull();
  });

  it("does not send for an invite expiring in >25h (outside window - too early)", async () => {
    await seedInvite("tok-too-early", new Date(Date.now() + 48 * HOUR));
    await sendInviteReminders();
    expect(mockSendInviteReminderEmail).not.toHaveBeenCalled();
  });

  it("sends a reminder for an invite expiring in <25h (new inclusive-lower-bound: 1h remaining still qualifies)", async () => {
    // Old behaviour: <23h was excluded. New behaviour: any unsent reminder with
    // expiresAt > now AND expiresAt <= now + 25h is eligible.
    await seedInvite("tok-nearly-expired", new Date(Date.now() + 1 * HOUR));
    await sendInviteReminders();
    expect(mockSendInviteReminderEmail).toHaveBeenCalledOnce();
    const stamped = await getReminderSentAt("tok-nearly-expired");
    expect(stamped).not.toBeNull();
  });

  it("does not send for an already-expired invite", async () => {
    await seedInvite("tok-expired", new Date(Date.now() - 1 * HOUR));
    await sendInviteReminders();
    expect(mockSendInviteReminderEmail).not.toHaveBeenCalled();
  });

  it("does not resend when reminder_sent_at is already set (idempotence)", async () => {
    const expiresAt = new Date(Date.now() + 24 * HOUR);
    await seedInvite("tok-already-sent", expiresAt, { reminderSentAt: new Date(Date.now() - HOUR) });

    await sendInviteReminders();

    expect(mockSendInviteReminderEmail).not.toHaveBeenCalled();
  });

  it("skips used invites", async () => {
    const expiresAt = new Date(Date.now() + 24 * HOUR);
    await seedInvite("tok-used", expiresAt, { usedAt: new Date() });
    await sendInviteReminders();
    expect(mockSendInviteReminderEmail).not.toHaveBeenCalled();
  });

  it("skips revoked invites", async () => {
    const expiresAt = new Date(Date.now() + 24 * HOUR);
    await seedInvite("tok-revoked", expiresAt, { revokedAt: new Date() });
    await sendInviteReminders();
    expect(mockSendInviteReminderEmail).not.toHaveBeenCalled();
  });

  it("is a no-op when there are no invites", async () => {
    await sendInviteReminders();
    expect(mockSendInviteReminderEmail).not.toHaveBeenCalled();
  });

  it("sends to multiple qualifying invites in one sweep", async () => {
    const expiresAt = new Date(Date.now() + 24 * HOUR);
    await seedInvite("tok-multi-1", expiresAt);
    await seedInvite("tok-multi-2", expiresAt);
    await seedInvite("tok-multi-3", new Date(Date.now() + 48 * HOUR)); // out of window

    await sendInviteReminders();

    expect(mockSendInviteReminderEmail).toHaveBeenCalledTimes(2);
    const stamped1 = await getReminderSentAt("tok-multi-1");
    const stamped2 = await getReminderSentAt("tok-multi-2");
    const stamped3 = await getReminderSentAt("tok-multi-3");
    expect(stamped1).not.toBeNull();
    expect(stamped2).not.toBeNull();
    expect(stamped3).toBeNull();
  });

  it("second sweep is a no-op for already-reminded invites", async () => {
    const expiresAt = new Date(Date.now() + 24 * HOUR);
    await seedInvite("tok-second-sweep", expiresAt);

    await sendInviteReminders();
    expect(mockSendInviteReminderEmail).toHaveBeenCalledOnce();

    mockSendInviteReminderEmail.mockClear();
    await sendInviteReminders();
    expect(mockSendInviteReminderEmail).not.toHaveBeenCalled();
  });

  it("provider throws → reminder_sent_at is rolled back to NULL and invite is retried next sweep", async () => {
    const expiresAt = new Date(Date.now() + 24 * HOUR);
    await seedInvite("tok-provider-fail", expiresAt);

    // First sweep: provider throws - claim must be rolled back to NULL.
    mockSendInviteReminderEmail.mockRejectedValueOnce(new Error("SMTP timeout"));
    await sendInviteReminders();

    const stampAfterFail = await getReminderSentAt("tok-provider-fail");
    expect(stampAfterFail).toBeNull();

    // Second sweep (provider recovered): reminder sent and stamped.
    mockSendInviteReminderEmail.mockResolvedValueOnce(true);
    await sendInviteReminders();

    expect(mockSendInviteReminderEmail).toHaveBeenCalledTimes(2);
    const stampAfterRetry = await getReminderSentAt("tok-provider-fail");
    expect(stampAfterRetry).not.toBeNull();
  });

  it("Resend not configured (returns false) → claim rolled back to NULL, invite retried next sweep", async () => {
    const expiresAt = new Date(Date.now() + 24 * HOUR);
    await seedInvite("tok-no-resend-key", expiresAt);

    // First sweep: no Resend key → returns false, claim rolled back.
    mockSendInviteReminderEmail.mockResolvedValueOnce(false);
    await sendInviteReminders();

    expect(mockSendInviteReminderEmail).toHaveBeenCalledOnce();
    const stampAfterNoKey = await getReminderSentAt("tok-no-resend-key");
    expect(stampAfterNoKey).toBeNull();

    // Second sweep (key now set): reminder sent and stamped.
    mockSendInviteReminderEmail.mockResolvedValueOnce(true);
    await sendInviteReminders();

    expect(mockSendInviteReminderEmail).toHaveBeenCalledTimes(2);
    const stampAfterRetry = await getReminderSentAt("tok-no-resend-key");
    expect(stampAfterRetry).not.toBeNull();
  });

  it("failure retry across schedule: send fails at 24h, succeeds when invite is 23h away", async () => {
    // Invite starts at 24h to expiry.
    const expiresAt = new Date(Date.now() + 24 * HOUR);
    await seedInvite("tok-schedule-retry", expiresAt);

    // First sweep (24h remaining): provider fails → claim rolled back.
    mockSendInviteReminderEmail.mockRejectedValueOnce(new Error("transient failure"));
    await sendInviteReminders();
    expect(await getReminderSentAt("tok-schedule-retry")).toBeNull();

    // Simulate 1h passing: shift expiresAt down by 1h so invite is now 23h away.
    // With the inclusive lower bound (no floor), 23h is still within the 25h window.
    await setExpiresAt("tok-schedule-retry", new Date(expiresAt.getTime() - HOUR));

    // Second sweep: provider recovers → reminder sent and stamped.
    mockSendInviteReminderEmail.mockResolvedValueOnce(true);
    await sendInviteReminders();

    expect(mockSendInviteReminderEmail).toHaveBeenCalledTimes(2);
    expect(await getReminderSentAt("tok-schedule-retry")).not.toBeNull();
  });

  it("concurrency: two concurrent sweeps with one candidate → exactly one email sent", async () => {
    // Insert a single qualifying invite.
    await seedInvite("tok-concurrent", new Date(Date.now() + 24 * HOUR));

    // Both sweeps run at the same time. The atomic UPDATE…RETURNING claim
    // ensures only the winner sends the email; the other sees claimed.length=0.
    await Promise.all([sendInviteReminders(), sendInviteReminders()]);

    expect(mockSendInviteReminderEmail).toHaveBeenCalledTimes(1);
    const stamp = await getReminderSentAt("tok-concurrent");
    expect(stamp).not.toBeNull();
  });
});
