import { describe, expect, it } from "vitest";
import {
  hasNumericJournalistNameIdentifier,
  isNumericOnlyJournalistName,
  reconcileMediaImport,
} from "./media-import-reconciliation";
import type { MediaImportRow } from "./media-csv-import";

describe("numeric journalist-name identifiers", () => {
  it("detects digit-only name fields with whitespace and standalone four-digit tokens", () => {
    expect(hasNumericJournalistNameIdentifier(" 12 34 ", "")).toBe(true);
    expect(hasNumericJournalistNameIdentifier("Jane", "Doe 1234")).toBe(true);
    expect(hasNumericJournalistNameIdentifier("Jane-2024-Doe", "")).toBe(true);
  });

  it("preserves real names and numeric content outside standalone name tokens", () => {
    expect(hasNumericJournalistNameIdentifier("Jane", "Doe")).toBe(false);
    expect(hasNumericJournalistNameIdentifier("Jane", "Doe 24")).toBe(false);
    expect(hasNumericJournalistNameIdentifier("Jane", "Doe1234Smith")).toBe(false);
    expect(hasNumericJournalistNameIdentifier("", "")).toBe(false);
  });

  it("keeps the existing numeric-only exclusion helper semantics", () => {
    expect(isNumericOnlyJournalistName(" 12 ", "34")).toBe(true);
    expect(isNumericOnlyJournalistName("Jane", "Doe 1234")).toBe(false);
  });

  it("rejects contaminated contact import names even when the other name field is mixed", () => {
    const row: MediaImportRow = {
      sourceRow: 2,
      firstName: "News",
      lastName: "Desk 2024",
      role: "",
      outletName: "Example Outlet",
      email: "",
      website: "https://example.test",
      description: "",
      beat: "",
      country: "",
      reachBand: "",
      confidence: "",
      notes: "",
    };
    const result = reconcileMediaImport([row], [], []);
    expect(result.counts.invalid).toBe(1);
    expect(result.importRows).toHaveLength(0);
    expect(result.outcomes[0]?.conflicts[0]?.message).toContain("numeric identifiers");
  });
});