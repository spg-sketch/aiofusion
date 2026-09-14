import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMediaSourceEvidence } = vi.hoisted(() => ({
  fetchMediaSourceEvidence: vi.fn(),
}));

vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@workspace/db/schema");
  const client = new PGlite();
  await client.exec(`
    CREATE TABLE media_contacts (
      id serial PRIMARY KEY,
      first_name text NOT NULL DEFAULT '',
      last_name text NOT NULL DEFAULT '',
      role text NOT NULL DEFAULT '',
      email text NOT NULL DEFAULT '',
      source_url text NOT NULL DEFAULT '',
      account_id varchar,
      last_verified_at timestamptz,
      source_check_claimed_at timestamptz,
      source_check_claim_token varchar(80),
      source_check_failure_count integer NOT NULL DEFAULT 0,
      deleted_at timestamptz
    );
    CREATE TABLE media_contact_source_checks (
      id serial PRIMARY KEY,
      contact_id integer NOT NULL,
      account_id varchar NOT NULL,
      source_url text NOT NULL,
      outcome varchar(20) NOT NULL,
      error_code varchar(40),
      error_message text NOT NULL DEFAULT '',
      observed_evidence jsonb NOT NULL DEFAULT '{}',
      differences jsonb NOT NULL DEFAULT '[]',
      checked_at timestamptz NOT NULL DEFAULT now(),
      reviewed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE media_source_reverification_runs (
      singleton_id integer PRIMARY KEY,
      started_at timestamptz NOT NULL
    );
  `);
  return { ...schema, db: drizzle(client, { schema }), __client: client };
});

vi.mock("./safe-fetch", () => ({ fetchMediaSourceEvidence }));

import * as workspaceDb from "@workspace/db";
import {
  claimMediaContactsForReverification,
  reverifyClaimedMediaContact,
  runMediaSourceReverification,
} from "./media-source-reverification";

const { db, mediaContactsTable, mediaContactSourceChecksTable, __client } = workspaceDb as typeof workspaceDb & {
  __client: { exec(sql: string): Promise<{ rows?: unknown[] }> };
};

const NOW = new Date("2026-09-14T12:00:00.000Z");

async function seedContact(accountId: string, suffix: string, extra = "") {
  await __client.exec(`
    INSERT INTO media_contacts (first_name, last_name, role, email, source_url, account_id ${extra ? "," + extra.split("=")[0] : ""})
    VALUES ('Jane', '${suffix}', 'Editor', '${suffix}@example.com', 'https://example.com/${suffix}', '${accountId}' ${extra ? "," + extra.split("=")[1] : ""})
  `);
}

