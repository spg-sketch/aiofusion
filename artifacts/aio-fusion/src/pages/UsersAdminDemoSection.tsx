import React, { useState } from "react";
import { Globe, Loader2 } from "lucide-react";
import { vars } from "../marketing/vars";
import { apiBase } from "../lib/contentAi";

const ink = "#0a1628";
const accent = "#C8497A";
const accentSoft = "#FBE3ED";

export function UsersAdminDemoSection({ onProjectCreated }: { onProjectCreated?: () => void }) {
  const [genUrl, setGenUrl] = useState("");
  const [genCompany, setGenCompany] = useState("");
  const [genRunning, setGenRunning] = useState(false);
  const [genStep, setGenStep] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [genResult, setGenResult] = useState<{ projectId: string; companyName: string } | null>(null);

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = genUrl.trim();
    if (!trimmedUrl) return;
    setGenRunning(true);
    setGenStep("Connecting...");
    setGenError(null);
    setGenResult(null);
    void (async () => {
      try {
        const resp = await fetch(`${apiBase()}/api/admin/generate-from-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: trimmedUrl, companyName: genCompany.trim(), isDemo: true }),
        });
        const contentType = resp.headers.get("content-type") || "";
        if (!contentType.includes("text/event-stream")) {
          const data = await resp.json().catch(() => null) as Record<string, unknown> | null;
          throw new Error((data && typeof data.error === "string" ? data.error : null) || "Request failed. Please try again.");
        }
        if (!resp.body) throw new Error("Could not read response stream.");
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
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
            try { parsed = JSON.parse(dataStr) as Record<string, unknown>; } catch { continue; }
            if (event === "progress") {
              setGenStep(typeof parsed.message === "string" ? parsed.message : null);
            } else if (event === "result") {
              const projectId = typeof parsed.projectId === "string" ? parsed.projectId : "";
              const companyName =
                typeof parsed.projectName === "string"
                  ? parsed.projectName
                  : typeof parsed.companyName === "string"
                    ? parsed.companyName
                    : "Demo Client";
              setGenResult({ projectId, companyName });
              setGenStep(null);
              onProjectCreated?.();
            } else if (event === "error") {
              throw new Error(typeof parsed.error === "string" ? parsed.error : "Something went wrong. Please try again.");
            }
          }
        }
      } catch (err) {
        setGenError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
        setGenStep(null);
      } finally {
        setGenRunning(false);
      }
    })();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Create Demo Client</h2>
          <p className="text-sm text-gray-500 mt-1">Enter a website and Claude will generate a fully-populated Demo Client ready for auditing.</p>
        </div>
      </div>
      <div className="rounded-2xl p-6 sm:p-8 mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
        <div className="flex items-start gap-3 mb-5">
          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: accentSoft }}>
            <Globe size={16} color={accent} />
          </div>
          <div>
            <h2 className="text-[16px] font-bold" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Generate Demo Client from URL</h2>
            <p className="text-[13px] font-light mt-0.5 leading-[1.6]" style={{ color: vars.g600 }}>
              Enter a company website and Claude will scrape the site, generate a fully-populated Project Set-Up, and save it as a new Demo Client ready for auditing.
            </p>
          </div>
        </div>
        <form onSubmit={handleGenerate} className="flex flex-col sm:flex-row items-stretch gap-3">
          <input
            type="url"
            value={genUrl}
            onChange={(e) => setGenUrl(e.target.value)}
            placeholder="https://example.com"
            disabled={genRunning}
            required
            className="flex-1 px-4 py-3 rounded-xl border text-[14px] focus:outline-none focus:ring-2 bg-white"
            style={{ borderColor: vars.g200, color: ink, ["--tw-ring-color" as any]: accent }}
          />
          <input
            type="text"
            value={genCompany}
            onChange={(e) => setGenCompany(e.target.value)}
            placeholder="Company name (optional)"
            disabled={genRunning}
            className="w-full sm:w-48 px-4 py-3 rounded-xl border text-[14px] focus:outline-none focus:ring-2 bg-white"
            style={{ borderColor: vars.g200, color: ink, ["--tw-ring-color" as any]: accent }}
          />
          <button
            type="submit"
            disabled={genRunning || !genUrl.trim()}
            className="px-6 py-3 rounded-xl text-[13px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 flex justify-center"
            style={{ background: accent }}
          >
            {genRunning ? <Loader2 size={16} className="animate-spin" /> : "Generate"}
          </button>
        </form>
        {genStep && (
          <div className="mt-4 p-4 rounded-xl flex items-center gap-3 text-[13px]" style={{ background: vars.g100, color: vars.g600 }}>
            <Loader2 size={16} className="animate-spin shrink-0" style={{ color: accent }} />
            {genStep}
          </div>
        )}
        {genError && (
          <div className="mt-4 p-4 rounded-xl text-[13px] font-medium" style={{ background: "#FEF2F2", color: "#991B1B" }}>
            {genError}
          </div>
        )}
        {genResult && (
          <div className="mt-4 p-4 rounded-xl flex items-start sm:items-center justify-between gap-4" style={{ background: "#F0FDF4", border: "1px solid #86EFAC" }}>
            <div>
              <p className="text-[13px] font-bold" style={{ color: "#166534" }}>Demo Client generated</p>
              <p className="text-[12px] mt-0.5" style={{ color: "#15803D" }}>'{genResult.companyName}' has been added to your Project Hub.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
