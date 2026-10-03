import { safeMediaExportLink } from "./media-export-links";

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

export type MediaImportRecordType = "contact" | "publication";
export type MediaImportSheetKind = "contact" | "supporting" | "exception" | "empty";

export type MediaImportIssue = {
  row: number;
  message: string;
  sheetName?: string;
  code?: string;
  field?: string;
};

export type MediaImportSheetInventory = {
  sheetName: string;
  kind: MediaImportSheetKind;
  headers: string[];
  headerRow?: number;
  dataRowStart?: number;
  dataRowEnd?: number;
  worksheetRows: number;
  populatedRows: number;
  emptyRows: number;
  acceptedRows: number;
  rejectedRows: number;
  warningRows: number;
  contactRows: number;
  publicationRows: number;
  acceptedRowRefs: number[];
  rejectedRowRefs: number[];
  warningRowRefs: number[];
  errorCounts: Record<string, number>;
};

export type MediaImportParseMetadata = {
  sourceType?: "csv" | "xlsx";
  worksheetCount?: number;
  populatedWorksheetCount?: number;
  contactSheetCount?: number;
  supportingSheetCount?: number;
  exceptionSheetCount?: number;
  emptySheetCount?: number;
  worksheetRows?: number;
  populatedRows?: number;
  acceptedRows?: number;
  rejectedRows?: number;
  warningRows?: number;
};

export type MediaImportRow = {
  sourceRow: number;
  sheetName?: string;
  sector?: string;
  recordType?: MediaImportRecordType;
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
  /** The source value is retained only as provenance; email remains empty when invalid. */
  rawEmail?: string;
  /** Non-empty source cells keyed by their original column headers. */
  rawMetadata?: Record<string, string>;
};

export type MediaImportParseResult = {
  rows: MediaImportRow[];
  errors: MediaImportIssue[];
  headers: string[];
  warnings?: MediaImportIssue[];
  sheetInventory?: MediaImportSheetInventory[];
  metadata?: MediaImportParseMetadata;
};

type MappedMediaImportField = Exclude<
  keyof MediaImportRow,
  "sourceRow" | "sheetName" | "sector" | "recordType" | "rawEmail" | "rawMetadata"
>;
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

function issue(
  row: number,
  message: string,
  sheetName?: string,
  code?: string,
  field?: string,
): MediaImportIssue {
  return {
    row,
    message,
    ...(sheetName ? { sheetName } : {}),
    ...(sheetName && code ? { code } : {}),
    ...(sheetName && field ? { field } : {}),
  };
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

const RECORD_TYPE_ALIASES = ["record type", "record_type", "type", "entry type"];

function strictImportEmail(raw: string): { email: string; rawEmail?: string } {
  const candidate = raw.trim();
  if (!candidate) return { email: "" };
  // Do not repair a source value into a different address. Comma-TLD
  // typos and "contact via..." placeholders stay review-only provenance.
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) {
    return { email: candidate.toLowerCase() };
  }
  return { email: "", rawEmail: candidate };
}

export function canonicalMediaEmail(raw: string): string {
  const first = raw.split(/\s*[\/;]\s*/)[0]?.trim() ?? "";
  const fixed = first.replace(/@([^@]+),([a-z]{2,})\b/gi, "@$1.$2").toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fixed) ? fixed : "";
}

function sourceRawMetadata(headers: string[], record: string[]): Record<string, string> | undefined {
  const metadata: Record<string, string> = {};
  headers.forEach((header, index) => {
    const value = record[index] ?? "";
    if (!value.trim()) return;
    const base = header.trim() || `column_${index + 1}`;
    let key = base;
    let suffix = 2;
    while (Object.prototype.hasOwnProperty.call(metadata, key)) key = `${base}#${suffix++}`;
    metadata[key] = value;
  });
  return Object.keys(metadata).length ? metadata : undefined;
}

type ParseRecordsOptions = {
  sheetName?: string;
  rowNumbers?: number[];
  worksheetRows?: number;
  emptyRows?: number;
};