describe("automatic media source reverification", () => {
  beforeEach(async () => {
    await __client.exec("TRUNCATE media_source_reverification_runs, media_contact_source_checks, media_contacts RESTART IDENTITY");
    fetchMediaSourceEvidence.mockReset();
  });

  it("claims bounded, workspace-fair batches and excludes source-less or deleted contacts", async () => {
    for (let index = 0; index < 4; index++) await seedContact("account-a", `a${index}`);
    for (let index = 0; index < 4; index++) await seedContact("account-b", `b${index}`);
    await __client.exec("INSERT INTO media_contacts (first_name, source_url, account_id) VALUES ('No source', '', 'account-a'), ('Deleted', 'https://example.com/deleted', 'account-b')");
    await __client.exec("UPDATE media_contacts SET deleted_at = now() WHERE first_name = 'Deleted'");

    const claimed = await claimMediaContactsForReverification({ now: NOW, batchSize: 4, workspaceLimit: 2 });
    expect(claimed).toHaveLength(4);
    expect(claimed.filter((contact) => contact.accountId === "account-a")).toHaveLength(2);
    expect(claimed.filter((contact) => contact.accountId === "account-b")).toHaveLength(2);

    const raced = await claimMediaContactsForReverification({ now: NOW, batchSize: 10, workspaceLimit: 10 });
    expect(raced.map((contact) => contact.id)).not.toEqual(expect.arrayContaining(claimed.map((contact) => contact.id)));
  });

  it("allows only one deployment-wide sweep per interval", async () => {
    await seedContact("account-a", "one");
    await seedContact("account-b", "two");
    fetchMediaSourceEvidence.mockResolvedValue({
      url: "https://example.com/source", text: "Jane", emails: [], roleCandidates: [],
    });
    const [first, second] = await Promise.all([
      runMediaSourceReverification({ now: NOW, batchSize: 1 }),
      runMediaSourceReverification({ now: NOW, batchSize: 1 }),
    ]);
    expect([first.skipped, second.skipped].sort()).toEqual([false, true]);
    expect(first.claimed + second.claimed).toBe(1);
  });

  it("backs unavailable sources off exponentially while normal checks wait 90 days", async () => {
    await seedContact("account-a", "failed", "source_check_failure_count=3");
    await seedContact("account-a", "current");
    await __client.exec(`
      INSERT INTO media_contact_source_checks (contact_id, account_id, source_url, outcome, checked_at)
      VALUES
        (1, 'account-a', 'https://example.com/failed', 'unavailable', '${new Date(NOW.getTime() - 23 * 60 * 60 * 1000).toISOString()}'),
        (2, 'account-a', 'https://example.com/current', 'current', '${new Date(NOW.getTime() - 89 * 24 * 60 * 60 * 1000).toISOString()}')
    `);
    expect(await claimMediaContactsForReverification({ now: NOW })).toHaveLength(0);

    const later = new Date(NOW.getTime() + 2 * 60 * 60 * 1000);
    const claimed = await claimMediaContactsForReverification({ now: later });
    expect(claimed.map((contact) => contact.id)).toEqual([1]);
  });

  it("records evidence and failures without changing approved contact fields", async () => {
    await seedContact("account-a", "preserved");
    fetchMediaSourceEvidence.mockResolvedValue({
      url: "https://example.com/preserved",
      text: "Jane preserved Climate Correspondent new@example.com",
      emails: ["new@example.com"],
      roleCandidates: ["Jane preserved - Climate Correspondent"],
    });
    const result = await runMediaSourceReverification({ now: NOW, batchSize: 1, fetchEvidence: fetchMediaSourceEvidence });
    expect(result).toEqual({ claimed: 1, completed: 1, unavailable: 0, skipped: false });
    const [contact] = await db.select({
      role: mediaContactsTable.role,
      email: mediaContactsTable.email,
      sourceCheckFailureCount: mediaContactsTable.sourceCheckFailureCount,
    }).from(mediaContactsTable);
    expect(contact).toEqual({ role: "Editor", email: "preserved@example.com", sourceCheckFailureCount: 0 });
    expect(await db.select({ outcome: mediaContactSourceChecksTable.outcome }).from(mediaContactSourceChecksTable)).toEqual([{ outcome: "changed" }]);

    await __client.exec("UPDATE media_contacts SET source_check_claimed_at = NULL, source_check_claim_token = NULL");
    const [claimed] = await claimMediaContactsForReverification({ now: new Date(NOW.getTime() + 91 * 24 * 60 * 60 * 1000) });
    const outcome = await reverifyClaimedMediaContact(claimed, {
      now: new Date(NOW.getTime() + 91 * 24 * 60 * 60 * 1000),
      fetchEvidence: vi.fn().mockRejectedValue(new Error("Site returned HTTP 404")),
    });
    expect(outcome).toBe("unavailable");
    expect(await db.select({ sourceCheckFailureCount: mediaContactsTable.sourceCheckFailureCount }).from(mediaContactsTable)).toEqual([{ sourceCheckFailureCount: 1 }]);
  });

  it("discards old evidence if the stored source changes during a fetch", async () => {
    await seedContact("account-a", "changing");
    const [claimed] = await claimMediaContactsForReverification({ now: NOW });
    await __client.exec("UPDATE media_contacts SET source_url = 'https://example.com/new-source' WHERE id = 1");
    const outcome = await reverifyClaimedMediaContact(claimed, {
      now: NOW,
      fetchEvidence: vi.fn().mockResolvedValue({
        url: claimed.sourceUrl, text: "Jane changing Editor", emails: [], roleCandidates: [],
      }),
    });
    expect(outcome).toBe("lost-claim");
    expect(await db.select({ outcome: mediaContactSourceChecksTable.outcome }).from(mediaContactSourceChecksTable)).toEqual([]);
    const [replacementClaim] = await claimMediaContactsForReverification({ now: NOW });
    expect(replacementClaim.sourceUrl).toBe("https://example.com/new-source");
  });
});