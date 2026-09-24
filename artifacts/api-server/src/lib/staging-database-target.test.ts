import { describe, expect, it } from "vitest";
import { bindStagingDatabaseTarget } from "./staging-database-target";

describe("bindStagingDatabaseTarget", () => {
  it("binds staging to this project's main published database before startup", () => {
    const env = {
      DEPLOYMENT_ENV: "staging",
      DATABASE_URL: "postgres://managed-deployment/database",
      BETA_DATABASE_URL: "postgres://beta/database",
      PRODUCTION_DATABASE_URL: "postgres://production/database",
    };

    bindStagingDatabaseTarget(env);

    expect(env.DATABASE_URL).toBe(env.PRODUCTION_DATABASE_URL);
    expect(env.DATABASE_URL).not.toBe(env.BETA_DATABASE_URL);
  });

  it("fails closed when staging has no main database target", () => {
    expect(() =>
      bindStagingDatabaseTarget({
        DEPLOYMENT_ENV: "staging",
        DATABASE_URL: "postgres://managed-deployment/database",
        BETA_DATABASE_URL: "postgres://beta/database",
      }),
    ).toThrow("PRODUCTION_DATABASE_URL is required");
  });

  it("rejects a main target that equals the separate beta database", () => {
    expect(() =>
      bindStagingDatabaseTarget({
        DEPLOYMENT_ENV: "staging",
        BETA_DATABASE_URL: "postgres://production/database",
        PRODUCTION_DATABASE_URL: "postgres://production/database",
      }),
    ).toThrow("must not equal BETA_DATABASE_URL");
  });

  it("leaves non-staging database selection unchanged", () => {
    const env = {
      DEPLOYMENT_ENV: "production",
      DATABASE_URL: "postgres://production/database",
      BETA_DATABASE_URL: "postgres://beta/database",
    };

    bindStagingDatabaseTarget(env);

    expect(env.DATABASE_URL).toBe("postgres://production/database");
  });
});