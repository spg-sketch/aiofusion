import { deflateRawSync } from "node:zlib";
import { safeMediaExportLink } from "./media-export-links";

const CONTACT_HEADERS = [
  "First name",
  "Last name",
  "Role",
  "Outlet name",
  "Email",
  "LinkedIn",
  "Outlet website",
  "Sector",
  "Country",
  "Source reach value",
] as const;

const PUBLICATION_HEADERS = [
  "Outlet name",
  "Outlet website",
  "Outlet description",
  "Country",
  "Linked journalists",
  "Source reach value",
] as const;

const MAX_ROWS = 10_000;
const MAX_CELL_CHARACTERS = 32_767;
const MAX_TOTAL_TEXT_BYTES = 16 * 1024 * 1024;

export class MediaExcelExportLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaExcelExportLimitError";
  }
}

type ExportType = "contacts" | "publications";

type ZipPart = {
  name: string;
  content: string;
};

function xmlEscape(value: string): string {
  return value
    // XML 1.0 does not allow most C0 controls; remove only those invalid code points.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnName(index: number): string {
  let name = "";
  let value = index + 1;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  return String(value);
}

function worksheetXml(type: ExportType, rows: readonly (readonly unknown[])[]): { xml: string; relationships: string; range: string } {
  const headers = type === "contacts" ? CONTACT_HEADERS : PUBLICATION_HEADERS;
  const rowCount = rows.length + 1;
  const endColumn = columnName(headers.length - 1);
  const filterRange = `A1:${endColumn}${rowCount}`;
  const widths = type === "contacts"
    ? [15, 17, 32, 28, 32, 20, 26, 28, 20, 18]
    : [28, 26, 56, 20, 44, 18];
  const wrappedColumns = new Set(type === "contacts" ? [2, 3, 7] : [0, 2, 4]);
  const websiteColumn = type === "contacts" ? 6 : 1;
  const hyperlinks: string[] = [];
  const relationships: string[] = [];
  const tableRows = [headers, ...rows];
  const xmlRows = tableRows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cells = headers.map((_, columnIndex) => {
      let value = rowIndex === 0 ? headers[columnIndex]! : cellText(row[columnIndex]);
      let style = rowIndex === 0 ? 1 : (rowIndex % 2 === 1 ? 2 : 3) + (wrappedColumns.has(columnIndex) ? 2 : 0);
      const reference = `${columnName(columnIndex)}${rowNumber}`;
      if (rowIndex > 0 && (columnIndex === websiteColumn || (type === "contacts" && columnIndex === 5))) {
        const link = safeMediaExportLink(value);
        if (link && (columnIndex === websiteColumn || /(^|\.)linkedin\.com$/i.test(link.hostname))) {
          const tooltip = link.target !== value ? ` tooltip="${xmlEscape(value)}"` : "";
          value = columnIndex === websiteColumn ? link.hostname : "LinkedIn profile";
          style = rowIndex % 2 === 1 ? 6 : 7;
          const id = `rId${relationships.length + 1}`;
          hyperlinks.push(`<hyperlink ref="${reference}" r:id="${id}"${tooltip}/>`);
          relationships.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlEscape(link.target)}" TargetMode="External"/>`);
        }
      }
      return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
    }).join("");
    // Only useful prose wraps. URLs, email addresses and short fields never
    // inflate a row. Very long prose remains intact for the formula bar or
    // manual row expansion, rather than making every working row enormous.
    const lineCount = Math.max(1, ...[...wrappedColumns].map((index) =>
      cellText(row[index]).split(/\r\n|\r|\n/).reduce((lines, line) =>
        lines + Math.max(1, Math.ceil(line.length / Math.max(1, widths[index]! - 2))), 0),
    ));
    const height = rowIndex === 0 ? 30 : Math.min(72, Math.max(24, lineCount * 14 + 8));
    return `<row r="${rowNumber}" ht="${height}" customHeight="1">${cells}</row>`;
  }).join("");

  const columns = widths.map((width, index) =>
    `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
  ).join("");

  return { xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="${filterRange}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="24"/>
  <cols>${columns}</cols>
  <sheetData>${xmlRows}</sheetData>
  <autoFilter ref="${filterRange}"/>
  ${hyperlinks.length ? `<hyperlinks>${hyperlinks.join("")}</hyperlinks>` : ""}
</worksheet>`,
    relationships: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join("")}</Relationships>`,
    range: filterRange,
  };
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
    <font><u/><sz val="11"/><color rgb="FF256393"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF3F5264"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF4F6F8"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="8">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    ${[false, true].flatMap((wrap) => [0, 3].map((fill) => `<xf numFmtId="0" fontId="0" fillId="${fill}" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment vertical="${wrap ? "top" : "center"}" wrapText="${wrap ? 1 : 0}"/></xf>`)).join("")}
    ${[0, 3].map((fill) => `<xf numFmtId="0" fontId="2" fillId="${fill}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="0"/></xf>`).join("")}
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

