export const MEDIA_CSV_MAX_BYTES = 2 * 1024 * 1024;
export const MEDIA_CSV_MAX_ROWS = 50_000;
/** Overrides are owned by the contact workspace, never by an impersonating admin. */
export function mediaOverrideOwner(contactAccountId: string | null): string {
  return contactAccountId ?? "__global_admin__";
}

export function filterVisibleRecommendationItems<T extends {
  contact: { accountId: string | null; deletedAt: Date | null };
}>(items: T[], visibleAccounts: string[] | null): T[] {
  return items.filter(({ contact }) =>
    contact.deletedAt === null
    && (contact.accountId === null || visibleAccounts === null || visibleAccounts.includes(contact.accountId)),
  );
}
export const MEDIA_XLSX_MAX_ROWS = 50_000;

export type MediaImportRow = {
  sourceRow: number;
  sheetName?: string;
  sector?: string;
  firstName: string;
  lastName: string;
  role: string;
  outletName: string;
  email: string;
  website: string;
  description: string;
  beat: string;
  country: string;
  reachBand: string;
  confidence: string;
  notes: string;
  linkedinUrl?: string;
  sourceUrl?: string;
  verifiedDate?: string;
  publicationAuthority?: string;
  journalistAuthority?: string;
  reviewNotes?: string;
};

export type MediaImportParseResult = {
  rows: MediaImportRow[];
  errors: Array<{ row: number; message: string }>;
  headers: string[];
};

type MappedMediaImportField = Exclude<keyof MediaImportRow, "sourceRow" | "sheetName" | "sector">;
const HEADER_ALIASES: Record<MappedMediaImportField, string[]> = {
  firstName: ["first name", "firstname", "first_name", "contact first name"],
  lastName: ["last name", "lastname", "last_name", "contact last name"],
  role: ["role", "job title", "job_title", "title", "position"],
  outletName: ["outlet", "outlet name", "outlet_name", "publication", "publication name", "media outlet"],
  email: ["email", "email address", "contact email"],
  website: ["website", "outlet website", "publication website", "url"],
  description: ["description", "outlet description", "outlet_description", "publication description"],
  beat: ["beat", "editorial beat", "editorial_beat", "specialism", "topics"],
  country: ["country", "location", "market"],
  reachBand: ["reach", "reach band", "reach_band", "publication reach", "publication_reach", "audience"],
  confidence: ["confidence", "confidence level", "match confidence"],
  notes: ["notes", "comments", "contact notes"],
  linkedinUrl: ["linkedin", "linkedin url", "linkedin_url"],
  sourceUrl: ["source url", "source_url", "source"],
  verifiedDate: ["verified date", "verified_date", "last verified"],
  publicationAuthority: ["publication authority", "publication_authority"],
  journalistAuthority: ["journalist authority", "journalist_authority"],
  reviewNotes: ["review notes", "review_notes", "review"],
};

function normaliseHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function parseCsvRecords(csv: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (quoted) {
      if (char === '"') {
        if (csv[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && csv[index + 1] === "\n") index += 1;
      record.push(field);
      if (record.some((value) => value.trim())) records.push(record);
      record = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  record.push(field);
  if (record.some((value) => value.trim())) records.push(record);
  return records;
}

function findHeaderRow(records: string[][]): number {
  return records.findIndex((record) => {
    const headers = new Set(record.map(normaliseHeader));
    const hasOutlet = HEADER_ALIASES.outletName.some((alias) => headers.has(normaliseHeader(alias)));
    const hasContactField = [...HEADER_ALIASES.firstName, ...HEADER_ALIASES.lastName, ...HEADER_ALIASES.email]
      .some((alias) => headers.has(normaliseHeader(alias)));
    return hasOutlet && hasContactField;
  });
}

export function canonicalMediaEmail(raw: string): string {
  const first = raw.split(/\s*[\/;]\s*/)[0]?.trim() ?? "";
  const fixed = first.replace(/@([^@]+),([a-z]{2,})\b/gi, "@$1.$2").toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fixed) ? fixed : "";
}

function parseMediaRecords(records: string[][], sheetName?: string): MediaImportParseResult {
  const headerIndex = findHeaderRow(records);
  if (headerIndex < 0) {
    throw new Error(`Could not find a header row with an outlet and contact name or email column${sheetName ? ` in ${sheetName}` : ""}.`);
  }

  const headers = records[headerIndex].map(normaliseHeader);
  const indexFor = (field: MappedMediaImportField): number =>
    headers.findIndex((header) => HEADER_ALIASES[field].some((alias) => normaliseHeader(alias) === header));
  const indices = Object.fromEntries(
    (Object.keys(HEADER_ALIASES) as MappedMediaImportField[])
      .map((field) => [field, indexFor(field)]),
  ) as Record<MappedMediaImportField, number>;

  const rows: MediaImportRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  const dataRecords = records.slice(headerIndex + 1);
  if (dataRecords.length > MEDIA_CSV_MAX_ROWS) {
    throw new Error(`CSV files may contain no more than ${MEDIA_CSV_MAX_ROWS.toLocaleString()} data rows.`);
  }

  const valueAt = (record: string[], field: keyof typeof indices): string => {
    const index = indices[field];
    return index >= 0 ? (record[index] ?? "").trim() : "";
  };

  dataRecords.forEach((record, offset) => {
    const sourceRow = headerIndex + offset + 2;
    const outletName = valueAt(record, "outletName");
    const firstName = valueAt(record, "firstName");
    const lastName = valueAt(record, "lastName");
    const rawEmail = valueAt(record, "email");
    if (!outletName) {
      errors.push({ row: sourceRow, message: "Missing outlet or publication name." });
      return;
    }
    if (!firstName && !lastName && !rawEmail) {
      errors.push({ row: sourceRow, message: "Missing contact name and email." });
      return;
    }
    const email = canonicalMediaEmail(rawEmail);
    if (rawEmail && !email) {
      errors.push({ row: sourceRow, message: "Email address is not valid." });
      return;
    }
    rows.push({
      sourceRow,
      sheetName,
      sector: sheetName,
      firstName,
      lastName,
      role: valueAt(record, "role"),
      outletName,
      email,
      website: valueAt(record, "website"),
      description: valueAt(record, "description"),
      beat: valueAt(record, "beat"),
      country: valueAt(record, "country"),
      reachBand: valueAt(record, "reachBand"),
      confidence: valueAt(record, "confidence"),
      notes: valueAt(record, "notes"),
      linkedinUrl: valueAt(record, "linkedinUrl"),
      sourceUrl: valueAt(record, "sourceUrl"),
      verifiedDate: valueAt(record, "verifiedDate"),
      publicationAuthority: valueAt(record, "publicationAuthority"),
      journalistAuthority: valueAt(record, "journalistAuthority"),
      reviewNotes: valueAt(record, "reviewNotes"),
    });
  });

  return { rows, errors, headers: records[headerIndex].map((header) => header.trim()) };
}

export function parseMediaImportCsv(csv: string): MediaImportParseResult {
  if (Buffer.byteLength(csv, "utf8") > MEDIA_CSV_MAX_BYTES) throw new Error("CSV files must be 2 MB or smaller.");
  return parseMediaRecords(parseCsvRecords(csv));
}

function xmlText(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Minimal OOXML reader: intentionally reads values only, avoiding native dependencies. */
export async function parseMediaImportXlsx(base64: string): Promise<MediaImportParseResult> {
  const bytes = Buffer.from(base64.replace(/^data:.*;base64,/, ""), "base64");
  if (!bytes.length || bytes.length > 12 * 1024 * 1024) throw new Error("XLSX files must be between 1 byte and 12 MB.");
  const { inflateRawSync } = await import("node:zlib");
  const eocd = bytes.lastIndexOf(Buffer.from("PK\u0005\u0006"));
  if (eocd < 0) throw new Error("The uploaded file is not a valid XLSX workbook.");
  const directoryOffset = bytes.readUInt32LE(eocd + 16);
  const files = new Map<string, Buffer>();
  let totalInflatedBytes = 0;
  for (let p = directoryOffset; p + 46 <= bytes.length && bytes.readUInt32LE(p) === 0x02014b50;) {
    const method = bytes.readUInt16LE(p + 10), compressed = bytes.readUInt32LE(p + 20), size = bytes.readUInt32LE(p + 24);
    const nameLength = bytes.readUInt16LE(p + 28), extraLength = bytes.readUInt16LE(p + 30), commentLength = bytes.readUInt16LE(p + 32), offset = bytes.readUInt32LE(p + 42);
    const name = bytes.subarray(p + 46, p + 46 + nameLength).toString("utf8");
    const localName = bytes.readUInt16LE(offset + 26), localExtra = bytes.readUInt16LE(offset + 28);
    const body = bytes.subarray(offset + 30 + localName + localExtra, offset + 30 + localName + localExtra + compressed);
    if (size > 32 * 1024 * 1024 || (compressed > 0 && size / compressed > 100)) throw new Error("XLSX compression ratio is unsafe.");
    const inflated = method === 0 ? body : method === 8 ? inflateRawSync(body) : Buffer.alloc(0);
    totalInflatedBytes += inflated.length;
    if (inflated.length !== size || totalInflatedBytes > 256 * 1024 * 1024) throw new Error("XLSX expanded content is too large.");
    files.set(name, inflated);
    p += 46 + nameLength + extraLength + commentLength;
  }
  const shared = (files.get("xl/sharedStrings.xml")?.toString() ?? "").match(/<si[^>]*>[\s\S]*?<\/si>/g)?.map(xmlText) ?? [];
  const workbook = files.get("xl/workbook.xml")?.toString() ?? "";
  const relationships = files.get("xl/_rels/workbook.xml.rels")?.toString() ?? "";
  const targetByRelationship = new Map([...relationships.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)]
    .map(([, id, target]) => [id, `xl/${target.replace(/^\//, "").replace(/^\.\//, "")}`]));
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/?>/g)];
  const allRows: MediaImportRow[] = [], errors: Array<{ row: number; message: string }> = [];
  let headers: string[] = [];
  for (const [, encodedName, relationshipId] of sheets) {
    const name = xmlText(encodedName);
    const target = targetByRelationship.get(relationshipId);
    const xml = target ? files.get(target)?.toString() : undefined;
    if (!xml) continue;
    const records: string[][] = [];
    for (const row of xml.match(/<row\b[\s\S]*?<\/row>/g) ?? []) {
      const cells: string[] = [];
      for (const cell of row.match(/<c\b[\s\S]*?<\/c>/g) ?? []) {
        const ref = cell.match(/\br="([A-Z]+)\d+"/)?.[1] ?? "A";
        let col = 0; for (const c of ref) col = col * 26 + c.charCodeAt(0) - 64;
        const raw = cell.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? cell.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "";
        const value = /\bt="s"/.test(cell) ? (shared[Number(raw)] ?? "") : xmlText(raw);
        cells[col - 1] = value;
      }
      records.push(cells.map((v) => v ?? ""));
    }
    try { const parsed = parseMediaRecords(records, name); allRows.push(...parsed.rows); errors.push(...parsed.errors); if (!headers.length) headers = parsed.headers; } catch { /* sheets without a media table are ignored */ }
  }
  if (!allRows.length && !errors.length) throw new Error("No media contact worksheet was found in this workbook.");
  if (allRows.length > MEDIA_XLSX_MAX_ROWS) throw new Error(`XLSX files may contain no more than ${MEDIA_XLSX_MAX_ROWS.toLocaleString()} data rows.`);
  return { rows: allRows, errors, headers };
}

