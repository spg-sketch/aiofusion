import { describe, expect, it } from "vitest";
import { canonicalMediaEmail, classifyMediaReconciliation, filterVisibleRecommendationItems, mediaOverrideOwner, parseMediaImportCsv, planMediaImport } from "./media-csv-import";

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

describe("canonicalMediaEmail", () => {
  it("normalises case and the common comma TLD typo deterministically", () => {
    expect(canonicalMediaEmail(" Jane@Example,COM ")).toBe("jane@example.com");
    expect(canonicalMediaEmail("not an email")).toBe("");
  });
});

describe("classifyMediaReconciliation", () => {
  it("supports refresh-only workbooks and reports protected source changes as conflicts", () => {
    const changed = parseMediaImportCsv("First Name,Last Name,Publication,Email,Role,Confidence\nJane,Doe,New Outlet,jane@example.com,Editor,verified").rows[0]!;
    expect(classifyMediaReconciliation([changed], [{ id: 7, outletId: 1, firstName: "Jane", lastName: "Doe", email: changed.email, role: "Reporter", confidence: "" }])).toMatchObject({ refreshed: 1, new: 0 });
    expect(classifyMediaReconciliation([changed], [{ id: 7, outletId: 1, firstName: "Jane", lastName: "Doe", email: changed.email, role: "Reporter", confidence: "" }], new Set(["7:role"]))).toMatchObject({ conflicted: 1 });
  });
});

describe("workspace import ownership", () => {
  it("does not treat a global canonical email as an account import match", () => {
    // The route deliberately supplies only active-account contacts to this
    // planner; a global record therefore results in a private new contact.
    const imported = parseMediaImportCsv("First Name,Last Name,Publication,Email\nJane,Doe,Outlet,jane@example.com").rows[0]!;
    expect(planMediaImport([imported], [], []).importRows).toHaveLength(1);
  });

  it("keys an admin edit override to the contact workspace", () => {
    expect(mediaOverrideOwner("customer-a")).toBe("customer-a");
    expect(mediaOverrideOwner(null)).toBe("__global_admin__");
  });
});

describe("recommendation item visibility", () => {
  it("excludes soft-deleted and currently non-visible contacts", () => {
    const active = { id: 1, contact: { accountId: "account-a", deletedAt: null } };
    const deleted = { id: 2, contact: { accountId: "account-a", deletedAt: new Date() } };
    const privateOther = { id: 3, contact: { accountId: "account-b", deletedAt: null } };
    const global = { id: 4, contact: { accountId: null, deletedAt: null } };
    expect(filterVisibleRecommendationItems([active, deleted, privateOther, global], ["account-a"]).map((item) => item.id)).toEqual([1, 4]);
  });
});