import { describe, expect, it } from "vitest";
import { assertDraftBatchTarget } from "./howto-draft-batch";

const base = { DEPLOYMENT_ENV: "development", DATABASE_URL: "postgres://user@dev.test/db" };
describe("explicit How-to draft target", () => {
  it("accepts explicitly matched nonproduction targets", () => {
    expect(() => assertDraftBatchTarget("development", base)).not.toThrow();
    expect(() => assertDraftBatchTarget("staging", { ...base, DEPLOYMENT_ENV: "staging" })).not.toThrow();
  });
  it("refuses unknown, production, mismatched and protected databases without exposing URLs", () => {
    for (const [target, env] of [
      ["production", base], [undefined, base], ["staging", base],
      ["development", { ...base, DEPLOYMENT_ENV: "production" }],
      ["development", { ...base, PRODUCTION_DATABASE_URL: "postgres://other@dev.test/db" }],
      ["development", { ...base, BETA_DATABASE_URL: "postgres://other@dev.test/db" }],
      ["development", { ...base, DEPLOYMENT_ENV: "", NODE_ENV: "production" }],
    ] as const) expect(() => assertDraftBatchTarget(target, env)).toThrow();
  });
});