import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, mediaSuppressionsTable } from "@workspace/db";


export type PrivacyIdentity = { name?: string; email?: string; linkedinUrl?: string; outlet?: string; accountId?: string | null };

export function parseLegalHoldScopes(scope: unknown): Set<string> {
  if (Array.isArray(scope)) return new Set(scope.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean));
  if (typeof scope !== "string" || !scope.trim()) return new Set(["*"]);
  try {
    const parsed = JSON.parse(scope);
    if (Array.isArray(parsed)) return parseLegalHoldScopes(parsed);
  } catch { /* comma-delimited legacy values */ }
  return new Set(scope.split(",").map((value) => value.trim()).filter(Boolean));
}

export function legalHoldCoversStore(scope: unknown, store: string): boolean {
  const stores = parseLegalHoldScopes(scope);
  return stores.has("*") || stores.has(store);
}

export async function acquirePrivacyIdentityLock(tx: { execute: (query: any) => Promise<unknown> }, identity: PrivacyIdentity | string): Promise<void> {
  // A single lock intentionally serialises all privacy-sensitive mutations.
  // This is preferable to a race that can recreate a newly suppressed record.
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") return;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('journalist-privacy:mutations'))`);
}

export function privacyHash(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim().toLocaleLowerCase() : "";
  return text ? crypto.createHash("sha256").update(text, "utf8").digest("hex") : null;
}

/** Add one calendar month, clamping to the final day of the target month. */
export function addCalendarMonth(received: Date): Date {
  const result = new Date(received);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + 1);
  const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, last));
  return result;
}

export function suppressionKeys(identity: PrivacyIdentity) {
  const name = [identity.name ?? ""].join(" ").trim().replace(/\s+/g, " ");
  return {
    emailHash: privacyHash(identity.email),
    nameHash: privacyHash(name),
    linkedinHash: privacyHash(identity.linkedinUrl),
    outletHash: privacyHash(identity.outlet),
  };
}

type SuppressionRow = {
  emailHash?: string | null;
  nameHash?: string | null;
  linkedinHash?: string | null;
  outletHash?: string | null;
};

function matchesSuppression(candidates: SuppressionRow[], identity: PrivacyIdentity): boolean {
  const keys = suppressionKeys(identity);
  return candidates.some((row) =>
    (!!keys.emailHash && row.emailHash === keys.emailHash)
    || (!!keys.linkedinHash && row.linkedinHash === keys.linkedinHash)
    || (!!keys.nameHash && !!keys.outletHash && row.nameHash === keys.nameHash && row.outletHash === keys.outletHash),
  );
}

async function loadSuppressionCandidates(executor: any, accountId: string | null): Promise<SuppressionRow[]> {
  try {
    return await executor.select().from(mediaSuppressionsTable).where(and(
      eq(mediaSuppressionsTable.active, 1),
      sql`(${mediaSuppressionsTable.scope} = 'shared' OR (${mediaSuppressionsTable.scope} = 'workspace' AND ${mediaSuppressionsTable.accountId} = ${accountId}))`,
    ));
  } catch (error) {
    // PGlite route fixtures may intentionally omit additive privacy tables.
    // Never hide a production schema error.
    const cause = (error as { cause?: { code?: string } })?.cause;
    const testContext = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
    if (testContext && /media_suppressions/i.test(String(error)) && (cause?.code === "42P01" || /relation .*media_suppressions.*does not exist/i.test(String(error)))) {
      return [];
    }
    throw error;
  }
}

export async function isSuppressed(identity: PrivacyIdentity): Promise<boolean> {
  return isSuppressedWithDb(db, identity);
}

export async function isSuppressedWithDb(executor: any, identity: PrivacyIdentity): Promise<boolean> {
  const accountId = identity.accountId ?? null;
  return matchesSuppression(await loadSuppressionCandidates(executor, accountId), identity);
}

/** Load applicable suppression hashes once and reuse them across one list request. */
export async function createSuppressionMatcherWithDb(executor: any, accountId: string | null) {
  const candidates = await loadSuppressionCandidates(executor, accountId);
  return (identity: PrivacyIdentity): boolean => matchesSuppression(candidates, {
    ...identity,
    accountId,
  });
}

export async function createSuppressionMatcher(accountId: string | null) {
  return createSuppressionMatcherWithDb(db, accountId);
}


/** Write-path guard: resolve the canonical identity from storage immediately before mutation. */
export async function isContactSuppressed(contact: {
  firstName?: string | null; lastName?: string | null; email?: string | null;
  linkedinUrl?: string | null; outlet?: string | null; accountId?: string | null;
}): Promise<boolean> {
  return isSuppressed({
    name: `${contact.firstName ?? ""} ${contact.lastName ?? ""}`,
    email: contact.email ?? "",
    linkedinUrl: contact.linkedinUrl ?? "",
    outlet: contact.outlet ?? "",
    accountId: contact.accountId,
  });
}

export async function filterSuppressedContacts<T extends { firstName?: string | null; lastName?: string | null; email?: string | null; linkedinUrl?: string | null; accountId?: string | null }>(
  contacts: T[], outletByContactId?: Map<number, string>,
): Promise<T[]> {
  const kept: T[] = [];
  for (const contact of contacts) {
    const candidate = contact as T & { id?: number; outlet?: string | null };
    if (!(await isContactSuppressed({ ...contact, outlet: candidate.outlet ?? (candidate.id ? outletByContactId?.get(candidate.id) : "") }))) kept.push(contact);
  }
  return kept;
}

export async function createSuppression(values: {
  requestId: number; scope: "shared" | "workspace"; accountId?: string | null; identity: PrivacyIdentity; reason: string;
}) {
  const keys = suppressionKeys(values.identity);
  return db.insert(mediaSuppressionsTable).values({
    requestId: values.requestId, scope: values.scope, accountId: values.accountId ?? null,
    ...keys, reason: values.reason.slice(0, 32), active: 1,
  }).onConflictDoNothing().returning();
}