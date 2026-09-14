import { describe, expect, it } from "vitest";
import { daysUntilRenewal, formatSubscriptionEnd } from "./SubscriptionCard";

describe("subscription renewal timing", () => {
  it("formats a valid period end and counts a partial day as one day", () => {
    const now = new Date("2027-04-10T12:00:00.000Z");
    const periodEnd = "2027-04-11T00:00:00.000Z";

    expect(formatSubscriptionEnd(periodEnd)).toBe("11 April 2027");
    expect(daysUntilRenewal(periodEnd, now)).toBe(1);
  });

  it("returns zero at and after the renewal boundary", () => {
    const periodEnd = "2027-04-11T00:00:00.000Z";

    expect(daysUntilRenewal(periodEnd, new Date(periodEnd))).toBe(0);
    expect(daysUntilRenewal(periodEnd, new Date("2027-04-12T00:00:00.000Z"))).toBe(0);
  });

  it("handles missing and malformed dates without producing a date", () => {
    expect(formatSubscriptionEnd(null)).toBeNull();
    expect(formatSubscriptionEnd("not-a-date")).toBeNull();
    expect(daysUntilRenewal(null, new Date("2027-04-10T00:00:00.000Z"))).toBeNull();
    expect(daysUntilRenewal("not-a-date", new Date("2027-04-10T00:00:00.000Z"))).toBeNull();
  });
});