import assert from "node:assert/strict";
import test from "node:test";
import {
  sameDatabaseIgnoringCredentials,
  validateSeedEnvironment,
} from "./seed-staging";

const betaUrl = "postgresql://beta-user:secret@beta.example:5432/aio_beta";
const validEnvironment = {
  DATABASE_URL: betaUrl,
  BETA_DATABASE_URL: betaUrl,
  PRODUCTION_DATABASE_URL:
    "postgresql://production-user:secret@production.example:5432/aio_prod",
  STAGING_REVIEW_PASSWORD: "configured-review-value",
};

test("requires the beta, production, and review-password settings", () => {
  for (const key of [
    "BETA_DATABASE_URL",
    "PRODUCTION_DATABASE_URL",
    "STAGING_REVIEW_PASSWORD",
  ] as const) {
    const environment = { ...validEnvironment };
    delete environment[key];
    assert.throws(() => validateSeedEnvironment(environment), new RegExp(key));
  }
});

test("requires DATABASE_URL to exactly equal BETA_DATABASE_URL", () => {
  assert.throws(
    () =>
      validateSeedEnvironment({
        ...validEnvironment,
        DATABASE_URL: `${betaUrl}?sslmode=require`,
      }),
    /exactly match BETA_DATABASE_URL/,
  );
});

test("rejects production when only credentials or query parameters differ", () => {
  assert.throws(
    () =>
      validateSeedEnvironment({
        ...validEnvironment,
        PRODUCTION_DATABASE_URL:
          "postgresql://another-user:another-secret@beta.example:5432/aio_beta?sslmode=require",
      }),
    /production database/,
  );
  assert.equal(
    sameDatabaseIgnoringCredentials(
      betaUrl,
      "postgresql://another-user:another-secret@beta.example:5432/aio_beta?x=1",
    ),
    true,
  );
});