import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

// Ensures the FK constraint from platform_companies.slug → platform_accounts.username
// exists with ON DELETE CASCADE. This makes deleting a platform_accounts row
// automatically delete the matching platform_companies row, which in turn
// cascades to platform_memberships via its existing FK on company_id.
//
// Idempotent - the DO block checks pg_constraint before adding so repeated
// server restarts are safe.
export async function ensurePlatformCompanyCascade(): Promise<void> {
  try {
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'platform_companies_slug_accounts_fk'
            AND conrelid = 'platform_companies'::regclass
        ) THEN
          ALTER TABLE platform_companies
            ADD CONSTRAINT platform_companies_slug_accounts_fk
            FOREIGN KEY (slug)
            REFERENCES platform_accounts(username)
            ON DELETE CASCADE;
        END IF;
      END $$;
    `);
    logger.info("platform_companies → platform_accounts cascade FK ensured");
  } catch (err: unknown) {
    logger.error({ err }, "Failed to ensure platform_companies cascade FK (non-fatal)");
  }
}
