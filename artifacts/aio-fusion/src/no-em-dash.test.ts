import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

// GUARD: no em dashes anywhere in site content - the owner's standing rule.
// If this test fails, replace the em dash (U+2014) with a plain hyphen ( - ).
const EM_DASH = /[\u2014\u2015]/;
const TEXT_EXTS = new Set([".ts", ".tsx", ".css", ".html", ".md", ".txt", ".json", ".svg", ".xml"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "assets", "videos", "images"]);

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) collectFiles(p, out);
    else if (TEXT_EXTS.has(extname(name))) out.push(p);
  }
  return out;
}

describe("no em dashes in site content", () => {
  it("no text file under src/ or public/ contains an em dash", () => {
    const roots = [join(__dirname), join(__dirname, "..", "public")];
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of collectFiles(root)) {
        const content = readFileSync(file, "utf8");
        if (EM_DASH.test(content)) {
          const line = content.split("\n").findIndex((l) => EM_DASH.test(l)) + 1;
          offenders.push(`${file}:${line}`);
        }
      }
    }
    expect(offenders, `Em dashes found (replace with " - "):\n${offenders.join("\n")}`).toEqual([]);
  });
});
