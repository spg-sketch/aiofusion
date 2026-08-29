import assert from "node:assert/strict";
import test from "node:test";
import {
  normaliseEnvironmentLabel,
  resolveInventoryEnvironment,
} from "./inventory-db";

test("requires an explicit non-secret environment label", () => {
  assert.throws(
    () => resolveInventoryEnvironment(undefined, "postgresql://db.example/app"),
    /INVENTORY_ENV_LABEL is required/,
  );
  assert.throws(
    () => resolveInventoryEnvironment("postgresql://secret", "postgresql://db.example/app"),
    /non-secret descriptive label/,
  );
});

test("normalises descriptive labels", () => {
  assert.equal(normaliseEnvironmentLabel("  Restored-Snapshot  "), "restored-snapshot");
});

test("rejects a staging label for a production-looking target", () => {
  assert.throws(
    () =>
      resolveInventoryEnvironment(
        "staging",
        "postgresql://host.example/aio_fusion_production",
      ),
    /production-looking/,
  );
});

test("accepts explicit production and staging labels", () => {
  assert.deepEqual(
    resolveInventoryEnvironment(
      "production-before-freeze",
      "postgresql://host.example/aio_fusion_production",
    ),
    { label: "production-before-freeze", isProduction: true },
  );
  assert.deepEqual(
    resolveInventoryEnvironment("staging", "postgresql://host.example/aio_fusion_staging"),
    { label: "staging", isProduction: false },
  );
});