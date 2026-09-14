import { describe, expect, it } from "vitest";
import { refinementAdjustment } from "./media-db";

const contact = (overrides: Partial<Parameters<typeof refinementAdjustment>[0]> = {}) => ({
  id: 1,
  beats: ["renewable energy"],
  sectors: ["technology"],
  geography: "UK",
  role: "Senior energy correspondent",
  outletCategory: "Trade press",
  ...overrides,
});

describe("media recommendation refinement similarity", () => {
  it("deterministically scores all observable similarity signals", () => {
    const result = refinementAdjustment(contact({ id: 2 }), contact());
    expect(result).toEqual({
      points: 40,
      signals: ["similar beats", "similar sectors", "similar geography", "similar outlet category", "similar role"],
    });
  });

  it("does not infer similarity from unrelated contact fields", () => {
    expect(refinementAdjustment(contact({
      id: 2,
      beats: ["fashion"],
      sectors: ["retail"],
      geography: "US",
      role: "Lifestyle writer",
      outletCategory: "Consumer",
    }), contact())).toEqual({ points: 0, signals: [] });
  });
});