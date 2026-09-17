import { db, platformMetaTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export const MEDIA_DISCOVERY_INSTRUCTIONS_KEY = "media-db:discovery-instructions";

/**
 * Adapted from the original media-database research brief. Workbook-specific
 * operations (private paths, tab cycles, and inferred emails) are intentionally
 * excluded from the safe web-search default.
 */
export const DEFAULT_MEDIA_DISCOVERY_INSTRUCTIONS = `House research guidance for media discovery:

Treat every result as an editorial candidate, not a verified contact or a guaranteed placement. Prioritise senior editorial decision-makers and beat reporters who are demonstrably relevant to the supplied story, while excluding commercial, sales, marketing, events, administrative and managerial-only roles.

Use current, public evidence from the outlet's own masthead, team or author page, a current staff profile, or a recent byline. Prefer the outlet and team source when available, then a current byline. Keep the outlet, journalist, role and demonstrated beat tied to the source that supports them. Explain briefly what each source proves.

A person's identity and an email address are separate facts. Never infer, construct, guess or autocomplete an email address from a name, an outlet convention, nearby text, or training knowledge. Only include an email when that exact address is visible in the current public evidence; otherwise leave it blank. Never construct a LinkedIn URL.

Always provide the exact public source URL for each candidate. Do not invent a source, authority, reach, readership, publication history, role, beat, quote, placement, or freshness date. Do not claim that a candidate is verified, interested, endorsed, available, or likely to publish. Do not invent a numeric authority or reach score; say when it is not publicly available.

Record the journalist's location only when the source establishes it. If the location is unknown, leave it blank rather than inferring it from the outlet, name, timezone, or language. Keep countries and markets distinct when the evidence supports that distinction.

Research only the requested story, sectors and markets. Do not assume a complete sector universe, a fixed number of outlets, a workbook, a daily or rolling cycle, a private file, a local Windows path, or a particular number of sectors. Return fewer candidates when evidence is weak rather than filling a quota. Do not use people-search sites, data brokers, scraped contact databases, private social profiles or inaccessible sources.

Keep discovery observations separate from any stored media-database contacts. A source observation can be stale or wrong and must not overwrite user-owned contact data. Use cautious confidence labels that describe evidence quality, and flag uncertainty or a follow-up check instead of presenting an inference as fact.`;

export type MediaDiscoveryInstructions = {
  instructions: string;
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

export class MediaDiscoveryInstructionsStorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MediaDiscoveryInstructionsStorageError";
  }
}

export class MediaDiscoveryInstructionsConflictError extends Error {
  constructor() {
    super("Media discovery instructions were updated by another request.");
    this.name = "MediaDiscoveryInstructionsConflictError";
  }
}

function invalidStoredValue(message: string, cause?: unknown): MediaDiscoveryInstructionsStorageError {
  return new MediaDiscoveryInstructionsStorageError(message, cause === undefined ? undefined : { cause });
}

function parseStoredInstructions(raw: string): MediaDiscoveryInstructions {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw invalidStoredValue("Stored media discovery instructions are not valid JSON.", error);
  }
  if (!parsed || typeof parsed !== "object") {
    throw invalidStoredValue("Stored media discovery instructions have an invalid shape.");
  }
  const value = parsed as Record<string, unknown>;
  if (
    typeof value.instructions !== "string"
    || value.instructions.trim().length < 50
    || value.instructions.length > 12000
    || typeof value.version !== "number"
    || !Number.isInteger(value.version)
    || value.version < 1
    || (value.updatedAt !== null && typeof value.updatedAt !== "string")
    || (value.updatedBy !== null && typeof value.updatedBy !== "string")
  ) {
    throw invalidStoredValue("Stored media discovery instructions have invalid fields.");
  }
  return {
    instructions: value.instructions,
    version: value.version,
    updatedAt: value.updatedAt as string | null,
    updatedBy: value.updatedBy as string | null,
  };
}

function validateInstructions(instructions: unknown): string {
  if (typeof instructions !== "string") throw new TypeError("instructions must be a string");
  const trimmed = instructions.trim();
  if (trimmed.length < 50) throw new RangeError("instructions must be at least 50 characters");
  if (trimmed.length > 12000) throw new RangeError("instructions must be no more than 12000 characters");
  return trimmed;
}

function validateVersion(version: unknown): number {
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) {
    throw new TypeError("version must be a non-negative integer");
  }
  return version;
}

/** Missing storage is the intentional version-zero default; GET never writes it. */
export async function getMediaDiscoveryInstructions(): Promise<MediaDiscoveryInstructions> {
  let rows;
  try {
    rows = await db
      .select({ value: platformMetaTable.value })
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, MEDIA_DISCOVERY_INSTRUCTIONS_KEY))
      .limit(1);
  } catch (error) {
    throw new MediaDiscoveryInstructionsStorageError(
      "Could not read media discovery instructions from storage.",
      { cause: error },
    );
  }
  if (rows.length === 0) {
    return {
      instructions: DEFAULT_MEDIA_DISCOVERY_INSTRUCTIONS,
      version: 0,
      updatedAt: null,
      updatedBy: null,
    };
  }
  return parseStoredInstructions(rows[0].value);
}

/** Save with a serialized-value compare-and-swap, including the first insert. */
export async function updateMediaDiscoveryInstructions(
  instructions: unknown,
  expectedVersion: unknown,
  updatedBy: string,
): Promise<MediaDiscoveryInstructions> {
  const cleanInstructions = validateInstructions(instructions);
  const version = validateVersion(expectedVersion);
  const actor = updatedBy.trim().slice(0, 320);
  if (!actor) throw new TypeError("updatedBy must not be empty");
  const next: MediaDiscoveryInstructions = {
    instructions: cleanInstructions,
    version: version + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };
  const serializedNext = JSON.stringify(next);

  try {
    return await db.transaction(async (tx) => {
      const rows = await tx
        .select({ value: platformMetaTable.value })
        .from(platformMetaTable)
        .where(eq(platformMetaTable.key, MEDIA_DISCOVERY_INSTRUCTIONS_KEY))
        .limit(1);
      if (rows.length === 0) {
        if (version !== 0) throw new MediaDiscoveryInstructionsConflictError();
        const inserted = await tx
          .insert(platformMetaTable)
          .values({ key: MEDIA_DISCOVERY_INSTRUCTIONS_KEY, value: serializedNext })
          .onConflictDoNothing({ target: platformMetaTable.key })
          .returning({ key: platformMetaTable.key });
        if (inserted.length === 0) throw new MediaDiscoveryInstructionsConflictError();
        return next;
      }
      const current = parseStoredInstructions(rows[0].value);
      if (current.version !== version) throw new MediaDiscoveryInstructionsConflictError();
      const changed = await tx
        .update(platformMetaTable)
        .set({ value: serializedNext })
        .where(and(
          eq(platformMetaTable.key, MEDIA_DISCOVERY_INSTRUCTIONS_KEY),
          eq(platformMetaTable.value, rows[0].value),
        ))
        .returning({ key: platformMetaTable.key });
      if (changed.length === 0) throw new MediaDiscoveryInstructionsConflictError();
      return next;
    });
  } catch (error) {
    if (
      error instanceof MediaDiscoveryInstructionsConflictError
      || error instanceof MediaDiscoveryInstructionsStorageError
      || error instanceof TypeError
      || error instanceof RangeError
    ) throw error;
    throw new MediaDiscoveryInstructionsStorageError(
      "Could not save media discovery instructions to storage.",
      { cause: error },
    );
  }
}