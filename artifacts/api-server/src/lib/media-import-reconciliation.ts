import crypto from "node:crypto";
import {
  buildMediaContactNotes,
  mediaOutletKey,
  normaliseMediaOutletName,
} from "./media-csv-import";
import type { MediaImportRow } from "./media-csv-import";

/**
 * This module deliberately contains no database access.  Both the preview and
 * commit paths use the same planner so that a preview can never claim a row is
 * safe to import and then apply a different identity rule during commit.
 */

export type ImportOutletIdentity = {
  id: number;
  name: string;
  website: string;
  category?: string;
  description?: string;
  country?: string;
  reachBand?: string;
};

export type ImportContactIdentity = {
  id?: number;
  outletId: number | null;
  firstName: string;
  lastName: string;
  email: string;
  role?: string;
  linkedinUrl?: string;
  sourceUrl?: string;
  geography?: string;
  sourceRef?: string;
  publicationReach?: string;
  publicationAuthority?: string;
  journalistAuthority?: string;
  confidence?: string;
  reviewNotes?: string;
  notes?: string;
  beats?: string[];
  sectors?: string[];
  provenance?: Record<string, unknown>;
};

export type ImportRowOutcomeStatus =
  | "new"
  | "refreshed"
  | "unchanged"
  | "conflicted"
  | "duplicate"
  | "publication"
  | "invalid";

export type ImportRowConflict = {
  kind: "identity" | "override";
  field?: string;
  message: string;
  existingContactId?: number;
  sourceRow: number;
  conflictingSourceRow?: number;
  conflictingSheetName?: string;
};

export type ImportRowOutcome = {
  sourceRow: number;
  sheetName?: string;
  status: ImportRowOutcomeStatus;
  contactId?: number;
  changedFields?: string[];
  conflicts: ImportRowConflict[];
};

export type ImportSourceSnapshot = {
  sheetName?: string;
  sourceRow: number;
  sourceRef: string;
  rawEmail?: string;
  rawMetadata?: Record<string, string>;
  country?: string;
};

export type ImportAggregate = {
  row: MediaImportRow;
  sourceRows: number[];
  sourceSnapshots: ImportSourceSnapshot[];
  sectors: string[];
  beats: string[];
  rawEmails: string[];
  linkedinUrls: string[];
};

export type ImportMatch = {
  aggregate: ImportAggregate;
  contact: ImportContactIdentity;
  changedFields: string[];
  overriddenFields: string[];
};

export type ImportReconciliation = {
  importRows: Array<{ row: MediaImportRow; outletRef: string; aggregate: ImportAggregate }>;
  publicationRows: Array<{
    row: MediaImportRow;
    outletRef: string;
    changedFields: string[];
    status: "new" | "refreshed" | "unchanged";
  }>;
  matches: ImportMatch[];
  outcomes: ImportRowOutcome[];
  counts: {
    new: number;
    refreshed: number;
    unchanged: number;
    conflicted: number;
    duplicate: number;
    invalid: number;
    outletRefreshed: number;
    outletUnchanged: number;
  };
  duplicatesSkipped: number;
  matchedExisting: number;
  outletCount: number;
  newOutletCount: number;
  expectedMutations: {
    outletsCreated: number;
    outletsUpdated: number;
    outletsUnchanged: number;
    contactsCreated: number;
    contactsMatched: number;
    publicationsProcessed: number;
  };
};

export type ReconcileMediaImportOptions = {
  selectedCategory?: string;
};

export type ImportOutletMetadata = {
  category: string;
  description: string;
  country: string;
  reachBand: string;
};

export function importedOutletMetadata(
  row: MediaImportRow,
  selectedCategory = "",
): ImportOutletMetadata {
  return {
    category: selectedCategory.trim() || row.sector?.trim() || "",
    description: row.description.trim(),
    country: row.country.trim(),
    reachBand: row.reachBand.trim(),
  };
}

export type ImportDimensionCounts = {
  byRecordType: Record<string, number>;
  bySector: Record<string, number>;
  byRecordTypeAndSector: Record<string, Record<string, number>>;
};

export function importDimensionCounts(rows: MediaImportRow[]): ImportDimensionCounts {
  const byRecordType: Record<string, number> = {};
  const bySector: Record<string, number> = {};
  const byRecordTypeAndSector: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    const recordType = row.recordType ?? "contact";
    const sector = row.sector?.trim() || "Unspecified";
    byRecordType[recordType] = (byRecordType[recordType] ?? 0) + 1;
    bySector[sector] = (bySector[sector] ?? 0) + 1;
    byRecordTypeAndSector[recordType] ??= {};
    byRecordTypeAndSector[recordType][sector] = (byRecordTypeAndSector[recordType][sector] ?? 0) + 1;
  }
  return { byRecordType, bySector, byRecordTypeAndSector };
}

const IMPORT_COMPARISON_FIELDS = [
  "role",
  "email",
  "linkedinUrl",
  "sourceUrl",
  "geography",
  "publicationReach",
  "publicationAuthority",
  "journalistAuthority",
  "confidence",
  "reviewNotes",
  "beats",
  "sectors",
] as const;

