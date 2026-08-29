import assert from "node:assert/strict";
import test from "node:test";
import { resolveNotificationSiteUrl } from "./notify";

test("staging ignores a copied production canonical domain", () => {
  assert.equal(
    resolveNotificationSiteUrl({
      DEPLOYMENT_ENV: "staging",
      CANONICAL_DOMAIN: "aiofusion.ai",
    }),
    "https://staging.aiofusion.ai",
  );
});

test("staging prefers its approved custom domain", () => {
  assert.equal(
    resolveNotificationSiteUrl({
      DEPLOYMENT_ENV: "staging",
      CANONICAL_DOMAIN: "https://staging.aiofusion.ai/path",
    }),
    "https://staging.aiofusion.ai",
  );
});

test("staging ignores a production-looking Replit domain", () => {
  assert.equal(
    resolveNotificationSiteUrl({
      DEPLOYMENT_ENV: "staging",
      REPLIT_DOMAINS: "aiofusion.ai",
    }),
    "https://staging.aiofusion.ai",
  );
});

test("staging ignores an unrelated lookalike domain", () => {
  assert.equal(
    resolveNotificationSiteUrl({
      DEPLOYMENT_ENV: "staging",
      CANONICAL_DOMAIN: "staging.attacker.example",
      REPLIT_DOMAINS: "another-staging.attacker.example",
    }),
    "https://staging.aiofusion.ai",
  );
});

test("production always resolves to the apex origin", () => {
  assert.equal(
    resolveNotificationSiteUrl({
      DEPLOYMENT_ENV: "production",
      CANONICAL_DOMAIN: "www.aiofusion.ai",
      REPLIT_DOMAINS: "preview.example.replit.app",
    }),
    "https://aiofusion.ai",
  );
});

test("development can use the first valid Replit domain", () => {
  assert.equal(
    resolveNotificationSiteUrl({
      REPLIT_DOMAINS: "preview.example.replit.app,other.example.replit.app",
    }),
    "https://preview.example.replit.app",
  );
});