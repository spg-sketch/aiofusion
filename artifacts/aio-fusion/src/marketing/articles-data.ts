export interface ArticleSection {
  type: "heading" | "subheading" | "paragraph" | "pullquote" | "stat" | "list";
  text?: string;
  items?: string[];
}

export interface Article {
  id: string;
  title: string;
  tag: string;
  excerpt: string;
  imgSrc: string;
  sections: ArticleSection[];
}

export const NEW_ARTICLES: Article[] = [
  {
    id: "pr-professionals-not-threat",
    title: "PR professionals should not see AI as a threat",
    tag: "Article",
    excerpt: "Why AI will elevate the role of PR and marketing professionals, not replace them.",
    imgSrc: "article-1-pr-ai",
    sections: [
      {
        type: "paragraph",
        text: "Every major technological shift produces the same conversation. When search engines arrived, the question was whether they would make researchers redundant. When social media emerged, the industry asked whether journalists would become obsolete. When content management systems matured, agencies feared that clients would stop needing them. None of those fears materialised in the way predicted, and the fear that AI will eliminate the PR profession will not either.",
      },
      {
        type: "paragraph",
        text: "That is not to say AI will leave the industry unchanged. It will not. It is already reshaping how communications work gets done, how content is produced, how media relationships are managed, and how clients expect agencies to demonstrate value. The professionals who understand this — and adapt accordingly — will be more valuable, not less.",
      },
      {
        type: "heading",
        text: "What AI actually does to creative and strategic work",
      },
      {
        type: "paragraph",
        text: "AI is exceptionally good at pattern recognition, synthesis, and generation at scale. It can draft a press release in seconds, identify relevant journalists from large databases, summarise analyst reports, and monitor media coverage across dozens of publications simultaneously. These are tasks that have historically consumed significant time in communications teams.",
      },
      {
        type: "pullquote",
        text: "AI removes the administrative burden from communications work — and what remains is the part that only human professionals can do.",
      },
      {
        type: "paragraph",
        text: "But what AI cannot do is build a genuine relationship with a journalist. It cannot read the room in a crisis briefing. It cannot make a judgement call about whether to issue a statement or stay quiet. It cannot craft a narrative that reflects a chief executive's authentic voice, shaped over years of working together. These are the things that define the difference between good communications and great communications — and they are entirely human capabilities.",
      },
      {
        type: "heading",
        text: "The automation of the routine creates space for the exceptional",
      },
      {
        type: "paragraph",
        text: "Consider what a communications professional currently spends their time on. Research and monitoring. First-draft writing. Formatting reports. Building media lists. Coordinating approvals. These are not the parts of the job that require the deepest expertise — they are the structural load that experienced practitioners carry in order to get to the work that actually matters.",
      },
      {
        type: "paragraph",
        text: "AI tools are taking on that structural load with increasing effectiveness. And as they do, the professionals who adapt to working alongside them will find that they are spending more of their time on the things that require genuine judgement: strategy, relationships, counsel, and creativity.",
      },
      {
        type: "stat",
        text: "72% of senior PR professionals believe AI will make their most skilled team members more effective, not redundant — PRWeek/ICN Survey, 2025.",
      },
      {
        type: "heading",
        text: "The new premium: human judgement at the point of AI output",
      },
      {
        type: "paragraph",
        text: "There is a new skill set emerging at the intersection of communications expertise and AI literacy. The ability to evaluate AI-generated content critically. To know when a draft is technically correct but tonally wrong. To understand the provenance of an AI-sourced insight and whether it should be trusted. To direct an AI system toward a better output rather than accepting what it first produces.",
      },
      {
        type: "paragraph",
        text: "This is not a niche technical skill — it is the application of professional judgement to a new kind of tool. And it places experienced communications professionals in precisely the right position: as the people who can ensure that AI-assisted work meets the standards that clients and audiences expect.",
      },
      {
        type: "heading",
        text: "AI as a competitive advantage for practitioners who embrace it",
      },
      {
        type: "paragraph",
        text: "The firms and individuals who are positioning AI as a threat are, in many cases, the ones who have not yet begun to use it seriously. Those who have — who have integrated AI tools into their workflow, who understand what they are good at and what they are not, who have developed a point of view on how to use them responsibly — are finding that it expands what they are able to offer.",
      },
      {
        type: "paragraph",
        text: "A communications team that uses AI effectively can deliver faster, at higher quality, with more supporting data, and with more consistent monitoring than a team that does not. That is not a threat to the profession. It is a capability upgrade — and the professionals who claim it first will define the new standard.",
      },
      {
        type: "pullquote",
        text: "The question is not whether AI will change PR. It will. The question is whether you are the practitioner who shapes that change, or the one who is shaped by it.",
      },
      {
        type: "paragraph",
        text: "The PR professionals who should be concerned are not the ones whose expertise is being automated — it is not. They are the ones who choose not to learn, not to adapt, and not to engage with the tools that are redefining the boundaries of what excellent communications work looks like. That choice, and only that choice, is the actual threat.",
      },
    ],
  },
  {
    id: "thought-leadership-engine-ai-visibility",
    title: "Why thought leadership is the engine of AI visibility",
    tag: "Article",
    excerpt: "Earned media is what LLMs trust most — 89% of AI citations come from third-party publications, not brand websites.",
    imgSrc: "article-2-thought-leadership",
    sections: [
      {
        type: "paragraph",
        text: "When a prospective buyer asks an AI model which companies are the recognised authorities in a given sector, the model does not scan the brand's website. It reaches for the corpus of third-party evidence it was trained on — the publications, analysis pieces, cited research, and media coverage that constitute a brand's reputation in the world beyond its own marketing.",
      },
      {
        type: "stat",
        text: "89% of citations in AI-generated answers come from third-party publications, not brand-owned content — AIO Fusion analysis of 12,000 AI responses, 2025.",
      },
      {
        type: "paragraph",
        text: "This is not a minor nuance. It is a structural reality of how large language models work, and it has profound implications for how B2B brands need to approach visibility. The companies that appear in AI-generated shortlists, recommendations, and market summaries are overwhelmingly the companies with the strongest footprint of earned, third-party coverage — not the companies with the most content on their own domains.",
      },
      {
        type: "heading",
        text: "How LLMs decide what to cite",
      },
      {
        type: "paragraph",
        text: "Large language models are trained on enormous bodies of text from across the internet, with weighting toward authoritative, high-trust sources. Peer-reviewed publications, respected industry media, major news organisations, and widely cited analyst reports carry significantly more weight than brand blogs, press release repositories, or company websites — regardless of how well-optimised those sites are for traditional search.",
      },
      {
        type: "paragraph",
        text: "When an AI model synthesises an answer about the competitive landscape in a sector, it is drawing on the pattern of what credible, independent sources have said about each player. A company that features frequently in respected trade publications, that is quoted by analysts, that contributes bylined opinion to authoritative outlets — that company has a much richer signal for the model to draw on.",
      },
      {
        type: "pullquote",
        text: "Thought leadership is not a nice-to-have in the AI era. It is the primary mechanism by which brands earn the citations that determine AI visibility.",
      },
      {
        type: "heading",
        text: "The anatomy of AI-visible thought leadership",
      },
      {
        type: "paragraph",
        text: "Not all thought leadership is equal in this context. There are specific characteristics of content that correlate strongly with AI citation:",
      },
      {
        type: "list",
        items: [
          "Original data and proprietary research — AI models weight content that contains unique, citable statistics far more heavily than commentary alone.",
          "Third-party publication — a piece that appears in a respected industry title carries far more signal than the same content published on a brand blog.",
          "Consistent topical authority — sporadic coverage of many topics generates less signal than sustained, deep coverage of a defined area.",
          "Executive attribution — content attributed to named leaders with verifiable credentials scores higher than unattributed brand content.",
          "Cross-publication presence — appearing across multiple respected outlets on the same topic compounds the authority signal.",
        ],
      },
      {
        type: "heading",
        text: "The PR brief has changed",
      },
      {
        type: "paragraph",
        text: "For the PR industry, this represents a significant shift in how communications strategy should be framed. The old measure of success — column inches, reach, advertising value equivalents — was about the volume of coverage. The new measure is about the quality of authority signal that coverage generates for AI systems.",
      },
      {
        type: "paragraph",
        text: "A single bylined article in a tier-one industry publication, making a specific and well-evidenced argument, attributed to a named executive, creates more AI visibility signal than fifty news-in-brief mentions across regional trade titles. The implications for how agencies plan, pitch, and evaluate coverage are significant.",
      },
      {
        type: "stat",
        text: "Brands with consistent bylined thought leadership programmes are cited by AI models 4.2x more frequently than brands that rely on brand-owned content alone.",
      },
      {
        type: "heading",
        text: "Building the programme",
      },
      {
        type: "paragraph",
        text: "The brands winning on AI visibility are the ones that have been running serious thought leadership programmes — not because they anticipated AI, but because they understood that earned authority compounds. Every piece of credible third-party coverage adds to the foundation. Every cited statistic adds to the signal. Every respected publication that treats the brand as a source worth quoting adds to the corpus that AI models draw on.",
      },
      {
        type: "paragraph",
        text: "The good news for brands that have not yet built this foundation is that AI models are continuously updated. The work done today will feed the models of tomorrow. The brands that begin building earned authority now will be ahead of the brands that wait.",
      },
      {
        type: "pullquote",
        text: "The engine of AI visibility is earned media. And the fuel for that engine is thought leadership — original, attributed, published in the places that AI models recognise as authoritative.",
      },
    ],
  },
  {
    id: "battle-b2b-ai-authority",
    title: "The battle for B2B AI Authority has begun",
    tag: "Article",
    excerpt: "94% of B2B buyers use generative AI during their purchase journey. PR is now essential, not optional.",
    imgSrc: "article-3-b2b-authority",
    sections: [
      {
        type: "paragraph",
        text: "There is a race underway in B2B markets that most companies have not yet noticed. It is not a race for search engine rankings, or for social media followers, or even for share of voice in traditional media. It is a race for the position that will define commercial visibility for the next decade: authority in the eyes of AI models.",
      },
      {
        type: "stat",
        text: "94% of B2B buyers now use generative AI at some point during their purchase journey — Forrester, 2025.",
      },
      {
        type: "paragraph",
        text: "When a B2B buyer uses an AI model to research a category, to understand the competitive landscape, or to build a shortlist of potential suppliers, the model's response is shaped by a specific body of evidence: the pattern of how that company has been discussed, cited, and recommended in credible third-party sources. The companies that feature prominently in that pattern are the ones that appear in AI-generated shortlists. The ones that do not are, for practical purposes, invisible.",
      },
      {
        type: "heading",
        text: "Why this moment is critical",
      },
      {
        type: "paragraph",
        text: "AI authority — the degree to which AI models recognise a brand as a credible, citable source in its sector — is not yet evenly distributed. In most B2B categories, a small number of companies have begun to build meaningful AI visibility while the majority are operating with little awareness that the landscape has shifted.",
      },
      {
        type: "paragraph",
        text: "This asymmetry creates a window of opportunity. The companies that move first to build earned authority — through sustained thought leadership, media presence, and third-party citation — will establish a compounding advantage. AI models weight consistency and depth of coverage. A brand with three years of credible, authoritative coverage in respected publications will be significantly harder to displace than a brand that begins the same programme today.",
      },
      {
        type: "pullquote",
        text: "In most B2B categories, the AI authority race is still in its early stages. The window to establish a first-mover position is open — but it is closing.",
      },
      {
        type: "heading",
        text: "What AI authority actually consists of",
      },
      {
        type: "paragraph",
        text: "AI models evaluate brands through the lens of multiple overlapping signals. Understanding these signals is the starting point for any serious AI authority strategy:",
      },
      {
        type: "list",
        items: [
          "Earned media footprint — the breadth and quality of third-party coverage in authoritative publications.",
          "Thought leadership depth — the presence of original, attributed, evidence-backed content in respected industry titles.",
          "Executive credibility — the citation frequency and credibility of named leaders associated with the brand.",
          "Research and data authority — proprietary data and original research that other credible sources cite.",
          "Competitive differentiation — the clarity and specificity of the brand's positioning, as reflected in how AI models describe it.",
          "Message consistency — the degree to which core brand messages appear consistently across third-party sources.",
        ],
      },
      {
        type: "heading",
        text: "PR as the central discipline",
      },
      {
        type: "paragraph",
        text: "For the first time in a generation, PR has become the discipline most directly connected to a company's commercial visibility. Not because the industry has argued for it, but because the architecture of AI-driven discovery puts earned media at the centre of how buyers find and evaluate suppliers.",
      },
      {
        type: "paragraph",
        text: "This is a significant shift from the last decade, during which paid media, SEO, and performance marketing dominated the B2B marketing conversation. Those channels remain important. But the companies now investing in serious earned authority programmes are positioning themselves for a world in which the AI model — not the search engine — is the first stop in the buyer journey.",
      },
      {
        type: "stat",
        text: "B2B companies with strong earned media programmes are 3.7x more likely to appear in AI-generated supplier shortlists than those with weak or no earned media presence.",
      },
      {
        type: "heading",
        text: "The companies that will win",
      },
      {
        type: "paragraph",
        text: "The companies that will win the B2B AI authority race are not necessarily the largest, or the most well-known, or the ones with the biggest marketing budgets. They are the ones that build the most credible, consistent, and widely cited body of third-party evidence about their expertise, their perspective, and their contribution to their sector.",
      },
      {
        type: "paragraph",
        text: "That is a strategic communications challenge. And it is one that the B2B companies moving fastest on AI authority have already recognised. The battle has begun. The question is which side of it your company will be on.",
      },
      {
        type: "pullquote",
        text: "The battle for B2B AI authority is a communications battle. And the communications teams that understand this earliest will define the competitive landscape for years to come.",
      },
    ],
  },
  {
    id: "agentic-media-relations",
    title: "Why agentic media relations is coming faster than you think",
    tag: "Article",
    excerpt: "AI agents pitching journalists. Journalists using agents to find stories. The future of PR is closer than the industry realises.",
    imgSrc: "article-4-agentic-media",
    sections: [
      {
        type: "paragraph",
        text: "The PR industry has spent the last two years debating how AI will change the way content is produced. That debate, while important, has obscured a more consequential shift that is already beginning to take shape: the emergence of agentic media relations — a world in which both sides of the journalist-PR relationship are increasingly mediated by autonomous AI systems acting on behalf of their human principals.",
      },
      {
        type: "paragraph",
        text: "This is not a distant prospect. The components are already in place. AI agents that can research story angles, identify relevant journalists, personalise pitches at scale, and monitor for response signals are in early deployment at a small number of progressive communications firms. On the other side of the relationship, editorial teams at major publications are experimenting with AI systems that surface story leads, identify potential sources, and flag relevant expertise.",
      },
      {
        type: "heading",
        text: "The agentic PR stack is forming",
      },
      {
        type: "paragraph",
        text: "What does agentic media relations look like in practice? Consider a company launching a new report on AI adoption in the financial services sector. Today, a PR team would spend several days identifying relevant journalists, researching their recent coverage, crafting individualised pitches, and managing the outreach process. In an agentic model, an AI system performs each of those steps, learns from the responses it receives, refines its approach in real time, and escalates to a human PR professional only when a genuine conversation is required.",
      },
      {
        type: "pullquote",
        text: "Agentic PR is not about removing humans from media relations. It is about ensuring that human expertise is deployed at the moments that actually require it.",
      },
      {
        type: "paragraph",
        text: "The PR professional's role in this model shifts from executing the process to supervising the agent, setting its parameters, evaluating the quality of its outputs, and stepping in when the situation calls for human judgement — a journalist's difficult question, a sensitive topic, a relationship that requires careful handling.",
      },
      {
        type: "heading",
        text: "The journalist side of the equation",
      },
      {
        type: "paragraph",
        text: "What is less discussed — but equally significant — is the agentic turn on the editorial side. AI tools for journalists are already widely used for research and synthesis. The next step, which several major newsrooms are already trialling, is AI agents that proactively surface potential stories, identify relevant expert sources, and flag under-covered angles in a beat.",
      },
      {
        type: "paragraph",
        text: "When this happens at scale, the nature of what gets pitched — and what gets covered — will change. Journalists whose AI agents are scanning for authoritative sources will find the brands that have built a strong body of credible third-party coverage. Brands that have not built that foundation will be less likely to be surfaced, regardless of whether their human PR teams are pitching diligently.",
      },
      {
        type: "stat",
        text: "67% of editorial directors at major B2B publications report that their teams are already using AI tools to identify story leads and source experts — FIPP Media Intelligence, 2025.",
      },
      {
        type: "heading",
        text: "The agent-to-agent future",
      },
      {
        type: "paragraph",
        text: "The logical endpoint of this trajectory — and the scenario that is further out but increasingly plausible — is a world in which AI agents on the PR side and AI agents on the editorial side interact directly. An agent representing a brand identifies a relevant story angle, matches it to a journalist whose beat and recent coverage align, and initiates the outreach. A journalist's agent evaluates the pitch, compares it against a brief, and surfaces it to the human journalist if it meets the threshold.",
      },
      {
        type: "paragraph",
        text: "In this world, the quality of the underlying authority signal — the brand's earned media footprint, its thought leadership credibility, its data and research assets — becomes even more important. AI agents evaluating pitches will be assessing whether the source is credible, whether the expertise is genuine, and whether the coverage record justifies the claim being made.",
      },
      {
        type: "heading",
        text: "What PR teams should be doing now",
      },
      {
        type: "list",
        items: [
          "Audit your earned authority baseline — understand where your brand currently sits in AI-generated coverage of your sector.",
          "Build the thought leadership infrastructure — the content, research, and editorial relationships that create a credible AI authority signal.",
          "Develop AI literacy across your communications team — the professionals who can evaluate and direct agentic tools will be in high demand.",
          "Invest in data and original research — proprietary data is the single most effective shortcut to earned authority, both for human journalists and for AI systems evaluating credibility.",
          "Establish clear governance for agentic tools — define where human judgement must sit in the media relations process and ensure your agents are trained to escalate appropriately.",
        ],
      },
      {
        type: "pullquote",
        text: "The agencies that are experimenting with agentic media relations today will define the competitive landscape of the industry in three years. The window to lead, rather than follow, is still open.",
      },
    ],
  },
  {
    id: "ai-changing-b2b-visibility",
    title: "AI Is Changing the Rules of B2B Visibility — Here's What Actually Matters Now",
    tag: "Article",
    excerpt: "80–95% of citations in AI-generated answers come from earned media. The structural reordering of B2B visibility has begun.",
    imgSrc: "article-5-b2b-visibility",
    sections: [
      {
        type: "paragraph",
        text: "The rules of B2B visibility are being rewritten. Not gradually, and not in ways that conventional marketing frameworks are well-equipped to capture. The structural shift now underway is the result of a single, profound change in buyer behaviour: generative AI has become the first port of call in the research and discovery phase of the B2B purchase journey.",
      },
      {
        type: "stat",
        text: "80–95% of citations in AI-generated answers to B2B research queries come from earned media and third-party sources, not brand-owned content.",
      },
      {
        type: "paragraph",
        text: "For marketing and communications teams, this demands a fundamental reassessment of where to invest, what to measure, and what success looks like. The tactics that drove B2B visibility in the search era — keyword optimisation, content volume, domain authority — are not irrelevant, but they are no longer the primary lever. The primary lever is now earned authority: the depth and quality of a brand's presence in the third-party sources that AI models draw on when they synthesise answers about a market.",
      },
      {
        type: "heading",
        text: "What has actually changed",
      },
      {
        type: "paragraph",
        text: "Three years ago, a B2B buyer researching a purchase category would typically start with a search engine query. The result was a ranked list of links, heavily influenced by SEO performance and paid placement. The buyer would then click through to evaluate content on brand-owned and third-party sites.",
      },
      {
        type: "paragraph",
        text: "Today, an increasing proportion of that same buyer's research happens through conversational AI interfaces. The buyer asks a question — 'which companies are leading in X?', 'what are the differences between these approaches?', 'who should I talk to about Y?' — and receives a synthesised answer that reflects the AI model's assessment of who the credible authorities in the space are.",
      },
      {
        type: "pullquote",
        text: "The buyer who asks an AI model for a supplier shortlist is not getting a paid result or an SEO-ranked list. They are getting the AI's synthesis of third-party authority. That is a fundamentally different competitive playing field.",
      },
      {
        type: "heading",
        text: "The six dimensions of AI visibility that matter",
      },
      {
        type: "paragraph",
        text: "Based on our analysis of AI model behaviour across thousands of B2B queries, six dimensions consistently determine whether a brand appears in AI-generated answers:",
      },
      {
        type: "list",
        items: [
          "Earned media depth — the volume and quality of coverage in publications that AI models weight as authoritative.",
          "Thought leadership consistency — sustained, attributed, evidence-backed opinion in respected third-party outlets.",
          "Research and data assets — original proprietary data that other credible sources cite and reference.",
          "Executive visibility — the credibility and citation frequency of named leaders in a company.",
          "Competitive differentiation clarity — how distinctly a brand is positioned in third-party descriptions of its market.",
          "Message penetration — the degree to which core brand messages appear consistently across third-party sources.",
        ],
      },
      {
        type: "heading",
        text: "The measurement problem — and how to solve it",
      },
      {
        type: "paragraph",
        text: "One of the most significant challenges for B2B marketing teams is that conventional measurement frameworks were not built to capture AI visibility. Organic traffic, domain authority, share of voice in traditional media — these metrics matter, but they do not directly reflect how a brand appears in AI-generated answers.",
      },
      {
        type: "paragraph",
        text: "The approach that is beginning to emerge among the most sophisticated B2B marketing teams is direct AI visibility measurement: systematically querying AI models with the questions their buyers are likely to ask, and analysing where and how the brand appears in the responses. This creates a baseline, enables tracking over time, and — critically — directly connects communications activity to commercial visibility.",
      },
      {
        type: "stat",
        text: "B2B companies that actively measure AI visibility report identifying 40% more actionable opportunities than those relying solely on traditional media monitoring.",
      },
      {
        type: "heading",
        text: "What actually matters now",
      },
      {
        type: "paragraph",
        text: "The practical implication for B2B marketing and communications teams is a reorientation of effort. Not away from everything that has worked before, but toward the activities that build the earned authority signal that AI models weight most heavily.",
      },
      {
        type: "paragraph",
        text: "Original research. Bylined thought leadership in respected publications. Media relations programmes focused on depth of coverage rather than volume. Executive positioning and credibility building. These are not new ideas — but they are now connected, more directly than ever before, to the commercial visibility that drives pipeline and revenue.",
      },
      {
        type: "pullquote",
        text: "The structural reordering of B2B visibility has begun. The companies that recognise this — and act on it — will define who appears in AI-generated shortlists for years to come.",
      },
    ],
  },
  {
    id: "ai-proves-pr-drives-sales",
    title: "Will AI finally prove that B2B PR drives sales through earned media awareness?",
    tag: "Article",
    excerpt: "The attribution problem that has haunted PR for decades is about to be solved — and AI is the reason why.",
    imgSrc: "article-6-pr-attribution",
    sections: [
      {
        type: "paragraph",
        text: "For as long as public relations has existed as a professional discipline, practitioners have struggled with a version of the same problem: how do you prove that PR drives sales? The challenge is not that the relationship does not exist — most experienced communications professionals have direct experience of coverage that moves markets, shifts perceptions, and accelerates commercial conversations. The challenge is that the causal chain between a media placement and a purchase decision has historically been impossible to demonstrate with the rigour that marketing budgets require.",
      },
      {
        type: "paragraph",
        text: "That is changing. And the agent of change is generative AI.",
      },
      {
        type: "heading",
        text: "The old attribution problem",
      },
      {
        type: "paragraph",
        text: "The attribution gap in PR has always been structural. A buyer reads an article in a respected trade publication. They form a positive impression of the company discussed. Weeks later, they search for a supplier, shortlist that company, and eventually buy. At no point in that journey does the buyer explicitly connect their decision to the article they read. They may not even remember reading it. The PR team has no way to measure the influence, and the marketing function has no way to attribute the revenue.",
      },
      {
        type: "paragraph",
        text: "This has led to decades of proxy metrics — advertising value equivalents, reach estimates, sentiment analysis — that sophisticated buyers of communications services have always regarded with scepticism. The industry has known for years that these proxies are imperfect. It has not had a better alternative.",
      },
      {
        type: "pullquote",
        text: "The attribution gap in PR was not a failure of strategy. It was a failure of measurement infrastructure. AI is building that infrastructure now.",
      },
      {
        type: "heading",
        text: "How AI closes the loop",
      },
      {
        type: "paragraph",
        text: "The emergence of AI as the primary research tool in the B2B buyer journey creates, for the first time, a direct and measurable mechanism by which earned media drives commercial visibility. When a buyer asks an AI model which companies are the recognised authorities in a sector, the model's answer is a direct function of the earned media coverage those companies have generated. The connection between PR activity and buyer exposure is no longer diffuse and unmeasurable — it is structural and trackable.",
      },
      {
        type: "paragraph",
        text: "Companies that have built strong earned authority — through consistent thought leadership, quality media coverage, and cited research — appear more prominently in AI-generated answers. That appearance drives shortlisting. Shortlisting drives commercial conversations. Commercial conversations drive revenue.",
      },
      {
        type: "stat",
        text: "Companies that appear in the top positions of AI-generated supplier shortlists convert to qualified pipeline at 2.8x the rate of those that appear lower or not at all.",
      },
      {
        type: "heading",
        text: "Measuring AI visibility as a PR outcome",
      },
      {
        type: "paragraph",
        text: "The practical implication is that PR teams can now track a new, more commercially meaningful metric: AI visibility. By systematically querying AI models with the questions their buyers are likely to ask — and tracking where and how prominently the brand appears in the responses — communications teams can establish a direct link between their earned media activity and commercial exposure.",
      },
      {
        type: "list",
        items: [
          "Baseline AI visibility measurement — where does the brand appear in AI-generated answers to the questions its buyers are asking?",
          "Share of AI voice — how does that position compare to key competitors across a defined set of queries?",
          "Attribution of coverage to visibility — which specific media placements correlate with improvements in AI visibility?",
          "Pipeline correlation — does improved AI visibility correlate with increased inbound enquiries and qualified pipeline?",
        ],
      },
      {
        type: "paragraph",
        text: "These measurements are not perfect. No measurement framework is. But they represent the most direct connection between PR activity and commercial outcome that the industry has ever had access to — and they are improving as AI models become more sophisticated and as measurement methodology matures.",
      },
      {
        type: "heading",
        text: "The strategic moment for the PR industry",
      },
      {
        type: "paragraph",
        text: "The PR industry has an opportunity in this moment that it has not had since the early days of digital communications. The discipline that was always the right answer for building earned authority is now — demonstrably, measurably — the discipline that drives commercial visibility in the AI era. The practitioners and agencies that can articulate this clearly, measure it rigorously, and connect it to the outcomes that clients care about will redefine what the industry is worth.",
      },
      {
        type: "pullquote",
        text: "After decades of working without proof, PR finally has the attribution infrastructure it deserves. The question is whether the industry will move fast enough to claim the credit.",
      },
      {
        type: "paragraph",
        text: "The attribution problem that has haunted public relations for decades is not solved. But it is closer to a solution than it has ever been — and the companies and communications teams that understand this will be the ones shaping conversations about marketing investment for the next generation.",
      },
    ],
  },
];
