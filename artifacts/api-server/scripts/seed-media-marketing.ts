#!/usr/bin/env tsx
/**
 * seed-media-marketing.ts — Seed the media database with Marketing & Advertising
 * contacts parsed from the attached CSV (Patrick's sheet).
 *
 * Usage (run once):
 *   pnpm --filter api-server seed:media-marketing
 *
 * Idempotent: outlets are skipped if a non-deleted outlet with the same
 * (case-insensitive) name already exists. Contacts are skipped if a
 * non-deleted contact with the same normalised email already exists, or
 * (when the email is blank) if a contact with the same first+last name
 * already linked to the same outlet already exists.
 *
 * accountId = null → global records, visible to all accounts (same as
 * records created by admin via the API route).
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { db, mediaOutletsTable, mediaContactsTable } from "@workspace/db";
import { eq, isNull, and, or } from "drizzle-orm";

// ── Admin account ID ──────────────────────────────────────────────────────────
// All seeded records are scoped to the platform admin account so they behave
// like admin-created records (visible only to admin and any sub-accounts the
// admin grants access to), NOT as globally-visible null-accountId records.
const ADMIN_ACCOUNT_ID = "admin";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CSV path ──────────────────────────────────────────────────────────────────

const CSV_PATH = resolve(
  __dirname,
  "../../../attached_assets/AIO_Fusion_Master_Media_Database_V2.2_050726.xlsx_-_Marketing__1783427508392.csv",
);

// ── CSV parsing ───────────────────────────────────────────────────────────────

/**
 * Simple CSV row parser that handles double-quoted fields (with embedded
 * commas). Each call processes exactly one pre-split line.
 */
function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  const len = line.length;

  while (i <= len) {
    if (i === len) {
      // Trailing comma produced an empty field at end — handled by loop below,
      // but if we arrive here without a pending comma we're done.
      break;
    }

    if (line[i] === '"') {
      // Quoted field
      i++; // skip opening quote
      let value = "";
      while (i < len) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            value += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          value += line[i++];
        }
      }
      fields.push(value);
      if (line[i] === ",") i++; // skip field separator
    } else {
      // Unquoted field — read until next comma or end-of-line
      const start = i;
      while (i < len && line[i] !== ",") i++;
      fields.push(line.slice(start, i));
      if (i < len) i++; // skip comma
    }
  }

  return fields;
}

// ── Email sanitiser ───────────────────────────────────────────────────────────

function sanitiseEmail(raw: string): string {
  // Take first address when multiple are separated by " / " or " ; "
  const first = raw.split(/\s*[\/;]\s*/)[0].trim();

  // Fix common typo: @domain,tld → @domain.tld
  const fixed = first.replace(/@([^@]+),([a-z]{2,})\b/gi, "@$1.$2");

  // Must contain exactly one @ and have at least one dot after it
  const atCount = (fixed.match(/@/g) ?? []).length;
  if (atCount !== 1) return "";
  const [, domain] = fixed.split("@");
  if (!domain || !domain.includes(".")) return "";

  return fixed.toLowerCase();
}

// ── Build notes string ────────────────────────────────────────────────────────

function buildNotes(beat: string, confidence: string, originalNotes: string): string {
  const parts: string[] = [];
  if (beat.trim()) parts.push(`Beat: ${beat.trim()}`);
  if (confidence.trim()) parts.push(`Confidence: ${confidence.trim()}`);
  if (originalNotes.trim()) parts.push(originalNotes.trim());
  return parts.join(" | ");
}

// ── Outlet key for deduplication ──────────────────────────────────────────────

/**
 * Canonical key for deduplicating outlets. Prefer the website URL (origin
 * only) so that slight name variants of the same publication collapse into
 * one row. Fall back to lowercased name when there is no website.
 */
function outletKey(website: string, name: string): string {
  if (website.trim()) {
    try {
      const url = new URL(website.trim());
      return url.origin.toLowerCase();
    } catch {
      // fall through
    }
  }
  return name.trim().toLowerCase();
}

