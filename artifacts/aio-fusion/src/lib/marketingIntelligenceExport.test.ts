// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildMarketingIntelligenceCsv, buildMarketingIntelligencePdf,
  EVENT_REPORT_METHODOLOGY, type EventReport,
} from "./marketingIntelligenceExport";

const report: EventReport = {
  generatedAt: "2026-10-04T13:00:00.000Z",
  criteria: { marketingTypes: ["Networking"], categories: ["Professional services"], period: "6m", region: "NA" },
  events: [{
    rank: 1, name: 'Café, Montréal "Leadership" Δικτύωση',
    url: "https://events.example/" + "long-source-page-".repeat(25),
    category: "Professional services", startDate: "2026-10-16", endDate: "2026-10-17",
    audience: "Business leaders, founders and entrepreneurs.",
    titleDescription: "Community organisers", location: "Montréal, Canada",
    authority: 78, relevanceReason: "Relevant networking opportunities.",
    sourceCheckedAt: "2026-10-04T12:00:00.000Z",
    opportunities: [
      { type: "Conference entry", cost: "£50", deadline: "2026-10-10", actionable: true, notes: 'First line, with "quotes".\nSecond line.', contactDetails: "events@example.test" },
      { type: "Speaker", cost: "", deadline: "", notes: "=HYPERLINK(\"https://example.test\")" },
    ],
  }],
};

// Independent RFC 4180 parser, including quoted multiline cells.
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const source = csv.replace(/^\ufeff/, "");
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if (char === "\r" && source[i + 1] === "\n" && !quoted) {
      row.push(cell); rows.push(row); row = []; cell = ""; i++;
    } else cell += char;
  }
  expect(quoted).toBe(false);
  return rows;
}

describe("Marketing Intelligence exports", () => {
  it("produces a rectangular UTF-8 CSV with intact quotes, accents and multiline text", () => {
    const csv = buildMarketingIntelligenceCsv(report);
    expect(csv.startsWith("\ufeff")).toBe(true);
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(3);
    expect(rows.every(row => row.length === 24)).toBe(true);
    expect(rows[1][1]).toBe(report.events[0].name);
    expect(rows[1][14]).toBe(report.events[0].opportunities[0].notes);
    expect(rows[1][4]).toBe("2026-10-16");
    expect(rows[1][21]).toBe("North America");
    expect(rows[1][23]).toBe(EVENT_REPORT_METHODOLOGY);
    expect(rows[2][11]).toBe("Not published");
    expect(rows[2][14]).toBe(`'${report.events[0].opportunities[1].notes}`);
  });

  it("preserves events with no published opportunities and limits highlighted deadlines to three", () => {
    const event = report.events[0];
    const csv = buildMarketingIntelligenceCsv({
      ...report, events: [
        { ...event, opportunities: [] },
        { ...event, opportunities: Array.from({ length: 5 }, () => ({ ...event.opportunities[0] })) },
      ],
    });
    const rows = parseCsv(csv).slice(1);
    expect(rows).toHaveLength(6);
    expect(rows[0][10]).toBe("No published opportunities");
    expect(rows.filter(row => row[15] === "YES")).toHaveLength(3);
  });

  it.each(["=SUM(1,2)", "+cmd", "-cmd", "@cmd", " \t=cmd", "\r=cmd"])("neutralises a spreadsheet formula starting with %j", name => {
    const rows = parseCsv(buildMarketingIntelligenceCsv({
      ...report, events: [{ ...report.events[0], name }],
    }));
    expect(rows[1][1]).toBe(`'${name}`);
  });

  it("creates a real paginated A4 PDF using embedded fonts", async () => {
    const fonts = {
      regular: readFileSync("public/fonts/DejaVuSans.ttf").toString("base64"),
      bold: readFileSync("public/fonts/DejaVuSans-Bold.ttf").toString("base64"),
    };
    const pdf = await buildMarketingIntelligencePdf({
      ...report,
      events: Array.from({ length: 8 }, (_, i) => ({
        ...report.events[0], rank: i + 1,
        relevanceReason: "A detailed relevance explanation for the selected business brief. ".repeat(12),
      })),
    }, fonts);
    const bytes = new Uint8Array(pdf.output("arraybuffer"));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(pdf.getNumberOfPages()).toBeGreaterThan(3);
    expect(pdf.internal.pageSize.getWidth()).toBeCloseTo(210, 1);
    expect(pdf.internal.pageSize.getHeight()).toBeCloseTo(297, 1);
    expect(pdf.output()).toContain("/FontFile2");
    expect(pdf.output()).toContain("/Subtype /Link");
  });
});