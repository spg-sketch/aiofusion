import { describe, expect, it } from "vitest";
import { normaliseMediaResearchRegions } from "./media-research-regions";

describe("media research region validation", () => {
  it("accepts Global alongside the supported regional options", () => {
    expect(normaliseMediaResearchRegions(["Global"])).toEqual({ valid: true, regions: ["Global"] });
    expect(normaliseMediaResearchRegions(["UK", "US"])).toEqual({ valid: true, regions: ["UK", "US"] });
  });

  it("rejects invalid region values and malformed payloads", () => {
    expect(normaliseMediaResearchRegions(["Europe"])).toEqual({ valid: false, regions: ["Global"] });
    expect(normaliseMediaResearchRegions("UK")).toEqual({ valid: false, regions: ["Global"] });
  });

  it("defaults absent and empty selections to Global", () => {
    expect(normaliseMediaResearchRegions(undefined)).toEqual({ valid: true, regions: ["Global"] });
    expect(normaliseMediaResearchRegions([])).toEqual({ valid: true, regions: ["Global"] });
  });
});