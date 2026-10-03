import ts from "typescript";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

// Source inventory, not a taint analyser. No network or database access.
const root = resolve(import.meta.dirname, "..");
const out = join(root, "docs/security");
mkdirSync(out, { recursive: true });
const files = (dir) => readdirSync(join(root, dir), { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? files(join(dir, e.name)) :
    /\.(ts|tsx|mjs)$/.test(e.name) && !/\.(test|spec)\./.test(e.name) ? [join(dir, e.name)] : []);
const apiFiles = files("artifacts/api-server/src");
const webFiles = files("artifacts/aio-fusion/src");
const parse = path => ts.createSourceFile(path, readFileSync(join(root, path), "utf8"), ts.ScriptTarget.Latest, true);
const visit = (node, fn) => { fn(node); ts.forEachChild(node, child => visit(child, fn)); };
const line = (source, node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
const unique = values => [...new Set(values)];
const clip = text => text.replace(/\s+/g, " ").slice(0, 200);
function reachable(start, paths) {
  const available = new Set(paths.map(p => resolve(root, p)));
  const seen = new Set();
  function walk(path) {
    if (seen.has(path)) return;
    seen.add(path);
    const source = parse(relative(root, path));
    visit(source, node => {
      let spec;
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) spec = node.moduleSpecifier.text;
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          ts.isStringLiteral(node.arguments[0])) spec = node.arguments[0].text;
      if (!spec) return;
      const base = spec.startsWith(".") ? resolve(dirname(path), spec) :
        spec.startsWith("@/") ? resolve(root, "artifacts/aio-fusion/src", spec.slice(2)) : null;
      if (!base) return;
      const target = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]
        .find(candidate => available.has(candidate));
      if (target) walk(target);
    });
  }
  walk(resolve(root, start));
  return seen;
}
const apiReach = reachable("artifacts/api-server/src/index.ts", apiFiles);
const webReach = reachable("artifacts/aio-fusion/src/main.tsx", webFiles);
const routes = [], mounts = [], sinks = [], controls = [], callers = [];
for (const path of [...apiFiles, ...files("lib/db/src")]) {
  const source = parse(path);
  const production = apiReach.has(resolve(root, path)) || path.startsWith("lib/db/");
  const constants = new Map();
  const initializers = new Map();
  const parameterChoices = new Map();
  const handlers = new Map();
  visit(source, n => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.isStringLiteral(n.initializer)) constants.set(n.name.text, n.initializer.text);
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) initializers.set(n.name.text, n.initializer);
    if (ts.isFunctionDeclaration(n) && n.name) handlers.set(n.name.text, n);
  });
  visit(source, n => {
    if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression)) return;
    const factory = handlers.get(n.expression.text);
    if (!factory) return;
    factory.parameters.forEach((parameter, index) => {
      const argument = n.arguments[index];
      if (ts.isIdentifier(parameter.name) && argument && ts.isStringLiteral(argument)) {
        parameterChoices.set(parameter.name.text, unique([...(parameterChoices.get(parameter.name.text) ?? []), argument.text]));
      }
    });
  });
  const pathChoices = n => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return [n.text];
    if (ts.isIdentifier(n) && constants.has(n.text)) return [constants.get(n.text)];
    if (ts.isIdentifier(n) && parameterChoices.has(n.text)) return parameterChoices.get(n.text);
    if (ts.isIdentifier(n) && initializers.has(n.text)) return pathChoices(initializers.get(n.text));
    if (ts.isConditionalExpression(n)) return [...pathChoices(n.whenTrue), ...pathChoices(n.whenFalse)];
    if (ts.isTemplateExpression(n)) {
      let values = [n.head.text];
      for (const span of n.templateSpans) values = values.flatMap(prefix => pathChoices(span.expression).map(value => prefix + value + span.literal.text));
      return values;
    }
    return [];
  };
  visit(source, node => {
    if (ts.isTaggedTemplateExpression(node) && /^sql(?:<|$)/.test(node.tag.getText(source))) {
      sinks.push({ path, line: line(source, node), production, kind: "tagged SQL",
        expression: node.getText(source), review: "Interpolation uses Drizzle binding unless nested SQL/raw; see raw exceptions and database review." });
    }
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return;
    const method = node.expression.name.text;
    const receiver = node.expression.expression.getText(source);
    if (["raw", "identifier", "query", "execute", "unsafe"].includes(method)) {
      sinks.push({ path, line: line(source, node), production, kind: `${receiver}.${method}`,
        expression: node.getText(source), review: "Requires source trace; pattern alone is not a vulnerability." });
    }
    if (!/(?:router|^app)$/i.test(receiver) || !["get", "post", "put", "patch", "delete", "head", "options", "use"].includes(method)) return;
    if (method === "use") { mounts.push({ path, line: line(source, node), expression: node.getText(source) }); return; }
    const url = node.arguments[0];
    if (!url) return;
    const urls = unique(pathChoices(url));
    if (!urls.length) throw new Error(`Unresolved route expression in ${path}: ${url.getText(source)}. Manually reconcile before claiming coverage.`);
    const referencedHandlers = node.arguments.slice(1).filter(ts.isIdentifier).map(n => handlers.get(n.text)).filter(Boolean);
    const text = [node.getText(source), ...referencedHandlers.map(n => n.getText(source))].join("\n");
    const inputs = [], validation = [], checks = [];
    const trace = child => {
      if ((ts.isPropertyAccessExpression(child) || ts.isElementAccessExpression(child)) &&
          /^req\.(body|query|params|headers|cookies)\b/.test(child.getText(source))) inputs.push(child.getText(source));
      if (ts.isVariableDeclaration(child) && child.initializer && /req\.body/.test(child.initializer.getText(source))) {
        inputs.push(child.name.getText(source));
      }
      if (ts.isIfStatement(child)) validation.push(clip(child.expression.getText(source)));
      if (ts.isCallExpression(child) && /guard|require|canManage|canSee|canWrite|canAccess|inAssigned|isImpersonated|isRestricted|validate|safeParse|\.parse$/.test(child.expression.getText(source))) checks.push(clip(child.getText(source)));
    };
    for (const tree of [node, ...referencedHandlers]) visit(tree, trace);
    const declarations = unique(text.match(/\b\w+Table\b/g) ?? []);
    for (const routeUrl of urls) routes.push({ method: method.toUpperCase(), route: routeUrl.startsWith("/api/") ? routeUrl : `/api${routeUrl}`,
      path, line: line(source, node), production, inputs: unique(inputs),
      declaredMiddleware: node.arguments.slice(1).filter(a => !ts.isArrowFunction(a) && !ts.isFunctionExpression(a)).map(a => a.getText(source)),
      boundaryChecks: unique(checks), validationConditions: unique(validation), directTables: declarations,
      calls: unique([...text.matchAll(/\b([a-zA-Z]\w*)\(/g)].map(m => m[1])),
      destinations: unique(text.match(/\b(?:fetch|send\w*Email|deliverContactEmails|streamClaude|streamOpenAI|fetch\w*|getUncachableStripeClient|upload\w*|download\w*)\b/g) ?? []),
      outcome: "Inventoried; family-level source review in report. No blanket safety claim.",
      testCoverage: "See evidence ledger and family matrix; presence of a test file is not execution proof." });
  });
}
for (const path of webFiles) {
  const source = parse(path);
  const production = webReach.has(resolve(root, path));
  visit(source, node => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        /^(input|textarea|select|form|Input|Textarea|Select|.*Editor|.*Upload|.*Form)$/.test(node.tagName.getText(source))) {
      controls.push({ path, line: line(source, node), production, element: node.tagName.getText(source),
        attributes: node.attributes.getText(source), outcome: "UI control inventory; not browser validation evidence." });
    }
    if (ts.isJsxAttribute(node) && ["contentEditable", "onSubmit", "onPaste", "onDrop", "dangerouslySetInnerHTML"].includes(node.name.getText(source))) {
      controls.push({ path, line: line(source, node), production, element: node.name.getText(source), attributes: node.getText(source), outcome: "Non-native input or HTML sink; review family matrix." });
    }
    if (ts.isCallExpression(node) && /fetch|apiRequest|localStorage|URLSearchParams|\\.write$|\\.setContent$/.test(node.expression.getText(source))) {
      callers.push({ path, line: line(source, node), production, expression: clip(node.getText(source)) });
    }
  });
}
const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const inventory = { revision, generatedAt: new Date().toISOString(), methodology:
  "TypeScript AST literal route registrations plus same-source import graph. Tables/calls/conditions are trace aids, not inferred validation or safety. Global mounts are separate. External aliases, computed routes, delegated helpers and runtime feature gates require manual reconciliation.",
  routes, mounts, sinks, controls, callers };
