import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Explicit-ID restores can leave the serial counter pointing at an occupied
 * identifier. Advance it only when its next value collides, never rewind it or
 * alter accounting rows. Missing/non-serial defaults fail closed.
 */
export async function ensureTokenUsageSequence(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`LOCK TABLE public.token_usage IN SHARE ROW EXCLUSIVE MODE`);
    await tx.execute(sql`
      DO $$
      DECLARE
        sequence_name text;
        counter bigint;
        called boolean;
        increment_by bigint;
        next_id bigint;
        highest_id bigint;
      BEGIN
        sequence_name := pg_get_serial_sequence('public.token_usage', 'id');
        IF sequence_name IS NULL THEN
          RAISE EXCEPTION 'token_usage requires a serial ID default';
        END IF;
        SELECT seqincrement INTO increment_by FROM pg_sequence WHERE seqrelid = sequence_name::regclass;
        IF increment_by <> 1 THEN
          RAISE EXCEPTION 'token_usage requires an increment-one ID sequence';
        END IF;
        EXECUTE format('SELECT last_value, is_called FROM %s', sequence_name::regclass) INTO counter, called;
        next_id := CASE WHEN called THEN counter + 1 ELSE counter END;
        IF EXISTS (SELECT 1 FROM public.token_usage WHERE id = next_id) THEN
          SELECT max(id) INTO highest_id FROM public.token_usage;
          PERFORM setval(sequence_name::regclass, greatest(counter, highest_id), true);
        END IF;
      END $$;
    `);
  });
}