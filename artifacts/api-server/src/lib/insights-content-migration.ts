import type { InsightArticleRow, InsightBlock } from "@workspace/db";

/**
 * Task 290 deliberately uses a small, declarative patch instead of a
 * render-time text replacement.  `from` is part of the guard: an article
 * which has been edited in the CMS is left alone rather than being treated
 * as a seed that can be overwritten.
 */
export type InsightTextChange =
  | {
      articleId: string;
      field: "title" | "excerpt" | "coverImageAlt" | "seoTitle" | "seoDescription" | "focusKeyphrase";
      from: string;
      to: string;
    }
  | {
      articleId: string;
      field: "body";
      bodyIndex: number;
      from: string;
      to: string;
    };

export const TASK_290_MIGRATION_ID = "task-290-remove-b2b-positioning-v1";

/**
 * These are the exact editorial changes made to the checked-in first-party
 * articles.  Do not add a broad replacement here.  In particular, quoted
 * research, pull quotes, and the scope of the research are intentionally not
 * included unless the editorial diff explicitly changes that section.
 */
export const TASK_290_FIRST_PARTY_CHANGES: readonly InsightTextChange[] = [
  {
    articleId: "thought-leadership-engine-ai-visibility",
    field: "body",
    bodyIndex: 2,
    from:
      "This is not a minor nuance. It is a structural reality of how large language models work, and it has profound implications for how B2B brands need to approach visibility. The companies that appear in AI-generated shortlists, recommendations, and market summaries are overwhelmingly the companies with the strongest footprint of earned, third-party coverage, not the companies with the most content on their own domains.",
    to:
      "This is not a minor nuance. It is a structural reality of how large language models work, and it has profound implications for how brands serving business buyers need to approach visibility. The companies that appear in AI-generated shortlists, recommendations, and market summaries are overwhelmingly the companies with the strongest footprint of earned, third-party coverage, not the companies with the most content on their own domains.",
  },
  {
    articleId: "battle-b2b-ai-authority",
    field: "title",
    from: "The battle for B2B AI Authority has begun",
    to: "The battle for AI authority has begun",
  },
  {
    articleId: "battle-b2b-ai-authority",
    field: "excerpt",
    from:
      "Generative AI is becoming part of B2B research and supplier discovery. PR now has a direct role in how brands are represented.",
    to:
      "Generative AI is becoming part of business research and supplier discovery. PR now has a direct role in how brands are represented.",
  },
  {
    articleId: "battle-b2b-ai-authority",
    field: "body",
    bodyIndex: 0,
    from:
      "There is a race underway in B2B markets that most companies have not yet noticed. It is not a race for search engine rankings, or for social media followers, or even for share of voice in traditional media. It is a race for the position that will define commercial visibility for the next decade: authority in the eyes of AI models.",
    to:
      "There is a race underway in commercial markets that most companies have not yet noticed. It is not a race for search engine rankings, or for social media followers, or even for share of voice in traditional media. It is a race for the position that will define commercial visibility for the next decade: authority in the eyes of AI models.",
  },
  {
    articleId: "battle-b2b-ai-authority",
    field: "body",
    bodyIndex: 1,
    from:
      "B2B buyers are beginning to use generative AI during research and supplier discovery, changing where brand shortlists are formed.",
    to:
      "Business buyers are beginning to use generative AI during research and supplier discovery, changing where brand shortlists are formed.",
  },
  {
    articleId: "battle-b2b-ai-authority",
    field: "body",
    bodyIndex: 2,
    from:
      "When a B2B buyer uses an AI model to research a category, to understand the competitive landscape, or to build a shortlist of potential suppliers, the model's response is shaped by a specific body of evidence: the pattern of how that company has been discussed, cited, and recommended in credible third-party sources. The companies that feature prominently in that pattern are the ones that appear in AI-generated shortlists. The ones that do not are, for practical purposes, invisible.",
    to:
      "When a business buyer uses an AI model to research a category, to understand the competitive landscape, or to build a shortlist of potential suppliers, the model's response is shaped by a specific body of evidence: the pattern of how that company has been discussed, cited, and recommended in credible third-party sources. The companies that feature prominently in that pattern are the ones that appear in AI-generated shortlists. The ones that do not are, for practical purposes, invisible.",
  },
  {
    articleId: "battle-b2b-ai-authority",
    field: "body",
    bodyIndex: 4,
    from:
      "AI authority, the degree to which AI models recognise a brand as a credible, citable source in its sector, is not yet evenly distributed. In most B2B categories, a small number of companies have begun to build meaningful AI visibility while the majority are operating with little awareness that the landscape has shifted.",
    to:
      "AI authority, the degree to which AI models recognise a brand as a credible, citable source in its sector, is not yet evenly distributed. In most business categories, a small number of companies have begun to build meaningful AI visibility while the majority are operating with little awareness that the landscape has shifted.",
  },
  {
    articleId: "battle-b2b-ai-authority",
    field: "body",
    bodyIndex: 12,
    from:
      "This is a significant shift from the last decade, during which paid media, SEO, and performance marketing dominated the B2B marketing conversation. Those channels remain important. But the companies now investing in serious earned authority programmes are positioning themselves for a world in which the AI model, not the search engine, is the first stop in the buyer journey.",
    to:
      "This is a significant shift from the last decade, during which paid media, SEO, and performance marketing dominated the commercial marketing conversation. Those channels remain important. But the companies now investing in serious earned authority programmes are positioning themselves for a world in which the AI model, not the search engine, is the first stop in the buyer journey.",
  },
  {
    articleId: "battle-b2b-ai-authority",
    field: "body",
    bodyIndex: 15,
    from:
      "The companies that will win the B2B AI authority race are not necessarily the largest, or the most well-known, or the ones with the biggest marketing budgets. They are the ones that build the most credible, consistent, and widely cited body of third-party evidence about their expertise, their perspective, and their contribution to their sector.",
    to:
      "The companies that will win the AI authority race are not necessarily the largest, or the most well-known, or the ones with the biggest marketing budgets. They are the ones that build the most credible, consistent, and widely cited body of third-party evidence about their expertise, their perspective, and their contribution to their sector.",
  },
  {
    articleId: "battle-b2b-ai-authority",
    field: "body",
    bodyIndex: 16,
    from:
      "That is a strategic communications challenge. And it is one that the B2B companies moving fastest on AI authority have already recognised. The battle has begun. The question is which side of it your company will be on.",
    to:
      "That is a strategic communications challenge. And it is one that the companies moving fastest on AI authority have already recognised. The battle has begun. The question is which side of it your company will be on.",
  },
  {
    articleId: "ai-changing-b2b-visibility",
    field: "title",
    from: "AI Is Changing the Rules of B2B Visibility: Here's What Actually Matters Now",
    to: "AI Is Changing the Rules of Visibility: Here's What Actually Matters Now",
  },
  {
    articleId: "ai-changing-b2b-visibility",
    field: "excerpt",
    from:
      "AI-generated answers often rely on third-party sources when they describe markets and suppliers. The structure of B2B visibility is changing.",
    to:
      "AI-generated answers often rely on third-party sources when they describe markets and suppliers. The structure of visibility is changing.",
  },
  {
    articleId: "ai-changing-b2b-visibility",
    field: "body",
    bodyIndex: 0,
    from:
      "The rules of B2B visibility are being rewritten. Not gradually, and not in ways that conventional marketing frameworks are well-equipped to capture. The structural shift now underway is the result of a single, profound change in buyer behaviour: generative AI has become the first port of call in the research and discovery phase of the B2B purchase journey.",
    to:
      "The rules of visibility are being rewritten. Not gradually, and not in ways that conventional marketing frameworks are well-equipped to capture. The structural shift now underway is the result of a single, profound change in buyer behaviour: generative AI has become the first port of call in the research and discovery phase of the business purchase journey.",
  },
  {
    articleId: "ai-changing-b2b-visibility",
    field: "body",
    bodyIndex: 1,
    from:
      "AI-generated answers to B2B research questions often rely on earned media and third-party sources rather than brand-owned content alone.",
    to:
      "AI-generated answers to business research questions often rely on earned media and third-party sources rather than brand-owned content alone.",
  },
  {
    articleId: "ai-changing-b2b-visibility",
    field: "body",
    bodyIndex: 2,
    from:
      "For marketing and communications teams, this demands a fundamental reassessment of where to invest, what to measure, and what success looks like. The tactics that drove B2B visibility in the search era, keyword optimisation, content volume, domain authority, are not irrelevant, but they are no longer the primary lever. The primary lever is now earned authority: the depth and quality of a brand's presence in the third-party sources that AI models draw on when they synthesise answers about a market.",
    to:
      "For marketing and communications teams, this demands a fundamental reassessment of where to invest, what to measure, and what success looks like. The tactics that drove visibility in the search era, keyword optimisation, content volume, domain authority, are not irrelevant, but they are no longer the primary lever. The primary lever is now earned authority: the depth and quality of a brand's presence in the third-party sources that AI models draw on when they synthesise answers about a market.",
  },
  {
    articleId: "ai-changing-b2b-visibility",
    field: "body",
    bodyIndex: 4,
    from:
      "Three years ago, a B2B buyer researching a purchase category would typically start with a search engine query. The result was a ranked list of links, heavily influenced by SEO performance and paid placement. The buyer would then click through to evaluate content on brand-owned and third-party sites.",
    to:
      "Three years ago, a business buyer researching a purchase category would typically start with a search engine query. The result was a ranked list of links, heavily influenced by SEO performance and paid placement. The buyer would then click through to evaluate content on brand-owned and third-party sites.",
  },
  {
    articleId: "ai-changing-b2b-visibility",
    field: "body",
    bodyIndex: 8,
    from:
      "Based on our analysis of AI model behaviour across thousands of B2B queries, six dimensions consistently determine whether a brand appears in AI-generated answers:",
    to:
      "Based on our analysis of AI model behaviour across thousands of queries from business buyers, six dimensions consistently determine whether a brand appears in AI-generated answers:",
  },
  {
    articleId: "ai-changing-b2b-visibility",
    field: "body",
    bodyIndex: 11,
    from:
      "One of the most significant challenges for B2B marketing teams is that conventional measurement frameworks were not built to capture AI visibility. Organic traffic, domain authority, share of voice in traditional media, these metrics matter, but they do not directly reflect how a brand appears in AI-generated answers.",
    to:
      "One of the most significant challenges for marketing teams is that conventional measurement frameworks were not built to capture AI visibility. Organic traffic, domain authority, share of voice in traditional media, these metrics matter, but they do not directly reflect how a brand appears in AI-generated answers.",
  },
  {
    articleId: "ai-changing-b2b-visibility",
    field: "body",
    bodyIndex: 12,
    from:
      "The approach that is beginning to emerge among the most sophisticated B2B marketing teams is direct AI visibility measurement: systematically querying AI models with the questions their buyers are likely to ask, and analysing where and how the brand appears in the responses. This creates a baseline, enables tracking over time, and, critically, directly connects communications activity to commercial visibility.",
    to:
      "The approach that is beginning to emerge among the most sophisticated marketing teams is direct AI visibility measurement: systematically querying AI models with the questions their buyers are likely to ask, and analysing where and how the brand appears in the responses. This creates a baseline, enables tracking over time, and, critically, directly connects communications activity to commercial visibility.",
  },
  {
    articleId: "ai-changing-b2b-visibility",
    field: "body",
    bodyIndex: 15,
    from:
      "The practical implication for B2B marketing and communications teams is a reorientation of effort. Not away from everything that has worked before, but toward the activities that build the earned authority signal that AI models weight most heavily.",
    to:
      "The practical implication for marketing and communications teams is a reorientation of effort. Not away from everything that has worked before, but toward the activities that build the earned authority signal that AI models weight most heavily.",
  },
  {
    articleId: "earned-media",
    field: "body",
    bodyIndex: 12,
    from:
      "The strategic implication is not that paid media should be abandoned. It remains valuable for reach, retargeting, and bottom-of-funnel conversion. But the allocation question is changing. For B2B brands where the buyer journey increasingly begins with an AI-assisted research phase, the investment that shapes initial awareness and shortlisting is earned media, not paid.",
    to:
      "The strategic implication is not that paid media should be abandoned. It remains valuable for reach, retargeting, and bottom-of-funnel conversion. But the allocation question is changing. For brands serving business buyers, where the buyer journey increasingly begins with an AI-assisted research phase, the investment that shapes initial awareness and shortlisting is earned media, not paid.",
  },
  {
    articleId: "geo-signals",
    field: "body",
    bodyIndex: 1,
    from:
      "Based on systematic analysis of how ChatGPT and Claude respond to category and supplier queries across B2B markets, six signal categories consistently determine whether and how a brand appears in AI-generated answers. These are not abstract theoretical constructs. They are the measurable, trackable dimensions that GEO practitioners can audit, baseline, and improve.",
    to:
      "Based on systematic analysis of how ChatGPT and Claude respond to category and supplier queries across markets serving business buyers, six signal categories consistently determine whether and how a brand appears in AI-generated answers. These are not abstract theoretical constructs. They are the measurable, trackable dimensions that GEO practitioners can audit, baseline, and improve.",
  },
  {
    articleId: "setup-guide",
    field: "body",
    bodyIndex: 2,
    from:
      "Start with the fundamentals: your organisation's legal name, trading name, website, and the sector or sectors you operate in. The sector field is particularly important: it drives the competitive landscape analysis in your Authority Reports and determines which AI queries the platform uses to measure your visibility. Be specific. 'Technology' is too broad. 'B2B SaaS for financial services compliance teams' gives the platform the specificity it needs to generate meaningful results.",
    to:
      "Start with the fundamentals: your organisation's legal name, trading name, website, and the sector or sectors you operate in. The sector field is particularly important: it drives the competitive landscape analysis in your Authority Reports and determines which AI queries the platform uses to measure your visibility. Be specific. 'Technology' is too broad. 'SaaS for financial services compliance teams' gives the platform the specificity it needs to generate meaningful results.",
  },
  {
    articleId: "media-research-guide",
    field: "body",
    bodyIndex: 3,
    from:
      "You can filter by publication type (trade, national, regional, digital-native), by territory, and by audience profile. For B2B communications, the most important filter is typically beat specificity: a contact listed as covering 'technology' is far less valuable than one whose recent bylines confirm they are actively covering the specific sub-sector your story addresses.",
    to:
      "You can filter by publication type (trade, national, regional, digital-native), by territory, and by audience profile. For communications aimed at business buyers, the most important filter is typically beat specificity: a contact listed as covering 'technology' is far less valuable than one whose recent bylines confirm they are actively covering the specific sub-sector your story addresses.",
  },
  {
    articleId: "ai-proves-pr-drives-sales",
    field: "title",
    from: "Will AI finally prove that B2B PR drives sales through earned media awareness?",
    to: "Will AI finally prove that PR drives sales through earned media awareness?",
  },
  {
    articleId: "ai-proves-pr-drives-sales",
    field: "body",
    bodyIndex: 7,
    from:
      "The emergence of AI as the primary research tool in the B2B buyer journey creates, for the first time, a direct and measurable mechanism by which earned media drives commercial visibility. When a buyer asks an AI model which companies are the recognised authorities in a sector, the model's answer is a direct function of the earned media coverage those companies have generated. The connection between PR activity and buyer exposure is no longer diffuse and unmeasurable, it is structural and trackable.",
    to:
      "The emergence of AI as the primary research tool in the business buyer journey creates, for the first time, a direct and measurable mechanism by which earned media drives commercial visibility. When a buyer asks an AI model which companies are the recognised authorities in a sector, the model's answer is a direct function of the earned media coverage those companies have generated. The connection between PR activity and buyer exposure is no longer diffuse and unmeasurable, it is structural and trackable.",
  },
  {
    articleId: "battle-b2b-ai-authority",
    field: "coverImageAlt",
    from: "The battle for B2B AI Authority has begun",
    to: "The battle for AI authority has begun",
  },
  {
    articleId: "battle-b2b-ai-authority",
    field: "seoTitle",
    from: "The battle for B2B AI Authority has begun | AIO Fusion",
    to: "The battle for AI authority has begun | AIO Fusion",
  },
  {
    articleId: "battle-b2b-ai-authority",
    field: "seoDescription",
    from:
      "Generative AI is becoming part of B2B research and supplier discovery. PR now has a direct role in how brands are represented.",
    to:
      "Generative AI is becoming part of business research and supplier discovery. PR now has a direct role in how brands are represented.",
  },
  {
    articleId: "ai-changing-b2b-visibility",
    field: "coverImageAlt",
    from: "AI Is Changing the Rules of B2B Visibility: Here's What Actually Matters Now",
    to: "AI Is Changing the Rules of Visibility: Here's What Actually Matters Now",
  },
  {
    articleId: "ai-changing-b2b-visibility",
    field: "seoTitle",
    from: "AI Is Changing the Rules of B2B Visibility: Here's What Actually Matters Now | AIO Fusion",
    to: "AI Is Changing the Rules of Visibility: Here's What Actually Matters Now | AIO Fusion",
  },
  {
    articleId: "ai-changing-b2b-visibility",
    field: "seoDescription",
    from:
      "AI-generated answers often rely on third-party sources when they describe markets and suppliers. The structure of B2B visibility is changing.",
    to:
      "AI-generated answers often rely on third-party sources when they describe markets and suppliers. The structure of visibility is changing.",
  },
  {
    articleId: "ai-proves-pr-drives-sales",
    field: "coverImageAlt",
    from: "Will AI finally prove that B2B PR drives sales through earned media awareness?",
    to: "Will AI finally prove that PR drives sales through earned media awareness?",
  },
  {
    articleId: "ai-proves-pr-drives-sales",
    field: "seoTitle",
    from: "Will AI finally prove that B2B PR drives sales through earned media awareness? | AIO Fusion",
    to: "Will AI finally prove that PR drives sales through earned media awareness? | AIO Fusion",
  },
] as const;