writeFileSync(join(out, "input-inventory.json"), JSON.stringify(inventory, null, 2) + "\n");
const cell = value => String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
writeFileSync(join(out, "api-coverage.md"), `# API entry-point coverage\n\nSource: ${revision}. Generated with \`node scripts/security-inventory.mjs\`. Read alongside [family matrix](coverage.md) and [report](technical-report.md). Every row has a source link; conditions are recorded verbatim in input-inventory.json. An empty direct-table column does not prove a route is database-free: helpers may perform queries. Router middleware and role checks must be combined, never inferred from URL names. All literal registrations are retained, including non-production ones, to avoid silently dropping scope.\n\n| Route | Source | Reachable import | Inputs | Declared guards / checks | Direct database tables or destination | Review / tests |\n|---|---|---|---|---|---|---|\n` +
routes.map(r => `| ${cell(r.method)} ${cell(r.route)} | ${r.path}:${r.line} | ${r.production ? "yes" : "not established"} | ${cell(r.inputs.join(", ")) || "No explicit request fields; see helper calls"} | ${cell([...r.declaredMiddleware, ...r.boundaryChecks].join("; ")) || "See global middleware / public route"} | ${cell([...r.directTables, ...r.destinations].join(", ")) || "Delegated helpers, response, or no sink; inspect source"} | ${cell(r.outcome)} ${cell(r.testCoverage)} |`).join("\n") + "\n");
writeFileSync(join(out, "ui-coverage.md"), `# UI input and background-source inventory\n\nSource: ${revision}. Native controls, editor/paste/drop/HTML sinks and API/storage/URL callers are listed separately so non-form inputs are not excluded. Import-reachable means potentially shipped, not that every route or feature flag is enabled. Unreachable legacy components are not reportable without another caller. Family mapping, outcomes and executed test limits are in coverage.md. No untested row is labelled safe.\n\n| Source | Import reachable | Input or caller | Attributes / expression | Outcome |\n|---|---|---|---|---|\n` +
[...controls, ...callers].map(r => `| ${r.path}:${r.line} | ${r.production ? "yes" : "not established"} | ${cell(r.element ?? "API / storage / URL / export")} | ${cell(r.attributes ?? r.expression)} | ${cell(r.outcome ?? "Trace via family matrix; individual UI behaviour not exercised")} |`).join("\n") + "\n");
console.log(JSON.stringify({ revision, routes: routes.length, reachableRoutes: routes.filter(r => r.production).length, controls: controls.length, callers: callers.length, sinks: sinks.length }));