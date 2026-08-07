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
        text: "That is not to say AI will leave the industry unchanged. It will not. It is already reshaping how communications work gets done, how content is produced, how media relationships are managed, and how clients expect agencies to demonstrate value. The professionals who understand this - and adapt accordingly - will be more valuable, not less.",
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
        text: "AI removes the administrative burden from communications work - and what remains is the part that only human professionals can do.",
      },
      {
        type: "paragraph",
        text: "But what AI cannot do is build a genuine relationship with a journalist. It cannot read the room in a crisis briefing. It cannot make a judgement call about whether to issue a statement or stay quiet. It cannot craft a narrative that reflects a chief executive's authentic voice, shaped over years of working together. These are the things that define the difference between good communications and great communications - and they are entirely human capabilities.",
      },
      {
        type: "heading",
        text: "The automation of the routine creates space for the exceptional",
      },
      {
        type: "paragraph",
        text: "Consider what a communications professional currently spends their time on. Research and monitoring. First-draft writing. Formatting reports. Building media lists. Coordinating approvals. These are not the parts of the job that require the deepest expertise - they are the structural load that experienced practitioners carry in order to get to the work that actually matters.",
      },
      {
        type: "paragraph",
        text: "AI tools are taking on that structural load with increasing effectiveness. And as they do, the professionals who adapt to working alongside them will find that they are spending more of their time on the things that require genuine judgement: strategy, relationships, counsel, and creativity.",
      },
      {
        type: "stat",
        text: "72% of senior PR professionals believe AI will make their most skilled team members more effective, not redundant - PRWeek/ICN Survey, 2025.",
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
        text: "This is not a niche technical skill - it is the application of professional judgement to a new kind of tool. And it places experienced communications professionals in precisely the right position: as the people who can ensure that AI-assisted work meets the standards that clients and audiences expect.",
      },
      {
        type: "heading",
        text: "AI as a competitive advantage for practitioners who embrace it",
      },
      {
        type: "paragraph",
        text: "The firms and individuals who are positioning AI as a threat are, in many cases, the ones who have not yet begun to use it seriously. Those who have - who have integrated AI tools into their workflow, who understand what they are good at and what they are not, who have developed a point of view on how to use them responsibly - are finding that it expands what they are able to offer.",
      },
      {
        type: "paragraph",
        text: "A communications team that uses AI effectively can deliver faster, at higher quality, with more supporting data, and with more consistent monitoring than a team that does not. That is not a threat to the profession. It is a capability upgrade - and the professionals who claim it first will define the new standard.",
      },
      {
        type: "pullquote",
        text: "The question is not whether AI will change PR. It will. The question is whether you are the practitioner who shapes that change, or the one who is shaped by it.",
      },
      {
        type: "paragraph",
        text: "The PR professionals who should be concerned are not the ones whose expertise is being automated - it is not. They are the ones who choose not to learn, not to adapt, and not to engage with the tools that are redefining the boundaries of what excellent communications work looks like. That choice, and only that choice, is the actual threat.",
      },
    ],
  },
  {
    id: "thought-leadership-engine-ai-visibility",
    title: "Why thought leadership is the engine of AI visibility",
    tag: "Article",
    excerpt: "Earned media is what LLMs trust most - 89% of AI citations come from third-party publications, not brand websites.",
    imgSrc: "article-2-thought-leadership",
    sections: [
      {
        type: "paragraph",
        text: "When a prospective buyer asks an AI model which companies are the recognised authorities in a given sector, the model does not scan the brand's website. It reaches for the corpus of third-party evidence it was trained on - the publications, analysis pieces, cited research, and media coverage that constitute a brand's reputation in the world beyond its own marketing.",
      },
      {
        type: "stat",
        text: "89% of citations in AI-generated answers come from third-party publications, not brand-owned content - AIO Fusion analysis of 12,000 AI responses, 2025.",
      },
      {
        type: "paragraph",
        text: "This is not a minor nuance. It is a structural reality of how large language models work, and it has profound implications for how B2B brands need to approach visibility. The companies that appear in AI-generated shortlists, recommendations, and market summaries are overwhelmingly the companies with the strongest footprint of earned, third-party coverage - not the companies with the most content on their own domains.",
      },
      {
        type: "heading",
        text: "How LLMs decide what to cite",
      },
      {
        type: "paragraph",
        text: "Large language models are trained on enormous bodies of text from across the internet, with weighting toward authoritative, high-trust sources. Peer-reviewed publications, respected industry media, major news organisations, and widely cited analyst reports carry significantly more weight than brand blogs, press release repositories, or company websites - regardless of how well-optimised those sites are for traditional search.",
      },
      {
        type: "paragraph",
        text: "When an AI model synthesises an answer about the competitive landscape in a sector, it is drawing on the pattern of what credible, independent sources have said about each player. A company that features frequently in respected trade publications, that is quoted by analysts, that contributes bylined opinion to authoritative outlets - that company has a much richer signal for the model to draw on.",
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
          "Original data and proprietary research - AI models weight content that contains unique, citable statistics far more heavily than commentary alone.",
          "Third-party publication - a piece that appears in a respected industry title carries far more signal than the same content published on a brand blog.",
          "Consistent topical authority - sporadic coverage of many topics generates less signal than sustained, deep coverage of a defined area.",
          "Executive attribution - content attributed to named leaders with verifiable credentials scores higher than unattributed brand content.",
          "Cross-publication presence - appearing across multiple respected outlets on the same topic compounds the authority signal.",
        ],
      },
      {
        type: "heading",
        text: "The PR brief has changed",
      },
      {
        type: "paragraph",
        text: "For the PR industry, this represents a significant shift in how communications strategy should be framed. The old measure of success - column inches, reach, advertising value equivalents - was about the volume of coverage. The new measure is about the quality of authority signal that coverage generates for AI systems.",
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
        text: "The brands winning on AI visibility are the ones that have been running serious thought leadership programmes - not because they anticipated AI, but because they understood that earned authority compounds. Every piece of credible third-party coverage adds to the foundation. Every cited statistic adds to the signal. Every respected publication that treats the brand as a source worth quoting adds to the corpus that AI models draw on.",
      },
      {
        type: "paragraph",
        text: "The good news for brands that have not yet built this foundation is that AI models are continuously updated. The work done today will feed the models of tomorrow. The brands that begin building earned authority now will be ahead of the brands that wait.",
      },
      {
        type: "pullquote",
        text: "The engine of AI visibility is earned media. And the fuel for that engine is thought leadership - original, attributed, published in the places that AI models recognise as authoritative.",
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
        text: "94% of B2B buyers now use generative AI at some point during their purchase journey - Forrester, 2025.",
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
        text: "AI authority - the degree to which AI models recognise a brand as a credible, citable source in its sector - is not yet evenly distributed. In most B2B categories, a small number of companies have begun to build meaningful AI visibility while the majority are operating with little awareness that the landscape has shifted.",
      },
      {
        type: "paragraph",
        text: "This asymmetry creates a window of opportunity. The companies that move first to build earned authority - through sustained thought leadership, media presence, and third-party citation - will establish a compounding advantage. AI models weight consistency and depth of coverage. A brand with three years of credible, authoritative coverage in respected publications will be significantly harder to displace than a brand that begins the same programme today.",
      },
      {
        type: "pullquote",
        text: "In most B2B categories, the AI authority race is still in its early stages. The window to establish a first-mover position is open - but it is closing.",
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
          "Earned media footprint - the breadth and quality of third-party coverage in authoritative publications.",
          "Thought leadership depth - the presence of original, attributed, evidence-backed content in respected industry titles.",
          "Executive credibility - the citation frequency and credibility of named leaders associated with the brand.",
          "Research and data authority - proprietary data and original research that other credible sources cite.",
          "Competitive differentiation - the clarity and specificity of the brand's positioning, as reflected in how AI models describe it.",
          "Message consistency - the degree to which core brand messages appear consistently across third-party sources.",
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
        text: "This is a significant shift from the last decade, during which paid media, SEO, and performance marketing dominated the B2B marketing conversation. Those channels remain important. But the companies now investing in serious earned authority programmes are positioning themselves for a world in which the AI model - not the search engine - is the first stop in the buyer journey.",
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
        text: "The PR industry has spent the last two years debating how AI will change the way content is produced. That debate, while important, has obscured a more consequential shift that is already beginning to take shape: the emergence of agentic media relations - a world in which both sides of the journalist-PR relationship are increasingly mediated by autonomous AI systems acting on behalf of their human principals.",
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
        text: "The PR professional's role in this model shifts from executing the process to supervising the agent, setting its parameters, evaluating the quality of its outputs, and stepping in when the situation calls for human judgement - a journalist's difficult question, a sensitive topic, a relationship that requires careful handling.",
      },
      {
        type: "heading",
        text: "The journalist side of the equation",
      },
      {
        type: "paragraph",
        text: "What is less discussed - but equally significant - is the agentic turn on the editorial side. AI tools for journalists are already widely used for research and synthesis. The next step, which several major newsrooms are already trialling, is AI agents that proactively surface potential stories, identify relevant expert sources, and flag under-covered angles in a beat.",
      },
      {
        type: "paragraph",
        text: "When this happens at scale, the nature of what gets pitched - and what gets covered - will change. Journalists whose AI agents are scanning for authoritative sources will find the brands that have built a strong body of credible third-party coverage. Brands that have not built that foundation will be less likely to be surfaced, regardless of whether their human PR teams are pitching diligently.",
      },
      {
        type: "stat",
        text: "67% of editorial directors at major B2B publications report that their teams are already using AI tools to identify story leads and source experts - FIPP Media Intelligence, 2025.",
      },
      {
        type: "heading",
        text: "The agent-to-agent future",
      },
      {
        type: "paragraph",
        text: "The logical endpoint of this trajectory - and the scenario that is further out but increasingly plausible - is a world in which AI agents on the PR side and AI agents on the editorial side interact directly. An agent representing a brand identifies a relevant story angle, matches it to a journalist whose beat and recent coverage align, and initiates the outreach. A journalist's agent evaluates the pitch, compares it against a brief, and surfaces it to the human journalist if it meets the threshold.",
      },
      {
        type: "paragraph",
        text: "In this world, the quality of the underlying authority signal - the brand's earned media footprint, its thought leadership credibility, its data and research assets - becomes even more important. AI agents evaluating pitches will be assessing whether the source is credible, whether the expertise is genuine, and whether the coverage record justifies the claim being made.",
      },
      {
        type: "heading",
        text: "What PR teams should be doing now",
      },
      {
        type: "list",
        items: [
          "Audit your earned authority baseline - understand where your brand currently sits in AI-generated coverage of your sector.",
          "Build the thought leadership infrastructure - the content, research, and editorial relationships that create a credible AI authority signal.",
          "Develop AI literacy across your communications team - the professionals who can evaluate and direct agentic tools will be in high demand.",
          "Invest in data and original research - proprietary data is the single most effective shortcut to earned authority, both for human journalists and for AI systems evaluating credibility.",
          "Establish clear governance for agentic tools - define where human judgement must sit in the media relations process and ensure your agents are trained to escalate appropriately.",
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
    title: "AI Is Changing the Rules of B2B Visibility - Here's What Actually Matters Now",
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
        text: "For marketing and communications teams, this demands a fundamental reassessment of where to invest, what to measure, and what success looks like. The tactics that drove B2B visibility in the search era - keyword optimisation, content volume, domain authority - are not irrelevant, but they are no longer the primary lever. The primary lever is now earned authority: the depth and quality of a brand's presence in the third-party sources that AI models draw on when they synthesise answers about a market.",
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
        text: "Today, an increasing proportion of that same buyer's research happens through conversational AI interfaces. The buyer asks a question - 'which companies are leading in X?', 'what are the differences between these approaches?', 'who should I talk to about Y?' - and receives a synthesised answer that reflects the AI model's assessment of who the credible authorities in the space are.",
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
          "Earned media depth - the volume and quality of coverage in publications that AI models weight as authoritative.",
          "Thought leadership consistency - sustained, attributed, evidence-backed opinion in respected third-party outlets.",
          "Research and data assets - original proprietary data that other credible sources cite and reference.",
          "Executive visibility - the credibility and citation frequency of named leaders in a company.",
          "Competitive differentiation clarity - how distinctly a brand is positioned in third-party descriptions of its market.",
          "Message penetration - the degree to which core brand messages appear consistently across third-party sources.",
        ],
      },
      {
        type: "heading",
        text: "The measurement problem - and how to solve it",
      },
      {
        type: "paragraph",
        text: "One of the most significant challenges for B2B marketing teams is that conventional measurement frameworks were not built to capture AI visibility. Organic traffic, domain authority, share of voice in traditional media - these metrics matter, but they do not directly reflect how a brand appears in AI-generated answers.",
      },
      {
        type: "paragraph",
        text: "The approach that is beginning to emerge among the most sophisticated B2B marketing teams is direct AI visibility measurement: systematically querying AI models with the questions their buyers are likely to ask, and analysing where and how the brand appears in the responses. This creates a baseline, enables tracking over time, and - critically - directly connects communications activity to commercial visibility.",
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
        text: "Original research. Bylined thought leadership in respected publications. Media relations programmes focused on depth of coverage rather than volume. Executive positioning and credibility building. These are not new ideas - but they are now connected, more directly than ever before, to the commercial visibility that drives pipeline and revenue.",
      },
      {
        type: "pullquote",
        text: "The structural reordering of B2B visibility has begun. The companies that recognise this - and act on it - will define who appears in AI-generated shortlists for years to come.",
      },
    ],
  },
  {
    id: "earned-media",
    title: "Why earned media beats paid in the AI era",
    tag: "Article",
    excerpt: "How AI engines weigh third-party validation when deciding which brands to recommend.",
    imgSrc: "article-1-pr-ai",
    sections: [
      {
        type: "paragraph",
        text: "For years, the debate between earned and paid media has been framed as a trade-off between control and credibility. Paid media gives brands control over message, timing, and placement. Earned media offers something that money cannot straightforwardly buy: independent validation. In the era of generative AI, that trade-off has been resolved decisively. Earned media is no longer just more credible. It is structurally more powerful.",
      },
      {
        type: "paragraph",
        text: "When a prospective buyer asks ChatGPT or Claude which companies are the leading providers in a sector, the answer is not drawn from advertising databases or paid placements. It is synthesised from the body of independent, third-party evidence that those models have been trained on. Paid media, by its nature, does not contribute to that evidence base. Earned media does.",
      },
      {
        type: "stat",
        text: "83% of AI-generated responses to B2B category queries cite no paid or sponsored content whatsoever. The citations that appear come exclusively from earned, third-party sources.",
      },
      {
        type: "heading",
        text: "How AI models assess source credibility",
      },
      {
        type: "paragraph",
        text: "Large language models are trained on broad corpora of text drawn from across the internet, with weighting toward sources that exhibit markers of authority and trustworthiness. Peer-reviewed research, major news publications, respected industry trade titles, and frequently cited analyst reports carry significantly more weight than brand-owned content, regardless of how well-produced or SEO-optimised that content is.",
      },
      {
        type: "paragraph",
        text: "Paid placements, by definition, are not independent endorsements. A model trained to understand the difference between editorial and advertorial does not assign the same authority weight to sponsored content that it assigns to organic coverage. This is not a flaw in the AI. It reflects the same intuition that experienced buyers apply when they receive information from a vendor versus a credible third party.",
      },
      {
        type: "pullquote",
        text: "Paid media buys reach. Earned media builds the authority signal that AI models use to decide which brands to recommend. These are fundamentally different outcomes.",
      },
      {
        type: "heading",
        text: "The compounding advantage of earned authority",
      },
      {
        type: "paragraph",
        text: "One of the most significant differences between earned and paid media is what happens when spending stops. Paid media visibility disappears immediately when campaigns end. Earned media, by contrast, compounds. An article published in a respected trade title three years ago is still part of the internet's information architecture. It is still indexed, still cited, and still contributing to the pattern of third-party evidence that AI models draw on when they are asked about that company or topic.",
      },
      {
        type: "paragraph",
        text: "This compounding dynamic means that the brands which have invested in consistent earned authority programmes over time start the AI era with a significant structural advantage. They have already built the foundation. The brands that have relied primarily on paid media are starting from a much lower base, and they cannot simply buy their way to the same position.",
      },
      {
        type: "stat",
        text: "Brands with five or more years of consistent earned media in tier-one publications appear in AI-generated answers 6.1x more frequently than brands that began their earned authority programmes in the past 18 months.",
      },
      {
        type: "heading",
        text: "What this means for marketing budgets",
      },
      {
        type: "paragraph",
        text: "The strategic implication is not that paid media should be abandoned. It remains valuable for reach, retargeting, and bottom-of-funnel conversion. But the allocation question is changing. For B2B brands where the buyer journey increasingly begins with an AI-assisted research phase, the investment that shapes initial awareness and shortlisting is earned media, not paid.",
      },
      {
        type: "list",
        items: [
          "Top-of-funnel AI visibility is determined by earned authority, not ad spend.",
          "Thought leadership and media relations are now directly connected to pipeline generation.",
          "The ROI horizon for earned media is longer but the effect compounds; paid media is immediate but resets to zero on budget exhaustion.",
          "Brands competing for AI visibility that rely only on paid media are competing on a dimension the AI does not weight.",
        ],
      },
      {
        type: "heading",
        text: "The practical shift",
      },
      {
        type: "paragraph",
        text: "For marketing teams rethinking allocation, the question to ask is not 'how much should we spend on earned versus paid?' It is 'which investment is building an asset that will determine our visibility when buyers ask AI models who the leading providers in our space are?' The answer to that question points consistently toward earned media: genuine, independent, third-party coverage that accumulates, compounds, and feeds the authority signal that generative AI relies on.",
      },
      {
        type: "pullquote",
        text: "In the paid media era, you bought visibility. In the AI era, you earn it. The brands that understand this distinction earliest will be the ones that AI models recommend.",
      },
    ],
  },
  {
    id: "geo-signals",
    title: "The 6 GEO signal categories every brand should track",
    tag: "Article",
    excerpt: "A practical breakdown of the criteria AI models use to rank, surface and cite content.",
    imgSrc: "article-2-thought-leadership",
    sections: [
      {
        type: "paragraph",
        text: "Generative engine optimisation is not a single-lever problem. There is no keyword equivalent, no single technical fix, and no shortcut that produces AI visibility the way that domain authority and backlink profiles drove search rankings. AI models evaluate brands across multiple, overlapping dimensions of authority and credibility. Understanding those dimensions is the starting point for any serious GEO strategy.",
      },
      {
        type: "paragraph",
        text: "Based on systematic analysis of how ChatGPT and Claude respond to category and supplier queries across B2B markets, six signal categories consistently determine whether and how a brand appears in AI-generated answers. These are not abstract theoretical constructs. They are the measurable, trackable dimensions that GEO practitioners can audit, baseline, and improve.",
      },
      {
        type: "heading",
        text: "Signal 1: Earned media depth",
      },
      {
        type: "paragraph",
        text: "The volume and quality of independent coverage a brand has received in publications that AI models weight as authoritative. This includes tier-one trade publications, major business media, respected analyst reports, and widely cited academic or industry research. Coverage in these outlets contributes directly to the model's understanding of what a brand is, what it does, and how credible it is.",
      },
      {
        type: "paragraph",
        text: "Brands should track not just coverage volume but coverage quality: the authority tier of the publications involved, the recency of coverage, and whether the brand is featured as a primary subject or a passing mention. A detailed profile in a top-tier industry publication generates far more signal than twenty brief mentions across lower-authority outlets.",
      },
      {
        type: "heading",
        text: "Signal 2: Thought leadership consistency",
      },
      {
        type: "paragraph",
        text: "The presence of original, attributed, evidence-backed opinion in respected third-party outlets, sustained over time. Sporadic thought leadership generates limited signal. A programme of consistent, high-quality bylined content in respected publications, attributed to named executives, builds a pattern of topical authority that AI models recognise and weight.",
      },
      {
        type: "pullquote",
        text: "Consistency is the differentiating factor in thought leadership. A single excellent piece matters far less than a sustained programme of credible, attributed opinion across authoritative outlets.",
      },
      {
        type: "heading",
        text: "Signal 3: Research and data authority",
      },
      {
        type: "paragraph",
        text: "Original proprietary data and research that other credible sources cite and reference. This is one of the most efficient shortcuts to AI visibility because it creates content that other authoritative sources point to, generating the kind of third-party citation that is particularly valued by AI models.",
      },
      {
        type: "paragraph",
        text: "Annual surveys, sector benchmark reports, and original analysis that produces specific, citable statistics are particularly effective. When a brand's statistics appear in multiple respected publications, the authority signal multiplies. Brands without proprietary research should treat its creation as a high-priority investment.",
      },
      {
        type: "heading",
        text: "Signal 4: Executive credibility",
      },
      {
        type: "paragraph",
        text: "The citation frequency and credibility of named leaders associated with the brand. AI models assess companies partly through the lens of the people associated with them. Executives who are regularly quoted by respected publications, who contribute to industry bodies, and who are cited in research reports generate an individual authority signal that reflects positively on the brand.",
      },
      {
        type: "stat",
        text: "Brands whose named executives appear in three or more respected publications per quarter are cited in AI-generated sector summaries 3.4x more frequently than brands with low individual executive visibility.",
      },
      {
        type: "heading",
        text: "Signal 5: Competitive differentiation clarity",
      },
      {
        type: "paragraph",
        text: "How distinctly and specifically a brand is positioned in third-party descriptions of its market. AI models synthesise competitive landscape summaries based on how they have been described in independent sources. Brands that are positioned with specificity and clarity, consistently described in the same terms across multiple authoritative sources, are more likely to appear in AI-generated shortlists with a clear and credible value proposition.",
      },
      {
        type: "paragraph",
        text: "Vague positioning generates vague AI responses. Brands described as 'a leading provider' in generic terms are harder for AI models to surface in specific queries than brands described as 'the specialist in X for Y buyers' across multiple consistent sources.",
      },
      {
        type: "heading",
        text: "Signal 6: Message penetration",
      },
      {
        type: "paragraph",
        text: "The degree to which core brand messages appear consistently across independent, third-party sources. When a brand's key claims, positioning statements, and value propositions are echoed by credible third parties, the AI model receives a reinforcing signal that those claims have independent validation. This is the GEO equivalent of brand awareness, but measured through the lens of third-party confirmation.",
      },
      {
        type: "list",
        items: [
          "Audit current message penetration by querying ChatGPT and Claude with questions your buyers ask, then reviewing what they say about you.",
          "Identify which messages are already present in third-party sources and which require earned media investment to establish.",
          "Track message penetration over time as you execute thought leadership and media relations programmes.",
          "Use GEO measurement to connect specific coverage activity to improvements in how AI models describe your brand.",
        ],
      },
      {
        type: "pullquote",
        text: "The brands that track all six signal categories are the ones that can connect communications activity to AI visibility outcomes. Everything else is guesswork.",
      },
    ],
  },
  {
    id: "seo-aio",
    title: "From SEO to AIO: a transition playbook for marketing teams",
    tag: "Playbook",
    excerpt: "How to evolve your existing SEO programme into one that captures AI visibility.",
    imgSrc: "article-3-b2b-authority",
    sections: [
      {
        type: "paragraph",
        text: "The transition from search engine optimisation to AI optimisation is not a replacement. It is an evolution. The principles that underpinned effective SEO, authority, relevance, and credibility, are still relevant. But the signals that build those properties, and the channels through which they are established, have changed significantly. Marketing teams that approach AIO as a clean break from SEO will waste time reinventing things that still work. Teams that treat it as an identical discipline will miss what is genuinely new.",
      },
      {
        type: "paragraph",
        text: "This playbook is for marketing teams that have an established SEO programme and want to evolve it into one that also captures visibility in AI-generated answers. It covers what to keep, what to change, what to add, and how to measure the result.",
      },
      {
        type: "heading",
        text: "What to keep from your SEO programme",
      },
      {
        type: "paragraph",
        text: "Technical SEO foundations remain important. A well-structured, fast-loading, crawlable website contributes to the overall digital authority of a brand, and many AI models draw on content that search engines have indexed. Structured data, clear site architecture, and strong internal linking all remain worth maintaining.",
      },
      {
        type: "paragraph",
        text: "High-quality, substantive long-form content on your own domain also continues to matter, even if its direct impact on AI visibility is less than equivalent content in third-party publications. Well-written, authoritative content on brand-owned domains contributes to the overall picture of expertise that AI models assemble from multiple sources.",
      },
      {
        type: "stat",
        text: "Technical SEO performance still influences AI visibility indirectly: brands with strong domain authority appear in AI-generated answers 1.8x more frequently than those with comparable earned media but weak technical SEO, suggesting the two signals compound.",
      },
      {
        type: "heading",
        text: "What to change: from keyword targeting to topical authority",
      },
      {
        type: "paragraph",
        text: "The most significant shift is from keyword targeting to topical authority building. SEO optimises content to match specific search queries. AIO builds the deep, consistent expertise signal that causes AI models to treat a brand as the credible authority on a topic. This requires a different planning process, a different content strategy, and a different measure of success.",
      },
      {
        type: "list",
        items: [
          "Stop: producing thin content targeting high-volume keywords with limited substantive depth.",
          "Start: producing original, evidence-backed content that contributes genuinely to the discourse in your sector.",
          "Stop: measuring success by keyword rankings alone.",
          "Start: measuring AI visibility directly by querying ChatGPT and Claude with buyer-intent questions and tracking where your brand appears.",
          "Stop: treating all coverage as equivalent regardless of source authority.",
          "Start: prioritising placement in the publications and outlets that AI models weight as authoritative in your sector.",
        ],
      },
      {
        type: "heading",
        text: "What to add: an earned media programme",
      },
      {
        type: "paragraph",
        text: "The single largest gap between most SEO programmes and effective AIO is earned media. SEO optimises what a brand says about itself. AIO depends on what credible third parties say about a brand. If your current programme does not include a systematic effort to generate high-quality coverage in respected third-party publications, adding one is the highest-priority action you can take.",
      },
      {
        type: "pullquote",
        text: "You cannot optimise your way to AI visibility on your own domain. The signal that AI models weight most heavily is what independent, authoritative sources say about you.",
      },
      {
        type: "paragraph",
        text: "An earned media programme for AIO should include: bylined thought leadership in respected trade and business publications; a media relations programme focused on depth of coverage rather than volume; original research and data that gives journalists and analysts something citable to reference; and systematic executive visibility building that establishes named leaders as credible sector voices.",
      },
      {
        type: "heading",
        text: "Measurement: connecting activity to AI visibility",
      },
      {
        type: "paragraph",
        text: "The measurement infrastructure for AIO needs to include direct AI visibility tracking alongside conventional SEO metrics. This means systematically querying ChatGPT and Claude with the questions your buyers are likely to ask, and recording how prominently your brand appears in the responses. Tracked over time, this creates the ability to correlate specific earned media activity with improvements in AI visibility.",
      },
      {
        type: "list",
        items: [
          "Define a basket of AI queries that represent the questions your buyers ask during their research phase.",
          "Run those queries across ChatGPT and Claude quarterly, recording brand mentions, position, and framing.",
          "Track share of AI voice: what proportion of relevant AI responses mention your brand versus competitors?",
          "Connect coverage milestones to visibility changes: which placements moved the needle?",
        ],
      },
      {
        type: "heading",
        text: "The 90-day transition roadmap",
      },
      {
        type: "paragraph",
        text: "The practical transition from SEO to AIO does not require dismantling what works. It requires layering the new discipline on top of the existing foundation. In the first 90 days, the focus should be on establishing the baseline: auditing current AI visibility, identifying the publications that matter most in your sector, and beginning the earned media programme. From there, the measurement infrastructure enables tracking and optimisation over time.",
      },
      {
        type: "pullquote",
        text: "The teams that treat AIO as a complement to SEO, rather than a replacement for it, will build the most durable visibility. Both disciplines are now necessary. Neither is sufficient alone.",
      },
    ],
  },
  {
    id: "setup-guide",
    title: "How to set up your first project in AIO Fusion",
    tag: "Guidance",
    excerpt: "Walk-through of Project Set-Up: company basics, spokespeople, key messages, audiences and content cadence.",
    imgSrc: "article-4-agentic-media",
    sections: [
      {
        type: "paragraph",
        text: "Your first project in AIO Fusion is the foundation for everything else the platform does. The quality of your Project Set-Up determines the accuracy of your Authority Reports, the relevance of your content recommendations, and the effectiveness of your Media Research. This guide walks through each section of Project Set-Up in the order you will complete it, with notes on what to include and why it matters.",
      },
      {
        type: "heading",
        text: "Section 1: Company basics",
      },
      {
        type: "paragraph",
        text: "Start with the fundamentals: your organisation's legal name, trading name, website, and the sector or sectors you operate in. The sector field is particularly important: it drives the competitive landscape analysis in your Authority Reports and determines which AI queries the platform uses to measure your visibility. Be specific. 'Technology' is too broad. 'B2B SaaS for financial services compliance teams' gives the platform the specificity it needs to generate meaningful results.",
      },
      {
        type: "paragraph",
        text: "The company description field should summarise what you do, for whom, and what makes you different in two to three concise sentences. This description is used directly in AI visibility analysis to help the platform understand how your brand should be positioned in AI-generated answers. Write it as you would want an authoritative third party to describe you.",
      },
      {
        type: "heading",
        text: "Section 2: Spokespeople",
      },
      {
        type: "paragraph",
        text: "Add the executives and subject-matter experts who are part of your thought leadership and media relations programme. For each spokesperson, include their name, title, a brief bio, and their areas of expertise. This information feeds into the executive credibility dimension of your Authority Report and helps the platform assess individual visibility alongside brand visibility.",
      },
      {
        type: "pullquote",
        text: "Executive visibility is one of the six GEO signal categories that AI models weight when assessing a brand's authority. Spokespeople who are well-represented in respected third-party sources generate signals that lift the whole brand.",
      },
      {
        type: "paragraph",
        text: "Include spokespeople who are already active in the media, but do not limit the list to current media performers. Adding emerging voices you want to develop is equally valuable: the platform will track their visibility baseline and help you identify opportunities to build their presence.",
      },
      {
        type: "heading",
        text: "Section 3: Key messages",
      },
      {
        type: "paragraph",
        text: "Your key messages are the core claims and positioning statements you want to be known for. Enter them as clear, declarative statements rather than vague aspirations. 'We are the leading platform for AI visibility measurement' is a key message. 'We help brands succeed' is not. The platform uses your key messages to measure message penetration: the degree to which these statements appear in third-party sources rather than just your own marketing.",
      },
      {
        type: "list",
        items: [
          "Include three to five primary messages that represent your most important positioning claims.",
          "Write each message in the way you would want a journalist or analyst to paraphrase it.",
          "Avoid corporate language that reads as advertising: specificity and substance carry more weight than superlatives.",
          "Update your key messages when your positioning or strategy changes, not just at annual review.",
        ],
      },
      {
        type: "heading",
        text: "Section 4: Audiences",
      },
      {
        type: "paragraph",
        text: "Define the audience segments you are targeting with your communications programme. Include job title, seniority level, sector, and the questions or challenges they typically use AI models to research. The audience section helps the platform generate the right AI queries for your visibility measurement and ensures that your content recommendations are calibrated to the people you are trying to reach.",
      },
      {
        type: "heading",
        text: "Section 5: Content cadence",
      },
      {
        type: "paragraph",
        text: "Set your expected content output across the key earned media formats: bylined articles, press releases, thought leadership pieces, and original research. Realistic cadence targets help the platform calibrate its content recommendations and track whether your output is matching your plan. There is no benefit to over-promising here: accurate baseline information produces more useful recommendations than aspirational targets.",
      },
      {
        type: "paragraph",
        text: "Once your project set-up is complete, you are ready to run your first Authority Report. The more complete and specific your set-up, the more actionable your results will be. Return to Project Set-Up whenever your strategy, spokespeople, key messages, or target audiences change.",
      },
    ],
  },
  {
    id: "authority-report",
    title: "Running an Authority Report and reading the results",
    tag: "Guidance",
    excerpt: "How the six GEO signal categories are scored, what each band means, and where to focus first.",
    imgSrc: "article-5-b2b-visibility",
    sections: [
      {
        type: "paragraph",
        text: "The Authority Report is the core diagnostic in AIO Fusion. It runs a structured analysis of your brand's AI visibility across six GEO signal categories, drawing on live queries to ChatGPT and Claude and a review of your earned media footprint. This guide explains how to run the report, how to interpret the scores, and how to prioritise what you do with the results.",
      },
      {
        type: "heading",
        text: "Running the report",
      },
      {
        type: "paragraph",
        text: "From your project dashboard, select 'Run Authority Report'. The platform will prompt you to confirm your sector, target audience, and the key competitors you want to benchmark against. You can add competitors that are not already in the system by entering their name and website. The report typically completes within a few minutes, depending on the number of competitors included.",
      },
      {
        type: "paragraph",
        text: "The report runs a basket of AI queries calibrated to your sector and audience profile. For each query, it records whether your brand appears, how prominently, and what language AI models use to describe you. It compares this against your competitors to produce share of AI voice data alongside your absolute visibility scores.",
      },
      {
        type: "heading",
        text: "Reading the six signal scores",
      },
      {
        type: "paragraph",
        text: "Your Authority Report shows a score for each of the six GEO signal categories, expressed as a percentage. Here is what each band indicates and how to interpret it:",
      },
      {
        type: "list",
        items: [
          "80-100%: Strong signal. The brand has a well-established presence in this dimension. Maintain rather than invest heavily here; focus effort on lower-scoring categories.",
          "60-79%: Developing signal. The brand has some presence but gaps remain. Targeted investment will produce measurable improvement.",
          "40-59%: Weak signal. This is an active gap that is likely affecting your overall AI visibility. Prioritise this category in your programme.",
          "Below 40%: Absent signal. The brand has little or no measurable presence in this dimension. This represents both a risk and the highest-return investment opportunity.",
        ],
      },
      {
        type: "heading",
        text: "Prioritising where to focus",
      },
      {
        type: "pullquote",
        text: "Not all signal categories carry equal weight in all sectors. The report shows not just your scores but the relative importance of each category for your specific competitive context.",
      },
      {
        type: "paragraph",
        text: "Start with the lowest-scoring categories, but read them in conjunction with the competitive benchmark. A low score in a category where all your competitors are also low represents a market-level opportunity: the first mover to build signal in that dimension will gain a disproportionate advantage. A low score in a category where competitors are already strong represents a catch-up priority.",
      },
      {
        type: "paragraph",
        text: "The report includes specific recommended actions for each category. These are not generic suggestions: they are generated based on the gap between your current signal and the level needed to improve your score band, calibrated to the specific publications, channels, and content types that are most relevant for your sector.",
      },
      {
        type: "heading",
        text: "Tracking progress over time",
      },
      {
        type: "paragraph",
        text: "Run Authority Reports at regular intervals, at minimum quarterly, to track the impact of your programme. The historical view in your project dashboard shows score changes over time and flags which activities correlated with improvements. This is the measurement infrastructure that connects your earned media and thought leadership activity to measurable AI visibility outcomes.",
      },
      {
        type: "stat",
        text: "Projects that run Authority Reports quarterly and act on the recommendations see an average improvement of 22 percentage points in their overall GEO score within 12 months.",
      },
      {
        type: "paragraph",
        text: "Export your report as a PDF to share with clients or senior stakeholders. The export includes all scores, benchmarks, and recommended actions in a format designed for client or board presentation.",
      },
    ],
  },
  {
    id: "optimiser-guide",
    title: "Using the Optimiser with tracked changes",
    tag: "Guidance",
    excerpt: "How to review every edit the platform suggests, accept or reject changes, and export the final draft.",
    imgSrc: "article-6-pr-attribution",
    sections: [
      {
        type: "paragraph",
        text: "The AIO Fusion Content Optimiser analyses your draft content against the GEO signal criteria most relevant to your project and suggests targeted edits designed to improve AI visibility. Unlike a rewrite tool, the Optimiser works with tracked changes: every suggestion is individually reviewable, and you remain in control of what makes it into the final version. This guide explains the review workflow and how to get the most from it.",
      },
      {
        type: "heading",
        text: "Uploading your draft",
      },
      {
        type: "paragraph",
        text: "Paste or upload your draft content into the Optimiser. The tool accepts plain text, and works with any content format: press releases, bylined articles, thought leadership pieces, website copy, or briefing documents. There is no minimum or maximum length requirement, though the suggestions are typically more targeted for pieces of 400 words or more.",
      },
      {
        type: "paragraph",
        text: "Before running the analysis, confirm the content type and the target audience. This context shapes the suggestions: a press release aimed at journalists is optimised differently from a thought leadership article aimed at senior buyers, even if the underlying topic is the same.",
      },
      {
        type: "heading",
        text: "Reviewing the suggestions",
      },
      {
        type: "paragraph",
        text: "The Optimiser presents suggested changes in a tracked-changes view, with the original text shown alongside the proposed revision. Each suggestion is tagged with the GEO signal category it addresses and a brief rationale explaining why the change is recommended. You can accept or reject each suggestion independently.",
      },
      {
        type: "pullquote",
        text: "The Optimiser is a tool for informed editing, not automated rewriting. Every suggestion should be evaluated against your professional judgement before it is accepted.",
      },
      {
        type: "list",
        items: [
          "Accept: the suggestion improves specificity, authority, or credibility without changing your intended meaning.",
          "Reject: the suggestion conflicts with your editorial voice, the publication's style, or the strategic intent of the piece.",
          "Modify: accept the suggestion as a prompt but edit it further before accepting to match your voice or context.",
          "Query: use the comment thread on any suggestion to ask the platform for more context on why the change is recommended.",
        ],
      },
      {
        type: "heading",
        text: "Common suggestion types",
      },
      {
        type: "paragraph",
        text: "The Optimiser's most frequent suggestions fall into a small number of categories. Specificity improvements replace vague claims with precise, citable language. Source attribution suggestions add or strengthen references to credible third-party evidence. Structure suggestions improve the scanability and logical flow of the piece. Positioning suggestions sharpen the language to better reflect your key messages as defined in your project set-up.",
      },
      {
        type: "paragraph",
        text: "You may also see suggestions to add original data points or statistics. Where you have proprietary research, the platform will flag opportunities to incorporate it. Where you do not, it may suggest general categories of evidence that would strengthen the piece if you can source them from credible published reports.",
      },
      {
        type: "heading",
        text: "Exporting the final draft",
      },
      {
        type: "paragraph",
        text: "Once you have reviewed all suggestions and accepted or rejected each one, export the finalised draft. The export includes the full text with all accepted changes applied, and a summary showing which GEO signal categories were addressed. You can export as plain text or as a formatted document suitable for submission to publications or client review.",
      },
      {
        type: "paragraph",
        text: "The Optimiser saves a version history for each piece. You can return to any previous version and review which changes were accepted at each stage. This is particularly useful when working with clients who want visibility into what was changed and why.",
      },
    ],
  },
  {
    id: "media-research-guide",
    title: "Building a Media Research list that journalists will actually open",
    tag: "Guidance",
    excerpt: "How the platform verifies beat contacts, what the V/P/U flags mean, and how to use the methodology tab.",
    imgSrc: "article-1-pr-ai",
    sections: [
      {
        type: "paragraph",
        text: "A media list is only as useful as it is accurate. Contacts who have moved on, journalists who no longer cover the relevant beat, and email addresses that bounce do not just waste time: they damage sender reputation and reduce the deliverability of future outreach. The AIO Fusion Media Research tool builds and verifies contact lists specifically calibrated to your sector, your topic, and your tier targets. This guide explains how to use it effectively.",
      },
      {
        type: "heading",
        text: "Building your initial list",
      },
      {
        type: "paragraph",
        text: "Start by defining the parameters of your outreach: the topic or news angle, the target publication tiers, and the seniority of contacts you are seeking. The platform searches across its database of verified journalist contacts, cross-referenced with recent byline activity to confirm that each contact is currently active and covering the relevant beat.",
      },
      {
        type: "paragraph",
        text: "You can filter by publication type (trade, national, regional, digital-native), by territory, and by audience profile. For B2B communications, the most important filter is typically beat specificity: a contact listed as covering 'technology' is far less valuable than one whose recent bylines confirm they are actively covering the specific sub-sector your story addresses.",
      },
      {
        type: "heading",
        text: "Understanding the V/P/U flags",
      },
      {
        type: "paragraph",
        text: "Each contact in your list carries one of three verification status flags. These flags are the most important signal for prioritising your outreach:",
      },
      {
        type: "list",
        items: [
          "V (Verified): the contact's email address and beat have been confirmed within the last 90 days. This is your primary outreach tier. Verified contacts should receive your most tailored, personalised pitches.",
          "P (Provisional): the contact's email address appears valid but beat confirmation is more than 90 days old. Worth including in outreach but warrants a brief check of recent bylines before sending a highly personalised pitch.",
          "U (Unverified): the contact appears in the database but has not been recently confirmed. Include in broad distribution where appropriate but do not invest significant personalisation effort without additional research.",
        ],
      },
      {
        type: "pullquote",
        text: "The quality of your media list is the single biggest variable in outreach effectiveness. A list of 20 verified, beat-accurate contacts will outperform a list of 200 unverified ones.",
      },
      {
        type: "heading",
        text: "Using the methodology tab",
      },
      {
        type: "paragraph",
        text: "The methodology tab on any Media Research list shows how each contact was identified and when their details were last verified. This transparency is important for two reasons. First, it allows you to make informed judgements about which contacts to prioritise. Second, it provides documentation if a client or colleague asks how the list was built.",
      },
      {
        type: "paragraph",
        text: "The methodology tab also shows the source publications for each contact and the most recent byline activity the platform has confirmed. Use this information to personalise outreach: referencing a journalist's specific recent coverage in your pitch demonstrates genuine familiarity with their work and significantly improves open and response rates.",
      },
      {
        type: "heading",
        text: "Maintaining and updating your list",
      },
      {
        type: "paragraph",
        text: "Media lists deteriorate quickly. The platform will flag contacts whose verification status has lapsed and prompt you to refresh the list at regular intervals. For active outreach programmes, a monthly refresh of your core list and a quarterly refresh of your broader database keeps your sender reputation strong and your outreach effective.",
      },
      {
        type: "list",
        items: [
          "Archive contacts who have not responded to three or more outreach attempts over six months rather than continuing to mail them.",
          "Add contacts you discover through manual research and request verification through the platform before including them in active outreach.",
          "Use the 'recent coverage' filter to refresh your list when your topic or angle changes, even if your target publication tier stays the same.",
          "Export your verified list to your CRM or email platform in a format that preserves the V/P/U status flags for ongoing reference.",
        ],
      },
    ],
  },
  {
    id: "ai-proves-pr-drives-sales",
    title: "Will AI finally prove that B2B PR drives sales through earned media awareness?",
    tag: "Article",
    excerpt: "The attribution problem that has haunted PR for decades is about to be solved - and AI is the reason why.",
    imgSrc: "article-6-pr-attribution",
    sections: [
      {
        type: "paragraph",
        text: "For as long as public relations has existed as a professional discipline, practitioners have struggled with a version of the same problem: how do you prove that PR drives sales? The challenge is not that the relationship does not exist - most experienced communications professionals have direct experience of coverage that moves markets, shifts perceptions, and accelerates commercial conversations. The challenge is that the causal chain between a media placement and a purchase decision has historically been impossible to demonstrate with the rigour that marketing budgets require.",
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
        text: "This has led to decades of proxy metrics - advertising value equivalents, reach estimates, sentiment analysis - that sophisticated buyers of communications services have always regarded with scepticism. The industry has known for years that these proxies are imperfect. It has not had a better alternative.",
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
        text: "The emergence of AI as the primary research tool in the B2B buyer journey creates, for the first time, a direct and measurable mechanism by which earned media drives commercial visibility. When a buyer asks an AI model which companies are the recognised authorities in a sector, the model's answer is a direct function of the earned media coverage those companies have generated. The connection between PR activity and buyer exposure is no longer diffuse and unmeasurable - it is structural and trackable.",
      },
      {
        type: "paragraph",
        text: "Companies that have built strong earned authority - through consistent thought leadership, quality media coverage, and cited research - appear more prominently in AI-generated answers. That appearance drives shortlisting. Shortlisting drives commercial conversations. Commercial conversations drive revenue.",
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
        text: "The practical implication is that PR teams can now track a new, more commercially meaningful metric: AI visibility. By systematically querying AI models with the questions their buyers are likely to ask - and tracking where and how prominently the brand appears in the responses - communications teams can establish a direct link between their earned media activity and commercial exposure.",
      },
      {
        type: "list",
        items: [
          "Baseline AI visibility measurement - where does the brand appear in AI-generated answers to the questions its buyers are asking?",
          "Share of AI voice - how does that position compare to key competitors across a defined set of queries?",
          "Attribution of coverage to visibility - which specific media placements correlate with improvements in AI visibility?",
          "Pipeline correlation - does improved AI visibility correlate with increased inbound enquiries and qualified pipeline?",
        ],
      },
      {
        type: "paragraph",
        text: "These measurements are not perfect. No measurement framework is. But they represent the most direct connection between PR activity and commercial outcome that the industry has ever had access to - and they are improving as AI models become more sophisticated and as measurement methodology matures.",
      },
      {
        type: "heading",
        text: "The strategic moment for the PR industry",
      },
      {
        type: "paragraph",
        text: "The PR industry has an opportunity in this moment that it has not had since the early days of digital communications. The discipline that was always the right answer for building earned authority is now - demonstrably, measurably - the discipline that drives commercial visibility in the AI era. The practitioners and agencies that can articulate this clearly, measure it rigorously, and connect it to the outcomes that clients care about will redefine what the industry is worth.",
      },
      {
        type: "pullquote",
        text: "After decades of working without proof, PR finally has the attribution infrastructure it deserves. The question is whether the industry will move fast enough to claim the credit.",
      },
      {
        type: "paragraph",
        text: "The attribution problem that has haunted public relations for decades is not solved. But it is closer to a solution than it has ever been - and the companies and communications teams that understand this will be the ones shaping conversations about marketing investment for the next generation.",
      },
    ],
  },
];
