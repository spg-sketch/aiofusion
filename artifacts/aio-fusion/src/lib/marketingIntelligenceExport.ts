import type { jsPDF } from "jspdf";

export type EventOpportunity = {
  type: "Conference entry" | "Award entry" | "Speaker" | "Sponsorship";
  cost: string;
  deadline: string;
  contactDetails?: string;
  notes?: string;
  actionable?: boolean;
};

export type EventItem = {
  rank: number;
  name: string;
  url: string;
  category: string;
  startDate: string;
  endDate: string;
  audience: string;
  titleDescription: string;
  location: string;
  authority: number;
  relevanceReason: string;
  opportunities: EventOpportunity[];
  sourceCheckedAt: string;
};

export type SearchCriteria = {
  marketingTypes: string[];
  categories: string[];
  period: "6m" | "12m";
  region: "UK" | "NA";
};

export type EventReport = {
  events: EventItem[];
  criteria: SearchCriteria;
  generatedAt: string;
};

export const EVENT_REPORT_METHODOLOGY =
  "Generated using the Project Data brief and current web search. Event identity and the full date range are checked against the cited event page. Published costs and submission or entry deadlines are shown only when supported by that page. Audience, organiser descriptions and relevance reasoning are AI summaries. Scores (0-100) are AI relevance estimates based on category fit, audience quality and potential third-party visibility, not measured reach. A verified upcoming deadline does not by itself establish that an entry or submission window is open.";

const periodLabel = (criteria: SearchCriteria) => criteria.period === "6m" ? "Next 6 months" : "Next 12 months";
const regionLabel = (criteria: SearchCriteria) => criteria.region === "UK" ? "United Kingdom" : "North America";

function upcomingDeadlines(events: EventItem[]) {
  return events.flatMap(event =>
    event.opportunities.filter(op => op.actionable).map(op => ({ event, op })),
  ).slice(0, 3);
}

