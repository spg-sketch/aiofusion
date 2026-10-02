import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseMediaImportXlsx } from "./media-csv-import";
import { buildMediaExcelExport, MediaExcelExportLimitError } from "./media-excel-export";

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
];
const PUBLICATION_HEADERS = [
  "Outlet name",
  "Outlet website",
  "Outlet description",
  "Country",
  "Linked journalists",
  "Source reach value",
];

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

function unzipAndValidate(bytes: Buffer): Map<string, string> {
  const files = new Map<string, string>();
  const endOffset = bytes.lastIndexOf(Buffer.from("PK\u0005\u0006"));
  expect(endOffset).toBeGreaterThanOrEqual(0);
  expect(bytes.readUInt16LE(endOffset + 8)).toBe(bytes.readUInt16LE(endOffset + 10));
  const count = bytes.readUInt16LE(endOffset + 10);
  const centralOffset = bytes.readUInt32LE(endOffset + 16);
  let cursor = centralOffset;

  for (let index = 0; index < count; index += 1) {
    expect(bytes.readUInt32LE(cursor)).toBe(0x02014B50);
    const method = bytes.readUInt16LE(cursor + 10);
    const expectedCrc = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");

    expect(bytes.readUInt32LE(localOffset)).toBe(0x04034B50);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
    const content = method === 8 ? inflateRawSync(compressed) : compressed;
    expect(content.length).toBe(uncompressedSize);
    expect(crc32(content)).toBe(expectedCrc);
    files.set(name, content.toString("utf8"));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  expect(cursor).toBe(centralOffset + bytes.readUInt32LE(endOffset + 12));
  return files;
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function inlineCellValues(xml: string): string[] {
  return [...xml.matchAll(/<c\b[^>]*\br="([A-Z]+\d+)"[^>]*>([\s\S]*?)<\/c>/g)]
    .map(([, , cell]) => {
      const inlineText = cell!.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/)?.[1] ?? "";
      return unescapeXml(inlineText);
    });
}

describe("buildMediaExcelExport", () => {
  it("creates a styled valid ZIP workbook with exact contact headers and safe literal strings", async () => {
    const workbook = buildMediaExcelExport("contacts", [[
      "Élodie",
      "O’Neil",
      "Editor, Research\n& Analysis",
      "0007 News",
      "=HYPERLINK(\"https://bad.example\",\"click\")",
      "+SUM(1,2)",
      "https://example.test/a?x=1&y=2",
      "A&B",
      "Côte d’Ivoire",
      0,
    ]]);
    const files = unzipAndValidate(workbook);
    const sheet = files.get("xl/worksheets/sheet1.xml")!;
    const values = inlineCellValues(sheet);

    expect([...values.slice(0, CONTACT_HEADERS.length)]).toEqual(CONTACT_HEADERS);
    expect(values.slice(CONTACT_HEADERS.length)).toEqual([
      "Élodie",
      "O’Neil",
      "Editor, Research\n& Analysis",
      "0007 News",
      '=HYPERLINK("https://bad.example","click")',
      "+SUM(1,2)",
      "https://example.test/a?x=1&y=2",
      "A&B",
      "Côte d’Ivoire",
      "0",
    ]);
    expect(sheet).toContain('t="inlineStr"');
    expect(sheet).not.toMatch(/<f(?:\s|>)/);
    expect(sheet).toContain("Editor, Research\n&amp; Analysis");
    expect(sheet).toContain("x=1&amp;y=2");
    expect(sheet).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
    expect(sheet).toContain('<autoFilter ref="A1:J2"/>');

    const styles = files.get("xl/styles.xml")!;
    expect(styles).toContain('rgb="FF17365D"');
    expect(styles).toContain('rgb="FFFFFFFF"');
    expect(styles).toContain('wrapText="1"');
    expect(sheet).toContain('<col min="4" max="4" width="28"');
    expect(Buffer.compare(workbook, buildMediaExcelExport("contacts", [[
      "Élodie", "O’Neil", "Editor, Research\n& Analysis", "0007 News",
      '=HYPERLINK("https://bad.example","click")', "+SUM(1,2)",
      "https://example.test/a?x=1&y=2", "A&B", "Côte d’Ivoire", 0,
    ]]))).toBe(0);

    const parsed = await parseMediaImportXlsx(workbook.toString("base64"));
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      firstName: "Élodie",
      lastName: "O’Neil",
      outletName: "0007 News",
      linkedinUrl: "+SUM(1,2)",
      website: "https://example.test/a?x=1&y=2",
      country: "Côte d’Ivoire",
      rawEmail: '=HYPERLINK("https://bad.example","click")',
    });
  });

  it("writes the publication headers and appropriately broad wrapped description/name columns", () => {
    const files = unzipAndValidate(buildMediaExcelExport("publications", [[
      "The Journal",
      "https://journal.example",
      "Long description, with commas\nand multiple lines & accents: Montréal",
      "Canada",
      "Zoë Journalist, A. Reporter",
      "0000",
    ]]));
    const sheet = files.get("xl/worksheets/sheet1.xml")!;
    expect(inlineCellValues(sheet).slice(0, PUBLICATION_HEADERS.length)).toEqual(PUBLICATION_HEADERS);
    expect(sheet).toContain('<col min="3" max="3" width="60"');
    expect(sheet).toContain('<col min="5" max="5" width="56"');
    expect(sheet).toContain('<autoFilter ref="A1:F2"/>');
    expect(sheet).toContain("Montréal");
    expect(sheet).not.toMatch(/<f(?:\s|>)/);
  });

  it("supports valid header-only exports", () => {
    const contacts = unzipAndValidate(buildMediaExcelExport("contacts", []));
    const publications = unzipAndValidate(buildMediaExcelExport("publications", []));
    expect(inlineCellValues(contacts.get("xl/worksheets/sheet1.xml")!)).toEqual(CONTACT_HEADERS);
    expect(contacts.get("xl/worksheets/sheet1.xml")).toContain('<autoFilter ref="A1:J1"/>');
    expect(inlineCellValues(publications.get("xl/worksheets/sheet1.xml")!)).toEqual(PUBLICATION_HEADERS);
    expect(publications.get("xl/worksheets/sheet1.xml")).toContain('<autoFilter ref="A1:F1"/>');
  });

  it("rejects oversized row, cell, and total text counts explicitly", () => {
    expect(() => buildMediaExcelExport("contacts", Array.from({ length: 10_001 }, () => [])))
      .toThrow(MediaExcelExportLimitError);
    expect(() => buildMediaExcelExport("contacts", [["x".repeat(32_768)]]))
      .toThrow(MediaExcelExportLimitError);
    const longCell = "a".repeat(4_000);
    expect(() => buildMediaExcelExport(
      "publications",
      Array.from({ length: 700 }, () => [longCell, longCell, longCell, longCell, longCell, longCell]),
    )).toThrow(MediaExcelExportLimitError);
  });
});