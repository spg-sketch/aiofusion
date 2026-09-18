import { afterEach, describe, expect, it } from "vitest";
import { consumeOauthMfaToken, parseOauthMfaMode } from "./PlatformHomePage";

afterEach(() => {
  document.cookie = "aio_oauth_mfa_token=; path=/; max-age=0";
});

describe("OAuth MFA mode capture", () => {
  it("parses recovery separately from ordinary verification and enrolment", () => {
    expect(parseOauthMfaMode(new URLSearchParams("mfa_mode=recover"))).toEqual({ enroll: false, recover: true });
    expect(parseOauthMfaMode(new URLSearchParams("mfa_mode=enroll"))).toEqual({ enroll: true });
    expect(parseOauthMfaMode(new URLSearchParams())).toEqual({ enroll: false });
  });

  it("decodes and clears the single-use OAuth MFA cookie", () => {
    document.cookie = "aio_oauth_mfa_token=recovery%20credential; path=/";
    expect(consumeOauthMfaToken()).toBe("recovery credential");
    expect(document.cookie).not.toContain("aio_oauth_mfa_token=");
    expect(consumeOauthMfaToken()).toBe("");
  });
});