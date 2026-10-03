import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { discoverMockupFiles } from "./mockupDiscovery.ts";

const prefix = "src/components/mockups/";

async function fixture(t, names = []) {
  const root = await mkdtemp(path.join(os.tmpdir(), "mockup-discovery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const name of names) {
    const file = path.join(root, prefix, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "export default null;");
  }
  return root;
}

test("discovers nested .tsx components in deterministic order", async (t) => {
  const root = await fixture(t, [
    "Z.tsx", "nested/B.tsx", "A.tsx", "Other.ts", "Other.jsx", "Wrong.TSX",
  ]);
  assert.deepEqual(await discoverMockupFiles(root), [
    `${prefix}A.tsx`, `${prefix}Z.tsx`, `${prefix}nested/B.tsx`,
  ]);
});

test("excludes hidden and underscore files and entire subtrees", async (t) => {
  const root = await fixture(t, [
    "Visible.tsx", "_Skip.tsx", ".Skip.tsx", "_hidden/Skip.tsx",
    ".hidden/Skip.tsx", "nested/_private/Skip.tsx", "nested/.private/Skip.tsx",
  ]);
  assert.deepEqual(await discoverMockupFiles(root), [`${prefix}Visible.tsx`]);
});

test("treats spaces and braces in filenames literally", async (t) => {
  const root = await fixture(t, ["space name.tsx", "brace{name}.tsx"]);
  assert.deepEqual(await discoverMockupFiles(root), [
    `${prefix}brace{name}.tsx`, `${prefix}space name.tsx`,
  ]);
});

test("preserves directory aliases and file links, skipping broken links", async (t) => {
  const root = await fixture(t, ["nested/Visible.tsx"]);
  const base = path.join(root, prefix);
  await symlink("nested", path.join(base, "alias"), "dir");
  await symlink("nested/Visible.tsx", path.join(base, "linked.tsx"), "file");
  await symlink("absent.tsx", path.join(base, "broken.tsx"), "file");
  assert.deepEqual(await discoverMockupFiles(root), [
    `${prefix}alias/Visible.tsx`,
    `${prefix}linked.tsx`,
    `${prefix}nested/Visible.tsx`,
  ]);
});

test("does not traverse symlink directory cycles", async (t) => {
  const root = await fixture(t, ["nested/Visible.tsx"]);
  await symlink("..", path.join(root, prefix, "nested/cycle"), "dir");
  assert.deepEqual(await discoverMockupFiles(root), [`${prefix}nested/Visible.tsx`]);
});

test("returns an empty list when the mockups directory is absent", async (t) => {
  const root = await fixture(t);
  assert.deepEqual(await discoverMockupFiles(root), []);
});

test("rescans reflect additions and deletions", async (t) => {
  const root = await fixture(t, ["A.tsx"]);
  assert.deepEqual(await discoverMockupFiles(root), [`${prefix}A.tsx`]);
  await writeFile(path.join(root, prefix, "B.tsx"), "export default null;");
  assert.deepEqual(await discoverMockupFiles(root), [`${prefix}A.tsx`, `${prefix}B.tsx`]);
  await rm(path.join(root, prefix, "A.tsx"));
  assert.deepEqual(await discoverMockupFiles(root), [`${prefix}B.tsx`]);
});

test("does not silently swallow filesystem errors", async (t) => {
  const root = await fixture(t);
  await mkdir(path.join(root, "src/components"), { recursive: true });
  await writeFile(path.join(root, "src/components/mockups"), "not a directory");
  await assert.rejects(discoverMockupFiles(root), { code: "ENOTDIR" });
});