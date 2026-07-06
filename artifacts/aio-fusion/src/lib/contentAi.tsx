import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { loadIntakeData, getProjectDataMessages } from "../IntakeForm";
import { vars } from "../marketing/vars";
export function apiBase(): string {
  return import.meta.env.DEV ? `https://${window.location.host}` : "";
}

// Compact text summary of Project Data sections 1-3, sent to the LLM as the
// authority brief behind every Content AI call.
export function buildProjectDataText(): string {
  const data = loadIntakeData();
  if (!data) return "";
  const lines: string[] = [];
  const descriptor = (data as { formData?: Record<string, unknown> }).formData?.["1.1"];
  if (typeof descriptor === "string" && descriptor.trim()) lines.push(`Company descriptor: ${descriptor.trim()}`);
  let lastLabel = "";
  getProjectDataMessages().forEach((m) => {
    if (m.fieldLabel !== lastLabel) {
      lines.push(`\n${m.fieldLabel} [${m.fieldId}]:`);
      lastLabel = m.fieldLabel;
    }
    lines.push(`- ${m.value}`);
  });
  return lines.join("\n").slice(0, 9000);
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Only let http(s) links through so a model-supplied URL can never become a
// javascript: or data: link. Anything else is dropped to an empty string.
export function safeHttpUrl(v: unknown): string {
  if (typeof v !== "string") return "";
  const trimmed = v.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? trimmed : "";
  } catch {
    return "";
  }
}

// How long the client waits before giving up on a content-AI request. Slightly
// longer than the server's own stream timeout so the server's friendly message
// wins when it can, but the user is never left waiting forever.
export const CONTENT_AI_TIMEOUT_MS = 100_000;

// Streams a content-AI response. The server replies with Server-Sent Events:
//   event: progress  -> { chars }   (incremental output as the model writes)
//   event: result    -> the final payload
//   event: error     -> { error }   (friendly, already-worded message)
// Validation / rate-limit / config errors arrive as ordinary JSON instead, so
// we handle both. onProgress fires with the running character count so callers
// can show real, incremental progress rather than a static spinner.
export async function streamContent(
  path: string,
  body: unknown,
  onProgress?: (chars: number) => void,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONTENT_AI_TIMEOUT_MS);
  try {
    const resp = await fetch(`${apiBase()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("text/event-stream")) {
      const data = await resp.json().catch(() => null);
      throw new Error((data && (data as { error?: string }).error) || "The request could not be completed right now. Please try again.");
    }
    if (!resp.body) throw new Error("The response stream could not be read. Please try again.");
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result: Record<string, unknown> | null = null;
    let errorMsg: string | null = null;
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
        if (event === "progress") onProgress?.(typeof parsed.chars === "number" ? parsed.chars : 0);
        else if (event === "result") result = parsed;
        else if (event === "error") errorMsg = typeof parsed.error === "string" ? parsed.error : "Something went wrong. Please try again.";
      }
    }
    if (errorMsg) throw new Error(errorMsg);
    if (!result) throw new Error("The response ended before it finished. Please try again.");
    return result;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("This is taking longer than expected and timed out. Please try again in a moment.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Shared progress panel for the long-running content-AI features. Shows the
// real elapsed time, a stage label that advances over time, and the live
// character count streamed back from the model. Remount it (e.g. via a `key`
// or conditional render) to reset the timer for each run.
export function GenerationProgress({
  stages,
  chars,
  accent = vars.accent,
  compact = false,
  textColor,
}: {
  stages: string[];
  chars: number;
  accent?: string;
  compact?: boolean;
  textColor?: string;
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
          <span className={`font-semibold truncate ${compact ? "text-[12px]" : "text-[13px]"}`} style={{ color: textColor || accent }}>
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

export function textToHtmlParagraphs(text: string): string {
  const trimmed = (text || "").trim();
  if (!trimmed) return "";
  const lines = trimmed.split("\n");
  const out: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length) {
      const html = buf.join("<br/>").trim();
      if (html) out.push(`<p style="margin:0 0 10pt 0;">${html}</p>`);
      buf = [];
    }
  };
  for (const raw of lines) {
    const h1m = raw.match(/^#\s+(.*)/);
    const h2m = raw.match(/^##\s+(.*)/);
    const h3m = raw.match(/^###\s+(.*)/);
    if (h2m) {
      flush();
      out.push(`<h2 style="font-size:14pt; font-weight:700; color:#16213e; margin:14pt 0 5pt 0;">${escapeHtml(h2m[1])}</h2>`);
    } else if (h3m) {
      flush();
      out.push(`<h3 style="font-size:12pt; font-weight:700; color:#374151; margin:12pt 0 4pt 0;">${escapeHtml(h3m[1])}</h3>`);
    } else if (h1m) {
      flush();
      out.push(`<h2 style="font-size:15pt; font-weight:700; color:#16213e; margin:16pt 0 6pt 0;">${escapeHtml(h1m[1])}</h2>`);
    } else if (raw.trim() === "") {
      flush();
    } else {
      buf.push(escapeHtml(raw).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>"));
    }
  }
  flush();
  return out.join("");
}

// Builds a Word-compatible .doc from an HTML body and triggers a download.
export function downloadWordDocument(filename: string, innerHtml: string): void {
  const safeName = filename.endsWith(".doc") ? filename : `${filename}.doc`;
  const html =
    `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">` +
    `<head><meta charset="utf-8"><title>${escapeHtml(filename)}</title></head>` +
    `<body style="font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1a1a2e; line-height: 1.5;">${innerHtml}</body></html>`;
  const blob = new Blob(["\ufeff", html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeName;
  a.click();
  URL.revokeObjectURL(url);
}

