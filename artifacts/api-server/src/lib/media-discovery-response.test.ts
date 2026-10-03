import { describe, expect, it } from "vitest";
import { MediaDiscoveryResponseError, parseMediaDiscoveryResponse } from "./media-discovery-response";

describe("media discovery provider response contract", () => {
  const completed = { status: "completed", output: [], output_text: '{"items":[]}' };
  const candidate = {
    firstName: "Jane", lastName: "Reporter", outletName: "Marketing Daily",
    sourceUrl: "https://marketing.example/jane", role: "", email: "",
    outletWebsite: "", evidence: "", geography: "", mediaOpportunity: "", confidence: "High",
    beats: [], sectors: [], journalistInterests: [], recentBylines: [], mediaOpportunities: [], phraseAttributions: [],
  };
  it("accepts a completed explicit empty items array", () => {
    expect(parseMediaDiscoveryResponse(completed)).toEqual([]);
  });
  it("accepts the complete provider candidate contract", () => {
    expect(parseMediaDiscoveryResponse({ ...completed, output_text: JSON.stringify({ items: [candidate] }) })).toEqual([candidate]);
  });
  it.each([
    null,
    {},
    { ...completed, output_text: undefined },
    { ...completed, output_text: "" },
    { ...completed, output_text: " " },
    { ...completed, status: "incomplete", incomplete_details: { reason: "max_output_tokens" } },
    { ...completed, status: "failed", error: { message: "upstream" } },
    { ...completed, status: "queued" },
    { ...completed, status: undefined },
    { ...completed, output: [{ type: "message", content: [{ type: "refusal", refusal: "No" }] }] },
    { ...completed, output: [{ type: "message", status: "incomplete" }] },
    { ...completed, output_text: "not json" },
    { ...completed, output_text: "null" },
    { ...completed, output_text: "{}" },
    { ...completed, output_text: '{"items":null}' },
    { ...completed, output_text: '{"items":{}}' },
    { ...completed, output_text: '{"items":[null]}' },
    { ...completed, output_text: '{"items":[{}]}' },
    { ...completed, output_text: '{"items":[{"firstName":42,"lastName":"","outletName":"","sourceUrl":""}]}' },
  ])("rejects unusable output without manufacturing an empty success: %j", (response) => {
    expect(() => parseMediaDiscoveryResponse(response)).toThrow(MediaDiscoveryResponseError);
  });
  it.each([
    { beats: [42] }, { recentBylines: null }, { recentBylines: [{}] },
    { mediaOpportunities: [null] }, { phraseAttributions: "wrong" },
  ])("rejects malformed enrichment fields: %j", (fields) => {
    expect(() => parseMediaDiscoveryResponse({
      ...completed,
      output_text: JSON.stringify({ items: [{
        ...candidate, ...fields,
      }] }),
    })).toThrow(MediaDiscoveryResponseError);
  });
});