/**
 * The externally hosted guide is not first-party article content.  Only the
 * promotional CMS fields that are checked in here are eligible.  Its URL,
 * slug, ID, dates, and external content remain untouched.
 */
export const TASK_290_EXTERNAL_GUIDE_CHANGES: readonly InsightTextChange[] = [
  {
    articleId: "ext-guide",
    field: "title",
    from: "The B2B Marketer's Fast Guide to Winning AI Authority in 2026",
    to: "A Marketer's Guide to Winning AI Authority in 2026",
  },
  {
    articleId: "ext-guide",
    field: "excerpt",
    from:
      "What is AIO? And is PR really the new SEO? Cut through the hype around AI's impact on B2B marketing.",
    to:
      "What is AIO? And is PR really the new SEO? Explore AI's impact on marketing.",
  },
  {
    articleId: "ext-guide",
    field: "coverImageAlt",
    from: "The B2B Marketer's Fast Guide to Winning AI Authority in 2026",
    to: "A Marketer's Guide to Winning AI Authority in 2026",
  },
  {
    articleId: "ext-guide",
    field: "seoTitle",
    from: "The B2B Marketer's Fast Guide to Winning AI Authority in 2026",
    to: "A Marketer's Guide to Winning AI Authority in 2026",
  },
  {
    articleId: "ext-guide",
    field: "seoDescription",
    from:
      "What is AIO? And is PR really the new SEO? Cut through the hype around AI's impact on B2B marketing.",
    to:
      "What is AIO? And is PR really the new SEO?",
  },
  {
    articleId: "ext-guide",
    field: "focusKeyphrase",
    from: "B2B AI authority",
    to: "AI authority",
  },
] as const;