function normalise(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normaliseUrl(value: unknown): string {
  const raw = normalise(value);
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

function strongLinkedInIdentity(value: unknown): string {
  const raw = String(value ?? "").trim();
  // Numeric/source-reference values occur in some workbook LinkedIn columns;
  // they are provenance, not stable person identities. Company/showcase URLs
  // identify publications, not individual contacts.
  if (!raw || !/linkedin(?:\.com|:\/\/).*\/(?:in|pub)\//i.test(raw)) return "";
  return normaliseUrl(raw);
}

function splitValues(value: string | undefined): string[] {
  return value
    ? value.split(/[;,|]/).map((item) => item.trim()).filter(Boolean)
    : [];
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function contactNameKey(outletRef: string, row: Pick<MediaImportRow, "firstName" | "lastName">): string {
  return `${outletRef}:${normalise(row.firstName)}:${normalise(row.lastName)}`;
}

function contactNameKeyExisting(outletRef: string, contact: ImportContactIdentity): string {
  return `${outletRef}:${normalise(contact.firstName)}:${normalise(contact.lastName)}`;
}

function compoundImportIdentityKey(row: Pick<MediaImportRow, "outletName" | "firstName" | "lastName">): string {
  const outlet = normaliseMediaOutletName(row.outletName);
  const firstName = normalise(row.firstName);
  const lastName = normalise(row.lastName);
  return outlet && (firstName || lastName)
    ? `compound:${outlet}:${firstName}:${lastName}`
    : "";
}

function rawEmailFor(row: MediaImportRow): string {
  // rawEmail is supplied by the parser when available.  The fallback keeps
  // this helper compatible with the original parser contract.
  return String((row as MediaImportRow & { rawEmail?: string }).rawEmail ?? row.email ?? "").trim();
}

function sourceSnapshotFor(row: MediaImportRow): ImportSourceSnapshot {
  return {
    ...(row.sheetName ? { sheetName: row.sheetName } : {}),
    sourceRow: row.sourceRow,
    sourceRef: `${row.sheetName ?? "CSV"}:${row.sourceRow}`,
    ...(rawEmailFor(row) ? { rawEmail: rawEmailFor(row) } : {}),
    ...(row.rawMetadata ? { rawMetadata: row.rawMetadata } : {}),
    ...(row.country ? { country: row.country } : {}),
  };
}

function rowHasIdentity(row: MediaImportRow): boolean {
  return Boolean(row.outletName?.trim() && (row.firstName?.trim() || row.lastName?.trim() || row.email?.trim()));
}

export function isNumericOnlyJournalistName(firstName: string | null | undefined, lastName: string | null | undefined): boolean {
  const name = `${firstName ?? ""} ${lastName ?? ""}`.replace(/\s+/g, "");
  return /^\d+$/.test(name);
}

/**
 * Detect numeric identifiers in a person's name fields without interpreting
 * numeric content elsewhere in a contact or publication record as identity.
 */
export function hasNumericJournalistNameIdentifier(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): boolean {
  return [firstName, lastName].some((value) => {
    const field = String(value ?? "");
    return (/^\d+$/.test(field.replace(/\s+/g, "")) && field.trim().length > 0)
      || /(?<![A-Za-z0-9])\d{4}(?![A-Za-z0-9])/.test(field);
  });
}

function fieldValue(row: MediaImportRow, field: string, aggregate: ImportAggregate): unknown {
  switch (field) {
    case "beats": return aggregate.beats;
    case "sectors": return aggregate.sectors;
    case "geography": return row.country;
    case "email": return row.email;
    default: return row[field as keyof MediaImportRow];
  }
}

function contactValue(contact: ImportContactIdentity, field: string): unknown {
  return contact[field as keyof ImportContactIdentity];
}

function isDifferent(field: string, incoming: unknown, existing: unknown): boolean {
  if (field === "beats" || field === "sectors") {
    return JSON.stringify(unique(Array.isArray(incoming) ? incoming as string[] : []))
      !== JSON.stringify(unique(Array.isArray(existing) ? existing as string[] : []));
  }
  // A blank source value is not an instruction to erase a curated value.
  if (incoming === undefined || incoming === null
    || (typeof incoming === "string" && !incoming.trim())) return false;
  return normalise(incoming) !== normalise(existing);
}

function identityConflict(
  row: MediaImportRow,
  contact: ImportContactIdentity,
  sourceRow: number,
  rowOutletRef: string,
  outletRefById: Map<number, string>,
): ImportRowConflict | null {
  const rowEmail = normalise(row.email);
  const existingEmail = normalise(contact.email);

  if (row.firstName.trim() && contact.firstName.trim() && normalise(row.firstName) !== normalise(contact.firstName)) {
    return {
      kind: "identity",
      field: "name",
      message: "The same email address identifies a different first name.",
      existingContactId: contact.id,
      sourceRow,
    };
  }
  if (row.lastName.trim() && contact.lastName.trim() && normalise(row.lastName) !== normalise(contact.lastName)) {
    return {
      kind: "identity",
      field: "name",
      message: "The same email address identifies a different last name.",
      existingContactId: contact.id,
      sourceRow,
    };
  }
  const existingOutletRef = contact.outletId ? outletRefById.get(contact.outletId) : undefined;
  if ((contact.outletId === null || outletRefById.has(contact.outletId))
    && existingOutletRef !== rowOutletRef) {
    return {
      kind: "identity",
      field: "outlet",
      message: "The same email address identifies a different outlet.",
      existingContactId: contact.id,
      sourceRow,
    };
  }
  if (rowEmail && existingEmail && rowEmail !== existingEmail) {
    return {
      kind: "identity",
      field: "email",
      message: "The same named contact and outlet has a different email address.",
      existingContactId: contact.id,
      sourceRow,
    };
  }
  // A changed LinkedIn URL is source refresh data, not by itself an identity
  // conflict.  Ambiguous existing LinkedIn matches are rejected before this
  // helper is called; a single email/name match may therefore refresh it.
  return null;
}

type OutletRefs = {
  byKey: Map<string, Set<string>>;
  byNamedName: Map<string, Set<string>>;
  ambiguousNames: Set<string>;
  byId: Map<number, string>;
  byRef: Map<string, ImportOutletIdentity>;
};

function buildOutletRefs(existingOutlets: ImportOutletIdentity[]): OutletRefs {
  const byKey = new Map<string, Set<string>>();
  const byNamedName = new Map<string, Set<string>>();
  const allRefsByName = new Map<string, Set<string>>();
  const byId = new Map<number, string>();
  const byRef = new Map<string, ImportOutletIdentity>();
  for (const outlet of existingOutlets) {
    const ref = `existing:${outlet.id}`;
    const key = mediaOutletKey(outlet.name, outlet.website);
    const nameKey = normaliseMediaOutletName(outlet.name);
    byKey.set(key, new Set([...(byKey.get(key) ?? []), ref]));
    allRefsByName.set(nameKey, new Set([...(allRefsByName.get(nameKey) ?? []), ref]));
    if (outlet.website.trim()) {
      byNamedName.set(nameKey, new Set([...(byNamedName.get(nameKey) ?? []), ref]));
    }
    byId.set(outlet.id, ref);
    byRef.set(ref, outlet);
  }
  const ambiguousNames = new Set<string>();
  for (const [nameKey, refs] of allRefsByName) {
    if (refs.size > 1) ambiguousNames.add(nameKey);
  }
  return { byKey, byNamedName, ambiguousNames, byId, byRef };
}

function aggregateRows(rows: MediaImportRow[], indices: number[]): ImportAggregate {
  const row = { ...rows[indices[0]!]! };
  return {
    row,
    sourceRows: indices.map((index) => rows[index]!.sourceRow),
    sourceSnapshots: indices.map((index) => sourceSnapshotFor(rows[index]!)),
    sectors: unique(indices.flatMap((index) => rows[index]!.sector ? [rows[index]!.sector!] : [])),
    beats: unique(indices.flatMap((index) => splitValues(rows[index]!.beat))),
    rawEmails: unique(indices.map((index) => rawEmailFor(rows[index]!))),
    linkedinUrls: unique(indices.map((index) => rows[index]!.linkedinUrl ?? "")),
  };
}

const AGGREGATE_SCALAR_FIELDS: Array<keyof MediaImportRow> = [
  "sector",
  "recordType",
  "firstName",
  "lastName",
  "role",
  "outletName",
  "email",
  "website",
  "description",
  "beat",
  "country",
  "reachBand",
  "confidence",
  "notes",
  "linkedinUrl",
  "sourceUrl",
  "verifiedDate",
  "publicationAuthority",
  "journalistAuthority",
  "reviewNotes",
  "rawEmail",
];

function deterministicScalarValue(left: unknown, right: unknown): string {
  const leftValue = String(left ?? "").trim();
  const rightValue = String(right ?? "").trim();
  if (!leftValue) return rightValue;
  if (!rightValue) return leftValue;
  return [leftValue, rightValue]
    .sort((a, b) => normalise(a).localeCompare(normalise(b)) || a.localeCompare(b))[0]!;
}

function sourceCoordinate(row: Pick<MediaImportRow, "sheetName" | "sourceRow">): string {
  return `${row.sheetName ?? ""}:${String(row.sourceRow).padStart(10, "0")}`;
}

function mergeAggregateRow(primary: MediaImportRow, next: MediaImportRow): MediaImportRow {
  const merged = { ...primary };
  for (const field of AGGREGATE_SCALAR_FIELDS) {
    const current = merged[field];
    const incoming = next[field];
    if (current === undefined && incoming === undefined) continue;
    (merged as Record<string, unknown>)[field] = deterministicScalarValue(current, incoming);
  }
  const rawMetadata = { ...(primary.rawMetadata ?? {}) };
  for (const [key, value] of Object.entries(next.rawMetadata ?? {})) {
    rawMetadata[key] = deterministicScalarValue(rawMetadata[key], value);
  }
  if (Object.keys(rawMetadata).length) merged.rawMetadata = rawMetadata;
  if (sourceCoordinate(next) < sourceCoordinate(primary)) {
    merged.sourceRow = next.sourceRow;
    merged.sheetName = next.sheetName;
  }
  return merged;
}

function finaliseAggregate(aggregate: ImportAggregate): void {
  aggregate.sourceRows.sort((left, right) => left - right);
  aggregate.sourceSnapshots.sort((left, right) =>
    `${left.sheetName ?? ""}:${String(left.sourceRow).padStart(10, "0")}`
      .localeCompare(`${right.sheetName ?? ""}:${String(right.sourceRow).padStart(10, "0")}`));
  aggregate.sectors.sort((left, right) => normalise(left).localeCompare(normalise(right)));
  aggregate.beats.sort((left, right) => normalise(left).localeCompare(normalise(right)));
  aggregate.rawEmails.sort((left, right) => normalise(left).localeCompare(normalise(right)));
  aggregate.linkedinUrls.sort((left, right) => normalise(left).localeCompare(normalise(right)));
}

function aggregateConflict(
  first: MediaImportRow,
  next: MediaImportRow,
): { field: "email" | "linkedinUrl" | "name" | "outlet"; message: string } | null {
  if (first.firstName.trim() && next.firstName.trim() && normalise(first.firstName) !== normalise(next.firstName)
    || first.lastName.trim() && next.lastName.trim() && normalise(first.lastName) !== normalise(next.lastName)) {
    return { field: "name", message: "Rows with the same email address contain different contact names." };
  }
  if (normalise(first.outletName) !== normalise(next.outletName)
    || (first.website.trim() && next.website.trim()
      && mediaOutletKey(first.outletName, first.website) !== mediaOutletKey(next.outletName, next.website))) {
    return { field: "outlet", message: "Rows with the same email address identify different outlets." };
  }
  const firstEmail = normalise(first.email);
  const nextEmail = normalise(next.email);
  if (firstEmail && nextEmail && firstEmail !== nextEmail) {
    return { field: "email", message: "Rows with the same contact name and outlet contain different email addresses." };
  }
  const firstLinkedIn = strongLinkedInIdentity(first.linkedinUrl);
  const nextLinkedIn = strongLinkedInIdentity(next.linkedinUrl);
  if (firstLinkedIn && nextLinkedIn && firstLinkedIn !== nextLinkedIn) {
    return { field: "linkedinUrl", message: "Rows with the same contact name and outlet contain different LinkedIn URLs." };
  }
  return null;
}

type PreflightIdentityConflict = {
  conflictingIndex: number;
  field: "email" | "linkedinUrl" | "name" | "outlet";
  message: string;
};

type PreflightIdentityPlan = {
  conflicts: Map<number, PreflightIdentityConflict>;
  componentByIndex: Map<number, number>;
};

/**
 * Identity contradictions are decided before any row can become a new
 * contact or be matched to an existing contact.  Otherwise a source-order
 * dependent plan can retain the first row as "new" and quarantine only the
 * later row.  Email, LinkedIn and compound outlet+person buckets are unioned
 * so a contradiction connected through any identity signal quarantines the
 * complete group.
 */
function preflightIdentityContradictions(rows: MediaImportRow[]): PreflightIdentityPlan {
  const parent = rows.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[index] !== index) {
      const next = parent[index]!;
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };
  const firstByIdentity = new Map<string, number>();
  rows.forEach((row, index) => {
    const email = normalise(row.email);
    const linkedin = strongLinkedInIdentity(row.linkedinUrl);
    const compound = compoundImportIdentityKey(row);
    for (const identity of [
      email ? `email:${email}` : "",
      linkedin ? `linkedin:${linkedin}` : "",
      compound,
    ]) {
      if (!identity) continue;
      const prior = firstByIdentity.get(identity);
      if (prior === undefined) firstByIdentity.set(identity, index);
      else union(prior, index);
    }
  });

  const groups = new Map<number, number[]>();
  const componentByIndex = new Map<number, number>();
  rows.forEach((_, index) => {
    const root = find(index);
    componentByIndex.set(index, root);
    groups.set(root, [...(groups.get(root) ?? []), index]);
  });
  const conflicts = new Map<number, PreflightIdentityConflict>();
  for (const indices of groups.values()) {
    type GroupConflict = {
      firstIndex: number;
      secondIndex: number;
      field: PreflightIdentityConflict["field"];
      message: string;
    };
    const firstNames = new Map<string, number>();
    const lastNames = new Map<string, number>();
    const outletNames = new Map<string, number>();
    const namedOutletKeys = new Map<string, number>();
    const emails = new Map<string, number>();
    const linkedIns = new Map<string, number>();
    for (const index of indices) {
      const row = rows[index]!;
      const firstName = normalise(row.firstName);
      const lastName = normalise(row.lastName);
      const outletName = normalise(row.outletName);
      const email = normalise(row.email);
      const linkedin = strongLinkedInIdentity(row.linkedinUrl);
      if (firstName && !firstNames.has(firstName)) firstNames.set(firstName, index);
      if (lastName && !lastNames.has(lastName)) lastNames.set(lastName, index);
      if (outletName && !outletNames.has(outletName)) outletNames.set(outletName, index);
      if (row.website.trim()) {
        const key = mediaOutletKey(row.outletName, row.website);
        if (!namedOutletKeys.has(key)) namedOutletKeys.set(key, index);
      }
      if (email && !emails.has(email)) emails.set(email, index);
      if (linkedin && !linkedIns.has(linkedin)) linkedIns.set(linkedin, index);
    }
    const conflictingValues = (
      values: Map<string, number>,
      field: PreflightIdentityConflict["field"],
      message: string,
    ): GroupConflict | null => {
      if (values.size < 2) return null;
      const entries = [...values.values()];
      return {
        firstIndex: entries[0]!,
        secondIndex: entries[1]!,
        field,
        message,
      };
    };
    const detectedConflict = conflictingValues(
      firstNames,
      "name",
      "Rows with the same identity contain different first names.",
    )
      ?? conflictingValues(lastNames, "name", "Rows with the same identity contain different last names.")
      ?? conflictingValues(outletNames, "outlet", "Rows with the same identity identify different outlets.")
      ?? conflictingValues(namedOutletKeys, "outlet", "Rows with the same identity identify different outlet domains.")
      ?? conflictingValues(emails, "email", "Rows with the same LinkedIn identity contain different email addresses.")
      ?? conflictingValues(linkedIns, "linkedinUrl", "Rows with the same identity contain different LinkedIn URLs.");
    if (detectedConflict) {
      for (const index of indices) {
        conflicts.set(index, {
          conflictingIndex: index === detectedConflict.firstIndex
            ? detectedConflict.secondIndex
            : detectedConflict.firstIndex,
          field: detectedConflict.field,
          message: detectedConflict.message,
        });
      }
    }
  }
  return { conflicts, componentByIndex };
}

/**
 * Reconcile an input workbook against one collection.  Named identities use
 * the normalized publication name and canonical domain together.  A blank
 * domain is treated as a name wildcard only when exactly one named outlet can
 * satisfy it.
 */
export function reconcileMediaImport(
  rows: MediaImportRow[],
  existingOutlets: ImportOutletIdentity[],
  existingContacts: ImportContactIdentity[],
  overrides = new Set<string>(),
  options: ReconcileMediaImportOptions = {},
): ImportReconciliation {
  const {
    byKey: outletRefsByKey,
    byNamedName: outletRefsByNamedName,
    ambiguousNames: ambiguousExistingOutletNames,
    byId: outletRefById,
    byRef: outletByRef,
  } = buildOutletRefs(existingOutlets);
  const emailByContact = new Map<string, ImportContactIdentity[]>();
  const linkedinByContact = new Map<string, ImportContactIdentity[]>();
  const nameByContact = new Map<string, ImportContactIdentity[]>();
  for (const contact of existingContacts) {
    const email = normalise(contact.email);
    if (email) emailByContact.set(email, [...(emailByContact.get(email) ?? []), contact]);
    const linkedin = strongLinkedInIdentity(contact.linkedinUrl);
    if (linkedin) linkedinByContact.set(linkedin, [...(linkedinByContact.get(linkedin) ?? []), contact]);
    const outletRef = contact.outletId ? outletRefById.get(contact.outletId) : undefined;
    if (outletRef && (contact.firstName.trim() || contact.lastName.trim())) {
      const key = contactNameKeyExisting(outletRef, contact);
      nameByContact.set(key, [...(nameByContact.get(key) ?? []), contact]);
    }
  }

  const outcomes: ImportRowOutcome[] = [];
  const counts = {
    new: 0,
    refreshed: 0,
    unchanged: 0,
    conflicted: 0,
    duplicate: 0,
    invalid: 0,
    outletRefreshed: 0,
    outletUnchanged: 0,
  };
  const importRows: Array<{ row: MediaImportRow; outletRef: string; aggregate: ImportAggregate }> = [];
  const publicationRows: Array<{
    row: MediaImportRow;
    outletRef: string;
    changedFields: string[];
    status: "new" | "refreshed" | "unchanged";
  }> = [];
  const matches: ImportMatch[] = [];
  type PendingContact = { aggregate: ImportAggregate; outcome: ImportRowOutcome; outletRef: string };
  const aggregateByKey = new Map<string, PendingContact>();
  const namedAggregateByKey = new Map<string, PendingContact>();
  const duplicateOutcomes = new Map<ImportAggregate, ImportRowOutcome[]>();
  let duplicatesSkipped = 0;
  let matchedExisting = 0;
  const preflightIdentityPlan = preflightIdentityContradictions(rows);
  const preflightConflicts = preflightIdentityPlan.conflicts;

  // Resolve all rows carrying a domain before processing contacts.  This
  // allows a website-less row to use the one named publication from anywhere
  // in the file, independent of worksheet/row order.
  const ambiguousInputOutletNames = new Set<string>();
  for (const row of rows) {
    if (!row.website.trim()) continue;
    const key = mediaOutletKey(row.outletName, row.website);
    const nameKey = normaliseMediaOutletName(row.outletName);
    const exactRefs = outletRefsByKey.get(key) ?? new Set<string>();
    if (exactRefs.size > 1) continue;
    if (exactRefs.size === 1) {
      outletRefsByNamedName.set(nameKey, new Set([
        ...(outletRefsByNamedName.get(nameKey) ?? []),
        ...exactRefs,
      ]));
      continue;
    }
    const ref = `new:${key}`;
    outletRefsByKey.set(key, new Set([ref]));
    const namedRefs = new Set([
      ...(outletRefsByNamedName.get(nameKey) ?? []),
      ref,
    ]);
    outletRefsByNamedName.set(nameKey, namedRefs);
  }
  for (const [nameKey, refs] of outletRefsByNamedName) {
    if (refs.size > 1) ambiguousInputOutletNames.add(nameKey);
  }

  const outletRefFor = (row: MediaImportRow): { ref?: string; conflict?: string } => {
    const key = mediaOutletKey(row.outletName, row.website);
    const nameKey = normaliseMediaOutletName(row.outletName);
    const exactRefs = outletRefsByKey.get(key) ?? new Set<string>();
    if (exactRefs.size > 1) {
      return {
        conflict: "Multiple existing outlets have the same normalized publication name and website domain.",
      };
    }
    if (row.website.trim()) {
      if (exactRefs.size === 1) return { ref: [...exactRefs][0]! };
      // Named identities were seeded above.  This fallback is defensive for
      // malformed rows and keeps the resolver total without a second lookup.
      const ref = `new:${key}`;
      outletRefsByKey.set(key, new Set([ref]));
      outletRefsByNamedName.set(nameKey, new Set([
        ...(outletRefsByNamedName.get(nameKey) ?? []),
        ref,
      ]));
      return { ref };
    }

    // A blank domain is a wildcard only when exactly one named publication
    // can satisfy it.  Duplicate names/domains remain conflicts; selecting
    // the first database row would make preview and commit data-dependent.
    if (ambiguousExistingOutletNames.has(nameKey) || ambiguousInputOutletNames.has(nameKey)) {
      return {
        conflict: "A website-less row matches more than one publication with this normalized name.",
      };
    }
    const namedRefs = outletRefsByNamedName.get(nameKey) ?? new Set<string>();
    if (namedRefs.size === 1) return { ref: [...namedRefs][0]! };
    if (namedRefs.size > 1) {
      return {
        conflict: "A website-less row matches more than one publication with this normalized name.",
      };
    }
    if (exactRefs.size === 1) return { ref: [...exactRefs][0]! };
    if (exactRefs.size > 1) {
      return {
        conflict: "Multiple existing outlets have the same normalized publication name.",
      };
    }
    const ref = `new:${key}`;
    outletRefsByKey.set(key, new Set([ref]));
    return { ref };
  };

  const publicationMutationFor = (
    row: MediaImportRow,
    outletRef: string,
  ): {
    changedFields: string[];
    status: "new" | "refreshed" | "unchanged";
  } => {
    const existingOutlet = outletByRef.get(outletRef);
    if (!existingOutlet) return { changedFields: [], status: "new" };
    const incoming = importedOutletMetadata(row, options.selectedCategory);
    const changedFields = (["category", "description", "country", "reachBand"] as const)
      .filter((field) => isDifferent(field, incoming[field], existingOutlet[field] ?? ""));
    return {
      changedFields,
      status: changedFields.length ? "refreshed" : "unchanged",
    };
  };

  rows.forEach((row, rowIndex) => {
    const preflightConflict = preflightConflicts.get(rowIndex);
    if (preflightConflict) {
      counts.conflicted += 1;
      outcomes.push({
        sourceRow: row.sourceRow,
        sheetName: row.sheetName,
        status: "conflicted",
        conflicts: [{
          kind: "identity",
          field: preflightConflict.field,
          message: preflightConflict.message,
          sourceRow: row.sourceRow,
          conflictingSourceRow: rows[preflightConflict.conflictingIndex]!.sourceRow,
          conflictingSheetName: rows[preflightConflict.conflictingIndex]!.sheetName,
        }],
      });
      return;
    }
    if (row.recordType === "publication") {
      if (!row.outletName.trim()) {
        counts.invalid += 1;
        outcomes.push({
          sourceRow: row.sourceRow,
          sheetName: row.sheetName,
          status: "invalid",
          conflicts: [{
            kind: "identity",
            message: "Missing publication or outlet name.",
            sourceRow: row.sourceRow,
          }],
        });
        return;
      }
      const outletResolution = outletRefFor(row);
      if (!outletResolution.ref) {
        counts.conflicted += 1;
        outcomes.push({
          sourceRow: row.sourceRow,
          sheetName: row.sheetName,
          status: "conflicted",
          conflicts: [{
            kind: "identity",
            field: "outlet",
            message: outletResolution.conflict ?? "The publication outlet identity is ambiguous.",
            sourceRow: row.sourceRow,
          }],
        });
        return;
      }
      const outletRef = outletResolution.ref;
      const createdPublication = !publicationRows.some((entry) => entry.outletRef === outletRef);
      const mutation = createdPublication ? publicationMutationFor(row, outletRef) : undefined;
      if (createdPublication) {
        publicationRows.push({ row, outletRef, ...mutation! });
        if (mutation!.status === "refreshed") counts.outletRefreshed += 1;
        if (mutation!.status === "unchanged") counts.outletUnchanged += 1;
      } else {
        counts.duplicate += 1;
      }
      outcomes.push({
        sourceRow: row.sourceRow,
        sheetName: row.sheetName,
        status: createdPublication ? "publication" : "duplicate",
        ...(createdPublication ? { changedFields: mutation!.changedFields } : {}),
        conflicts: [],
      });
      return;
    }
    if (isNumericOnlyJournalistName(row.firstName, row.lastName)
        || hasNumericJournalistNameIdentifier(row.firstName, row.lastName)) {
      counts.invalid += 1;
      outcomes.push({
        sourceRow: row.sourceRow,
        sheetName: row.sheetName,
        status: "invalid",
        conflicts: [{
          kind: "identity",
          field: "name",
          message: "Names containing numeric identifiers are not accepted as journalist identities.",
          sourceRow: row.sourceRow,
        }],
      });
      return;
    }
    if (!rowHasIdentity(row)) {
      counts.invalid += 1;
      outcomes.push({
        sourceRow: row.sourceRow,
        sheetName: row.sheetName,
        status: "invalid",
        conflicts: [{
          kind: "identity",
          message: "Missing outlet or contact name/email.",
          sourceRow: row.sourceRow,
        }],
      });
      return;
    }

    const outletResolution = outletRefFor(row);
    if (!outletResolution.ref) {
      counts.conflicted += 1;
      outcomes.push({
        sourceRow: row.sourceRow,
        sheetName: row.sheetName,
        status: "conflicted",
        conflicts: [{
          kind: "identity",
          field: "outlet",
          message: outletResolution.conflict ?? "The contact outlet identity is ambiguous.",
          sourceRow: row.sourceRow,
        }],
      });
      return;
    }
    const outletRef = outletResolution.ref;
    const email = normalise(row.email);
    const nameKey = contactNameKey(outletRef, row);
    const hasName = Boolean(row.firstName.trim() || row.lastName.trim());
    // Email is a strong identity.  Email-less rows use the compound
    // outlet+name identity, never just the person's name.
    const aggregateKey = `component:${preflightIdentityPlan.componentByIndex.get(rowIndex) ?? rowIndex}`;
    const priorAggregate = aggregateByKey.get(aggregateKey);
    if (priorAggregate) {
      const conflict = aggregateConflict(priorAggregate.aggregate.row, row);
      if (conflict) {
        counts.conflicted += 1;
        outcomes.push({
          sourceRow: row.sourceRow,
          sheetName: row.sheetName,
          status: "conflicted",
          conflicts: [{
            kind: "identity",
            field: conflict.field,
            message: conflict.message,
            sourceRow: row.sourceRow,
            conflictingSourceRow: priorAggregate.aggregate.row.sourceRow,
            conflictingSheetName: priorAggregate.aggregate.row.sheetName,
          }],
        });
        return;
      }
      priorAggregate.aggregate.row = mergeAggregateRow(priorAggregate.aggregate.row, row);
      priorAggregate.aggregate.sourceRows.push(row.sourceRow);
      priorAggregate.aggregate.sourceSnapshots.push(sourceSnapshotFor(row));
      priorAggregate.aggregate.sectors = unique([...priorAggregate.aggregate.sectors, ...(row.sector ? [row.sector] : [])]);
      priorAggregate.aggregate.beats = unique([...priorAggregate.aggregate.beats, ...splitValues(row.beat)]);
      priorAggregate.aggregate.rawEmails = unique([...priorAggregate.aggregate.rawEmails, rawEmailFor(row)]);
      if (row.linkedinUrl) priorAggregate.aggregate.linkedinUrls = unique([...priorAggregate.aggregate.linkedinUrls, row.linkedinUrl]);
      counts.duplicate += 1;
      duplicatesSkipped += 1;
      outcomes.push({
        sourceRow: row.sourceRow,
        sheetName: row.sheetName,
        status: "duplicate",
        conflicts: [],
      });
      duplicateOutcomes.get(priorAggregate.aggregate)!.push(outcomes[outcomes.length - 1]!);
      return;
    }

    // A file can contain two email-bearing rows for the same person and
    // outlet.  They have different aggregate keys, so check the compound
    // outlet+name identity separately before allowing both to be created.
    const priorNamedAggregate = hasName ? namedAggregateByKey.get(nameKey) : undefined;
    if (priorNamedAggregate) {
      const conflict = aggregateConflict(priorNamedAggregate.aggregate.row, row);
      if (conflict) {
        counts.conflicted += 1;
        outcomes.push({
          sourceRow: row.sourceRow,
          sheetName: row.sheetName,
          status: "conflicted",
          conflicts: [{
            kind: "identity",
            field: conflict.field,
            message: conflict.message,
            sourceRow: row.sourceRow,
            conflictingSourceRow: priorNamedAggregate.aggregate.row.sourceRow,
            conflictingSheetName: priorNamedAggregate.aggregate.row.sheetName,
          }],
        });
        return;
      }
      // A later row may add the first email (or omit it) while retaining the
      // same safe compound identity.  Merge it rather than creating a second
      // contact, and keep all sector/beat evidence.
      if (!priorAggregate) {
        // Keep parser output immutable: the effective representative is a
        // private aggregate copy, otherwise preview planning changes the
        // parsed rows and a subsequent commit plan can differ.
        priorNamedAggregate.aggregate.row = mergeAggregateRow(priorNamedAggregate.aggregate.row, row);
        priorNamedAggregate.aggregate.sourceRows.push(row.sourceRow);
        priorNamedAggregate.aggregate.sourceSnapshots.push(sourceSnapshotFor(row));
        priorNamedAggregate.aggregate.sectors = unique([...priorNamedAggregate.aggregate.sectors, ...(row.sector ? [row.sector] : [])]);
        priorNamedAggregate.aggregate.beats = unique([...priorNamedAggregate.aggregate.beats, ...splitValues(row.beat)]);
        priorNamedAggregate.aggregate.rawEmails = unique([...priorNamedAggregate.aggregate.rawEmails, rawEmailFor(row)]);
        if (row.linkedinUrl) priorNamedAggregate.aggregate.linkedinUrls = unique([...priorNamedAggregate.aggregate.linkedinUrls, row.linkedinUrl]);
        if (email) aggregateByKey.set(`email:${email}`, priorNamedAggregate);
        counts.duplicate += 1;
        duplicatesSkipped += 1;
        outcomes.push({
          sourceRow: row.sourceRow,
          sheetName: row.sheetName,
          status: "duplicate",
          conflicts: [],
        });
        duplicateOutcomes.get(priorNamedAggregate.aggregate)!.push(outcomes[outcomes.length - 1]!);
        return;
      }
    }

    const aggregate = aggregateRows(rows, [rows.indexOf(row)]);
    aggregateByKey.set(aggregateKey, {
      aggregate,
      outletRef,
      outcome: {
        sourceRow: row.sourceRow,
        sheetName: row.sheetName,
        status: "new",
        conflicts: [],
      },
    });
    duplicateOutcomes.set(aggregate, []);
    if (hasName) namedAggregateByKey.set(nameKey, aggregateByKey.get(aggregateKey)!);
  });

  // Build complete source aggregates before selecting any existing candidate.
  // A later row may supply an identifier that contradicts the database or
  // resolves to an additional candidate. No first-row match is trusted.
  for (const pending of new Set(aggregateByKey.values())) {
    const { aggregate, outcome, outletRef } = pending;
    finaliseAggregate(aggregate);
    const row = aggregate.row;
    const email = normalise(row.email);
    const linkedIn = strongLinkedInIdentity(row.linkedinUrl);
    const nameKey = contactNameKey(outletRef, row);
    outcomes.push(outcome);
    const exactEmail = email ? emailByContact.get(email) ?? [] : [];
    const exactLinkedIn = linkedIn ? linkedinByContact.get(linkedIn) ?? [] : [];
    const named = nameByContact.get(nameKey) ?? [];
    const candidates = [...new Set([...exactEmail, ...exactLinkedIn, ...named])];
    const ambiguousContact = candidates.length > 1
      || named.length > 1
      || exactEmail.length > 1
      || exactLinkedIn.length > 1;
    const candidate = ambiguousContact ? undefined : (exactEmail[0] ?? exactLinkedIn[0] ?? named[0]);
    let conflict: ImportRowConflict | null = null;
    if (ambiguousContact) {
      conflict = {
        kind: "identity",
        field: "contact",
        message: "Multiple existing contacts match this outlet and contact identity.",
        sourceRow: row.sourceRow,
      };
    }
    if (candidate) {
      // A strong identifier that disagrees with the other strong identifier
      // is a conflict even when the display name changed and therefore no
      // compound name bucket was found.
      conflict = identityConflict(row, candidate, row.sourceRow, outletRef, outletRefById);
    }
    if (!conflict && candidate && named.some((contact) => contact.id !== candidate.id)) {
      conflict = identityConflict(row, named[0]!, row.sourceRow, outletRef, outletRefById);
    } else if (!conflict && candidate && named.length) {
      conflict = identityConflict(row, named[0]!, row.sourceRow, outletRef, outletRefById);
    } else if (!conflict && !candidate && named.length) {
      conflict = identityConflict(row, named[0]!, row.sourceRow, outletRef, outletRefById);
    }
    if (conflict) {
      const duplicates = duplicateOutcomes.get(aggregate) ?? [];
      counts.duplicate -= duplicates.length;
      duplicatesSkipped -= duplicates.length;
      counts.conflicted += 1 + duplicates.length;
      for (const sourceOutcome of [outcome, ...duplicates]) {
        sourceOutcome.status = "conflicted";
        sourceOutcome.contactId = conflict.existingContactId;
        sourceOutcome.conflicts = [{ ...conflict, sourceRow: sourceOutcome.sourceRow }];
      }
      continue;
    }

    if (candidate) {
      matchedExisting += 1;
      // Existing records are also skipped rather than inserted.  Keep this
      // summary compatible with the importer UI's "duplicates skipped"
      // meaning while preserving a separate matchedExisting count.
      duplicatesSkipped += 1;
      const changedFields = IMPORT_COMPARISON_FIELDS.filter((field) =>
        isDifferent(field, fieldValue(row, field, aggregate), contactValue(candidate, field)),
      );
      const overriddenFields = changedFields.filter((field) => overrides.has(`${candidate.id ?? -1}:${field}`));
      const status: ImportRowOutcomeStatus = overriddenFields.length
        ? "conflicted"
        : changedFields.length ? "refreshed" : "unchanged";
      counts[status] += 1;
      outcome.status = status;
      outcome.contactId = candidate.id;
      outcome.changedFields = changedFields.filter((field) => !overriddenFields.includes(field));
      if (overriddenFields.length) {
        outcome.conflicts.push(...overriddenFields.map((field) => ({
          kind: "override" as const,
          field,
          message: `The ${field} value is protected by a manual override.`,
          existingContactId: candidate.id,
          sourceRow: row.sourceRow,
        })));
      }
      matches.push({ aggregate, contact: candidate, changedFields, overriddenFields });
      continue;
    }

    counts.new += 1;
    importRows.push({ row, outletRef, aggregate });
  }

  return {
    importRows,
    publicationRows,
    matches,
    outcomes: outcomes.sort((a, b) =>
      `${a.sheetName ?? ""}:${a.sourceRow}`.localeCompare(`${b.sheetName ?? ""}:${b.sourceRow}`)),
    counts,
    duplicatesSkipped,
    matchedExisting,
    outletCount: new Set([
      ...importRows.map(({ outletRef }) => outletRef),
      ...publicationRows.map(({ outletRef }) => outletRef),
      ...matches.map(({ contact }) => contact.outletId ? (outletRefById.get(contact.outletId) ?? `existing:${contact.outletId}`) : ""),
    ].filter(Boolean)).size,
    newOutletCount: new Set([
      ...importRows.map(({ outletRef }) => outletRef),
      ...publicationRows.map(({ outletRef }) => outletRef),
    ].filter((ref) => ref.startsWith("new:"))).size,
    expectedMutations: {
      outletsCreated: new Set([
        ...importRows.map(({ outletRef }) => outletRef),
        ...publicationRows.map(({ outletRef }) => outletRef),
      ].filter((ref) => ref.startsWith("new:"))).size,
      outletsUpdated: counts.outletRefreshed,
      outletsUnchanged: counts.outletUnchanged,
      contactsCreated: importRows.length,
      contactsMatched: matches.length,
      publicationsProcessed: publicationRows.length,
    },
  };
}

/**
 * Compatibility wrapper for existing callers.  The route uses
 * reconcileMediaImport directly; keeping this export avoids making parser
 * tests depend on the route's database shape.
 */
export function classifyMediaReconciliation(
  rows: MediaImportRow[],
  existing: ImportContactIdentity[],
  overrides = new Set<string>(),
) {
  return reconcileMediaImport(rows, [], existing, overrides).counts;
}

export function planMediaImport(
  rows: MediaImportRow[],
  existingOutlets: ImportOutletIdentity[],
  existingContacts: ImportContactIdentity[],
) {
  const reconciliation = reconcileMediaImport(rows, existingOutlets, existingContacts);
  return {
    ...reconciliation,
    // Keep the old route/test names while exposing the richer shared plan.
    importRows: reconciliation.importRows,
  };
}

export function buildImportedContactMetadata(
  row: MediaImportRow,
  aggregate: ImportAggregate,
  details: {
    filename?: string;
    sourceHash: string;
    sourceType: string;
    selectedCategory?: string;
  },
): {
  notes: string;
  beats: string[];
  sectors: string[];
  geography: string;
  sourceRef: string;
  provenance: Record<string, unknown>;
} {
  const sectors = unique([
    ...aggregate.sectors,
    ...(details.selectedCategory ? [details.selectedCategory] : []),
  ]);
  const rawEmail = rawEmailFor(row);
  const sourceVerifiedDate = row.verifiedDate?.trim() || null;
  return {
    notes: buildMediaContactNotes(row),
    beats: aggregate.beats,
    sectors,
    geography: row.country?.trim() ?? "",
    sourceRef: `${row.sheetName ?? "CSV"}:${row.sourceRow}`,
    provenance: {
      importFilename: details.filename ?? "",
      sourceHash: details.sourceHash,
      sourceType: details.sourceType,
      sheet: row.sheetName ?? "",
      sourceRow: row.sourceRow,
      sourceSnapshots: aggregate.sourceSnapshots,
      sourceRefs: aggregate.sourceSnapshots.map((snapshot) => snapshot.sourceRef),
      recordType: row.recordType ?? "contact",
      rawEmail,
      rawMetadata: row.rawMetadata ?? null,
      sourceVerifiedDate,
      // This is an assertion supplied by the workbook.  It must not be
      // confused with lastVerifiedAt, which is reserved for page checks.
      sourceVerifiedDateAsserted: Boolean(sourceVerifiedDate),
      verifiedDateAssertion: sourceVerifiedDate ? {
        value: sourceVerifiedDate,
        kind: "source_assertion",
      } : null,
    },
  };
}

export function mergeImportedProvenance(
  existing: Record<string, unknown> | null | undefined,
  imported: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    ...imported,
    lastImport: imported,
  };
}

export function sourceBytesForImport(input: {
  csv?: unknown;
  xlsxBase64?: unknown;
  rows?: unknown;
}): { bytes: Buffer; sourceType: "csv" | "xlsx" | "parsed" } {
  if (typeof input.csv === "string") return { bytes: Buffer.from(input.csv, "utf8"), sourceType: "csv" };
  if (typeof input.xlsxBase64 === "string") {
    const encoded = input.xlsxBase64.replace(/^data:.*;base64,/, "");
    if (!/^[a-z\d+/]*={0,2}$/i.test(encoded) || encoded.length % 4 === 1) {
      throw new Error("The uploaded file is not valid base64.");
    }
    return { bytes: Buffer.from(encoded, "base64"), sourceType: "xlsx" };
  }
  if (Array.isArray(input.rows)) return { bytes: Buffer.from(JSON.stringify(input.rows), "utf8"), sourceType: "parsed" };
  throw new Error("Choose a CSV or XLSX file to import.");
}

export function sourceHashForImport(input: {
  csv?: unknown;
  xlsxBase64?: unknown;
  rows?: unknown;
}): { sourceHash: string; sourceType: "csv" | "xlsx" | "parsed"; byteLength: number } {
  const source = sourceBytesForImport(input);
  return {
    sourceHash: crypto.createHash("sha256").update(source.bytes).digest("hex"),
    sourceType: source.sourceType,
    byteLength: source.bytes.length,
  };
}

type PreviewClaim = {
  owner: string;
  scope: "shared" | "workspace";
  category: string;
  sourceHash: string;
  fingerprint: string;
  expiresAt?: number;
};

function sessionSecret(): string {
  const value = process.env.SESSION_SECRET?.trim();
  if (!value) throw new Error("SESSION_SECRET is required for media import preview tokens");
  return value;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeBase64UrlJson(value: string): PreviewClaim | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as PreviewClaim;
    if (!parsed || typeof parsed !== "object"
      || typeof parsed.owner !== "string"
      || (parsed.scope !== "shared" && parsed.scope !== "workspace")
      || typeof parsed.category !== "string"
      || typeof parsed.sourceHash !== "string"
      || typeof parsed.fingerprint !== "string"
      || typeof parsed.expiresAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function reconciliationFingerprint(
  owner: string,
  scope: "shared" | "workspace",
  sourceHash: string,
  existingOutlets: ImportOutletIdentity[],
  existingContacts: ImportContactIdentity[],
  overrides: Iterable<string> = [],
  classification?: {
    counts: Record<string, number>;
    duplicatesSkipped: number;
    matchedExisting: number;
    outletCount: number;
    newOutletCount: number;
    outcomes: ImportRowOutcome[];
  },
): string {
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)]));
    }
    return value;
  };
  const outlets = [...existingOutlets]
    .sort((left, right) => left.id - right.id)
    .map((outlet) => ({
      id: outlet.id,
      name: outlet.name,
      website: outlet.website,
      category: outlet.category ?? "",
      description: outlet.description ?? "",
      country: outlet.country ?? "",
      reachBand: outlet.reachBand ?? "",
    }));
  const contacts = [...existingContacts]
    .sort((left, right) => (left.id ?? 0) - (right.id ?? 0))
    .map((contact) => ({
      id: contact.id ?? null,
      outletId: contact.outletId,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      role: contact.role ?? "",
      linkedinUrl: contact.linkedinUrl ?? "",
      sourceUrl: contact.sourceUrl ?? "",
      geography: contact.geography ?? "",
      sourceRef: contact.sourceRef ?? "",
      publicationReach: contact.publicationReach ?? "",
      publicationAuthority: contact.publicationAuthority ?? "",
      journalistAuthority: contact.journalistAuthority ?? "",
      confidence: contact.confidence ?? "",
      reviewNotes: contact.reviewNotes ?? "",
      notes: contact.notes ?? "",
      beats: [...(contact.beats ?? [])].sort(),
      sectors: [...(contact.sectors ?? [])].sort(),
      provenance: contact.provenance ?? {},
    }));
  const identity = {
    owner,
    scope,
    sourceHash,
    outlets,
    contacts,
    overrides: [...overrides].sort(),
    classification: classification ? {
      counts: classification.counts,
      duplicatesSkipped: classification.duplicatesSkipped,
      matchedExisting: classification.matchedExisting,
      outletCount: classification.outletCount,
      newOutletCount: classification.newOutletCount,
      outcomes: [...classification.outcomes]
        .sort((left, right) => `${left.sheetName ?? ""}:${left.sourceRow}`.localeCompare(`${right.sheetName ?? ""}:${right.sourceRow}`)),
    } : null,
  };
  return crypto.createHash("sha256").update(JSON.stringify(stable(identity))).digest("hex");
}

export function issueMediaImportPreviewToken(claim: Omit<PreviewClaim, "expiresAt">): string {
  const expiresAt = Date.now() + 30 * 60 * 1000;
  const payload = base64UrlJson({ ...claim, expiresAt });
  const signature = crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyMediaImportPreviewToken(
  token: string,
  claim: Omit<PreviewClaim, "expiresAt">,
): boolean {
  const [payload, suppliedSignature] = token.split(".");
  if (!payload || !suppliedSignature) return false;
  const stored = decodeBase64UrlJson(payload);
  if (!stored || !stored.expiresAt || stored.expiresAt < Date.now()) return false;
  if (stored.owner !== claim.owner || stored.scope !== claim.scope || stored.category !== claim.category
    || stored.sourceHash !== claim.sourceHash || stored.fingerprint !== claim.fingerprint) return false;
  const expected = crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
}
