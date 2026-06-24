import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";

interface CountdownBannerProps {
  active: boolean;
  durationSeconds: number;
  label?: string;
  sampleCount?: number;
}

function formatMmSs(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function CountdownBanner({
  active,
  durationSeconds,
  label = "Your report is being prepared",
  sampleCount,
}: CountdownBannerProps) {
  const [remaining, setRemaining] = useState(durationSeconds);
  const [overtime, setOvertime] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) {
      setRemaining(durationSeconds);
      setOvertime(0);
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    setRemaining(durationSeconds);
    setOvertime(0);

    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev > 0) {
          return prev - 1;
        }
        setOvertime((o) => o + 1);
        return 0;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active, durationSeconds]);

  if (!active) return null;

  const finished = remaining === 0;
  const basisNote =
    sampleCount && sampleCount > 0
      ? `Based on your last ${sampleCount} audit${sampleCount === 1 ? "" : "s"}`
      : null;

  return (
    <div
      className="w-full rounded-xl px-4 py-3 flex items-center gap-3"
      style={{
        background: "linear-gradient(135deg, #e0f2f7 0%, #f0f8fb 100%)",
        border: "1px solid rgba(31,116,143,0.25)",
      }}
      role="status"
      aria-live="polite"
    >
      <div
        className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
        style={{ background: "rgba(31,116,143,0.12)" }}
      >
        <Clock size={18} style={{ color: "#1f748f" }} />
      </div>
      <div className="flex-1 min-w-0">
        {finished ? (
          <>
            <p className="text-[13px] font-semibold" style={{ color: "#102B36" }}>
              Still working — almost there…
            </p>
            <p className="text-[11px] mt-0.5 font-light" style={{ color: "#374151" }}>
              You can switch tabs but please keep this tab open.
            </p>
          </>
        ) : (
          <>
            <p className="text-[13px] font-semibold" style={{ color: "#102B36" }}>
              {label} — ready in approximately{" "}
              <span style={{ color: "#1f748f", fontVariantNumeric: "tabular-nums" }}>
                {formatMmSs(remaining)}
              </span>
            </p>
            <p className="text-[11px] mt-0.5 font-light" style={{ color: "#374151" }}>
              You can switch tabs but please keep this tab open.
              {basisNote && (
                <span style={{ color: "#6b7280" }}>{" "}· {basisNote}</span>
              )}
            </p>
          </>
        )}
      </div>
      <div
        className="flex-shrink-0 text-[18px] font-bold tabular-nums"
        style={{ color: "#1f748f", minWidth: 52, textAlign: "right" }}
        aria-hidden="true"
      >
        {finished ? (
          <span style={{ color: "#b45309", fontSize: 13, fontWeight: 600 }}>
            +{formatMmSs(overtime)}
          </span>
        ) : (
          formatMmSs(remaining)
        )}
      </div>
    </div>
  );
}
