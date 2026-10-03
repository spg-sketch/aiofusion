import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

// Discovery only needs a fixed directory and a .tsx suffix. Avoid a glob
// parser entirely, while retaining fast-glob's hidden/underscore exclusions
// and file/directory symlink support.
export async function discoverMockupFiles(root: string): Promise<string[]> {
  const base = path.join(root, "src/components/mockups");
  const files: string[] = [];
  let resolvedBase: string;
  try {
    resolvedBase = await realpath(base);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }

  async function walk(
    directory: string,
    relative: string,
    ancestors: ReadonlySet<string>,
  ): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }

    for (const entry of entries) {
      if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
      const absolute = path.join(directory, entry.name);
      const relativePath = path.posix.join(relative, entry.name);
      let info: Pick<typeof entry, "isDirectory" | "isFile"> = entry;
      if (entry.isSymbolicLink()) {
        try {
          info = await stat(absolute);
        } catch (error) {
          if (isMissing(error)) continue;
          throw error;
        }
      }
      if (info.isDirectory()) {
        let resolved: string;
        try {
          resolved = await realpath(absolute);
        } catch (error) {
          if (isMissing(error)) continue;
          throw error;
        }
        // An ancestor-only guard prevents cycles without dropping a second
        // legitimate alias to the same component directory.
        if (ancestors.has(resolved)) continue;
        await walk(absolute, relativePath, new Set([...ancestors, resolved]));
      } else if (info.isFile() && entry.name.endsWith(".tsx")) {
        files.push(relativePath);
      }
    }
  }

  await walk(base, "src/components/mockups", new Set([resolvedBase]));
  return files.sort();
}