type ParsedMediaRecords = MediaImportParseResult & {
  inventory: MediaImportSheetInventory;
};

function parseMediaRecords(records: string[][], options: ParseRecordsOptions = {}): ParsedMediaRecords {
  const { sheetName, rowNumbers } = options;
  const headerIndex = findHeaderRow(records);
  if (headerIndex < 0) {
    throw new Error(`Could not find a header row with an outlet and contact name or email column${sheetName ? ` in ${sheetName}` : ""}.`);
  }

  const sourceHeaders = records[headerIndex].map((header) => header.trim());
  const headers = sourceHeaders.map(normaliseHeader);
  const indexFor = (field: MappedMediaImportField): number =>
    headers.findIndex((header) => HEADER_ALIASES[field].some((alias) => normaliseHeader(alias) === header));
  const recordTypeIndex = headers.findIndex((header) =>
    RECORD_TYPE_ALIASES.some((alias) => normaliseHeader(alias) === header),
  );
  const indices = Object.fromEntries(
    (Object.keys(HEADER_ALIASES) as MappedMediaImportField[])
      .map((field) => [field, indexFor(field)]),
  ) as Record<MappedMediaImportField, number>;

  const rows: MediaImportRow[] = [];
  const errors: MediaImportIssue[] = [];
  const warnings: MediaImportIssue[] = [];
  const dataRecords = records.slice(headerIndex + 1);
  if (dataRecords.length > MEDIA_CSV_MAX_ROWS) {
    throw new Error(`CSV files may contain no more than ${MEDIA_CSV_MAX_ROWS.toLocaleString()} data rows.`);
  }

  const valueAt = (record: string[], field: keyof typeof indices): string => {
    const index = indices[field];
    return index >= 0 ? (record[index] ?? "").trim() : "";
  };

  const acceptedRowRefs: number[] = [];
  const rejectedRowRefs: number[] = [];
  const warningRowRefs: number[] = [];
  const errorCounts: Record<string, number> = {};
  let contactRows = 0;
  let publicationRows = 0;
  const addError = (row: number, message: string, code: string, field?: string) => {
    errors.push(issue(row, message, sheetName, code, field));
    rejectedRowRefs.push(row);
    errorCounts[code] = (errorCounts[code] ?? 0) + 1;
  };
  const addWarning = (row: number, message: string, code: string, field?: string) => {
    warnings.push(issue(row, message, sheetName, code, field));
    warningRowRefs.push(row);
  };

  dataRecords.forEach((record, offset) => {
    const recordIndex = headerIndex + offset + 1;
    const sourceRow = rowNumbers?.[recordIndex] ?? headerIndex + offset + 2;
    const outletName = valueAt(record, "outletName");
    const firstName = valueAt(record, "firstName");
    const lastName = valueAt(record, "lastName");
    const rawEmail = valueAt(record, "email");
    if (!outletName) {
      addError(sourceRow, "Missing outlet or publication name.", "missing_outlet", "outletName");
      return;
    }

    const parsedEmail = strictImportEmail(rawEmail);
    const explicitType = recordTypeIndex >= 0 ? (record[recordTypeIndex] ?? "").trim() : "";
    const explicitPublication = /^(?:publication|outlet|publisher|organisation|organization)$/i.test(explicitType);
    const publicationMetadata = [
      "website", "description", "beat", "country", "reachBand", "confidence", "notes",
      "linkedinUrl", "sourceUrl", "verifiedDate", "publicationAuthority", "journalistAuthority", "reviewNotes",
    ].some((field) => valueAt(record, field as keyof typeof indices) !== "");
    const explicitContact = /^(?:contact|journalist|person)$/i.test(explicitType);
    const recordType: MediaImportRecordType = explicitPublication || (!explicitContact && !firstName && !lastName)
      ? "publication"
      : "contact";
    if (recordType === "contact" && !firstName && !lastName && !parsedEmail.email) {
      addError(sourceRow, "Missing contact name and email.", "missing_identity");
      return;
    }
    if (recordType === "publication" && !firstName && !lastName && !parsedEmail.email && !publicationMetadata) {
      addError(sourceRow, "Missing contact name and email.", "missing_identity");
      return;
    }
    if (parsedEmail.rawEmail) {
      addWarning(
        sourceRow,
        "Email address is not valid; retained as raw review data.",
        "invalid_email",
        "email",
      );
    }

    const rawMetadata = sourceRawMetadata(sourceHeaders, record);
    const row: MediaImportRow = {
      sourceRow,
      sheetName,
      sector: sheetName,
      recordType,
      firstName,
      lastName,
      role: valueAt(record, "role"),
      outletName,
      email: parsedEmail.email,
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
      ...(parsedEmail.rawEmail ? { rawEmail: parsedEmail.rawEmail } : {}),
      ...(rawMetadata ? { rawMetadata } : {}),
    };
    rows.push(row);
    acceptedRowRefs.push(sourceRow);
    if (recordType === "publication") publicationRows += 1;
    else contactRows += 1;
  });

  const inventory: MediaImportSheetInventory = {
    sheetName: sheetName ?? "",
    kind: "contact",
    headers: sourceHeaders,
    headerRow: rowNumbers?.[headerIndex] ?? headerIndex + 1,
    dataRowStart: dataRecords.length ? rowNumbers?.[headerIndex + 1] ?? headerIndex + 2 : undefined,
    dataRowEnd: dataRecords.length ? rowNumbers?.[records.length - 1] ?? records.length + 1 : undefined,
    worksheetRows: options.worksheetRows ?? records.length,
    populatedRows: records.length,
    emptyRows: options.emptyRows ?? 0,
    acceptedRows: rows.length,
    rejectedRows: errors.length,
    warningRows: warningRowRefs.length,
    contactRows,
    publicationRows,
    acceptedRowRefs,
    rejectedRowRefs,
    warningRowRefs,
    errorCounts,
  };
  return { rows, errors, headers: sourceHeaders, warnings, inventory };
}

