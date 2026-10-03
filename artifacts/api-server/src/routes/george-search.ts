import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import { db, howtoEntriesTable, supportFaqTable } from "@workspace/db";
import { excludedGeorgeGuideIds, guideExcerpt, guideParagraphs, supportScore } from "../lib/george-guides";

const router = Router();

router.get("/support/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q || q.length > 500) {
    res.status(400).json({ error: "Enter a support question of up to 500 characters." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  const [faqs, guides, excluded] = await Promise.all([
    db.select().from(supportFaqTable).where(eq(supportFaqTable.isActive, true))
      .orderBy(asc(supportFaqTable.displayOrder), asc(supportFaqTable.id)),
    db.select().from(howtoEntriesTable).where(eq(howtoEntriesTable.status, "published"))
      .orderBy(asc(howtoEntriesTable.displayOrder), asc(howtoEntriesTable.id)),
    excludedGeorgeGuideIds(),
  ]);
  const matches = [
    ...faqs.map((faq) => ({
      score: supportScore(q, faq.question, faq.keywords, faq.answer),
      result: { id: `faq:${faq.id}`, source: "faq" as const, category: faq.category, question: faq.question, answer: faq.answer },
    })),
    ...guides.filter((guide) => !excluded.has(guide.id)).map((guide) => {
      const paragraphs = guideParagraphs(guide.body);
      return {
        score: supportScore(q, guide.title, guide.description, paragraphs.join("\n")),
        result: {
          id: `guide:${guide.id}`, source: "guide" as const, guideId: guide.id,
          category: `Guidance Library · ${guide.type}`, question: guide.title,
          answer: guideExcerpt(q, paragraphs, guide.description),
        },
      };
    }),
  ].filter((match) => match.score > 0).sort((a, b) => b.score - a.score || a.result.id.localeCompare(b.result.id));
  res.json({ results: matches.slice(0, 5).map((match) => match.result) });
});

export default router;