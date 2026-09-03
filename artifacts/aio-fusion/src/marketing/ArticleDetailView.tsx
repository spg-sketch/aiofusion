import { ArrowLeft, BookOpen } from "lucide-react";
import { vars } from "./vars";
import type { Article, ArticleSection } from "./articles-data";

function formatArticleDate(date: string): string {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T00:00:00Z`)
    : new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function SectionBlock({ section }: { section: ArticleSection }) {
  if (section.type === "image" && section.url) {
    return (
      <figure className="my-9">
        <img
          src={section.url}
          alt={section.altText ?? ""}
          className="w-full rounded-2xl object-cover"
          loading="lazy"
          decoding="async"
        />
        {section.caption && (
          <figcaption className="mt-2 text-center text-[12px]" style={{ color: vars.g500 }}>
            {section.caption}
          </figcaption>
        )}
      </figure>
    );
  }
  if (section.type === "heading") {
    return (
      <h2
        className="text-[22px] font-semibold mt-10 mb-3 leading-snug"
        style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}
      >
        {section.text}
      </h2>
    );
  }
  if (section.type === "subheading") {
    return (
      <h3
        className="text-[17px] font-semibold mt-7 mb-2 leading-snug"
        style={{ color: vars.navy }}
      >
        {section.text}
      </h3>
    );
  }
  if (section.type === "paragraph") {
    return (
      <p
        className="text-[16px] font-light leading-[1.85] mb-5"
        style={{ color: vars.g600 }}
      >
        {section.text}
      </p>
    );
  }
  if (section.type === "pullquote") {
    return (
      <blockquote
        className="my-8 pl-6 py-4 border-l-4 rounded-r-xl"
        style={{ borderColor: vars.accent, background: `${vars.accent}08` }}
      >
        <p
          className="text-[18px] font-medium leading-[1.65] italic"
          style={{ color: vars.navy }}
        >
          "{section.text}"
        </p>
      </blockquote>
    );
  }
  if (section.type === "stat") {
    return (
      <div
        className="my-7 px-5 py-4 rounded-2xl border"
        style={{ background: `${vars.gold}0F`, borderColor: `${vars.gold}40` }}
      >
        <p
          className="text-[15px] font-semibold leading-[1.6]"
          style={{ color: vars.navy }}
        >
          {section.text}
        </p>
        {section.caption && (
          <p className="mt-2 text-[13px] font-light leading-[1.6]" style={{ color: vars.g600 }}>
            {section.caption}
          </p>
        )}
      </div>
    );
  }
  if (section.type === "list" && section.items) {
    return (
      <ul className="my-5 space-y-3 pl-0">
        {section.items.map((item, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: vars.accent }}
            />
            <span
              className="text-[15px] font-light leading-[1.75]"
              style={{ color: vars.g600 }}
            >
              {item}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  return null;
}

export default function ArticleDetailView({
  article,
  onBack,
  coverImg,
  coverAlt = "",
}: {
  article: Article;
  onBack: () => void;
  coverImg: string;
  coverAlt?: string;
}) {
  const cream = "#FBF6EC";
  const base = import.meta.env.BASE_URL;
  const relatedByArticle: Record<string, Array<{ href: string; label: string }>> = {
    "pr-professionals-not-threat": [
      { href: "seo-aio", label: "From SEO to AIO: a transition playbook" },
      { href: "../for-agencies", label: "GEO software for PR agencies" },
    ],
    "thought-leadership-engine-ai-visibility": [
      { href: "earned-media", label: "Why earned media beats paid in the AI era" },
      { href: "geo-signals", label: "The six GEO signals every brand should track" },
    ],
    "battle-b2b-ai-authority": [
      { href: "geo-signals", label: "The six GEO signals every brand should track" },
      { href: "../for-inhouse", label: "AI visibility software for in-house teams" },
    ],
    "agentic-media-relations": [
      { href: "pr-professionals-not-threat", label: "Why PR professionals should not see AI as a threat" },
      { href: "../for-agencies", label: "GEO software for PR agencies" },
    ],
    "ai-changing-b2b-visibility": [
      { href: "seo-aio", label: "From SEO to AIO: a transition playbook" },
      { href: "thought-leadership-engine-ai-visibility", label: "Why thought leadership drives AI visibility" },
    ],
    "earned-media": [
      { href: "thought-leadership-engine-ai-visibility", label: "Why thought leadership drives AI visibility" },
      { href: "ai-proves-pr-drives-sales", label: "How AI can connect PR with sales visibility" },
    ],
    "geo-signals": [
      { href: "seo-aio", label: "From SEO to AIO: a transition playbook" },
      { href: "authority-report", label: "How to read an AIO Fusion Authority Report" },
    ],
    "seo-aio": [
      { href: "geo-signals", label: "The six GEO signals every brand should track" },
      { href: "earned-media", label: "Why earned media beats paid in the AI era" },
    ],
    "setup-guide": [
      { href: "authority-report", label: "How to read an AIO Fusion Authority Report" },
      { href: "../pricing", label: "Compare AIO Fusion plans" },
    ],
    "authority-report": [
      { href: "geo-signals", label: "The six GEO signals every brand should track" },
      { href: "setup-guide", label: "Set up your first AIO Fusion project" },
    ],
    "optimiser-guide": [
      { href: "seo-aio", label: "From SEO to AIO: a transition playbook" },
      { href: "../for-inhouse", label: "AI visibility software for in-house teams" },
    ],
    "media-research-guide": [
      { href: "earned-media", label: "Why earned media beats paid in the AI era" },
      { href: "../for-agencies", label: "GEO software for PR agencies" },
    ],
    "ai-proves-pr-drives-sales": [
      { href: "ai-changing-b2b-visibility", label: "How AI is changing B2B visibility" },
      { href: "thought-leadership-engine-ai-visibility", label: "Why thought leadership drives AI visibility" },
    ],
  };
  const related = relatedByArticle[article.id] ?? [
    { href: "seo-aio", label: "From SEO to AIO: a transition playbook" },
    { href: "../insights", label: "Browse all AIO Fusion Insights" },
  ];

  function relatedHref(href: string): string {
    if (href.startsWith("../")) return `${base}${href.slice(3)}`;
    return `${base}insights/${href}`;
  }

  return (
    <div
      className="min-h-screen font-['Inter',sans-serif]"
      style={{ background: cream }}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-8 pt-8 pb-20">
        <nav aria-label="Breadcrumb" className="mb-6 text-[12px] font-medium" style={{ color: vars.g500 }}>
          <a href={base} className="hover:underline">Home</a>
          <span aria-hidden="true"> / </span>
          <a href={`${base}insights`} className="hover:underline">Insights</a>
          <span aria-hidden="true"> / </span>
          <span aria-current="page">{article.title}</span>
        </nav>

        <a
          href={`${base}insights`}
          onClick={onBack}
          className="inline-flex items-center gap-2 mb-8 text-[13px] font-semibold uppercase tracking-[0.12em] transition-opacity hover:opacity-70"
          style={{ color: vars.accent }}
        >
          <ArrowLeft size={14} /> Back to Insights
        </a>

        <div
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.18em] mb-4"
          style={{ background: `${vars.accent}18`, color: vars.accent }}
        >
          <BookOpen size={10} /> {article.tag}
        </div>

        <h1
          className="text-3xl sm:text-4xl font-semibold mb-4 leading-[1.2]"
          style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}
        >
          {article.title}
        </h1>

        <p
          className="text-[17px] font-light leading-[1.75] mb-8"
          style={{ color: vars.g500 }}
        >
          {article.excerpt}
        </p>

        <div className="flex items-center gap-3 mb-8 pb-8 border-b" style={{ borderColor: vars.g200 }}>
          <div className="w-11 h-11 rounded-full flex items-center justify-center bg-white border" style={{ borderColor: vars.g200 }}>
            <img src={`${import.meta.env.BASE_URL}images/logo-color.png`} alt="AIO Fusion" className="w-6 h-6 object-contain" />
          </div>
          <div>
            <p className="text-[14px] font-semibold" style={{ color: vars.navy }}>AIO Fusion Insights Team</p>
            <p className="text-[12px] font-light" style={{ color: vars.g500 }}>PR & GEO Practitioners</p>
            <p className="text-[12px] font-light mt-1" style={{ color: vars.g500 }}>
              Published{" "}
              <time dateTime={article.datePublished}>{formatArticleDate(article.datePublished)}</time>
              {" · "}
              Updated{" "}
              <time dateTime={article.dateModified}>{formatArticleDate(article.dateModified)}</time>
            </p>
          </div>
        </div>

        <div
          className="w-full rounded-2xl overflow-hidden mb-10"
          style={{
            aspectRatio: "16/9",
            background: vars.navy,
            boxShadow: "0 8px 32px rgba(10,22,40,0.12)",
          }}
        >
          <img
            src={coverImg}
            alt={coverAlt}
            aria-hidden={coverAlt ? undefined : "true"}
            className="w-full h-full object-cover"
          />
        </div>

        <div className="article-body">
          {article.sections.map((section, i) => (
            <SectionBlock key={i} section={section} />
          ))}
        </div>

        <aside className="mt-12 p-6 rounded-2xl bg-white" style={{ border: `1px solid ${vars.g200}` }}>
            <h2 className="text-[20px] font-semibold mb-4" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
              Continue exploring AI visibility
            </h2>
            <ul className="space-y-3">
              {related.map((item) => (
                <li key={item.href}>
                  <a
                    href={relatedHref(item.href)}
                    className="font-semibold underline decoration-1 underline-offset-4 hover:opacity-75"
                    style={{ color: vars.accent }}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
        </aside>

        <div
          className="mt-14 pt-8 border-t flex items-center justify-between"
          style={{ borderColor: vars.g200 }}
        >
          <a
            href={`${base}insights`}
            onClick={onBack}
            className="inline-flex items-center gap-2 text-[13px] font-semibold transition-opacity hover:opacity-70"
            style={{ color: vars.accent }}
          >
            <ArrowLeft size={14} /> Back to Insights
          </a>
        </div>
      </div>
    </div>
  );
}
