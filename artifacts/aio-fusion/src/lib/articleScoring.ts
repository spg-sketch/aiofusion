export const ARTICLE_SCORING_VERSION = "article-quality-v1";

export type ArticleScoreFactorKey = "structure" | "messageAlignment" | "projectGrounding" | "citationReadiness";
export type ArticleScoreFactor = {
  key: ArticleScoreFactorKey;
  label: string;
  score: number;
  maxScore: 25;
  explanation: string;
};
export type ArticleScore = { total: number; factors: ArticleScoreFactor[] };
export type ArticleScoringContext = {
  selectedMessages: string[];
  targetPhrases: string[];
  projectDetails: string[];
};
export type ArticleContent = { headline: string; standfirst: string; bodyCopy: string };
export type ArticleOptimisationAssessment = {
  version: typeof ARTICLE_SCORING_VERSION;
  before: ArticleScore;
  after: ArticleScore;
  improvement: number;
  beforeContent: ArticleContent;
  beforeFingerprint: string;
  afterFingerprint: string;
  contextFingerprint: string;
  changeLog: Array<{ kind: "embed" | "structure" | "flag"; text: string }>;
};

const normalise = (value: string) => value.toLocaleLowerCase("en-GB").replace(/\s+/g, " ").trim();
const includesText = (article: string, candidate: string) => {
  const needle = normalise(candidate);
  return needle.length >= 3 && article.includes(needle);
};
const cap = (value: number) => Math.max(0, Math.min(25, Math.round(value)));
const words = (value: string) => value.trim() ? value.trim().split(/\s+/).length : 0;

export function articleFingerprint(content: ArticleContent): string {
  return JSON.stringify([content.headline, content.standfirst, content.bodyCopy].map(normalise));
}

export function scoringContextFingerprint(context: ArticleScoringContext): string {
  return JSON.stringify([
    context.selectedMessages.map(normalise).sort(),
    context.targetPhrases.map(normalise).sort(),
    context.projectDetails.map(normalise).filter(Boolean).sort(),
  ]);
}

/** Published article-quality rubric: four observable factors worth 25 points each. */
export function scoreArticle(content: ArticleContent, context: ArticleScoringContext): ArticleScore {
  const headlineWords = words(content.headline);
  const standfirstWords = words(content.standfirst);
  const bodyWords = words(content.bodyCopy);
  const article = normalise(`${content.headline}\n${content.standfirst}\n${content.bodyCopy}`);
  const paragraphs = content.bodyCopy.split(/\n\s*\n/).filter((part) => words(part) >= 4);
  const headingCount = (content.bodyCopy.match(/^(?:#{1,3}\s+|[A-Z][^\n]{2,70}:?\s*$)/gm) || []).length;
  const listItems = (content.bodyCopy.match(/^\s*(?:[-*]|\d+\.)\s+/gm) || []).length;
  const sentences = content.bodyCopy.split(/[.!?](?:\s|$)/).map((s) => words(s)).filter(Boolean);

  let structure = 0;
  if (headlineWords > 0) structure += headlineWords <= 20 ? 6 : 3;
  if (standfirstWords > 0) structure += standfirstWords <= 50 ? 5 : 2;
  if (bodyWords >= 150) structure += 6; else if (bodyWords >= 50) structure += 3;
  if (paragraphs.length >= 3) structure += 5; else if (paragraphs.length >= 1) structure += 2;
  if (headingCount + listItems > 0) structure += 3;

  const targets = [...context.selectedMessages, ...context.targetPhrases].filter((value) => normalise(value).length >= 3);
  const matchedTargets = targets.filter((target) => includesText(article, target)).length;
  const alignment = targets.length === 0 ? 12 : 5 + 20 * (matchedTargets / targets.length);

  const details = context.projectDetails.filter((value) => normalise(value).length >= 4);
  const matchedDetails = details.filter((detail) => includesText(article, detail)).length;
  const grounding = details.length === 0 ? 10 : 5 + 20 * (matchedDetails / Math.min(details.length, 6));

  let citation = 0;
  if (sentences.length >= 4) citation += 5;
  if (sentences.some((length) => length >= 8 && length <= 30)) citation += 5;
  if (/\b\d+(?:[.,]\d+)?%?\b/.test(content.bodyCopy)) citation += 4;
  if (/\b(?:according to|reported by|research|study|data|evidence|said|says)\b/i.test(content.bodyCopy)) citation += 4;
  if (/\b(?:because|therefore|which means|result(?:s|ed)? in|led to|so that)\b/i.test(content.bodyCopy)) citation += 4;
  if (paragraphs.some((p) => words(p) >= 15 && words(p) <= 80)) citation += 3;

  const factors: ArticleScoreFactor[] = [
    { key: "structure", label: "Structure and completeness", score: cap(structure), maxScore: 25, explanation: "Headline, standfirst, useful body length, paragraphs and navigable structure." },
    { key: "messageAlignment", label: "Selected messages and phrases", score: cap(alignment), maxScore: 25, explanation: targets.length ? `${matchedTargets} of ${targets.length} selected messages and target phrases appear in the copy.` : "No messages or target phrases were selected; a neutral baseline is used." },
    { key: "projectGrounding", label: "Grounded project detail", score: cap(grounding), maxScore: 25, explanation: details.length ? `${matchedDetails} verified Project Set-Up details are reflected in the copy.` : "No usable Project Set-Up details were available; a neutral baseline is used." },
    { key: "citationReadiness", label: "Citation-ready presentation", score: cap(citation), maxScore: 25, explanation: "Self-contained sentences, evidence cues, numbers and explicit cause-and-effect phrasing." },
  ];
  return { total: factors.reduce((sum, factor) => sum + factor.score, 0), factors };
}

export function assessArticleOptimisation(
  beforeContent: ArticleContent,
  afterContent: ArticleContent,
  context: ArticleScoringContext,
  changeLog: ArticleOptimisationAssessment["changeLog"],
): ArticleOptimisationAssessment {
  const before = scoreArticle(beforeContent, context);
  const after = scoreArticle(afterContent, context);
  return {
    version: ARTICLE_SCORING_VERSION,
    before,
    after,
    improvement: after.total - before.total,
    beforeContent,
    beforeFingerprint: articleFingerprint(beforeContent),
    afterFingerprint: articleFingerprint(afterContent),
    contextFingerprint: scoringContextFingerprint(context),
    changeLog,
  };
}