export function parseMediaImportCsv(csv: string): MediaImportParseResult {
  if (Buffer.byteLength(csv, "utf8") > MEDIA_CSV_MAX_BYTES) throw new Error("CSV files must be 2 MB or smaller.");
  const { inventory: _inventory, ...result } = parseMediaRecords(parseCsvRecords(csv));
  return result;
}

function xmlText(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function xmlAttributes(fragment: string): Record<string, string> {
  return Object.fromEntries(
    [...fragment.matchAll(/([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g)]
      .map(([, key, value]) => [key, xmlText(value)]),
  );
}

function normaliseZipPath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function relationshipTarget(target: string, relationshipPath: string): string {
  if (target.startsWith("/")) return normaliseZipPath(target);
  // A package relationship file lives under _rels, but its targets are
  // relative to the source part (xl/workbook.xml), not xl/_rels.
  const sourcePath = relationshipPath.replace(/\/_rels\/([^/]+)\.rels$/, "/$1");
  const sourceSlash = sourcePath.lastIndexOf("/");
  const parent = sourceSlash >= 0 ? sourcePath.slice(0, sourceSlash) : "";
  return normaliseZipPath(`${parent}/${target}`);
}

function emptySheetInventory(
  sheetName: string,
  kind: MediaImportSheetKind,
  worksheetRows: number,
  populatedRows: number,
  emptyRows: number,
): MediaImportSheetInventory {
  return {
    sheetName,
    kind,
    headers: [],
    worksheetRows,
    populatedRows,
    emptyRows,
    acceptedRows: 0,
    rejectedRows: 0,
    warningRows: 0,
    contactRows: 0,
    publicationRows: 0,
    acceptedRowRefs: [],
    rejectedRowRefs: [],
    warningRowRefs: [],
    errorCounts: {},
  };
}

function looksLikeContactTable(records: string[][]): boolean {
  return records.some((record) => {
    const headers = new Set(record.map(normaliseHeader));
    const hasOutlet = HEADER_ALIASES.outletName.some((alias) => headers.has(normaliseHeader(alias)));
    const hasContactField = [
      ...HEADER_ALIASES.firstName,
      ...HEADER_ALIASES.lastName,
      ...HEADER_ALIASES.email,
    ].some((alias) => headers.has(normaliseHeader(alias)));
    return hasOutlet || hasContactField;
  });
}

function isSupportingSheetName(name: string): boolean {
  const normalised = normaliseHeader(name);
  return /^(?:index|field instructions|cleanup log|verification notes)$/.test(normalised)
    || /(?:instruction|cleanup|verification|readme|legend|archive|removed)/.test(normalised);
}

/** Minimal bounded OOXML reader: values only, with worksheet relationships resolved explicitly. */
export async function parseMediaImportXlsx(base64: string): Promise<MediaImportParseResult> {
  const bytes = Buffer.from(base64.replace(/^data:.*;base64,/, ""), "base64");
  if (!bytes.length || bytes.length > 12 * 1024 * 1024) throw new Error("XLSX files must be between 1 byte and 12 MB.");
  const { inflateRawSync } = await import("node:zlib");
  const eocd = bytes.lastIndexOf(Buffer.from("PK\u0005\u0006"));
  if (eocd < 0 || eocd + 22 > bytes.length) throw new Error("The uploaded file is not a valid XLSX workbook.");
  const directorySize = bytes.readUInt32LE(eocd + 12);
  const directoryOffset = bytes.readUInt32LE(eocd + 16);
  const entryCount = bytes.readUInt16LE(eocd + 10);
  if (directoryOffset + directorySize > eocd || !entryCount) throw new Error("The uploaded file is not a valid XLSX workbook.");

  const files = new Map<string, Buffer>();
  let totalInflatedBytes = 0;
  let p = directoryOffset;
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (p + 46 > bytes.length || bytes.readUInt32LE(p) !== 0x02014b50) throw new Error("The uploaded file has an invalid XLSX central directory.");
    const method = bytes.readUInt16LE(p + 10);
    // ZIP stores compressed size before uncompressed size in the central directory.
    const compressed = bytes.readUInt32LE(p + 20);
    const size = bytes.readUInt32LE(p + 24);
    const nameLength = bytes.readUInt16LE(p + 28);
    const extraLength = bytes.readUInt16LE(p + 30);
    const commentLength = bytes.readUInt16LE(p + 32);
    const offset = bytes.readUInt32LE(p + 42);
    const name = normaliseZipPath(bytes.subarray(p + 46, p + 46 + nameLength).toString("utf8"));
    if (!name || name.endsWith("/")) {
      p += 46 + nameLength + extraLength + commentLength;
      continue;
    }
    if (size > 32 * 1024 * 1024 || (compressed > 0 && size / compressed > 100)) throw new Error("XLSX compression ratio is unsafe.");
    if (offset + 30 > bytes.length || bytes.readUInt32LE(offset) !== 0x04034b50) throw new Error("The uploaded file has an invalid XLSX entry.");
    const localName = bytes.readUInt16LE(offset + 26);
    const localExtra = bytes.readUInt16LE(offset + 28);
    const bodyStart = offset + 30 + localName + localExtra;
    const bodyEnd = bodyStart + compressed;
    if (bodyEnd > bytes.length) throw new Error("The uploaded file has an invalid XLSX entry.");
    const body = bytes.subarray(bodyStart, bodyEnd);
    let inflated: Buffer;
    if (method === 0) inflated = body;
    else if (method === 8) inflated = inflateRawSync(body);
    else throw new Error("The uploaded file uses an unsupported XLSX compression method.");
    if (inflated.length !== size) throw new Error("The uploaded file has an invalid XLSX entry size.");
    totalInflatedBytes += inflated.length;
    if (totalInflatedBytes > 256 * 1024 * 1024) throw new Error("XLSX expanded content is too large.");
    files.set(name, inflated);
    p += 46 + nameLength + extraLength + commentLength;
  }

  const shared = [...(files.get("xl/sharedStrings.xml")?.toString() ?? "").matchAll(/<si\b[\s\S]*?<\/si>/g)].map((match) => xmlText(match[0]));
  const workbookPath = "xl/workbook.xml";
  const workbook = files.get(workbookPath)?.toString() ?? "";
  const relationshipPath = "xl/_rels/workbook.xml.rels";
  const relationships = files.get(relationshipPath)?.toString() ?? "";
  const targetByRelationship = new Map(
    [...relationships.matchAll(/<Relationship\b[\s\S]*?\/?>/g)]
      .map((match) => xmlAttributes(match[0]))
      .filter((attrs) => attrs.Id && attrs.Target)
      .map((attrs) => [attrs.Id, relationshipTarget(attrs.Target, relationshipPath)]),
  );
  const sheets = [...workbook.matchAll(/<sheet\b[\s\S]*?\/?>/g)]
    .map((match) => xmlAttributes(match[0]))
    .filter((attrs) => attrs.name && (attrs["r:id"] || attrs.id));
  if (!sheets.length) throw new Error("The uploaded file does not contain any worksheets.");

  const allRows: MediaImportRow[] = [];
  const errors: MediaImportIssue[] = [];
  const warnings: MediaImportIssue[] = [];
  const sheetInventory: MediaImportSheetInventory[] = [];
  let headers: string[] = [];
  let contactDataRows = 0;
  for (const attrs of sheets) {
    const name = attrs.name;
    const relationshipId = attrs["r:id"] ?? attrs.id;
    const target = targetByRelationship.get(relationshipId);
    const xml = target ? files.get(target)?.toString() : undefined;
    if (!xml) {
      sheetInventory.push(emptySheetInventory(name, "exception", 0, 0, 0));
      warnings.push(issue(0, "Worksheet relationship target was not found.", name, "missing_worksheet"));
      continue;
    }
    // Recover concise export labels from genuine hyperlink metadata only.
    // Never evaluate formulas, fetch targets, expand ranges, or substitute
    // arbitrary linked cells. Existing ZIP expansion bounds apply here too.
    const sheetRelsPath = target!.replace(/\/([^/]+)$/, "/_rels/$1.rels");
    const linkTargets = new Map<string, string>();
    const sheetRels = files.get(sheetRelsPath)?.toString() ?? "";
    for (const match of sheetRels.matchAll(/<Relationship\b[^>]*\/?>/g)) {
      const link = xmlAttributes(match[0]);
      if (link.Type === "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"
        && link.TargetMode === "External" && link.Id && safeMediaExportLink(link.Target ?? "")) {
        linkTargets.set(link.Id, link.Target);
      }
    }
    const linksByCell = new Map<string, { target: string; original: string }>();
    for (const match of xml.matchAll(/<hyperlink\b[^>]*\/?>/g)) {
      const link = xmlAttributes(match[0]);
      const destination = linkTargets.get(link["r:id"]);
      if (destination && /^[A-Z]{1,3}[1-9]\d{0,5}$/.test(link.ref ?? "") && !link.location) {
        // Scheme-free source addresses are exported with an HTTPS target and
        // their original text in a tooltip. Only recover it if it resolves to
        // exactly the same safe target; never trust arbitrary tooltip content.
        const tooltip = safeMediaExportLink(link.tooltip ?? "");
        linksByCell.set(link.ref, { target: destination,
          original: tooltip?.target === destination ? link.tooltip : destination });
      }
    }
    const records: string[][] = [];
    const rowNumbers: number[] = [];
    let worksheetRows = 0;
    let emptyRows = 0;
    for (const match of xml.matchAll(/<row\b[^>]*(?:\/>|>[\s\S]*?<\/row>)/g)) {
      const rowXml = match[0];
      const rowAttrs = xmlAttributes(rowXml.slice(0, rowXml.indexOf(">") + 1));
      const rowNumber = Number(rowAttrs.r) || worksheetRows + 1;
      worksheetRows = Math.max(worksheetRows, rowNumber);
      const cells: string[] = [];
      const body = rowXml.endsWith("/>") ? "" : rowXml.slice(rowXml.indexOf(">") + 1, rowXml.lastIndexOf("</row>"));
      for (const cellMatch of body.matchAll(/<c\b[^>]*(?:\/>|>[\s\S]*?<\/c>)/g)) {
        const cell = cellMatch[0];
        const cellAttrs = xmlAttributes(cell.slice(0, cell.indexOf(">") + 1));
        const ref = cellAttrs.r?.match(/^([A-Z]+)\d+$/i)?.[1] ?? "A";
        let col = 0;
        for (const character of ref.toUpperCase()) col = col * 26 + character.charCodeAt(0) - 64;
        if (col < 1 || col > 1024) continue;
        const type = cellAttrs.t ?? "";
        const valueTag = cell.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? "";
        const inline = cell.match(/<is\b[\s\S]*?<\/is>/)?.[0] ?? "";
        let value = type === "s"
          ? (shared[Number(valueTag)] ?? "")
          : type === "inlineStr"
            ? xmlText(inline)
            : xmlText(valueTag);
        if (type === "b") value = value === "1" ? "TRUE" : "FALSE";
        cells[col - 1] = value;
      }
      if (!cells.some((value) => value?.trim())) {
        emptyRows += 1;
        continue;
      }
      records.push(cells.map((value) => value ?? ""));
      rowNumbers.push(rowNumber);
    }
    if (!records.length) {
      sheetInventory.push(emptySheetInventory(name, "empty", worksheetRows, 0, emptyRows));
      continue;
    }
    const headerIndex = findHeaderRow(records);
    if (headerIndex < 0) {
      const kind: MediaImportSheetKind = !isSupportingSheetName(name) && looksLikeContactTable(records)
        ? "exception"
        : "supporting";
      sheetInventory.push(emptySheetInventory(name, kind, worksheetRows, records.length, emptyRows));
      if (kind === "exception") warnings.push(issue(rowNumbers[0] ?? 1, "A contact-like worksheet has no usable header row.", name, "missing_header"));
      continue;
    }
    const urlColumns = records[headerIndex].map((header) => {
      const normalised = normaliseHeader(header);
      return [...HEADER_ALIASES.website, ...HEADER_ALIASES.linkedinUrl]
        .some((alias) => normaliseHeader(alias) === normalised);
    });
    for (let row = headerIndex + 1; row < records.length; row += 1) {
      records[row].forEach((value, column) => {
        if (!urlColumns[column]) return;
        let col = column + 1;
        let letters = "";
        while (col > 0) {
          letters = String.fromCharCode(65 + (col - 1) % 26) + letters;
          col = Math.floor((col - 1) / 26);
        }
        const destination = linksByCell.get(`${letters}${rowNumbers[row]}`);
        const safe = destination ? safeMediaExportLink(destination.target) : null;
        if (safe && (value === safe.hostname || value === "LinkedIn profile")) {
          records[row][column] = destination!.original;
        }
      });
    }
    contactDataRows += Math.max(0, records.length - headerIndex - 1);
    if (contactDataRows > MEDIA_XLSX_MAX_ROWS) {
      throw new Error(`XLSX files may contain no more than ${MEDIA_XLSX_MAX_ROWS.toLocaleString()} data rows.`);
    }
    try {
      const parsed = parseMediaRecords(records, { sheetName: name, rowNumbers, worksheetRows, emptyRows });
      allRows.push(...parsed.rows);
      errors.push(...parsed.errors);
      warnings.push(...(parsed.warnings ?? []));
      if (!headers.length) headers = parsed.headers;
      sheetInventory.push(parsed.inventory);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Worksheet could not be parsed.";
      sheetInventory.push(emptySheetInventory(name, "exception", worksheetRows, records.length, emptyRows));
      warnings.push(issue(rowNumbers[0] ?? 1, message, name, "worksheet_parse_error"));
    }
  }
  if (!allRows.length && !errors.length) throw new Error("No media contact worksheet was found in this workbook.");
  if (allRows.length > MEDIA_XLSX_MAX_ROWS) throw new Error(`XLSX files may contain no more than ${MEDIA_XLSX_MAX_ROWS.toLocaleString()} data rows.`);
  const metadata: MediaImportParseMetadata = {
    sourceType: "xlsx",
    worksheetCount: sheetInventory.length,
    populatedWorksheetCount: sheetInventory.filter((sheet) => sheet.populatedRows > 0).length,
    contactSheetCount: sheetInventory.filter((sheet) => sheet.kind === "contact").length,
    supportingSheetCount: sheetInventory.filter((sheet) => sheet.kind === "supporting").length,
    exceptionSheetCount: sheetInventory.filter((sheet) => sheet.kind === "exception").length,
    emptySheetCount: sheetInventory.filter((sheet) => sheet.kind === "empty").length,
    worksheetRows: sheetInventory.reduce((total, sheet) => total + sheet.worksheetRows, 0),
    populatedRows: sheetInventory.reduce((total, sheet) => total + sheet.populatedRows, 0),
    acceptedRows: allRows.length,
    rejectedRows: errors.length,
    warningRows: warnings.length,
  };
  return { rows: allRows, errors, headers, warnings, sheetInventory, metadata };
}

export function normaliseMediaOutletName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Return the identity-bearing part of an outlet website.
 *
 * A hostname is intentionally not an outlet identity on its own.  Publisher
 * groups and hosted publication platforms frequently put several independent
 * publications on the same domain, so callers must combine this value with
 * normaliseMediaOutletName().
 */
export function canonicalMediaOutletDomain(website: string): string {
  const rawWebsite = website.trim();
  if (!rawWebsite) return "";
  try {
    const candidate = /^https?:\/\//i.test(rawWebsite) ? rawWebsite : `https://${rawWebsite}`;
    const url = new URL(candidate);
    return url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    // Preserve malformed source values as a deterministic, non-empty domain
    // component instead of silently falling back to the publication name.
    return rawWebsite.toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/[/?#].*$/, "")
      .replace(/^www\./, "")
      .replace(/\.$/, "");
  }
}

/**
 * Stable outlet identity.  Both the normalised publication name and the
 * canonical website domain are required when a website is supplied.
 */
export function mediaOutletKey(name: string, website: string): string {
  return `${normaliseMediaOutletName(name)}::${canonicalMediaOutletDomain(website)}`;
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
    const isPublication = row.recordType === "publication";
    if (!row.outletName || (!isPublication && !row.firstName && !row.lastName && !row.email)) {
      counts.invalid++;
      continue;
    }
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
  const outletRefsByKey = new Map<string, Set<string>>();
  const outletRefsByName = new Map<string, Set<string>>();
  const outletRefsByAllName = new Map<string, Set<string>>();
  const ambiguousOutletNames = new Set<string>();
  const outletRefById = new Map<number, string>();
  for (const outlet of existingOutlets) {
    const ref = `existing:${outlet.id}`;
    const key = mediaOutletKey(outlet.name, outlet.website);
    const nameKey = normaliseMediaOutletName(outlet.name);
    outletRefsByKey.set(key, new Set([...(outletRefsByKey.get(key) ?? []), ref]));
    outletRefsByAllName.set(nameKey, new Set([...(outletRefsByAllName.get(nameKey) ?? []), ref]));
    if (outlet.website.trim()) {
      outletRefsByName.set(nameKey, new Set([...(outletRefsByName.get(nameKey) ?? []), ref]));
    }
    outletRefById.set(outlet.id, ref);
  }
  for (const [nameKey, refs] of outletRefsByAllName) {
    if (refs.size > 1) ambiguousOutletNames.add(nameKey);
  }

  // Seed named input identities before resolving website-less rows.  This
  // makes a blank-domain row reconcile to a unique named publication
  // regardless of source-row order.
  for (const row of rows) {
    if (!row.website.trim()) continue;
    const key = mediaOutletKey(row.outletName, row.website);
    const nameKey = normaliseMediaOutletName(row.outletName);
    const existingRefs = outletRefsByKey.get(key) ?? new Set<string>();
    if (existingRefs.size === 1) {
      outletRefsByName.set(nameKey, new Set([...(outletRefsByName.get(nameKey) ?? []), ...existingRefs]));
    } else if (existingRefs.size === 0) {
      const ref = `new:${key}`;
      outletRefsByKey.set(key, new Set([ref]));
      outletRefsByName.set(nameKey, new Set([...(outletRefsByName.get(nameKey) ?? []), ref]));
    }
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
  const publicationRows: Array<{ row: MediaImportRow; outletRef: string }> = [];
  let duplicatesSkipped = 0;
  let matchedExisting = 0;
  let conflicted = 0;

  const resolveOutlet = (row: MediaImportRow): string | null => {
    const key = mediaOutletKey(row.outletName, row.website);
    const nameKey = normaliseMediaOutletName(row.outletName);
    const exactRefs = outletRefsByKey.get(key) ?? new Set<string>();
    if (exactRefs.size > 1) {
      conflicted += 1;
      return null;
    }
    if (row.website.trim()) {
      if (exactRefs.size === 1) return [...exactRefs][0]!;
      // The seed pass normally creates this ref.  Keep the fallback for
      // callers that provide rows with unusual mutable array-like values.
      const ref = `new:${key}`;
      outletRefsByKey.set(key, new Set([ref]));
      outletRefsByName.set(nameKey, new Set([...(outletRefsByName.get(nameKey) ?? []), ref]));
      return ref;
    }

    const namedRefs = outletRefsByName.get(nameKey) ?? new Set<string>();
    if (ambiguousOutletNames.has(nameKey) || namedRefs.size > 1) {
      conflicted += 1;
      return null;
    }
    if (namedRefs.size === 1) return [...namedRefs][0]!;
    if (exactRefs.size === 1) return [...exactRefs][0]!;
    if (exactRefs.size > 1) {
      conflicted += 1;
      return null;
    }
    const ref = `new:${key}`;
    outletRefsByKey.set(key, new Set([ref]));
    return ref;
  };

  for (const row of rows) {
    const outletRef = resolveOutlet(row);
    if (!outletRef) continue;
    if (row.recordType === "publication") {
      if (publicationRows.some((entry) => entry.outletRef === outletRef)) duplicatesSkipped += 1;
      else publicationRows.push({ row, outletRef });
      continue;
    }
    const emailKey = row.email.toLowerCase();
    if (emailKey && emailKeys.has(emailKey)) {
      duplicatesSkipped += 1;
      if (existingContacts.some((contact) => contact.email.trim().toLowerCase() === emailKey)) matchedExisting += 1;
      continue;
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
    publicationRows,
    duplicatesSkipped,
    matchedExisting,
    conflicted,
    outletCount: new Set([
      ...importRows.map(({ outletRef }) => outletRef),
      ...publicationRows.map(({ outletRef }) => outletRef),
    ]).size,
    newOutletCount: new Set(
      [
        ...importRows.map(({ outletRef }) => outletRef),
        ...publicationRows.map(({ outletRef }) => outletRef),
      ].filter((outletRef) => outletRef.startsWith("new:")),
    ).size,
    expectedMutations: {
      outletsCreated: new Set([
        ...importRows.map(({ outletRef }) => outletRef),
        ...publicationRows.map(({ outletRef }) => outletRef),
      ].filter((outletRef) => outletRef.startsWith("new:"))).size,
      outletsUpdated: 0,
      outletsUnchanged: 0,
      contactsCreated: importRows.length,
      contactsMatched: matchedExisting,
      publicationsProcessed: publicationRows.length,
    },
  };
}