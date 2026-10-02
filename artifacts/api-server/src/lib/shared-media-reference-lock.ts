import { sql } from "drizzle-orm";
import type { db } from "@workspace/db";

const SHARED_MEDIA_REFERENCE_LOCK = "shared-media-reference-mutation";

export async function lockSharedMediaReferences(tx: Pick<typeof db, "execute">) {
  if (process.env.NODE_ENV === "test") return;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${SHARED_MEDIA_REFERENCE_LOCK}))`);
}