function csvCell(value: unknown): string {
  let text = String(value ?? "");
  // Quoting does not prevent spreadsheet formula execution.
  if (/^[\s\u0000-\u001f]*[=+\-@]|^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildMarketingIntelligenceCsv(report: EventReport): string {
  const top = new Set(upcomingDeadlines(report.events).map(({ op }) => op));
  const rows: unknown[][] = [[
    "Rank", "Event name", "URL", "Category", "Start date", "End date",
    "Location", "Audience (AI summary)", "Organiser (AI summary)", "AI relevance /100",
    "Opportunity type", "Cost", "Deadline", "Contact details", "Notes",
    "Top 3 upcoming verified deadlines", "Why relevant (AI summary)", "Source checked (UTC)",
    "Marketing types", "Business categories", "Period", "Region", "Generated at (UTC)",
    "Methodology and source caveats",
  ]];
  for (const event of report.events) {
    // Keep the event even if no individual opportunity was published.
    const opportunities: Array<EventOpportunity | undefined> = event.opportunities.length ? event.opportunities : [undefined];
    for (const op of opportunities) {
      rows.push([
        event.rank, event.name, event.url, event.category, event.startDate, event.endDate,
        event.location, event.audience, event.titleDescription, event.authority,
        op?.type ?? "No published opportunities", op?.cost || "Not published",
        op?.deadline || "Not published", op?.contactDetails ?? "", op?.notes ?? "",
        op && top.has(op) ? "YES" : "NO", event.relevanceReason, event.sourceCheckedAt,
        report.criteria.marketingTypes.join("; "), report.criteria.categories.join("; "),
        periodLabel(report.criteria), regionLabel(report.criteria), report.generatedAt,
        EVENT_REPORT_METHODOLOGY,
      ]);
    }
  }
  // UTF-8 BOM helps Excel recognise accents; CRLF and quoted cells follow RFC 4180.
  return "\ufeff" + rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export type ReportFonts = { regular: string; bold: string };
let fontsPromise: Promise<ReportFonts> | undefined;

function loadReportFonts(): Promise<ReportFonts> {
  if (!fontsPromise) {
    fontsPromise = Promise.all(["DejaVuSans.ttf", "DejaVuSans-Bold.ttf"].map(async name => {
      const response = await fetch(`${import.meta.env.BASE_URL}fonts/${name}`);
      if (!response.ok) throw new Error("PDF fonts could not be loaded. Please try again.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      return btoa(binary);
    })).then(([regular, bold]) => ({ regular, bold })).catch(error => {
      fontsPromise = undefined;
      throw error;
    });
  }
  return fontsPromise;
}

function readableDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || "Not published";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value :
    date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export async function buildMarketingIntelligencePdf(report: EventReport, suppliedFonts?: ReportFonts): Promise<jsPDF> {
  const [{ jsPDF: Pdf }, fonts] = await Promise.all([import("jspdf"), suppliedFonts ?? loadReportFonts()]);
  const pdf = new Pdf({ format: "a4", unit: "mm", compress: true });
  pdf.addFileToVFS("DejaVuSans.ttf", fonts.regular);
  pdf.addFileToVFS("DejaVuSans-Bold.ttf", fonts.bold);
  pdf.addFont("DejaVuSans.ttf", "Report", "normal");
  pdf.addFont("DejaVuSans-Bold.ttf", "Report", "bold");
  pdf.setProperties({ title: "Event Opportunities Report", author: "AIO Fusion", subject: "Marketing Intelligence" });
  const left = 18, width = 174, bottom = 274;
  let y = 39;

  const header = () => {
    pdf.setFillColor(16, 43, 54);
    pdf.rect(0, 0, 210, 29, "F");
    pdf.setFont("Report", "bold");
    pdf.setFontSize(17);
    pdf.setTextColor(255, 255, 255);
    pdf.text("Event Opportunities Report", left, 15);
    pdf.setFont("Report", "normal");
    pdf.setFontSize(9);
    pdf.text("AIO Fusion | Marketing Intelligence", left, 23);
    y = 39;
  };
  const space = (height: number) => {
    if (y + height > bottom) { pdf.addPage(); header(); }
  };
  const write = (text: string, { bold = false, size = 10, gap = 3, link = "" } = {}) => {
    pdf.setFont("Report", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, width) as string[];
    const lineHeight = size * 0.48;
    // Keep normal paragraphs intact; unusually long descriptions can still flow.
    space(lines.length <= 12 ? lines.length * lineHeight + gap : 2 * lineHeight);
    for (const line of lines) {
      space(lineHeight);
      pdf.setFont("Report", bold ? "bold" : "normal");
      pdf.setFontSize(size);
      const color = link ? [31, 116, 143] : [16, 43, 54];
      pdf.setTextColor(color[0], color[1], color[2]);
      pdf.text(line, left, y);
      if (link) pdf.link(left, y - lineHeight + 1, Math.min(pdf.getTextWidth(line), width), lineHeight, { url: link });
      y += lineHeight;
    }
    y += gap;
  };
  const heading = (text: string) => {
    space(24); // Keep a heading with the first lines of its content.
    write(text, { bold: true, size: 13, gap: 4 });
  };
  header();
  write(`Generated: ${readableDate(report.generatedAt.slice(0, 10))} (UTC)`);
  write(`Marketing types: ${report.criteria.marketingTypes.join(", ")}`);
  write(`Business categories: ${report.criteria.categories.join(", ")}`);
  write(`Period: ${periodLabel(report.criteria)} | Region: ${regionLabel(report.criteria)}`);
  heading("Top 3 upcoming verified deadlines");
  const top = upcomingDeadlines(report.events);
  if (!top.length) write("No upcoming verified deadlines found.");
  for (const { event, op } of top) {
    write(`${event.name} | ${op.type} | Deadline: ${readableDate(op.deadline)}`);
  }
  y += 3;
  space(62);
  heading(`Recommended events (${report.events.length})`);
  for (const event of report.events) {
    space(38);
    heading(`${event.rank}. ${event.name}`);
    const safeLink = /^https?:\/\//i.test(event.url) ? event.url : "";
    write(event.url, { link: safeLink, size: 9 });
    write(`Category: ${event.category}`);
    write(`Dates: ${readableDate(event.startDate)} to ${readableDate(event.endDate)}`);
    write(`Location: ${event.location}`);
    write(`AI relevance estimate: ${event.authority}/100`, { bold: true });
    write(`Audience (AI summary): ${event.audience}`);
    write(`Organiser (AI summary): ${event.titleDescription}`);
    write(`Why relevant (AI summary): ${event.relevanceReason}`);
    write(`Source checked (UTC): ${event.sourceCheckedAt}`, { size: 9 });
    if (!event.opportunities.length) write("No published opportunities.");
    for (const op of event.opportunities) {
      pdf.setFont("Report", "normal");
      pdf.setFontSize(10);
      const blockText = [
        op.type, `Cost: ${op.cost || "Not published"} | Deadline: ${readableDate(op.deadline)}`,
        op.contactDetails ? `Contact: ${op.contactDetails}` : "",
        op.notes ? `Notes: ${op.notes}` : "",
      ].filter(Boolean);
      const blockHeight = blockText.reduce((height, text) =>
        height + (pdf.splitTextToSize(text, width) as string[]).length * 4.8 + 3, 0);
      space(Math.min(blockHeight + 6, 80));
      write(op.type, { bold: true });
      write(`Cost: ${op.cost || "Not published"} | Deadline: ${readableDate(op.deadline)}`);
      if (op.contactDetails) write(`Contact: ${op.contactDetails}`);
      if (op.notes) write(`Notes: ${op.notes}`);
    }
    y += 4;
  }
  space(85);
  heading("Methodology and source caveats");
  write(EVENT_REPORT_METHODOLOGY, { size: 9 });
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setDrawColor(214, 222, 225);
    pdf.line(left, 282, left + width, 282);
    pdf.setFont("Report", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(98, 115, 122);
    pdf.text("AIO Fusion | Marketing Intelligence", left, 288);
    pdf.text(`Page ${page} of ${pages}`, left + width, 288, { align: "right" });
  }
  return pdf;
}

export function downloadReportBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  try { anchor.click(); } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}