import { loadIntakeData, getProjectDataMessages } from "../IntakeForm";

export function apiBase(): string {
  return import.meta.env.DEV ? `https://${window.location.host}` : "";
}

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

export const CONTENT_AI_TIMEOUT_MS = 100_000;

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
