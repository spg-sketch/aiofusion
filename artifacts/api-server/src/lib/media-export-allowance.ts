import { createHash } from "node:crypto";
import { db, platformMetaTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

export class MediaAllowanceError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function mediaExportWindow(now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  return { day, resetsAt: new Date(`${day}T00:00:00Z`).getTime() + 86_400_000 };
}

function usedRecords(value: string) {
  const used = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(used) || used < 0 || used > 100) {
    throw new MediaAllowanceError(503, "Today's download allowance is temporarily unavailable. Please try again later.");
  }
  return used;
}

export async function mediaExportAllowance(workspace: string) {
  const { day, resetsAt } = mediaExportWindow();
  const [row] = await db.select().from(platformMetaTable).where(eq(platformMetaTable.key, `media-export:day:${workspace}:${day}`));
  return { remaining: 100 - usedRecords(row?.value ?? "0"), limit: 100, resetsAt: new Date(resetsAt).toISOString() };
}

// Only call after ownership checks and successful serialization. PostgreSQL's
// row lock serializes all workers/team members; the operation receipt and
// charge commit together. Delivery uncertainty never refunds a committed file.
export async function settleMediaExport(workspace: string, operationId: unknown, fingerprint: string, sharedCount: number) {
  if (typeof operationId !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(operationId)) {
    throw new MediaAllowanceError(400, "A valid export operation ID is required.");
  }
  const { day } = mediaExportWindow();
  const dailyKey = `media-export:day:${workspace}:${day}`;
  const receiptKey = `media-export:operation:${workspace}:${operationId}`;
  const digest = createHash("sha256").update(JSON.stringify({ fingerprint, sharedCount })).digest("hex");
  await db.transaction(async (tx) => {
    await tx.insert(platformMetaTable).values({ key: dailyKey, value: "0" }).onConflictDoNothing();
    await tx.execute(sql`SELECT key FROM platform_meta WHERE key = ${dailyKey} FOR UPDATE`);
    // A separate receipt lock also protects a retry crossing midnight.
    await tx.insert(platformMetaTable).values({ key: receiptKey, value: "" }).onConflictDoNothing();
    await tx.execute(sql`SELECT key FROM platform_meta WHERE key = ${receiptKey} FOR UPDATE`);
    const [receipt] = await tx.select().from(platformMetaTable).where(eq(platformMetaTable.key, receiptKey));
    if (receipt!.value) {
      if (receipt!.value !== digest) throw new MediaAllowanceError(409, "This export operation has changed. Start a new download.");
      return;
    }
    const [daily] = await tx.select().from(platformMetaTable).where(eq(platformMetaTable.key, dailyKey));
    const used = usedRecords(daily!.value);
    if (used + sharedCount > 100) {
      throw new MediaAllowanceError(429, `Only ${100 - used} shared records remain today. Select a smaller batch explicitly. Workspace-added records do not use this allowance.`);
    }
    await tx.update(platformMetaTable).set({ value: String(used + sharedCount) }).where(eq(platformMetaTable.key, dailyKey));
    await tx.update(platformMetaTable).set({ value: digest }).where(eq(platformMetaTable.key, receiptKey));
  });
}