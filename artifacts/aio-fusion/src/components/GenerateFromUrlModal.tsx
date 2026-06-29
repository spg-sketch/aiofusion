import { useState, useRef } from "react";
import { Zap, AlertTriangle, Info, Loader2 } from "lucide-react";
import CountdownBanner from "./CountdownBanner";
import type { GenerateStep } from "../types";

const GENERATE_FROM_URL_TIMEOUT_MS = 130_000;

const GENERATE_STEPS: { key: GenerateStep; label: string }[] = [
  { key: "scraping", label: "Scraping site" },
  { key: "generating", label: "Generating intake" },
  { key: "saving", label: "Saving project" },
  { key: "scoring", label: "Running GEO score" },
  { key: "done", label: "Complete" },
];

const ink = "#102B36";
const accent = "#C8497A";
const accentSoft = "#FBE3ED";

export function GenerateFromUrlModal({
  onCancel,
  onComplete,
}: {
  onCancel: () => void;
  onComplete: (projectId: string, projectName: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [step, setStep] = useState<GenerateStep>("idle");
  const [stepLabel, setStepLabel] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const startRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isRunning = step !== "idle" && step !== "done" && step !== "error";
  const canSubmit = url.trim().length > 0 && !isRunning;

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  async function handleGenerate() {
    if (!canSubmit) return;
    setErrorMsg(null);
    setStep("scraping");
    setStepLabel("Scraping site");
    setElapsed(0);
    startRef.current = Date.now();
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 250);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GENERATE_FROM_URL_TIMEOUT_MS);

    try {
      const base = import.meta.env.DEV ? `https://${window.location.host}` : "";
      const resp = await fetch(`${base}/api/admin/generate-from-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: url.trim(), companyName: companyName.trim() || undefined }),
        signal: controller.signal,
      });

      const contentType = resp.headers.get("content-type") || "";
      if (!contentType.includes("text/event-stream")) {
        const data = await resp.json().catch(() => null);
        throw new Error((data && (data as { error?: string }).error) || "Request failed. Please try again.");
      }
      if (!resp.body) throw new Error("Response stream could not be read.");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let resultProjectId: string | null = null;
      let resultProjectName: string | null = null;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          let event = "message";
          let dataStr = "";
          for (const line of chunk.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
          }
          if (!dataStr) continue;
          let parsed: Record<string, unknown>;
          try { parsed = JSON.parse(dataStr); } catch { continue; }

          if (event === "step") {
            const label = typeof parsed.label === "string" ? parsed.label : "";
            setStepLabel(label);
            if (label.toLowerCase().includes("scraping")) setStep("scraping");
            else if (label.toLowerCase().includes("generating")) setStep("generating");
            else if (label.toLowerCase().includes("saving")) setStep("saving");
            else if (label.toLowerCase().includes("scoring") || label.toLowerCase().includes("geo")) setStep("scoring");
          } else if (event === "result") {
            resultProjectId = typeof parsed.projectId === "string" ? parsed.projectId : null;
            resultProjectName = typeof parsed.projectName === "string" ? parsed.projectName : "New Project";
            setStep("done");
          } else if (event === "error") {
            throw new Error(typeof parsed.error === "string" ? parsed.error : "Something went wrong. Please try again.");
          }
        }
      }

      if (!resultProjectId) throw new Error("The project was not created. Please try again.");
      stopTimer();
      onComplete(resultProjectId, resultProjectName!);
    } catch (err: unknown) {
      stopTimer();
      if (err instanceof DOMException && err.name === "AbortError") {
        setErrorMsg("This is taking longer than expected and timed out. Please try again.");
      } else {
        setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      }
      setStep("error");
    } finally {
      clearTimeout(timeout);
    }
  }

  const stepIdx = GENERATE_STEPS.findIndex((s) =>
    stepLabel ? stepLabel.toLowerCase().includes(s.label.split(" ")[0].toLowerCase()) : s.key === step
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-['Inter',sans-serif]"
      style={{ background: "rgba(16,43,54,0.45)" }}
      onClick={() => { if (!isRunning) onCancel(); }}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-7 sm:p-8"
        style={{ background: "white", border: `1px solid #E4DDD0` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.22em] mb-4"
          style={{ background: accentSoft, border: `1px solid ${accent}40`, color: accent }}
        >
          <Zap size={12} /> Admin Tool
        </div>
        <h2 className="text-2xl mb-2" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>
          Generate project from URL
        </h2>
        <p className="text-[14px] font-light mb-5 leading-relaxed" style={{ color: "#6B7280" }}>
          Enter a company website URL. AIO Fusion will scrape the site, populate all Set-Up fields using Claude, and run an initial GEO score - all in one step.
        </p>

        <label className="block text-[11px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: "#6B7280" }}>
          Website URL <span style={{ color: accent }}>*</span>
        </label>
        <input
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) void handleGenerate(); }}
          placeholder="https://example.com"
          disabled={isRunning}
          className="w-full rounded-xl px-4 py-3 text-[15px] outline-none mb-4"
          style={{ border: `1px solid #E4DDD0`, color: ink, background: isRunning ? "#F9F5EF" : "white" }}
        />

        <label className="block text-[11px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: "#6B7280" }}>
          Company name <span className="font-medium normal-case tracking-normal" style={{ color: "#9CA3AF" }}>(optional hint)</span>
        </label>
        <input
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) void handleGenerate(); }}
          placeholder="Detected automatically from the site"
          disabled={isRunning}
          className="w-full rounded-xl px-4 py-3 text-[15px] outline-none mb-5"
          style={{ border: `1px solid #E4DDD0`, color: ink, background: isRunning ? "#F9F5EF" : "white" }}
        />

        {isRunning && (
          <>
          <div className="mb-5 rounded-xl border p-4" style={{ borderColor: `${accent}40`, background: `${accent}08` }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Loader2 size={15} className="animate-spin flex-shrink-0" style={{ color: accent }} />
                <span className="text-[13px] font-semibold" style={{ color: accent }}>
                  {stepLabel || "Working"}…
                </span>
              </div>
              <span className="text-[11px] tabular-nums" style={{ color: "#9CA3AF" }}>{elapsed}s</span>
            </div>
            <div className="flex items-center gap-1">
              {GENERATE_STEPS.slice(0, -1).map((s, i) => (
                <div key={s.key} className="flex items-center gap-1 flex-1">
                  <div
                    className="h-1.5 flex-1 rounded-full transition-all"
                    style={{ background: i <= stepIdx ? accent : `${accent}28` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-start gap-2 p-2 rounded-lg" style={{ background: `${accent}10` }}>
              <Info size={12} className="flex-shrink-0 mt-0.5" style={{ color: accent }} />
              <p className="text-[11px] leading-relaxed" style={{ color: accent }}>
                This takes 30–90 seconds. Scraping, generating all Set-Up fields, and scoring the site.
              </p>
            </div>
          </div>
          <div className="mt-3">
            <CountdownBanner active={isRunning} durationSeconds={90} label="Generating your project from the website" />
          </div>
          </>
        )}

        {errorMsg && (
          <div className="mb-5 rounded-xl border p-4 flex items-start gap-3" style={{ borderColor: "#F87171", background: "#FEF2F2" }}>
            <AlertTriangle size={15} className="flex-shrink-0 mt-0.5 text-red-500" />
            <p className="text-[13px]" style={{ color: "#B91C1C" }}>{errorMsg}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isRunning}
            className="px-5 py-2.5 rounded-full text-[12px] font-bold uppercase tracking-[0.15em] transition-colors"
            style={{ color: "#9CA3AF", cursor: isRunning ? "not-allowed" : "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={() => void handleGenerate()}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[12px] font-bold uppercase tracking-[0.15em] text-white transition-all"
            style={{ background: accent, opacity: canSubmit ? 1 : 0.45, cursor: canSubmit ? "pointer" : "not-allowed" }}
          >
            {isRunning ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
            {isRunning ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
