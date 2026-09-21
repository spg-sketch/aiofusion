import { beforeEach, describe, expect, it } from "vitest";
import {
  getAuditDurationSeconds,
  getAuditSampleCount,
  recordAuditDuration,
} from "./auditTiming";

describe("Content Optimiser timing", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts at 90 seconds when no measured run exists", () => {
    expect(getAuditDurationSeconds("content-optimise")).toBe(90);
    expect(getAuditSampleCount("content-optimise")).toBe(0);
  });

  it("ignores timing records from the old underestimated baseline", () => {
    localStorage.setItem("aio.auditTiming.content-optimise", JSON.stringify([30_000]));

    expect(getAuditDurationSeconds("content-optimise")).toBe(90);
    expect(getAuditSampleCount("content-optimise")).toBe(0);
  });

  it("uses actual successful wall-clock durations for later estimates", () => {
    recordAuditDuration("content-optimise", 84_000, 90_000);

    expect(getAuditDurationSeconds("content-optimise")).toBe(84);
    expect(getAuditSampleCount("content-optimise")).toBe(1);
  });
});