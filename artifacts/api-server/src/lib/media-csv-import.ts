export const MEDIA_CSV_MAX_BYTES = 2 * 1024 * 1024;
export const MEDIA_CSV_MAX_ROWS = 5_000;

export type MediaImportRow = {
  sourceRow: number;
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
};

export type MediaImportParseResult = {
  rows: MediaImportRow[];
  errors: Array<{ row: number; message: string }>;
  headers: string[];
};

const HEADER_ALIASES: Record<keyof Omit<MediaImportRow, "sourceRow">, string[]> = {
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

function sanitiseEmail(raw: string): string {
  const first = raw.split(/\s*[\/;]\s*/)[0]?.trim() ?? "";
  const fixed = first.replace(/@([^@]+),([a-z]{2,})\b/gi, "@$1.$2").toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fixed) ? fixed : "";
}

export function parseMediaImportCsv(csv: string): MediaImportParseResult {
  if (Buffer.byteLength(csv, "utf8") > MEDIA_CSV_MAX_BYTES) {
    throw new Error("CSV files must be 2 MB or smaller.");
  }

  const records = parseCsvRecords(csv);
  const headerIndex = findHeaderRow(records);
  if (headerIndex < 0) {
    throw new Error("Could not find a header row with an outlet and contact name or email column.");
  }

  const headers = records[headerIndex].map(normaliseHeader);
  const indexFor = (field: keyof Omit<MediaImportRow, "sourceRow">): number =>
    headers.findIndex((header) => HEADER_ALIASES[field].some((alias) => normaliseHeader(alias) === header));
  const indices = Object.fromEntries(
    (Object.keys(HEADER_ALIASES) as Array<keyof Omit<MediaImportRow, "sourceRow">>)
      .map((field) => [field, indexFor(field)]),
  ) as Record<keyof Omit<MediaImportRow, "sourceRow">, number>;

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
    const email = sanitiseEmail(rawEmail);
    if (rawEmail && !email) {
      errors.push({ row: sourceRow, message: "Email address is not valid." });
      return;
    }
    rows.push({
      sourceRow,
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
    });
  });

  return { rows, errors, headers: records[headerIndex].map((header) => header.trim()) };
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
  outletId: number | null;
  firstName: string;
  lastName: string;
  email: string;
};

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

  for (const row of rows) {
    const emailKey = row.email.toLowerCase();
    if (emailKey && emailKeys.has(emailKey)) {
      duplicatesSkipped += 1;
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
    outletCount: new Set(importRows.map(({ outletRef }) => outletRef)).size,
    newOutletCount: new Set(
      importRows.map(({ outletRef }) => outletRef).filter((outletRef) => outletRef.startsWith("new:")),
    ).size,
  };
}