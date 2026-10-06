import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  document.getElementById("aio-analytics-loader")?.remove();
  document.cookie = "_ga=; Max-Age=0; path=/";
});
afterEach(() => vi.restoreAllMocks());

describe("analytics consent", () => {
  it("does not load analytics before a choice or after rejection", async () => {
    const consent = await import("./cookieConsent");
    consent.initialiseCookieConsent();
    expect(document.getElementById("aio-analytics-loader")).toBeNull();
    expect((window as unknown as Record<string, unknown>)[`ga-disable-${consent.ANALYTICS_ID}`]).toBe(true);
    consent.saveCookiePreference(false);
    expect(document.getElementById("aio-analytics-loader")).toBeNull();
    expect(consent.readCookiePreference()?.analytics).toBe(false);
  });
  it("loads once only after acceptance and stops on withdrawal without reloading", async () => {
    const consent = await import("./cookieConsent");
    consent.saveCookiePreference(true);
    expect(document.querySelectorAll("#aio-analytics-loader")).toHaveLength(1);
    consent.saveCookiePreference(true);
    expect(document.querySelectorAll("#aio-analytics-loader")).toHaveLength(1);
    document.cookie = "_ga=test; path=/";
    consent.saveCookiePreference(false);
    expect(document.getElementById("aio-analytics-loader")).toBeNull();
    expect(document.cookie).not.toContain("_ga=");
    expect((window as unknown as Record<string, unknown>)[`ga-disable-${consent.ANALYTICS_ID}`]).toBe(true);
  });
  it("rejects invalid, future and expired preferences", async () => {
    const consent = await import("./cookieConsent");
    for (const saved of [
      "bad json",
      JSON.stringify({ version: 1, analytics: "yes", savedAt: Date.now() }),
      JSON.stringify({ version: 1, analytics: true, savedAt: Date.now() + 100000 }),
      JSON.stringify({ version: 1, analytics: true, savedAt: Date.now() - 181 * 86400000 }),
    ]) {
      localStorage.setItem(consent.CONSENT_KEY, saved);
      expect(consent.readCookiePreference()).toBeNull();
    }
  });
  it("restores a valid accepted preference on a subsequent page load", async () => {
    const consent = await import("./cookieConsent");
    localStorage.setItem(consent.CONSENT_KEY, JSON.stringify({ version: 1, analytics: true, savedAt: Date.now() }));
    consent.initialiseCookieConsent();
    expect(consent.hasCookiePreferenceOnArrival()).toBe(true);
    expect(document.getElementById("aio-analytics-loader")).not.toBeNull();
  });
  it("does not turn a first visit into a returning visit when the choice precedes app mounting", async () => {
    const consent = await import("./cookieConsent");
    consent.initialiseCookieConsent();
    expect(consent.hasCookiePreferenceOnArrival()).toBe(false);
    consent.saveCookiePreference(false);
    expect(consent.readCookiePreference()?.analytics).toBe(false);
    expect(consent.hasCookiePreferenceOnArrival()).toBe(false);
  });
  it("fails closed when storage is blocked and honours the explicit current-tab choice", async () => {
    const consent = await import("./cookieConsent");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(consent.readCookiePreference()).toBeNull();
    expect(consent.saveCookiePreference(false)).toBe(false);
    expect(consent.readCookiePreference()?.analytics).toBe(false);
    expect(document.getElementById("aio-analytics-loader")).toBeNull();
  });
});
