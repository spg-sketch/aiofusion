import { Download } from "lucide-react";
import { vars } from "../marketing/vars";

export type MediaExportFormat = "xlsx" | "csv";

/** Excel stays the primary action; CSV is a smaller, explicit alternative. */
export function MediaExportDownload({ scope, count, disabled, onDownload }: {
  scope: "saved" | "selected";
  count?: number;
  disabled: boolean;
  onDownload: (format: MediaExportFormat) => void;
}) {
  const label = scope === "saved" ? "Export saved connections" : "Export selected";
  const suffix = scope === "selected" ? ` (${count})` : "";
  return <div className="inline-flex items-center gap-1">
    <button disabled={disabled} onClick={() => onDownload("xlsx")}
      className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
      style={{ borderColor: vars.g200, color: vars.navy }}>
      <Download size={13} /> {label} Excel{suffix}
    </button>
    <button disabled={disabled} onClick={() => onDownload("csv")}
      aria-label={`${label} CSV${suffix}`} title="CSV for importing into other tools (full URLs, no formatting)"
      className="rounded-lg border bg-white px-2 py-2 text-[11px] disabled:opacity-50"
      style={{ borderColor: vars.g200, color: vars.navy }}>
      CSV
    </button>
  </div>;
}