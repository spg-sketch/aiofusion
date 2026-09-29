import { describe, expect, it } from "vitest";
import { bindPublishedDatabaseTarget } from "./published-database-target";

describe("bindPublishedDatabaseTarget", () => {
  it.each(["staging", "production"])(
    "binds %s to this project's main published database before startup",
    (mode) => {
      const env = {
        DEPLOYMENT_ENV: mode,
        DATABASE_URL: "postgres://managed-deployment/database",
        BETA_DATABASE_URL: "postgres://beta/database",
        PRODUCTION_DATABASE_URL: "postgres://production/database",
      };

      bindPublishedDatabaseTarget(env);

      expect(env.DATABASE_URL).toBe(env.PRODUCTION_DATABASE_URL);
      expect(env.DATABASE_URL).not.toBe(env.BETA_DATABASE_URL);
    },
  );

  it.each(["staging", "production"])(
    "fails closed when %s has no main database target",
    (mode) => {
      expect(() =>
        bindPublishedDatabaseTarget({
          DEPLOYMENT_ENV: mode,
          DATABASE_URL: "postgres://managed-deployment/database",
          BETA_DATABASE_URL: "postgres://beta/database",
        }),
      ).toThrow("PRODUCTION_DATABASE_URL is required");
    },
  );

  it.each(["staging", "production"])(
    "rejects a %s main target that equals the separate beta database",
    (mode) => {
      expect(() =>
        bindPublishedDatabaseTarget({
          DEPLOYMENT_ENV: mode,
          BETA_DATABASE_URL: "postgres://production/database",
          PRODUCTION_DATABASE_URL: "postgres://production/database",
        }),
      ).toThrow("must not equal BETA_DATABASE_URL");
    },
  );

  it("leaves development database selection unchanged", () => {
    const env = {
      DEPLOYMENT_ENV: "development",
      DATABASE_URL: "postgres://development/database",
    };

    bindPublishedDatabaseTarget(env);

    expect(env.DATABASE_URL).toBe("postgres://development/database");
  });
});