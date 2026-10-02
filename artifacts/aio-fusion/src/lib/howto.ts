// Types mirror docs/howto-contract.md and are structurally compatible with the generated client types.
export type HowtoType = "Article" | "Guide" | "Video";
export type HowtoStatus = "draft" | "published";
export type InlineRun = { text: string; bold?: boolean; italic?: boolean; href?: string };
export type HowtoBlock =
  | { type: "heading" | "paragraph" | "tip"; runs: InlineRun[] }
  | { type: "step"; number: number; title: string; runs: InlineRun[] }
  | { type: "list"; items: string[] }
  | { type: "image"; mediaId: string; altText: string; caption?: string; url?: string }
  | { type: "video"; url: string; caption?: string };
export type HowtoEntry = {
  id: string;
  title: string;
  description: string;
  type: HowtoType;
  readTime: string;
  displayOrder: number;
  status: HowtoStatus;
  body: HowtoBlock[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};
export type HowtoInput = Omit<HowtoEntry, "createdAt" | "updatedAt" | "publishedAt">;

export const HOWTO_TYPES: HowtoType[] = ["Article", "Guide", "Video"];
export const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Editor form state: displayOrder stays a string while typing. */
export type HowtoDraft = {
  id: string;
  title: string;
  description: string;
  type: HowtoType;
  readTime: string;
  displayOrder: string;
  status: HowtoStatus;
  body: HowtoBlock[];
};

export function emptyDraft(): HowtoDraft {
  return { id: "", title: "", description: "", type: "Guide", readTime: "3 min read", displayOrder: "0", status: "draft", body: [{ type: "paragraph", runs: [{ text: "" }] }] };
}

export function draftFromEntry(e: HowtoEntry): HowtoDraft {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    type: e.type,
    readTime: e.readTime,
    displayOrder: String(e.displayOrder),
    status: e.status,
    body: JSON.parse(JSON.stringify(e.body)) as HowtoBlock[],
  };
}

function cleanRuns(runs: InlineRun[]): InlineRun[] {
  return runs
    .filter((r) => r.text.length > 0)
    .map((r) => {
      const out: InlineRun = { text: r.text };
      if (r.bold) out.bold = true;
      if (r.italic) out.italic = true;
      if (r.href) out.href = r.href;
      return out;
    });
}

/** Build the exact editable payload; images drop resolved urls, steps renumber. */
export function buildPayload(draft: HowtoDraft, status: HowtoStatus): HowtoInput {
  let stepNo = 0;
  const body: HowtoBlock[] = draft.body.map((b): HowtoBlock => {
    switch (b.type) {
      case "heading":
      case "paragraph":
      case "tip":
        return { type: b.type, runs: cleanRuns(b.runs) };
      case "step":
        stepNo += 1;
        return { type: "step", number: stepNo, title: b.title, runs: cleanRuns(b.runs) };
      case "list":
        return { type: "list", items: b.items };
      case "image": {
        const out: HowtoBlock = { type: "image", mediaId: b.mediaId, altText: b.altText };
        if (b.caption?.trim()) out.caption = b.caption;
        return out;
      }
      case "video": {
        const out: HowtoBlock = { type: "video", url: b.url.trim() };
        if (b.caption?.trim()) out.caption = b.caption;
        return out;
      }
    }
  });
  return {
    id: draft.id.trim(),
    title: draft.title.trim(),
    description: draft.description.trim(),
    type: draft.type,
    readTime: draft.readTime.trim(),
    displayOrder: Number(draft.displayOrder),
    status,
    body,
  };
}

/** Client side checks that save a round trip; the server stays authoritative. */
export function validateDraft(draft: HowtoDraft, isNew: boolean): string[] {
  const errs: string[] = [];
  if (isNew && !KEBAB.test(draft.id.trim())) errs.push("Entry id must be lowercase words joined by hyphens, for example getting-started.");
  if (!draft.title.trim()) errs.push("Add a title.");
  if (!draft.description.trim()) errs.push("Add a short description.");
  if (!draft.readTime.trim()) errs.push("Add a read time.");
  if (draft.displayOrder.trim() === "" || !Number.isInteger(Number(draft.displayOrder))) errs.push("Display order must be a whole number.");
  draft.body.forEach((b, i) => {
    const n = i + 1;
    if (b.type === "image") {
      if (!b.mediaId) errs.push(`Block ${n}: choose an image from the media library.`);
      else if (!b.altText.trim()) errs.push(`Block ${n}: describe the image in the alt text.`);
    }
    if (b.type === "video" && !isHttps(b.url.trim())) errs.push(`Block ${n}: video links must start with https://.`);
    if ("runs" in b) b.runs.forEach((r) => { if (r.href && !isHttps(r.href)) errs.push(`Block ${n}: links must start with https://.`); });
  });
  return errs;
}

export function errorMessage(err: unknown): string {
  const e = err as { data?: unknown; response?: { data?: unknown }; message?: string } | null;
  const data = (e?.data ?? e?.response?.data) as { error?: unknown; message?: unknown } | undefined;
  if (data && typeof data === "object") {
    if (typeof data.error === "string") return data.error;
    if (typeof data.message === "string") return data.message;
  }
  return e?.message || "The change could not be saved.";
}

export function errorStatus(err: unknown): number | undefined {
  const s = (err as { status?: unknown; response?: { status?: unknown } } | null);
  const v = s?.status ?? s?.response?.status;
  return typeof v === "number" ? v : undefined;
}

export function runsToPlain(runs: InlineRun[]): string {
  return runs.map((r) => r.text).join("");
}