export function mediaOutletKey(name: string, website: string): string {
  const rawWebsite = website.trim();
  if (rawWebsite) {
    try {
      const candidate = /^https?:\/\//i.test(rawWebsite) ? rawWebsite : `https://${rawWebsite}`;
      const url = new URL(candidate);
      return url.hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      // Fall back to the name when a website is malformed.
    }
  }
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildMediaContactNotes(row: MediaImportRow): string {
  return [
    row.beat ? `Beat: ${row.beat}` : "",
    row.confidence ? `Confidence: ${row.confidence}` : "",
    row.notes,
  ].filter(Boolean).join(" | ");
}

type ImportOutletIdentity = {
  id: number;
  name: string;
  website: string;
};

type ImportContactIdentity = {
  id?: number;
  outletId: number | null;
  firstName: string;
  lastName: string;
  email: string;
  role?: string;
  publicationReach?: string;
  confidence?: string;
};

/** Pure reconciliation classifier shared by preview and commit. */
export function classifyMediaReconciliation(
  rows: MediaImportRow[],
  existing: ImportContactIdentity[],
  overrides = new Set<string>(),
) {
  const seen = new Set<string>();
  const counts = { new: 0, refreshed: 0, unchanged: 0, conflicted: 0, duplicate: 0, invalid: 0 };
  for (const row of rows) {
    if (!row.outletName || (!row.firstName && !row.lastName && !row.email)) { counts.invalid++; continue; }
    const key = row.email || `${row.outletName.toLowerCase()}:${row.firstName.toLowerCase()}:${row.lastName.toLowerCase()}`;
    if (seen.has(key)) { counts.duplicate++; continue; }
    seen.add(key);
    const contact = row.email ? existing.find((value) => value.email.trim().toLowerCase() === row.email) : undefined;
    if (!contact) { counts.new++; continue; }
    const changed = (contact.role ?? "") !== row.role || (contact.publicationReach ?? "") !== row.reachBand || (contact.confidence ?? "") !== row.confidence;
    if (!changed) counts.unchanged++;
    else if (["role", "publicationReach", "confidence"].some((field) => overrides.has(`${contact.id ?? -1}:${field}`))) counts.conflicted++;
    else counts.refreshed++;
  }
  return counts;
}

export function planMediaImport(
  rows: MediaImportRow[],
  existingOutlets: ImportOutletIdentity[],
  existingContacts: ImportContactIdentity[],
) {
  const outletRefByKey = new Map<string, string>();
  const outletRefByName = new Map<string, string>();
  const outletRefById = new Map<number, string>();
  for (const outlet of existingOutlets) {
    const ref = `existing:${outlet.id}`;
    outletRefByKey.set(mediaOutletKey(outlet.name, outlet.website), ref);
    outletRefByName.set(mediaOutletKey(outlet.name, ""), ref);
    outletRefById.set(outlet.id, ref);
  }

  const emailKeys = new Set(
    existingContacts.map((contact) => contact.email.trim().toLowerCase()).filter(Boolean),
  );
  const nameKeys = new Set(
    existingContacts
      .filter((contact) => contact.outletId && outletRefById.has(contact.outletId))
      .map((contact) =>
        `${outletRefById.get(contact.outletId!)}:${contact.firstName.trim().toLowerCase()}:${contact.lastName.trim().toLowerCase()}`,
      ),
  );
  const importRows: Array<{ row: MediaImportRow; outletRef: string }> = [];
  let duplicatesSkipped = 0;
  let matchedExisting = 0;

  for (const row of rows) {
    const emailKey = row.email.toLowerCase();
    if (emailKey && emailKeys.has(emailKey)) {
      duplicatesSkipped += 1;
      if (existingContacts.some((contact) => contact.email.trim().toLowerCase() === emailKey)) matchedExisting += 1;
      continue;
    }

    const key = mediaOutletKey(row.outletName, row.website);
    const nameKey = mediaOutletKey(row.outletName, "");
    let outletRef = outletRefByKey.get(key) ?? outletRefByName.get(nameKey);
    if (!outletRef) {
      outletRef = `new:${key}`;
      outletRefByKey.set(key, outletRef);
      outletRefByName.set(nameKey, outletRef);
    }
    const contactNameKey = `${outletRef}:${row.firstName.toLowerCase()}:${row.lastName.toLowerCase()}`;
    if (!emailKey && nameKeys.has(contactNameKey)) {
      duplicatesSkipped += 1;
      continue;
    }

    importRows.push({ row, outletRef });
    if (emailKey) emailKeys.add(emailKey);
    nameKeys.add(contactNameKey);
  }

  return {
    importRows,
    duplicatesSkipped,
    matchedExisting,
    outletCount: new Set(importRows.map(({ outletRef }) => outletRef)).size,
    newOutletCount: new Set(
      importRows.map(({ outletRef }) => outletRef).filter((outletRef) => outletRef.startsWith("new:")),
    ).size,
  };
}