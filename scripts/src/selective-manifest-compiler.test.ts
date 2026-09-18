import assert from "node:assert/strict";
import test from "node:test";
import { compileSelectiveManifest, fingerprintManifestInputs, type ManifestInventory } from "./selective-manifest-compiler";
import { computeCanonicalSha256 } from "./selective-migration-readiness";

function fixture(): ManifestInventory {
  const owner = (slug: string, stableId: string) => ({ stableId, slug });
  const admin = owner("admin", "source-admin");
  const aio = owner("aiodemo", "source-aio");
  const projects = Array.from({ length: 15 }, (_, i) => ({
    id: `project-${String(i).padStart(2, "0")}`, name: `Selected ${i}`,
    sourceOwner: i === 4 || i === 12 ? aio : admin,
    targetOwner: i === 4 || i === 12 ? owner("aiodemo", "target-aio") : owner("admin", "target-admin"),
    parentProjectId: null,
  }));
  return {
    sourceProjects: projects,
    accounts: [
      { source: admin, target: owner("admin", "target-admin"), role: "admin", parent: null, action: "reuse" },
      { source: aio, target: owner("aiodemo", "target-aio"), role: "agency", parent: "source-admin", action: "reuse" },
      { source: owner("bluhalo", "source-bluhalo"), target: owner("beta-bluhalo", "generated-bluhalo"), role: "agency", parent: "source-admin", action: "new" },
      { source: owner("natalie1990", "source-natalie"), target: owner("natalie1990", "generated-natalie"), role: "agency", parent: "source-admin", action: "reconstruct" },
    ],
    excludedProjectIds: ["excluded-1"], excludedProjectNames: ["Content Guru"], excludedLogins: ["riseamplify"],
    expectedInsertionCounts: { projects: 15, archive_items: 31, planner_items: 31, project_snapshots: 33, saved_audits: 13, saved_diagnostics: 12, audit_locks: 38, token_usage: 650 },
    sourceFingerprint: { schema: "source-schema", rows: "source-rows" },
    destinationFingerprint: { schema: "destination-schema", rows: "destination-rows" },
  };
}

test("compiles frozen deterministic redacted manifest without approval", () => {
  const first = compileSelectiveManifest(fixture());
  const second = compileSelectiveManifest(fixture());
  assert.deepEqual(first, second);
  assert.equal(first.frozen, false);
  assert.equal(first.draft, true);
  assert.equal(first.reviewed, false);
  assert.equal(first.selectedProjects.length, 15);
  assert.equal(first.entitlements.betaTrial.admin, "none");
  assert.equal(first.entitlements.betaTrial.aiodemo, "new-60-days-from-approved-import");
  assert.equal(first.entitlements.paymentActivation, false);
  assert.equal(first.entitlements.stripeOperations, false);
  assert.equal(first.compatibility.snapshotIdMapRequired, true);
});

test("canonical digest is deterministic and excludes only the self digest field", () => {
  assert.equal(
    computeCanonicalSha256({ z: 1, a: { y: 2, x: 3 } }),
    computeCanonicalSha256({ a: { x: 3, y: 2 }, z: 1 }),
  );
  const manifest = compileSelectiveManifest(fixture());
  assert.equal(manifest.reviewed, false);
  assert.equal(manifest.frozen, false);
  assert.equal(manifest.sha256, computeCanonicalSha256(manifest, true));
});

test("rejects incomplete or broad selection", () => {
  const input = fixture();
  const incomplete = { ...input, sourceProjects: input.sourceProjects.slice(0, 14) };
  assert.throws(() => compileSelectiveManifest(incomplete), /exactly 15/);
});

test("inventory fingerprint changes when evidence changes", () => {
  const input = fixture();
  const first = fingerprintManifestInputs(input);
  const changed = { ...input, excludedLogins: [...input.excludedLogins, "without"] };
  assert.notEqual(first, fingerprintManifestInputs(changed));
});