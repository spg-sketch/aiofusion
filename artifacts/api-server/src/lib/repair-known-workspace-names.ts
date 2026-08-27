import {
  db,
  platformCompaniesTable,
  platformMetaTable,
} from "@workspace/db";
import { and, eq, isNull, or } from "drizzle-orm";
import { logger } from "./logger";

const BLUHALO_SLUG = "bluhalo";
const BLUHALO_COMPANY_NAME = "Bluhalo IO Ltd";
const OLD_PERSON_NAME = "Spencer Gallagher";
const BLUHALO_PROFILE_KEY = `account:profile:${BLUHALO_SLUG}`;

/**
 * Repairs the legacy Bluhalo workspace, where the owner's personal name was
 * copied into the company-name field. Conditions preserve any later edit.
 */
export async function repairKnownWorkspaceNames(): Promise<void> {
  const companyRows = await db
    .update(platformCompaniesTable)
    .set({ displayName: BLUHALO_COMPANY_NAME })
    .where(
      and(
        eq(platformCompaniesTable.slug, BLUHALO_SLUG),
        or(
          isNull(platformCompaniesTable.displayName),
          eq(platformCompaniesTable.displayName, OLD_PERSON_NAME),
        ),
      ),
    )
    .returning({ slug: platformCompaniesTable.slug });

  const [company] = await db
    .select({ slug: platformCompaniesTable.slug })
    .from(platformCompaniesTable)
    .where(eq(platformCompaniesTable.slug, BLUHALO_SLUG))
    .limit(1);
  if (!company) return;

  const [profileRow] = await db
    .select({ value: platformMetaTable.value })
    .from(platformMetaTable)
    .where(eq(platformMetaTable.key, BLUHALO_PROFILE_KEY))
    .limit(1);

  let profile: Record<string, unknown> = {};
  if (profileRow?.value) {
    try {
      const parsed = JSON.parse(profileRow.value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        profile = parsed as Record<string, unknown>;
      }
    } catch {
      profile = {};
    }
  }

  const currentDisplayName =
    typeof profile.displayName === "string" ? profile.displayName.trim() : "";
  let profileChanged = false;
  if (!currentDisplayName || currentDisplayName === OLD_PERSON_NAME) {
    const value = JSON.stringify({
      ...profile,
      displayName: BLUHALO_COMPANY_NAME,
    });
    await db
      .insert(platformMetaTable)
      .values({ key: BLUHALO_PROFILE_KEY, value })
      .onConflictDoUpdate({
        target: platformMetaTable.key,
        set: { value },
      });
    profileChanged = true;
  }

  if (companyRows.length > 0 || profileChanged) {
    logger.info(
      {
        slug: BLUHALO_SLUG,
        companyUpdated: companyRows.length > 0,
        profileUpdated: profileChanged,
      },
      "Repaired legacy workspace company name",
    );
  }
}