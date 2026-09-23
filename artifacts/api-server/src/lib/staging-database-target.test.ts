import { describe, expect, it } from "vitest";
import { bindStagingDatabaseTarget } from "./staging-database-target";

describe("bindStagingDatabaseTarget", () => {
  it("binds staging to the dedicated beta database before startup", () => {
    const env = {
      DEPLOYMENT_ENV: "staging",
      DATABASE_URL: "postgres://managed-deployment/database",
      BETA_DATABASE_URL: "postgres://beta/database",
      PRODUCTION_DATABASE_URL: "postgres://production/database",
    };

    bindStagingDatabaseTarget(env);

    expect(env.DATABASE_URL).toBe(env.BETA_DATABASE_URL);
  });

  it("fails closed when staging has no beta database", () => {
    expect(() =>
      bindStagingDatabaseTarget({
        DEPLOYMENT_ENV: "staging",
        DATABASE_URL: "postgres://managed-deployment/database",
      }),
    ).toThrow("BETA_DATABASE_URL is required");
  });

  it("rejects a beta database that equals production", () => {
    expect(() =>
      bindStagingDatabaseTarget({
        DEPLOYMENT_ENV: "staging",
        BETA_DATABASE_URL: "postgres://production/database",
        PRODUCTION_DATABASE_URL: "postgres://production/database",
      }),
    ).toThrow("must not equal PRODUCTION_DATABASE_URL");
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