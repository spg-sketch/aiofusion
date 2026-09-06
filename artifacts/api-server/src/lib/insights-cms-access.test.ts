import { describe, expect, it } from "vitest";
import { canAccessInsightsCms } from "./insights-cms-access";

describe("canAccessInsightsCms", () => {
  it("keeps existing platform admins eligible without a modern user row", () => {
    expect(canAccessInsightsCms("admin", undefined)).toBe(true);
  });

  it("allows verified AIO Fusion Google and Microsoft identities", () => {
    expect(canAccessInsightsCms("user", {
      email: " Editor@AIOFUSION.AI ",
      emailVerified: true,
      googleId: "google-1",
    })).toBe(true);
    expect(canAccessInsightsCms("client", {
      email: "editor@aiofusion.ai",
      emailVerified: true,
      microsoftId: "microsoft-1",
    })).toBe(true);
  });

  it("rejects unverified, password-only, and lookalike domain accounts", () => {
    expect(canAccessInsightsCms("user", {
      email: "editor@aiofusion.ai",
      emailVerified: false,
      googleId: "google-1",
    })).toBe(false);
    expect(canAccessInsightsCms("user", {
      email: "editor@aiofusion.ai",
      emailVerified: true,
    })).toBe(false);
    expect(canAccessInsightsCms("user", {
      email: "editor@sub.aiofusion.ai",
      emailVerified: true,
      googleId: "google-1",
    })).toBe(false);
    expect(canAccessInsightsCms("user", {
      email: "editor@aiofusion.ai.example",
      emailVerified: true,
      microsoftId: "microsoft-1",
    })).toBe(false);
  });
});