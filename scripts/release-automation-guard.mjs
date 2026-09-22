#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPOSITORY_PUBLICATION_CONFIGS = Object.freeze([
  ".replit",
  ".github/workflows",
  "package.json",
]);

const DIRECT_PUBLISHER_PATTERNS = [
  /\breplit\s+(?:deploy|publish)\b/i,
  /\bdeployment\s+publish\b/i,
  /\bpnpm\s+(?:run\s+)?(?:deploy|publish)(?=\s|$)/i,
  /\bnpm\s+run\s+(?:deploy|publish)(?=\s|$)/i,
  /\byarn\s+(?:deploy|publish)(?=\s|$)/i,
];

const GUARDED_ENTRY_POINT = /\bpnpm\s+run\s+release:publish\s+--\s+/gi;

function findDirectPublisherOffsets(command) {
  const offsets = [];
  for (const pattern of DIRECT_PUBLISHER_PATTERNS) {
    const globalPattern = new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`);
    for (const match of command.matchAll(globalPattern)) offsets.push(match.index);
  }
  return offsets.sort((left, right) => left - right);
}

function assertCommandGuarded(filePath, command, location) {
  const directOffsets = findDirectPublisherOffsets(command);
  if (!directOffsets.length) return;

  const guardOffsets = [...command.matchAll(GUARDED_ENTRY_POINT)].map((match) => ({
    start: match.index,
    publisherStartsAfter: match.index + match[0].length,
  }));

  const unguarded = directOffsets.some((offset) => !guardOffsets.some(
    ({ start, publisherStartsAfter }) => start < offset && publisherStartsAfter <= offset,
  ));

  if (unguarded) {
    throw new Error(
      `Repository-managed publication bypasses the release-evidence guard at ${filePath}:${location}. `
      + "Invoke the publisher through `pnpm run release:publish -- <command> [arguments...]`.",
    );
  }
}

function assertCompoundCommandGuarded(filePath, command, location) {
  const uncommented = command.replace(/\s+#.*$/, "");
  for (const segment of uncommented.split(/\s*(?:&&|\|\||;)\s*/)) {
    assertCommandGuarded(filePath, segment, location);
  }
}

export function assertGuardedStagingAutomation(filePath, source) {
  if (path.basename(filePath) === "package.json") {
    let manifest;
    try {
      manifest = JSON.parse(source);
    } catch (error) {
      throw new Error(`Could not parse ${filePath} while validating release automation.`, { cause: error });
    }
    for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
      if (typeof command === "string") {
        assertCompoundCommandGuarded(filePath, command, `scripts.${name}`);
      }
    }
    return;
  }

  const lines = source.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    assertCompoundCommandGuarded(filePath, line, index + 1);
  }
}

export async function validateReleaseAutomation({
  cwd = process.cwd(),
  read = readFile,
  configs = REPOSITORY_PUBLICATION_CONFIGS,
} = {}) {
  for (const config of configs) {
    const target = path.join(cwd, config);
    let stat;
    try {
      stat = await import("node:fs/promises").then(({ stat: getStat }) => getStat(target));
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }

    if (stat.isDirectory()) {
      const { readdir } = await import("node:fs/promises");
      const entries = await readdir(target, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) continue;
        const relativePath = path.join(config, entry.name);
        assertGuardedStagingAutomation(relativePath, await read(path.join(cwd, relativePath), "utf8"));
      }
    } else {
      assertGuardedStagingAutomation(config, await read(target, "utf8"));
    }
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    await validateReleaseAutomation();
    console.log("[release] Repository publication automation uses the guarded entry point.");
  } catch (error) {
    console.error(`[release] AUTOMATION GUARD FAILED: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  }
}