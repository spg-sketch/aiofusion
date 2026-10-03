import { readFileSync, writeFileSync } from "node:fs";

const escape = value => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const documents = [
  ["summary", "Plain-English summary", "summary.md"],
  ["technical", "Technical evidence report", "technical-report.md"],
  ["coverage", "Family coverage matrix", "coverage.md"],
  ["database", "Database safety evidence", "database-evidence.md"],
  ["ledger", "Executed test ledger", "evidence-ledger.json"],
  ["api", "Every discovered API route", "api-coverage.md"],
  ["ui", "UI and background input register", "ui-coverage.md"],
];
const sections = documents.map(([id, title, file]) => `<section id="${id}"><h2>${title}</h2><pre>${escape(readFileSync(`docs/security/${file}`, "utf8"))}</pre></section>`).join("");
writeFileSync("docs/security/aio-fusion-security-audit.html", `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AIO Fusion security audit</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#14253e;margin:0;background:#f4f6f9}main{max-width:1180px;margin:auto;padding:32px}header,section{background:white;border:1px solid #dae1ea;border-radius:10px;padding:24px;margin:20px 0}h1{font-size:30px;line-height:1.25}h2{font-size:23px}nav{display:flex;flex-wrap:wrap;gap:14px}a{color:#a72064}pre{font:14px/1.65 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere}.notice{border-left:4px solid #a72064;padding-left:16px}@media print{body{background:white}main{padding:0}section{break-before:page;border:0;padding:0}nav{display:none}pre{font-size:10px}}</style><main><header><h1>AIO Fusion security audit</h1><p class="notice">Local source and isolated test evidence. Not certification of the published deployment. No production changes or paid calls.</p><nav>${documents.map(([id,title])=>`<a href="#${id}">${title}</a>`).join("")}</nav></header>${sections}</main></html>`);
console.log("Self-contained audit report written to docs/security/aio-fusion-security-audit.html");