const PARTS: Omit<ZipPart, "content">[] = [
  { name: "[Content_Types].xml" },
  { name: "_rels/.rels" },
  { name: "docProps/app.xml" },
  { name: "docProps/core.xml" },
  { name: "xl/workbook.xml" },
  { name: "xl/_rels/workbook.xml.rels" },
  { name: "xl/styles.xml" },
  { name: "xl/worksheets/sheet1.xml" },
];

function partsFor(type: ExportType, worksheet: { xml: string; relationships: string; range: string }): ZipPart[] {
  const sheetName = type === "contacts" ? "Media contacts" : "Publications";
  const escapedSheetName = xmlEscape(sheetName);
  return PARTS.map<ZipPart>(({ name }) => {
    switch (name) {
      case "[Content_Types].xml":
        return {
          name,
          content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
        };
      case "_rels/.rels":
        return {
          name,
          content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
        };
      case "docProps/app.xml":
        return {
          name,
          content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Microsoft Excel</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop>
  <HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs>
  <TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>${escapedSheetName}</vt:lpstr></vt:vector></TitlesOfParts>
</Properties>`,
        };
      case "docProps/core.xml":
        return {
          name,
          content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Media Database</dc:creator><cp:lastModifiedBy>Media Database</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">2000-01-01T00:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">2000-01-01T00:00:00Z</dcterms:modified>
</cp:coreProperties>`,
        };
      case "xl/workbook.xml":
        return {
          name,
          content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView activeTab="0"/></bookViews>
  <sheets><sheet name="${escapedSheetName}" sheetId="1" r:id="rId1"/></sheets>
  <definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${escapedSheetName}'!${worksheet.range.replace(/([A-Z]+)(\d+)/g, (_, col, row) => `$${col}$${row}`)}</definedName></definedNames>
  <calcPr calcId="191029"/>
</workbook>`,
        };
      case "xl/_rels/workbook.xml.rels":
        return {
          name,
          content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
        };
      case "xl/styles.xml":
        return { name, content: stylesXml() };
      case "xl/worksheets/sheet1.xml":
        return { name, content: worksheet.xml };
      default:
        throw new Error("Unknown workbook part.");
    }
  }).concat({ name: "xl/worksheets/_rels/sheet1.xml.rels", content: worksheet.relationships });
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? 0xEDB88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xFF]! ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function zip(parts: ZipPart[]): Buffer {
  const localRecords: Buffer[] = [];
  const directoryRecords: Buffer[] = [];
  let offset = 0;

  for (const part of parts) {
    const name = Buffer.from(part.name, "utf8");
    const source = Buffer.from(part.content, "utf8");
    const compressed = deflateRawSync(source, { level: 6 });
    const crc = crc32(source);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034B50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 file names.
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10); // Deterministic DOS time.
    local.writeUInt16LE(0x0021, 12); // 1980-01-01.
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(source.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    localRecords.push(local, compressed);

    const directory = Buffer.alloc(46 + name.length);
    directory.writeUInt32LE(0x02014B50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x0800, 8);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt16LE(0, 12);
    directory.writeUInt16LE(0x0021, 14);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(source.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt16LE(0, 30);
    directory.writeUInt16LE(0, 32);
    directory.writeUInt16LE(0, 34);
    directory.writeUInt16LE(0, 36);
    directory.writeUInt32LE(0, 38);
    directory.writeUInt32LE(offset, 42);
    name.copy(directory, 46);
    directoryRecords.push(directory);
    offset += local.length + compressed.length;
  }

  const directorySize = directoryRecords.reduce((size, record) => size + record.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054B50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localRecords, ...directoryRecords, end]);
}

export function buildMediaExcelExport(
  type: "contacts" | "publications",
  rows: readonly (readonly unknown[])[],
): Buffer {
  if (rows.length > MAX_ROWS) {
    throw new MediaExcelExportLimitError(`Excel exports may contain no more than ${MAX_ROWS.toLocaleString()} data rows.`);
  }

  let totalTextBytes = 0;
  const headers = type === "contacts" ? CONTACT_HEADERS : PUBLICATION_HEADERS;
  const allRows: readonly (readonly unknown[])[] = [headers, ...rows];
  for (const row of allRows) {
    for (let index = 0; index < headers.length; index += 1) {
      const text = row === headers ? headers[index]! : cellText(row[index]);
      if (text.length > MAX_CELL_CHARACTERS) {
        throw new MediaExcelExportLimitError(
          `Excel cells may contain no more than ${MAX_CELL_CHARACTERS.toLocaleString()} characters.`,
        );
      }
      totalTextBytes += Buffer.byteLength(text, "utf8");
      if (totalTextBytes > MAX_TOTAL_TEXT_BYTES) {
        throw new MediaExcelExportLimitError("Excel exports may contain no more than 16 MiB of text.");
      }
    }
  }

  return zip(partsFor(type, worksheetXml(type, rows)));
}