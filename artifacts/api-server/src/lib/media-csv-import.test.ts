import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  canonicalMediaEmail,
  canonicalMediaOutletDomain,
  classifyMediaReconciliation,
  filterVisibleRecommendationItems,
  mediaOutletKey,
  mediaOverrideOwner,
  parseMediaImportCsv,
  parseMediaImportXlsx,
  planMediaImport,
} from "./media-csv-import";
import {
  issueMediaImportPreviewToken,
  reconcileMediaImport,
  reconciliationFingerprint,
  verifyMediaImportPreviewToken,
} from "./media-import-reconciliation";

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

    expect(result.rows).toHaveLength(2);
    expect(result.errors).toEqual([
      { row: 3, message: "Missing outlet or publication name." },
    ]);
    expect(result.rows[1]).toEqual(expect.objectContaining({
      sourceRow: 4,
      firstName: "Bad",
      lastName: "Email",
      email: "",
      rawEmail: "not-an-email",
      recordType: "contact",
    }));
    expect(result.warnings).toEqual([
      { row: 4, message: "Email address is not valid; retained as raw review data." },
    ]);
  });
});

describe("parseMediaImportXlsx", () => {
  it("reconciles the exact V33 workbook by sheet and physical worksheet row", async () => {
    const workbookPath = "../../../../attached_assets/AIO_Fusion_Master_Media_Database_V33_040926_(1)_1789542841485.xlsx";
    const result = await parseMediaImportXlsx((await readFile(new URL(workbookPath, import.meta.url))).toString("base64"));

    expect(result.metadata).toMatchObject({
      sourceType: "xlsx",
      worksheetCount: 129,
      contactSheetCount: 125,
      supportingSheetCount: 4,
      exceptionSheetCount: 0,
      acceptedRows: 19_275,
      rejectedRows: 161,
    });
    expect(result.rows).toHaveLength(19_275);
    expect(result.errors).toHaveLength(161);
    expect(result.warnings?.filter((warning) => warning.code === "invalid_email")).toHaveLength(1_236);
    expect(result.rows.filter((row) => row.recordType === "publication")).toHaveLength(116);
    expect(result.rows.filter((row) => row.rawEmail && !row.email)).toHaveLength(1_236);
    expect(result.errors.every((error) => error.sheetName && error.row > 0)).toBe(true);
    expect(result.sheetInventory?.map((sheet) => sheet.sheetName)).toHaveLength(129);
    expect(result.sheetInventory?.filter((sheet) => sheet.kind === "supporting").map((sheet) => sheet.sheetName))
      .toEqual(["Index", "Field Instructions", "Cleanup Log", "Verification Notes"]);
    expect(result.sheetInventory?.filter((sheet) => sheet.rejectedRows > 0)
      .every((sheet) => sheet.rejectedRowRefs.length === sheet.rejectedRows)).toBe(true);
  });

  it("keeps publication-only rows distinct from named contacts", () => {
    const result = parseMediaImportCsv([
      "first_name,last_name,outlet name,email,website,record type",
      ",,Example News,,https://example.com,publication",
    ].join("\n"));

    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toEqual(expect.objectContaining({
      recordType: "publication",
      outletName: "Example News",
      email: "",
    }));
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

  it("retains every accepted duplicate's sheet/row raw snapshot", () => {
    const result = parseMediaImportCsv([
      "First Name,Last Name,Publication,Email,Country,Source Note",
      'Jane,Doe,New Outlet,jane@example.com,GB,"first source"',
      'Jane,Doe,New Outlet,jane@example.com,US,"second source"',
    ].join("\n"));
    const plan = reconcileMediaImport(result.rows, [], []);
    expect(plan.importRows).toHaveLength(1);
    expect(plan.importRows[0]!.aggregate.sourceSnapshots).toEqual([
      expect.objectContaining({ sourceRow: 2, country: "GB", rawEmail: "jane@example.com" }),
      expect.objectContaining({ sourceRow: 3, country: "US", rawEmail: "jane@example.com" }),
    ]);
    expect(plan.importRows[0]!.aggregate.sourceSnapshots[0]!.rawMetadata).toMatchObject({ "Source Note": "first source" });
    expect(plan.importRows[0]!.aggregate.sourceSnapshots[1]!.rawMetadata).toMatchObject({ "Source Note": "second source" });
  });

  it("keeps publications with a shared platform domain distinct by normalized name", () => {
    const result = parseMediaImportCsv([
      "First Name,Last Name,Publication,Email,Website",
      "Ada,One,Alpha Journal,ada@alpha.test,https://platform.example/alpha",
      "Ben,Two,Beta Journal,ben@beta.test,https://platform.example/beta",
    ].join("\n"));
    const plan = reconcileMediaImport(result.rows, [], []);

    expect(canonicalMediaOutletDomain("WWW.Platform.Example/alpha")).toBe("platform.example");
    expect(mediaOutletKey("Alpha Journal", "https://platform.example/alpha"))
      .not.toBe(mediaOutletKey("Beta Journal", "https://platform.example/beta"));
    expect(mediaOutletKey(" Alpha   Journal ", "http://www.platform.example/beta"))
      .toBe(mediaOutletKey("Alpha Journal", "https://platform.example/alpha"));
    expect(plan.importRows).toHaveLength(2);
    expect(plan.importRows[0]!.outletRef).not.toBe(plan.importRows[1]!.outletRef);
    expect(plan.newOutletCount).toBe(2);

    const samePublication = parseMediaImportCsv([
      "First Name,Last Name,Publication,Email,Website",
      "Ada,One,Alpha Journal,ada@alpha.test,https://platform.example/alpha",
      "Ada,One,Alpha Journal,ada@alpha.test,https://platform.example/other-page",
    ].join("\n"));
    const samePublicationPlan = reconcileMediaImport(samePublication.rows, [], []);
    expect(samePublicationPlan.importRows).toHaveLength(1);
    expect(samePublicationPlan.duplicatesSkipped).toBe(1);
  });

  it("reconciles website-less rows to one named publication regardless of row order", () => {
    const result = parseMediaImportCsv([
      "First Name,Last Name,Publication,Email,Website",
      "Ada,One,Example Journal,ada@alpha.test,",
      "Ben,Two,Example Journal,ben@alpha.test,https://platform.example",
    ].join("\n"));
    const plan = reconcileMediaImport(result.rows, [], []);

    expect(plan.importRows).toHaveLength(2);
    expect(plan.importRows[0]!.outletRef).toBe(plan.importRows[1]!.outletRef);
    expect(plan.newOutletCount).toBe(1);

    const existingPlan = reconcileMediaImport([result.rows[0]!], [
      { id: 7, name: "Example Journal", website: "https://platform.example" },
    ], []);
    expect(existingPlan.importRows[0]!.outletRef).toBe("existing:7");
    expect(existingPlan.newOutletCount).toBe(0);
  });

  it("conflicts rather than selecting among duplicate existing outlet identities", () => {
    const namedDuplicate = parseMediaImportCsv(
      "First Name,Last Name,Publication,Email,Website\nAda,One,Example Journal,ada@example.test,",
    ).rows[0]!;
    const exactDuplicate = parseMediaImportCsv(
      "First Name,Last Name,Publication,Email,Website\nBen,Two,Exact Journal,ben@example.test,https://exact.example",
    ).rows[0]!;

    const duplicateName = reconcileMediaImport([namedDuplicate], [
      { id: 1, name: "Example Journal", website: "https://one.example" },
      { id: 2, name: "Example Journal", website: "https://two.example" },
    ], []);
    const duplicateIdentity = reconcileMediaImport([exactDuplicate], [
      { id: 3, name: "Exact Journal", website: "https://exact.example" },
      { id: 4, name: "Exact Journal", website: "https://exact.example" },
    ], []);

    expect(duplicateName.counts.conflicted).toBe(1);
    expect(duplicateName.importRows).toHaveLength(0);
    expect(duplicateIdentity.counts.conflicted).toBe(1);
    expect(duplicateIdentity.importRows).toHaveLength(0);
  });

  it("counts publication-only outlet mutations in the pure plan", () => {
    const result = parseMediaImportCsv([
      "First Name,Last Name,Publication,Email,Website,Country,Record Type",
      ",,Publication Only,,,GB,publication",
    ].join("\n"));
    const plan = reconcileMediaImport(result.rows, [], []);

    expect(plan.importRows).toHaveLength(0);
    expect(plan.publicationRows).toHaveLength(1);
    expect(plan.newOutletCount).toBe(1);
    expect(plan.expectedMutations).toEqual({
      outletsCreated: 1,
      outletsUpdated: 0,
      outletsUnchanged: 0,
      contactsCreated: 0,
      contactsMatched: 0,
      publicationsProcessed: 1,
    });
  });

  it("quarantines every row in a contradictory email/LinkedIn group before matching", () => {
    const result = parseMediaImportCsv([
      "First Name,Last Name,Publication,Email,Website,LinkedIn URL",
      "Alex,Reporter,Identity News,alex@identity.test,https://identity.test,https://www.linkedin.com/in/alex",
      "Alec,Reporter,Identity News,alex@identity.test,https://identity.test,https://www.linkedin.com/in/alex",
    ].join("\n"));
    const plan = reconcileMediaImport(result.rows, [], []);

    expect(plan.importRows).toHaveLength(0);
    expect(plan.counts).toMatchObject({ new: 0, conflicted: 2 });
    expect(plan.outcomes.filter((outcome) => outcome.status === "conflicted")).toHaveLength(2);
  });

  it("quarantines same-outlet/person contradictory emails regardless of source order", () => {
    const sourceRows = [
      "Alex,Reporter,Permutation News,,,",
      "Alex,Reporter,Permutation News,alex-a@identity.test,,",
      "Alex,Reporter,Permutation News,alex-b@identity.test,,",
    ];
    for (const order of [[0, 1, 2], [2, 1, 0], [1, 0, 2]]) {
      const result = parseMediaImportCsv([
        "First Name,Last Name,Publication,Email,Website,Role",
        ...order.map((index) => sourceRows[index]!),
      ].join("\n"));
      const plan = reconcileMediaImport(result.rows, [], []);

      expect(plan.importRows).toHaveLength(0);
      expect(plan.matches).toHaveLength(0);
      expect(plan.counts).toMatchObject({ new: 0, conflicted: 3 });
      expect(plan.outcomes.filter((outcome) => outcome.status === "conflicted")).toHaveLength(3);
    }
  });

  it("uses the finalized aggregate row when an identifying row follows a sparse row", () => {
    const sourceRows = [
      "Alex,Reporter,Aggregate News,,,,,",
      "Alex,Reporter,Aggregate News,alex@aggregate.test,,,,,,,,,",
      ",Reporter,Aggregate News,alex@aggregate.test,,Senior Editor,,United Kingdom,National,,,https://www.linkedin.com/in/alex,https://aggregate.test/alex",
    ];
    for (const order of [[0, 1, 2], [2, 0, 1], [1, 2, 0]]) {
      const result = parseMediaImportCsv([
        "First Name,Last Name,Publication,Email,Website,Role,Beat,Country,Reach Band,Confidence,Notes,LinkedIn URL,Source URL",
        ...order.map((index) => sourceRows[index]!),
      ].join("\n"));
      const plan = reconcileMediaImport(result.rows, [], []);

      expect(plan.importRows).toHaveLength(1);
      expect(plan.importRows[0]!.row).toMatchObject({
        firstName: "Alex",
        lastName: "Reporter",
        email: "alex@aggregate.test",
        role: "Senior Editor",
        country: "United Kingdom",
        reachBand: "National",
        linkedinUrl: "https://www.linkedin.com/in/alex",
        sourceUrl: "https://aggregate.test/alex",
      });
      expect(plan.importRows[0]!.aggregate.sourceRows).toHaveLength(3);
      expect(plan.expectedMutations.contactsCreated).toBe(1);
    }
  });

  it("recomputes matched refresh fields from the finalized aggregate", () => {
    const result = parseMediaImportCsv([
      "First Name,Last Name,Publication,Email,Website,Role,LinkedIn URL",
      "Alex,Reporter,Aggregate Match,,,,",
      "Alex,Reporter,Aggregate Match,alex@aggregate.test,https://aggregate-match.test,Senior Editor,https://www.linkedin.com/in/alex",
    ].join("\n"));
    const plan = reconcileMediaImport(result.rows, [
      { id: 1, name: "Aggregate Match", website: "https://aggregate-match.test" },
    ], [{
      id: 2,
      outletId: 1,
      firstName: "Alex",
      lastName: "Reporter",
      email: "",
      role: "",
      linkedinUrl: "",
    }]);

    expect(plan.matches).toHaveLength(1);
    expect(plan.matches[0]!.changedFields).toEqual(expect.arrayContaining(["email", "role", "linkedinUrl"]));
    expect(plan.counts).toMatchObject({ refreshed: 1, unchanged: 0 });
  });

  it("quarantines every sparse-first row when the finalized email conflicts with an existing contact", () => {
    const sourceRows = [
      "Jane,Doe,Sparse Email Identity News,,,",
      "Jane,Doe,Sparse Email Identity News,new@news.test,https://sparse-email.test,Senior Editor",
    ];
    for (const order of [[0, 1], [1, 0]]) {
      const result = parseMediaImportCsv([
        "First Name,Last Name,Publication,Email,Website,Role",
        ...order.map((index) => sourceRows[index]!),
      ].join("\n"));
      const plan = reconcileMediaImport(result.rows, [
        { id: 7, name: "Sparse Email Identity News", website: "https://sparse-email.test" },
      ], [{
        id: 8,
        outletId: 7,
        firstName: "Jane",
        lastName: "Doe",
        email: "old@news.test",
      }]);

      expect(plan.importRows).toHaveLength(0);
      expect(plan.matches).toHaveLength(0);
      expect(plan.counts).toMatchObject({
        new: 0,
        refreshed: 0,
        unchanged: 0,
        conflicted: 2,
      });
      expect(plan.outcomes).toHaveLength(2);
      expect(plan.outcomes.every((outcome) => outcome.status === "conflicted")).toBe(true);
    }
  });

  it("quarantines every sparse-first row when nonempty LinkedIn identities conflict", () => {
    const sourceRows = [
      "Jane,Doe,Sparse LinkedIn Identity News,,,https://www.linkedin.com/in/jane-old",
      "Jane,Doe,Sparse LinkedIn Identity News,,https://sparse-linkedin.test,https://www.linkedin.com/in/jane-new",
    ];
    for (const order of [[0, 1], [1, 0]]) {
      const result = parseMediaImportCsv([
        "First Name,Last Name,Publication,Email,Website,LinkedIn URL",
        ...order.map((index) => sourceRows[index]!),
      ].join("\n"));
      const plan = reconcileMediaImport(result.rows, [
        { id: 9, name: "Sparse LinkedIn Identity News", website: "https://sparse-linkedin.test" },
      ], [{
        id: 10,
        outletId: 9,
        firstName: "Jane",
        lastName: "Doe",
        email: "",
        linkedinUrl: "https://www.linkedin.com/in/jane-old",
      }]);

      expect(plan.importRows).toHaveLength(0);
      expect(plan.matches).toHaveLength(0);
      expect(plan.counts).toMatchObject({
        new: 0,
        refreshed: 0,
        unchanged: 0,
        conflicted: 2,
      });
      expect(plan.outcomes).toHaveLength(2);
      expect(plan.outcomes.every((outcome) => outcome.status === "conflicted")).toBe(true);
    }
  });

  it("quarantines all rows when a later identity field resolves to a different existing candidate", () => {
    const sourceRows = [
      "Jane,Doe,Ambiguous Existing News,,,",
      "Jane,Doe,Ambiguous Existing News,new@news.test,https://ambiguous-existing.test,Senior Editor",
    ];
    for (const order of [[0, 1], [1, 0]]) {
      const result = parseMediaImportCsv([
        "First Name,Last Name,Publication,Email,Website,Role",
        ...order.map((index) => sourceRows[index]!),
      ].join("\n"));
      const plan = reconcileMediaImport(result.rows, [
        { id: 11, name: "Ambiguous Existing News", website: "https://ambiguous-existing.test" },
      ], [
        {
          id: 12,
          outletId: 11,
          firstName: "Jane",
          lastName: "Doe",
          email: "old@news.test",
        },
        {
          id: 13,
          outletId: 11,
          firstName: "",
          lastName: "",
          email: "new@news.test",
        },
      ]);

      expect(plan.importRows).toHaveLength(0);
      expect(plan.matches).toHaveLength(0);
      expect(plan.counts).toMatchObject({
        new: 0,
        refreshed: 0,
        unchanged: 0,
        conflicted: 2,
      });
      expect(plan.outcomes).toHaveLength(2);
      expect(plan.outcomes.every((outcome) => outcome.status === "conflicted")).toBe(true);
    }
  });
});

describe("canonicalMediaEmail", () => {
  it("normalises case and the common comma TLD typo deterministically", () => {
    expect(canonicalMediaEmail(" Jane@Example,COM ")).toBe("jane@example.com");
    expect(canonicalMediaEmail("not an email")).toBe("");
  });
});

describe("stateless media import review tokens", () => {
  it("uses SESSION_SECRET HMAC claims with expiry and no process-local lookup", () => {
    const previousSecret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "test-session-secret";
    try {
      const claim = {
        owner: "token-workspace",
        scope: "workspace" as const,
        category: "Technology",
        sourceHash: "a".repeat(64),
        fingerprint: "b".repeat(64),
      };
      const token = issueMediaImportPreviewToken(claim);
      expect(verifyMediaImportPreviewToken(token, claim)).toBe(true);
      expect(verifyMediaImportPreviewToken(token, { ...claim, category: "Finance" })).toBe(false);
      expect(verifyMediaImportPreviewToken(`${token}tampered`, claim)).toBe(false);
    } finally {
      if (previousSecret === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = previousSecret;
    }
  });
});

describe("canonical reconciliation fingerprints", () => {
  it("sorts full snapshots and includes override values and classification", () => {
    const outlets = [
      { id: 2, name: "B", website: "", category: "Finance" },
      { id: 1, name: "A", website: "", category: "Technology" },
    ];
    const contacts = [
      { id: 2, outletId: 2, firstName: "B", lastName: "B", email: "b@example.test", sectors: ["Finance"] },
      { id: 1, outletId: 1, firstName: "A", lastName: "A", email: "a@example.test", sectors: ["Technology"] },
    ];
    const classification = {
      counts: { new: 1, refreshed: 0, unchanged: 0, conflicted: 0, duplicate: 0, invalid: 0 },
      duplicatesSkipped: 0,
      matchedExisting: 0,
      outletCount: 1,
      newOutletCount: 1,
      outcomes: [
        { sourceRow: 2, sheetName: "B", status: "new" as const, conflicts: [] },
        { sourceRow: 1, sheetName: "A", status: "new" as const, conflicts: [] },
      ],
    };
    const first = reconciliationFingerprint("owner", "workspace", "a".repeat(64), outlets, contacts, [
      "2:role:Editor",
      "1:role:Reporter",
    ], classification);
    const second = reconciliationFingerprint("owner", "workspace", "a".repeat(64), [...outlets].reverse(), [...contacts].reverse(), [
      "1:role:Reporter",
      "2:role:Editor",
    ], { ...classification, outcomes: [...classification.outcomes].reverse() });
    expect(first).toBe(second);
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