import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { vars } from "../marketing/vars";

export function GenerationProgress({
  stages,
  chars,
  accent = vars.accent,
  compact = false,
}: {
  stages: string[];
  chars: number;
  accent?: string;
  compact?: boolean;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 250);
    return () => clearInterval(id);
  }, []);
  const stageIdx = Math.min(stages.length - 1, Math.floor(elapsed / 6));
  const stage = stages[stageIdx] || stages[stages.length - 1] || "Working…";
  const tint = `${accent}14`;
  return (
    <div
      className={`rounded-lg border ${compact ? "px-3 py-2" : "p-4"}`}
      style={{ borderColor: `${accent}40`, background: tint }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Loader2 size={compact ? 13 : 15} className="animate-spin flex-shrink-0" style={{ color: accent }} />
          <span className={`font-semibold truncate ${compact ? "text-[12px]" : "text-[13px]"}`} style={{ color: accent }}>
            {stage}…
          </span>
        </div>
        <span className={`flex-shrink-0 tabular-nums ${compact ? "text-[10px]" : "text-[11px]"}`} style={{ color: vars.g500 }}>
          {elapsed}s{chars > 0 ? ` · ~${Math.round(chars / 5).toLocaleString()} words` : ""}
        </span>
      </div>
      <div className={`relative overflow-hidden rounded-full ${compact ? "mt-1.5 h-1" : "mt-2.5 h-1.5"}`} style={{ background: `${accent}26` }}>
        <span className="aio-indeterminate-bar" style={{ background: accent }} />
      </div>
      {!compact && (
        <p className="text-[10.5px] font-light mt-2" style={{ color: vars.g500 }}>
          Generating with AI - this can take up to a couple of minutes for longer pieces. You can keep this tab open.
        </p>
      )}
    </div>
  );
}
