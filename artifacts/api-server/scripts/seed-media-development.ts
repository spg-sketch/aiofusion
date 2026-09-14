#!/usr/bin/env tsx
/**
 * Add or refresh the small synthetic Media Research fixture set:
 *   pnpm --filter @workspace/api-server run seed:media-development
 *
 * Remove fixture contacts and any fixture outlets that are no longer referenced:
 *   pnpm --filter @workspace/api-server run seed:media-development:remove
 *
 * Both package commands refuse production and Replit deployment environments.
 */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { db, mediaContactsTable, mediaOutletsTable } from "@workspace/db";
import { and, eq, inArray, isNull, like, sql } from "drizzle-orm";
import {
  assertDevelopmentSeedEnvironment,
  DEVELOPMENT_MEDIA_SAMPLES,
  MEDIA_DEV_SAMPLE_PREFIX,
  MEDIA_DEV_SOURCE_PREFIX,
} from "../src/lib/media-development-samples";

export async function removeSamples(): Promise<{ contacts: number; outlets: number }> {
  return db.transaction(async (tx) => {
    if (process.env.NODE_ENV !== "test") {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('media-development-samples-v1'))`);
    }
    const contacts = await tx.delete(mediaContactsTable)
      .where(like(mediaContactsTable.sourceRef, `${MEDIA_DEV_SOURCE_PREFIX}%`))
      .returning({ id: mediaContactsTable.id });
    const sampleOutlets = await tx.select({ id: mediaOutletsTable.id }).from(mediaOutletsTable)
      .where(and(
        isNull(mediaOutletsTable.accountId),
        like(mediaOutletsTable.name, `${MEDIA_DEV_SAMPLE_PREFIX}%`),
      ));
    const referenced = sampleOutlets.length
      ? await tx.select({ outletId: mediaContactsTable.outletId }).from(mediaContactsTable)
        .where(inArray(mediaContactsTable.outletId, sampleOutlets.map((outlet) => outlet.id)))
      : [];
    const referencedIds = new Set(referenced.map((row) => row.outletId).filter((id): id is number => id !== null));
    const removableIds = sampleOutlets.map((outlet) => outlet.id).filter((id) => !referencedIds.has(id));
    const outlets = removableIds.length
      ? await tx.delete(mediaOutletsTable).where(inArray(mediaOutletsTable.id, removableIds)).returning({ id: mediaOutletsTable.id })
      : [];
    return { contacts: contacts.length, outlets: outlets.length };
  });
}

export async function seedSamples(): Promise<{ contacts: number; outlets: number }> {
  return db.transaction(async (tx) => {
    if (process.env.NODE_ENV !== "test") {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('media-development-samples-v1'))`);
    }
    const wantedRefs = DEVELOPMENT_MEDIA_SAMPLES.map((entry) => entry.contact.sourceRef);
    const existingContacts = await tx.select({ id: mediaContactsTable.id, sourceRef: mediaContactsTable.sourceRef })
      .from(mediaContactsTable).where(inArray(mediaContactsTable.sourceRef, wantedRefs));
    const contactByRef = new Map(existingContacts.map((row) => [row.sourceRef, row.id]));
    let outletsChanged = 0;
    let contactsChanged = 0;

    for (const entry of DEVELOPMENT_MEDIA_SAMPLES) {
      const [existingOutlet] = await tx.select({ id: mediaOutletsTable.id }).from(mediaOutletsTable)
        .where(and(eq(mediaOutletsTable.name, entry.outlet.name), isNull(mediaOutletsTable.accountId))).limit(1);
      const outletValues = { ...entry.outlet, accountId: null, deletedAt: null };
      const [outlet] = existingOutlet
        ? await tx.update(mediaOutletsTable).set(outletValues).where(eq(mediaOutletsTable.id, existingOutlet.id)).returning({ id: mediaOutletsTable.id })
        : await tx.insert(mediaOutletsTable).values(outletValues).returning({ id: mediaOutletsTable.id });
      outletsChanged++;

      const contactValues = {
        ...entry.contact,
        outletId: outlet.id,
        accountId: null,
        deletedAt: null,
        updatedAt: new Date(),
      };
      const contactId = contactByRef.get(entry.contact.sourceRef);
      if (contactId) {
        await tx.update(mediaContactsTable).set(contactValues).where(eq(mediaContactsTable.id, contactId));
      } else {
        await tx.insert(mediaContactsTable).values(contactValues);
      }
      contactsChanged++;
    }
    return { contacts: contactsChanged, outlets: outletsChanged };
  });
}

async function main(): Promise<void> {
  assertDevelopmentSeedEnvironment();
  const remove = process.argv.slice(2).includes("--remove");
  const result = remove ? await removeSamples() : await seedSamples();
  console.log(remove
    ? `Removed ${result.contacts} development sample contacts and ${result.outlets} outlets.`
    : `Seeded or refreshed ${result.contacts} development sample contacts and ${result.outlets} outlets.`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}