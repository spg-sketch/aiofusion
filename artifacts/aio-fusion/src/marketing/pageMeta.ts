/** Per-page SEO metadata used by PageHead (client) and the prerender script (build-time). */

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  ogTitle?: string;
  ogDescription?: string;
  ogType?: string;
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
}

const BASE = "https://aiofusion.ai";
const OG_IMAGE = `${BASE}/opengraph.jpg`;

export const DEFAULT_META: PageMeta = {
  title: "AIO Fusion - GEO Platform for PR & Marketing Teams",
  description:
    "Track, score and grow your brand's visibility across AI search engines like ChatGPT and Claude. Built for PR agencies and in-house communications teams.",
  canonical: BASE + "/",
  ogType: "website",
};

export const PAGE_META: Record<string, PageMeta> = {
  landing: {
    title: "AIO Fusion - GEO Platform for PR & Marketing Teams",
    description:
      "Track, score and grow your brand's visibility across AI search engines like ChatGPT and Claude. Built for PR agencies and in-house communications teams.",
    canonical: `${BASE}/`,
    ogType: "website",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "AIO Fusion",
        url: BASE,
        logo: `${BASE}/images/logo-color.png`,
        sameAs: [`${BASE}/about`],
        contactPoint: {
          "@type": "ContactPoint",
          email: "info@aiofusion.ai",
          contactType: "customer service",
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "AIO Fusion",
        url: BASE,
        description:
          "GEO (Generative Engine Optimisation) platform for PR agencies and B2B communications teams",
      },
    ],
  },
  "for-inhouse": {
    title: "AIO Fusion for In-House PR & Marketing Teams",
    description:
      "Where AIO meets PR and marketing. Build AI authority, measure visibility in ChatGPT and Claude, and scale your communications strategy.",
    canonical: `${BASE}/for-inhouse`,
    ogType: "website",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Service",
      name: "AIO Fusion for In-House Teams",
      provider: { "@type": "Organization", name: "AIO Fusion", url: BASE },
      description:
        "GEO platform for in-house PR and marketing teams building AI authority for a single brand",
      url: `${BASE}/for-inhouse`,
    },
  },
  "for-agencies": {
    title: "AIO Fusion for PR Agencies",
    description:
      "Integrate AI and content marketing automation into your client service. Multi-client management, dual-engine analysis, and integrated comms planning.",
    canonical: `${BASE}/for-agencies`,
    ogType: "website",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Service",
      name: "AIO Fusion for PR Agencies",
      provider: { "@type": "Organization", name: "AIO Fusion", url: BASE },
      description:
        "GEO platform for PR and digital marketing agencies managing AI visibility for multiple clients",
      url: `${BASE}/for-agencies`,
    },
  },
  "for-agents": {
    title: "AIO Fusion - Information for AI Agents",
    description:
      "Structured briefing on the AIO Fusion GEO platform written for autonomous AI agents. Full toolset, capabilities and contact information.",
    canonical: `${BASE}/for-agents`,
    ogType: "website",
  },
  insights: {
    title: "GEO Insights - AI Visibility Articles | AIO Fusion",
    description:
      "Expert articles on generative engine optimisation, AI visibility, B2B PR and the future of search. Written by PR and GEO practitioners.",
    canonical: `${BASE}/insights`,
    ogType: "website",
  },
  about: {
    title: "About AIO Fusion - Built by PR Consultants",
    description:
      "AIO Fusion is designed by PR consultants with deep tech expertise. Learn about our team and why we built the first end-to-end GEO platform.",
    canonical: `${BASE}/about`,
    ogType: "website",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "AIO Fusion",
      url: BASE,
      description:
        "GEO (Generative Engine Optimisation) platform built by PR and tech experts",
      founders: [
        { "@type": "Person", name: "Patrick Barrett" },
        { "@type": "Person", name: "Natalie Linder" },
      ],
      contactPoint: {
        "@type": "ContactPoint",
        email: "info@aiofusion.ai",
        contactType: "customer service",
      },
    },
  },
  contact: {
    title: "Contact AIO Fusion - Book a Demo",
    description:
      "Book a personalised demo of AIO Fusion or send us a message. We'll show you how to track and grow your brand's visibility in AI-generated answers.",
    canonical: `${BASE}/contact`,
    ogType: "website",
  },
  pricing: {
    title: "AIO Fusion Pricing - Standard & Agentic Plans",
    description:
      "Transparent pricing for in-house teams and agencies. Annual plans with full platform access including AI Visibility Audit, Content Optimiser, and Comms Planner.",
    canonical: `${BASE}/pricing`,
    ogType: "website",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "AIO Fusion Pricing",
      url: `${BASE}/pricing`,
      description:
        "Pricing plans for AIO Fusion GEO platform - Standard In-House, Standard Agency, and Agentic plans",
    },
  },
  "trust-security": {
    title: "Trust & Security | AIO Fusion",
    description:
      "How AIO Fusion protects your data. HTTPS encryption, scoped access control, no third-party trackers, and daily encrypted backups.",
    canonical: `${BASE}/trust-security`,
    ogType: "website",
  },
  "privacy-policy": {
    title: "Privacy Policy | AIO Fusion",
    description:
      "AIO Fusion Ltd privacy policy - what personal data we collect, why, and your rights over it. Applies to the AIO Fusion website and platform.",
    canonical: `${BASE}/privacy-policy`,
    ogType: "website",
  },
  "terms-conditions": {
    title: "Terms & Conditions | AIO Fusion",
    description:
      "Terms governing your use of the AIO Fusion website and platform, provided by AIO Fusion Ltd.",
    canonical: `${BASE}/terms-conditions`,
    ogType: "website",
  },
};

