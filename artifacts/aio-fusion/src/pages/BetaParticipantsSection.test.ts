import { describe, expect, it } from "vitest";
import { classifyBetaParticipant, type SubscriptionRow } from "./BetaParticipantsSection";

const NOW = new Date("2026-09-06T12:00:00.000Z");

function row(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    username: "client",
    displayName: "Client",
    role: "client",
    subscriptionStatus: "none",
    plan: null,
    actionsLast30Days: 0,
    discount: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    freeAccess: false,
    betaTrialStartedAt: "2026-07-15T12:00:00.000Z",
    betaTrialEndsAt: "2026-09-13T12:00:00.000Z",
    betaTrialStatus: "active",
    betaDaysRemaining: 7,
    activeProjectCount: 1,
    projectAllowance: 2,
    ...overrides,
  };
}

describe("classifyBetaParticipant", () => {
  it("does not classify accounts that are only eligible for a trial", () => {
    expect(classifyBetaParticipant(row({
      betaTrialStartedAt: null,
      betaTrialEndsAt: null,
      betaTrialStatus: "eligible",
    }), NOW)).toBeNull();
  });

  it("separates current, expiring and expired participants", () => {
    expect(classifyBetaParticipant(row({ betaTrialEndsAt: "2026-09-20T12:00:00.000Z" }), NOW)).toBe("current");
    expect(classifyBetaParticipant(row({ betaTrialEndsAt: "2026-09-10T12:00:00.000Z" }), NOW)).toBe("expiring");
    expect(classifyBetaParticipant(row({
      betaTrialEndsAt: "2026-09-05T12:00:00.000Z",
      betaTrialStatus: "expired",
    }), NOW)).toBe("expired");
  });
});