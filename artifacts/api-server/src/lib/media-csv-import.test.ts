import { describe, expect, it } from "vitest";
import { parseMediaImportCsv, planMediaImport } from "./media-csv-import";

describe("parseMediaImportCsv", () => {
  it("finds Patrick's second-row headers and maps contacts", () => {
    const result = parseMediaImportCsv([
      "Marketing & Advertising,,,,",
      "first_name,last_name,job_title,outlet name,email,website",
      'Jane,Smith,"Senior editor, technology",Example News,jane@example.com,https://example.com',
    ].join("\r\n"));

    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      expect.objectContaining({
        sourceRow: 3,
        firstName: "Jane",
        lastName: "Smith",
        role: "Senior editor, technology",
        outletName: "Example News",
        email: "jane@example.com",
      }),
    ]);
  });

  it("supports quoted line breaks", () => {
    const result = parseMediaImportCsv(
      'First Name,Last Name,Publication,Email,Notes\nJane,Doe,Example,jane@example.com,"Covers tech,\nAI and startups"',
    );
    expect(result.rows[0]?.notes).toBe("Covers tech,\nAI and startups");
  });

  it("reports invalid rows without blocking valid rows", () => {
    const result = parseMediaImportCsv([
      "First Name,Last Name,Publication,Email",
      "Valid,Person,Example,valid@example.com",
      "No,Outlet,,no@example.com",
      "Bad,Email,Example,not-an-email",
    ].join("\n"));

    expect(result.rows).toHaveLength(1);
    expect(result.errors).toEqual([
      { row: 3, message: "Missing outlet or publication name." },
      { row: 4, message: "Email address is not valid." },
    ]);
  });
});

describe("planMediaImport", () => {
  const row = parseMediaImportCsv(
    "First Name,Last Name,Publication,Email\nJane,Doe,New Outlet,jane@example.com",
  ).rows[0]!;

  it("skips an existing email before planning a new outlet", () => {
    const plan = planMediaImport([row], [], [{
      outletId: 4,
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
    }]);
    expect(plan.importRows).toEqual([]);
    expect(plan.newOutletCount).toBe(0);
    expect(plan.duplicatesSkipped).toBe(1);
  });

  it("deduplicates repeated rows within the same file", () => {
    const plan = planMediaImport([row, row], [], []);
    expect(plan.importRows).toHaveLength(1);
    expect(plan.newOutletCount).toBe(1);
    expect(plan.duplicatesSkipped).toBe(1);
  });
});