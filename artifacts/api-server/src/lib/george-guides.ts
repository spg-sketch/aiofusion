import { db, platformMetaTable } from "@workspace/db";
import { and, eq, like } from "drizzle-orm";
import type { HowtoBlock } from "@workspace/db";

// Store only editorial preferences, never duplicate a guide's content.
export const GEORGE_GUIDE_PREFIX = "howto:george:";

export async function excludedGeorgeGuideIds(): Promise<Set<string>> {
  const rows = await db.select({ key: platformMetaTable.key }).from(platformMetaTable)
    .where(and(like(platformMetaTable.key, `${GEORGE_GUIDE_PREFIX}%`), eq(platformMetaTable.value, "false")));
  return new Set(rows.map((row) => row.key.slice(GEORGE_GUIDE_PREFIX.length)));
}

export async function setGeorgeGuidePreference(
  tx: Pick<typeof db, "insert">,
  id: string,
  include: boolean,
) {
  const key = `${GEORGE_GUIDE_PREFIX}${id}`;
  await tx.insert(platformMetaTable).values({ key, value: String(include) })
    .onConflictDoUpdate({ target: platformMetaTable.key, set: { value: String(include) } });
}

export function guideParagraphs(body: HowtoBlock[]): string[] {
  return body.flatMap((block) => {
    if (block.type === "step") return [`${block.number}. ${block.title} ${block.runs.map((r) => r.text).join("")}`];
    if ("runs" in block) return [block.runs.map((r) => r.text).join("")];
    if (block.type === "list") return block.items;
    if (block.type === "image") return [block.altText, block.caption ?? ""];
    if (block.type === "video") return [block.caption ?? ""];
    return [];
  }).map((text) => text.trim()).filter(Boolean);
}

const STOP = new Set("a an and are as at be been but by can did do does for from get got had has have he her him his how i if in is it its just me my no not of on or our out so some that the their them then there they this to up us was we were what when where which who why will with you your".split(" "));

function searchTerms(query: string): string[] {
  const tokens: string[] = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const raw = tokens.filter((t) => t.length > 1);
  const filtered = raw.filter((t) => !STOP.has(t));
  return filtered.length ? filtered : raw;
}

export function supportScore(query: string, title: string, keywords: string, text: string): number {
  const phrase = query.toLowerCase().trim();
  const terms = searchTerms(query);
  const fields = [title.toLowerCase(), keywords.toLowerCase(), text.toLowerCase()];
  return (phrase && fields[0]!.includes(phrase) ? 30 : 0) + terms.reduce((sum, term) =>
    sum + Math.min(term.length, 6) * (
      (fields[0]!.includes(term) ? 4 : 0) +
      (fields[1]!.includes(term) ? 2 : 0) +
      (fields[2]!.includes(term) ? 1 : 0)
    ), 0);
}

export function guideExcerpt(query: string, paragraphs: string[], description: string): string {
  const best = [...paragraphs].sort((a, b) => supportScore(query, "", "", b) - supportScore(query, "", "", a))[0];
  const text = best && supportScore(query, "", "", best) > 0 ? best : description || best || "";
  if (text.length <= 600) return text;
  const positions = searchTerms(query).map((term) => text.toLowerCase().indexOf(term)).filter((index) => index >= 0);
  const start = Math.max(0, (positions.length ? Math.min(...positions) : 0) - 120);
  return `${start ? "..." : ""}${text.slice(start, start + 594)}${start + 594 < text.length ? "..." : ""}`;
}
