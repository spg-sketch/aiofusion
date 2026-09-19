import { afterEach, describe, expect, it, vi } from "vitest";
import { addCalendarMonth, createSuppressionMatcherWithDb, isSuppressedWithDb, legalHoldCoversStore, parseLegalHoldScopes, privacyHash, suppressionKeys } from "./journalist-privacy";

afterEach(() => vi.unstubAllEnvs());

describe("journalist privacy policy helpers", () => {
  it("uses calendar month deadlines and clamps month ends", () => {
    expect(addCalendarMonth(new Date("2024-01-31T12:00:00Z")).toISOString()).toBe("2024-02-29T12:00:00.000Z");
    expect(addCalendarMonth(new Date("2024-02-29T12:00:00Z")).toISOString()).toBe("2024-03-29T12:00:00.000Z");
    expect(addCalendarMonth(new Date("2023-12-31T12:00:00Z")).toISOString()).toBe("2024-01-31T12:00:00.000Z");
  });

  it("never creates hashes for blank values", () => {
    expect(privacyHash("  ")).toBeNull();
    expect(suppressionKeys({ name: "Alex Reporter", email: "" })).toEqual({
      emailHash: null,
      nameHash: privacyHash("alex reporter"),
      linkedinHash: null,
      outletHash: null,
    });
  });

  it("normalizes canonical identity components independently", () => {
    const first = suppressionKeys({ name: "  Alex   Reporter ", outlet: "Daily News", email: "ALEX@EXAMPLE.COM" });
    const second = suppressionKeys({ name: "alex reporter", outlet: "daily news", email: "alex@example.com" });
    expect(first).toEqual(second);
    expect(first.nameHash).not.toBeNull();
    expect(first.outletHash).not.toBeNull();
  });

  it("matches legal holds by wildcard, JSON, or comma-delimited store scope", () => {
    expect(parseLegalHoldScopes("source_checks, discoveries")).toEqual(new Set(["source_checks", "discoveries"]));
    expect(legalHoldCoversStore("[\"contacts\",\"outreach_snapshots\"]", "contacts")).toBe(true);
    expect(legalHoldCoversStore("", "anything")).toBe(true);
    expect(legalHoldCoversStore("contacts", "discoveries")).toBe(false);
  });

  it("propagates production suppression query failures instead of failing open", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VITEST", "");
    const error = Object.assign(new Error("Failed query: select from media_suppressions"), { cause: { code: "08006" } });
    const executor = { select: () => ({ from: () => ({ where: () => Promise.reject(error) }) }) };
    await expect(isSuppressedWithDb(executor, { email: "reporter@example.com" })).rejects.toBe(error);
  });

  it("limits missing-table compatibility to tests without poisoning later checks", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VITEST", "true");
    const missing = Object.assign(new Error('relation "media_suppressions" does not exist'), { cause: { code: "42P01" } });
    const missingExecutor = { select: () => ({ from: () => ({ where: () => Promise.reject(missing) }) }) };
    await expect(isSuppressedWithDb(missingExecutor, { email: "reporter@example.com" })).resolves.toBe(false);

    const emailHash = privacyHash("reporter@example.com");
    const workingExecutor = { select: () => ({ from: () => ({ where: () => Promise.resolve([{ active: 1, scope: "shared", emailHash }]) }) }) };
    await expect(isSuppressedWithDb(workingExecutor, { email: "reporter@example.com" })).resolves.toBe(true);
  });

  it("loads suppression rows once for a request-scoped matcher", async () => {
    let queries = 0;
    const executor = {
      select: () => ({
        from: () => ({
          where: async () => {
            queries += 1;
            return [
              { emailHash: privacyHash("blocked@example.com") },
              { nameHash: privacyHash("Alex Reporter"), outletHash: privacyHash("Daily News") },
            ];
          },
        }),
      }),
    };
    const isSuppressed = await createSuppressionMatcherWithDb(executor, "workspace-a");
    expect(isSuppressed({ email: "blocked@example.com" })).toBe(true);
    expect(isSuppressed({ name: "Alex Reporter", outlet: "Daily News" })).toBe(true);
    expect(isSuppressed({ email: "allowed@example.com" })).toBe(false);
    expect(queries).toBe(1);
  });
});