// ── Column indices (0-based, from header row 2) ───────────────────────────────
// first_name(0), last_name(1), job_title(2), outlet name(3), email(4),
// website(5), outlet_description(6), editorial_beat(7), linkedin_url(8),
// country(9), publication_reach(10), publication_authority(11),
// journalist_authority(12), confidence(13), source_url(14),
// verified_date(15), notes(16)

const IDX = {
  firstName:      0,
  lastName:       1,
  jobTitle:       2,
  outletName:     3,
  email:          4,
  website:        5,
  description:    6,
  beat:           7,
  country:        9,
  reachBand:      10,
  confidence:     13,
  notes:          16,
} as const;

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("AIO Fusion — Seed Media Database: Marketing & Advertising");
  console.log("=".repeat(60));

  // ── Parse CSV ──────────────────────────────────────────────────────────────
  const raw = readFileSync(CSV_PATH, "utf-8");
  // Split preserving quoted newlines — but this sheet has no embedded newlines;
  // a simple line split is safe here.
  const lines = raw.split(/\r?\n/);

  // Row 0: sheet title  ("Marketing & Advertising")
  // Row 1: header row   (first_name, last_name, …)
  // Row 2+: data rows
  const dataRows = lines.slice(2).filter((l) => l.trim().length > 0);
  console.log(`\nParsed ${dataRows.length} data rows from CSV`);

  interface ContactRow {
    firstName: string;
    lastName: string;
    jobTitle: string;
    outletName: string;
    email: string;
    website: string;
    description: string;
    beat: string;
    country: string;
    reachBand: string;
    confidence: string;
    notes: string;
    key: string; // outlet dedup key
  }

  const contacts: ContactRow[] = [];
  for (const line of dataRows) {
    const cols = parseCsvRow(line);
    const name = (cols[IDX.outletName] ?? "").trim();
    if (!name) continue; // skip rows with no outlet

    contacts.push({
      firstName:   (cols[IDX.firstName]   ?? "").trim(),
      lastName:    (cols[IDX.lastName]    ?? "").trim(),
      jobTitle:    (cols[IDX.jobTitle]    ?? "").trim(),
      outletName:  name,
      email:       sanitiseEmail(cols[IDX.email] ?? ""),
      website:     (cols[IDX.website]     ?? "").trim(),
      description: (cols[IDX.description] ?? "").trim(),
      beat:        (cols[IDX.beat]        ?? "").trim(),
      country:     (cols[IDX.country]     ?? "").trim(),
      reachBand:   (cols[IDX.reachBand]   ?? "").trim(),
      confidence:  (cols[IDX.confidence]  ?? "").trim(),
      notes:       (cols[IDX.notes]       ?? "").trim(),
      key:         outletKey(cols[IDX.website] ?? "", name),
    });
  }

  console.log(`Valid rows (with outlet name): ${contacts.length}`);

  // ── Fetch existing outlets & contacts (admin-scoped only) ─────────────────
  const existingOutlets = await db
    .select({ id: mediaOutletsTable.id, name: mediaOutletsTable.name })
    .from(mediaOutletsTable)
    .where(and(
      isNull(mediaOutletsTable.deletedAt),
      eq(mediaOutletsTable.accountId, ADMIN_ACCOUNT_ID),
    ));

  const existingOutletNames = new Set(existingOutlets.map((o) => o.name.toLowerCase()));

  const existingContacts = await db
    .select({
      id: mediaContactsTable.id,
      email: mediaContactsTable.email,
      firstName: mediaContactsTable.firstName,
      lastName: mediaContactsTable.lastName,
      outletId: mediaContactsTable.outletId,
    })
    .from(mediaContactsTable)
    .where(and(
      isNull(mediaContactsTable.deletedAt),
      eq(mediaContactsTable.accountId, ADMIN_ACCOUNT_ID),
    ));

  const existingEmails = new Set(
    existingContacts
      .map((c) => c.email.trim().toLowerCase())
      .filter((e) => e.includes("@")),
  );

  console.log(
    `\nExisting in DB: ${existingOutlets.length} outlets, ${existingContacts.length} contacts`,
  );

  // ── Deduplicate outlets by key ─────────────────────────────────────────────
  // Build a map: key → first-encountered outlet data
  const outletDataMap = new Map<string, { name: string; website: string; description: string; country: string; reachBand: string }>();
  for (const c of contacts) {
    if (!outletDataMap.has(c.key)) {
      outletDataMap.set(c.key, {
        name:        c.outletName,
        website:     c.website,
        description: c.description,
        country:     c.country,
        reachBand:   c.reachBand,
      });
    }
  }

  // ── Insert outlets ─────────────────────────────────────────────────────────
  let outletsCreated = 0;
  let outletsSkipped = 0;

  // outletKey → DB id (newly inserted or pre-existing)
  const outletIdByKey = new Map<string, number>();

  // Pre-populate from existing outlets
  for (const existing of existingOutlets) {
    const k = outletKey("", existing.name);
    outletIdByKey.set(k, existing.id);
  }

  for (const [key, data] of outletDataMap) {
    // Check by normalised name (existing outlets fetched once above)
    const normName = data.name.toLowerCase();
    if (existingOutletNames.has(normName)) {
      // Find its id so contacts can be linked
      const found = existingOutlets.find((o) => o.name.toLowerCase() === normName);
      if (found) outletIdByKey.set(key, found.id);
      outletsSkipped++;
      continue;
    }

    // Also check by the key itself (website-based dedup against existing)
    if (outletIdByKey.has(key)) {
      outletsSkipped++;
      continue;
    }

    const [inserted] = await db
      .insert(mediaOutletsTable)
      .values({
        name:        data.name,
        category:    "Marketing & Advertising",
        website:     data.website,
        description: data.description,
        country:     data.country,
        reachBand:   data.reachBand,
        accountId:   ADMIN_ACCOUNT_ID,
      })
      .returning({ id: mediaOutletsTable.id });

    if (inserted) {
      outletIdByKey.set(key, inserted.id);
      existingOutletNames.add(normName);
      outletsCreated++;
    }
  }

  console.log(`\nOutlets: ${outletsCreated} created, ${outletsSkipped} skipped (already exist)`);

  // ── Insert contacts ────────────────────────────────────────────────────────
  let contactsCreated = 0;
  let contactsSkipped = 0;
  let outletOnlyRows = 0; // rows with no name → outlet already handled above

  // Build a set of (outletId + firstName + lastName) for name-based dedup
  const existingNameKeys = new Set(
    existingContacts
      .filter((c) => c.outletId)
      .map((c) => `${c.outletId}:${c.firstName.toLowerCase()}:${c.lastName.toLowerCase()}`),
  );

  for (const c of contacts) {
    // Skip rows with no first AND no last name — outlet-only rows already handled
    if (!c.firstName && !c.lastName) {
      outletOnlyRows++;
      continue;
    }

    const outletId = outletIdByKey.get(c.key) ?? null;

    // Email-based dedup
    if (c.email && existingEmails.has(c.email)) {
      contactsSkipped++;
      continue;
    }

    // Name+outlet dedup (for blank-email contacts)
    if (!c.email && outletId) {
      const nameKey = `${outletId}:${c.firstName.toLowerCase()}:${c.lastName.toLowerCase()}`;
      if (existingNameKeys.has(nameKey)) {
        contactsSkipped++;
        continue;
      }
    }

    const notes = buildNotes(c.beat, c.confidence, c.notes);

    await db.insert(mediaContactsTable).values({
      outletId,
      firstName: c.firstName,
      lastName:  c.lastName,
      role:      c.jobTitle,
      email:     c.email,
      phone:     "",
      notes,
      accountId: ADMIN_ACCOUNT_ID,
    });

    contactsCreated++;

    // Register for dedup of subsequent rows in this run
    if (c.email) existingEmails.add(c.email);
    if (outletId) {
      existingNameKeys.add(
        `${outletId}:${c.firstName.toLowerCase()}:${c.lastName.toLowerCase()}`,
      );
    }
  }

  console.log(`Contacts: ${contactsCreated} created, ${contactsSkipped} skipped (already exist)`);
  if (outletOnlyRows > 0) {
    console.log(`Outlet-only rows (no contact name): ${outletOnlyRows}`);
  }

  console.log("\n✓ Seed complete");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