export interface ArticleMeta extends PageMeta {
  articleTitle: string;
  excerpt: string;
}

export const ARTICLE_META: Record<string, ArticleMeta> = {
  "pr-professionals-not-threat": {
    articleTitle: "PR professionals should not see AI as a threat",
    title: "PR professionals should not see AI as a threat | AIO Fusion Insights",
    description:
      "Why AI will elevate the role of PR and marketing professionals, not replace them. AI removes administrative burden - what remains is the part only humans can do.",
    canonical: `${BASE}/insights/pr-professionals-not-threat`,
    ogType: "article",
    excerpt:
      "Why AI will elevate the role of PR and marketing professionals, not replace them.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "PR professionals should not see AI as a threat",
      description:
        "Why AI will elevate the role of PR and marketing professionals, not replace them.",
      url: `${BASE}/insights/pr-professionals-not-threat`,
      image: OG_IMAGE,
      author: { "@type": "Organization", name: "AIO Fusion", url: BASE },
      publisher: {
        "@type": "Organization",
        name: "AIO Fusion",
        url: BASE,
        logo: { "@type": "ImageObject", url: `${BASE}/images/logo-color.png` },
      },
      mainEntityOfPage: `${BASE}/insights/pr-professionals-not-threat`,
    },
  },
  "thought-leadership-engine-ai-visibility": {
    articleTitle: "Why thought leadership is the engine of AI visibility",
    title:
      "Why thought leadership is the engine of AI visibility | AIO Fusion Insights",
    description:
      "Earned media is what LLMs trust most - 89% of AI citations come from third-party publications, not brand websites.",
    canonical: `${BASE}/insights/thought-leadership-engine-ai-visibility`,
    ogType: "article",
    excerpt:
      "Earned media is what LLMs trust most - 89% of AI citations come from third-party publications, not brand websites.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Why thought leadership is the engine of AI visibility",
      description:
        "Earned media is what LLMs trust most - 89% of AI citations come from third-party publications, not brand websites.",
      url: `${BASE}/insights/thought-leadership-engine-ai-visibility`,
      image: OG_IMAGE,
      author: { "@type": "Organization", name: "AIO Fusion", url: BASE },
      publisher: {
        "@type": "Organization",
        name: "AIO Fusion",
        url: BASE,
        logo: { "@type": "ImageObject", url: `${BASE}/images/logo-color.png` },
      },
      mainEntityOfPage: `${BASE}/insights/thought-leadership-engine-ai-visibility`,
    },
  },
  "battle-b2b-ai-authority": {
    articleTitle: "The battle for B2B AI Authority has begun",
    title: "The battle for B2B AI Authority has begun | AIO Fusion Insights",
    description:
      "94% of B2B buyers use generative AI during their purchase journey. PR is now essential, not optional.",
    canonical: `${BASE}/insights/battle-b2b-ai-authority`,
    ogType: "article",
    excerpt:
      "94% of B2B buyers use generative AI during their purchase journey. PR is now essential, not optional.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "The battle for B2B AI Authority has begun",
      description:
        "94% of B2B buyers use generative AI during their purchase journey. PR is now essential, not optional.",
      url: `${BASE}/insights/battle-b2b-ai-authority`,
      image: OG_IMAGE,
      author: { "@type": "Organization", name: "AIO Fusion", url: BASE },
      publisher: {
        "@type": "Organization",
        name: "AIO Fusion",
        url: BASE,
        logo: { "@type": "ImageObject", url: `${BASE}/images/logo-color.png` },
      },
      mainEntityOfPage: `${BASE}/insights/battle-b2b-ai-authority`,
    },
  },
  "agentic-media-relations": {
    articleTitle: "Why agentic media relations is coming faster than you think",
    title:
      "Why agentic media relations is coming faster than you think | AIO Fusion Insights",
    description:
      "AI agents pitching journalists. Journalists using agents to find stories. The future of PR is closer than the industry realises.",
    canonical: `${BASE}/insights/agentic-media-relations`,
    ogType: "article",
    excerpt:
      "AI agents pitching journalists. Journalists using agents to find stories. The future of PR is closer than the industry realises.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Why agentic media relations is coming faster than you think",
      description:
        "AI agents pitching journalists. Journalists using agents to find stories. The future of PR is closer than the industry realises.",
      url: `${BASE}/insights/agentic-media-relations`,
      image: OG_IMAGE,
      author: { "@type": "Organization", name: "AIO Fusion", url: BASE },
      publisher: {
        "@type": "Organization",
        name: "AIO Fusion",
        url: BASE,
        logo: { "@type": "ImageObject", url: `${BASE}/images/logo-color.png` },
      },
      mainEntityOfPage: `${BASE}/insights/agentic-media-relations`,
    },
  },
  "ai-changing-b2b-visibility": {
    articleTitle: "AI Is Changing the Rules of B2B Visibility",
    title:
      "AI Is Changing the Rules of B2B Visibility - Here's What Actually Matters Now | AIO Fusion Insights",
    description:
      "80–95% of citations in AI-generated answers come from earned media. The structural reordering of B2B visibility has begun.",
    canonical: `${BASE}/insights/ai-changing-b2b-visibility`,
    ogType: "article",
    excerpt:
      "80–95% of citations in AI-generated answers come from earned media. The structural reordering of B2B visibility has begun.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline:
        "AI Is Changing the Rules of B2B Visibility - Here's What Actually Matters Now",
      description:
        "80–95% of citations in AI-generated answers come from earned media. The structural reordering of B2B visibility has begun.",
      url: `${BASE}/insights/ai-changing-b2b-visibility`,
      image: OG_IMAGE,
      author: { "@type": "Organization", name: "AIO Fusion", url: BASE },
      publisher: {
        "@type": "Organization",
        name: "AIO Fusion",
        url: BASE,
        logo: { "@type": "ImageObject", url: `${BASE}/images/logo-color.png` },
      },
      mainEntityOfPage: `${BASE}/insights/ai-changing-b2b-visibility`,
    },
  },
  "ai-proves-pr-drives-sales": {
    articleTitle:
      "Will AI finally prove that B2B PR drives sales through earned media awareness?",
    title:
      "Will AI finally prove that B2B PR drives sales through earned media awareness? | AIO Fusion Insights",
    description:
      "The attribution problem that has haunted PR for decades is about to be solved - and AI is the reason why.",
    canonical: `${BASE}/insights/ai-proves-pr-drives-sales`,
    ogType: "article",
    excerpt:
      "The attribution problem that has haunted PR for decades is about to be solved - and AI is the reason why.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline:
        "Will AI finally prove that B2B PR drives sales through earned media awareness?",
      description:
        "The attribution problem that has haunted PR for decades is about to be solved - and AI is the reason why.",
      url: `${BASE}/insights/ai-proves-pr-drives-sales`,
      image: OG_IMAGE,
      author: { "@type": "Organization", name: "AIO Fusion", url: BASE },
      publisher: {
        "@type": "Organization",
        name: "AIO Fusion",
        url: BASE,
        logo: { "@type": "ImageObject", url: `${BASE}/images/logo-color.png` },
      },
      mainEntityOfPage: `${BASE}/insights/ai-proves-pr-drives-sales`,
    },
  },
  "earned-media": {
    articleTitle: "Why earned media beats paid in the AI era",
    title: "Why earned media beats paid in the AI era | AIO Fusion Insights",
    description:
      "How AI engines weigh third-party validation when deciding which brands to recommend. Earned media is structurally more powerful in the AI era.",
    canonical: `${BASE}/insights/earned-media`,
    ogType: "article",
    excerpt:
      "How AI engines weigh third-party validation when deciding which brands to recommend.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Why earned media beats paid in the AI era",
      description:
        "How AI engines weigh third-party validation when deciding which brands to recommend.",
      url: `${BASE}/insights/earned-media`,
      image: OG_IMAGE,
      author: { "@type": "Organization", name: "AIO Fusion", url: BASE },
      publisher: {
        "@type": "Organization",
        name: "AIO Fusion",
        url: BASE,
        logo: { "@type": "ImageObject", url: `${BASE}/images/logo-color.png` },
      },
      mainEntityOfPage: `${BASE}/insights/earned-media`,
    },
  },
  "geo-signals": {
    articleTitle: "The 6 GEO signal categories every brand should track",
    title:
      "The 6 GEO signal categories every brand should track | AIO Fusion Insights",
    description:
      "A practical breakdown of the six criteria AI models use to rank, surface and cite content. The starting point for any serious GEO strategy.",
    canonical: `${BASE}/insights/geo-signals`,
    ogType: "article",
    excerpt:
      "A practical breakdown of the criteria AI models use to rank, surface and cite content.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "The 6 GEO signal categories every brand should track",
      description:
        "A practical breakdown of the six criteria AI models use to rank, surface and cite content.",
      url: `${BASE}/insights/geo-signals`,
      image: OG_IMAGE,
      author: { "@type": "Organization", name: "AIO Fusion", url: BASE },
      publisher: {
        "@type": "Organization",
        name: "AIO Fusion",
        url: BASE,
        logo: { "@type": "ImageObject", url: `${BASE}/images/logo-color.png` },
      },
      mainEntityOfPage: `${BASE}/insights/geo-signals`,
    },
  },
  "seo-aio": {
    articleTitle: "From SEO to AIO: a transition playbook for marketing teams",
    title:
      "From SEO to AIO: a transition playbook for marketing teams | AIO Fusion Insights",
    description:
      "How to evolve your existing SEO programme into one that captures AI visibility. What to keep, what to change, what to add, and how to measure the result.",
    canonical: `${BASE}/insights/seo-aio`,
    ogType: "article",
    excerpt:
      "How to evolve your existing SEO programme into one that captures AI visibility.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "From SEO to AIO: a transition playbook for marketing teams",
      description:
        "How to evolve your existing SEO programme into one that captures AI visibility.",
      url: `${BASE}/insights/seo-aio`,
      image: OG_IMAGE,
      author: { "@type": "Organization", name: "AIO Fusion", url: BASE },
      publisher: {
        "@type": "Organization",
        name: "AIO Fusion",
        url: BASE,
        logo: { "@type": "ImageObject", url: `${BASE}/images/logo-color.png` },
      },
      mainEntityOfPage: `${BASE}/insights/seo-aio`,
    },
  },
  "setup-guide": {
    articleTitle: "How to set up your first project in AIO Fusion",
    title:
      "How to set up your first project in AIO Fusion | AIO Fusion Insights",
    description:
      "Walk-through of Project Set-Up: company basics, spokespeople, key messages, audiences and content cadence.",
    canonical: `${BASE}/insights/setup-guide`,
    ogType: "article",
    excerpt:
      "Walk-through of Project Set-Up: company basics, spokespeople, key messages, audiences and content cadence.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "How to set up your first project in AIO Fusion",
      description:
        "Walk-through of Project Set-Up: company basics, spokespeople, key messages, audiences and content cadence.",
      url: `${BASE}/insights/setup-guide`,
      image: OG_IMAGE,
      author: { "@type": "Organization", name: "AIO Fusion", url: BASE },
      publisher: {
        "@type": "Organization",
        name: "AIO Fusion",
        url: BASE,
        logo: { "@type": "ImageObject", url: `${BASE}/images/logo-color.png` },
      },
      mainEntityOfPage: `${BASE}/insights/setup-guide`,
    },
  },
  "authority-report": {
    articleTitle: "Running an Authority Report and reading the results",
    title:
      "Running an Authority Report and reading the results | AIO Fusion Insights",
    description:
      "How the six GEO signal categories are scored, what each band means, and where to focus first.",
    canonical: `${BASE}/insights/authority-report`,
    ogType: "article",
    excerpt:
      "How the six GEO signal categories are scored, what each band means, and where to focus first.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Running an Authority Report and reading the results",
      description:
        "How the six GEO signal categories are scored, what each band means, and where to focus first.",
      url: `${BASE}/insights/authority-report`,
      image: OG_IMAGE,
      author: { "@type": "Organization", name: "AIO Fusion", url: BASE },
      publisher: {
        "@type": "Organization",
        name: "AIO Fusion",
        url: BASE,
        logo: { "@type": "ImageObject", url: `${BASE}/images/logo-color.png` },
      },
      mainEntityOfPage: `${BASE}/insights/authority-report`,
    },
  },
  "optimiser-guide": {
    articleTitle: "Using the Optimiser with tracked changes",
    title: "Using the Optimiser with tracked changes | AIO Fusion Insights",
    description:
      "How to review every edit the platform suggests, accept or reject changes, and export the final draft.",
    canonical: `${BASE}/insights/optimiser-guide`,
    ogType: "article",
    excerpt:
      "How to review every edit the platform suggests, accept or reject changes, and export the final draft.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Using the Optimiser with tracked changes",
      description:
        "How to review every edit the platform suggests, accept or reject changes, and export the final draft.",
      url: `${BASE}/insights/optimiser-guide`,
      image: OG_IMAGE,
      author: { "@type": "Organization", name: "AIO Fusion", url: BASE },
      publisher: {
        "@type": "Organization",
        name: "AIO Fusion",
        url: BASE,
        logo: { "@type": "ImageObject", url: `${BASE}/images/logo-color.png` },
      },
      mainEntityOfPage: `${BASE}/insights/optimiser-guide`,
    },
  },
  "media-research-guide": {
    articleTitle:
      "Building a Media Research list that journalists will actually open",
    title:
      "Building a Media Research list that journalists will actually open | AIO Fusion Insights",
    description:
      "How the platform verifies beat contacts, what the V/P/U flags mean, and how to use the methodology tab.",
    canonical: `${BASE}/insights/media-research-guide`,
    ogType: "article",
    excerpt:
      "How the platform verifies beat contacts, what the V/P/U flags mean, and how to use the methodology tab.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline:
        "Building a Media Research list that journalists will actually open",
      description:
        "How the platform verifies beat contacts, what the V/P/U flags mean, and how to use the methodology tab.",
      url: `${BASE}/insights/media-research-guide`,
      image: OG_IMAGE,
      author: { "@type": "Organization", name: "AIO Fusion", url: BASE },
      publisher: {
        "@type": "Organization",
        name: "AIO Fusion",
        url: BASE,
        logo: { "@type": "ImageObject", url: `${BASE}/images/logo-color.png` },
      },
      mainEntityOfPage: `${BASE}/insights/media-research-guide`,
    },
  },
};

/** All public URL paths for sitemap generation (route → slug). */
export const PUBLIC_ROUTES: Array<{ slug: string; priority: string }> = [
  { slug: "", priority: "1.0" },
  { slug: "for-inhouse", priority: "0.9" },
  { slug: "for-agencies", priority: "0.9" },
  { slug: "for-agents", priority: "0.8" },
  { slug: "insights", priority: "0.9" },
  { slug: "pricing", priority: "0.9" },
  { slug: "about", priority: "0.8" },
  { slug: "contact", priority: "0.8" },
  { slug: "trust-security", priority: "0.5" },
  { slug: "privacy-policy", priority: "0.4" },
  { slug: "terms-conditions", priority: "0.4" },
];

export const ARTICLE_SLUGS = Object.keys(ARTICLE_META);