export const TASK_290_CHANGES: readonly InsightTextChange[] = [
  ...TASK_290_FIRST_PARTY_CHANGES,
  ...TASK_290_EXTERNAL_GUIDE_CHANGES,
];

const CHANGEABLE_FIELDS = new Set<InsightTextChange["field"]>([
  "title",
  "excerpt",
  "coverImageAlt",
  "seoTitle",
  "seoDescription",
  "focusKeyphrase",
  "body",
]);

export type InsightMigrationUpdate = Partial<
  Pick<
    InsightArticleRow,
    "title" | "excerpt" | "body" | "coverImageAlt" | "seoTitle" | "seoDescription" | "focusKeyphrase"
  >
>;

export interface InsightMigrationResult {
  articleId: string;
  eligible: boolean;
  updates: InsightMigrationUpdate;
  matchedChanges: number;
  skippedChanges: number;
}

type TextInsightBlock = Extract<InsightBlock, { text: string }>;

function isBodyBlock(block: InsightBlock | undefined): block is TextInsightBlock {
  return Boolean(block && "text" in block && typeof block.text === "string");
}

function readField(row: InsightArticleRow, change: Exclude<InsightTextChange, { field: "body" }>): string | null {
  const value = row[change.field];
  return typeof value === "string" ? value : null;
}

