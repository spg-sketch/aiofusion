import { describe, expect, it } from "vitest";
import { approvedSourceUpdates, evaluateMediaSource, sourceFetchError } from "./media-source-health";

const contact = { firstName: "Jane", lastName: "Reporter", role: "Energy Editor", email: "jane@example.com" };
const evidence = (text: string, emails: string[] = ["jane@example.com"], roleCandidates: string[] = [text]) => ({
  url: "https://example.com/jane", text, emails, roleCandidates,
});

describe("media source health", () => {
  it("recognises an unchanged source", () => {
    const result = evaluateMediaSource(contact, evidence("Jane Reporter Energy Editor"));
    expect(result.outcome).toBe("current");
    expect(result.differences).toEqual([]);
  });

  it("separates changed roles from removed public emails", () => {
    const result = evaluateMediaSource(contact, evidence("Jane Reporter Climate Correspondent", [], ["Jane Reporter - Climate Correspondent"]));
    expect(result.differences).toContainEqual(expect.objectContaining({ field: "role", kind: "changed", observedValue: "Climate Correspondent", supported: true }));
    expect(result.differences).toContainEqual(expect.objectContaining({ field: "email", kind: "removed", supported: false }));
  });

  it("proposes an exact replacement email only when one is published", () => {
    const result = evaluateMediaSource(contact, evidence("Jane Reporter Energy Editor", ["new@example.com"]));
    expect(result.differences).toContainEqual(expect.objectContaining({ field: "email", kind: "changed", observedValue: "new@example.com", supported: true }));
  });

  it("distinguishes a missing page from other unavailable sources", () => {
    expect(sourceFetchError(new Error("Site returned HTTP 404")).errorCode).toBe("page_missing");
    expect(sourceFetchError(new Error("Site request timed out")).errorCode).toBe("fetch_failed");
  });

  it("applies only approved supported fields and protects user overrides", () => {
    const differences = evaluateMediaSource(contact, evidence("Jane Reporter Climate Correspondent", ["new@example.com"], ["Jane Reporter - Climate Correspondent"])).differences;
    const result = approvedSourceUpdates(differences, ["role", "email"], ["role"]);
    expect(result.updates).toEqual({ email: "new@example.com" });
    expect(result.applied).toEqual(["email"]);
    expect(result.skipped).toEqual(["role"]);
  });
});