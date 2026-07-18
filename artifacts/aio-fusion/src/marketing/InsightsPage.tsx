import { useState } from "react";
import { BookOpen, ArrowUpRight } from "lucide-react";
import MarketingPage from "./MarketingPage";
import { vars } from "./vars";
import ArticleDetailView from "./ArticleDetailView";
import { NEW_ARTICLES } from "./articles-data";
import blogTile1 from "../assets/blog-tile-1.png";
import blogTile2 from "../assets/blog-tile-2.png";
import blogTile3 from "../assets/blog-tile-3.png";
import article1Img from "../assets/article-1-pr-ai.png";
import article2Img from "../assets/article-2-thought-leadership.png";
import article3Img from "../assets/article-3-b2b-authority.png";
import article4Img from "../assets/article-4-agentic-media.png";
import article5Img from "../assets/article-5-b2b-visibility.png";
import article6Img from "../assets/article-6-pr-attribution.png";

const ARTICLE_IMAGES: Record<string, string> = {
  "article-1-pr-ai": article1Img,
  "article-2-thought-leadership": article2Img,
  "article-3-b2b-authority": article3Img,
  "article-4-agentic-media": article4Img,
  "article-5-b2b-visibility": article5Img,
  "article-6-pr-attribution": article6Img,
};

export default function InsightsPage(props: { onLogin: () => void; onBack: () => void; onNavigate: (v: string) => void; isAuthed?: boolean; initialFilter?: string | null; onClearFilter?: () => void; openArticleId?: string | null; onOpenArticle?: (id: string) => void; onCloseArticle?: () => void }) {
  const { initialFilter, onClearFilter, openArticleId: controlledArticleId, onOpenArticle, onCloseArticle, ...marketingProps } = props;
  const openArticleId = controlledArticleId ?? null;
  const setOpenArticleId = (id: string | null) => {
    window.scrollTo(0, 0);
    if (id) onOpenArticle?.(id); else onCloseArticle?.();
  };

  const articles = [
    { id: "pr-professionals-not-threat", title: "PR professionals should not see AI as a threat", excerpt: "Why AI will elevate the role of PR and marketing professionals, not replace them.", url: null, tag: "Article", img: article1Img, accent: vars.accent, external: false },
    { id: "thought-leadership-engine-ai-visibility", title: "Why thought leadership is the engine of AI visibility", excerpt: "Earned media is what LLMs trust most — 89% of AI citations come from third-party publications, not brand websites.", url: null, tag: "Article", img: article2Img, accent: vars.coral, external: false },
    { id: "battle-b2b-ai-authority", title: "The battle for B2B AI Authority has begun", excerpt: "94% of B2B buyers use generative AI during their purchase journey. PR is now essential, not optional.", url: null, tag: "Article", img: article3Img, accent: vars.gold, external: false },
    { id: "agentic-media-relations", title: "Why agentic media relations is coming faster than you think", excerpt: "AI agents pitching journalists. Journalists using agents to find stories. The future of PR is closer than the industry realises.", url: null, tag: "Article", img: article4Img, accent: vars.teal, external: false },
    { id: "ai-changing-b2b-visibility", title: "AI Is Changing the Rules of B2B Visibility — Here's What Actually Matters Now", excerpt: "80–95% of citations in AI-generated answers come from earned media. The structural reordering of B2B visibility has begun.", url: null, tag: "Article", img: article5Img, accent: vars.accent, external: false },
    { id: "ai-proves-pr-drives-sales", title: "Will AI finally prove that B2B PR drives sales through earned media awareness?", excerpt: "The attribution problem that has haunted PR for decades is about to be solved — and AI is the reason why.", url: null, tag: "Article", img: article6Img, accent: vars.coral, external: false },
    { id: "ext-guide", title: "The B2B Marketer's Fast Guide to Winning AI Authority in 2026", excerpt: "What is AIO? And is PR really the new SEO? Cut through the hype around AI's impact on B2B marketing.", url: "https://simpaticopraiauthorityguide.carrd.co/", tag: "Guide", img: blogTile1, accent: vars.accent, external: true },
    { id: "earned-media", title: "Why earned media beats paid in the AI era", excerpt: "How AI engines weigh third-party validation when deciding which brands to recommend.", url: null, tag: "Article", img: blogTile2, accent: vars.coral, external: false },
    { id: "geo-signals", title: "The 6 GEO signal categories every brand should track", excerpt: "A practical breakdown of the criteria AI models use to rank, surface and cite content.", url: null, tag: "Article", img: blogTile3, accent: vars.gold, external: false },
    { id: "seo-aio", title: "From SEO to AIO: a transition playbook for marketing teams", excerpt: "How to evolve your existing SEO programme into one that captures AI visibility.", url: null, tag: "Playbook", img: blogTile1, accent: vars.green, external: false },
    { id: "setup-guide", title: "How to set up your first project in AIO Fusion", excerpt: "Walk-through of Project Set-Up: company basics, spokespeople, key messages, audiences and content cadence.", url: null, tag: "Guidance", img: blogTile2, accent: vars.accent, external: false },
    { id: "authority-report", title: "Running an Authority Report and reading the results", excerpt: "How the six GEO signal categories are scored, what each band means, and where to focus first.", url: null, tag: "Guidance", img: blogTile3, accent: vars.accent, external: false },
    { id: "optimiser-guide", title: "Using the Optimiser with tracked changes", excerpt: "How to review every edit the platform suggests, accept or reject changes, and export the final draft.", url: null, tag: "Guidance", img: blogTile1, accent: vars.accent, external: false },
    { id: "media-research-guide", title: "Building a Media Research list that journalists will actually open", excerpt: "How the platform verifies beat contacts, what the V/P/U flags mean, and how to use the methodology tab.", url: null, tag: "Guidance", img: blogTile2, accent: vars.accent, external: false },
  ];

  const allTags = Array.from(new Set(articles.map((a) => a.tag)));
  const [activeTag, setActiveTag] = useState<string | null>(initialFilter ?? null);
  const visible = activeTag ? articles.filter((a) => a.tag === activeTag) : articles;
  const isGuidance = activeTag === "Guidance";

  if (openArticleId) {
    const articleData = NEW_ARTICLES.find((a) => a.id === openArticleId);
    const coverImg = articleData ? ARTICLE_IMAGES[articleData.imgSrc] : "";
    if (articleData && coverImg) {
      return (
        <MarketingPage
          title=""
          {...marketingProps}
        >
          <ArticleDetailView
            article={articleData}
            onBack={() => { setOpenArticleId(null); window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }); }}
            coverImg={coverImg}
          />
        </MarketingPage>
      );
    }
  }

  return (
    <MarketingPage title={isGuidance ? "Guidance" : "Insights"} eyebrow={<><BookOpen size={12} /> {isGuidance ? "How-to library" : "Library"}</> as any} {...marketingProps}>
      <p className="text-[16px] font-light leading-[1.8] mb-6" style={{ color: vars.g500 }}>
        {isGuidance
          ? "How-to articles and videos for using the AIO Fusion platform - set-up, Authority Reports, Optimiser, Media Research and more."
          : "Practical thinking on AI visibility, GEO, and the future of PR and marketing. Filter to Guidance for platform how-to content."}
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-8">
        <button
          onClick={() => { setActiveTag(null); onClearFilter?.(); }}
          className="text-[11px] font-bold uppercase tracking-[0.14em] px-3 py-1.5 rounded-full transition-colors"
          style={{ background: activeTag === null ? vars.navy : "transparent", color: activeTag === null ? "white" : vars.g500, border: `1px solid ${activeTag === null ? vars.navy : vars.g200}` }}
        >
          All
        </button>
        {allTags.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTag(t)}
            className="text-[11px] font-bold uppercase tracking-[0.14em] px-3 py-1.5 rounded-full transition-colors"
            style={{ background: activeTag === t ? vars.navy : "transparent", color: activeTag === t ? "white" : vars.g500, border: `1px solid ${activeTag === t ? vars.navy : vars.g200}` }}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 gap-6">
        {visible.map((a) => {
          const isInternalArticle = !a.external && !a.url && NEW_ARTICLES.some((na) => na.id === a.id);
          if (isInternalArticle) {
            return (
              <button
                key={a.id}
                onClick={() => { setOpenArticleId(a.id); window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }); }}
                className="group block rounded-2xl overflow-hidden bg-white transition-all hover:shadow-xl hover:-translate-y-1 text-left w-full"
                style={{ border: `1px solid ${vars.g200}` }}
              >
                <div className="aspect-[16/10] overflow-hidden" style={{ background: vars.navy }}>
                  <img src={a.img} alt="" aria-hidden="true" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="p-6">
                  <span className="inline-block text-[10px] font-bold uppercase tracking-[0.16em] mb-3 px-2 py-0.5 rounded" style={{ background: `${a.accent}18`, color: a.accent }}>{a.tag}</span>
                  <h3 className="text-[18px] font-semibold mb-2 leading-snug" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>{a.title}</h3>
                  <p className="text-[13px] font-light leading-[1.7]" style={{ color: vars.g500 }}>{a.excerpt}</p>
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold mt-4" style={{ color: a.accent }}>Read <ArrowUpRight size={12} /></span>
                </div>
              </button>
            );
          }
          return (
            <a
              key={a.id}
              href={a.url ?? "#"}
              {...(a.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="group block rounded-2xl overflow-hidden bg-white transition-all hover:shadow-xl hover:-translate-y-1"
              style={{ border: `1px solid ${vars.g200}` }}
            >
              <div className="aspect-[16/10] overflow-hidden" style={{ background: vars.navy }}>
                <img src={a.img} alt="" aria-hidden="true" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              </div>
              <div className="p-6">
                <span className="inline-block text-[10px] font-bold uppercase tracking-[0.16em] mb-3 px-2 py-0.5 rounded" style={{ background: `${a.accent}18`, color: a.accent }}>{a.tag}</span>
                <h3 className="text-[18px] font-semibold mb-2 leading-snug" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>{a.title}</h3>
                <p className="text-[13px] font-light leading-[1.7]" style={{ color: vars.g500 }}>{a.excerpt}</p>
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold mt-4" style={{ color: a.accent }}>Read <ArrowUpRight size={12} /></span>
              </div>
            </a>
          );
        })}
      </div>
    </MarketingPage>
  );
}
