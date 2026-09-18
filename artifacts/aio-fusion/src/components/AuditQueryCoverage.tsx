import type { PhraseMeasurement } from "../lib/mediaVisibilityImpact";

export function auditQueryCoverageSummary(measurements: PhraseMeasurement[]): string {
  const phrases = new Set(measurements.map((item) => item.phrase.id)).size;
  const queries = new Set(measurements.map((item) => item.effectiveQuery)).size;
  return `${phrases} target phrases · ${queries} distinct target queries · plus a separate identity probe`;
}

export function AuditQueryCoverage({ measurements }: { measurements: PhraseMeasurement[] }) {
  if (!measurements.length) return null;
  return (
    <section className="rounded-2xl border bg-white p-4 sm:p-6 mb-6" aria-label="Queries run">
      <h2 className="text-sm font-bold text-slate-900">Queries run</h2>
      <p className="text-sm text-slate-600 mt-2">{auditQueryCoverageSummary(measurements)}</p>
      <p className="text-xs text-slate-500 mt-2">
        Saved from this run, not current Project Set-Up. Repeated text in different intent groups shares provider checks. Each target query is scheduled twice per provider. Incomplete checks are not confirmed absences.
      </p>
      <div className="overflow-x-auto mt-4">
        <table className="w-full text-xs text-left">
          <thead><tr><th className="p-2">Target phrase / intent</th><th className="p-2">Effective query</th><th className="p-2">Provider</th><th className="p-2">Completed runs</th></tr></thead>
          <tbody>{measurements.map((item) => (
            <tr key={`${item.phrase.id}:${item.provider}`} className="border-t">
              <td className="p-2">{item.phrase.text}<br /><span className="text-slate-500">{item.phrase.intentGroup}</span></td>
              <td className="p-2">{item.effectiveQuery}</td>
              <td className="p-2">{item.provider === "chatgpt" ? "ChatGPT" : "Claude"}</td>
              <td className="p-2">{item.completedRuns}/{item.expectedRuns} · {item.status}{item.failureLabel ? ` · ${item.failureLabel}` : ""}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function auditQueryCoverageHtml(measurements: PhraseMeasurement[]): string {
  if (!measurements.length) return "";
  return `<div class="card"><h2>Queries run</h2><p>${esc(auditQueryCoverageSummary(measurements))}</p>
    <p>Saved from this run, not current Project Set-Up. Repeated text in different intent groups shares provider checks. Each target query is scheduled twice per provider. Incomplete checks are not confirmed absences.</p>
    <table><thead><tr><th>Target phrase / intent</th><th>Effective query</th><th>Provider</th><th>Completed runs</th></tr></thead><tbody>
    ${measurements.map((item) => `<tr><td>${esc(item.phrase.text)}<br />${esc(item.phrase.intentGroup)}</td><td>${esc(item.effectiveQuery)}</td><td>${item.provider === "chatgpt" ? "ChatGPT" : "Claude"}</td><td>${item.completedRuns}/${item.expectedRuns} · ${esc(item.status)}${item.failureLabel ? ` · ${esc(item.failureLabel)}` : ""}</td></tr>`).join("")}
    </tbody></table></div>`;
}