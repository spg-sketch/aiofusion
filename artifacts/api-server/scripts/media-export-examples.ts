import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildMediaExcelExport } from "../src/lib/media-excel-export";

// Offline-only examples: no database, network, customer records, or credentials.
const destination = resolve(process.argv[2] ?? "../../exports/media-spreadsheet-review");
const website = `https://news.example.test/coverage/${"long-but-valid-path/".repeat(25)}?source=review&edition=2026`;
const linkedin = `https://www.linkedin.com/in/synthetic-editor?tracking=${"synthetic".repeat(80)}`;
const contacts = [
  ["Ada", "Example", "Business Editor", "Example Daily", "ada@example.test", linkedin, website, "Business", "UK", "00042"],
  ["Ben", "Sample", "Deputy Editor", "Sample Weekly", "ben@example.test", linkedin, website, "Technology", "UK", "National"],
  ["Zoë", "Fictional", "Editor", "Synthetic News", "zoe@example.test", "", website, "Science", "France", ""],
  ["Kai", "Demonstration", "Consultant", "Example Daily", "", linkedin, website, "Business", "Canada", "0"],
  ["Mira", "Multiline", "Editor\nResearch correspondent", "Example Review", "mira@example.test", "", "", "Energy; Climate; Environment", "Brazil", "Regional"],
  ["Alex", "Longtext", "Senior editor and correspondent covering science, policy, business and technology. ".repeat(12), "Long Text Review", "", "", "", "Energy; Technology; Science", "UK", ""],
  ["Literal", "Safety", "=SUM(1,2)", "Synthetic Safety", "", "javascript:alert(1)", "file:///not-a-web-link", "A&B", "Côte d’Ivoire", ""],
];
const publications = [
  ["Example Daily", website, "Independent business reporting.", "UK", "Ada Example; Kai Demonstration", "00042"],
  ["Sample Weekly", website, "Technology news.", "UK", "Ben Sample", "National"],
  ["Synthetic News", "https://synthetic.example.test", "Science & research.", "France", "Zoë Fictional", ""],
  ["Example Review", "", "First editorial focus\nSecond editorial focus", "Brazil", "Mira Multiline", "Regional"],
  ["Long Text Review", website, "A synthetic description covering policy, science, local communities and technology. ".repeat(25),
    "UK", ["Ada Example", "Ben Sample", "Zoë Fictional", "Kai Demonstration", "Mira Multiline", "Alex Longtext"].join("; "), "0"],
  ["Synthetic Safety", "=HYPERLINK(\"https://unsafe.example\")", "Literal unsafe value, not a link.", "Canada", "", ""],
];
await mkdir(destination, { recursive: true });
await Promise.all([
  writeFile(resolve(destination, "Synthetic Media Contacts.xlsx"), buildMediaExcelExport("contacts", contacts)),
  writeFile(resolve(destination, "Synthetic Media Publications.xlsx"), buildMediaExcelExport("publications", publications)),
]);
console.log(`Synthetic workbooks written to ${destination}`);