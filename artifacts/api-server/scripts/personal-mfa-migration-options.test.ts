import { describe, expect, it } from "vitest";
import { parseMigrationOptions } from "./personal-mfa-migration-options";

describe("personal MFA migration command safety", () => {
  const base = ["--environment=staging", "--workspace=admin"];
  const approved = [...base, "--apply", "--action=recovery", "--database-fingerprint=reviewed",
    "--operator-user-id=owner", "--target-user-id=target", "--confirm-target-email=person@example.test",
    "--approval-reference=approved-change", "--owner-access-verified"];
  it("defaults to read-only with explicitly named environment", () => {
    expect(parseMigrationOptions(base).apply).toBe(false);
    expect(() => parseMigrationOptions(["--workspace=admin"])).toThrow();
    expect(() => parseMigrationOptions(["--environment=staging"])).toThrow();
  });
  it("requires every approval and retained access condition for writes", () => {
    expect(parseMigrationOptions(approved).apply).toBe(true);
    for (const flag of approved.filter(x => !base.includes(x) && x !== "--apply")) {
      expect(() => parseMigrationOptions(approved.filter(x => x !== flag))).toThrow();
    }
  });
  it("rejects code arguments, typos, duplicate flags and ambiguous booleans", () => {
    for (const bad of ["--code=123456", "--dryrun", "--apply=false", "--environment=production"]) {
      expect(() => parseMigrationOptions([...base, bad])).toThrow();
    }
  });
});