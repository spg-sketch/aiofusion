import { Download } from "lucide-react";
import { vars } from "../marketing/vars";

export type MediaExportFormat = "xlsx" | "csv";

/** Customer downloads use one CSV action with an accessible batch description. */
export function MediaExportDownload({ scope, count, disabled, onDownload, master = false }: {
  scope: "saved" | "selected";
  count?: number;
  disabled: boolean;
  onDownload: (format: MediaExportFormat) => void;
  master?: boolean;
}) {
  const label = `Download CSV - ${scope} batch (${count ?? 0} records)`;
  return <div className="inline-flex items-center gap-1">
    {master && <button disabled={disabled} onClick={() => onDownload("xlsx")}
      aria-label={`Download Excel - ${scope} batch (${count ?? 0} records)`}
      className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
      style={{ borderColor: vars.g200, color: vars.navy }}><Download size={13} /> Download Excel</button>}
    <button disabled={disabled} onClick={() => onDownload("csv")} aria-label={label} title={label}
      className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
      style={{ borderColor: vars.g200, color: vars.navy }}>
      <Download size={13} /> Download CSV
    </button>
  </div>;
}