/**
 * Build a conditional update for one row.  This function does not mutate the
 * row, and it intentionally returns no update for drafts or non-seeded IDs.
 */
export function planInsightMigration(row: InsightArticleRow): InsightMigrationResult {
  if (row.status !== "published") {
    return {
      articleId: row.id,
      eligible: false,
      updates: {},
      matchedChanges: 0,
      skippedChanges: 0,
    };
  }

  const changes = TASK_290_CHANGES.filter((change) => change.articleId === row.id);
  if (changes.length === 0) {
    return {
      articleId: row.id,
      eligible: false,
      updates: {},
      matchedChanges: 0,
      skippedChanges: 0,
    };
  }

  const updates: InsightMigrationUpdate = {};
  let matchedChanges = 0;
  let skippedChanges = 0;
  const body = Array.isArray(row.body) ? [...row.body] : [];
  let bodyChanged = false;

  for (const change of changes) {
    if (!CHANGEABLE_FIELDS.has(change.field)) {
      skippedChanges++;
      continue;
    }

    if (change.field === "body") {
      const current = body[change.bodyIndex];
      if (!isBodyBlock(current) || current.text !== change.from) {
        skippedChanges++;
        continue;
      }
      body[change.bodyIndex] = { ...current, text: change.to };
      bodyChanged = true;
      matchedChanges++;
      continue;
    }

    const current = readField(row, change);
    if (current !== change.from) {
      skippedChanges++;
      continue;
    }
    updates[change.field] = change.to;
    matchedChanges++;
  }

  if (bodyChanged) updates.body = body;
  return {
    articleId: row.id,
    eligible: true,
    updates,
    matchedChanges,
    skippedChanges,
  };
}

export function applyInsightMigrationToRow(row: InsightArticleRow): InsightArticleRow {
  const plan = planInsightMigration(row);
  if (Object.keys(plan.updates).length === 0) return row;
  return { ...row, ...plan.updates };
}
