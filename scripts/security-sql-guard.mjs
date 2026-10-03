import ts from "typescript";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";

// Deliberately small change detector. It is not proof of parameterization.
const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? files(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]);
const paths = ["artifacts/api-server/src", "lib/db/src"].flatMap(files).sort()
  .filter(path => /\.tsx?$/.test(path) && !/\.(test|spec)\./.test(path));
const exceptions = [];
for (const path of paths) {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  function walk(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        ["raw", "identifier", "query", "unsafe"].includes(node.expression.name.text)) {
      const expression = node.getText(source);
      exceptions.push({ path, expression, digest: createHash("sha256").update(expression).digest("hex") });
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "execute" && node.arguments.some(arg => ts.isTemplateExpression(arg) || ts.isBinaryExpression(arg))) {
      throw new Error(`Unreviewed interpolated execute string in ${path}`);
    }
    ts.forEachChild(node, walk);
  }
  walk(source);
}
const reviewed = JSON.parse(readFileSync("docs/security/sql-exceptions.json", "utf8"));
if (JSON.stringify(exceptions) !== JSON.stringify(reviewed)) {
  console.error("SQL exceptions changed. Trace input origins, record review and update sql-exceptions.json only after approval.");
  process.exit(1);
}
console.log(`SQL exception change guard passed: ${exceptions.length} reviewed call sites. This does not prove absence of SQL injection.`);